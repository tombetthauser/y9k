# First-version completion plan

Planning reference — October 11, 2026. This records the agreed remaining scope before public deployment; it does not implement application changes.

## Upload handling deferred to V2

Latest user decision: keep existing upload handling for trusted-user V1. Application byte limits, expanded validation, filename reservation, and deletion redirect cleanup are deferred to V2. PHP/server limits still apply. Earlier proposed size-limit patches are not part of the current V1 scope.

Automatic resizing is deferred to the next pass. The reference image scan found `nightbird.jpg` at 2712 × 2490 pixels as the largest by pixel count, and `tallbear.jpg` at 1866 × 2731 as the longest edge. A later resizing target should accommodate these and contemporary iPhone photos; 48 million pixels was proposed, subject to the Pi's processing capacity. Do not decode/re-encode animated files in a way that silently discards animation.

## Implementation order before deployment

### 1. Room hashing, homemade metadata cipher, and image scrambling

Follow [ROOM_STORAGE_PLAN.md](ROOM_STORAGE_PLAN.md) for canonical room hashing and the versioned, room-name XOR/Base64 metadata cipher. Reuse the helpers already used by `holes`. Update display, upload, and deletion together, preserving numeric values and SQL nulls after decoding. Use the selected fresh-database setup; no existing-record migration is required for this pass.

Follow [IMAGE_ENCRYPTION.md](IMAGE_ENCRYPTION.md) for private file storage and image delivery. The preference for this version is homemade room-based scrambling; the exact byte versus visual pixel approach is still undecided. Freeze and version its format and reversal rules before writing transformed files.

Move transformed files outside `public/`, add a room-scoped serving endpoint, update all image/modal links, and keep upload cleanup and deletion consistent. Verify restoration without creating plaintext copies on disk. These features provide conceptual concealment, not private-room access control.

Store files under opaque identifiers and keep their readable display names as separately scrambled metadata, as specified in IMAGE_ENCRYPTION.md. Use a separate opaque `storage_key` for file lookup and reset cleanup. The current implementation will start from a fresh database; metadata migration/versioning is not required for this pass.

### 2. Door creation constraints

October 14 status: shared `changeRoomDoor()` transaction is implemented and browser-tested. Gallery/four-hall enforcement is the next manual implementation. Opening into a one-door destination gallery is blocked even when empty; an empty initiating gallery can gain a second door, but an initiating gallery containing images cannot. Simulate both changed endpoints and inspect all neighbors of each to prevent new adjacent four-door halls.

Implement [PREVENT_GALLERY_BREAKING.md](PREVENT_GALLERY_BREAKING.md) and [PREVENT_DOUBLE_4_HALLS.md](PREVENT_DOUBLE_4_HALLS.md) before adding logging and the admin page. Retain destination one-door gallery protection and additionally protect both endpoints whenever they contain images: an opening must not leave either image-containing room with more than one door. A zero-door gallery can gain its first entrance, and closing its existing entrance permits choosing a new entrance later. Separately reject a new edge that would create adjacent four-door hallways, checking neighbors of both simulated endpoints.

Use one server-side validation/mutation path with a SQLite write transaction to avoid concurrent stale checks. Admin bulk resets remain intentional exceptions. Detailed acceptance cases and estimates are in the individual plans.

An existing gallery may gain its second door only when it is the initiating room and contains no images. A one-door destination gallery is protected even when empty; galleries containing images are protected from either side. “In the gallery” means the editing request's initiating room, not a new authentication/presence mechanism.

### Independent task: room URL fallback

Implement [ROOM_URL_FALLBACK.md](ROOM_URL_FALLBACK.md): sanitize the first room path segment to ASCII alphanumeric, ignore later segments, canonicalize, and redirect to that room or `/0` when empty. Preserve explicit endpoints/static files. This can be done before or after the door constraints; estimate 25–50 lines plus verification.

### 3. Plain-text logging

Implement [LOGGER_PLAN.md](LOGGER_PLAN.md) after storage/scrambling is integrated. Record successful image additions/deletions, door/wall layout changes, and `HOLES RESET`, newest first. Use restored filenames and canonical room names for the selected readable log format; this intentionally leaves those names readable in the log.

### 4. Fallback links for unexpected hallway images

Hallway uploads are removed from V1 scope. Offer image uploads only in galleries (zero or one resolved door), and enforce this classification in the upload handler. Check classification and insert within the same write-transaction discipline as door edits so concurrent uploads and openings cannot defeat image protection.

If a hallway contains images due to existing data, admin resets, or another unexpected condition, show all of them with clickable modal links and deletion controls. Corner wording may describe these fallback images, but it is not an intended upload mode. Preserve existing placement values and expose gallery images that no longer match a letter bin through an unplaced list. Do not add hallway null-placement upload handling or a hallway upload form.

## GIF compatibility

The current upload MIME whitelist already includes `image/gif`; existing files are served unchanged. Basic GIF acceptance therefore needs no new format-specific application code. Verify an animated GIF in the page modal.

Whole-file byte XOR scrambling preserves GIF frames, timing, and looping exactly. Include GIF content-type delivery and an exact animated-file round trip in verification; no frame processor is required. Budget roughly 0–10 GIF-specific integration lines beyond the shared byte-scrambling implementation, plus verification.

The still-image PNG pixel-scrambling option does not preserve animation. If selected, either add a documented byte-scrambling path for GIFs (roughly 15–30 dispatch/header lines if both shared transformers already exist), or separately plan animation-aware processing. Implementing the byte transformer itself is additional work if it does not already exist. Animation-aware visual scrambling is not covered by the still-image estimate and needs library selection and frame/format design before estimating.

### 5. Hidden admin page and bulk resets

Implement [ADMIN_PAGE.md](ADMIN_PAGE.md): no authentication, an unlinked route, automatic temporary log display with room links, and confirmed POST actions to reset doors or images independently. Image reset includes uploaded file cleanup. Individual events use the room in the request; bulk resets write only global summaries. No permanent room recovery index is wanted, and removing logs must not affect application operation.

## Acceptance and deployment

Verify upload/display/modal/deletion across supported formats; canonical IDs and room `0`; metadata and image round trips; gallery-only uploads; blocked second entrances for image-containing rooms; close-then-open entrance relocation; fallback links/deletion for unexpected hallway images; logging and resets; and persistent agreement between shared door endpoints.

Then complete [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md): Pi compatibility, Apache routing, required extensions, writable persistent directories, production error logging, consistent database/image backups, update/rollback instructions, and reboot recovery.

## Next pass

- Implement the selected experimental RSA block lookup encoding described in [ROOM_ENCODING_V2.md](ROOM_ENCODING_V2.md), after specifying and reviewing its framing and parameters. Keep SHA-256 for V1; metadata/image XOR and temporary logs remain unchanged.
- Automatic resizing and orientation handling, with a format policy for HEIC and animation.
- Actual hallway wall placement and doorway/image overlap handling.
- Log rotation or size limits as usage grows.
