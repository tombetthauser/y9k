// LLM THUMBNAIL BACKFILL: BEGIN isolated migration and room-visit tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function fixture() {
    const project = mkdtempSync(join(tmpdir(), 'y9k-migration-test-'));
    for (const dir of ['src', 'public', 'testing', 'data', 'data/images']) {
        mkdirSync(join(project, dir));
    }
    for (const dir of ['src', 'public']) {
        for (const file of readdirSync(join(root, dir))) {
            if (file.endsWith('.php')) copyFileSync(join(root, dir, file), join(project, dir, file));
        }
    }
    for (const file of ['migrate-thumbnails.php', 'thumbnail-worker.php']) {
        copyFileSync(join(root, 'testing', file), join(project, 'testing', file));
    }
    return project;
}

function php(project, code) {
    return execFileSync('php', ['-r', code], { cwd: project, encoding: 'utf8' });
}

function migrate(project) {
    return spawnSync('php', ['testing/migrate-thumbnails.php'], { cwd: project, encoding: 'utf8' });
}

async function openServer(project) {
    const probe = createServer();
    await new Promise((ok, fail) => {
        probe.once('error', fail);
        probe.listen(0, '127.0.0.1', ok);
    });
    const port = probe.address().port;
    await new Promise((ok, fail) => probe.close(error => error ? fail(error) : ok()));
    const server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', 'public'], {
        cwd: project, stdio: 'ignore',
    });
    const base = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            await fetch(`${base}/image.php`);
            return { server, base };
        } catch {
            await delay(50);
        }
    }
    server.kill('SIGTERM');
    throw new Error('PHP test server did not start');
}

test('migrated images queue once on room visits and retain original bytes', async () => {
    const project = fixture();
    let server;
    try {
        php(project, `
            require 'src/tools.php';
            $db = new PDO('sqlite:data/development.sqlite');
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $db->exec('CREATE TABLE things (id INTEGER PRIMARY KEY, filename TEXT NOT NULL, filekey TEXT NOT NULL UNIQUE, room TEXT NOT NULL, wall TEXT, x TEXT, y TEXT, width TEXT)');
            $db->exec('CREATE TABLE holes (room_a TEXT NOT NULL, room_b TEXT NOT NULL, is_hole INTEGER NOT NULL, PRIMARY KEY (room_a, room_b))');
            $db->exec("INSERT INTO holes VALUES ('a', 'b', 1)");
            $image = imagecreatetruecolor(2048, 1024);
            ob_start(); imagejpeg($image); $bytes = ob_get_clean();
            $add = $db->prepare('INSERT INTO things VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            foreach ([1 => 'tom', 2 => 'erin', 3 => 'tom', 4 => 'tom', 5 => 'tom'] as $id => $room) {
                $key = sprintf('%032x.foo', $id);
                file_put_contents(imageStoragePath($key), scrambleImageBytes($bytes, $room));
                $add->execute([$id, scrambleMetadata('picture.jpg', $room), $key, hashRoomId($room), scrambleMetadata(0, $room), scrambleMetadata(0, $room), scrambleMetadata(0, $room), scrambleMetadata(90, $room)]);
            }
        `);
        const originalPath = join(project, 'data/images', '00000000000000000000000000000001.foo');
        const originalBytes = readFileSync(originalPath);
        const first = migrate(project);
        assert.equal(first.status, 0, first.stderr);
        assert.match(first.stdout, /pending: 5/);
        assert.equal(migrate(project).status, 1, 'second migration must refuse');
        assert.equal(php(project, `
            $db = new PDO('sqlite:data/development.sqlite');
            echo $db->query('SELECT COUNT(*) FROM holes')->fetchColumn();
        `), '1');
        assert.deepEqual(readFileSync(originalPath), originalBytes);

        php(project, `
            $db = new PDO('sqlite:data/development.sqlite');
            $db->exec("UPDATE things SET thumbnail = 'skipped' WHERE id = 4");
            $db->exec("UPDATE things SET thumbnail = 'failed' WHERE id = 5");
        `);
        const running = await openServer(project);
        server = running.server;
        const jobs = () => JSON.parse(php(project, `
            $db = new PDO('sqlite:data/development.sqlite');
            echo json_encode($db->query('SELECT thing_id, room_id FROM thumbnail_jobs ORDER BY thing_id')->fetchAll(PDO::FETCH_ASSOC));
        `));
        assert.equal((await fetch(`${running.base}/index.php?room=000TOM`)).status, 200);
        assert.deepEqual(jobs(), [{ thing_id: 1, room_id: 'tom' }, { thing_id: 3, room_id: 'tom' }]);
        assert.equal((await fetch(`${running.base}/index.php?room=tom`)).status, 200);
        assert.deepEqual(jobs(), [{ thing_id: 1, room_id: 'tom' }, { thing_id: 3, room_id: 'tom' }]);
        assert.equal((await fetch(`${running.base}/text.php?room=erin`)).status, 200);
        assert.deepEqual(jobs(), [
            { thing_id: 1, room_id: 'tom' }, { thing_id: 2, room_id: 'erin' }, { thing_id: 3, room_id: 'tom' },
        ]);
        execFileSync('php', ['testing/thumbnail-worker.php', '--once'], { cwd: project });
        assert.equal(php(project, `
            $db = new PDO('sqlite:data/development.sqlite');
            echo $db->query('SELECT thumbnail FROM things WHERE id = 1')->fetchColumn();
        `), 'created');
        assert.deepEqual(readFileSync(originalPath), originalBytes);
        assert.equal((await fetch(`${running.base}/text.php?room=tom`)).status, 200);
        assert.deepEqual(jobs(), [{ thing_id: 2, room_id: 'erin' }, { thing_id: 3, room_id: 'tom' }]);
    } finally {
        if (server && server.exitCode === null && server.signalCode === null) {
            const exited = new Promise(ok => server.once('exit', ok));
            server.kill('SIGTERM');
            await exited;
        }
        rmSync(project, { recursive: true, force: true });
    }
});

