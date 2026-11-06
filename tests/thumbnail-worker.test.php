<?php

// LLM THUMBNAILS: BEGIN generated isolated thumbnail tests.
declare(strict_types=1);

$root = __DIR__ . '/.thumbnail-test-' . bin2hex(random_bytes(8));
mkdir($root . '/src', 0755, true);
mkdir($root . '/testing', 0755, true);
mkdir($root . '/data/images', 0755, true);
mkdir($root . '/data/thumbnails', 0755, true);
copy(__DIR__ . '/../src/tools.php', $root . '/src/tools.php');
copy(__DIR__ . '/../testing/thumbnail-worker.php', $root . '/testing/thumbnail-worker.php');
file_put_contents($root . '/src/database.php', <<<'PHP'
<?php
function database(): PDO {
    $pdo = new PDO('sqlite:' . dirname(__DIR__) . '/data/test.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    return $pdo;
}
PHP);
require $root . '/src/tools.php';

function checkThumbnail(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}

function removeThumbnailFixture(string $path): void
{
    if (is_dir($path) && !is_link($path)) {
        foreach (array_diff(scandir($path), ['.', '..']) as $name) {
            removeThumbnailFixture($path . '/' . $name);
        }
        rmdir($path);
    } elseif (file_exists($path) || is_link($path)) {
        unlink($path);
    }
}

function imageFixture(string $type, int $width, int $height): string
{
    $image = imagecreatetruecolor($width, $height);
    imagealphablending($image, false);
    imagesavealpha($image, true);
    imagefill($image, 0, 0, imagecolorallocatealpha($image, 10, 20, 30, 80));
    ob_start();
    match ($type) {
        'png' => imagepng($image),
        'jpeg' => imagejpeg($image),
        'gif' => imagegif($image),
        'webp' => imagewebp($image),
    };
    return ob_get_clean();
}

function queueFixture(PDO $pdo, int $id, string $room, string $bytes): string
{
    $key = sprintf('%032x.foo', $id);
    file_put_contents(imageStoragePath($key), scrambleImageBytes($bytes, $room));
    $pdo->prepare('INSERT INTO things (id, filename, filekey, room) VALUES (?, ?, ?, ?)')
        ->execute([$id, scrambleMetadata('picture.png', $room), $key, hashRoomId($room)]);
    $pdo->prepare('INSERT INTO thumbnail_jobs VALUES (?, ?)')->execute([$id, $room]);
    return $key;
}

function thumbnailStatus(PDO $pdo, int $id): string
{
    return $pdo->query('SELECT thumbnail FROM things WHERE id = ' . $id)->fetchColumn();
}

function runFixtureWorker(string $root, ?string $disabledFunction = null): int
{
    $command = [PHP_BINARY];
    if ($disabledFunction !== null) {
        $command[] = '-d';
        $command[] = 'disable_functions=' . $disabledFunction;
    }
    $command[] = $root . '/testing/thumbnail-worker.php';
    $command[] = '--once';
    $process = proc_open($command, [
        0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w'],
    ], $pipes);
    fclose($pipes[0]);
    stream_get_contents($pipes[1]);
    stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    return proc_close($process);
}

try {
    $pdo = new PDO('sqlite:' . $root . '/data/test.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("CREATE TABLE things (id INTEGER PRIMARY KEY, filename TEXT NOT NULL, filekey TEXT NOT NULL UNIQUE, room TEXT NOT NULL, thumbnail TEXT NOT NULL DEFAULT 'pending' CHECK (thumbnail IN ('pending','created','skipped','failed')))");
    $pdo->exec('CREATE TABLE thumbnail_jobs (thing_id INTEGER PRIMARY KEY REFERENCES things(id), room_id TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE holes (id INTEGER PRIMARY KEY)');
    $pdo->exec('INSERT INTO holes VALUES (1)');

    checkThumbnail(thumbnailUrl('000A', str_repeat('a', 32) . '.foo') === '/image.php?r=a&k=' . str_repeat('a', 32) . '.foo&variant=thumbnail', 'URL contract');
    checkThumbnail(!processNextThumbnail($pdo), 'Empty queue');

    $png = imageFixture('png', 2048, 1024);
    $key = queueFixture($pdo, 1, 'a', $png);
    file_put_contents(thumbnailStoragePath($key) . '.tmp', 'crash residue');
    file_put_contents(thumbnailStoragePath($key), 'uncommitted publication');
    checkThumbnail(processNextThumbnail($pdo), 'PNG job processed');
    checkThumbnail(thumbnailStatus($pdo, 1) === 'created', 'PNG status');
    checkThumbnail(!file_exists(thumbnailStoragePath($key) . '.tmp'), 'Crash staging cleaned');
    checkThumbnail(restoreImageBytes(file_get_contents(imageStoragePath($key)), 'a') === $png, 'Original unchanged');
    $thumb = restoreImageBytes(file_get_contents(thumbnailStoragePath($key)), 'a');
    $decoded = imagecreatefromstring($thumb);
    checkThumbnail(imagesx($decoded) === 1024 && imagesy($decoded) === 512, 'PNG dimensions');
    checkThumbnail(((imagecolorat($decoded, 0, 0) >> 24) & 127) > 0, 'PNG transparency');

    $jpeg = imageFixture('jpeg', 40, 20);
    $exif = "Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0";
    $jpeg = substr($jpeg, 0, 2) . "\xff\xe1" . pack('n', strlen($exif) + 2) . $exif . substr($jpeg, 2);
    $key2 = queueFixture($pdo, 2, 'a', $jpeg);
    processNextThumbnail($pdo);
    $decoded = imagecreatefromstring(restoreImageBytes(file_get_contents(thumbnailStoragePath($key2)), 'a'));
    checkThumbnail(imagesx($decoded) === 20 && imagesy($decoded) === 40, 'EXIF orientation');

    $quadrants = imagecreatetruecolor(40, 20);
    imagefilledrectangle($quadrants, 0, 0, 19, 9, imagecolorallocate($quadrants, 255, 0, 0));
    imagefilledrectangle($quadrants, 20, 0, 39, 9, imagecolorallocate($quadrants, 0, 255, 0));
    imagefilledrectangle($quadrants, 0, 10, 19, 19, imagecolorallocate($quadrants, 0, 0, 255));
    imagefilledrectangle($quadrants, 20, 10, 39, 19, imagecolorallocate($quadrants, 255, 255, 255));
    ob_start();
    imagejpeg($quadrants, null, 100);
    $quadrantJpeg = ob_get_clean();
    $expectedCorners = [
        1 => [255, 0, 0], 2 => [0, 255, 0], 3 => [255, 255, 255], 4 => [0, 0, 255],
        5 => [255, 0, 0], 6 => [0, 0, 255], 7 => [255, 255, 255], 8 => [0, 255, 0],
    ];
    foreach ($expectedCorners as $orientation => $expected) {
        $exif = "Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0"
            . chr($orientation) . "\0\0\0\0\0\0\0";
        $orientedJpeg = substr($quadrantJpeg, 0, 2) . "\xff\xe1"
            . pack('n', strlen($exif) + 2) . $exif . substr($quadrantJpeg, 2);
        $oriented = imagecreatefromstring(thumbnailWebp($orientedJpeg, thumbnailOrientation($orientedJpeg)));
        $color = imagecolorat($oriented, 3, 3);
        foreach ([($color >> 16) & 255, ($color >> 8) & 255, $color & 255] as $channel => $value) {
            checkThumbnail(abs($value - $expected[$channel]) < 45, 'EXIF orientation ' . $orientation);
        }
    }

    $gif = imageFixture('gif', 4, 4);
    queueFixture($pdo, 3, 'a', $gif);
    processNextThumbnail($pdo);
    checkThumbnail(thumbnailStatus($pdo, 3) === 'skipped', 'GIF skipped');
    $actl = pack('N', 8) . 'acTL' . pack('NN', 2, 0) . pack('N', 0);
    $apng = substr($png, 0, 33) . $actl . substr($png, 33);
    queueFixture($pdo, 4, 'a', $apng);
    processNextThumbnail($pdo);
    checkThumbnail(thumbnailStatus($pdo, 4) === 'skipped', 'APNG skipped');
    $animatedWebp = 'RIFF' . pack('V', 22) . 'WEBP' . 'VP8X' . pack('V', 10) . "\x02" . str_repeat("\0", 9);
    queueFixture($pdo, 5, 'a', $animatedWebp);
    processNextThumbnail($pdo);
    checkThumbnail(thumbnailStatus($pdo, 5) === 'skipped', 'Animated WebP skipped');
    $webpKey = queueFixture($pdo, 6, 'a', imageFixture('webp', 12, 8));
    checkThumbnail(runFixtureWorker($root, 'imagewebp') !== 0, 'Missing encoder fails startup');
    checkThumbnail(thumbnailStatus($pdo, 6) === 'pending'
        && (int) $pdo->query('SELECT count(*) FROM thumbnail_jobs WHERE thing_id = 6')->fetchColumn() === 1,
        'Missing encoder leaves queued work intact');
    checkThumbnail(runFixtureWorker($root) === 0 && thumbnailStatus($pdo, 6) === 'created', 'CLI worker handles WebP');
    checkThumbnail(is_file(thumbnailStoragePath($webpKey)), 'WebP thumbnail published');
    $noExifKey = queueFixture($pdo, 10, 'a', $jpeg);
    checkThumbnail(runFixtureWorker($root, 'exif_read_data') === 0, 'Worker runs without EXIF support');
    checkThumbnail(thumbnailStatus($pdo, 10) === 'skipped'
        && !file_exists(thumbnailStoragePath($noExifKey))
        && (int) $pdo->query('SELECT count(*) FROM thumbnail_jobs WHERE thing_id = 10')->fetchColumn() === 0,
        'JPEG is skipped without EXIF support and job is removed');
    checkThumbnail(deleteStoredThing($pdo, 10, 'a') === 'picture.png', 'Remove no-EXIF fixture');
    queueFixture($pdo, 7, 'a', 'invalid');
    processNextThumbnail($pdo);
    checkThumbnail(thumbnailStatus($pdo, 7) === 'failed', 'Failure recorded');
    checkThumbnail((int) $pdo->query('SELECT count(*) FROM thumbnail_jobs')->fetchColumn() === 0, 'Completed jobs removed');

    $lock = fopen($root . '/data/thumbnail-worker.lock', 'c');
    flock($lock, LOCK_EX);
    checkThumbnail(runFixtureWorker($root) !== 0, 'Second worker rejected');
    flock($lock, LOCK_UN);
    fclose($lock);

    checkThumbnail(deleteStoredThing($pdo, 1, 'b') === null, 'Wrong-room deletion refused');
    checkThumbnail(deleteStoredThing($pdo, 1, 'a') === 'picture.png', 'Delete returns filename');
    checkThumbnail(!file_exists(imageStoragePath($key)) && !file_exists(thumbnailStoragePath($key)), 'Delete removes both files');
    checkThumbnail(deleteStoredThing($pdo, 1, 'a') === null, 'Missing row returns null');

    $racingKey = queueFixture($pdo, 9, 'a', $png);
    $process = proc_open([PHP_BINARY, $root . '/testing/thumbnail-worker.php', '--once'], [
        0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w'],
    ], $pipes);
    fclose($pipes[0]);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    checkThumbnail(deleteStoredThing($pdo, 9, 'a') === 'picture.png', 'Concurrent deletion');
    stream_get_contents($pipes[1]);
    stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    checkThumbnail(proc_close($process) === 0, 'Concurrent worker exits normally');
    checkThumbnail(!file_exists(thumbnailStoragePath($racingKey)) && !file_exists(thumbnailStoragePath($racingKey) . '.tmp'), 'Deletion cannot leave a published derivative');
    checkThumbnail((int) $pdo->query('SELECT count(*) FROM thumbnail_jobs WHERE thing_id = 9')->fetchColumn() === 0, 'Deletion removes racing job');

    $badKey = queueFixture($pdo, 8, 'a', $png);
    mkdir(thumbnailStoragePath($badKey));
    try {
        deleteStoredThing($pdo, 8, 'a');
        throw new RuntimeException('Cleanup failure not raised');
    } catch (RuntimeException $error) {
        checkThumbnail(str_contains($error->getMessage(), 'Could not remove'), 'Cleanup failure reported');
    }
    checkThumbnail((int) $pdo->query('SELECT count(*) FROM thumbnail_jobs WHERE thing_id = 8')->fetchColumn() === 1, 'Failed delete retains job');
    $result = resetAllThings($pdo);
    checkThumbnail($result['deleted'] === 6 && $result['failed'] === [$badKey], 'Reset retains failures');
    checkThumbnail((int) $pdo->query('SELECT count(*) FROM holes')->fetchColumn() === 1, 'Reset preserves holes');
    rmdir(thumbnailStoragePath($badKey));
    checkThumbnail(resetAllThings($pdo)['deleted'] === 1, 'Reset retry');
    checkThumbnail((int) $pdo->query('SELECT count(*) FROM thumbnail_jobs')->fetchColumn() === 0, 'Reset removes jobs');

    // EXIF-bearing PNG and WebP keep their originals rather than changing visible orientation.
    $tiffExif = "II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0";
    $chunkData = 'eXIf' . $tiffExif;
    $pngExif = substr($png, 0, 33) . pack('N', strlen($tiffExif)) . $chunkData
        . pack('N', crc32($chunkData)) . substr($png, 33);
    $pngExifKey = queueFixture($pdo, 30, 'a', $pngExif);
    processNextThumbnail($pdo);
    checkThumbnail(thumbnailStatus($pdo, 30) === 'skipped' && !file_exists(thumbnailStoragePath($pngExifKey)),
        'PNG EXIF skipped');
    $webp = imageFixture('webp', 12, 8);
    $exifChunk = 'EXIF' . pack('V', strlen($tiffExif)) . $tiffExif
        . (strlen($tiffExif) % 2 ? "\0" : '');
    $webpExif = 'RIFF' . pack('V', strlen($webp) - 8 + strlen($exifChunk))
        . substr($webp, 8) . $exifChunk;
    $webpExifKey = queueFixture($pdo, 31, 'a', $webpExif);
    processNextThumbnail($pdo);
    checkThumbnail(thumbnailStatus($pdo, 31) === 'skipped' && !file_exists(thumbnailStoragePath($webpExifKey)),
        'WebP EXIF skipped');
    checkThumbnail((int) $pdo->query('SELECT count(*) FROM thumbnail_jobs')->fetchColumn() === 0,
        'EXIF-skipped jobs removed');
    checkThumbnail(resetAllThings($pdo)['deleted'] === 2, 'Remove EXIF fixtures');

    // Pause the isolated worker after decoding, immediately before resampling.
    $fixtureTools = $root . '/src/tools.php';
    $source = file_get_contents($fixtureTools);
    $needle = '    if (!imagecopyresampled($target, $image, 0, 0, 0, 0, imagesx($target), imagesy($target), $width, $height)) {';
    $position = strrpos($source, $needle);
    checkThumbnail($position !== false, 'Find resampling hook');
    $ready = $root . '/data/worker-ready';
    $release = $root . '/data/worker-release';
    $hook = '    file_put_contents(' . var_export($ready, true) . ", 'ready');\n"
        . '    $deadline = microtime(true) + 10;' . "\n"
        . '    while (!file_exists(' . var_export($release, true) . ') && microtime(true) < $deadline) { usleep(10000); }' . "\n"
        . '    if (!file_exists(' . var_export($release, true) . ")) { throw new RuntimeException('Test hook timed out'); }\n";
    file_put_contents($fixtureTools, substr_replace($source, $hook, $position, 0));
    foreach (['delete', 'reset'] as $index => $operation) {
        $raceId = 20 + $index;
        $raceKey = queueFixture($pdo, $raceId, 'a', $png);
        $process = proc_open([PHP_BINARY, $root . '/testing/thumbnail-worker.php', '--once'], [
            0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w'],
        ], $pipes);
        fclose($pipes[0]);
        $deadline = microtime(true) + 5;
        while (!file_exists($ready) && microtime(true) < $deadline) {
            usleep(10000);
        }
        try {
            checkThumbnail(file_exists($ready), 'Worker reached image processing');
            $pdo->exec('PRAGMA busy_timeout = 250');
            $pdo->exec('BEGIN IMMEDIATE');
            $pdo->exec('INSERT INTO holes VALUES (' . (2 + $index) . ')');
            $pdo->exec('COMMIT');
            if ($operation === 'delete') {
                checkThumbnail(deleteStoredThing($pdo, $raceId, 'a') === 'picture.png', 'Delete while processing');
            } else {
                checkThumbnail(resetAllThings($pdo)['deleted'] === 1, 'Reset while processing');
            }
        } finally {
            file_put_contents($release, 'continue');
            stream_get_contents($pipes[1]);
            stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            $workerResult = proc_close($process);
        }
        checkThumbnail($workerResult === 0, 'Paused worker completed');
        checkThumbnail(!file_exists(thumbnailStoragePath($raceKey))
            && !file_exists(thumbnailStoragePath($raceKey) . '.tmp'), 'No resurrection after ' . $operation);
        checkThumbnail((int) $pdo->query('SELECT count(*) FROM thumbnail_jobs WHERE thing_id = ' . $raceId)->fetchColumn() === 0,
            'No stale job after ' . $operation);
        unlink($ready);
        unlink($release);
    }
    echo "Thumbnail tests passed.\n";
} finally {
    $pdo = null;
    removeThumbnailFixture($root);
}
// LLM THUMBNAILS: END generated isolated thumbnail tests.
