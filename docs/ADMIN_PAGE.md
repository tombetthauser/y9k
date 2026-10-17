# Hidden admin page

Planning reference — October 11, 2026. This document records future work; it does not implement the page.

## Selected behavior

Create an unlinked route such as `/admin.php`. There is no password, login, or password prompt. Anyone who discovers the route can view logs and perform its actions; an unlinked URL does not restrict access. This is the user's chosen scope.

The page uses the site's minimal styling and automatically displays the complete change log, newest first. Room identifiers in individual image and shared-edge entries are clickable links to canonical room URLs. Escape all displayed log text and build links from validated room identifiers.

Provide clickable controls for:

- Reset doors: delete every `holes` override and restore procedural doors/walls. Leave images unchanged.
- Reset images: delete every `things` record and its corresponding uploaded file. Leave door overrides unchanged. Do not delete application textures or unrelated files.

Use native confirmation dialogs before resets. The controls may look like links but submit POST forms; GET requests only display the page. No password prompts are included. Share reset implementation between terminal scripts and browser handlers rather than duplicating cleanup logic.

## Logging and room links

Follow [LOGGER_PLAN.md](LOGGER_PLAN.md) for the human-readable, newest-first text log. Every individual image or door event must identify a canonical room. Normal shared-edge changes name the initiating room; optionally include both endpoints.

For bulk resets, write only `HOLES RESET` or `THINGS RESET`. Summaries are global events and have no single room link. Individual change logs use the room ID available in the request. Logs are temporary and may be cleared without affecting the application.

Do not create a permanent room recovery index or depend on logs to recover database contents. Hashes cannot be reversed; bulk-reset summaries deliberately avoid needing readable room names.

The admin renderer must support the selected room-bearing log format rather than assuming arbitrary text is a valid room ID. A missing/deleted room's content does not prevent its canonical procedural URL from being linked.

## Reset implementation

### Holes

- No room recovery is needed for a global reset.
- Delete overrides in a transaction and commit before logging success.
- Log `HOLES RESET`; resetting does not necessarily close passages.
- Keep `things` and image files untouched.

### Things

- Plan cleanup without requiring readable room IDs or decrypting room-keyed filenames: use opaque file references or a dedicated uploaded-file directory, never application assets.
- Resolve paths from trusted stored references inside the configured upload directory.
- Account for scrambled filenames and files using the selected storage helpers.
- Coordinate database removal and filesystem cleanup explicitly; a database transaction cannot roll back file deletions.
- Report and log partial file-cleanup failures truthfully and preserve enough information for retry. Do not report complete file removal when cleanup failed.
- Keep `holes` untouched.

## Verification

Use temporary databases and upload directories to verify each reset preserves the other table, removes only intended uploaded files, handles missing files/cleanup failures, and records a global summary. Verify POST-only mutations, canceled confirmations, escaped log text, canonical room links for individual events, empty resets, and newest-first display.

## Estimate

Earlier estimate: 160–260 added or changed application/script lines, including comments, excluding the shared logger and tests. Permanent room recovery has since been removed from scope; re-estimate after selecting the shared reset/file cleanup implementation.

Add the page after storage scrambling, logging, and hallway presentation in [V1_COMPLETION_PLAN.md](V1_COMPLETION_PLAN.md).
