import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { helpers } from './helpers-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { addSkyLighting } = helpers;
const { SKY_DEFAULTS } = helpers;
const { defaultComputerSkySettings, computerRoomSettings } = helpers;

class Color {
    constructor(hex = 0xffffff) { this.setHex(hex); }
    setHex(hex) { this.rgb = [hex >> 16 & 255, hex >> 8 & 255, hex & 255].map(v => v / 255); return this; }
    clone() { return new Color().copy(this); }
    copy(other) { this.rgb = [...other.rgb]; return this; }
    setRGB(...rgb) { this.rgb = rgb.slice(0, 3); return this; }
    setScalar(value) { this.rgb = [value, value, value]; return this; }
    multiply(other) { this.rgb = this.rgb.map((v, i) => v * other.rgb[i]); return this; }
    multiplyScalar(value) { this.rgb = this.rgb.map(v => v * value); return this; }
}
const makeMaterial = () => ({ color: new Color(), emissive: new Color(), clone() { return makeMaterial(); }, dispose() {} });

function fixture() {
    let on = true;
    const listeners = new Set();
    const ambient = { isAmbientLight: true, color: new Color() };
    const directional = { isDirectionalLight: true, color: new Color() };
    const wall = makeMaterial(), floor = makeMaterial(), ceiling = makeMaterial();
    const trim = { material: makeMaterial() };
    const face = makeMaterial();
    const objects = [ambient, directional, { userData: { isLightFixture: true }, material: [null, null, null, face] }];
    const scene = { children: [ambient, directional], add() {}, remove() {}, getObjectByName() { return null; },
        traverse(callback) { objects.forEach(callback); } };
    const roomLights = { isOn: () => on, onChange(callback) { listeners.add(callback); callback(on); return () => listeners.delete(callback); },
        setOn(value) { on = value; for (const callback of listeners) callback(on); } };
    const room = { options: { gallerySkylight: true, skylightEdgeColor: 0x666666, skylightOffEdgeColor: 0x555555 },
        app: { scene, roomLights, textureLoader: { async loadAsync(path) { return { path, dispose() {} }; } },
            THREE: { Color, Group: class { children = []; }, CylinderGeometry: class { dispose() {} },
                MeshBasicMaterial: class { color = new Color(); dispose() {} } } },
        materials: { wall, floor, ceiling }, layout: { ceiling: { material: [ceiling, makeMaterial()] }, skylightLip: { children: [trim] } },
        skylightTreeMaterial: makeMaterial(), stage: { querySelectorAll() { return []; } } };
    return { room, roomLights, ambient, directional, wall, face, trim };
}

test('enclosed rooms and hallways do not acquire sky lighting or controls', async () => {
    assert.equal(await addSkyLighting({ options: { gallerySkylight: false } }), null);
    assert.equal(await addSkyLighting({ hallway: true, options: { gallerySkylight: true } }), null);
});

test('manual periods and actual on/off flicker apply the approved profiles together', async () => {
    const { room, roomLights, ambient, directional, wall, trim } = fixture();
    const skies = [];
    const controller = await addSkyLighting(room, { computer: { setSky: sky => skies.push(sky) } });
    try {
        for (const [period, sky] of [['day', 'day'], ['dawn', 'sunset'], ['evening', 'sunset'], ['night', 'stars']]) {
            controller.setSelection(period);
            assert.equal(controller.getState().sky, sky);
            for (const on of [false, true, false, true]) {
                roomLights.setOn(on);
                const profile = SKY_DEFAULTS.skies[sky].states[on ? 'on' : 'off'].lighting;
                assert.equal(ambient.intensity, profile.ambient * profile.room);
                assert.equal(directional.intensity, profile.directional * profile.room);
                assert.deepEqual(wall.color.rgb, [profile.wall, profile.wall, profile.wall]);
                assert.equal(room.app.scene.backgroundIntensity, profile.sky);
                assert.equal(skies.at(-1), sky);
                assert.equal(trim.material.length, 6);
            }
        }
    } finally { controller.dispose(); }
    assert.equal(room.skyLighting, null);
    assert.equal(Array.isArray(trim.material), false);
});

