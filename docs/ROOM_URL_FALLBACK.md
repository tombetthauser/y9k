# Room URL fallback — V1

Planning decision — October 13, 2026. Implement friendly redirects for malformed room page URLs. No implementation is included here.

## Selected behavior

For room-page GET/HEAD requests, use only the first path segment as the candidate room name. Remove characters outside ASCII `0–9`, `a–z`, and `A–Z`. Ignore later path segments. If nothing remains, choose room `0`. Normalize the result with the existing GMP base-36 helpers, then redirect malformed/noncanonical paths to the root-relative canonical room URL.

| Requested room path | Redirect target |
| --- | --- |
| `/12-34$56%2076/afwe` | `/12345676` |
| `/$*` | `/0` |
| `/!!!/tom` | `/0` |
| `/000TOM` | `/tom` |
| `/tom/extra` | `/tom` |

A space in a pasted URL is normally percent-encoded by the browser. Text after a literal `#` is a fragment and is not sent to the server. Thus the requested example `/$*#(&(@#)` reaches the server as `/$*`, which still falls back to `/0`.

## Integration requirements

- Parse the path without incorporating the query string. Percent-decode once using `rawurldecode()`; treat decoded slashes as path separators before selecting the first segment. Do not repeatedly decode percent escapes.
- Existing public files and explicit endpoints (`image.php`, upload/delete/hole handlers, diagnostic pages, future admin) must retain their routing and parameters. Do not turn endpoint requests into sanitized room names.
- Apply this fallback to room-page reads only, not mutation handlers. Existing `index.php?room=...` support should sanitize its explicit room parameter and redirect to the canonical path; non-string/empty values fall back to `0`.
- Use a temporary redirect (302) during initial implementation and a root-relative destination constructed only from the canonical alphanumeric ID. Stop rendering after redirect. Avoid redirect loops; root behavior may continue displaying room `0` directly.
- Keep ordinary valid room requests and native static-file delivery working in the PHP development router and Apache deployment configuration.
- Apache must route malformed room paths to the page handler while preserving endpoint/static handling. Requests rejected before reaching PHP cannot be repaired by this helper.
- Preserve large-ID GMP handling rather than casting the cleaned name to a native integer.

## Verification and estimate

Test the examples, spaces/punctuation, uppercase/leading-zero names, fragments as actually transmitted, encoded separators, empty first segments, valid very long IDs, query-form rooms, endpoint/static URLs, and absence of redirect loops on both local PHP and Apache.

Estimate: **25–50 added/changed lines** for helpers and PHP routing integration, excluding tests and Apache configuration covered by deployment work. This is independent of the door restrictions and image scrambling.
