# Security review and proposed patch plan

Reviewed October 23, 2026. Status: proposed work; application files and machine configuration have not been changed.

## Scope and limits

Reviewed every public PHP endpoint, shared PHP helpers and database setup, Apache rewrite rules, browser rendering/request code in `public/helpers.js`, maintenance scripts, and deployment/admin/storage plans. Inspected the local PHP CLI version and configuration. Checked official PHP advisories and the Three.js project's security page.

This is a source/configuration review, not proof of exploitation or a penetration test. No public hostname, deployed PHP configuration, Pi package inventory, Apache virtual host, Cloudflare configuration, or server access/error logs were available. The local CLI configuration does not establish the configuration of a separate web service. No destructive requests, resets, database setup, or exploit payloads were run.

V1 decisions remain in force: no authentication for public edits or the unlinked admin page; upload limits, expanded input validation, resizing, and deferred handler cleanup remain V2. No storage migration, permanent room recovery index, or content deletion is proposed. Shared application helpers should stay in `src/tools.php`. Application implementation remains guided/manual unless direct edits are explicitly requested.

## 1. Critical: installed PHP is below the October security release

**Observed:** `php -v` reports Homebrew PHP **8.5.3**. Its CLI configuration is `/opt/homebrew/etc/php/8.5/php.ini`. No vendor backport evidence was inspected. Treat this installation as affected until updated or a vendor proves equivalent fixes are installed.

The October 21 fixes address:

| Advisory | Failure | Relevance |
| --- | --- | --- |
| [CVE-2026-109618](https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w) | Out-of-memory corruption during request handling/cleanup | Apache mod_php has a demonstrated attack before application execution. Other server interfaces also require patching. Application memory pressure can matter. |
| [CVE-2026-109619](https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp) | Request-owned state survives in a worker after its memory is freed | Sessions, fatal errors, and early configuration diagnostics provide conditional paths. Not calling `session_start()` does not eliminate upload-progress paths. |

Minimum fixed upstream releases within each branch are **8.5.12, 8.4.27, 8.3.36, and 8.2.35**. Distribution packages may carry backports under older version strings; verify the package vendor's explicit coverage of both CVEs. The planned Apache deployment makes identifying mod_php versus PHP-FPM particularly relevant. Updating PHP is the complete fix; changing application handlers cannot replace it. See the [official October 21 advisory](https://www.php.net/archive/2026.php#2026-10-21-5).

**Local settings observed:** `memory_limit=128M`, `post_max_size=8M`, `upload_max_filesize=2M`, `session.upload_progress.enabled=1`, `session.serialize_handler=php`, `fatal_error_backtraces=1`, `display_errors=1`, `log_errors=1`. These are CLI observations, not a verified attack chain. README's launch command overrides both body/file ceilings to zero, so that command differs from the inspected defaults.

**Action:** update local PHP and every deployed PHP runtime, then restart the development server and all applicable Apache/FPM workers. Verify the executable/version actually serving HTTP, loaded configuration, extensions, and package revision. A new CLI version alone does not prove existing workers were replaced. Keep PHP supported and update OS packages providing SQLite, fileinfo/image-related libraries, Apache, and TLS components. No Composer manifest or lockfile was found; these fixes are primarily machine/runtime updates.

## 2. Apply the October 23 upload-progress recommendation

