<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/database.php';

$id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);

if ($id === false || $id === null || $id < 1) {
    http_response_code(404);
    exit;
}

$statement = database()->prepare(
    'SELECT filename FROM things WHERE id = :id'
);

// $filename = basename($image['filename']);

$types = [
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
];

$statement->execute(['id' => $id]);
$image = $statement->fetch();

if ($image === false) {
    http_response_code(404);
    exit;
}

$filename = basename($image['filename']);
$extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION ));
$path = dirname(__DIR__) . '/media/images/' . $filename;

if ($filename !== $image['filename'] || !is_file($path)) {
    http_response_code(404);
    exit;
}

header('Content-Type: ' . ($types[$extension] ?? 'application/octet-stream'));
header('X-Content-Type-Options: nosniff');
header('Content-Length: ' . (string) filesize($path));
readfile($path);