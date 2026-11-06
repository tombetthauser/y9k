<?php

// LLM THUMBNAIL BACKFILL: BEGIN one-time schema migration.
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Run this script from the terminal.\n");
}

$path = dirname(__DIR__) . '/data/development.sqlite';
if (!is_file($path)) {
    fwrite(STDERR, "Database not found: $path\n");
    exit(1);
}

try {
    // mode=rw refuses to create a database if the expected one is missing.
    $pdo = new PDO('sqlite:file:' . $path . '?mode=rw');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->beginTransaction();

    $columns = $pdo->query('PRAGMA table_info(things)')->fetchAll(PDO::FETCH_ASSOC);
    $names = array_column($columns, 'name');
    $expected = ['id', 'filename', 'filekey', 'room', 'wall', 'x', 'y', 'width'];
    sort($names);
    sort($expected);
    if ($names !== $expected) {
        throw new RuntimeException('Unexpected things schema or migration already applied; no changes made.');
    }

    $queue = $pdo->query(
        "SELECT COUNT(*) FROM sqlite_master WHERE name = 'thumbnail_jobs'"
    )->fetchColumn();
    if ((int) $queue !== 0) {
        throw new RuntimeException('thumbnail_jobs already exists; no changes made.');
    }

    // Existing images remain untouched until their room supplies the room ID.
    $pdo->exec(
        "ALTER TABLE things ADD COLUMN thumbnail TEXT NOT NULL DEFAULT 'pending'
         CHECK (thumbnail IN ('pending', 'created', 'skipped', 'failed'))"
    );
    $pdo->exec(
        'CREATE TABLE thumbnail_jobs (
            thing_id INTEGER PRIMARY KEY,
            room_id TEXT NOT NULL,
            FOREIGN KEY (thing_id) REFERENCES things(id) ON DELETE CASCADE
        )'
    );
    $count = (int) $pdo->query('SELECT COUNT(*) FROM things')->fetchColumn();
    $pdo->commit();
    echo "Migration complete. Existing images marked pending: $count\n";
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'Migration failed: ' . $error->getMessage() . "\n");
    exit(1);
}
// LLM THUMBNAIL BACKFILL: END one-time schema migration.
