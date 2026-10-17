<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/database.php';
require_once __DIR__ . '/../src/tools.php';

$roomId = normalizeRoomId($_POST['room'] ?? '');
$id = filter_input(INPUT_POST, 'id', FILTER_VALIDATE_INT);

if ($id === false || $id === null || $id < 1) {
    header('Location: text.php?room=' . rawurlencode($roomId), true, 303);
    exit;
}

$statement = database()->prepare(
    'SELECT filename, filekey, wall FROM things WHERE id = :id AND room = :room'
);

$statement->execute([
    'id' => $id,
    'room' => hashRoomId($roomId),
]);

$image = $statement->fetch();

if ($image !== false) {
    $filename = restoreMetadata($image['filename'], $roomId);
    $decodedWall = restoreMetadata($image['wall'], $roomId);
    $wall = $decodedWall === null ? null : (int) $decodedWall;
    $path = imageStoragePath($image['filekey']);

    if (is_file($path)) {
        if (!unlink($path)) {
            http_response_code(500);
            exit('Failed to remove image file');
        }
    }

    $delete = database()->prepare(
        'DELETE FROM things WHERE id = :id AND room = :room'
    );

    $delete->execute([
        'id' => $id,
        'room' => hashRoomId($roomId),
    ]);

    if ($delete->rowCount() > 0) {
        logChange(
            'ROOM: ' . strtolower($roomId)
            . ' | DELETED: ' . $filename
        );
    }
}

header('Location: text.php?room=' . rawurlencode($roomId), true, 303);
exit;