test('computer production presets preserve every approved lighting and screen-light value', () => {
    for (const sky of ['day', 'sunset', 'stars']) for (const mode of ['on', 'off']) {
        const state = defaultComputerSkySettings(sky, mode);
        const expected = SKY_DEFAULTS.skies[sky].states[mode].computer;
        assert.deepEqual(state.profiles[mode], expected.lighting);
        assert.deepEqual(state.screenLight, expected.screenLight);
        assert.deepEqual(state.placement, expected.placement);
        assert.deepEqual(state.volumes, expected.volumes);
        assert.equal(state.screenLightPreview, false);
    }
});


test('enclosed-room computer fallback uses day/on and stars/off without modifying presets', () => {
    assert.deepEqual(computerRoomSettings(null, 'on'), defaultComputerSkySettings('day', 'on'));
    assert.deepEqual(computerRoomSettings(null, 'off'), defaultComputerSkySettings('stars', 'off'));
    assert.deepEqual(computerRoomSettings('sunset', 'off'), defaultComputerSkySettings('sunset', 'off'));
    const modified = computerRoomSettings(null, 'off');
    modified.screenLight.hue = 0;
    assert.equal(computerRoomSettings(null, 'off').screenLight.hue, 229);
});


test('enclosed galleries retain legacy off lighting despite shared skylight options', () => {
    const { createRoom, GALLERY_LIGHTING_DEFAULTS } = helpers;
    const options = { ...GALLERY_LIGHTING_DEFAULTS, gallerySkylight: true,
        ambientLight: 2.7, directionalLight: 0.55 };
    const enclosed = createRoom({ id: 'enclosed', gallery: true }, { ...options, skylightChance: 0 });
    const skylit = createRoom({ id: 'skylit', gallery: true }, { ...options, skylightChance: 100 });
    assert.equal(enclosed.options.gallerySkylight, false);
    assert.equal(enclosed.options.galleryFillIntensity, 0);
    assert.equal(enclosed.options.galleryFixtureOffColor, 0x585858);
    assert.equal(enclosed.options.galleryFixtureOffGlow, 0);
    assert.equal(enclosed.options.galleryOffEdgeColor, 0x111111);
    assert.equal(enclosed.options.ambientLight, 2.7);
    assert.equal(enclosed.options.directionalLight, 0.55);
    assert.equal(skylit.options.galleryFillIntensity, 68);
    assert.equal(skylit.options.galleryFixtureOffColor, 0xffffff);
    assert.equal(skylit.options.galleryFixtureOffGlow, 0.9);
    assert.equal(skylit.options.galleryOffEdgeColor, 0x757575);
});


test('fixtures keep their pre-skylight unlit material unless explicitly opted in', async () => {
    const source = await readFile(new URL('../public/helpers.js', import.meta.url), 'utf8');
    const code = source.slice(source.indexOf('export const createAddLightFixture'), source.indexOf('export const lightPositionsAlong'))
        .replace('export const createAddLightFixture', 'globalThis.createFixture');
    const meshes = [];
    class Material {
        constructor(options) { this.options = options; this.color = { set() {}, setRGB() {} }; }
    }
    class StandardMaterial extends Material { emissive = { setRGB() {} }; }
    const context = { THREE: { MeshStandardMaterial: StandardMaterial, MeshBasicMaterial: Material,
        BoxGeometry: class {}, Mesh: class {
            constructor(geometry, material) { this.material = material; }
            rotation = {}; position = { set() {} }; userData = {};
        } }, LIGHT_IMAGE: 'fixture.jpg', LIGHT_LENGTH: 1.35, LIGHT_WIDTH: 0.28, LIGHT_DEPTH: 0.06,
        HOUSING_COLOR: 0xb0b0b0, DROP_FROM_CEILING: 0.02, FIXTURE_ON_RGB: [14, 13.2, 11.5], FIXTURE_OFF_COLOR: 0x585858 };
    vm.runInNewContext(code, context);
    for (const reactiveFace of [false, true]) for (const isOn of [false, true]) {
        context.createFixture({ scene: { add: mesh => meshes.push(mesh) }, ceilingY: 5, reactiveFace,
            textureLoader: { load(path, callback) { callback({}); } } })(0, 0, 0, { isOn });
        const face = meshes.at(-1).material[3];
        assert.equal(Boolean(face.emissive), reactiveFace);
        assert.equal(face.options.toneMapped, false);
    }
});
