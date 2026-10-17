<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/database.php';
require_once __DIR__ . '/../src/tools.php';

$room = $_GET['r'] ?? '';
$filekey = $_GET['k'] ?? '';

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

$statement = database()->prepare(
    'SELECT filename, filekey FROM things
    WHERE filekey = :filekey AND room = :room'
);

$statement->execute([
    'filekey' => $filekey,
    'room' => hashRoomId($roomId),
]);

$image = $statement->fetch();

if ($image === false) {
    http_response_code(404);
    exit('404');
}

$path = imageStoragePath($image['filekey']);

if (!is_file($path)) {
    http_response_code(404);
    exit('404');
}

$stored = file_get_contents($path);

if ($stored === false) {
    http_response_code(500);
    exit('500');
}

try {
    $bytes = restoreImageBytes($stored, $roomId);
} catch (RuntimeException $error) {
    http_response_code(500);
    exit('500');
}

$mimeType = (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);

if (!in_array(
    $mimeType,
    ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    true
)) {
    http_response_code(500);
    exit('500');
}

$filename = restoreMetadata($image['filename'], $roomId);

logChange(
    'ROOM: ' . strtolower($roomId)
    . ' | VIEWED: ' . $filename
);

header('Content-Type: ' . $mimeType);
header('Content-Length: ' . strlen($bytes));
header('X-Content-Type-Options: nosniff');;
header('Cache-Control: no-store');

echo $bytes;
exit;