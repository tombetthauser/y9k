# TODO

Updated October 23, 2026; existing features still need final checks where listed.

## Done

- [x] Check that saved images and their details can be restored correctly.
- [x] Keep door changes together so simultaneous edits do not clash.
- [x] Update local PHP to 8.5.12, disable upload-progress tracking, and restart the server.
- [x] Review security and write a [patch plan](docs/SECURITY_REVIEW_2026-10.md).

## Before deployment

- [ ] Verify the existing rules protect galleries when doors change.
- [ ] Verify the existing rule prevents neighboring four-door hallways.
- [ ] Keep unexpected images viewable and removable, and prevent hallway uploads.
- [ ] Make messy room addresses lead to a valid room.
- [ ] Verify temporary logs record changes and only summaries for bulk resets.
- [x] Stop logging image views so ordinary browsing does not keep rewriting the log.
- [ ] Verify thumbnail processing, original-image preloading, and worker restart on the Pi.
- [ ] Fix admin reset buttons and redirects to use the correct page address.
- [ ] Finish the unlinked admin page with readable room links and separate, confirmed resets.
- [ ] Check browsing, uploads, image edits, doors, logs, and resets together using disposable content.
- [ ] Set up the Pi, web server, domain, and tunnel, and verify they recover after a reboot.
- [ ] Verify any deployed PHP is patched and upload-progress tracking is off.
- [ ] Keep private files off the web, restrict file permissions, and hide production error details.
- [ ] Set up backups and test restoring the database and its matching images.
- [ ] Document safe code and server updates without deleting saved content.

## Optional hardening

- [ ] Reduce unwanted edits triggered by other websites and prevent embedded admin controls.
- [ ] Use a trusted site address when generating sharing links.
- [ ] Consider serving the 3D library locally and tightening browser security settings.

## V2

- [ ] Explore a different room-number encoding after reviewing its design.
- [ ] Add upload limits, stronger input checks, reserved filenames, and handler cleanup.
- [ ] Add automatic resizing and rotation of originals, and decide how to handle HEIC and animations.
- [ ] Improve image placement and prevent artwork from overlapping doorways.
- [ ] Add automatic log size management if needed.

## Standing decisions

- V1 trusts its users; public edits and the unlinked admin page have no login.
- Stored images are scrambled, not protected as private encrypted content.
- Logs are disposable; do not add a permanent room recovery index.
- Hallway uploads stay outside V1, but unexpected hallway images keep accessible links.
- Preserve existing databases and images; back up before the thumbnail schema migration. No content deletion is planned.

Details: [V1 plan](docs/V1_COMPLETION_PLAN.md), [deployment plan](docs/DEPLOYMENT_PLAN.md), and [security review](docs/SECURITY_REVIEW_2026-10.md).
