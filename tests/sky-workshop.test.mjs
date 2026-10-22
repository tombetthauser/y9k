import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { SKY_OPTIONS, SKY_CONTROLS, createSkySettings, getSkyForHour, hsvToRgb, restoreSkySettings } from '../public/sky-workshop.js';

test('browser-hour schedule covers day, both sunsets, midnight, and boundaries', () => {
    const schedule = [[0, 'stars'], [5.99, 'stars'], [6, 'day'], [16.99, 'day'],
        [17, 'sunset'], [18.49, 'sunset'], [18.5, 'sunset2'], [19.99, 'sunset2'], [20, 'stars'], [24, 'stars']];
    for (const [hour, expected] of schedule) assert.equal(getSkyForHour(hour), expected);
    assert.equal(getSkyForHour(8, { dayStart: 9, sunsetStart: 18, nightStart: 22 }), 'stars');
    assert.equal(getSkyForHour(20, { dayStart: 9, sunsetStart: 18, nightStart: 22 }), 'sunset2');
});

test('each sky and electric-light state has an independent editable profile', () => {
    const settings = createSkySettings({ ambientLight: 3, galleryFillIntensity: 60 });
    assert.equal(settings.profiles.day.on.ambient, 3);
    assert.equal(settings.profiles.day.off.fill, 60);
    settings.profiles.day.on.sky = 0.2;
    settings.profiles.stars.off.fill = 1;
    assert.equal(settings.profiles.day.off.sky, 1);
    assert.equal(settings.profiles.stars.on.sky, 0.7);
    assert.equal(settings.profiles.day.off.fill, 60);
});

test('saved settings restore without losing defaults or accepting invalid profiles/schedules', () => {
    const defaults = createSkySettings();
    const restored = restoreSkySettings({ selection: 'sunset2', dayStart: 10, sunsetStart: 5, nightStart: 22,
        profiles: { sunset2: { off: { sky: -5, hue: 28, saturation: 200, room: 'bad' } } } }, defaults);
    assert.equal(restored.selection, 'sunset2');
    assert.equal(restored.dayStart, 6);
    assert.equal(restored.sunsetStart, 17);
    assert.equal(restored.profiles.sunset2.off.sky, 0);
    assert.equal(restored.profiles.sunset2.off.hue, 28);
    assert.equal(restored.profiles.sunset2.off.saturation, 100);
    assert.equal(restored.profiles.sunset2.off.room, defaults.profiles.sunset2.off.room);
    assert.deepEqual(restoreSkySettings(null, defaults), defaults);
    assert.equal(defaults.profiles.sunset2.off.sky, 1);
});

test('valid custom schedules and per-state values survive a storage round-trip', () => {
    const settings = createSkySettings();
    settings.dayStart = 7; settings.sunsetStart = 16; settings.nightStart = 21;
    settings.selection = 'stars';
    settings.profiles.stars.on.trees = 0.5;
    settings.profiles.stars.off.trees = 0.1;
    assert.deepEqual(restoreSkySettings(JSON.parse(JSON.stringify(settings)), createSkySettings()), settings);
});

test('circular picker has a white center and the expected hue colors', () => {
    assert.deepEqual(hsvToRgb(125, 0), [1, 1, 1]);
    assert.deepEqual(hsvToRgb(0, 1), [1, 0, 0]);
    assert.deepEqual(hsvToRgb(120, 1), [0, 1, 0]);
    assert.deepEqual(hsvToRgb(240, 1), [0, 0, 1]);
    assert.deepEqual(hsvToRgb(360, 1), [1, 0, 0]);
    assert.deepEqual(hsvToRgb(-120, 1), [0, 0, 1]);
});

test('all manually selectable skies point to existing PNGs, including both sunsets', async () => {
    for (const sky of Object.values(SKY_OPTIONS)) {
        const image = await readFile(new URL('../public/' + sky.path.slice(2), import.meta.url));
        assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    }
});

