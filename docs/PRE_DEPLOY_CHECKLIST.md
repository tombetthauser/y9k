# Pre-deployment checklist

October 11, 2026. Estimates count added or changed lines, including comments; they are rough planning ranges, not measured patches. Detailed scope is in [V1_COMPLETION_PLAN.md](V1_COMPLETION_PLAN.md).

| Order | Work | Estimated remaining lines | Dependencies |
| --- | --- | ---: | --- |
| 1 | Final verification of metadata/image scrambling, GIFs, opaque files, deletion | 0–15 | Current implementation |
| 2 (done) | Shared door-validation/write transactions; helper browser-tested October 14 | Implemented | Existing door functions |
| 3 | Second gallery door only from inside an empty gallery; protect destination galleries and image-containing endpoints | 45–75 | 2 |
| 4 | Prevent newly adjacent four-door halls | 60–100 | 2; independent of 3 |
| 5 | Fallback hallway/unplaced links and server-side gallery-only uploads | 30–60 | Image delivery, 2 |
| 6 | Malformed room URL cleanup and canonical redirect | 25–50 | Existing room normalization; independent task |
| 7 | Temporary text logging | 80–130 | Prefer after 3–5 |
| 8 | Hidden admin page and independent resets | 120–200 | 7, existing image storage |
| 9 | Integration checks | 100–200 | Alongside features, final pass after 8 |
| 10 | Deployment configuration, backups, updates | 50–100 | Setup anytime; final checks last |

Remaining total: roughly **530–970 lines**, including comments and separately listed tests. Door rules and URL fallback can proceed independently. See [ROOM_URL_FALLBACK.md](ROOM_URL_FALLBACK.md) for URL semantics and routing exceptions.

Hallway uploads are removed from scope. Upload limits, expanded validation, and resizing are deferred to V2. No permanent room index is wanted. Metadata migration/versioning is unnecessary for the selected fresh database.

RSA block room encoding is also deferred to V2; see [ROOM_ENCODING_V2.md](ROOM_ENCODING_V2.md). Budget approximately 100–180 implementation/integration lines plus 50–100 test lines, outside the V1 totals. V1 retains SHA-256 room lookup with negligible practical but nonzero theoretical collision risk.

## Item 1 implementation notes

User decision: defer application upload size limits, additional input/placement validation, filename reservation, and deletion redirect cleanup to V2. V1 is intended for trusted users. Retain existing checks; do not replace the upload handler with the expanded validation example. PHP and hosting request limits still apply independently. The maintenance script import must point to the actual source file when that script is used.

## Temporary logs; no permanent room index

Do not create a permanent hash-to-room mapping. Individual changes use the canonical room ID already in the request to write temporary readable logs. Logs may be periodically cleared or removed without affecting operation. Bulk resets write only `HOLES RESET` or `THINGS RESET`, without per-room recovery. Next step is verifying fresh-database metadata integration, then completing opaque image storage and delivery.

## Current progress

Cipher helpers live in `src/tools.php`, following the preference to keep shared helpers there. `scripts/CHECK-cipher.php` passes all 26 checks, and the existing nine hole checks pass. Metadata integration needs final fresh-database/browser verification; no old-record migration is planned. These line estimates are whole-item estimates, not measurements of remaining work.
