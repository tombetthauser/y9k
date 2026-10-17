<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/database.php';
require_once __DIR__ . '/../src/tools.php';

$mimeExtensions = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/gif' => 'gif',
    'image/webp' => 'webp',
];

if (empty($_POST) && empty($_FILES)) {
    die('Upload failed!');
}

$roomId = normalizeRoomId($_POST['room'] ?? '');
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

// $imagesDirectory = __DIR__ . '/images';
$directory = imageStorageDirectory();
$original = basename(str_replace('\\', '/', (string) ($upload['name'] ?? '')));
$original = preg_replace('/[^A-Za-z0-9._-]+/', '-', $original) ?? '';
$original = trim($original, '.-');
$base = pathinfo($original, PATHINFO_FILENAME);
$base = substr($base !== '' ? $base : bin2hex(random_bytes(8)), 0, 80);
$filename = $base . '.' . $extension;

if (
    !is_dir($directory)
    && !mkdir($directory, 0755, true)
    && !is_dir($directory)
) {
    die('Failed to create image directory');
}

$storageKey = bin2hex(random_bytes(16)) . '.foo';
$storedPath = imageStoragePath($storageKey);
$bytes = file_get_contents($tempPath);

if ($bytes === false) {
    die('Failed to read uploaded image');
}

$storedBytes = scrambleImageBytes($bytes, $roomId);

try {
    $written = file_put_contents($storedPath, $storedBytes, LOCK_EX);

    if ($written !== strlen($storedBytes)) {
        throw new RuntimeException('Failed to scramble image');
    }

    $statement = database()->prepare(
        'INSERT INTO things 
            (filename, filekey, room, wall, x, y, width)
        VALUES 
            (:filename, :filekey, :room, :wall, :x, :y, :width)'
    );

    $statement->execute([
        'filename' => scrambleMetadata($filename, $roomId),
        'filekey' => $storageKey,
        'room' => hashRoomId($roomId),
        'wall' => scrambleMetadata($_POST['wall'], $roomId),
        'x' => scrambleMetadata($_POST['x'], $roomId),
        'y' => scrambleMetadata($_POST['y'], $roomId),
        'width' => scrambleMetadata($_POST['width'], $roomId),
    ]);
} catch (Throwable $error) {
    if (is_file($storedPath)) {
        unlink($storedPath);
    }
    throw $error;
}

logChange(
    'ROOM: ' . strtolower($roomId)
    . ' | ADDED: ' . $filename
);

header('Location: text.php?room=' . rawurlencode($roomId), true, 303);
exit;