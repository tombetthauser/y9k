<?php
    declare(strict_types=1);

    require_once __DIR__ . '/../src/database.php';
    require_once __DIR__ . '/../src/tools.php';
    $maps = require_once __DIR__ . '/../src/maps.php';

    $requestId = $_GET['room'] ?? '0';
    $roomId = normalizeRoomId($requestId);
    $doors = getRoomDoors($roomId, database());
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
        'SELECT id, filename, filekey, wall, x, y, width 
        FROM things 
        WHERE room = :room 
        ORDER BY id DESC'
    );

    $statement->execute(['room' => hashRoomId($roomId)]);
    $images = [];

    foreach ($statement->fetchAll() as $image) {
        $images[] = restoreImageMetadata($image, $roomId);
    }

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
            background: #000;
            min-height: 100%;
            color: #ffb000;
            margin: 0;
        }
        body {
            font-family: "Courier New", Courier, serif;
            padding: 20px 30px 30px 30px;
            border: 1px dashed #ffb000;
            margin: 100px auto;
            line-height: 1.22;
            font-size: 14px;
            max-width: 500px;
            display: block;
        }
        a, #formlink, button {
            text-decoration: none;
            color: #ffb000;
            background: none;
            cursor: pointer;
            font: inherit;
            border: 0;
            padding: 0;
        }
        a:hover, #formlink:hover, button:hover {
            text-decoration: underline;
        }
        img {
            filter: sepia(1) saturate(10);
            border: 1px dotted #ffb000;
            margin-bottom: 0px;
            display: block;
            width: 150px;
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
            text-decoration: underline;
            cursor: pointer;
        }
        #modal {
            background-color: #000000aa;
            place-items: center;
            cursor: pointer;
            position: fixed;
            z-index: 1000;
            display: grid;
            inset: 0;
        }
        #modal[hidden] {
            display: none;
        }
        #modal img {
            cursor: default;
            max-height: 85vh;
            max-width: 85vw;
            filter: none;
            width: auto;
            border: 0;
            margin: 0;
        }
</style>
<body>
    Room <?= strtoupper($roomId) ?>
    <br><br>
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
        <?php foreach ($group as $image): ?>
            <p> 
                <?= $letter ?>: 
                <a 
                    class="imglink" 
                    href="<?= htmlspecialchars(
                        imageUrl($roomId, $image['filekey']), 
                        ENT_QUOTES, 
                        'UTF-8'
                    ) ?>"
                ><?= htmlspecialchars($image['filename'], ENT_QUOTES, 'UTF-8') ?></a> 
                
                <button class="delete" type="submit" form="delete-<?= (int) $image['id'] ?>">delete</button>
                <form id="delete-<?= (int) $image['id'] ?>" action="delete.php" method="post">
                    <input type="hidden" name="room" value="<?= htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8') ?>">
                    <input type="hidden" name="id" value="<?= (int) $image['id'] ?>">
                </form>
            </p>
        <?php endforeach; ?>
    <?php endforeach; ?>
    
    <br><p>You can...</p>

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
            --&gt; <a id="north" href="text.php?room=<?= rawurlencode($doors['north']['neighborId']) ?>">go north</a>
        </div>
    <?php endif; ?>

    <?php if ($doors['east']['exists']): ?>
        <div class="option">
            --&gt; <a id="east" href="text.php?room=<?= rawurlencode($doors['east']['neighborId']) ?>">go east</a>
        </div>
    <?php endif; ?>

    <?php if ($doors['west']['exists']): ?>
        <div class="option">
            --&gt; <a id="west" href="text.php?room=<?= rawurlencode($doors['west']['neighborId']) ?>">go west</a>
        </div>
    <?php endif; ?>

    <?php if ($doors['south']['exists']): ?>
        <div class="option">
            --&gt; <a id="south" href="text.php?room=<?= rawurlencode($doors['south']['neighborId']) ?>">go south</a>
        </div>
    <?php endif; ?>

    <?php if ($doorsCount < 2): ?>
        <div class="option">
            --&gt; <a href="text.php?room=<?= rawurlencode(randomRoom()) ?>">go to a random room</a>
        </div>
    <?php endif; ?>

    --> <a href="<?= rawurlencode($roomId) ?>">enter room</a>

    <br>
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
    <form id="hole-form" action="hole.php" method="post" hidden>
        <input
            type="hidden"
            name="room"
            value="<?= htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8') ?>"
        >
        <input type="hidden" name="direction" value="">
        <input type="hidden" name="is_hole" value="">
    </form>
    <div id="modal" hidden>
        <img src="" alt="">
    </div>
    <script>
        const overlay = document.getElementById('modal');
        const overlayImage = overlay.querySelector('img');

        const doors = <?= json_encode(
            $doors,
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
        ) ?>;

        const holeForm = document.getElementById('hole-form');
        let submittingHole = false;

        document.querySelectorAll('.imglink').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                overlayImage.src = link.href;
                overlayImage.alt = link.textContent;
                overlay.hidden = false;
            });
        });

        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                overlay.hidden = true;
                overlayImage.removeAttribute('src');
            }
        });

        document.addEventListener('keydown', async e => {
                const directions = {
                    ArrowDown: 'south',
                    ArrowRight: 'east',
                    ArrowLeft: 'west',
                    ArrowUp: 'north',
                };
                const direction = directions[e.key];
                if (
                    !direction
                    || e.repeat
                    || e.ctrlKey
                    || e.altKey
                    || e.metaKey
                    || submittingHole
                    || !overlay.hidden
                ) {
                    return;
                }
                if (
                    e.target instanceof Element
                    && (
                        e.target.closest('input, textarea, select')
                        || e.target.isContentEditable
                    )
                ) {
                    return;
                }
                if (e.shiftKey) {
                    e.preventDefault();
                    const makeDoor = !doors[direction].exists;
                    const action = makeDoor ? 'door' : 'wall';
                    if (!window.confirm(`Create a ${action} to the ${direction}?`)) {
                        return;
                    }
                    holeForm.elements.namedItem('direction').value = direction;
                    holeForm.elements.namedItem('is_hole').value = makeDoor ? '1' : '0';
                    submittingHole = true;
                    try {
                        const response = await fetch(holeForm.action, {
                            method: 'POST',
                            body: new FormData(holeForm),
                        });
                        const result = await response.json();
                        if (!response.ok || result.ok !== true) {
                            window.alert(result.error || 'Could not change door.');
                        } else {
                            window.location.reload();
                        }
                    } catch (error) {
                        window.alert(
                            'Could not confirm change. Refresh before retrying.'
                        );
                    } finally {
                        submittingHole = false;
                    }
                    return;
                }

                const link = document.getElementById(direction);
                if (link) {
                    e.preventDefault();
                    window.location.href = link.href;
                }
        });
    </script>
</body>
</html>