<?php

declare(strict_types=1);

function database(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dataDirectory = dirname(__DIR__) . '/data';

    if (!is_dir($dataDirectory) && !mkdir($dataDirectory, 0755, true) && !is_dir($dataDirectory)) {
        throw new RuntimeException('Failed to create data directory');
    }

    $pdo = new PDO('sqlite:' . $dataDirectory . '/development.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS things (
            id INTEGER PRIMARY KEY,
            filename TEXT NOT NULL,
            filekey TEXT NOT NULL UNIQUE,
            room TEXT NOT NULL,
            wall TEXT,
            x TEXT,
            y TEXT,
            width TEXT
        )'
    );

    $pdo->exec(
        'CREATE INDEX IF NOT EXISTS things_room ON things (room)'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS holes (
            room_a TEXT NOT NULL,
            room_b TEXT NOT NULL,
            is_hole INTEGER NOT NULL CHECK (is_hole IN (0, 1)),
            PRIMARY KEY (room_a, room_b),
            CHECK (room_a < room_b)
        )'
    );

    return $pdo;
}