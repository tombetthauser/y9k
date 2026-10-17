# Prevent adding an entrance to an existing one-door gallery

Planning reference — October 11, 2026. Proposed behavior; no implementation in this document.

## Rule

Confirmed October 14: (1) opening from a hallway into a one-door gallery must never turn that destination into a hallway, empty or populated; (2) opening a second door from inside an empty initiating gallery is allowed subject to destination/four-hall checks; (3) doing so from inside a populated gallery is blocked. A zero-door destination may still receive its first entrance. Closures remain allowed. The implementation must enforce these rules inside `changeRoomDoor()`, not only in keyboard controls, and report rejected actions without committing mutations.

October 13 clarification: a user may create a gallery's second entrance only when the gallery is the initiating room and contains no images. This describes the room supplied by the editing request, not proof of physical presence or browser navigation. A one-door destination gallery remains protected even when empty. Both image-containing endpoints remain protected from additional openings that would leave more than one door. Closing an entrance and choosing a different first entrance remain allowed.

When a user requests a new door on a currently closed shared edge, inspect the destination room's resolved doors, including persistent overrides. If that room already has exactly one door, reject the new opening: it would gain a second entrance and cease being a gallery.

A destination with zero doors is allowed to gain its first entrance. Destinations with two or more doors are not blocked by this rule. The original destination rule remains in place even for an empty destination. Additionally, inspect both endpoints for images using `things.room = hashRoomId(roomId)`. Reject an opening whenever an image-containing endpoint would have more than one resolved door afterward. An empty initiating gallery may still be converted into a hallway, subject to destination protection and the four-hall rule.

Closing doors is allowed. Requests for an already open door do not create a new entrance and should not be rejected. Compare current and requested resolved edge state rather than whether the operation inserts or deletes an override: deleting a closed override can also open a procedural door.

## Implementation

1. Normalize the initiating room and validate the direction/request.
2. Derive the destination with `getNeighborId()`.
3. Read current resolved doors using `getRoomDoors()`.
4. If the request changes the edge from closed to open, count the destination's existing doors.
5. Reject when the destination count is exactly one, with a readable explanation naming that room.
6. Count images and simulate the post-opening door count for both endpoints; reject if either contains images and would have more than one door.
7. Otherwise continue through the four-hall check and existing set/reset logic.

Enforce this on the server, not only in the keyboard listener. Share the validation with any future single-edge editing tools. Perform read/validate/write inside a SQLite `BEGIN IMMEDIATE` transaction so concurrent edits cannot both pass against stale counts. Commit before writing success logs and roll back on rejection or failure. Adapt transaction handling consistently with PDO's SQLite behavior and the second doorway rule.

Keep global administrative resets available as intentional exceptions. Resetting all overrides is a separate operation and can change classifications. Existing layouts are not repaired or rejected simply by viewing them.

## Image-containing gallery examples

- Zero doors plus images: adding one door is allowed if other destination constraints pass.
- One door plus images: adding a second is blocked from either side of the edge.
- One door plus images: removing it is allowed; opening a different wall afterward is allowed subject to the other checks.
- Existing hallway plus images: do not automatically repair it, but block additional openings and allow closures and image deletion.
- Uploads remain gallery-only and must use compatible write transactions so an upload and door edit cannot race past the checks.

## Verification

Check blocked opening into a one-door destination; allowed opening into a zero-door destination; allowed opening into a hallway; allowed conversion of an empty initiating gallery; blocked conversion of an initiating gallery containing images; close-then-open relocation; allowed closure; idempotent open requests; room normalization; and openings caused by override removal. Rejections must leave both endpoint layouts and the database unchanged and produce no successful-change log.

## Estimate

Roughly 45–75 added/changed lines for this rule and its error path, excluding tests and the shared transaction/validation integration estimated separately in the completion list.
