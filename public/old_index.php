<?php

declare(strict_types=1);

if (PHP_SAPI === 'cli-server') {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

    if ($path !== '/' && is_file(__DIR__ . $path)) {
        return false;
    }

    if (preg_match('#^/([0-9a-zA-Z]+)/?$#', $path, $matches) === 1) {
        $_GET['room'] = $matches[1];
    }
}

require_once __DIR__ . '/../src/database.php';
require_once __DIR__ . '/../src/tools.php';

$statement = database()->prepare(
    'SELECT id, filename FROM things WHERE room = :room ORDER BY id DESC'
);

$requestId = $_GET['room'] ?? '0';
$roomId = encodeBase36(decodeBase36($requestId));

$statement->execute(['room' => $roomId]);
$images = $statement->fetchAll();

if ($roomId !== $requestId) {
    header('Location: /' . $roomId, true, 302);
    exit;
}

$northId = getNeighborId($roomId, 'north');
$eastId = getNeighborId($roomId, 'east');
$westId = getNeighborId($roomId, 'west');
$southId = getNeighborId($roomId, 'south');

$details = spiralDetails($roomId);

$doors = getRoomDoors($roomId);
$doorCount = count(array_filter(
    $doors,
    fn($door) => $door['exists']
));

?>
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>ROOM <?= htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8') ?></title>
        <link rel="stylesheet" href="/styles.css">
    </head>
    <body>
        <!-- <h2>Welcome to Room <?= htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8') ?>!</h2> -->
        <?php if ($doorCount <= 1): ?>
            <!-- <h2>Welcome to <?= strtoupper(htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8')) ?> Gallery</h2> -->
            <h2>You are in a room.</h2>
        <?php else: ?>
            <h2>You are in a hallway.</h2>
        <?php endif; ?>

        <!-- <ul>
            <li>Room Number (base 36): <?= htmlspecialchars($details['base36'], ENT_QUOTES, 'UTF-8') ?></li>
            <li>Actual Room Number (base 10): <?= htmlspecialchars(formatInt($details['base10']), ENT_QUOTES, 'UTF-8') ?></li>
            <li>Spiral Ring Number / Distance from Center: <?= htmlspecialchars(formatInt($details['ring']), ENT_QUOTES, 'UTF-8') ?></li>
            <li>Spiral Ring width / height: <?= htmlspecialchars(formatInt($details['width']), ENT_QUOTES, 'UTF-8') ?></li>
        </ul> -->

        <p>
            <br>The lights are off.
            <br>This is room number <?= htmlspecialchars(formatInt($details['base10']), ENT_QUOTES, 'UTF-8') ?>. In base-36 this is room number "<?= htmlspecialchars($details['base36'], ENT_QUOTES, 'UTF-8') ?>". 
            <br>This room is part of an infinite spiral of rooms.
            <br>The room number represents the position in the spiral with zero at the center.
            <br>The doors between these rooms do not follow the spiral.
            <br>At this location the height and width of the spiral is  <?= htmlspecialchars(formatInt($details['width']), ENT_QUOTES, 'UTF-8') ?> rooms.
            <br>This room is <?= htmlspecialchars(formatInt($details['ring']), ENT_QUOTES, 'UTF-8') ?> spiral rings away from the centerroom (Room 0). 
            <?php if ($doorCount === 0): ?>
                <br>This room has no doors, there is no way in or out.
                <br>It is a gallery, you may add art.
            <?php elseif ($doorCount === 1): ?>
                <br>This room has only one door.
                <br>This is a gallery, you can add images.
            <?php else: ?>
                <br>This room has <?= htmlspecialchars((string) $doorCount, ENT_QUOTES, 'UTF-8')?> doors.
                <br>This is not a gallery.
            <?php endif; ?>
        </p>

        <br>
        <br>

        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        <a href="/<?= htmlspecialchars($northId, ENT_QUOTES, 'UTF-8') ?>">
            <button
                type="button"

                class="<?= $doors['north']['exists'] ? '' : 'disabled' ?>"
                <?= $doors['north']['exists'] ? '' : 'disabled' ?>
            >
                <?= $doors['north']['exists'] ? 'north door' : '________' ?>
            </button>
        </a>
        <br/>
        <br/>
        <a href="/<?= htmlspecialchars($westId, ENT_QUOTES, 'UTF-8') ?>">
            <button
                type="button"

                class="<?= $doors['west']['exists'] ? '' : 'disabled' ?>"
                <?= $doors['west']['exists'] ? '' : 'disabled' ?>
            >
                <?= $doors['west']['exists'] ? 'west door' : '________' ?>
            </button>
        </a>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        <a href="/<?= htmlspecialchars($eastId, ENT_QUOTES, 'UTF-8') ?>">
            <button
                type="button"

                class="<?= $doors['east']['exists'] ? '' : 'disabled' ?>"
                <?= $doors['east']['exists'] ? '' : 'disabled' ?>
            >
                <?= $doors['east']['exists'] ? 'east door' : '________' ?>
            </button>
        </a>
        <br/>
        <br/>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        <a href="/<?= htmlspecialchars($southId, ENT_QUOTES, 'UTF-8') ?>">
            <button
                type="button"

                class="<?= $doors['south']['exists'] ? '' : 'disabled' ?>"
                <?= $doors['south']['exists'] ? '' : 'disabled' ?>
            >
                <?= $doors['south']['exists'] ? 'south door' : '________' ?>
            </button>
        </a>

        <br>
        <br>
        <br>
        <br>

        <?php if ($doorCount <= 1): ?>
            <form action="/upload.php" method="post" enctype="multipart/form-data">
                <input type="hidden" name="room" value="<?= htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8') ?>">
                <input type="file" name="image" accept="image/*" required>
                <button type="submit">Upload Image</button>
            </form>

            <?php foreach ($images as $image): ?>
                <img
                    class="room-image"
                    src="/images/<?= htmlspecialchars($image['filename'], ENT_QUOTES, 'UTF-8') ?>"
                    alt=""
                >
                <form action="/delete.php" method="post">
                    <input type="hidden" name="id" value="<?= htmlspecialchars((string) $image['id'], ENT_QUOTES, 'UTF-8') ?>">
                    <input type="hidden" name="room" value="<?= htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8') ?>">
                    <button type="submit">Delete</button>
                </form>
            <?php endforeach; ?>
        <?php endif; ?>
    </body>
</html>