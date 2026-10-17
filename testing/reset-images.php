<?php

declare(strict_types=1);

// Keep this maintenance command terminal-only.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Run from the terminal.');
}

require_once __DIR__ . '/../src/database.php';
require_once __DIR__ . '/../src/tools.php';

$pdo = database();

// Use the same cleanup and logging as the browser reset.
$result = resetAllThings($pdo);
echo 'Removed ' . $result['deleted'] . " image records and their files. Holes were unchanged.\n";

if ($result['failed'] !== []) {
    echo count($result['failed']) . " records were retained because file cleanup failed.\n";
    exit(1);
}
