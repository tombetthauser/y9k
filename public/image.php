<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/database.php';
require_once __DIR__ . '/../src/tools.php';

$room = $_GET['r'] ?? '';
$filekey = $_GET['k'] ?? '';

// LLM THUMBNAILS: BEGIN choose the requested image variant.
$variant = $_GET['variant'] ?? 'original';
if (!is_string($variant) || !in_array($variant, ['original', 'thumbnail'], true)) {
    http_response_code(400);
    exit('400');
}
// LLM THUMBNAILS: END choose the requested image variant.

if (!is_string($room) || !is_string($filekey) || $filekey === '') {
    http_response_code(400);
    exit('400');
}

try {
    $roomId = normalizeRoomId($room);
} catch (InvalidArgumentException $error) {
    http_response_code(400);
    exit('400');
}

/* LLM THUMBNAILS: BEGIN ORIGINAL IMAGE LOOKUP
$statement = database()->prepare(
    'SELECT filename, filekey FROM things
    WHERE filekey = :filekey AND room = :room'
);
LLM THUMBNAILS: END ORIGINAL IMAGE LOOKUP */

// LLM THUMBNAILS: BEGIN fetch the derivative state with the room-scoped image.
$statement = database()->prepare(
    'SELECT filename, filekey, thumbnail FROM things
    WHERE filekey = :filekey AND room = :room'
);
// LLM THUMBNAILS: END fetch the derivative state with the room-scoped image.

$statement->execute([
    'filekey' => $filekey,
    'room' => hashRoomId($roomId),
]);

$image = $statement->fetch();

if ($image === false) {
    http_response_code(404);
    exit('404');
}

/* LLM THUMBNAILS: BEGIN ORIGINAL FILE SELECTION
$path = imageStoragePath($image['filekey']);

if (!is_file($path)) {
    http_response_code(404);
    exit('404');
}
LLM THUMBNAILS: END ORIGINAL FILE SELECTION */

// LLM THUMBNAILS: BEGIN use the original while a thumbnail is pending or unavailable.
$isThumbnail = $variant === 'thumbnail' && $image['thumbnail'] === 'created';
$path = $isThumbnail
    ? thumbnailStoragePath($image['filekey'])
    : imageStoragePath($image['filekey']);

if (!is_file($path)) {
    if ($isThumbnail) {
        error_log('Expected thumbnail is missing: ' . $image['filekey']);
        http_response_code(500);
        exit('500');
    }
    http_response_code(404);
    exit('404');
}
// LLM THUMBNAILS: END select and check the stored file.

$stored = file_get_contents($path);

/* LLM THUMBNAILS: BEGIN ORIGINAL READ-FAILURE HANDLING
if ($stored === false) {
    http_response_code(500);
    exit('500');
}
LLM THUMBNAILS: END ORIGINAL READ-FAILURE HANDLING */

// LLM THUMBNAILS: BEGIN surface thumbnail storage failures.
if ($stored === false) {
    if ($isThumbnail) {
        error_log('Could not read thumbnail: ' . $image['filekey']);
    }
    http_response_code(500);
    exit('500');
}
// LLM THUMBNAILS: END surface thumbnail storage failures.

/* LLM THUMBNAILS: BEGIN ORIGINAL IMAGE RESTORATION
try {
    $bytes = restoreImageBytes($stored, $roomId);
} catch (RuntimeException $error) {
    http_response_code(500);
    exit('500');
}
LLM THUMBNAILS: END ORIGINAL IMAGE RESTORATION */

// LLM THUMBNAILS: BEGIN report failures restoring either stored variant.
try {
    $bytes = restoreImageBytes($stored, $roomId);
} catch (RuntimeException $error) {
    error_log('Image restoration failed for ' . $image['filekey'] . ': ' . $error->getMessage());
    http_response_code(500);
    exit('500');
}
// LLM THUMBNAILS: END report restoration failures.

$mimeType = (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);

// LLM THUMBNAILS: BEGIN reject a derivative that is not the expected WebP.
if ($isThumbnail && $mimeType !== 'image/webp') {
    error_log('Invalid thumbnail content for ' . $image['filekey']);
    http_response_code(500);
    exit('500');
}
// LLM THUMBNAILS: END reject an invalid derivative.

if (!in_array(
    $mimeType,
    ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    true
)) {
    http_response_code(500);
    exit('500');
}

/* LLM THUMBNAILS: BEGIN ORIGINAL VIEW LOGGING
$filename = restoreMetadata($image['filename'], $roomId);

logChange(
    'ROOM: ' . strtolower($roomId)
    . ' | VIEWED: ' . $filename
);
LLM THUMBNAILS: END ORIGINAL VIEW LOGGING */

// LLM THUMBNAILS: BEGIN avoid logging background reads as human views.
// Uploads and deletions still write change logs.
// LLM THUMBNAILS: END avoid logging background reads as human views.

header('Content-Type: ' . $mimeType);
header('Content-Length: ' . strlen($bytes));
header('X-Content-Type-Options: nosniff');;
header('Cache-Control: no-store');

echo $bytes;
exit;