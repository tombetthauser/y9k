<?php

declare(strict_types=1);

const WORLD_SEED = 'v6'; // <-- room 0, tom, erin, alex, cody, daniel, jon all are galleries
const DOOR_PROBABILITY = 0.4; // <-- 0-20 moves to find a room
// const DOOR_PROBABILITY = 0.5; // <-- 5-20 moves to find a room
// const DOOR_PROBABILITY = 0.6; // <-- 20-30 moves to find a room
// const DOOR_PROBABILITY = 0.7; // <-- can barely find a room
// const DOOR_PROBABILITY = 0.8; // <-- can't find a room

function decodeBase36(string $roomId): GMP
{
    if (preg_match('/^[0-9a-zA-Z]+$/', $roomId) !== 1) {
        throw new InvalidArgumentException('Invalid room ID');
    }
    return gmp_init($roomId, 36);
}

function encodeBase36(GMP $index): string
{
    if (gmp_cmp($index, 0) < 0) {
        throw new InvalidArgumentException('Room index cannot be negative');
    }
    return gmp_strval($index, 36);
}

function indexToCoordinate(GMP $index): array
{
    if (gmp_cmp($index, 0) === 0) {
        return [gmp_init(0), gmp_init(0)];
    }

    $sqrt = gmp_sqrt($index);
    $ring = gmp_div_q(gmp_add($sqrt, 1), 2);
    $side = gmp_mul($ring, 2);

    $ringEnd = gmp_sub(
        gmp_pow(gmp_add(gmp_mul($ring, 2), 1), 2),
        1
    );

    $offset = gmp_sub($ringEnd, $index);

    if (gmp_cmp($offset, $side) < 0) {
        return [
            gmp_sub($ring, $offset),
            gmp_neg($ring),
        ];
    }

    if (gmp_cmp($offset, gmp_mul($side, 2)) < 0) {
        return [
            gmp_neg($ring),
            gmp_add(gmp_neg($ring), gmp_sub($offset, $side)),
        ];
    }

    if (gmp_cmp($offset, gmp_mul($side, 3)) < 0) {
        return [
            gmp_add(gmp_neg($ring), gmp_sub($offset, gmp_mul($side, 2))),
            $ring,
        ];
    }

    return [
        $ring,
        gmp_sub($ring, gmp_sub($offset, gmp_mul($side, 3))),
    ];
}

function coordinateToIndex(GMP $x, GMP $y): GMP
{
    $absX = gmp_abs($x);
    $absY = gmp_abs($y);
    $ring = gmp_cmp($absX, $absY) >= 0 ? $absX : $absY;

    if (gmp_cmp($ring, 0) === 0) {
        return gmp_init(0);
    }

    $side = gmp_mul($ring, 2);
    $ringEnd = gmp_sub(gmp_pow(gmp_add($side, 1), 2), 1);
    $negativeRing = gmp_neg($ring);

    if (gmp_cmp($y, $negativeRing) === 0 && gmp_cmp($x, $negativeRing) > 0) {
        return gmp_sub($ringEnd, gmp_sub($ring, $x));
    }

    if (gmp_cmp($x, $negativeRing) === 0 && gmp_cmp($y, $ring) < 0) {
        return gmp_sub($ringEnd, gmp_add($side, gmp_sub($y, $negativeRing)));
    }

    if (gmp_cmp($y, $ring) === 0 && gmp_cmp($x, $ring) < 0) {
        return gmp_sub($ringEnd, gmp_add(gmp_mul($side, 2), gmp_sub($x, $negativeRing)));
    }

    return gmp_sub($ringEnd, gmp_add(gmp_mul($side, 3), gmp_sub($ring, $y)));
}

function getNeighborId(string $roomId, string $direction): string
{
    [$x, $y] = indexToCoordinate(decodeBase36($roomId));

    switch ($direction) {
        case 'north':
            $y = gmp_add($y, 1);
            break;
        
        case 'south':
            $y = gmp_sub($y, 1);
            break;
        
        case 'east':
            $x = gmp_add($x, 1);
            break;
        
        case 'west':
            $x = gmp_sub($x, 1);
            break;

        default:
            throw new InvalidArgumentException('Unknown direction');
    }

    return encodeBase36(coordinateToIndex($x, $y));
}

function spiralDetails(string $roomId): array
{
    $index = decodeBase36($roomId);
    [$x, $y] = indexToCoordinate($index);

    $absX = gmp_abs($x);
    $absY = gmp_abs($y);
    $ring = gmp_cmp($absX, $absY) >= 0 ? $absX : $absY;
    $span = gmp_add(gmp_mul($ring, 2), 1);

    return [
        'base36' => encodeBase36($index),
        'base10' => gmp_strval($index),
        'ring' => gmp_strval($ring),
        'width' => gmp_strval($span),
        'height' => gmp_strval($span),
    ];
}

