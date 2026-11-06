import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

class MockMesh {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.position = { set: (...values) => { this.position.values = values; } };
        this.rotation = { y: 0 };
        this.userData = {};
    }
}

globalThis.__electricalBoxTestThree = {
    Mesh: MockMesh,
    BoxGeometry: class {},
    CylinderGeometry: class {},
    MeshStandardMaterial: class { constructor(options) { Object.assign(this, options); } },
    SRGBColorSpace: 'srgb',
    NearestFilter: 'nearest',
};
const sourceURL = new URL('../public/helpers.js', import.meta.url);
const source = (await readFile(sourceURL, 'utf8'))
    .replace(/^import \* as THREE from [^\n]+;/m, 'const THREE = globalThis.__electricalBoxTestThree;')
    .replaceAll('import.meta.url', JSON.stringify(sourceURL.href));
const helpers = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
delete globalThis.__electricalBoxTestThree;

test('clicking a hallway electrical box opens that room in the text interface', async () => {
    const originalWindow = globalThis.window;
    const children = [], clickable = [];
    const scene = { add: object => children.push(object) };
    const textureLoader = {
        load(_url, onLoad) {
            onLoad({ image: { width: 16, height: 16 } });
        },
    };
    const url = 'https://y9k.thinkpad.club/text.php?room=erin';
    const addElectricalBox = helpers.createAddElectricalBox({
        scene, textureLoader, roomHalfY: 2, clickable, textInterfaceUrl: url,
    });
    addElectricalBox('north', 0, 0, '/electrical.jpg');
    const box = clickable[0];
    const room = new helpers.Gallery({ roomId: 'erin', textInterfaceUrl: url });
    let destination = null;
    globalThis.window = { location: { assign: value => { destination = value; } } };

    try {
        assert.ok(box);
        assert.equal(box.userData.isElectricalBox, true);
        assert.equal(box.userData.href, url);
        assert.ok(children.includes(box));
        await room._hit(box);
        assert.equal(destination, url);
    } finally {
        globalThis.window = originalWindow;
    }
});
