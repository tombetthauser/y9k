// LLM THUMBNAILS: BEGIN isolated upload, worker, serving, and deletion checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function unusedPort() {
    const server = createServer();
    await new Promise((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolveListen);
    });
    const port = server.address().port;
    await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
    return port;
}

function php(project, code) {
    return execFileSync('php', ['-r', code], { cwd: project, encoding: 'utf8' });
}

test('uploads queue a thumbnail without blocking and preserve the original', async () => {
    const project = mkdtempSync(join(tmpdir(), 'y9k-thumbnail-test-'));
    let server;
    try {
        for (const dir of ['src', 'public', 'testing']) mkdirSync(join(project, dir));
        for (const file of readdirSync(join(root, 'src'))) {
            if (file.endsWith('.php')) copyFileSync(join(root, 'src', file), join(project, 'src', file));
        }
        for (const file of readdirSync(join(root, 'public'))) {
            if (file.endsWith('.php') || file === 'helpers.js') {
                copyFileSync(join(root, 'public', file), join(project, 'public', file));
            }
        }
        copyFileSync(join(root, 'testing/thumbnail-worker.php'), join(project, 'testing/thumbnail-worker.php'));

        const port = await unusedPort();
        const base = `http://127.0.0.1:${port}`;
        server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', 'public'], {
            cwd: project, stdio: 'ignore',
        });
        let ready = false;
        for (let attempt = 0; attempt < 50; attempt++) {
            try {
                await fetch(`${base}/image.php`);
                ready = true;
                break;
            } catch {
                await delay(50);
            }
        }
        assert.ok(ready, 'PHP server did not start');

        const original = execFileSync('php', ['-r',
            '$i=imagecreatetruecolor(2048,1024); imagefill($i,0,0,imagecolorallocate($i,42,99,123)); imagejpeg($i);'
        ]);
        const form = new FormData();
        for (const [key, value] of Object.entries({
            room: 'tom', action: 'upload', wall: '0', x: '0', y: '0', width: '90',
        })) form.set(key, value);
        form.set('image', new Blob([original], { type: 'image/jpeg' }), 'picture.jpg');

        const response = await fetch(`${base}/index.php?room=tom`, {
            method: 'POST', headers: { Accept: 'application/json' }, body: form,
        });
        const result = await response.json();
        assert.equal(response.status, 200, JSON.stringify(result));
        assert.equal(result.ok, true);
        assert.ok(result.thumbnailUrl);

        const state = () => JSON.parse(php(project,
            "require 'src/database.php'; echo json_encode(database()->query('SELECT thumbnail FROM things')->fetchColumn());"));
        assert.equal(state(), 'pending');
        const logAfterUpload = readFileSync(join(project, 'data/log.txt'), 'utf8');
        const pending = await fetch(base + result.thumbnailUrl);
        assert.deepEqual(Buffer.from(await pending.arrayBuffer()), original);
        assert.equal(pending.headers.get('cache-control'), 'no-store');

        execFileSync('php', ['testing/thumbnail-worker.php', '--once'], { cwd: project });
        assert.equal(state(), 'created');

        const thumb = await fetch(base + result.thumbnailUrl);
        const thumbBytes = Buffer.from(await thumb.arrayBuffer());
        assert.equal(thumb.headers.get('content-type'), 'image/webp');
        const dimensions = execFileSync('php', ['-r',
            '$s=stream_get_contents(STDIN); $d=getimagesizefromstring($s); echo $d[0]."x".$d[1];'
        ], { input: thumbBytes, encoding: 'utf8' });
        assert.equal(dimensions, '1024x512');
        assert.deepEqual(Buffer.from(await (await fetch(base + result.url)).arrayBuffer()), original);
        assert.equal((await fetch(base + result.thumbnailUrl.replace('r=tom', 'r=anotherroom'))).status, 404);
        assert.equal((await fetch(base + result.url + '&variant=unknown')).status, 400);
        assert.equal(readFileSync(join(project, 'data/log.txt'), 'utf8'), logAfterUpload);
        assert.equal(php(project,
            "require 'src/database.php'; echo database()->query('SELECT COUNT(*) FROM thumbnail_jobs')->fetchColumn();"), '0');

        const [thumbnailKey] = readdirSync(join(project, 'data/thumbnails'));
        const thumbnailPath = join(project, 'data/thumbnails', thumbnailKey);
        const savedThumbnail = readFileSync(thumbnailPath);
        unlinkSync(thumbnailPath);
        assert.equal((await fetch(base + result.thumbnailUrl)).status, 500);
        writeFileSync(thumbnailPath, savedThumbnail);

        const deleteForm = new FormData();
        for (const [key, value] of Object.entries({ room: 'tom', action: 'delete', id: String(result.id) })) {
            deleteForm.set(key, value);
        }
        const deleted = await fetch(`${base}/index.php?room=tom`, {
            method: 'POST', headers: { Accept: 'application/json' }, body: deleteForm,
        });
        assert.equal((await deleted.json()).ok, true);
        assert.equal((await fetch(base + result.url)).status, 404);
        assert.deepEqual(readdirSync(join(project, 'data/images')), []);
        assert.deepEqual(readdirSync(join(project, 'data/thumbnails')), []);

        const textForm = new FormData();
        for (const [key, value] of Object.entries({
            room: 'tom', wall: '0', x: '0', y: '0', width: '90',
        })) textForm.set(key, value);
        textForm.set('image', new Blob([original], { type: 'image/jpeg' }), 'text-page.jpg');
        const textUpload = await fetch(`${base}/upload.php`, {
            method: 'POST', body: textForm, redirect: 'manual',
        });
        assert.equal(textUpload.status, 303);
        const textImage = JSON.parse(php(project,
            "require 'src/database.php'; echo json_encode(database()->query('SELECT id, filekey, thumbnail FROM things')->fetch());"));
        assert.equal(textImage.thumbnail, 'pending');
        execFileSync('php', ['testing/thumbnail-worker.php', '--once'], { cwd: project });
        assert.equal(state(), 'created');
        const textDelete = new FormData();
        textDelete.set('room', 'tom');
        textDelete.set('id', String(textImage.id));
        assert.equal((await fetch(`${base}/delete.php`, {
            method: 'POST', body: textDelete, redirect: 'manual',
        })).status, 303);
        assert.deepEqual(readdirSync(join(project, 'data/images')), []);
        assert.deepEqual(readdirSync(join(project, 'data/thumbnails')), []);

        assert.equal((await fetch(`${base}/upload.php`, {
            method: 'POST', body: textForm, redirect: 'manual',
        })).status, 303);
        assert.equal((await fetch(`${base}/upload.php`, {
            method: 'POST', body: textForm, redirect: 'manual',
        })).status, 303);
        execFileSync('php', ['testing/thumbnail-worker.php', '--once'], { cwd: project });
        const resetForm = new FormData();
        resetForm.set('action', 'reset-things');
        const reset = await fetch(`${base}/logs.php`, {
            method: 'POST', body: resetForm, redirect: 'manual',
        });
        assert.equal(reset.status, 303);
        assert.match(reset.headers.get('location'), /status=things-reset/);
        assert.equal(php(project,
            "require 'src/database.php'; echo database()->query('SELECT COUNT(*) FROM thumbnail_jobs')->fetchColumn();"), '0');
        assert.deepEqual(readdirSync(join(project, 'data/images')), []);
        assert.deepEqual(readdirSync(join(project, 'data/thumbnails')), []);

        const gif = execFileSync('php', ['-r',
            '$i=imagecreatetruecolor(4,4); imagegif($i);'
        ]);
        textForm.set('image', new Blob([gif], { type: 'image/gif' }), 'picture.gif');
        assert.equal((await fetch(`${base}/upload.php`, {
            method: 'POST', body: textForm, redirect: 'manual',
        })).status, 303);
        execFileSync('php', ['testing/thumbnail-worker.php', '--once'], { cwd: project });
        assert.equal(state(), 'skipped');
        const gifKey = php(project,
            "require 'src/database.php'; echo database()->query('SELECT filekey FROM things')->fetchColumn();");
        const gifResponse = await fetch(`${base}/image.php?r=tom&k=${gifKey}&variant=thumbnail`);
        assert.equal(gifResponse.headers.get('content-type'), 'image/gif');
        assert.deepEqual(Buffer.from(await gifResponse.arrayBuffer()), gif);
    } finally {
        if (server && server.exitCode === null && server.signalCode === null) {
            const exited = new Promise(resolveExit => server.once('exit', resolveExit));
            server.kill('SIGTERM');
            await exited;
        }
        rmSync(project, { recursive: true, force: true });
    }
});

test('an older database is not migrated or deleted automatically', () => {
    const project = mkdtempSync(join(tmpdir(), 'y9k-legacy-schema-test-'));
    try {
        mkdirSync(join(project, 'src'));
        mkdirSync(join(project, 'data'));
        copyFileSync(join(root, 'src/database.php'), join(project, 'src/database.php'));
        php(project,
            "$db=new PDO('sqlite:data/development.sqlite'); $db->exec('CREATE TABLE things (id INTEGER PRIMARY KEY, filename TEXT)'); $db->exec(\"INSERT INTO things VALUES (1, 'keep')\");");
        const message = php(project,
            "require 'src/database.php'; try { database(); } catch (RuntimeException $e) { echo $e->getMessage(); }");
        assert.match(message, /predates thumbnail storage/);
        assert.equal(php(project,
            "$db=new PDO('sqlite:data/development.sqlite'); echo $db->query('SELECT filename FROM things WHERE id=1')->fetchColumn();"), 'keep');
    } finally {
        rmSync(project, { recursive: true, force: true });
    }
});
// LLM THUMBNAILS: END isolated upload, worker, serving, and deletion checks.
