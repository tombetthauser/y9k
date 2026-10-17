<?php

declare(strict_types=1);

require_once __DIR__ . '/src/tools.php';

$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$pdo->exec(
    'CREATE TABLE holes (
        room_a TEXT NOT NULL,
        room_b TEXT NOT NULL,
        is_hole INTEGER NOT NULL CHECK (is_hole IN (0, 1)),
        PRIMARY KEY (room_a, room_b),
        CHECK (room_a < room_b)
    )'
);

function check(string $name, bool $passed): void
{
    echo ($passed ? 'PASS' : 'FAIL') . ': ' . $name . PHP_EOL;

    if (!$passed) {
        exit(1);
    }
}

$room = 'tom';
$neighbor = getNeighborId($room, 'east');

check(
    'no override initially',
    getHole($pdo, $room, $neighbor) === null
);

check(
    'procedural fallback',
    getRoomDoors($room, $pdo)['east']['exists']
        === edgeHasDoor($room, $neighbor)
);

setHole($pdo, '000TOM', strtoupper($neighbor), true);

check(
    'forced open',
    getRoomDoors($room, $pdo)['east']['exists'] === true
);

check(
    'neighbor agrees',
    getRoomDoors($neighbor, $pdo)['west']['exists'] === true
);

setHole($pdo, $neighbor, $room, false);

check(
    'forced closed from either endpoint',
    getRoomDoors($room, $pdo)['east']['exists'] === false
        && getRoomDoors($neighbor, $pdo)['west']['exists'] === false
);

check(
    'one row per edge',
    (int) $pdo->query('SELECT COUNT(*) FROM holes')->fetchColumn() === 1
);

resetHole($pdo, $room, $neighbor);

check(
    'reset removes override',
    getHole($pdo, $room, $neighbor) === null
);

check(
    'reset restores procedural behavior',
    getRoomDoors($room, $pdo)['east']['exists']
        === edgeHasDoor($room, $neighbor)
);

$rejected = false;

try {
    setHole($pdo, $room, $room, true);
} catch (InvalidArgumentException $exception) {
    $rejected = true;
}

check('nonadjacent endpoints rejected', $rejected);