<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/database.php';
require_once __DIR__ . '/../src/tools.php';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_DIMENSIONS = 8000;

$mimeExtensions = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/gif' => 'gif',
    'image/webp' => 'webp',
];

$roomId = encodeBase36(decodeBase36($_POST['room'] ?? ''));
$upload = $_FILES['image'] ?? null;

if (!is_array($upload) || ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    die('Upload failed!');
}

$tempPath = $upload['tmp_name'];
$mimeType = (new finfo(FILEINFO_MIME_TYPE))->file($tempPath);
$extension = $mimeExtensions[$mimeType] ?? null;
$dimensions = getimagesize($tempPath);

if ($extension === null || $dimensions === false) {
    die('Not a supported image file!');
}

if ($dimensions[0] > MAX_IMAGE_DIMENSIONS || $dimensions[1] > MAX_IMAGE_DIMENSIONS) {
    die('Image height or width too large!');
}

$imagesDirectory = __DIR__ . '/images';
// $storedPath = $imagesDirectory . '/' . bin2hex(random_bytes(16)) . '.' . $extension;
$original = basename(str_replace('\\', '/', (string) ($upload['name'] ?? '')));
$original = preg_replace('/[^A-Za-z0-9._-]+/', '-', $original) ?? '';
$original = trim($original, '.-');
$base = pathinfo($original, PATHINFO_FILENAME);
$base = substr($base !== '' ? $base : bin2hex(random_bytes(8)), 0, 80);
$filename = $base . '.' . $extension;
$storedPath = $imagesDirectory . '/' . $filename;
$suffix = 2;

while (is_file($storedPath)) {
    $filename = $base . '-' . $suffix . '.' . $extension;
    $storedPath = $imagesDirectory . '/' . $filename;
    $suffix++;
}

if (!move_uploaded_file($tempPath, $storedPath)) {
    die('Failed to save image!');
}

if ($upload['size'] > MAX_UPLOAD_BYTES) {
    die('Image is too big!');
}

try {
    $statement = database()->prepare(
        'INSERT INTO media (filename, mime_type, room_id, created_at)
        VALUES (:filename, :mime_type, :room_id, :created_at)'
    );

    $statement->execute([
        'filename' => basename($storedPath),
        'mime_type' => $mimeType,
        'room_id' => $roomId,
        'created_at' => gmdate('c'),
    ]);
} catch (Throwable $error) {
    unlink($storedPath);
    throw $error;
}

header('Location: /' . $roomId, true, 303);
exit;