# Pre-deployment TODO

Updated October 13, 2026. Rough estimates count added or changed lines, including comments. Test code is estimated separately. Remaining V1 total: **530–970 lines**.

- [x] **1. Verify image storage and metadata end to end** — Syntax checks, 26 cipher checks, and nine hole checks pass; user completed browser behavior verification on October 14, 2026.
- [x] **2. Add shared server-side door validation and write transactions** — `changeRoomDoor()` now owns the read/write transaction; user verified unchanged door behavior on October 14, 2026. New restrictions are still pending below.
- [ ] **3. Protect galleries when opening doors** — 45–75 lines. A gallery can gain a second entrance only when it is the initiating room and has no images. Protect one-door destination galleries even when empty, and protect image-containing rooms at both endpoints. Allow closing an entrance and opening a different first entrance. Depends on 2. See [PREVENT_GALLERY_BREAKING.md](docs/PREVENT_GALLERY_BREAKING.md).
- [ ] **4. Prevent newly adjacent four-door hallways** — 60–100 lines. Simulate both changed endpoints and check all their neighbors. Depends on 2; can be implemented independently of 3. See [PREVENT_DOUBLE_4_HALLS.md](docs/PREVENT_DOUBLE_4_HALLS.md).
- [ ] **5. Keep unexpected images accessible and uploads gallery-only** — 30–60 lines. Show links/modal access and deletion for hallway or unmatched images without offering hallway uploads. Coordinate upload classification/insertion with door transactions. Depends on image delivery and 2.
- [ ] **6. Add malformed room URL fallback** — 25–50 lines. Clean the first path segment, ignore later segments, normalize, and redirect to the room or `/0`. Preserve endpoints/static files. Independent of the door work. See [ROOM_URL_FALLBACK.md](docs/ROOM_URL_FALLBACK.md).
- [ ] **7. Add temporary newest-first text logging** — 80–130 lines. Log image and door changes using room names from requests; bulk resets log summaries only. Clearing logs must not affect the application. Prefer after 3–5. See [LOGGER_PLAN.md](docs/LOGGER_PLAN.md).
- [ ] **8. Add the hidden admin page and independent resets** — 120–200 lines. Unlinked, no authentication, readable logs with room links, confirmed POST controls for resetting holes or things independently. Image reset includes uploaded-file cleanup. Depends on 7 and existing file storage. See [ADMIN_PAGE.md](docs/ADMIN_PAGE.md).
- [ ] **9. Complete integration checks** — 100–200 test lines. Add meaningful checks alongside each feature and run a final acceptance pass after 8.
- [ ] **10. Complete deployment setup** — 50–100 lines. Configure Pi/Apache/tunnel, routing, persistent permissions, production errors, backup/restore, updates, and reboot recovery. Setup may start anytime; final verification follows completed features. See [DEPLOYMENT_PLAN.md](docs/DEPLOYMENT_PLAN.md).

## V2

- [ ] Experimental RSA block room encoding — approximately 100–180 implementation lines plus 50–100 test lines. Specify/review framing and parameters first; V1 keeps SHA-256. See [ROOM_ENCODING_V2.md](docs/ROOM_ENCODING_V2.md).
- [ ] Application upload limits, expanded input/placement validation, filename reservation, and deferred handler cleanup.
- [ ] Automatic resizing and orientation handling, with HEIC/animation policy.
- [ ] Precise image placement and doorway-overlap handling.
- [ ] Log rotation or size management as needed.

No permanent room recovery index is planned. Hallway uploads are outside V1 scope. Current storage changes use a fresh database rather than an existing-record migration.

Detailed scope: [V1_COMPLETION_PLAN.md](docs/V1_COMPLETION_PLAN.md) and [PRE_DEPLOY_CHECKLIST.md](docs/PRE_DEPLOY_CHECKLIST.md).
