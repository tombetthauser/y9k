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
    'SELECT id, filename FROM media WHERE room_id = :room_id ORDER BY id ASC'
);

$requestId = $_GET['room'] ?? '0';
$roomId = encodeBase36(decodeBase36($requestId));

$statement->execute(['room_id' => $roomId]);
$images = $statement->fetchAll();

if ($roomId !== $requestId) {
    header('Location: /' . $roomId, true, 302);
    exit;
}

$doors = getRoomDoors($roomId);
$details = spiralDetails($roomId);

$exitMap = [];
$openDirs = [];

foreach (['north', 'east', 'south', 'west'] as $direction) {
    if ($doors[$direction]['exists']) {
        $openDirs[] = $direction;
        $exitMap[$direction] = $doors[$direction]['neighborId'];
    }
}

$doorCount = count($openDirs);
$isGallery = $doorCount <= 1;
$imageCount = $isGallery ? count($images) : 0;

$clientImages = [];

if ($isGallery) {
    foreach ($images as $index => $image) {
        $clientImages[] = [
            'n' => imageLetter($index),
            'id' => (int) $image['id'],
            'file' => $image['filename'],
            'src' => '/images/' . $image['filename'],
        ];
    }
}

$lines = [];
$lines[] = $isGallery ? 'You are in a room.' : 'You are in a hallway.';
$lines[] = 'The lights are off.';

if ($doorCount === 0) {
    $lines[] = 'This room has no doors. There is no way in or out. It is a gallery.';
} elseif ($doorCount === 1) {
    $lines[] = 'This room has only one door, to the ' . $openDirs[0] . '. This is a gallery.';
} else {
    $lines[] = 'This room has ' . $doorCount . ' doors: ' . listWords($openDirs) . '.';
}

if ($isGallery) {
    if ($imageCount === 0) {
        $lines[] = 'There are no images on the walls.';
    } elseif ($imageCount === 1) {
        $lines[] = 'Image ' . $clientImages[0]['n'] . ' hangs on the wall.';
    } else {
        $labels = array_column($clientImages, 'n');
        $lines[] = 'Images ' . listWords($labels) . ' hang on the walls.';
    }
}

$text = implode("\n", $lines);

$detailLines = [];
$detailLines[] = 'This is room number ' . formatInt($details['base10']) . '. In base-36 this is room "' . $details['base36'] . '".';
$detailLines[] = '';
$detailLines[] = 'This room is part of an infinite spiral of rooms. The room number is the position in the spiral, with zero at the center. The doors between these rooms do not follow the spiral.';
$detailLines[] = '';
$detailLines[] = 'At this location the height and width of the spiral is ' . quantityPhrase($details['width'], 'room', 'rooms') . '. This room is ' . quantityPhrase($details['ring'], 'spiral ring', 'spiral rings') . ' away from the center room (room 0).';

$payload = json_encode(
    [
        'text' => $text,
        'details' => implode("\n", $detailLines),
        'gallery' => $isGallery,
        'exits' => $exitMap,
        'images' => $clientImages,
    ],
    JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
);

$roomAttr = htmlspecialchars($roomId, ENT_QUOTES, 'UTF-8');

function quantityPhrase(string $digits, string $singular, string $plural): string
{
    return formatInt($digits) . ' ' . ($digits === '1' ? $singular : $plural);
}

function imageLetter(int $index): string
{
    $index++;
    $letters = '';

    while ($index > 0) {
        $index--;
        $letters = chr(65 + ($index % 26)) . $letters;
        $index = intdiv($index, 26);
    }

    return $letters;
}

function listWords(array $items): string
{
    $items = array_values($items);
    $count = count($items);

    if ($count === 0) {
        return '';
    }

    if ($count === 1) {
        return $items[0];
    }

    if ($count === 2) {
        return $items[0] . ' and ' . $items[1];
    }

    $last = array_pop($items);

    return implode(', ', $items) . ', and ' . $last;
}

