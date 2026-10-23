import { helpers } from './helpers-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const { COMPUTER_DEFAULTS, COMPUTER_BOOT, COMPUTER_SHUTDOWN, readComputerSettings, runComputerSequence, isComputerScreenLit, computerShadowProfile, defaultComputerSkySettings, readComputerSkySettings, computerSkyStorageKey } = helpers;

test('fixed settings are isolated from test storage and profile edits', () => {
    const settings = readComputerSettings(undefined, 'unused', COMPUTER_DEFAULTS.placement, {});
    assert.deepEqual(settings, { width: 31.7, rotation: 322, x: 85, y: 0.1, z: 16.5 });
    settings.x = -10;
    assert.equal(COMPUTER_DEFAULTS.placement.x, 85);
    assert.equal(COMPUTER_DEFAULTS.on.shadowStrength, 2.4);
    assert.equal(COMPUTER_DEFAULTS.off.shadowStrength, 0.8);
});

test('saved test overrides restore safely without overwriting missing defaults', () => {
    const storage = { getItem: () => JSON.stringify({ x: 500, y: -12, width: 'broken' }) };
    const settings = readComputerSettings(storage, 'test', COMPUTER_DEFAULTS.placement,
        { x: [-120, 120], y: [-120, 120], width: [0.1, 240] });
    assert.equal(settings.x, 120);
    assert.equal(settings.y, -12);
    assert.equal(settings.width, 31.7);
    assert.deepEqual(readComputerSettings({ getItem: () => '{broken' }, '', COMPUTER_DEFAULTS.off, {}), COMPUTER_DEFAULTS.off);
});

test('boot and shutdown preserve every frame, sound stage, and pause', async () => {
    const screens = [], sounds = [], pauses = [];
    const playback = { show: frame => screens.push(frame), play: async sound => sounds.push(sound), wait: async time => pauses.push(time) };
    await runComputerSequence(COMPUTER_BOOT, playback);
    await runComputerSequence(COMPUTER_SHUTDOWN, playback);
    assert.deepEqual(screens, [
        'computer-boot-0', 'computer-boot-1', 'computer-boot-2', 'computer-boot-3', 'computer-boot-4', 'computer-boot-5-complete',
        'computer-shutdown-0', 'computer-shutdown-1', 'computer-shutdown-2', 'computer-shutdown-3', 'computer-shutdown-4-complete',
    ]);
    assert.deepEqual(sounds, ['beep', 'startup', 'shutdown', 'beep']);
    assert.deepEqual(pauses, [1400, 1100, 3200, 6750, 2000, 700, 1500, 2500, 3400, 1200, 800]);
});

