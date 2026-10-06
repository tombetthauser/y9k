<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/database.php';
require_once __DIR__ . '/../src/tools.php';
$maps = require_once __DIR__ . '/../src/maps.php';

// This sets server behavior up if running with php rather than apache
// This is for local development, apache is needed for running deployed server
// php server is quick but cant scale to multiple requests
if (PHP_SAPI === 'cli-server') {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

    if ($path !== '/' && is_file(__DIR__ . $path)) {
        return false;
    }

    if (preg_match('#^/([0-9a-zA-Z]+)/?$#', $path, $matches) === 1) {
        $_GET['room'] = $matches[1];
    }
}

$requestId = $_GET['room'] ?? '0';
$roomId = encodeBase36(decodeBase36($requestId));
$doors = getRoomDoors($roomId);

$key = ($doors['north']['exists'] ? 'd' : '-')
    . ($doors['east']['exists'] ? 'd' : '-')
    . ($doors['south']['exists'] ? 'd' : '-')
    . ($doors['west']['exists'] ? 'd' : '-');

$doorsCount = substr_count($key, 'd');

$statement = database()->prepare(
    'SELECT id, filename FROM things WHERE room = :room ORDER BY id DESC'
);

$statement->execute(['room' => $roomId]);
$images = $statement->fetchAll();

?>
<doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>y9k</title>
</head>
<style>
        html, body {
            min-height: 100%;
            background: #000;
            color: #ffb000;
            margin: 0;
        }
        body {
            font-family: "Courier New", Courier, serif;
            border: 1px dashed #ffb000;
            margin: 100px auto;
            padding: 20px 30px;
            line-height: 1.22;
            font-size: 14px;
            max-width: 500px;
            display: block;
        }
        a, #formlink, button {
            font: inherit;
            text-decoration: none;
            color: #ffb000;
            background: none;
            border: 0;
            padding: 0;
            cursor: pointer;
        }
        a:hover, #formlink:hover, button:hover {
            text-decoration: underline;
        }
        img {
            width: 150px;
            filter: sepia(1) saturate(10);
            display: block;
            border: 1px dotted #ffb000;
            margin-bottom: 0px;
            /* box-shadow: 5px 5px 0 #ffb000; */
        }
</style>
<body>
    Room <?= strtoupper($roomId) ?>

    <pre><?= $maps[$key]['map'] ?></pre>
    <p><?= $maps[$key]['text'] ?></p>

    <?= ($doorsCount < 2) ? 'This is a gallery.' : 'This is not a gallery.' ?>

    <p>
        You can...
    </p>

    <p>

        <?php if ($doorsCount < 2): ?>
            <form action="upload.php" method="post" enctype="multipart/form-data">
                <input type="hidden" name="room" value="<?= htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8') ?>">
                <input type="hidden" name="wall" value="0">
                <input type="hidden" name="x" value="0">
                <input type="hidden" name="y" value="23">
                <input type="hidden" name="width" value="90">
                <label>
                    <!-- --&gt; <a href="#">add an image</a> -->
                    --&gt; <span id="formlink">add an image</span>
                    <input type="file" name="image" accept="image/*" required hidden onchange="this.form.submit()">
                </label>
            </form>

            <br>
        <?php endif; ?>

        <?php if ($doors['north']['exists']): ?>
            --&gt; <a id="north" href="/<?= $doors['north']['neighborId'] ?>">go north</a>
            <br>
        <?php endif; ?>

        <?php if ($doors['east']['exists']): ?>
            --&gt; <a id="east" href="/<?= $doors['east']['neighborId'] ?>">go east</a>
            <br>
        <?php endif; ?>

        <?php if ($doors['west']['exists']): ?>
            --&gt; <a id="west" href="/<?= $doors['west']['neighborId'] ?>">go west</a>
            <br>
        <?php endif; ?>

        <?php if ($doors['south']['exists']): ?>
            --&gt; <a id="south" href="/<?= $doors['south']['neighborId'] ?>">go south</a>
            <br>
        <?php endif; ?>
    </p>

    <?php foreach ($images as $image): ?>
        <p>
            <img
                src="/images/<?= htmlspecialchars($image['filename'], ENT_QUOTES, 'UTF-8') ?>"
                alt="<?= $image['filename'] ?> broken"
            >
            <form action="delete.php" method="post">
                <input type="hidden" name="room" value="<?= htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8') ?>">
                <input type="hidden" name="id" value="<?= (int) $image['id'] ?>">
                ^ <button type="submit">delete image</button>
            </form>
        </p>
    <?php endforeach; ?>
        
</body>
<script>
    document.addEventListener('keydown', e => {
            const dirs = {
                ArrowDown: 'south',
                ArrowRight: 'east',
                ArrowLeft: 'west',
                ArrowUp: 'north',
            };

            const dir = dirs[e.key];
            if (!dir) return;

            const link = document.getElementById(dir);
            if (!link) return;

            e.preventDefault();
            window.location.href = link.href;
    });
</script>
</html>