function formatInt(string $digits): string
{
    return preg_replace('/\B(?=(\d{3})+(?!\d))/', ',', $digits);
}

function edgeHasDoor(string $roomAId, string $roomBId): bool
{
    $edge = strcmp($roomAId, $roomBId) < 0
        ? $roomAId . ':' . $roomBId
        : $roomBId . ':' . $roomAId;

    $hash = hash('sha256', WORLD_SEED . ':' . $edge);
    $value = hexdec(substr($hash, 0, 8)) / 0xFFFFFFFF;

    return $value < DOOR_PROBABILITY;
}

function getRoomDoors(string $roomId, PDO $pdo): array
{
    $roomId = normalizeRoomId($roomId);
    $doors = [];
    foreach (['north', 'east', 'south', 'west'] as $direction) {
        $neighborId = getNeighborId($roomId, $direction);
        $override = getHole($pdo, $roomId, $neighborId);

        $doors[$direction] = [
            'exists' => $override ?? edgeHasDoor($roomId, $neighborId),
            'neighborId' => $neighborId
        ];
    }
    return $doors;
}

function roomLetters(string $map, array $spots, array $images): array
// draws the room again with letters added for images
{
    $lines = explode("\n", $map);
    $groups = [];
    foreach ($spots as $spot) {
        $groups[$spot['letter']] = [];
    }
    $unplaced = [];
    foreach ($images as $image) {
        $spot = null;
        if ($image['wall'] !== null && $image['x'] !== null) {
            $wall = (int) $image['wall'];
            $x = (float) $image['x'];
            foreach ($spots as $currspot) {
                if ($currspot['wall'] !== $wall) continue;
                if ($currspot['xmin'] !== null && $x < $currspot['xmin']) continue;
                if ($currspot['xmax'] !== null && $x >= $currspot['xmax']) continue;
                // if we get this far the current spot contains the current image we're iterating through
                $spot = $currspot;
                break;
            }
        }
        // if no spot is claimed keep it off the ascii map
        if ($spot === null) {
            $unplaced[] = $image;
            continue;
        }
        // store the picture under it's letter and add the letter to the map
        $groups[$spot['letter']][] = $image;
        $lines[$spot['row']][$spot['col']] = $spot['letter'];
    }
    // return the map and the groups and any unplaced images
    return [
        'map' => implode("\n", $lines),
        'groups' => $groups,
        'unplaced' => $unplaced,
    ];
}

function randomRoom(): string
{
    // All random-room entry points share the same pronounceable ID generator.
    return pronounceableId();
}

function pronounceableId(int $minGroups = 2, int $maxGroups = 6): string
{
    // Each group contributes one or two letters to the finished ID.
    $consonants = [
        'b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l',
        'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'z',
        'ch', 'sh', 'th', 'ph', 'wh',
    ];
    $vowels = [
        'a', 'e', 'i', 'o', 'u',
        'ae', 'ai', 'ao', 'au', 'ea', 'ee', 'ei',
        'ie', 'io', 'oa', 'oi', 'oo', 'ou',
    ];

    if ($minGroups < 2 || $maxGroups > 6 || $minGroups > $maxGroups) {
        throw new InvalidArgumentException(
            'Choose a group range between 2 and 6.'
        );
    }

    // Choose the length and give either starting group an equal chance.
    $groupCount = random_int($minGroups, $maxGroups);
    $useConsonant = random_int(0, 1) === 1;
    $id = '';

    for ($i = 0; $i < $groupCount; $i++) {
        $groups = $useConsonant ? $consonants : $vowels;
        $id .= $groups[random_int(0, count($groups) - 1)];

        // Alternate consonants and vowels for the next group.
        $useConsonant = !$useConsonant;
    }

    return $id;
}

function lengthPhrase(int|string|GMP $feet): string
{
    // Keep distances exact even when they exceed PHP's native integer range.
    $feet = gmp_init((string) $feet, 10);
    if (gmp_cmp($feet, 5800) < 0) {
        return formatInt(gmp_strval($feet)) . ' ' . (gmp_cmp($feet, 1) === 0 ? 'foot' : 'feet');
    }
    // Round miles to one decimal place using integer arithmetic throughout.
    $tenths = gmp_div_q(gmp_add(gmp_mul($feet, 10), 2640), 5280);
    if (gmp_cmp($tenths, 10) === 0) return '1 mile';
    return formatInt(gmp_strval(gmp_div_q($tenths, 10)))
        . '.' . gmp_strval(gmp_mod($tenths, 10)) . ' miles';
}

