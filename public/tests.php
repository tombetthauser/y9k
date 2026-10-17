<?php

declare(strict_types=1);

// Inspect the existing database without calling application setup or decoding helpers.
$databasePath = dirname(__DIR__) . '/data/development.sqlite';

if (!is_file($databasePath)) {
    http_response_code(404);
    exit('Database not found');
}

// Only explicit POST actions open a writable connection.
$isPost = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
$pdo = new PDO('sqlite:file:' . $databasePath . ($isPost ? '?mode=rw' : '?mode=ro'));
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

// Share reset operations with the terminal scripts; do not execute shell commands.
if ($isPost) {
    require_once __DIR__ . '/../src/tools.php';
    $action = $_POST['action'] ?? null;

    if (!in_array($action, ['reset-holes', 'reset-things', 'reset-logs'], true)) {
        http_response_code(400);
        exit('Unknown reset action');
    }

    try {
        if ($action === 'reset-holes') {
            resetAllHoles($pdo);
            $status = 'holes-reset';
        } elseif ($action === 'reset-things') {
            $result = resetAllThings($pdo);
            $status = $result['failed'] === [] ? 'things-reset' : 'things-partial';
        } else {
            // Clear in place under the same lock used by log writers.
            $resetLog = fopen(dirname(__DIR__) . '/data/log.txt', 'c+');

            if ($resetLog === false) {
                throw new RuntimeException('Could not open log for reset');
            }

            try {
                if (!flock($resetLog, LOCK_EX)) {
                    throw new RuntimeException('Could not lock log for reset');
                }
                if (!ftruncate($resetLog, 0) || !fflush($resetLog)) {
                    throw new RuntimeException('Could not clear log');
                }
            } finally {
                fclose($resetLog);
            }

            // Do not add a reset entry: the requested result is an empty log.
            $status = 'logs-reset';
        }
    } catch (Throwable $error) {
        error_log('Diagnostic reset failed: ' . $error->getMessage());
        $status = 'reset-error';
    }

    // Reload as a GET so browser refresh does not repeat the reset.
    header('Cache-Control: no-store');
    header('Location: /tests.php?status=' . $status, true, 303);
    exit;
}

$messages = [
    'holes-reset' => 'Door overrides reset. Images were unchanged.',
    'things-reset' => 'Image records and their referenced files reset. Door overrides were unchanged.',
    'things-partial' => 'Some files could not be removed. Their records were retained for retry.',
    'logs-reset' => 'Log cleared. Images and door overrides were unchanged.',
    'reset-error' => 'Reset failed. Check the server error log; files already removed cannot be restored automatically.',
];
$status = $_GET['status'] ?? '';
$message = is_string($status) ? ($messages[$status] ?? '') : '';

// Inspect both tables using fixed names and preserve their raw stored values.
$tables = [];

foreach (['things' => 'id', 'holes' => 'room_a, room_b'] as $name => $order) {
    $columns = $pdo->query('PRAGMA table_info(' . $name . ')')->fetchAll();
    $tables[$name] = [
        'columns' => $columns,
        'rows' => $columns === []
            ? []
            : $pdo->query('SELECT * FROM ' . $name . ' ORDER BY ' . $order)->fetchAll(),
    ];
}

// Keep diagnostic responses out of browser caches and search indexes.
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

// Read the raw log while respecting the writer's lock; never create it here.
$logPath = dirname(__DIR__) . '/data/log.txt';
$logContents = '';
$logMessage = 'No log file yet.';

if (is_file($logPath)) {
    $logFile = @fopen($logPath, 'r');

    if ($logFile === false) {
        $logMessage = 'Could not read log file.';
    } else {
        try {
            if (flock($logFile, LOCK_SH)) {
                $contents = stream_get_contents($logFile);
                $logContents = $contents === false ? '' : $contents;
                $logMessage = $contents === false ? 'Could not read log file.' : 'Log is empty.';
            } else {
                $logMessage = 'Could not lock log file for reading.';
            }
        } finally {
            fclose($logFile);
        }
    }
}

// Split log lines into rows and pipe-separated cells without changing the file.
$logRows = [];
$logColumnCount = 1;

if ($logContents !== '') {
    foreach (preg_split('/\r\n|\n|\r/', rtrim($logContents, "\r\n")) as $line) {
        $cells = array_map('trim', explode('|', $line));
        $logRows[] = $cells;
        $logColumnCount = max($logColumnCount, count($cells));
    }
}

