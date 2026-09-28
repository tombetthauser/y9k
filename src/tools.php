<?php

declare(strict_types=1);

const WORLD_SEED = 'v1';
const DOOR_PROBABILITY = 0.3504888163;

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

function getRoomDoors(string $roomId): array
{
    $doors = [];

    foreach (['north', 'east', 'south', 'west'] as $direction) {
        $neighborId = getNeighborId($roomId, $direction);

        $doors[$direction] = [
            'exists' => edgeHasDoor($roomId, $neighborId),
            'neighborId' => $neighborId,
        ];
    }

    return $doors;
}