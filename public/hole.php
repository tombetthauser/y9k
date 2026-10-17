<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/database.php';
require_once __DIR__ . '/../src/tools.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    echo json_encode(['error' => 'POST required']);
    exit;
}

$room = $_POST['room'] ?? null;
$dir = $_POST['direction'] ?? null;
$state = $_POST['is_hole'] ?? null;

if (
    !is_string($room)
    || !in_array($dir, ['north', 'east', 'south', 'west'], true)
    || !in_array($state, ['0', '1'], true)
) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid door request']);
    exit;
}

try {
    $roomId = normalizeRoomId($room);
} catch (InvalidArgumentException $exception) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid room ID']);
    exit;
}

try {
    $change = changeRoomDoor(database(), $roomId, $dir, $state === '1');
} catch (DomainException $error) {
    http_response_code(409);
    echo json_encode(['error' => $error->getMessage()]);
    exit;
} catch (Throwable $error) {
    error_log('Door change failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Could not change door please retry.']);
    exit;
}

if ($change['changed']) {
    $feature = $state === '1' ? 'door' : 'wall';
    logChange(
        'ROOM: ' . strtolower($roomId)
        . ' | CHANGE: ' 
                . strtoupper(doorLayoutLabel($change['beforeRoom']))
        . ' TO: '
        . strtoupper(doorLayoutLabel($change['afterRoom']))
    );
}

echo json_encode(['ok' => true]);
exit;