?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>y9k — raw database tables</title>
    <style>
        html, body {
            margin: 0;
            background: #000;
            color: #ffb000;
        }
        body {
            padding: 24px;
            font-family: "Courier New", Courier, monospace;
            font-size: 14px;
            line-height: 1.22;
        }
        h1 {
            margin: 0 0 12px;
            font: inherit;
            font-weight: bold;
        }
        .panel {
            margin-bottom: 24px;
        }
        .actions { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
        button {
            font: inherit;
            color: inherit;
            background: transparent;
            border: 1px solid #ffb000;
            padding: 6px 10px;
            cursor: pointer;
        }
        table {
            border-collapse: collapse;
            width: auto;
        }
        th, td {
            border: 1px solid #ffb000;
            padding: 8px 12px;
            text-align: left;
            vertical-align: top;
            white-space: pre;
        }
        th { font-weight: bold; }
        .null { font-style: italic; opacity: 0.65; }
    </style>
</head>
<body>
    <div class="panel" id="log">
        <h1>log.txt contents</h1>
        <?php if ($logRows === []): ?>
            <p><?= htmlspecialchars($logMessage, ENT_QUOTES, 'UTF-8') ?></p>
        <?php else: ?>
            <table aria-label="Log entries">
                <tbody>
                    <?php foreach ($logRows as $index => $cells): ?>
                        <tr>
                            <th scope="row"><?= count($logRows) - $index ?></th>
                            <?php foreach (array_pad($cells, $logColumnCount, '') as $cell): ?>
                                <td><?= htmlspecialchars($cell, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></td>
                            <?php endforeach; ?>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>

    <?php foreach ($tables as $name => $table): ?>
        <?php $columns = $table['columns']; $rows = $table['rows']; ?>
        <div class="panel" id="<?= htmlspecialchars($name, ENT_QUOTES, 'UTF-8') ?>">
            <h1><?= htmlspecialchars($name, ENT_QUOTES, 'UTF-8') ?> — raw database values</h1>
            <?php if ($columns === []): ?>
                <p>Table not found.</p>
            <?php else: ?>
                <p><?= count($rows) ?> row(s). SQL NULL is shown in italics; empty strings remain blank.</p>
                <?php if ($name === 'holes'): ?>
                    <p>Row numbers are display labels, not stored database IDs.</p>
                <?php endif; ?>
                <table>
                    <thead>
                        <tr>
                            <?php if ($name === 'holes'): ?>
                                <th scope="col">row</th>
                            <?php endif; ?>
                            <?php foreach ($columns as $column): ?>
                                <th scope="col"><?= htmlspecialchars($column['name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></th>
                            <?php endforeach; ?>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($rows as $index => $row): ?>
                            <tr>
                                <?php if ($name === 'holes'): ?>
                                    <th scope="row"><?= $index + 1 ?></th>
                                <?php endif; ?>
                                <?php foreach ($columns as $column): ?>
                                    <?php $value = $row[$column['name']]; ?>
                                    <td><?php if ($value === null): ?><span class="null">NULL</span><?php else: ?><?= htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?><?php endif; ?></td>
                                <?php endforeach; ?>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
                <?php if ($rows === []): ?>
                    <p>No rows stored.</p>
                <?php endif; ?>
            <?php endif; ?>
        </div>
    <?php endforeach; ?>

    <div class="panel" id="resets">
        <h1>reset controls</h1>
        <?php if ($message !== ''): ?>
            <p><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p>
        <?php endif; ?>
        <div class="actions">
            <form action="/tests.php" method="post"
                  onsubmit="return window.confirm('Reset all door overrides? Images will be kept.');">
                <input type="hidden" name="action" value="reset-holes">
                <button type="submit">reset holes</button>
            </form>
            <form action="/tests.php" method="post"
                  onsubmit="return window.confirm('Delete all image records and their uploaded files? Doors will be kept.');">
                <input type="hidden" name="action" value="reset-things">
                <button type="submit">reset things</button>
            </form>
            <form action="/tests.php" method="post"
                  onsubmit="return window.confirm('Clear the entire log? Images and doors will be kept.');">
                <input type="hidden" name="action" value="reset-logs">
                <button type="submit">reset logs</button>
            </form>
        </div>
    </div>
</body>
</html>
