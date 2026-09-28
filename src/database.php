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
        'CREATE TABLE IF NOT EXISTS media (
            id INTEGER PRIMARY KEY,
            filename TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            room_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        )'
    );

    $pdo->exec(
        "CREATE INDEX IF NOT EXISTS media_room_id ON media (room_id)"
    );

    return $pdo;
}