test('migration refuses missing or unexpected schemas without creating a queue', () => {
    const project = fixture();
    try {
        assert.notEqual(migrate(project).status, 0);
        php(project, "$db = new PDO('sqlite:data/development.sqlite'); $db->exec('CREATE TABLE things (id INTEGER PRIMARY KEY, extra TEXT)');");
        assert.notEqual(migrate(project).status, 0);
        assert.equal(php(project, `
            $db = new PDO('sqlite:data/development.sqlite');
            echo $db->query("SELECT COUNT(*) FROM sqlite_master WHERE name = 'thumbnail_jobs'")->fetchColumn();
        `), '0');
    } finally {
        rmSync(project, { recursive: true, force: true });
    }
});

test('migration refuses an existing queue without altering the things schema', () => {
    const project = fixture();
    try {
        php(project, `
            $db = new PDO('sqlite:data/development.sqlite');
            $db->exec('CREATE TABLE things (id INTEGER PRIMARY KEY, filename TEXT, filekey TEXT, room TEXT, wall TEXT, x TEXT, y TEXT, width TEXT)');
            $db->exec('CREATE TABLE thumbnail_jobs (thing_id INTEGER PRIMARY KEY, room_id TEXT)');
            $db->exec("INSERT INTO thumbnail_jobs VALUES (1, 'keep')");
        `);
        const result = migrate(project);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /already exists/);
        assert.equal(php(project, `
            $db = new PDO('sqlite:data/development.sqlite');
            echo count($db->query('PRAGMA table_info(things)')->fetchAll()) . ':'
                . $db->query('SELECT room_id FROM thumbnail_jobs')->fetchColumn();
        `), '8:keep');
    } finally {
        rmSync(project, { recursive: true, force: true });
    }
});
// LLM THUMBNAIL BACKFILL: END isolated migration and room-visit tests.
