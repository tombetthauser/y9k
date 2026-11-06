<?php

// LLM THUMBNAILS: BEGIN generated CLI worker.
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Run from the terminal.');
}

if ($argc > 2 || ($argc === 2 && $argv[1] !== '--once')) {
    fwrite(STDERR, "Usage: php testing/thumbnail-worker.php [--once]\n");
    exit(2);
}

require_once __DIR__ . '/../src/database.php';
require_once __DIR__ . '/../src/tools.php';

$directory = dirname(__DIR__) . '/data';
if (!is_dir($directory) && !@mkdir($directory, 0755, true) && !is_dir($directory)) {
    fwrite(STDERR, "Could not create worker directory.\n");
    exit(1);
}
$lock = @fopen($directory . '/thumbnail-worker.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
    fwrite(STDERR, "Thumbnail worker lock unavailable.\n");
    if (is_resource($lock)) {
        fclose($lock);
    }
    exit(1);
}

try {
    assertThumbnailCapabilities();
    $pdo = database();
    $pdo->exec('PRAGMA busy_timeout = 5000');
    do {
        try {
            $processed = processNextThumbnail($pdo);
        } catch (Throwable $error) {
            error_log('Thumbnail worker error: ' . $error->getMessage());
            if ($argc === 2) {
                exit(1);
            }
            $processed = false;
        }
        if ($argc === 2) {
            break;
        }
        if (!$processed) {
            sleep(2);
        }
    } while (true);
} catch (Throwable $error) {
    error_log('Thumbnail worker startup error: ' . $error->getMessage());
    exit(1);
} finally {
    flock($lock, LOCK_UN);
    fclose($lock);
}
// LLM THUMBNAILS: END generated CLI worker.
