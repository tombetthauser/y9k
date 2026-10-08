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
$details = spiralDetails($roomId);
$widthPhrase = formatInt($details['width']) . ' ' . 'room(s)';
$ringPhrase = formatInt($details['ring']) . ' ' . 'spiral ring(s)';
$place = spiralFeet($roomId);

$key = ($doors['north']['exists'] ? 'd' : '-')
    . ($doors['east']['exists'] ? 'd' : '-')
    . ($doors['south']['exists'] ? 'd' : '-')
    . ($doors['west']['exists'] ? 'd' : '-');

$doorsCount = substr_count($key, 'd');

$statement = database()->prepare(
    'SELECT id, filename, wall, x FROM things WHERE room = :room ORDER BY id DESC'
);

$statement->execute(['room' => $roomId]);
$images = $statement->fetchAll();
$imageCount = count($images);

$placed = roomLetters(
    $maps[$key]['map'],
    $maps[$key]['spots'] ?? [],
    $images
);

$nextSpot = null;

foreach ($maps[$key]['spots'] ?? [] as $spot) {
    if ($placed['groups'][$spot['letter']] === []) {
        $nextSpot = $spot;
        break;
    }
}

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
            padding: 20px 30px 30px 30px;
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
        button.delete {
            font-size: 11px;
        }
        form {
            margin: 0;
        }
        input[type="file"] {
            display: none;
        }
        .underline:hover {
            cursor: pointer;
            text-decoration: underline;
        }
</style>
<body>
    Room <?= strtoupper($roomId) ?>

    <br>
    <br>

    <!-- <pre><?= $maps[$key]['map'] ?></pre> -->
    <pre><?= $placed['map'] ?></pre>
    <br>

    <p><?= $maps[$key]['text'] ?></p>


    <p><?= ($doorsCount < 2) ? 'This is a gallery.' : 'This is not a gallery.' ?></p>

    <?php if ($imageCount > 0): ?>
        <br>
        <p>
            There are <?= $imageCount ?> image(s) present...
        </p>
    <?php endif; ?>


    <?php foreach ($placed['groups'] as $letter => $group): ?>
        <?php if ($group === []) continue; ?>
        <!-- <p><?= $letter ?></p> -->
        <?php foreach ($group as $image): ?>
            <p>
                <?= $letter ?>: <a href="/images/<?= htmlspecialchars($image['filename'], ENT_QUOTES, 'UTF-8') ?>"><?= $image['filename'] ?></a> 
                (<button class="delete" type="submit" form="delete-<?= (int) $image['id'] ?>">delete</button>)
                <!-- <img
                    src="/images/<?= htmlspecialchars($image['filename'], ENT_QUOTES, 'UTF-8') ?>"
                    alt="<?= $image['filename'] ?> broken"
                > -->
                <form id="delete-<?= (int) $image['id'] ?>" action="delete.php" method="post">
                    <input type="hidden" name="room" value="<?= htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8') ?>">
                    <input type="hidden" name="id" value="<?= (int) $image['id'] ?>">
                    <!-- <button style="display: inline;" type="submit">delete image</button> -->
                </form>
            </p>
        <?php endforeach; ?>
    <?php endforeach; ?>

    <!-- <?php foreach ($placed['unplaced'] as $image): ?>
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
    <?php endforeach; ?> -->

    <br>

    <p>
        You can...
    </p>

    <?php if ($doorsCount < 2 && $nextSpot !== null): ?>
        <form action="upload.php" method="post" enctype="multipart/form-data">
            <input type="hidden" name="room" value="<?= htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8') ?>">
            <input type="hidden" name="wall" value="<?= $nextSpot['wall'] ?>">
            <input type="hidden" name="x" value="<?= $nextSpot['x'] ?>">
            <input type="hidden" name="y" value="<?= $nextSpot['y'] ?>">
            <input type="hidden" name="width" value="90">
            <label>
                <!-- --&gt; <a href="#">add an image</a> -->
                --&gt; <span id="formlink">add an image</span>
                <input type="file" name="image" accept="image/*" required hidden onchange="this.form.submit()">
            </label>
        </form>
    <?php endif; ?>

    <?php if ($doors['north']['exists']): ?>
        <div class="option">
            --&gt; <a id="north" href="/<?= $doors['north']['neighborId'] ?>">go north</a>
        </div>
    <?php endif; ?>

    <?php if ($doors['east']['exists']): ?>
        <div class="option">
            --&gt; <a id="east" href="/<?= $doors['east']['neighborId'] ?>">go east</a>
        </div>
    <?php endif; ?>

    <?php if ($doors['west']['exists']): ?>
        <div class="option">
            --&gt; <a id="west" href="/<?= $doors['west']['neighborId'] ?>">go west</a>
        </div>
    <?php endif; ?>

    <?php if ($doors['south']['exists']): ?>
        <div class="option">
            --&gt; <a id="south" href="/<?= $doors['south']['neighborId'] ?>">go south</a>
        </div>
    <?php endif; ?>

    <?php if ($doorsCount < 2): ?>
        <div class="option">
            --&gt; <a href="/<?= randomRoom() ?>">go to a random room</a>
        </div>
    <?php endif; ?>

    <br>

    <details>
        <summary>
            <span class="underline">room details</span>...
        </summary>
        <p>
            This is room number <?= formatInt($details['base10']) ?>.
            In base-36 this is room "<?= htmlspecialchars(strtoupper($details['base36']), ENT_QUOTES, 'UTF-8') ?>"
            which is used as the room name / identifier.
        </p>
        <p>
            This individual identifier acts as a singular coordinate system replacement for a traditional x / y coordinate system.
        </p>
        <p>
            This singular base-36 coordinate system exists to accomodate a minimal routing pattern, allowing users to type anything they want with normal alphanumeric characters to access a room whose shape, contents and position in the larger map is persistant.
        </p>
        <p>
            To make this singular coordinate system a viable replacement for an x/y coordinate system room numbers progress in a spiral pattern starting from an origin / center point of room "0" and radiating out indefinitely in a clockwise pattern starting by moving east and then south from the origin and continuing in that pattern to wrap around itself with the height and width of each successive spiral ring increasing with each progressive loop.
        </p>
        <p>
            The doors between these rooms do not follow the spiral. They are deterministically rendered based on the two connecting room names. Rooms and hallways form non-connective pockets and there are many gallery rooms with no doors filling space between connected sets that can only be accessed directly with the room identifier.
        </p>
        <p>
            Each gallery is meant to represent a 12 x 12 foot room with a 10 foot ceiling with each hallway also filling a 12 x 12 foot space. These sizes are arbitrary but a standard width is necessary to represent space just as in a traditional x / y grid map.
        </p>
        <!-- <p>At this location the height and width of the spiral is <?= $widthPhrase ?>. This room is <?= $ringPhrase ?> away from the center room (room 0).</p> -->
        <p>
            <?php if ($place['feet'] === 0): ?>
                This is the center room.
            <?php else: ?>
                At this location the spiral is <?= lengthPhrase($place['span']) ?>
                (<?= formatInt($details['width']) ?> rooms) wide.
                The center room is <?= lengthPhrase($place['feet']) ?>
                to the <?= $place['direction'] ?> of the current room,
                which is <?= formatInt($details['ring']) ?> spiral ring(s) away from room 0.
            <?php endif; ?>
        </p>
    </details>
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