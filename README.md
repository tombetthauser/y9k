## Local Start Up
php -d upload_max_filesize=0 -d post_max_size=0 -S localhost:3000 -t public

Run the thumbnail worker in a separate terminal:

```sh
php testing/thumbnail-worker.php
```

The worker needs PHP's GD, WebP, EXIF, SQLite, GMP, and fileinfo support. Uploads
finish without waiting for it; until a thumbnail is ready, the original is
used. Keep the worker running for queued work to finish.

Thumbnails are WebP images no larger than 1,024 pixels on the longest edge.
GIFs, animated PNGs and WebPs, and PNGs and WebPs containing EXIF use the
original instead; JPEGs also use the original if their orientation cannot be
determined. Worker errors are reported in the server logs and the original
remains available.

Existing databases are not migrated automatically. To keep existing images,
stop all web and worker processes, back up the complete `data/` directory, and
run `php testing/migrate-thumbnails.php` once. The migration changes only the
database schema; it does not delete images or door settings. Restart the web
server and worker afterward.

Existing images are queued when their room is visited through either room
interface. Until then, they remain `pending` without a queued job; a first visit
can still show the original. Already-created, skipped, and failed thumbnails
are not requeued on every visit. Check worker logs for failures. The queue
temporarily stores room IDs; do not treat it, SQLite journals, or backups as
private. Deployment also needs a supervised worker that starts at boot; see
[the deployment plan](docs/DEPLOYMENT_PLAN.md).

Run the isolated thumbnail checks with:

```sh
php tests/thumbnail-worker.test.php
node --test tests/thumbnail-migration.test.mjs tests/thumbnail-integration.test.mjs tests/image-prefetch.test.mjs
```