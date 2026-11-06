import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { helpers } from './helpers-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

// LLM ROOM IMAGE MOVE TESTS: BEGIN.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('room storage sends target checks and confirmed moves through its existing endpoint', async () => {
    const originalFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (url, options) => {
        requests.push({ url, action: options.body.get('action'), room: options.body.get('room'),
            target: options.body.get('target_room') });
        const body = options.body.get('action') === 'check-gallery'
            ? { ok: true, targetRoom: 'target', doorCount: 1, gallery: true }
            : { ok: true, targetRoom: 'target', moved: 3 };
        return new Response(JSON.stringify(body), { status: 200 });
    };
    try {
        const storage = helpers.createRoomStorage('source');
        assert.equal((await storage.checkGallery('target')).gallery, true);
        assert.equal((await storage.moveRoomImages('target')).moved, 3);
        assert.deepEqual(requests, [
            { url: 'index.php?room=source', action: 'check-gallery', room: 'source', target: 'target' },
            { url: 'index.php?room=source', action: 'move-room-images', room: 'source', target: 'target' },
        ]);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

function createProject() {
    const project = mkdtempSync(join(tmpdir(), 'y9k-room-image-move-'));
    mkdirSync(join(project, 'src'));
    mkdirSync(join(project, 'data/images'), { recursive: true });
    mkdirSync(join(project, 'data/thumbnails'), { recursive: true });
    copyFileSync(join(root, 'src/tools.php'), join(project, 'src/tools.php'));
    return project;
}

function runPhp(project, code) {
    return execFileSync('php', ['-r', code], { cwd: project, encoding: 'utf8' });
}

const setup = `
require 'src/tools.php';
$pdo = new PDO('sqlite:' . __DIR__ . '/data/test.sqlite');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec('CREATE TABLE holes (room_a TEXT NOT NULL, room_b TEXT NOT NULL, is_hole INTEGER NOT NULL, PRIMARY KEY (room_a, room_b))');
$pdo->exec("CREATE TABLE things (
    id INTEGER PRIMARY KEY, filename TEXT NOT NULL, filekey TEXT NOT NULL,
    room TEXT NOT NULL, wall TEXT, x TEXT, y TEXT, width TEXT,
    thumbnail TEXT NOT NULL
)");
$pdo->exec('CREATE TABLE thumbnail_jobs (thing_id INTEGER PRIMARY KEY, room_id TEXT NOT NULL)');
$source = 'a';
$target = 'b';
foreach ([$source, $target] as $room) {
    foreach (['north', 'east', 'south', 'west'] as $direction) {
        setHole($pdo, $room, getNeighborId($room, $direction), false);
    }
}
$filekey = '0123456789abcdef0123456789abcdef.foo';
$originalPath = imageStoragePath($filekey);
$thumbnailPath = thumbnailStoragePath($filekey);
$originalBytes = scrambleImageBytes('original image bytes', $source);
$thumbnailBytes = scrambleImageBytes('thumbnail image bytes', $source);
file_put_contents($originalPath, $originalBytes);
file_put_contents($thumbnailPath, $thumbnailBytes);
$insert = $pdo->prepare('INSERT INTO things (id, filename, filekey, room, wall, x, y, width, thumbnail)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)');
$insert->execute([
    scrambleMetadata('picture.jpg', $source), $filekey, hashRoomId($source),
    scrambleMetadata(2, $source), scrambleMetadata(4, $source),
    scrambleMetadata(5, $source), scrambleMetadata(6, $source), 'created',
]);
$pdo->prepare('INSERT INTO thumbnail_jobs (thing_id, room_id) VALUES (1, ?)')->execute([$source]);
`;

test('moving room images into a gallery re-keys files, metadata, and thumbnail jobs', () => {
    const project = createProject();
    try {
        const result = JSON.parse(runPhp(project, `${setup}
$count = moveRoomImagesToGallery($pdo, $source, $target);
$row = $pdo->query('SELECT * FROM things WHERE id = 1')->fetch(PDO::FETCH_ASSOC);
$job = $pdo->query('SELECT room_id FROM thumbnail_jobs WHERE thing_id = 1')->fetchColumn();
$storedOriginal = file_get_contents($originalPath);
$storedThumbnail = file_get_contents($thumbnailPath);
echo json_encode([
    'count' => $count,
    'room' => $row['room'],
    'filename' => restoreMetadata($row['filename'], $target),
    'wall' => restoreMetadata($row['wall'], $target),
    'original' => restoreImageBytes($storedOriginal, $target),
    'thumbnail' => restoreImageBytes($storedThumbnail, $target),
    'jobRoom' => $job,
    'tempFiles' => glob($originalPath . '.move-*') ?: [],
    'backupFiles' => glob($originalPath . '.backup-*') ?: [],
]);`));

        assert.equal(result.count, 1);
        assert.equal(result.room, awaitHash('b'));
        assert.equal(result.filename, 'picture.jpg');
        assert.equal(result.wall, '2');
        assert.equal(result.original, 'original image bytes');
        assert.equal(result.thumbnail, 'thumbnail image bytes');
        assert.equal(result.jobRoom, 'b');
        assert.deepEqual(result.tempFiles, []);
        assert.deepEqual(result.backupFiles, []);
    } finally {
        rmSync(project, { recursive: true, force: true });
    }
});

test('moving images to a room with two doors is rejected without changing files or rows', () => {
    const project = createProject();
    try {
        const result = JSON.parse(runPhp(project, `${setup}
setHole($pdo, $target, getNeighborId($target, 'north'), true);
setHole($pdo, $target, getNeighborId($target, 'east'), true);
$before = file_get_contents($originalPath);
$error = null;
try {
    moveRoomImagesToGallery($pdo, $source, $target);
} catch (RuntimeException $exception) {
    $error = $exception->getMessage();
}
$row = $pdo->query('SELECT room FROM things WHERE id = 1')->fetchColumn();
$after = file_get_contents($originalPath);
echo json_encode(['error' => $error, 'room' => $row, 'fileUnchanged' => $before === $after]);`));

        assert.match(result.error, /not a gallery/i);
        assert.equal(result.room, awaitHash('a'));
        assert.equal(result.fileUnchanged, true);
    } finally {
        rmSync(project, { recursive: true, force: true });
    }
});

function awaitHash(roomId) {
    return execFileSync('php', ['-r', `require '${join(root, 'src/tools.php')}'; echo hashRoomId('${roomId}');`], {
        cwd: root,
        encoding: 'utf8',
    });
}
// LLM ROOM IMAGE MOVE TESTS: END.