test('a screen remains visible until its sound completes', async () => {
    const screens = [];
    let finishSound;
    const sound = new Promise(resolve => { finishSound = resolve; });
    const playback = runComputerSequence([{ frame: 'one', pause: 1, sound: 'startup' }, { frame: 'two', pause: 1 }], {
        show: frame => screens.push(frame), play: () => sound, wait: async () => {},
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(screens, ['one']);
    finishSound();
    await playback;
    assert.deepEqual(screens, ['one', 'two']);
});

test('cancellation stops a sequence before the next screen', async () => {
    const screens = [];
    await assert.rejects(runComputerSequence(COMPUTER_BOOT, {
        show: frame => screens.push(frame), play: async () => {}, wait: async () => { throw new Error('removed'); },
    }), /removed/);
    assert.deepEqual(screens, ['computer-boot-0']);
});

test('all animation and sound assets exist and frames keep a consistent size', async () => {
    for (const { frame } of [...COMPUTER_BOOT, ...COMPUTER_SHUTDOWN]) {
        const png = await readFile(new URL(`../public/assets/rooms/models/${frame}.png`, import.meta.url));
        assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.equal(png.readUInt32BE(16), 234);
        assert.equal(png.readUInt32BE(20), 283);
    }
    for (const name of ['computer-modal', 'computer-windows-startup', 'computer-windows-shutdown']) {
        const wav = await readFile(new URL(`../public/assets/rooms/audio/${name}.wav`, import.meta.url));
        assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    }
});

test('light subscribers receive actual flicker pulses, toggles, and can unsubscribe', async () => {
    // Exercise the real helpers without importing their browser-only Three.js CDN module.
    const source = await readFile(new URL('../public/helpers.js', import.meta.url), 'utf8');
    const lights = source.slice(source.indexOf('export const createRoomLights ='), source.indexOf('const LIGHT_IMAGE =')).replace('export const', 'const');
    const startup = source.slice(source.indexOf('export const createGalleryLightStartup ='), source.indexOf('const SOUND_PREF_KEY =')).replace('export const', 'const');
    const context = { FIXTURE_OFF_COLOR: 0xffffff };
    vm.runInNewContext(lights + startup + '\nglobalThis.factories = {createRoomLights, createGalleryLightStartup};', context);
    const original = [], observed = [], timers = [];
    const roomLights = context.factories.createRoomLights({ isOn: false, onChange: on => original.push(on) });
    const unsubscribe = roomLights.onChange(on => observed.push(on));
    const flicker = context.factories.createGalleryLightStartup({ lights: roomLights, schedule: fn => { timers.push(fn); return timers.length; }, unschedule() {} });
    flicker.setOn(true);
    while (timers.length) timers.shift()();
    assert.deepEqual(observed, [false, false, true, false, true, false, true, false, true]);
    roomLights.toggle();
    assert.equal(observed.at(-1), false);
    unsubscribe();
    const count = observed.length;
    roomLights.setOn(true);
    assert.equal(observed.length, count);
    assert.equal(original.at(-1), true);
});


test('screen spill starts at boot-2 and turns off at shutdown-3', () => {
    assert.equal(isComputerScreenLit('computer-boot-0'), false);
    assert.equal(isComputerScreenLit('computer-boot-1'), false);
    for (const { frame } of COMPUTER_BOOT.slice(2)) assert.equal(isComputerScreenLit(frame), true);
    for (const { frame } of COMPUTER_SHUTDOWN.slice(0, 3)) assert.equal(isComputerScreenLit(frame), true);
    assert.equal(isComputerScreenLit('computer-shutdown-3'), false);
    assert.equal(isComputerScreenLit(COMPUTER_SHUTDOWN.at(-1).frame), false);
});

test('stars shadow is exclusive to stars with lights off', () => {
    for (const sky of ['day', 'sunset', 'sunset2', 'stars', null]) {
        assert.equal(computerShadowProfile('on', sky), 'on');
        assert.equal(computerShadowProfile('off', sky), sky === 'stars' ? 'starsOff' : 'off');
    }
    assert.deepEqual(COMPUTER_DEFAULTS.starsOff, {
        shadowX: 8.6, shadowY: 2.2, shadowZ: 1.9, shadowReach: 35, shadowStrength: 0.1, shadowDecay: 0.4,
    });
    assert.equal(COMPUTER_DEFAULTS.off.shadowStrength, 0.8);
    assert.equal(COMPUTER_DEFAULTS.on.shadowStrength, 2.4);
    assert.deepEqual(COMPUTER_DEFAULTS.screenLight, {
        enabled: true, intensity: 2.9, reach: 36, decay: 2.1, x: 0, y: 27, z: 9.6, hue: 229, saturation: 30,
    });
});


test('complete computer settings round-trip independently for each sky', () => {
    const data = new Map();
    const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    const stars = defaultComputerSkySettings();
    Object.assign(stars.placement, { x: 80, width: 25 });
    Object.assign(stars.screenLight, { intensity: 4.5, hue: 240, enabled: false });
    stars.volumes.startup = 0.03;
    stars.profiles.on.computerBrightness = 0.8;
    stars.profiles.off.shadowReach = 10;
    stars.profiles.starsOff.shadowStrength = 0.2;
    stars.autoRotation = false;
    stars.screenLightPreview = true;
    storage.setItem(computerSkyStorageKey('stars'), JSON.stringify(stars));
    assert.deepEqual(readComputerSkySettings(storage, 'stars'), stars);
    const day = readComputerSkySettings(storage, 'day');
    assert.deepEqual(day, defaultComputerSkySettings());
    day.screenLight.hue = 25;
    day.profiles.off.shadowStrength = 1.2;
    storage.setItem(computerSkyStorageKey('day'), JSON.stringify(day));
    assert.deepEqual(readComputerSkySettings(storage, 'stars'), stars);
    assert.equal(readComputerSkySettings(storage, 'day').screenLight.hue, 25);
    assert.equal(readComputerSkySettings(storage, 'day').profiles.off.shadowStrength, 1.2);
    assert.equal(readComputerSkySettings(storage, 'day').profiles.on.shadowStrength, 2.4);
});

test('resetting one saved sky leaves all other computer settings intact', () => {
    const data = new Map();
    const storage = { getItem: key => data.get(key) ?? null };
    const stars = defaultComputerSkySettings(); stars.screenLight.intensity = 9;
    const day = defaultComputerSkySettings(); day.placement.x = -25;
    data.set(computerSkyStorageKey('stars'), JSON.stringify(stars));
    data.set(computerSkyStorageKey('day'), JSON.stringify(day));
    data.set(computerSkyStorageKey('day'), JSON.stringify(defaultComputerSkySettings()));
    assert.deepEqual(readComputerSkySettings(storage, 'stars'), stars);
    assert.deepEqual(readComputerSkySettings(storage, 'day'), defaultComputerSkySettings());
});

test('existing computer tuning seeds an initial sky but saved sky settings take priority', () => {
    const legacy = defaultComputerSkySettings(); legacy.screenLight.intensity = 7;
    const empty = { getItem: () => null };
    assert.equal(readComputerSkySettings(empty, 'stars', legacy).screenLight.intensity, 7);
    assert.equal(readComputerSkySettings(empty, 'day').screenLight.intensity, 2.9);
    const stored = defaultComputerSkySettings(); stored.screenLight.intensity = 4;
    assert.equal(readComputerSkySettings({ getItem: () => JSON.stringify(stored) }, 'stars', legacy).screenLight.intensity, 4);
});


test('all six sky/light-state slots retain independent computer controls and resets', () => {
    const data = new Map();
    const storage = { getItem: key => data.get(key) ?? null };
    const skies = ['day', 'sunset', 'stars'];
    let index = 0;
    for (const sky of skies) for (const mode of ['on', 'off']) {
        const state = defaultComputerSkySettings();
        state.screenLight.intensity = ++index;
        state.placement.x = index;
        state.volumes.startup = index / 10;
        state.profiles[mode].shadowStrength = index;
        data.set(computerSkyStorageKey(sky, mode), JSON.stringify(state));
    }
    data.set(computerSkyStorageKey('stars', 'off'), JSON.stringify(defaultComputerSkySettings('stars', 'off')));
    index = 0;
    for (const sky of skies) for (const mode of ['on', 'off']) {
        ++index;
        const state = readComputerSkySettings(storage, sky, undefined, mode);
        if (sky === 'stars' && mode === 'off') assert.deepEqual(state, defaultComputerSkySettings('stars', 'off'));
        else {
            assert.equal(state.screenLight.intensity, index);
            assert.equal(state.placement.x, index);
            assert.equal(state.volumes.startup, index / 10);
            assert.equal(state.profiles[mode].shadowStrength, index);
        }
    }
});

test('older per-sky settings seed both light states without overriding new state saves', () => {
    const old = defaultComputerSkySettings(); old.screenLight.intensity = 7;
    const on = defaultComputerSkySettings(); on.screenLight.intensity = 3;
    const data = new Map([[computerSkyStorageKey('day'), JSON.stringify(old)],
        [computerSkyStorageKey('day', 'on'), JSON.stringify(on)]]);
    const storage = { getItem: key => data.get(key) ?? null };
    assert.equal(readComputerSkySettings(storage, 'day', undefined, 'on').screenLight.intensity, 3);
    assert.equal(readComputerSkySettings(storage, 'day', undefined, 'off').screenLight.intensity, 7);
});
