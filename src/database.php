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

    // LLM THUMBNAILS: BEGIN coordinate the web requests and background worker.
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    // LLM THUMBNAILS: END coordinate the web requests and background worker.

    /* LLM THUMBNAILS: BEGIN ORIGINAL THINGS SCHEMA
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
            thumbnail TEXT NOT NULL
                CHECK (thumbnail_statis IN ('created, ''skipped)
        )'
    );
    LLM THUMBNAILS: END ORIGINAL THINGS SCHEMA */

    // LLM THUMBNAILS: BEGIN replacement schema and temporary job queue.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS things (
            id INTEGER PRIMARY KEY,
            filename TEXT NOT NULL,
            filekey TEXT NOT NULL UNIQUE,
            room TEXT NOT NULL,
            wall TEXT,
            x TEXT,
            y TEXT,
            width TEXT,
            thumbnail TEXT NOT NULL DEFAULT 'pending'
                CHECK (thumbnail IN ('pending', 'created', 'skipped', 'failed'))
        )"
    );

    /* LLM THUMBNAIL BACKFILL: BEGIN original legacy-schema message.
    $columns = $pdo->query('PRAGMA table_info(things)')->fetchAll();
    if (!in_array('thumbnail', array_column($columns, 'name'), true)) {
        throw new RuntimeException(
            'This database predates thumbnail storage. Use the planned fresh database; existing content was not changed.'
        );
    }
    LLM THUMBNAIL BACKFILL: END original legacy-schema message. */

    // LLM THUMBNAIL BACKFILL: BEGIN explain the available migration.
    $columns = $pdo->query('PRAGMA table_info(things)')->fetchAll();
    if (!in_array('thumbnail', array_column($columns, 'name'), true)) {
        throw new RuntimeException(
            'This database predates thumbnail storage. Back up the data and run testing/migrate-thumbnails.php; existing content was not changed.'
        );
    }
    // LLM THUMBNAIL BACKFILL: END explain the available migration.

    // A job holds the room ID only until processing finishes.
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS thumbnail_jobs (
            thing_id INTEGER PRIMARY KEY,
            room_id TEXT NOT NULL,
            FOREIGN KEY (thing_id) REFERENCES things(id) ON DELETE CASCADE
        )'
    );
    // LLM THUMBNAILS: END replacement schema and temporary job queue.

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