?>
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>ROOM <?= $roomAttr ?></title>
        <style>
            html, body {
                min-height: 100%;
                margin: 0;
                background: #000;
                color: #ffb000;
            }

            body {
                font-family: "Courier New", Courier, monospace;
                font-size: 14px;
                line-height: 1.22;
            }

            #screen {
                max-width: 44rem;
                margin: 0 auto;
                padding: 1rem 1.15rem 1.5rem;
                box-sizing: border-box;
            }

            #log {
                white-space: pre-wrap;
                overflow-wrap: break-word;
                text-shadow: 0 0 6px rgba(255, 176, 0, 0.45);
            }

            .prose {
                margin: 0;
            }

            .echo {
                margin: 0.45rem 0 0.15rem;
            }

            #command-form {
                display: flex;
                align-items: center;
                gap: 0.45rem;
                margin-top: 1.22em;
            }

            #command-form label,
            #command {
                color: #ffb000;
                font: inherit;
                text-shadow: 0 0 6px rgba(255, 176, 0, 0.45);
            }

            #command {
                flex: 1;
                min-width: 0;
                width: 100%;
                background: transparent;
                border: 0;
                outline: none;
                caret-color: #ffb000;
                padding: 0.15rem 0;
            }

            #upload-form {
                position: fixed;
                left: 0;
                top: 0;
                width: 1px;
                height: 1px;
                overflow: hidden;
                clip-path: inset(50%);
            }

            #viewer {
                position: fixed;
                inset: 0;
                z-index: 20;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #000;
                cursor: pointer;
            }

            #viewer[hidden] {
                display: none !important;
            }

            #viewer img {
                max-width: 90vw;
                max-height: 90vh;
                width: auto;
                height: auto;
                cursor: default;
            }

            ::selection {
                background: #ffb000;
                color: #000;
            }
        </style>
    </head>
    <body>
        <div id="screen">
            <div id="log"></div>
            <form id="command-form" autocomplete="off">
                <label for="command">&gt;</label>
                <input id="command" name="command" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" autofocus>
            </form>
        </div>

        <div id="viewer" hidden>
            <img id="viewer-img" alt="">
        </div>

        <form id="upload-form" action="/upload.php" method="post" enctype="multipart/form-data">
            <input type="hidden" name="room" value="<?= $roomAttr ?>">
            <input id="upload-file" type="file" name="image" accept="image/*" tabindex="-1">
        </form>

        <dialog id="upload-dialog">
            <form action="/upload.php" method="post" enctype="multipart/form-data">
                <input type="hidden" name="room" value="<?= $roomAttr ?>">
                <div>upload image</div>
                <input type="file" name="image" accept="image/*" required>
                <button type="submit">upload</button>
            </form>
        </dialog>

        <form id="delete-form" action="/delete.php" method="post" hidden>
            <input type="hidden" name="id" id="delete-id" value="">
            <input type="hidden" name="room" value="<?= $roomAttr ?>">
        </form>

        <noscript>
            <pre><?= htmlspecialchars($text, ENT_QUOTES, 'UTF-8') ?></pre>
        </noscript>

        <script>
            const world = <?= $payload ?>;

            const log = document.getElementById('log');
            const form = document.getElementById('command-form');
            const command = document.getElementById('command');
            const viewer = document.getElementById('viewer');
            const viewerImg = document.getElementById('viewer-img');
            const uploadForm = document.getElementById('upload-form');
            const uploadFile = document.getElementById('upload-file');
            const uploadDialog = document.getElementById('upload-dialog');
            const deleteForm = document.getElementById('delete-form');
            const deleteId = document.getElementById('delete-id');

            const queue = [];
            const history = [];
            let active = null;
            let timer = 0;
            let historyAt = 0;
            let pendingDelete = null;
            let lastInputLength = 0;
            let audioCtx = null;
            const sounds = { tick: null, boop: null, bad: null };
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const typeDelay = 20;

            function scrollLog() {
                window.scrollTo(0, document.documentElement.scrollHeight);
            }

            function loadAudio() {
                if (audioCtx) {
                    return;
                }

                const Context = window.AudioContext || window.webkitAudioContext;

                if (!Context) {
                    return;
                }

                audioCtx = new Context();

                [
                    ['tick', '/tick.wav'],
                    ['boop', '/boop.wav'],
                    ['bad', '/bad.wav']
                ].forEach((pair) => {
                    fetch(pair[1])
                        .then((response) => response.arrayBuffer())
                        .then((bytes) => audioCtx.decodeAudioData(bytes))
                        .then((buffer) => {
                            sounds[pair[0]] = buffer;
                        })
                        .catch(() => {});
                });
            }

            function prepareAudio() {
                loadAudio();

                if (audioCtx && audioCtx.state === 'suspended') {
                    return audioCtx.resume();
                }

                return Promise.resolve();
            }

            function playSound(name, level) {
                const buffer = sounds[name];

                if (!audioCtx || audioCtx.state !== 'running' || !buffer) {
                    return;
                }

                const source = audioCtx.createBufferSource();
                const gain = audioCtx.createGain();
                source.buffer = buffer;
                gain.gain.value = level;
                source.connect(gain);
                gain.connect(audioCtx.destination);
                source.start();
            }

            function playTick() {
                playSound('tick', 0.7);
            }

            function playOk() {
                playSound('boop', 0.85);
            }

            function playBad() {
                playSound('boop', 0.85);
            }

            function playBeepWhenReady() {
                return Promise.resolve(prepareAudio()).then(() => {
                    if (sounds.boop) {
                        playOk();
                        return;
                    }

                    if (!audioCtx) {
                        return;
                    }

                    return fetch('/boop.wav')
                        .then((response) => response.arrayBuffer())
                        .then((bytes) => audioCtx.decodeAudioData(bytes))
                        .then((buffer) => {
                            sounds.boop = buffer;
                            playOk();
                        })
                        .catch(() => {});
                });
            }

            function say(text, after, instant) {
                queue.push({ text: text, after: after || null, instant: !!instant });
                pump();
            }

            function sayInstant(text, after) {
                say(text, after, true);
            }

            function pump() {
                if (active || queue.length === 0) {
                    return;
                }

                active = queue.shift();
                const el = document.createElement('div');
                el.className = 'prose';
                log.appendChild(el);
                active.el = el;
                active.index = 0;

                if (reduceMotion || active.instant || active.text.length === 0) {
                    active.el.textContent = active.text;
                    scrollLog();
                    finishActive();
                    return;
                }

                timer = setTimeout(typeStep, typeDelay);
            }

            function typeStep() {
                if (!active) {
                    return;
                }

                const ch = active.text[active.index];
                active.index += 1;
                active.el.textContent = active.text.slice(0, active.index);

                if (ch !== '\n') {
                    playTick();
                }

                scrollLog();

                if (active.index < active.text.length) {
                    timer = setTimeout(typeStep, typeDelay);
                    return;
                }

                finishActive();
            }

            function finishActive() {
                const after = active.after;
                active = null;
                clearTimeout(timer);

                if (after) {
                    after();
                }

                pump();
            }

            function fastForward() {
                if (!active && queue.length === 0) {
                    return false;
                }

                clearTimeout(timer);
                const pending = [];

                if (active) {
                    pending.push(active);
                    active = null;
                }

                while (queue.length > 0) {
                    pending.push(queue.shift());
                }

                pending.forEach((item) => {
                    if (!item.el) {
                        item.el = document.createElement('div');
                        item.el.className = 'prose';
                        log.appendChild(item.el);
                    }

                    item.el.textContent = item.text;
                });

                scrollLog();

                pending.forEach((item) => {
                    if (item.after) {
                        item.after();
                    }
                });

                return true;
            }

            function deleteImages(ids) {
                const room = deleteForm.elements.room.value;
                let chain = Promise.resolve();

                ids.forEach((id) => {
                    chain = chain.then(() => {
                        const body = new FormData();
                        body.append('id', String(id));
                        body.append('room', room);

                        return fetch('/delete.php', {
                            method: 'POST',
                            body: body,
                        });
                    });
                });

                chain.then(() => {
                    window.location.reload();
                });
            }

            function echo(text) {
                const el = document.createElement('div');
                el.className = 'echo';
                el.textContent = '> ' + text;
                log.appendChild(el);
                scrollLog();
            }

            function findImage(label) {
                const key = String(label).toUpperCase();

                return world.images.find((image) => String(image.n).toUpperCase() === key) || null;
            }

            function openImage(image) {
                viewerImg.src = image.src;
                viewerImg.alt = 'image ' + image.n;
                viewer.hidden = false;
            }

            function closeImage(silent) {
                if (viewer.hidden) {
                    return;
                }

                viewer.hidden = true;
                viewerImg.removeAttribute('src');
                command.focus();

                if (!silent) {
                    prepareAudio();
                    playOk();
                }
            }

            function openUpload() {
                uploadFile.value = '';

                try {
                    if (typeof uploadFile.showPicker === 'function') {
                        const opened = uploadFile.showPicker();

                        if (opened && typeof opened.then === 'function') {
                            opened.catch(() => uploadDialog.showModal());
                        }

                        return;
                    }
                } catch (error) {
                    uploadDialog.showModal();
                    return;
                }

                uploadFile.click();
            }

            function word(cmd, keyword) {
                return new RegExp('\\b' + keyword + '\\b').test(cmd);
            }

            function standaloneLetter(cmd, letter) {
                return new RegExp("(?:^|[^a-z'])" + letter + "(?:$|[^a-z'])").test(cmd);
            }

            function imageLabels(cmd) {
                const labels = [];
                const pattern = /\bimage\s+([a-z]+|\d+)\b/g;
                let match = pattern.exec(cmd);

                while (match) {
                    const raw = match[1];
                    labels.push(/^\d+$/.test(raw) ? raw : raw.toUpperCase());
                    match = pattern.exec(cmd);
                }

                return [...new Set(labels)];
            }

            function letterViews(cmd) {
                const labels = [];
                const pattern = /(?:^|[^a-z'])([a-z])(?=$|[^a-z'])/g;
                let match = pattern.exec(cmd);

                while (match) {
                    const letter = match[1];
                    const after = cmd.slice(match.index + match[0].length);

                    if ('nesw'.indexOf(letter) === -1) {
                        const article = letter === 'a' && /^\s+(?:map|room|hallway|image|pictures|picture|art|door)\b/.test(after);

                        if (!article) {
                            labels.push(letter.toUpperCase());
                        }
                    }

                    match = pattern.exec(cmd);
                }

                return labels;
            }

            function mentionsImages(cmd) {
                if (word(cmd, 'art') || word(cmd, 'images') || word(cmd, 'pictures') || word(cmd, 'picture')) {
                    return true;
                }

                return /\bimage\b(?!\s+(?:[a-z]+|\d+)\b)/.test(cmd);
            }

            function wantsMap(cmd) {
                if (word(cmd, 'map')) {
                    return true;
                }

                return /\bshow\s+(?:me\s+)?(?:a\s+|the\s+)?(?:room|hallway|map)\b/.test(cmd);
            }

            function commandIds(cmd) {
                const ids = [];
                const labels = [...new Set(imageLabels(cmd).concat(letterViews(cmd)))];
                const hasDelete = word(cmd, 'delete');
                const hasLook = word(cmd, 'look') || word(cmd, 'see') || word(cmd, 'view');
                const showImages = /\bshow\s+(?:me\s+)?(?:the\s+)?(?:art|images|pictures|picture)\b/.test(cmd) || /\bshow\s+(?:me\s+)?the\s+image\b(?!\s+(?:[a-z]+|\d+)\b)/.test(cmd);
                const firstImage = !hasDelete && (showImages || (hasLook && mentionsImages(cmd)));

                if (hasDelete && word(cmd, 'all')) {
                    ids.push('delete:all');
                } else if (hasDelete) {
                    if (labels.length === 0) {
                        ids.push('delete:?');
                    } else {
                        labels.forEach((label) => ids.push('delete:' + label));
                    }
                } else if (labels.length > 0) {
                    labels.forEach((label) => ids.push('view:' + label));
                }

                if (firstImage) {
                    const first = world.images[0] ? world.images[0].n : 'A';

                    if (ids.indexOf('view:' + first) === -1) {
                        ids.push('view:' + first);
                    }
                }

                if (hasLook && hasDelete && labels.length > 0) {
                    labels.forEach((label) => {
                        const viewId = 'view:' + label;

                        if (ids.indexOf(viewId) === -1) {
                            ids.push(viewId);
                        }
                    });
                }

                if ((wantsMap(cmd) || (word(cmd, 'look') && !firstImage && labels.length === 0)) && ids.indexOf('map') === -1) {
                    ids.push('map');
                }

                if (word(cmd, 'upload') || word(cmd, 'add')) {
                    ids.push('upload');
                }

                if (word(cmd, 'details') || word(cmd, 'detail') || word(cmd, 'spiral')) {
                    ids.push('details');
                }

                const directions = [
                    ['north', 'n'],
                    ['south', 's'],
                    ['east', 'e'],
                    ['west', 'w'],
                ];

                directions.forEach((pair) => {
                    if (word(cmd, pair[0]) || standaloneLetter(cmd, pair[1])) {
                        ids.push('move:' + pair[0]);
                    }
                });

                return ids;
            }

            function confirmAnswer(cmd) {
                const yes = word(cmd, 'yes') || word(cmd, 'y');
                const no = word(cmd, 'no') || (standaloneLetter(cmd, 'n') && !word(cmd, 'north'));
                const others = commandIds(cmd).filter((id) => {
                    if (pendingDelete && (id === 'delete:' + pendingDelete.n || id === 'delete:?')) {
                        return false;
                    }

                    if (no && id === 'move:north' && !word(cmd, 'north')) {
                        return false;
                    }

                    if (yes && id === 'view:Y' && !word(cmd, 'yes')) {
                        return false;
                    }

                    return true;
                });

                return { yes: yes, no: no, others: others };
            }

            function galleryMap() {
                const cols = 11;
                const rows = 5;
                const midCol = Math.floor(cols / 2);
                const midRow = Math.floor(rows / 2);
                const grid = [];

                function doorNorth(i) {
                    return !!world.exits.north && Math.abs(i - midCol) <= 1;
                }

                function doorSouth(i) {
                    return !!world.exits.south && Math.abs(i - midCol) <= 1;
                }

                function doorWest(row) {
                    return !!world.exits.west && row === midRow;
                }

                function doorEast(row) {
                    return !!world.exits.east && row === midRow;
                }

                const top = ['+'];

                for (let i = 0; i < cols; i++) {
                    top.push(doorNorth(i) ? ' ' : '-');
                }

                top.push('+');
                grid.push(top);

                for (let row = 0; row < rows; row++) {
                    const line = [doorWest(row) ? ' ' : '|'];

                    for (let i = 0; i < cols; i++) {
                        line.push(' ');
                    }

                    line.push(doorEast(row) ? ' ' : '|');
                    grid.push(line);
                }

                const bottom = ['+'];

                for (let i = 0; i < cols; i++) {
                    bottom.push(doorSouth(i) ? ' ' : '-');
                }

                bottom.push('+');
                grid.push(bottom);

                const slots = [];

                function addSlot(wall, row, col, nearCorner, nearDoor, anchor) {
                    slots.push({
                        wall: wall,
                        r: row,
                        c: col,
                        valid: !nearCorner && !nearDoor,
                        anchor: anchor,
                        index: slots.length,
                    });
                }

                for (let i = 0; i < cols; i++) {
                    if (!doorNorth(i)) {
                        addSlot('north', 0, i + 1, i === 0 || i === cols - 1, doorNorth(i - 1) || doorNorth(i + 1), i === 2);
                    }
                }

                for (let row = 0; row < rows; row++) {
                    if (!doorEast(row)) {
                        addSlot('east', row + 1, cols + 1, row === 0 || row === rows - 1, doorEast(row - 1) || doorEast(row + 1), false);
                    }
                }

                for (let i = cols - 1; i >= 0; i--) {
                    if (!doorSouth(i)) {
                        addSlot('south', rows + 1, i + 1, i === 0 || i === cols - 1, doorSouth(i - 1) || doorSouth(i + 1), false);
                    }
                }

                for (let row = rows - 1; row >= 0; row--) {
                    if (!doorWest(row)) {
                        addSlot('west', row + 1, 0, row === 0 || row === rows - 1, doorWest(row - 1) || doorWest(row + 1), false);
                    }
                }

                function slotsFor(wall) {
                    const list = slots.filter((slot) => slot.wall === wall && (slot.valid || slot.anchor));

                    if (wall !== 'north') {
                        return list;
                    }

                    const anchorAt = list.findIndex((slot) => slot.anchor);

                    if (anchorAt <= 0) {
                        return list;
                    }

                    return list.slice(anchorAt).concat(list.slice(0, anchorAt));
                }

                const queues = {
                    north: slotsFor('north'),
                    east: slotsFor('east'),
                    south: slotsFor('south'),
                    west: slotsFor('west'),
                };
                const wallOrder = ['north', 'east', 'south', 'west'];
                const occupied = [];
                let nextWall = 0;

                function separated(index) {
                    return occupied.every((taken) => {
                        const diff = Math.abs(taken - index);

                        return Math.min(diff, slots.length - diff) >= 2;
                    });
                }

                world.images.forEach((image) => {
                    for (let attempt = 0; attempt < wallOrder.length; attempt++) {
                        const wall = wallOrder[(nextWall + attempt) % wallOrder.length];
                        const queue = queues[wall];
                        let chosen = -1;

                        for (let i = 0; i < queue.length; i++) {
                            if (separated(queue[i].index)) {
                                chosen = i;
                                break;
                            }
                        }

                        if (chosen === -1) {
                            continue;
                        }

                        const slot = queue.splice(chosen, 1)[0];
                        const letter = String(image.n);

                        if (letter.length === 1) {
                            grid[slot.r][slot.c] = letter;
                        }

                        occupied.push(slot.index);
                        nextWall = (wallOrder.indexOf(wall) + 1) % wallOrder.length;
                        break;
                    }
                });

                return grid.map((line) => line.join('')).join('\n');
            }

            function hallwayMap() {
                const shaftW = 2;
                const shaftH = 1;
                const arm = 1;
                const side = 2;
                const north = !!world.exits.north;
                const east = !!world.exits.east;
                const south = !!world.exits.south;
                const west = !!world.exits.west;
                const left = west ? side : 0;
                const right = east ? side : 0;
                const up = north ? arm : 0;
                const down = south ? arm : 0;
                const width = left + shaftW + right;
                const height = up + shaftH + down;
                const jx0 = left;
                const jx1 = left + shaftW;
                const jy0 = up;
                const jy1 = up + shaftH;

                function inside(x, y) {
                    if (x < 0 || y < 0 || x >= width || y >= height) {
                        return false;
                    }

                    if (x >= jx0 && x < jx1 && y >= jy0 && y < jy1) {
                        return true;
                    }

                    if (north && x >= jx0 && x < jx1 && y < jy0) {
                        return true;
                    }

                    if (south && x >= jx0 && x < jx1 && y >= jy1) {
                        return true;
                    }

                    if (west && y >= jy0 && y < jy1 && x < jx0) {
                        return true;
                    }

                    if (east && y >= jy0 && y < jy1 && x >= jx1) {
                        return true;
                    }

                    return false;
                }

                const gridH = height * 2 + 1;
                const gridW = width * 2 + 1;
                const grid = [];

                for (let y = 0; y < gridH; y++) {
                    grid.push(Array(gridW).fill(' '));
                }

                const door = 'd';

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        if (!inside(x, y)) {
                            continue;
                        }

                        const cx = x * 2 + 1;
                        const cy = y * 2 + 1;

                        if (!inside(x, y - 1)) {
                            grid[cy - 1][cx] = north && y === 0 ? door : '-';
                        }

                        if (!inside(x, y + 1)) {
                            grid[cy + 1][cx] = south && y === height - 1 ? door : '-';
                        }

                        if (!inside(x - 1, y)) {
                            grid[cy][cx - 1] = west && x === 0 ? door : '|';
                        }

                        if (!inside(x + 1, y)) {
                            grid[cy][cx + 1] = east && x === width - 1 ? door : '|';
                        }
                    }
                }

                for (let y = 0; y < gridH; y += 2) {
                    for (let x = 0; x < gridW; x += 2) {
                        const above = y > 0 ? grid[y - 1][x] : ' ';
                        const below = y < gridH - 1 ? grid[y + 1][x] : ' ';
                        const before = x > 0 ? grid[y][x - 1] : ' ';
                        const after = x < gridW - 1 ? grid[y][x + 1] : ' ';
                        const vertical = above === '|' || above === door || below === '|' || below === door;
                        const horizontal = before === '-' || before === door || after === '-' || after === door;

                        if (vertical && horizontal) {
                            grid[y][x] = '+';
                        } else if (before === '-' || after === '-') {
                            grid[y][x] = '-';
                        } else if (above === '|' || below === '|') {
                            grid[y][x] = '|';
                        }
                    }
                }

                return grid.map((row) => row.map((cell) => cell === door ? ' ' : cell).join('')).join('\n');
            }

            function roomMap() {
                const map = world.gallery ? galleryMap() : hallwayMap();

                if (world.images.length === 0) {
                    return map;
                }

                const key = world.images.map((image) => image.n + ': ' + (image.file || ('image ' + image.n))).join('\n');

                return map + '\n\nimages key:\n' + key;
            }

            function missingImage(label) {
                if (!world.gallery || world.images.length === 0) {
                    say('There are no images on the walls.');
                    return;
                }

                say('There is no image ' + label + ' on the walls.');
            }

            function runCommand(id) {
                if (id === 'details') {
                    say(world.details);
                    return;
                }

                if (id === 'map') {
                    say(roomMap());
                    return;
                }

                if (id === 'upload') {
                    if (!world.gallery) {
                        say('You cannot hang images here.');
                        return;
                    }

                    openUpload();
                    say('Choose an image to hang.');
                    return;
                }

                if (id.indexOf('move:') === 0) {
                    const dir = id.slice(5);

                    if (world.exits[dir]) {
                        say('You go ' + dir + '.', () => {
                            window.location.href = '/' + world.exits[dir];
                        });
                    } else {
                        say('There is no door to the ' + dir + '.');
                    }

                    return;
                }

                if (id.indexOf('view:') === 0) {
                    const label = id.slice(5);
                    const image = findImage(label);

                    if (!image) {
                        missingImage(label);
                        return;
                    }

                    openImage(image);
                    sayInstant('You looked at image ' + image.n + '.');
                    return;
                }

                if (id === 'delete:all') {
                    if (!world.gallery || world.images.length === 0) {
                        say('There are no images on the walls.');
                        return;
                    }

                    pendingDelete = {
                        n: 'all',
                        ids: world.images.map((image) => image.id),
                    };
                    say('Delete every image? Yes or no.');
                    return;
                }

                if (id === 'delete:?') {
                    say('Delete which image?');
                    return;
                }

                if (id.indexOf('delete:') === 0) {
                    const label = id.slice(7);
                    const image = findImage(label);

                    if (!image) {
                        missingImage(label);
                        return;
                    }

                    pendingDelete = { n: image.n, id: image.id };
                    say('Delete image ' + image.n + '? Yes or no.');
                }
            }

            function act(raw) {
                const cmd = raw.toLowerCase().replace(/\s+/g, ' ').trim();

                if (pendingDelete) {
                    const answer = confirmAnswer(cmd);
                    const mixed = (answer.yes && answer.no) || ((answer.yes || answer.no) && answer.others.length > 0) || answer.others.length > 1;

                    if (mixed) {
                        playBad();
                        say('That\'s too many commands at once.');
                        return;
                    }

                    const choice = pendingDelete;

                    if (answer.yes) {
                        pendingDelete = null;
                        playOk();

                        if (choice.ids) {
                            say('You take every image down.', () => {
                                deleteImages(choice.ids);
                            });
                            return;
                        }

                        say('You take image ' + choice.n + ' down.', () => {
                            deleteId.value = String(choice.id);
                            deleteForm.submit();
                        });
                        return;
                    }

                    if (answer.no) {
                        pendingDelete = null;
                        playOk();

                        if (choice.ids) {
                            say('You leave the images where they are.');
                            return;
                        }

                        say('You leave image ' + choice.n + ' where it is.');
                        return;
                    }

                    playBad();
                    say('Yes or no?');
                    return;
                }

                const ids = commandIds(cmd);

                if (ids.length > 1) {
                    playBad();
                    say('That\'s too many commands at once.');
                    return;
                }

                if (ids.length === 0) {
                    playBad();
                    say('invalid command');
                    return;
                }

                playOk();
                runCommand(ids[0]);
            }

            form.addEventListener('submit', (event) => {
                event.preventDefault();
                prepareAudio();
                const typed = command.value.trim();
                command.value = '';
                lastInputLength = 0;
                historyAt = history.length;

                if (!typed) {
                    return;
                }

                history.push(typed);
                historyAt = history.length;
                echo(typed);
                act(typed);
            });

            command.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                if (fastForward()) {
                    return;
                }

                if (!viewer.hidden) {
                    closeImage();
                    return;
                }

                form.requestSubmit();
            });

            command.addEventListener('input', () => {
                const added = command.value.length - lastInputLength;
                lastInputLength = command.value.length;

                if (added < 1) {
                    return;
                }

                prepareAudio();

                const ticks = Math.min(added, 8);

                for (let i = 0; i < ticks; i++) {
                    setTimeout(playTick, i * typeDelay);
                }
            });

            viewer.addEventListener('click', (event) => {
                if (event.target === viewer) {
                    closeImage();
                }
            });

            document.addEventListener('keydown', (event) => {
                if (uploadDialog.open) {
                    return;
                }

                if (event.key === 'Enter' && (active || queue.length > 0)) {
                    event.preventDefault();
                    fastForward();
                    return;
                }

                if ((event.key === 'Escape' || event.key === 'Enter') && !viewer.hidden) {
                    event.preventDefault();
                    closeImage();
                    return;
                }

                const arrowDirs = {
                    ArrowUp: 'north',
                    ArrowDown: 'south',
                    ArrowLeft: 'west',
                    ArrowRight: 'east',
                };
                const dir = arrowDirs[event.key];

                if (!dir) {
                    return;
                }

                event.preventDefault();

                if (!viewer.hidden) {
                    closeImage(true);
                }

                command.value = '';
                lastInputLength = 0;

                const destination = world.exits[dir] ? '/' + world.exits[dir] : '';

                if (!destination) {
                    playBeepWhenReady();
                    sayInstant('There is no door to the ' + dir + '.');
                    return;
                }

                let left = false;

                const leave = () => {
                    if (left) {
                        return;
                    }

                    left = true;
                    window.location.href = destination;
                };

                playBeepWhenReady().then(() => {
                    setTimeout(leave, 180);
                });
                setTimeout(leave, 700);
            });

            document.getElementById('screen').addEventListener('click', () => {
                prepareAudio();

                if (viewer.hidden && !uploadDialog.open) {
                    command.focus();
                }
            });

            uploadFile.addEventListener('change', () => {
                if (uploadFile.files && uploadFile.files.length > 0) {
                    uploadForm.submit();
                }
            });

            loadAudio();
            say(world.text + '\n\n' + roomMap());
            command.focus();
        </script>
    </body>
</html>