test('sky click opens only through the hole; dragging turns the room; fixtures block sky clicks', async () => {
    const source = await readFile(new URL('../public/sky-workshop.js', import.meta.url), 'utf8');
    const code = source.slice(source.indexOf('function bindSkyClick'), source.indexOf('function makePanel'));
    const handlers = {};
    let hits = [], opened = 0, angle = 0;
    const room = { layout: { ceilingY: 3 }, options: { skylightThickness: 6, skylightWidth: 12 }, _onUserRotate() {} };
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
        setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} };
    const THREE = {
        Vector2: class { set() {} }, Vector3: class {},
        Raycaster: class {
            ray = { origin: { y: 0 }, direction: { y: 1 }, at(t, point) { point.x = 0; point.z = 0; } };
            setFromCamera() {} intersectObjects() { return hits; }
        },
    };
    const context = { window: {}, room, THREE, canvas, camera: {}, scene: { children: [] },
        orbit: { setAngle: value => { angle = value; }, getAngle: () => angle },
        listen(target, type, handler) { if (target === canvas) handlers[type] = handler; }, open() { opened++; } };
    vm.runInNewContext(code + '\nbindSkyClick({room, THREE, canvas, camera, scene, orbit, listen, open});', context);
    const event = (x = 50) => ({ button: 0, isPrimary: true, pointerId: 1, clientX: x, clientY: 50, stopImmediatePropagation() {} });
    handlers.pointerdown(event()); handlers.pointerup(event());
    assert.equal(opened, 1);
    handlers.pointerdown(event()); handlers.pointermove(event(60)); handlers.pointerup(event(60));
    assert.equal(opened, 1); assert.ok(angle > 0);
    hits = [{ distance: 1, object: { isMesh: true, visible: true } }];
    handlers.pointerdown(event()); handlers.pointerup(event());
    assert.equal(opened, 1);
});


test('workshop dropdowns and sliders have distinct form names', async () => {
    const source = await readFile(new URL('../public/sky-workshop.js', import.meta.url), 'utf8');
    const context = { SKY_OPTIONS, SKY_CONTROLS };
    vm.runInNewContext(source.slice(source.indexOf('function makePanel')) + '\nglobalThis.markup = makePanel();', context);
    const names = [...context.markup.matchAll(/name="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(names).size, names.length, 'duplicate form names create a RadioNodeList instead of a control');
    assert.ok(names.includes('skySelection'));
    assert.ok(names.includes('sky'));
});


test('lip color and thick vertical line settings persist independently of room hue', () => {
    const settings = createSkySettings();
    Object.assign(settings.profiles.day.on, { hue: 120, saturation: 80, lipHue: 30, lipSaturation: 70,
        verticalThickness: 0.5, verticalBrightness: 0.4 });
    const saved = restoreSkySettings(JSON.parse(JSON.stringify(settings)), createSkySettings());
    assert.equal(saved.profiles.day.on.hue, 120);
    assert.equal(saved.profiles.day.on.lipHue, 30);
    assert.equal(saved.profiles.day.on.lipSaturation, 70);
    assert.equal(saved.profiles.day.on.verticalThickness, 0.5);
    assert.equal(saved.profiles.day.on.verticalBrightness, 0.4);
    assert.equal(saved.profiles.day.off.lipSaturation, 0);
});


test('stars / lights-off hardcoded defaults match the workshop screenshots', () => {
    const settings = createSkySettings();
    const night = settings.profiles.stars.off;
    for (const [key, value] of Object.entries({ room: 0.3, sky: 0.55, trees: 0.05, reveal: 0.1, trim: 0.5,
        wall: 0.95, floor: 1.1, ceiling: 1, roomEdges: 0, edges: 0.1, verticalThickness: 0.07,
        verticalBrightness: 0, ambient: 0.1, directional: 0.55, fill: 20, daylight: 0.05, fixtures: 1, fixtureGlow: 0.25 }))
        assert.equal(night[key], value, key);
    const lipHex = '#' + hsvToRgb(night.lipHue, night.lipSaturation / 100)
        .map(value => Math.round(value * 255).toString(16).padStart(2, '0')).join('');
    assert.equal(lipHex, '#d3e8ff');
    assert.equal(settings.profiles.day.off.sky, 1);
    assert.equal(settings.profiles.stars.on.sky, 0.7);
});