function spiralFeet(string $roomId): array
{
    [$x, $y] = indexToCoordinate(decodeBase36($roomId));
    $north = gmp_sign($y) < 0 ? 'north' : (gmp_sign($y) > 0 ? 'south' : '');
    $east = gmp_sign($x) < 0 ? 'east' : (gmp_sign($x) > 0 ? 'west' : '');
    // Compute the straight-line distance in feet, rounded without floating-point overflow.
    $squared = gmp_mul(gmp_add(gmp_mul($x, $x), gmp_mul($y, $y)), 144);
    [$feet, $remainder] = gmp_sqrtrem($squared);
    if (gmp_cmp($remainder, $feet) > 0) $feet = gmp_add($feet, 1);
    $span = gmp_mul(spiralDetails($roomId)['width'], 12);
    // Preserve native integers for existing callers when the values fit; otherwise return digits.
    return [
        'span' => gmp_cmp($span, PHP_INT_MAX) <= 0 ? gmp_intval($span) : gmp_strval($span),
        'feet' => gmp_cmp($feet, PHP_INT_MAX) <= 0 ? gmp_intval($feet) : gmp_strval($feet),
        'direction' => trim($north . ' ' . $east),
    ];
}

function normalizeRoomId(string $roomId): string
{
    return encodeBase36(decodeBase36($roomId));
}

function hashRoomId(string $roomId): string
{
    return hash('sha256', normalizeRoomId($roomId));
}

function hashRoomEdge(string $roomAId, string $roomBId): array
{
    $roomAHash = hashRoomId($roomAId);
    $roomBHash = hashRoomId($roomBId);
    if (strcmp($roomAHash, $roomBHash) > 0) {
        return [$roomBHash, $roomAHash];
    }   
    return [$roomAHash, $roomBHash];
}

function validateRoomAdjacency(string $roomAId, string $roomBId): void {
    $roomAId = normalizeRoomId($roomAId);
    $roomBId = normalizeRoomId($roomBId);
    foreach (['north', 'east', 'south', 'west'] as $dir) {
        if (getNeighborId($roomAId, $dir) === $roomBId) {
            return;
        }
    }
    throw new InvalidArgumentException('Rooms not adjacent');
}

