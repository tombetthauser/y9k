<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/database.php';
require_once __DIR__ . '/../src/tools.php';

$roomId = encodeBase36(decodeBase36($_POST['room'] ?? ''));
$id = filter_input(INPUT_POST, 'id', FILTER_VALIDATE_INT);

if ($id === false || $id === null || $id < 1) {
    header('Location: /' . $roomId, true, 303);
}

$statement = database()->prepare(
    'SELECT filename FROM things WHERE id = :id AND room = :room'
);

$statement->execute([
    'id' => $id,
    'room' => $roomId,
]);

$image = $statement->fetch();

if ($image !== false) {
    $filename = basename($image['filename']);
    $path = __DIR__ . '/images/' . $filename;

    if ($filename === $image['filename'] && is_file($path)) {
        unlink($path);
    }

    $delete = database()->prepare(
        'DELETE FROM things WHERE id = :id AND room = :room'
    );

    $delete->execute([
        'id' => $id,
        'room' => $roomId,
    ]);
}

header('Location: /' . $roomId, true, 303);
exit;