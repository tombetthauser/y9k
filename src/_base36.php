<?php

declare(strict_types=1);

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