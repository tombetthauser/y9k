# Plain-text change logger

Planning reference — October 10, 2026. This document records the proposed implementation; it does not implement logging.

## Purpose and format

Record successful image additions/deletions and shared-edge door/wall changes in a raw text file. Prepend each entry so the newest event appears at the top. Use one line per event, uppercase canonical room IDs, and no timestamps initially.

Example contents, newest first:

```text
HOLES RESET
ROOM 54T -- cat9000.jpg deleted from north wall
ROOM 54T -- cat9000.jpg added to north wall
ROOM 80LM -- north wall added nesw -> -esw
ROOM 80LM -- north door added -esw -> nesw
```

Door layout labels always use north, east, south, west order. Use `n`, `e`, `s`, or `w` for an existing passage and `-` for a wall. Adding a wall also means removing a door; adding a door also means removing a wall. Write one entry for the action rather than separate entries for both descriptions.

## File organization

```text
src/logging.php             Shared logging and label helpers
data/logs/changes.txt        Generated text log, outside the web root
scripts/reset-holes.php     Terminal-only reset command
```

Add `data/logs/` to `.gitignore`. Create the directory and file on demand. Scripts inside `scripts/` must import application files through `__DIR__ . '/../src/...'`.

## Shared helpers

Implement these helpers in `src/logging.php`:

- `logChange(string $message): void`: prepend a single-line message to the log.
- `doorLayoutLabel(array $doors): string`: convert resolved door states into the four-character layout label.
- `wallLabel(?int $wall): string`: map walls `0` through `3` to north, east, south, and west wall; describe null as an unspecified wall and other indices as `wall N`.

For `logChange()`:

1. Create `data/logs/` if necessary.
2. Open `changes.txt` with `c+`, preserving existing contents.
3. Acquire an exclusive file lock before reading or writing.
4. Read existing entries and replace carriage returns/newlines in the new message with spaces.
5. Prepend the message and a newline, rewind, and write the complete result, handling partial writes.
6. Truncate to the resulting length and flush the output.
7. Always close the handle, releasing the lock.

Report logging failures through PHP's `error_log()` without reversing an already successful application change. Logging is best effort, not an atomic audit trail: database writes and log writes are separate operations. The lock protects cooperating writers against lost entries; it does not make rewriting the file crash-safe.

## Application integration

Load `src/logging.php` from each participating handler or script. Log only after the relevant database operation succeeds, or after commit when using a transaction.

### Door and wall changes: `public/hole.php`

- Capture the resolved room doors and layout label before the change.
- Preserve the existing behavior: remove an override when the requested state matches `edgeHasDoor()`; otherwise call `setHole()`.
- Capture the resolved layout after the change.
- If the layouts differ, log the initiating room, direction, feature added, and before/after labels.
- Do not log repeated requests that leave the resolved layout unchanged. Removing a redundant override without changing the layout also produces no door-change entry.
- Write one entry for the shared edge, naming the initiating room, even though the neighboring room changes too.

### Image addition: `public/upload.php`

- Log the actual stored filename, canonical room, and submitted wall after successful insertion.
- Place logging after the upload's complete `try/catch` block. That catch removes the uploaded file when insertion fails; logging must not trigger that cleanup after a successful insertion.
- No successful-addition entry should be written for a failed upload or insertion.

### Image deletion: `public/delete.php`

- Fetch `wall` alongside `filename` before deleting the record.
- After deletion, log only if `rowCount()` indicates that this request removed a record.
- Preserve null wall values when constructing the label.
- The entry describes database record removal. The existing file deletion flow does not verify `unlink()` success; it must not be presented as guaranteed file removal.
- Add `exit` after the early invalid-ID redirect so that request cannot continue into deletion logic.

### Reset: `scripts/reset-holes.php`

- Keep the command terminal-only.
- Run `DELETE FROM holes`, leaving `things` unchanged.
- Log `HOLES RESET` after success, including when there were no override rows.
- Continue reporting the deleted override count to the terminal.

Direct SQLite edits and other scripts that do not call the logger are outside this system's coverage.

## Verification

- Run PHP syntax checks for the logger and all changed handlers/scripts.
- Verify first use creates the directory/file and subsequent events appear at the top.
- Toggle a door and wall; confirm direction, layout labels, and neighbor agreement.
- Return an edge to its procedural default; confirm its override is removed and the layout change is logged.
- Repeat an identical requested state; confirm no extra door-change entry.
- Upload/delete an image; confirm stored filename and wall labels, including null placement for deletion.
- Confirm failed operations and nonexistent image deletions produce no success entries.
- Run the reset command when desired; confirm `HOLES RESET` and that image records remain intact.
- Verify concurrent logger calls preserve both entries and messages containing line breaks remain one line.

Use temporary files/databases for automated checks rather than resetting live overrides or inserting test messages into the application log.

## Limits and deferred work

Prepending reads and rewrites the entire log for every event. This is acceptable for a small initial log; rotation and size limits are deferred. Timestamps, viewer UI, authentication, database triggers, and guaranteed atomic auditing are also outside this plan.

Readable room IDs and filenames remain visible in the log even if database metadata is later hashed or scrambled. Revisit the log format if that concealment should also apply to logs.

Earlier estimate: approximately 70–110 added or changed lines, including comments. Complete error handling and verification may increase that estimate.
