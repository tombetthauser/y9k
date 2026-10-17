<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/tools.php';

// Include filenames, numeric placement, empty text, and missing placement.
$values = [
    'cat9000.jpg',
    'café.jpg',
    '',
    0,
    -12.5,
    23,
    90,
    null,
];

$checks = 0;

// Test room zero and equivalent spellings of another room.
foreach (['0', 'tom', '000TOM'] as $room) {
    foreach ($values as $value) {
        $stored = scrambleMetadata($value, $room);
        $restored = restoreMetadata($stored, normalizeRoomId($room));

        // Numbers return as text; null must remain null.
        $expected = $value === null ? null : (string) $value;

        if ($restored !== $expected) {
            throw new RuntimeException('Metadata round trip failed');
        }

        $checks++;
    }
}

// Equivalent room names must produce identical stored values.
if (
    scrambleMetadata('cat9000.jpg', 'tom')
    !== scrambleMetadata('cat9000.jpg', '000TOM')
) {
    throw new RuntimeException('Room normalization failed');
}

$checks++;

// Check that arbitrary binary bytes can also be restored exactly.
$original = "\x00\xFFGIF89a\x80";
$restored = roomXor(roomXor($original, 'tom'), 'TOM');

if ($restored !== $original) {
    throw new RuntimeException('Binary round trip failed');
}

$checks++;

echo "PASS: all $checks cipher checks.\n";