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

// Remove overrides while leaving image records and files untouched.
$deleted = resetAllHoles($pdo);

echo "Removed $deleted hole overrides. Things were unchanged.\n";