The [October 23 PHP notice](https://www.php.net/archive/2026.php#2026-10-23-1) recommends `session.upload_progress.enabled=0` pending a regular bugfix release for CVE-2026-115560. Its unusual prerequisite is switching session serialization from configured `php_binary`/`php_serialize` to `php` at runtime before starting a session. This app contains no session startup or runtime serializer changes, and the observed CLI serializer is `php`; that specific combination was not found.

**Action:** disable upload progress in the startup configuration for each web runtime anyway; this app does not use that feature. Restart workers and verify the effective value. Do not implement this as an `ini_set()` inside an endpoint. Track the follow-up fixed release and update again when available.

If an exposed runtime cannot be patched promptly, temporarily stop routing external requests to it. The core advisories describe partial emergency mitigations, including disabling PHP 8.5 fatal backtraces and special memory configuration. Those are not a substitute for patching; do not casually remove memory limits on the small Pi or treat proxy request ceilings as complete protection.

## 3. Availability: uploads, image delivery, and logs multiply memory/disk work

**Locations:** `public/index.php:235`, `public/upload.php:54`, `public/image.php:47`, `src/tools.php:332`, `src/tools.php:540`, `README.md:2`.

Both upload handlers read whole files and create scrambled copies. Image delivery reads the complete stored file and creates a restored copy. `roomXor()` builds another string byte by byte. Multiple live copies increase memory use and request duration. Arbitrary-length room IDs also enter GMP arithmetic through `decodeBase36()` without a length ceiling. These are availability risks on a Pi and potential sources of fatal failures on an unpatched runtime; a complete CVE exploit through these exact application paths has not been demonstrated here.

`image.php` calls `logChange()` on every view. That function takes an exclusive lock, reads the complete log, prepends an entry, and rewrites the complete log. Ordinary scene loads, previews, and repeated image requests therefore produce growing serialized disk work and memory use. Cumulative rewrite work grows roughly quadratically with entry count. Admin rendering also reads all log/database rows into memory. On an SD card this creates avoidable availability and wear risks.

**Proposed near-term improvement:** stop logging routine image reads; keep actual change events. Establish a manual log-clear/rotation procedure, with an optional bounded temporary log agreed separately. Do not add a permanent room mapping. Keep bulk resets as summary events. Validate with temporary logs that repeated image requests no longer increase the change log and that normal mutations still do.

**V2:** choose application upload size/dimension ceilings, room-ID bounds, pagination where needed, resizing or streaming, and broader placement validation. These remain deferred, not new V1 blockers. Verify actual hosting/proxy ceilings during deployment without assuming the README's unlimited development settings are appropriate for a public service. After patching, choose worker count and memory budgets that fit the actual Pi.

## 4. Intentional public access and missing browser request protections

**Locations:** `public/logs.php:19`, `public/hole.php:10`, `public/delete.php:8`, `public/upload.php:17`, `public/index.php:141`.

Anyone who discovers `logs.php` can read temporary room-bearing logs and stored rows, and submit bulk-reset actions directly. Public room mutation endpoints likewise permit direct unauthenticated edits. This is the selected access model, not an accidental authentication omission. An unlinked page, `noindex`, and browser confirmation dialogs do not restrict direct requests.

Mutation handlers do not check request origin or CSRF tokens. A third-party page can submit simple cross-origin forms, including reset requests; browser CORS restrictions do not prevent sending such forms. Because direct unauthenticated actions are already allowed, this does not grant a new authenticated privilege, but it permits unwanted browser-triggered operations. Client-side confirmation dialogs are bypassed by direct submissions.

**Proposed optional improvement:** keep the chosen access model while rejecting unexpected origins on browser mutations, with a documented policy for absent `Origin` headers and command-line clients. Consider CSRF tokens only if the extra session lifecycle is wanted. Add POST method checks to legacy upload/delete handlers alongside that work. Neither origin checks nor tokens prevent an attacker who can obtain and use public endpoints directly; do not describe them as admin access control. Add frame restrictions to prevent clickjacking of reset controls. No authentication is proposed without a new scope decision.

## 5. Admin reset route is inconsistent

**Location:** `public/logs.php:69` and its three reset forms near the end of the file.

The handler redirects to `/tests.php`, and all reset forms submit there. The checked-in page is `public/logs.php`; no `public/tests.php` or matching rewrite exists. Under the supplied rules, reset buttons should reach a missing route instead of this handler. Direct POSTs to `/logs.php` still reach the reset code, so this mismatch does not provide protection.

**Action:** make all reset form actions and redirects consistently target the selected admin route. Prefer fixing the current page references unless a deliberate rename is selected. Test reset behavior only on isolated fixtures: cancellation, GET without mutations, POST, redirect, partial failures, and preservation of the unrelated table/files. Never use the real content as a test fixture.

## 6. Deployment controls are specified but not verified

`src/database.php` and `imageStorageDirectory()` correctly place data outside `public/`. `public/.htaccess` contains routing only; repository contents do not establish Apache's actual document root or permissions.

**Action before public deployment:** serve only `public/`; disable directory indexes; prevent the web worker from changing application source; allow writes only to required data/temp locations. Confirm that the database, logs, source, Git metadata, testing scripts, and backups cannot be fetched over HTTP. Bind the origin appropriately for the intended Cloudflare Tunnel setup and verify no unintended public origin bypass. Use HTTPS externally and restrict trusted hostnames/forwarded headers at the server.

`public/index.php:136` uses incoming Host and forwarded protocol values for preview URLs. HTML escaping prevents direct tag injection in the inspected output, but uncontrolled hosts can influence generated sharing metadata. Use a configured canonical origin or a server host allowlist; trust forwarding headers only from the intended proxy. No password-reset poisoning flow was found.

Production PHP should hide errors from responses and retain private server-side error logs. Several legacy handlers normalize inputs outside exception handling; malformed arrays or invalid room IDs can produce uncaught errors. This matters for information exposure and reliability. Broader handler cleanup remains V2; suppressing displayed errors is a deployment setting and does not mitigate the runtime CVEs.

Back up SQLite consistently with corresponding uploaded files before maintenance. A code rollback must retain patched PHP. If a server was publicly exposed on an affected runtime, review server/system logs and source integrity for compromise; the mutable application change log alone cannot establish that it was safe. If evidence indicates compromise, rebuild the host and rotate affected secrets rather than assuming a package update removes persistence.

## 7. Storage scrambling is not confidentiality protection

**Locations:** `src/tools.php:332`, `src/tools.php:386`, `public/image.php:16`.

Image bytes and metadata use repeating XOR with the normalized room ID, and filenames are base64-wrapped. Room IDs appear in URLs and temporary logs, and common room names can be guessed. For room `0`, every byte is XORed with the same ASCII `0` byte. Known image headers also make a repeating key weak. SHA-256 room lookup does not change these facts.

**Action:** describe this as obfuscation and do not promise private rooms or encrypted-at-rest protection. Keep private content out under the chosen public access model. If confidentiality becomes a requirement, separately design access control and authenticated encryption with server-managed secrets; do not add a migration or replace the selected fresh-database work during this patch.

## 8. Browser dependency and rendering assessment

`public/helpers.js:1` imports Three.js `0.160.0` from unpkg. This pins the version but delegates executable script delivery to a third party. The [upstream security page](https://github.com/mrdoob/three.js/security) showed no published advisories in the retrieved result; that is not a complete dependency audit or proof the version has no issues.

**Optional improvement:** vendor the exact reviewed module locally and document its version/hash, then plan upgrades with visual regression checks. No particular Three.js CVE is asserted here. Google document/YouTube embeds also contact outside services; their inspected URLs are application-configured rather than user-uploaded executable URLs. Test a restrictive Content Security Policy in report-only mode before enforcement because inline scripts/styles and external media are extensively used. Add `nosniff` consistently and choose a referrer policy compatible with room-ID privacy expectations.

Positive controls found: parameterized values for database mutations/lookups; room-scoped image lookups; random storage keys with a strict path format; realpath containment for the asset route; image MIME allowlisting without SVG/HTML uploads; HTML escaping and JSON hex escaping in rendered data; and DOM `textContent` for user-visible filenames. The inspected `innerHTML` templates primarily interpolate application constants/options, and no confirmed request-controlled script-injection path was found. No request-controlled shell execution, dynamic PHP include, or deserialization sink was found in the application. These findings are limited to the inspected code.

Hallway policy has drifted: the 3D endpoint permits specially named PNG notes in hallways, and the legacy uploader has no server-side gallery check. This conflicts with the supplied no-hallway-uploads guidance but is not evidence of a PHP runtime exploit. Resolve the intended behavior in the existing V1 feature work, preserving fallback image links; do not expand it into general upload-validation work.

## Proposed execution order and acceptance evidence

| Order | Work | Completion evidence |
| --- | --- | --- |
| 1 — urgent | Inventory/update local and deployed PHP; restart workers; disable upload progress in startup configuration | Runtime serving HTTP is patched for both October 21 CVEs; upload progress is off; no old workers remain. Record vendor/build/SAPI/config paths privately. |
| 2 — deployment | Verify document root, permissions, HTTPS, host/proxy handling, error settings, and consistent backups | Private paths inaccessible; source not worker-writable; restore tested on a copy; production errors do not disclose internals. |
| 3 — small application patch | Remove view-event log amplification and fix admin route references | Repeated image reads do not grow the change log; mutation logs still work; isolated reset tests pass. |
| 4 — optional V1 hardening | Agree origin protection, frame restrictions, canonical origin, and dependency delivery | Cross-origin browser forms are rejected as designed; intentional public direct access still behaves as documented; 3D/text interfaces and embeds work. |
| 5 — V2 | Previously deferred limits, validation, resizing/streaming, and handler cleanup | Explicitly agreed resource budgets and regression checks; no expansion of V1 deployment blockers. |

An ordinary supported package update and verification should take roughly 30–90 minutes per simple environment; backports, old Pi hardware, or incident investigation may take longer. The small application patch is approximately 30–60 minutes plus isolated verification. Hosting setup cannot be estimated precisely without the actual host details.

## Verification completed in this review

- PHP syntax checks passed for all 15 PHP files across public, source, testing, and test/root scripts.
- `php testing/CHECK-cipher.php`: all 26 existing round-trip checks passed. These verify reversibility, not cryptographic strength.
- `php hole-check.php`: all nine existing checks passed against an in-memory SQLite database.
- No application/content files were changed, no live database was initialized or reset, and no runtime configuration was changed. Passing these checks does not verify CVE remediation.

After patching, repeat these checks on the patched runtime. Use a disposable application copy/database for HTTP regression checks covering JPEG/PNG/GIF/WebP uploads, image reads and MIME headers, room-scoped movement/deletion, door conflicts, fallback links, and admin resets. Check actual web-runtime configuration through a private diagnostic or server tooling; never leave a public `phpinfo()` endpoint. Do not run RCE proof-of-concept payloads against development content or a public service.