function getHole( PDO $pdo, string $roomAId, string $roomBId): ?bool {
    [$roomA, $roomB] = hashRoomEdge($roomAId, $roomBId);
    $statement = $pdo->prepare(
        'SELECT is_hole FROM holes
        WHERE room_a = :room_a AND room_b = :room_b'
    );
    $statement->execute([
        'room_a' => $roomA,
        'room_b' => $roomB
    ]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if ($row === false) return null;
    return (int) $row['is_hole'] === 1;
}

function setHole(PDO $pdo, string $roomAId, string $roomBId, bool $isHole) {
    validateRoomAdjacency($roomAId, $roomBId);
    [$roomA, $roomB] = hashRoomEdge($roomAId, $roomBId);
    $statement = $pdo->prepare(
        'INSERT INTO holes (room_a, room_b, is_hole) 
        VALUES (:room_a, :room_b, :is_hole)
        ON CONFLICT (room_a, room_b)
        DO UPDATE SET is_hole = excluded.is_hole'
    );
    $statement->execute([
        'room_a' => $roomA,
        'room_b' => $roomB,
        'is_hole' => $isHole ? 1 : 0,
    ]);
}

function resetHole(PDO $pdo, string $roomAId, string $roomBId) {
    validateRoomAdjacency($roomAId, $roomBId);
    [$roomA, $roomB] = hashRoomEdge($roomAId, $roomBId);
    $statement = $pdo->prepare(
        'DELETE FROM holes
        WHERE room_a = :room_a AND room_b = :room_b'
    );
    $statement->execute([
        'room_a' => $roomA,
        'room_b' => $roomB
    ]);
}

function roomXor(string $bytes, string $roomId): string {
    $key = normalizeRoomId($roomId);
    $keyLength = strlen($key);
    $result = '';

    for ($i = 0, $length = strlen($bytes); $i < $length; $i++) {
        $result .= $bytes[$i] ^ $key[$i % $keyLength];
    }

    return $result;
}

function scrambleMetadata(string|int|float|null $value, string $roomId): ?string 
{
    if ($value === null) {
        return null;
    }

    return base64_encode(roomXor((string) $value, $roomId));
}

function restoreMetadata(?string $stored, string $roomId): ?string 
{
    if ($stored === null) {
        return null;
    }
    // if (!str_starts_with($stored, '')) {
    //     throw new RuntimeException('Unknown metadata format');
    // }
    $bytes = base64_decode($stored, true);
    if ($bytes === false) {
        throw new RuntimeException('Invalid scrambled metadata');
    }
    return roomXor($bytes, $roomId);
}

function restoreImageMetadata(array $image, string $roomId): array
{
    $image['filename'] = restoreMetadata($image['filename'], $roomId);

    foreach (['wall', 'x', 'y', 'width'] as $field) {
        $value = restoreMetadata($image[$field], $roomId);
        $image[$field] = $value === null
            ? null
            : ($field === 'wall' ? (int) $value : (float) $value);
    }

    return $image;
}

function imageStorageDirectory(): string 
{
    return dirname(__DIR__) . '/data/images';
}

function imageStoragePath(string $storageKey): string 
{
    if (preg_match('/^[a-f0-9]{32}\.foo$/', $storageKey) !== 1) {
        throw new RuntimeException('Invalid image storage key');
    }
    return imageStorageDirectory() . '/' . $storageKey;
}

function scrambleImageBytes(string $bytes, string $roomId): string 
{
    return "Y9K-XOR1\n" . roomXor($bytes, $roomId);
}

function restoreImageBytes(string $stored, string $roomId): string 
{
    $header = "Y9K-XOR1\n";
    if (!str_starts_with($stored, $header)) {
        throw new RuntimeException('Unknown stored image format');
    }
    return roomXor(substr($stored, strlen($header)), $roomId);
}

function imageUrl(string $roomId, string $filekey): string 
{
    return '/image.php?r=' . rawurlencode(normalizeRoomId($roomId)) . '&k=' . rawurlencode($filekey);
}

// LLM THUMBNAIL BACKFILL: BEGIN queue old images using the visited room ID.
function queueRoomThumbnails(PDO $pdo, string $roomId): void
{
    $roomId = normalizeRoomId($roomId);
    $roomHash = hashRoomId($roomId);

    // Avoid taking a write lock on ordinary visits when nothing needs a job.
    $find = $pdo->prepare(
        "SELECT 1 FROM things
         WHERE room = :room AND thumbnail = 'pending'
         AND NOT EXISTS (SELECT 1 FROM thumbnail_jobs WHERE thing_id = things.id)
         LIMIT 1"
    );
    $find->execute(['room' => $roomHash]);
    $needsJob = $find->fetchColumn() !== false;
    $find->closeCursor();

    if (!$needsJob) {
        return;
    }

    // Recheck the rows while inserting, so concurrent visits cannot duplicate jobs.
    $queue = $pdo->prepare(
        "INSERT INTO thumbnail_jobs (thing_id, room_id)
         SELECT id, :room_id FROM things
         WHERE room = :room_hash AND thumbnail = 'pending'
         ON CONFLICT(thing_id) DO NOTHING"
    );
    $queue->execute(['room_id' => $roomId, 'room_hash' => $roomHash]);
}
// LLM THUMBNAIL BACKFILL: END queue old images using the visited room ID.

// LLM THUMBNAILS: BEGIN generated thumbnail processing and cleanup helpers.
function thumbnailStoragePath(string $filekey): string
{
    // Reuse the original's strict storage-key validation.
    imageStoragePath($filekey);
    return dirname(__DIR__) . '/data/thumbnails/' . $filekey;
}

function thumbnailUrl(string $roomId, string $filekey): string
{
    return imageUrl($roomId, $filekey) . '&variant=thumbnail';
}

function removeStoredFile(string $path): void
{
    if ((file_exists($path) || is_link($path)) && !@unlink($path)) {
        throw new RuntimeException('Could not remove stored file: ' . basename($path));
    }
}

function removeThingFiles(string $filekey): void
{
    $thumbnail = thumbnailStoragePath($filekey);
    // A deterministic staging name lets deletion and a restarted worker clean up after a crash.
    removeStoredFile($thumbnail . '.tmp');
    removeStoredFile($thumbnail);
    removeStoredFile(imageStoragePath($filekey));
}

function assertThumbnailCapabilities(): void
{
    // Missing GD capabilities are a worker configuration error, not a bad upload.
    if (!extension_loaded('gd') || !function_exists('gd_info')) {
        throw new RuntimeException('Thumbnail worker requires the GD extension');
    }
    $info = gd_info();
    foreach (['GIF Read Support', 'GIF Create Support', 'JPEG Support', 'PNG Support', 'WebP Support'] as $capability) {
        if (empty($info[$capability])) {
            throw new RuntimeException('Missing GD capability: ' . $capability);
        }
    }
    foreach (['imagecreatefromstring', 'imagecreatetruecolor', 'imagecopyresampled', 'imageflip',
        'imagerotate', 'imagegif', 'imagejpeg', 'imagepng', 'imagewebp'] as $function) {
        if (!function_exists($function)) {
            throw new RuntimeException('Missing GD function: ' . $function);
        }
    }
}

function deleteStoredThing(PDO $pdo, int $id, string $roomId): ?string
{
    $roomId = normalizeRoomId($roomId);
    $pdo->exec('BEGIN IMMEDIATE');
    try {
        $find = $pdo->prepare('SELECT filename, filekey FROM things WHERE id = ? AND room = ?');
        $find->execute([$id, hashRoomId($roomId)]);
        $thing = $find->fetch(PDO::FETCH_ASSOC);
        if ($thing === false) {
            $pdo->exec('COMMIT');
            return null;
        }
        $filename = restoreMetadata($thing['filename'], $roomId);
        removeThingFiles($thing['filekey']);
        $pdo->prepare('DELETE FROM thumbnail_jobs WHERE thing_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM things WHERE id = ?')->execute([$id]);
        $pdo->exec('COMMIT');
        return $filename;
    } catch (Throwable $error) {
        $pdo->exec('ROLLBACK');
        throw $error;
    }
}

// LLM THUMBNAILS: BEGIN generated metadata-aware image classification.
function thumbnailImageKind(string $bytes): string
{
    // GIF is always skipped: GD would silently discard any additional frames.
    if (str_starts_with($bytes, 'GIF87a') || str_starts_with($bytes, 'GIF89a')) {
        return 'skip';
    }
    if (str_starts_with($bytes, "\xFF\xD8\xFF")) {
        return 'jpeg';
    }
    if (str_starts_with($bytes, "\x89PNG\r\n\x1a\n")) {
        $offset = 8;
        $length = strlen($bytes);
        while ($offset + 12 <= $length) {
            $size = unpack('N', substr($bytes, $offset, 4))[1];
            if ($size > $length - $offset - 12) {
                throw new RuntimeException('Malformed PNG');
            }
            $chunk = substr($bytes, $offset + 4, 4);
            // Browsers may apply PNG EXIF orientation, which GD does not preserve.
            if (in_array($chunk, ['acTL', 'fcTL', 'fdAT', 'eXIf'], true)) {
                return 'skip';
            }
            $offset += 12 + $size;
            if ($chunk === 'IEND') {
                if ($offset !== $length) {
                    throw new RuntimeException('Unexpected PNG trailing data');
                }
                return 'png';
            }
        }
        throw new RuntimeException('Incomplete PNG');
    }
    if (strlen($bytes) >= 12 && substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP') {
        $length = strlen($bytes);
        if (unpack('V', substr($bytes, 4, 4))[1] !== $length - 8) {
            throw new RuntimeException('Malformed WebP');
        }
        for ($offset = 12; $offset < $length;) {
            if ($offset + 8 > $length) {
                throw new RuntimeException('Incomplete WebP chunk');
            }
            $chunk = substr($bytes, $offset, 4);
            $size = unpack('V', substr($bytes, $offset + 4, 4))[1];
            $padded = $size + ($size % 2);
            if ($padded > $length - $offset - 8) {
                throw new RuntimeException('Malformed WebP chunk');
            }
            // Skip EXIF-bearing WebP as well as any animated WebP.
            if ($chunk === 'ANIM' || $chunk === 'ANMF' || $chunk === 'EXIF'
                || ($chunk === 'VP8X' && $size >= 1 && (ord($bytes[$offset + 8]) & 2))) {
                return 'skip';
            }
            $offset += 8 + $padded;
        }
        return 'webp';
    }
    throw new RuntimeException('Unsupported image format');
}
// LLM THUMBNAILS: END generated metadata-aware image classification.

function thumbnailOrientation(string $bytes): ?int
{
    if (!function_exists('exif_read_data')) {
        return null;
    }
    // A memory stream avoids leaving a readable original on disk.
    $stream = fopen('php://memory', 'w+b');
    if ($stream === false) {
        throw new RuntimeException('Could not open EXIF stream');
    }
    try {
        if (fwrite($stream, $bytes) !== strlen($bytes) || !rewind($stream)) {
            throw new RuntimeException('Could not read EXIF data');
        }
        $exif = @exif_read_data($stream);
        if ($exif === false) {
            return null;
        }
        $orientation = (int) ($exif['Orientation'] ?? 1);
        return $orientation >= 1 && $orientation <= 8 ? $orientation : null;
    } finally {
        fclose($stream);
    }
}

// LLM THUMBNAILS: BEGIN generated concurrency-safe replacements.
function thumbnailWebp(string $bytes, int $orientation = 1): string
{
    $image = @imagecreatefromstring($bytes);
    if ($image === false) {
        throw new RuntimeException('Could not decode image');
    }
    if (in_array($orientation, [2, 4, 5, 7], true) && !imageflip($image, IMG_FLIP_HORIZONTAL)) {
        throw new RuntimeException('Could not flip image');
    }
    $angle = match ($orientation) {
        3, 4 => 180,
        6, 7 => -90,
        5, 8 => 90,
        default => 0,
    };
    if ($angle !== 0) {
        $rotated = imagerotate($image, $angle, 0);
        if ($rotated === false) {
            throw new RuntimeException('Could not rotate image');
        }
        $image = $rotated;
    }
    $width = imagesx($image);
    $height = imagesy($image);
    $scale = min(1, 1024 / max($width, $height));
    $target = imagecreatetruecolor(max(1, (int) round($width * $scale)), max(1, (int) round($height * $scale)));
    if ($target === false) {
        throw new RuntimeException('Could not allocate thumbnail');
    }
    imagealphablending($target, false);
    imagesavealpha($target, true);
    imagefill($target, 0, 0, imagecolorallocatealpha($target, 0, 0, 0, 127));
    if (!imagecopyresampled($target, $image, 0, 0, 0, 0, imagesx($target), imagesy($target), $width, $height)) {
        throw new RuntimeException('Could not resize image');
    }
    $stream = fopen('php://memory', 'w+b');
    if ($stream === false) {
        throw new RuntimeException('Could not open thumbnail stream');
    }
    try {
        if (!imagewebp($target, $stream, 80) || !rewind($stream)) {
            throw new RuntimeException('Could not encode thumbnail');
        }
        $result = stream_get_contents($stream);
        if ($result === false || $result === '') {
            throw new RuntimeException('Could not read thumbnail');
        }
        return $result;
    } finally {
        fclose($stream);
    }
}

function processNextThumbnail(PDO $pdo): bool
{
    assertThumbnailCapabilities();
    // The CLI's process lock serializes workers; expensive image work needs no SQLite write lock.
    $job = $pdo->query(
        'SELECT j.thing_id, j.room_id, t.filekey, t.room, t.thumbnail
         FROM thumbnail_jobs j LEFT JOIN things t ON t.id = j.thing_id
         ORDER BY j.thing_id LIMIT 1'
    )->fetch(PDO::FETCH_ASSOC);
    if ($job === false) {
        return false;
    }

    $id = (int) $job['thing_id'];
    $path = null;
    $output = null;
    $status = null;
    $failure = null;
    if ($job['filekey'] !== null && $job['thumbnail'] === 'pending') {
        try {
            $roomId = normalizeRoomId($job['room_id']);
            if ($roomId !== $job['room_id'] || hashRoomId($roomId) !== $job['room']) {
                throw new RuntimeException('Thumbnail job room mismatch');
            }
            $path = thumbnailStoragePath($job['filekey']);
            $stored = @file_get_contents(imageStoragePath($job['filekey']));
            if ($stored === false) {
                throw new RuntimeException('Could not read original');
            }
            $bytes = restoreImageBytes($stored, $roomId);
            $kind = thumbnailImageKind($bytes);
            $orientation = $kind === 'jpeg' ? thumbnailOrientation($bytes) : 1;
            if ($kind === 'skip' || $orientation === null) {
                $status = 'skipped';
            } else {
                $output = scrambleImageBytes(thumbnailWebp($bytes, $orientation), $roomId);
                $status = 'created';
            }
        } catch (Throwable $error) {
            $status = 'failed';
            $failure = $error;
        }
    }

    // Recheck the exact job under the write lock before touching files or changing rows.
    $pdo->exec('BEGIN IMMEDIATE');
    try {
        $find = $pdo->prepare(
            'SELECT j.thing_id, j.room_id, t.filekey, t.room, t.thumbnail
             FROM thumbnail_jobs j LEFT JOIN things t ON t.id = j.thing_id
             WHERE j.thing_id = ?'
        );
        $find->execute([$id]);
        $current = $find->fetch(PDO::FETCH_ASSOC);
        if ($current !== $job) {
            $pdo->exec('COMMIT');
            return true;
        }

        if ($status !== null) {
            try {
                if ($path !== null) {
                    removeStoredFile($path . '.tmp');
                    if ($status === 'created') {
                        $directory = dirname($path);
                        if (!is_dir($directory) && !@mkdir($directory, 0755, true) && !is_dir($directory)) {
                            throw new RuntimeException('Could not create thumbnail directory');
                        }
                        if (@file_put_contents($path . '.tmp', $output, LOCK_EX) !== strlen($output)
                            || !@rename($path . '.tmp', $path)) {
                            throw new RuntimeException('Could not publish thumbnail');
                        }
                    } else {
                        removeStoredFile($path);
                    }
                }
            } catch (Throwable $error) {
                $status = 'failed';
                $failure = $error;
                if ($path !== null) {
                    try {
                        removeStoredFile($path . '.tmp');
                        removeStoredFile($path);
                    } catch (Throwable $cleanupError) {
                        error_log('Thumbnail cleanup failure for thing ' . $id . ': ' . $cleanupError->getMessage());
                    }
                }
            }
            $pdo->prepare('UPDATE things SET thumbnail = ? WHERE id = ?')->execute([$status, $id]);
        }
        $pdo->prepare('DELETE FROM thumbnail_jobs WHERE thing_id = ?')->execute([$id]);
        $pdo->exec('COMMIT');
    } catch (Throwable $error) {
        $pdo->exec('ROLLBACK');
        throw $error;
    }
    if ($failure !== null) {
        error_log('Thumbnail failure for thing ' . $id . ': ' . $failure->getMessage());
        logChange('THUMBNAIL FAILED -- thing ' . $id . ': ' . $failure->getMessage());
    }
    return true;
}
// LLM THUMBNAILS: END generated concurrency-safe replacements.
// LLM THUMBNAILS: END generated thumbnail processing and cleanup helpers.

function changeRoomDoor(
    PDO $pdo,
    string $roomId,
    string $direction,
    bool $requestedExists
): array {
    $roomId = normalizeRoomId($roomId);
    if (!in_array($direction, ['north', 'east', 'south', 'west'], true)) {
        throw new InvalidArgumentException('Invalid room direction');
    }
    $neighborId = getNeighborId($roomId, $direction);
    $pdo->exec('BEGIN IMMEDIATE');
    try {
        $beforeRoom = getRoomDoors($roomId, $pdo);
        $beforeNeighbor = getRoomDoors($neighborId, $pdo);

        if ($requestedExists && !$beforeRoom[$direction]['exists']) {
            validateDoorOpening(
                $pdo,
                $roomId,
                $neighborId,
                $direction,
                $beforeRoom,
                $beforeNeighbor
            );
        }

        $defaultExists = edgeHasDoor($roomId, $neighborId);
        if ($requestedExists === $defaultExists) {
            resetHole($pdo, $roomId, $neighborId);
        } else {
            setHole($pdo, $roomId, $neighborId, $requestedExists);
        }
        $afterRoom = getRoomDoors($roomId, $pdo);
        $pdo->exec('COMMIT');
        return [
            'neighborId' => $neighborId,
            'beforeRoom' => $beforeRoom,
            'beforeNeighbor' => $beforeNeighbor,
            'afterRoom' => $afterRoom,
            'changed' => $beforeRoom[$direction]['exists'] !== $afterRoom[$direction]['exists'],
        ];
    } catch (Throwable $error) {
        $pdo->exec('ROLLBACK');
        throw $error;
    } 
}

function roomDoorCount(array $doors): int
{
    return count(array_filter(
        $doors,
        fn(array $door): bool => $door['exists']
    ));
}

function roomContainsImages(PDO $pdo, string $roomId): bool 
{
    $statement = $pdo->prepare(
        'SELECT 1 FROM things WHERE room = :room LIMIT 1'
    );
    $statement->execute([
        'room' => hashRoomId($roomId),
    ]);
    return $statement->fetchColumn() !== false;
}

function validateDoorOpening(
    PDO $pdo,
    string $roomId,
    string $neighborId,
    string $direction,
    array $beforeRoom,
    array $beforeNeighbor,
): void {
    if (roomDoorCount($beforeNeighbor) === 1) {
        throw new DomainException(
            'Nope [G.' . strtoupper($neighborId) . ']'
        );
    }
    $opposite = [
        'north' => 'south',
        'east' => 'west',
        'south' => 'north',
        'west' => 'east',
    ];
    $afterRoom = $beforeRoom;
    $afterNeighbor = $beforeNeighbor;

    $afterRoom[$direction]['exists'] = true;
    $afterNeighbor[$opposite[$direction]]['exists'] = true;

    $layouts = [
        $roomId => $afterRoom,
        $neighborId => $afterNeighbor,
    ];

    foreach ([$roomId, $neighborId] as $endpointId) {
        if (
            roomDoorCount($layouts[$endpointId]) > 1
            && roomContainsImages($pdo, $endpointId)
        ) {
            throw new DomainException(
                'Nope. [OG.' . strtoupper($endpointId) . ']'
            );
        }
    }

    $beforeLayouts = [
        $roomId => $beforeRoom,
        $neighborId => $beforeNeighbor
    ];

    foreach ([$roomId, $neighborId] as $endpointId) {
        if (
            roomDoorCount($beforeLayouts[$endpointId]) === 4
            || roomDoorCount($layouts[$endpointId]) !== 4
        ) {
            continue;
        }

        foreach ($layouts[$endpointId] as $door) {
            $adjacentId = $door['neighborId'];
            if (!isset($layouts[$adjacentId])) {
                $layouts[$adjacentId] = getRoomDoors($adjacentId, $pdo);
            }
            if (roomDoorCount($layouts[$adjacentId]) === 4) {
                throw new DomainException(
                    'Nope. [4D2.' . strtoupper($endpointId) . '.' . strtoupper($adjacentId) . ']'
                );
            }
        }
    }

}

function logChange(string $message): void
{
    $file = null;
    try {
        $directory = dirname(__DIR__) . '/data';
        $file = fopen($directory . '/log.txt', 'c+');
        if ($file === false) {
            throw new RuntimeException('Could not open log');
        }
        if (!flock($file, LOCK_EX)) {
            throw new RuntimeException('Could not lock log');
        }
        $existing = stream_get_contents($file);
        if ($existing === false) {
            throw new RuntimeException('Could not read log');
        }
        $message = str_replace(["\r", "\n"], ' ', $message);
        $now = new DateTimeImmutable(
            'now',
            new DateTimeZone('America/Los_Angeles')
        );
        $timestamp = $now->format('l m/d/Y h:ia T');
        $contents = $message . " | " . $timestamp . "\n" . $existing;
        $length = strlen($contents);
        if (!rewind($file)) {
            throw new RuntimeException('Could not rewind log');
        }
        $offset = 0;
        while ($offset < $length) {
            $written = fwrite($file, substr($contents, $offset));
            if ($written === false || $written === 0) {
                throw new RuntimeException('Could not write log');
            }
            $offset += $written;
        }
        if (!ftruncate($file, $length) || !fflush($file)) {
            throw new RuntimeException('Could not finish log');
        }
    } catch (Throwable $error) {
        error_log('Change log failure: ' . $error->getMessage());
    } finally {
        if (is_resource($file)) {
            fclose($file);
        }
    }
}

function doorLayoutLabel(array $doors): string
{
    $label = '';
    foreach (
        [
            'north' => 'n',
            'east' => 'e',
            'south' => 's',
            'west' => 'w',
        ] as $direction => $letter
    ) {
        $label .= $doors[$direction]['exists'] ? $letter : '-';
    }
    return $label;
}

function wallLabel(?int $wall): string
{
    return match ($wall) {
        0 => 'north wall',
        1 => 'east wall',
        2 => 'south wall',
        3 => 'west wall',
        null => 'an unspecified wall',
        default => 'wall ' . $wall,
    };
}

// Share door reset behavior between browser and terminal controls.
function resetAllHoles(PDO $pdo): int
{
    $deleted = $pdo->exec('DELETE FROM holes');
    logChange('HOLES RESET');
    return $deleted;
}

/* LLM THUMBNAILS: BEGIN original resetAllThings section.
// Delete referenced uploaded files and rows, retaining cleanup failures for retry.
function resetAllThings(PDO $pdo): array
{
    $deleted = 0;
    $failed = [];
    $pdo->exec('BEGIN IMMEDIATE');

    try {
        $images = $pdo->query('SELECT id, filekey FROM things')->fetchAll(PDO::FETCH_ASSOC);
        $delete = $pdo->prepare('DELETE FROM things WHERE id = :id');

        foreach ($images as $image) {
            try {
                $path = imageStoragePath($image['filekey']);
                if (file_exists($path) && !unlink($path)) {
                    $failed[] = $image['filekey'];
                    continue;
                }
            } catch (RuntimeException $error) {
                $failed[] = $image['filekey'];
                continue;
            }

            $delete->execute(['id' => $image['id']]);
            $deleted += $delete->rowCount();
        }

        $pdo->exec('COMMIT');
    } catch (Throwable $error) {
        // Rolling back rows cannot restore files already deleted from disk.
        $pdo->exec('ROLLBACK');
        throw $error;
    }

    logChange($failed === []
        ? 'THINGS RESET'
        : 'THINGS RESET PARTIAL -- ' . $deleted . ' removed; '
            . count($failed) . ' retained for retry');

    return ['deleted' => $deleted, 'failed' => $failed];
}
LLM THUMBNAILS: END original resetAllThings section. */

// LLM THUMBNAILS: BEGIN generated resetAllThings replacement.
// Delete referenced uploaded files and rows, retaining cleanup failures for retry.
function resetAllThings(PDO $pdo): array
{
    $deleted = 0;
    $failed = [];
    $pdo->exec('BEGIN IMMEDIATE');

    try {
        $images = $pdo->query('SELECT id, filekey FROM things')->fetchAll(PDO::FETCH_ASSOC);
        $delete = $pdo->prepare('DELETE FROM things WHERE id = :id');
        $deleteJob = $pdo->prepare('DELETE FROM thumbnail_jobs WHERE thing_id = :id');

        foreach ($images as $image) {
            try {
                removeThingFiles($image['filekey']);
            } catch (Throwable $error) {
                $failed[] = $image['filekey'];
                continue;
            }

            $deleteJob->execute(['id' => $image['id']]);
            $delete->execute(['id' => $image['id']]);
            $deleted += $delete->rowCount();
        }
        $pdo->exec('DELETE FROM thumbnail_jobs WHERE NOT EXISTS (SELECT 1 FROM things WHERE things.id = thumbnail_jobs.thing_id)');

        $pdo->exec('COMMIT');
    } catch (Throwable $error) {
        // Rolling back rows cannot restore files already deleted from disk.
        $pdo->exec('ROLLBACK');
        throw $error;
    }

    logChange($failed === []
        ? 'THINGS RESET'
        : 'THINGS RESET PARTIAL -- ' . $deleted . ' removed; '
            . count($failed) . ' retained for retry');

    return ['deleted' => $deleted, 'failed' => $failed];
}
// LLM THUMBNAILS: END generated resetAllThings replacement.
