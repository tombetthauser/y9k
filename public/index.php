<?php

    declare(strict_types=1);

    if (PHP_SAPI === 'cli-server') {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

        // Let the server serve other files, but keep handling requests to this index.
        $requestedFile = realpath(__DIR__ . $path);
        if ($path !== '/' && $requestedFile !== __FILE__ && is_file(__DIR__ . $path)) {
            return false;
        }

        if (preg_match('#^/([0-9a-zA-Z]+)/?$#', $path, $matches) === 1) {
            $_GET['room'] = $matches[1];
        }
    }

    // 3D assets - serve textures and audio for the room helpers
    if (isset($_GET['asset'])) {
        $asset = (string) $_GET['asset'];
        $root = str_starts_with($asset, 'images/')
            ? realpath(__DIR__ . '/assets/rooms')
            : realpath(__DIR__ . '/../docs/3js_example');
        $path = $root === false ? false : realpath($root . '/' . $asset);
        $types = [
            'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
            'gif' => 'image/gif', 'webp' => 'image/webp', 'mp3' => 'audio/mpeg',
            'wav' => 'audio/wav', 'mp4' => 'video/mp4', 'webm' => 'video/webm',
        ];
        $ext = strtolower(pathinfo($asset, PATHINFO_EXTENSION));

        if ($root === false || $path === false || !is_file($path)
            || !isset($types[$ext])
            || !(str_starts_with($path, $root . '/images/') || str_starts_with($path, $root . '/music/'))) {
            http_response_code(404);
            exit('Asset not found');
        }
        header('Content-Type: ' . $types[$ext]);
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: public, max-age=86400');
        readfile($path);
        exit;
    }

    // From old index.php - load the database and application helpers.
    require_once __DIR__ . '/../src/database.php';
    require_once __DIR__ . '/../src/tools.php';

    // Shared room setup - this page also accepts the room ID from editing forms
    $requestId = $_POST['room'] ?? $_GET['room'] ?? '0';
    $roomId = normalizeRoomId($requestId);
    $doors = getRoomDoors($roomId, database());
    $details = spiralDetails($roomId);
    $place = spiralFeet($roomId);

    // Pick the available doorway whose neighboring room is nearest the spiral center.
    $exitWall = null;
    $exitDistance = null;
    foreach ($doors as $wall => $door) {
        if (!$door['exists']) continue;
        [$x, $y] = indexToCoordinate(decodeBase36($door['neighborId']));
        $distance = gmp_add(gmp_mul($x, $x), gmp_mul($y, $y));
        if ($exitDistance === null || gmp_cmp($distance, $exitDistance) < 0) {
            $exitWall = $wall;
            $exitDistance = $distance;
        }
    }

    // Each step along the numbered spiral represents one 12-foot room.
    $progressionFeet = gmp_mul($details['base10'], 12);
    $progressionDistance = lengthPhrase($progressionFeet);
    $roomInfo = $place['feet'] === 0
        ? 'This is the spiral center (room 0).'
        : 'Distance from Spiral Center: ' . lengthPhrase($place['feet']) . ' ' . $place['direction'] . '.'
            . "\nCurrent Spiral Ring Number: " . formatInt($details['ring']) . '.'
            . "\nCurrent Spiral Width: " . lengthPhrase($place['span'])
            . ' (' . formatInt($details['width']) . ' rooms).' . "\n"
            . 'Standard Room Size: 12x12 feet';
    $roomInfo = 'Number in Spiral Progression (base-10): ' . formatInt($details['base10']) . "\n"
        . "Number in Spiral Progression (base-36): " . strtoupper($roomId) . "\n"
        . 'Length of Spiral Progression: ' . $progressionDistance . "\n" . $roomInfo . "\n";

    // These lines appear only when opening details from an exit sign.
    $exitNotice = "*NOT AN EXIT\n"
        . 'Exit Sign Facing Spiral Center: ' . ($exitWall ?? 'none') . "\n";
    $roomInfo = $roomInfo . "\n*doors do not follow spiral progression\n"
        . "*system version 1.9\n";

    // From old index.php - identify the door layout and count its doors
    $key = ($doors['north']['exists'] ? 'd' : '-')
        . ($doors['east']['exists'] ? 'd' : '-')
        . ($doors['south']['exists'] ? 'd' : '-')
        . ($doors['west']['exists'] ? 'd' : '-');

    $doorsCount = substr_count($key, 'd');
    $gallery = $doorsCount < 2;

    // Temporary room-to-computer assignments. Add another room ID and document URL here.
    // Placement and lighting are defined in helpers.js; database tracking can replace this map later.
    $roomComputers = [
        '0' => [
            'documentUrl' => 'https://docs.google.com/document/d/e/2PACX-1vS-NhUvNixeN_CbjA1c63Ukkwsz79cPiG48FbtImX9ZHTSywKDDJErJOwXP-vY_BJdD674UGCR4zHfs/pub?embedded=true',
        ],
    ];
    $computer = $roomComputers[$roomId] ?? null;
    if ($computer !== null) {
        // Refresh the component, styles, and media together when any of them changes.
        $computer['assetVersion'] = max(array_map('filemtime', array_merge(
            [__DIR__ . '/helpers.js'],
            glob(__DIR__ . '/assets/rooms/models/computer-*.png'),
            glob(__DIR__ . '/assets/rooms/audio/computer-*.wav')
        )));
    }

    $showRoomNumbers = false; // Set true to restore room IDs in the page and on doors.

    // Room navigation uses clean URLs; form submissions still use the PHP endpoint.
    $roomBase = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php')), '/') . '/';
    $url = 'index.php?room=' . rawurlencode($roomId);

    // Render sharing metadata on the server so SMS previews do not need JavaScript.
    $roomTitle = ($gallery ? 'Gallery ' : 'Room ') . strtoupper($roomId);
    $zalgoTitle = 'ḧ̴̜̙̏̈́́͋́́͆͝t̵̛̪͇̺̰͕̱̑̀̀͗̏̍t̷͔͋̕p̵̼͗͗ş̶̮̝̻̝͎̉̔̽͆͂̿͒̕ͅͅ:̴̖̟͆̒̾͑̋́̽̀͛͐/̵͕̲͇̳͗̐̽̊͌̈́͆̕͠/̴̧̪̙͑̑̽͘y̸̛̫̬̩̙̝̞̳̬̋̅̆̄̓̊̏͌͠9̸̨̥̣̥͉̜̖̗̩̺̓̀́̃͌̋͘͘͠k̸̡͔̟̜͕͇͋̂̉̓̌̃͌͂̕.̸̡̗̝̤͈̺̽̆͆̋̄͛͒̔x̸̢̛͔̦̼͍̲͇̮̤͙̔̾̌̍͑̃͗͝y̴̢̪͉͎̲͎̽͛͋̉̑̂͜z̴̼̈̈́/̸̡̥͉̅̀̽̏̈̋̇͋̚͝';
    $previewTitle = '[' . $roomTitle . '] ' . $zalgoTitle;
    $previewDescription = 'A̵̩͍̩̺͗̒̎͝ͅͅn̷̠̙̻̥̻͈͙̅͗͛̎ͅ ̵̥̭͈͓̮̼͎̄͂́͛̐̇̾͝ī̵̡̬̱͕̞̦̈́́̇͋̊͊̆̿̚n̵̼̳̻͍̏̀͐f̴̙̰̀́̾̾͛̓̀̓̿ĩ̷̧̳̯͕̗̪͖̰͜n̵̛͇̥̻̉̇̒̑͛̕i̶̢̧̦̲͖̫͙̐̊͌́̅̕t̸̜͇̄̍̑͑̍ͅe̴̮͌̌ ̸̡̱͙̜̭͍̓̋̈̔͊͝g̸͎̤̩̯̺̈́̋r̴͖̐̔͐̽̾į̵̫̦̟͚̗̺̖̩̄̈͆̋̉̂̇͊ḑ̴̢̥̜̥̘̼̼̓̏̓̽̓̋ ̶̹̖͙̃o̷̧̙̍̄͗͗͐̆̑̾̈͘f̶̗̌̑̒̓̆̑̈́̽̐͘ ̸̛̤̹̯̖̬͙̦͂͗̀́̒̿̈́́r̵̞͉̠̳͎̣̫̲̟͝ͅo̸̢͎̜̼̝̦̠͎͖̾͜ȯ̷̧̰͉̫͖̩̼̙̦͌̾͊̀m̷̢̢͈̱̭͌̂͗́͌͐͗͆ś̸͙͖̰̲̲̒̌̔͛.̴̡̙̤̥͔̱͙̏̆͌̃̅̌̍̽';

    // Respect HTTPS forwarded by the deployment's reverse proxy as well as direct HTTPS.
    $scheme = (($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off')
        || strtolower(trim(explode(',', $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')[0])) === 'https'
        ? 'https' : 'http';
    $origin = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $previewUrl = $origin . $roomBase . rawurlencode($roomId);
    $previewImage = $origin . $roomBase . 'assets/rooms/images/thumb-2.jpg';

    // 3D editing, handle uploads, placement changes and deletions on this page
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $action = (string) ($_POST['action'] ?? '');
        $res = ['ok' => true];

        // Diagnostics describe the request without exposing server paths or stack traces.
        $upload = $_FILES['image'] ?? null;
        $diagnostics = [
            'upload_max_filesize' => ini_get('upload_max_filesize'),
            'post_max_size' => ini_get('post_max_size'),
            'request_bytes' => $_SERVER['CONTENT_LENGTH'] ?? 'unknown',
            'php_upload_error' => is_array($upload) ? ($upload['error'] ?? UPLOAD_ERR_NO_FILE) : 'no file received',
        ];
        if (is_array($upload)) {
            $diagnostics['received_file_bytes'] = $upload['size'] ?? 'unknown';
            $diagnostics['reported_file_type'] = $upload['type'] ?? 'unknown';
        }

        try {
            // PHP clears form fields and files when the entire request exceeds post_max_size.
            $postLimit = trim((string) ini_get('post_max_size'));
            $unit = strtolower(substr($postLimit, -1));
            $postLimitBytes = (float) $postLimit * match ($unit) {
                'g' => 1073741824, 'm' => 1048576, 'k' => 1024, default => 1,
            };
            if ($postLimitBytes > 0 && (float) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $postLimitBytes) {
                throw new RuntimeException('The request exceeds the server post_max_size limit.');
            }

            // Placement metadata uses the same cm fields as the text interface
            if ($action === 'upload' || $action === 'move') {
                // Hallways store perimeter segment numbers in the existing wall field.
                $activeWalls = array_keys(array_filter($doors, static fn(array $door): bool => !empty($door['exists'])));
                $opposite = count($activeWalls) === 2 && (
                    (in_array('north', $activeWalls, true) && in_array('south', $activeWalls, true)) ||
                    (in_array('east', $activeWalls, true) && in_array('west', $activeWalls, true))
                );
                $wallCount = $gallery ? 4 : (count($activeWalls) === 4 ? 12 : (count($activeWalls) === 3 ? 8 : ($opposite ? 4 : 6)));

                $pos = [];
                foreach (['wall', 'x', 'y', 'width'] as $col) {
                    $val = $_POST[$col] ?? null;
                    if (!is_numeric($val) || !is_finite((float) $val)) {
                        throw new RuntimeException('Missing placement: ' . $col);
                    }
                    $pos[$col] = (string) $val;
                }

                if (!ctype_digit($pos['wall']) || (int) $pos['wall'] >= $wallCount || (float) $pos['width'] <= 0) {
                    throw new RuntimeException('Choose a wall and a positive image width.');
                }

                $meta = array_map(static fn(string $val): string => scrambleMetadata($val, $roomId), $pos);
            }

            // Upload uses the existing file storage and metadata scrambling helpers
            if ($action === 'upload') {
                $upload = $_FILES['image'] ?? null;

                $uploadError = is_array($upload) ? ($upload['error'] ?? UPLOAD_ERR_NO_FILE) : UPLOAD_ERR_NO_FILE;
                if ($uploadError !== UPLOAD_ERR_OK) {
                    $reason = match ($uploadError) {
                        UPLOAD_ERR_INI_SIZE => 'The file exceeds the server upload_max_filesize limit.',
                        UPLOAD_ERR_FORM_SIZE => 'The file exceeds the form upload size limit.',
                        UPLOAD_ERR_PARTIAL => 'Only part of the file was received. Retry the upload.',
                        UPLOAD_ERR_NO_FILE => 'The server received no image file.',
                        UPLOAD_ERR_NO_TMP_DIR => 'The server upload temporary directory is unavailable.',
                        UPLOAD_ERR_CANT_WRITE => 'The server could not write the uploaded file to disk.',
                        UPLOAD_ERR_EXTENSION => 'A PHP extension stopped the upload.',
                        default => 'Unknown PHP upload error.',
                    };
                    throw new RuntimeException($reason);
                }

                $tmp = $upload['tmp_name'];
                $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
                $exts = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
                $diagnostics['detected_file_type'] = $mime ?: 'unknown';
                $ext = $exts[$mime] ?? null;

                if ($ext === null || getimagesize($tmp) === false) {
                    throw new RuntimeException('The image could not be accepted. Supported formats: JPEG, PNG, GIF, WebP. HEIC/HEIF is not supported.');
                }

                $original = basename(str_replace('\\', '/', (string) ($upload['name'] ?? '')));
                $original = trim(preg_replace('/[^A-Za-z0-9._-]+/', '-', $original) ?? '', '.-');
                $base = pathinfo($original, PATHINFO_FILENAME);
                $name = substr($base !== '' ? $base : bin2hex(random_bytes(8)), 0, 80) . '.' . $ext;
                if (!$gallery && ($ext !== 'png' || preg_match('/^(POSTIT(?:YELLOW|PINK|BLUE|GREEN|ORANGE)|COLLEGERULE|LEGALPAD|CLIPBOARD)__/', $name) !== 1)) {
                    throw new RuntimeException('Hallways accept paper text notes only.');
                }
                $dir = imageStorageDirectory();

                if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
                    throw new RuntimeException('Could not create image directory.');
                }

                $key = bin2hex(random_bytes(16)) . '.foo';
                $path = imageStoragePath($key);
                $bytes = file_get_contents($tmp);

                if ($bytes === false) {
                    throw new RuntimeException('Could not read uploaded image.');
                }

                $stored = scrambleImageBytes($bytes, $roomId);

                try {
                    if (file_put_contents($path, $stored, LOCK_EX) !== strlen($stored)) {
                        throw new RuntimeException('Could not store image.');
                    }

                    $statement = database()->prepare('INSERT INTO things (filename, filekey, room, wall, x, y, width) VALUES (:filename, :filekey, :room, :wall, :x, :y, :width)');
                    $args = ['filename' => scrambleMetadata($name, $roomId), 'filekey' => $key, 'room' => hashRoomId($roomId)];
                    $statement->execute($args + $meta);
                } catch (Throwable $error) {
                    if (is_file($path)) {
                        unlink($path);
                    }
                    throw $error;
                }

                $res += ['id' => (int) database()->lastInsertId(), 'filename' => $name, 'url' => imageUrl($roomId, $key)];

                logChange('ROOM: ' . $roomId . ' | ADDED: ' . $name);
            } elseif ($action === 'move' || $action === 'delete') {
                $id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);

                if ($id === false || $id === null || $id < 1) {
                    throw new RuntimeException('Choose an existing image.');
                }

                // Changes stay scoped to the current room
                $find = database()->prepare('SELECT id, filename, filekey FROM things WHERE id = :id AND room = :room');
                $where = ['id' => $id, 'room' => hashRoomId($roomId)];
                $find->execute($where);
                $image = $find->fetch();

                if ($image === false) {
                    throw new RuntimeException('Image not found in this room.');
                }

                $name = restoreMetadata($image['filename'], $roomId);

                if ($action === 'move') {
                    $statement = database()->prepare('UPDATE things SET wall = :wall, x = :x, y = :y, width = :width WHERE id = :id AND room = :room');
                    $args = $where;
                    $statement->execute($args + $meta);

                    logChange('ROOM: ' . $roomId . ' | MOVED: ' . $name);
                } else {
                    $path = imageStoragePath($image['filekey']);

                    if (is_file($path) && !unlink($path)) {
                        throw new RuntimeException('Could not remove image file.');
                    }

                    $statement = database()->prepare('DELETE FROM things WHERE id = :id AND room = :room');
                    $statement->execute($where);

                    logChange('ROOM: ' . $roomId . ' | DELETED: ' . $name);
                }
            } else {
                throw new RuntimeException('Unknown room action.');
            }
        } catch (Throwable $error) {
            http_response_code(400);
            error_log('Room edit failed: ' . $error);
            $message = $error instanceof RuntimeException && !$error instanceof PDOException
                ? $error->getMessage() : 'The server could not process this change. Check the server error log.';
            $res = ['ok' => false, 'error' => $message, 'diagnostics' => $diagnostics];
        }

        // Form returns to this page - JS requests receive JSON
        if (!str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') && $res['ok']) {
            header('Location: ' . $url, true, 303);
            exit;
        }
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($res, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }

    // Shared image lookup - keep the 3D page's existing image order
    $statement = database()->prepare(
        'SELECT id, filename, filekey, wall, x, y, width
        FROM things
        WHERE room = :room
        ORDER BY id'
    );

    $statement->execute(['room' => hashRoomId($roomId)]);
    $images = [];

    foreach ($statement->fetchAll() as $image) {
        // The 3D view also needs a texture URL - stored file keys stay out of the page data
        $image = restoreImageMetadata($image, $roomId);
        $image['url'] = imageUrl($roomId, $image['filekey']);
        unset($image['filekey']);
        $images[] = $image;
    }

    // 3D door appearance - determine whether each neighboring room is a gallery
    foreach ($doors as &$door) {
        $next = $door['exists'] ? getRoomDoors($door['neighborId'], database()) : [];
        $door['destinationIsGallery'] = $door['exists']
            && count(array_filter($next, static fn(array $neighborDoor): bool => $neighborDoor['exists'])) < 2;
    }

    unset($door);
?>
<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <title><?= htmlspecialchars('Y9K [' . $roomTitle . ']', ENT_QUOTES, 'UTF-8') ?></title>
        <meta name="description" content="<?= htmlspecialchars($previewDescription, ENT_QUOTES, 'UTF-8') ?>">
        <meta property="og:type" content="website">
        <meta property="og:url" content="<?= htmlspecialchars($previewUrl, ENT_QUOTES, 'UTF-8') ?>">
        <meta property="og:title" content="<?= htmlspecialchars($previewTitle, ENT_QUOTES, 'UTF-8') ?>">
        <meta property="og:description" content="<?= htmlspecialchars($previewDescription, ENT_QUOTES, 'UTF-8') ?>">
        <meta property="og:image" content="<?= htmlspecialchars($previewImage, ENT_QUOTES, 'UTF-8') ?>">
        <meta property="og:image:width" content="605">
        <meta property="og:image:height" content="397">
        <meta property="og:image:alt" content="Gallery and hallway preview">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="<?= htmlspecialchars($previewTitle, ENT_QUOTES, 'UTF-8') ?>">
        <meta name="twitter:description" content="<?= htmlspecialchars($previewDescription, ENT_QUOTES, 'UTF-8') ?>">
        <meta name="twitter:image" content="<?= htmlspecialchars($previewImage, ENT_QUOTES, 'UTF-8') ?>">
        <!-- 3D viewport and fallback navigation styling. -->
        <style>
            /* Artwork upload/edit panel: adjust its appearance here. */
            .wall-image-editor {
                position: fixed;
                inset: auto auto 0 0;
                margin: 0;
                padding: 1em;
                border: none;
                background: yellow;
                color: black;
                font-family: serif;
                font-size: 13px;
                line-height: 15px;
            }
            /* Static text-image controls: scoped to the existing artwork editor. */
            #wall-image-editor { max-height: 85vh; overflow-y: auto; max-width: min(430px, calc(100vw - 2em)); }
            #wall-image-editor [hidden] { display: none !important; }
            #wall-image-editor [data-note-controls] { margin: 10px 0; border: 1px solid black; }
            #wall-image-editor [data-note-controls] label { display: flex; flex-wrap: wrap; margin: 6px 0; }
            #wall-image-editor [data-note-controls] textarea { display: block; box-sizing: border-box; width: 100%; min-height: 110px; margin: 8px 0; resize: vertical; }
            #wall-image-editor [data-note-controls] select { max-width: 100%; }
            #wall-image-editor .note-preview-label { margin-top: 10px; }
            #wall-image-editor [data-note-preview] {
                box-sizing: border-box; width: 100%; margin: 4px auto 0; padding: 20px;
                background: white;
            }
            #wall-image-editor [data-note-preview] canvas {
                display: block; width: 75%; height: auto; margin: 0 auto;
            }
            #wall-image-editor [data-note-controls] p { max-width: 340px; line-height: 1.4; }
            .wall-image-editor label {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            .wall-image-editor input,
            .wall-image-editor select,
            .wall-image-editor button {
                font: inherit;
            }
            .wall-image-editor input[type="file"] {
                margin-bottom: 12px;
            }
            .wall-image-editor [data-url] {
                color: blue;
                text-decoration: underline;
                overflow-wrap: anywhere;
            }
            .wall-image-editor .modal-label {
                text-decoration: underline;
            }
            .wall-editor-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }
            .wall-editor-filename {
                min-width: 0;
                font-size: 16px;
                color: purple;
                text-decoration: underline;
                overflow-wrap: anywhere;
            }
            .wall-editor-actions {
                margin-top: 12px;
            }
            .wall-image-editor button[name="close"] {
                font-size: 13px;
                font-weight: normal;
                flex-shrink: 0;
            }
            /* Temporarily hide the old controls while the replacement interface is built. */
            #room-navigation,
            #dev-toggle,
            #music-toggle,
            #room-editor,
            #wall-click-hud,
            #dev-wall-upload-panel,
            #lightbox-delete {
                display: none !important;
            }
            html, body {
                font: 14px monospace;
                background: #111;
                color: white;
                margin: 0;
            }
            #stage {
                position: relative;
                height: 100vh;
                width: 100vw;
            }
            #room-navigation {
                max-width: min(330px, 85vw);
                background: #111d;
                position: absolute;
                max-height: 45vh;
                overflow: auto;
                padding: 8px;
                bottom: 62px;
                left: 12px;
                z-index: 11;
            }
            #room-navigation button {
                cursor: pointer;
            }
            #room-navigation a {
                color: #ffcf73;
            }
            #room-navigation p {
                margin: 6px 0;
            }
            #room-image-status:empty {
                display: none;
            }
            /* Black cover used during optional door zoom transitions. */
            .door-transition {
                position: absolute;
                inset: 0;
                z-index: 10000;
                background: black;
                opacity: 0;
                pointer-events: auto;
                touch-action: none;
            }
            /* Display one compass sprite frame at twice its original pixel size. */
            .room-compass {
                /* Adjust these three values to resize or reposition the compass. */
                --compass-size: 32px;
                --compass-left: 12px;
                --compass-bottom: 12px;

                position: absolute;
                left: max(var(--compass-left), env(safe-area-inset-left));
                bottom: max(var(--compass-bottom), env(safe-area-inset-bottom));
                width: var(--compass-size);
                height: var(--compass-size);
                z-index: 10001; /* Stay visible above the transition fade. */
                opacity: 0.65;
                background-size: 100% 3200%;
                background-repeat: no-repeat;
                image-rendering: pixelated;
                padding: 0;
                border: 0;
                background-color: transparent;
                cursor: pointer;
                pointer-events: auto;
                user-select: none;
            }
            /* Decorative room overlay; gestures pass through to the canvas. */
            .room-brand {
                position: absolute;
                top: 0;
                left: 25px;
                z-index: 1;
                margin: 1rem 0;
                width: fit-content;
                color: #000;
                /* color: #fff; */
                font-family: "Times New Roman", serif;
                font-size: 32px;
                font-weight: 100;
                text-shadow: 5px 5px 0 #00000066,
                    10px 10px 0 #00000033,
                    15px 15px 0 #00000011;
                /* text-shadow: 5px 5px 0 #ffffff66,
                    10px 10px 0 #ffffff33,
                    15px 15px 0 #ffffff11; */
                /* background-color: blue; */
                pointer-events: none;
                user-select: none;
                -webkit-user-select: none;
            }
        </style>
    </head>
    <body>
        <div id="stage">
            <h1 class="room-brand" aria-label="Y9K" hidden>h̵͔͠t̵̲̓̆ț̶̀͠p̵̯̘̈́s̴̲̙̅͋:̶̮͗̄/̸̰̅/̸̻̻́y̸̢͓͒9̷̳̔ǩ̷̹́.̸̜̀̽x̶͖̅y̵̘̪͂͠z̸͙͚̕/̵̧̽̅</h1>
            <script>
                (() => {
                    const brand = document.querySelector('.room-brand');
                    const key = 'y9k-brand-shown-at';
                    const interval = 30 * 60 * 1000;
                    const now = Date.now();
                    // Remember the display time across room changes and page reloads.
                    try {
                        const last = Number(localStorage.getItem(key));
                        if (last > 0 && now - last < interval) return;
                        localStorage.setItem(key, String(now));
                    } catch {
                        // Still show the overlay if browser storage is unavailable.
                    }
                    brand.hidden = false;
                    // Hold for three seconds, fade for twelve, then remove it from display.
                    const fade = brand.animate([{ opacity: 1 }, { opacity: 0 }], {
                        delay: 3000, duration: 12000, easing: 'ease-in-out', fill: 'forwards',
                    });
                    fade.finished.then(() => { brand.hidden = true; });
                })();
            </script>
            <!-- Shared room links/details - with 3D controls and image fallback links -->
            <details id="room-navigation">
                <summary><?php if ($showRoomNumbers): ?>Room <?= htmlspecialchars(strtoupper($roomId), ENT_QUOTES, 'UTF-8') ?> · <?php endif; ?><?= $gallery ? 'gallery' : 'hallway' ?></summary>
                <p>Drag or use ←/→ to rotate. Press ↑ or click a door to travel. Click pictures to view them. The gear enables artwork editing.</p>
                <?php foreach ($doors as $dir => $door): ?>
                    <?php if (!$door['exists']) continue; ?>
                    <p><a data-travel-direction="<?= $dir ?>" href="<?= htmlspecialchars($roomBase . rawurlencode($door['neighborId']), ENT_QUOTES, 'UTF-8') ?>">Go <?= $dir ?></a></p>
                <?php endforeach; ?>
                <?php if ($gallery): ?>
                    <p><a href="<?= htmlspecialchars($roomBase . rawurlencode(randomRoom()), ENT_QUOTES, 'UTF-8') ?>">Random room</a></p>
                <?php endif; ?>
                <p><a href="text.php?room=<?= rawurlencode($roomId) ?>">Text interface</a></p>
                <?php if ($showRoomNumbers): ?>
                    <p>Room <?= formatInt($details['base10']) ?> · ring <?= formatInt($details['ring']) ?></p>
                <?php endif; ?>

                <!-- Shared image links/deletion fields - unplaced gallery images can also be positioned. -->
                <div id="room-images">
                    <?php foreach ($images as $image): ?>
                        <p><a href="<?= htmlspecialchars($image['url'], ENT_QUOTES, 'UTF-8') ?>" target="_blank" rel="noopener"><?= htmlspecialchars(preg_match('/^(POSTIT(?:YELLOW|PINK|BLUE|GREEN|ORANGE)|WALLTEXT|COLLEGERULE|LEGALPAD|CLIPBOARD)__|^text-(?:post-it-|wall\.png|legal-pad|college-rule|clipboard)/i', $image['filename']) ? 'Text note' : $image['filename'], ENT_QUOTES, 'UTF-8') ?></a></p>
                        <?php if ($gallery && ($image['wall'] === null || $image['x'] === null || $image['y'] === null || $image['width'] === null)): ?>
                            <button type="button" data-place-image="<?= (int) $image['id'] ?>">Choose placement</button>
                        <?php endif; ?>

                        <form data-delete-image="<?= (int) $image['id'] ?>" action="<?= htmlspecialchars($url, ENT_QUOTES, 'UTF-8') ?>" method="post">
                            <input type="hidden" name="room" value="<?= htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8') ?>">
                            <input type="hidden" name="id" value="<?= (int) $image['id'] ?>">
                            <button name="action" value="delete">Delete this image</button>
                        </form>
                    <?php endforeach; ?>
                </div>
                <p id="room-image-status" role="status"></p>
            </details>
            <noscript>JavaScript is needed for the 3D room. Use the room navigation and image links.</noscript>
        </div>
        <script type="module">
            // 3D setup - pass the room data to the reusable room helpers
            // A changed helper file gets a fresh URL so mobile browsers cannot reuse stale code.
            import { GALLERY_LIGHTING_DEFAULTS, createRoom, createRoomStorage, writeStoredViewFacing, roomAsset, addComputer, addSkyLighting, wallTextKind } from <?= json_encode(
                './helpers.js?v=' . max(filemtime(__DIR__ . '/helpers.js'), $computer['assetVersion'] ?? 0),
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            ) ?>;


            const data = <?= json_encode(
                [
                    'id' => $roomId,
                    'computer' => $computer,
                    'gallery' => $gallery,
                    'doors' => $doors,
                    'images' => $images,
                    'exitWall' => $exitWall,
                    'roomInfo' => $roomInfo,
                    'exitNotice' => $exitNotice,
                    // Include all neighbors, even walls without doors, using PHP's precise room arithmetic.
                    'neighbors' => array_map(static fn(string $dir): string => getNeighborId($roomId, $dir), ['north', 'east', 'south', 'west'])
                ],
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE
            ) ?>;

            const list = document.getElementById('room-images');
            const status = document.getElementById('room-image-status');
            const url = 'index.php?room=' + encodeURIComponent(data.id);

            // Keep the fallback links and forms synchronized without rebuilding the room.
            const renderImages = () => {
                const items = document.createDocumentFragment();
                data.images.forEach(image => {
                    const p = document.createElement('p');
                    const link = document.createElement('a');
                    link.href = image.url;
                    link.target = '_blank';
                    link.rel = 'noopener';
                    link.textContent = wallTextKind(image.filename) ? 'Text note' : image.filename;
                    p.appendChild(link);
                    items.appendChild(p);

                    if (data.gallery && ['wall', 'x', 'y', 'width'].some(key => image[key] === null)) {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.dataset.placeImage = image.id;
                        button.textContent = 'Choose placement';
                        items.appendChild(button);
                    }

                    const form = document.createElement('form');
                    form.action = url;
                    form.method = 'post';
                    form.dataset.deleteImage = image.id;
                    Object.entries({ room: data.id, id: image.id }).forEach(([name, value]) => {
                        const input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = name;
                        input.value = value;
                        form.appendChild(input);
                    });
                    const button = document.createElement('button');
                    button.name = 'action';
                    button.value = 'delete';
                    button.textContent = 'Delete this image';
                    form.appendChild(button);
                    items.appendChild(form);
                });
                list.replaceChildren(items);
            };

            const storage = createRoomStorage(data.id, {
                onChange: ({ action, image }) => {
                    const id = String(image.id);
                    if (action === 'delete') {
                        data.images = data.images.filter(item => String(item.id) !== id);
                    } else if (action === 'upload') {
                        data.images.push(image);
                    } else {
                        const item = data.images.find(item => String(item.id) === id);
                        if (item) Object.assign(item, image);
                    }
                    status.textContent = '';
                    renderImages();
                },
            });
            const room = createRoom(data, {
                persistence: storage,
                hallwayUploads: true, // Wall-segment uploads; no transparent wall-text option in hallways.
                wallTextEnabled: true, // Static paper notes and wall text; false restores image-only creation.
                rememberLights: true, // Per-browser room lighting and last-visit history.
                deferSkylightRender: true, // Reveal only after the correct time-of-day preset is applied.
                gallerySkylight: true, // Enable skylights; false restores solid ceilings in every gallery.
                skylightChance: 35, // Percentage of galleries with skylights: 0–100; stable for each room ID.
                skylightSeed: 'y9k-skylights-v7', // Change this to reshuffle which galleries have skylights.
                ...GALLERY_LIGHTING_DEFAULTS,
                ...(data.gallery ? { ambientLight: 2.7, directionalLight: 0.55 } : {}),

                skylightWind: roomAsset('audio/birds.mp3'), // The wind checkbox uses this track only in skylight rooms.
                temporaryVolumeSliders: true, // Temporary live volume controls in room modals; false hides them.
                // Audio volumes: 0 is silent; 1 is full volume. Saved checkboxes still control playback.
                windVolume: 0.25, // Regular wind in rooms without a skylight.
                skylightWindVolume: 0.12, // Combined birds/wind track in skylight galleries.
                backgroundMusicVolume: 0.45, // Planetarium music.
                lightBuzzVolume: 0.07, // Electric light humming.
                lightSwitchVolume: 0.22, // Light switch clicks.
                lightboxSfxVolume: 0.17, // Artwork opening / page sound.
                doorLockedVolume: 1, // Locked door sound, if used.
                doorUnlockedVolume: 1, // Legacy door sound, if used.

                skylightTreeLift: 82, // Raise the trees by this many inches to show more through the opening.
                skylightTreeWidth: 32, // Tree enclosure width in feet; null scales with gallery width.
                skylightTreeHeight: 15, // Tree enclosure height in feet; null scales with gallery height.
                skylightTreeDepth: 36, // Tree enclosure depth in feet; null scales with gallery length.
                skylightTreeRepeatX: 1, // Horizontal texture repeats on each enclosure wall.
                skylightTreeRepeatY: 2, // Vertical texture repeats; lower values make the trees taller.
                stepSound: roomAsset('audio/step-1-hall.wav?v=3'), // Step sound file inside public/assets/rooms/audio/; null disables it.
                stepVolume: 0.8, // Footstep volume from 0 (silent) to 1 (full volume).
                rotationStepDegrees: 15, // Play a footstep per this many degrees turned; 0 disables rotation steps.
                rotationStepMinInterval: null, // null caps rotation steps to the walking cadence; or set milliseconds.
                doorOpenSound: roomAsset('audio/door-open-soft.WAV'), // Plays halfway through the exit fade, overlapping footsteps.
                doorOpenVolume: 0.85, // Opening sound volume (0–1); independent of the closing sound.
                doorOpenFadeProgress: 0.5, // Position within the fade-out: 0 = start, 0.5 = halfway, 1 = end.
                doorCloseSound: roomAsset('audio/door-close-1.mp3'), // Plays after arriving from an adjacent room.
                doorSfxVolume: 0.35, // Door closing volume; opening and footsteps have their own controls above.
                doorTransition: true, // Set false to restore immediate door travel after its sound.
                doorTransitionMode: 'walk', // 'smooth' restores the previous zoom; 'walk' adds walking steps.
                doorTransitionSteps: 4, // Number of strides during each exit/arrival zoom.
                doorTransitionBob: 0.4, // Vertical bob in inches; set 0 to disable bobbing.
                roomEntryTransition: true, // Fade/zoom in only after moving from a different adjacent room.
                doorTransitionDuration: 2000, // Zoom/fade time in milliseconds.
                doorTransitionPan: true, // Center the clicked door before starting the zoom/fade.
                doorTransitionPanSpeed: 25, // Degrees per second; smaller turns take less time. Lower is slower.
                doorTransitionPanMinDuration: 1200, // Minimum pan time in milliseconds, keeping short turns gentle.
                doorTransitionPanThreshold: 3, // Skip panning when the door is within this many degrees of center.
                doorTransitionZoom: 1.30, // Magnification: 1 disables zoom; 1.30 is a 30% zoom.
                roomEntryZoom: 1.6, // Wider arrival view; higher starts more zoomed out. 1 disables entry zoom.
                doorTransitionFadeStart: 0.45, // Begin fading 45% through the transition; 0 fades immediately.
                hallwayBrightness: 0.8, // 1 = original lighting; lower values darken hallways only.
                hallwayLightBoost: 1.5, // Point-light brightness control; galleries remain much brighter.
                hallwayLightRange: 5, // Point-light reach in scene units; lower values darken distant corners.
                hallwayAmbientLight: 0.06, // Soft on-state fill; 0 restores point lights only.
                hallwayLightColor: 0xfff0de, // Warm amber tint for hallway lighting and fixtures.
                hallwayFixtureBrightness: 0.45, // Ceiling fixture appearance; 1 restores the original glow.
                hallwayLightFlicker: true, // Use the gallery flicker sequence when hallway lights turn on.
                showRoomNumbers: <?= json_encode($showRoomNumbers) ?>,
                distinctGalleryDoors: false, // Set true to restore the lighter gallery-door texture and styling.
            });

            // Keep fallback navigation facing the same way as travel through a 3D door
            document.querySelectorAll('[data-travel-direction]').forEach(link => {
                link.addEventListener('click', e => {
                    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                        writeStoredViewFacing(link.dataset.travelDirection);
                    }
                });
            });
            // Render the room, then connect placement buttons for images without saved positions
            try {
                await room.mount('#stage');
                window.room = room;
                let computer = null;
                if (data.computer) {
                    // Normal mode uses fixed defaults and the document assigned to this room.
                    // A missing computer asset must not disable the gallery's image controls.
                    computer = await addComputer(room, { ...data.computer, skyProfiles: true, shadowMolding: true }).catch(error => console.error('Computer could not load:', error));
                }

                if (!room.hallway && room.options.gallerySkylight) {
                    await addSkyLighting(room, { computer });
                    // No daytime frame is drawn while the selected sky and lighting load.
                    room.app.startLoop();
                }

                // Delegation also covers controls added after an upload or placement update.
                list.addEventListener('click', async e => {
                    const button = e.target.closest('[data-place-image]');
                    if (!button || button.disabled) return;
                    button.disabled = true;
                    status.textContent = '';
                    try {
                        const image = data.images.find(image => String(image.id) === button.dataset.placeImage);
                        await room.placeImage(image);
                    } catch (error) {
                        status.textContent = error.message;
                    } finally {
                        button.disabled = false;
                    }
                });
                list.addEventListener('submit', async e => {
                    const form = e.target.closest('[data-delete-image]');
                    if (!form) return;
                    e.preventDefault();
                    const button = form.querySelector('button');
                    if (button.disabled) return;
                    button.disabled = true;
                    status.textContent = '';
                    try {
                        const id = form.dataset.deleteImage;
                        // Finish any pending texture load so a just-deleted upload cannot appear afterward.
                        await room.ready.catch(() => { });
                        // Hallway/unplaced images have links but may not have a mesh to remove.
                        if (room.images.has(id)) await room.deleteImage(id);
                        else await storage.delete({ id });
                    } catch (error) {
                        status.textContent = error.message;
                    } finally {
                        button.disabled = false;
                    }
                });
            } catch (error) {
                const message = document.createElement('p');

                message.id = 'room-library-error';
                message.textContent = 'The 3D room could not load: ' + error.message + '. Room and image links remain in the navigation menu.';
                document.getElementById('stage').appendChild(message);

                console.error(error);
            }
</script>
    </body>
</html>
