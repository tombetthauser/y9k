// One portable computer prop. All images and sounds resolve beside this module, never through PHP routes.
const ASSET_VERSION = new URL(import.meta.url).searchParams.get('v');
const asset = path => {
    const url = new URL(`./assets/rooms/${path}`, import.meta.url);
    if (ASSET_VERSION) url.searchParams.set('v', ASSET_VERSION);
    return url.href;
};

// Fixed production placement and lighting; the optional test editor can override local copies.
export const COMPUTER_DEFAULTS = Object.freeze({
    screenLight: Object.freeze({ enabled: true, intensity: 2.9, reach: 36, decay: 2.1,
        x: 0, y: 27, z: 9.6, hue: 229, saturation: 30 }),
    starsOff: Object.freeze({ shadowX: 8.6, shadowY: 2.2, shadowZ: 1.9,
        shadowReach: 35, shadowStrength: 0.1, shadowDecay: 0.4 }),
    volumes: Object.freeze({ startup: 0.11, shutdown: 0.06 }),
    placement: Object.freeze({ width: 31.7, rotation: 322, x: 85, y: 0.1, z: 16.5 }),
    on: Object.freeze({ shadowX: 8.6, shadowY: 2.2, shadowZ: 1.9,
        shadowReach: 37, shadowStrength: 2.4, shadowDecay: 0, computerBrightness: 1.15 }),
    off: Object.freeze({ shadowX: 8.6, shadowY: 2.2, shadowZ: 1.9,
        shadowReach: 37, shadowStrength: 0.8, shadowDecay: 0, computerBrightness: 1 }),
});
export const DEFAULT_COMPUTER_DOCUMENT_URL = 'https://docs.google.com/document/d/e/2PACX-1vS-NhUvNixeN_CbjA1c63Ukkwsz79cPiG48FbtImX9ZHTSywKDDJErJOwXP-vY_BJdD674UGCR4zHfs/pub?embedded=true';
const SOUNDS = {
    beep: asset('audio/computer-modal.wav'),
    startup: asset('audio/computer-windows-startup.wav'),
    shutdown: asset('audio/computer-windows-shutdown.wav'),
};
// Keep the picture, pause, and sound together so the sequence cannot get out of step.
export const COMPUTER_BOOT = [
    { frame: 'computer-boot-0', pause: 1400, sound: 'beep' }, // BIOS checks.
    { frame: 'computer-boot-1', pause: 1100 }, // Hardware summary.
    { frame: 'computer-boot-2', pause: 3200 }, // Windows logo.
    { frame: 'computer-boot-3', pause: 6750, sound: 'startup' }, // Desktop loads.
    { frame: 'computer-boot-4', pause: 1300 }, // Icons appear.
    { frame: 'computer-boot-5-complete', pause: 700 }, // Document application.
];
export const COMPUTER_SHUTDOWN = [
    { frame: 'computer-shutdown-0', pause: 650 }, // Application closes.
    { frame: 'computer-shutdown-1', pause: 900 }, // Confirmation.
    { frame: 'computer-shutdown-2', pause: 3400, sound: 'shutdown' }, // Please wait.
    { frame: 'computer-shutdown-3', pause: 1200 }, // Safe to turn off.
    { frame: 'computer-shutdown-4-complete', pause: 800, sound: 'beep' },
];
const OFF_FRAME = COMPUTER_SHUTDOWN.at(-1).frame;
const ON_FRAME = COMPUTER_BOOT.at(-1).frame;
const STORAGE = {
    placement: 'y9k-test-computer-4-placement-v1',
    on: 'y9k-test-computer-4-shadow-on-v1', off: 'y9k-test-computer-4-shadow-off-v2',
    starsOff: 'y9k-test-computer-stars-off-shadow-v1',
    rotation: 'y9k-test-auto-rotation',
    volumes: 'y9k-test-computer-volumes-v1',
    screenLight: 'y9k-test-computer-screen-light-v1',
};
const PLACEMENT_LIMITS = { x: [-120, 120], y: [-120, 120], z: [0, 240], width: [0.1, 240], rotation: [0, 359] };
const LIGHT_LIMITS = { shadowX: [-120, 120], shadowY: [-120, 120], shadowZ: [-120, 120],
    shadowReach: [1, 240], shadowStrength: [0, 30], shadowDecay: [0, 4], computerBrightness: [0, 2] };
const SCREEN_LIGHT_LIMITS = { intensity: [0, 30], reach: [1, 240], decay: [0, 4],
    x: [-120, 120], y: [-120, 120], z: [-120, 120], hue: [0, 359], saturation: [0, 100] };
const placementKeys = Object.keys(COMPUTER_DEFAULTS.placement);
const lightingKeys = Object.keys(COMPUTER_DEFAULTS.on);

// Early BIOS frames have no screen spill; it starts at the Windows logo and ends at the safe-to-turn-off screen.
export function isComputerScreenLit(frame) {
    return !['computer-boot-0', 'computer-boot-1', 'computer-shutdown-3', OFF_FRAME].includes(frame);
}
export function computerShadowProfile(mode, sky) {
    return mode === 'off' && sky === 'stars' ? 'starsOff' : mode;
}

export function readComputerSettings(storage, key, defaults, limits) {
    const settings = { ...defaults };
    try {
        const saved = JSON.parse(storage.getItem(key));
        for (const [name, [min, max]] of Object.entries(limits))
            if (typeof saved?.[name] === 'number' && Number.isFinite(saved[name]))
                settings[name] = Math.max(min, Math.min(max, saved[name]));
    } catch { /* Storage failures leave the fixed starter values usable. */ }
    return settings;
}

// Playback waits for both the screen pause and its sound; muted audio keeps the same timing.
export async function runComputerSequence(steps, { show, play, wait }) {
    for (const step of steps) {
        show(step.frame);
        await Promise.all([wait(step.pause), step.sound ? play(step.sound) : Promise.resolve()]);
    }
}

const mounted = new WeakMap();

// Call after room.mount(). Normal rooms use fixed defaults; editor:true retains the test controls.
export async function addComputer(room, { editor = false, documentUrl = DEFAULT_COMPUTER_DOCUMENT_URL } = {}) {
    if (!room.app) throw new Error('Mount the room before adding its computer.');
    if (mounted.has(room)) return mounted.get(room);
    const task = (async () => {
        let computer;
        room.addCustom(async context => { computer = await mountComputer(context, { editorEnabled: editor, documentUrl }); });
        await room.ready;
        return computer;
    })();
    mounted.set(room, task);
    try { return await task; }
    catch (error) { mounted.delete(room); throw error; }
}

async function mountComputer({ THREE, room, scene, layout, inchesToWorld, textureLoader }, { editorEnabled, documentUrl }) {
    const { canvas, camera, orbit, music, clickable } = room.app;
    // Load all frames before installing interactions, so the first click cannot race the images.
    const textures = {};
    const loads = await Promise.allSettled([...COMPUTER_BOOT, ...COMPUTER_SHUTDOWN].map(async ({ frame }) => {
        const map = await textureLoader.loadAsync(asset(`models/${frame}.png`));
        map.colorSpace = THREE.SRGBColorSpace;
        map.magFilter = map.minFilter = THREE.NearestFilter;
        textures[frame] = map;
    }));
    const failure = loads.find(result => result.status === 'rejected');
    if (failure) {
        Object.values(textures).forEach(map => map.dispose());
        throw failure.reason;
    }
    installStyles();
    const template = document.createElement('template');
    template.innerHTML = DIALOGS;
    const editor = template.content.querySelector('#computer-editor');
    const viewer = template.content.querySelector('#computer-document');
    if (editorEnabled) room.stage.appendChild(editor);
    room.stage.appendChild(viewer);
    const form = editor.querySelector('form');
    const iframe = viewer.querySelector('iframe');
    const address = viewer.querySelector('.document-title');
    address.textContent = address.title = documentUrl;
    const abort = new AbortController();
    let disposed = false;
    let busy = false;
    let frame = OFF_FRAME;
    let screenLightPreview = false;
    let environmentSky = null;
    let mode = room.app.roomLights.isOn() ? 'on' : 'off';
    // Production never reads the test editor's saved overrides.
    let storage;
    try { if (editorEnabled) storage = localStorage; } catch { }
    const placement = readComputerSettings(storage, STORAGE.placement, COMPUTER_DEFAULTS.placement, PLACEMENT_LIMITS);
    const profiles = {
        on: readComputerSettings(storage, STORAGE.on, COMPUTER_DEFAULTS.on, LIGHT_LIMITS),
        off: readComputerSettings(storage, STORAGE.off, COMPUTER_DEFAULTS.off, LIGHT_LIMITS),
        starsOff: readComputerSettings(storage, STORAGE.starsOff, COMPUTER_DEFAULTS.starsOff, LIGHT_LIMITS),
    };
    const shadowProfileKey = () => computerShadowProfile(mode, environmentSky);
    // Keep the two Windows chimes independently adjustable in the test editor.
    const volumes = readComputerSettings(storage, STORAGE.volumes, COMPUTER_DEFAULTS.volumes,
        { startup: [0, 1], shutdown: [0, 1] });
    const screenSettings = readComputerSettings(storage, STORAGE.screenLight, COMPUTER_DEFAULTS.screenLight, SCREEN_LIGHT_LIMITS);
    try {
        const saved = JSON.parse(storage?.getItem(STORAGE.screenLight) ?? 'null');
        if (typeof saved?.enabled === 'boolean') screenSettings.enabled = saved.enabled;
    } catch { }
    let autoRotation = true;
    if (editorEnabled) {
        try { autoRotation = storage?.getItem(STORAGE.rotation) !== '0'; } catch { }
        room.app.setAutoSpin(autoRotation ? 0.00035 : 0);
    }
    const save = (key, value) => {
        try { storage?.setItem(key, JSON.stringify(value)); } catch { }
    };
    const listen = (target, event, callback, capture = false) =>
        target.addEventListener(event, callback, { capture, signal: abort.signal });
    // Cancel pending sequence delays when this component is removed from a room.
    const wait = milliseconds => new Promise((resolve, reject) => {
        if (abort.signal.aborted) { reject(new DOMException('Computer removed', 'AbortError')); return; }
        const cancel = () => { clearTimeout(timer); reject(new DOMException('Computer removed', 'AbortError')); };
        const timer = setTimeout(() => { abort.signal.removeEventListener('abort', cancel); resolve(); }, milliseconds);
        abort.signal.addEventListener('abort', cancel, { once: true });
    });
    // Windows chimes sit below the original hardware beep in volume.
    const play = name => music.playSfx(SOUNDS[name], name === 'beep' ? 0.5 : volumes[name]);
    music.preloadSfx([SOUNDS.beep, SOUNDS.startup, SOUNDS.shutdown]);
    const aspect = textures[OFF_FRAME].image.width / textures[OFF_FRAME].image.height;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1 / aspect),
        new THREE.MeshStandardMaterial({ map: textures[OFF_FRAME], transparent: true,
            alphaTest: 0.05, side: THREE.DoubleSide }));
    plane.position.y = 0.5 / aspect;
    const pivot = new THREE.Group();
    pivot.add(plane);
    // Keep the shader dependency on the same cache version as the computer component.
    const shadowURL = new URL('./computer-shadow.js', import.meta.url);
    if (ASSET_VERSION) shadowURL.searchParams.set('v', ASSET_VERSION);
    const { addNeutralComputerShadow } = await import(shadowURL.href);
    // The neutral surface shader darkens toward black even under colored room lighting.
    const shadowMaterials = [...Object.values(room.materials),
        ...[].concat(layout.ceiling.material), ...(layout.skylightLip?.children.map(mesh => mesh.material) ?? [])];
    const neutralShadow = addNeutralComputerShadow(THREE, shadowMaterials);
    const shadowCenter = neutralShadow.uniforms.computerShadowCenter.value;
    const screenLight = new THREE.PointLight(0xffffff);
    screenLight.name = 'computer-screen-light';
    scene.add(pivot, screenLight);
    clickable.push(plane);

    const update = () => {
        const lighting = profiles[mode];
        const shadowLighting = profiles[shadowProfileKey()];
        plane.material.map = textures[frame];
        plane.material.color.setScalar(lighting.computerBrightness);
        pivot.position.set(0, 0, 0);
        pivot.scale.setScalar(inchesToWorld(placement.width));
        pivot.rotation.y = placement.rotation * Math.PI / 180;
        pivot.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(pivot);
        pivot.position.set(inchesToWorld(placement.x), layout.floorY + inchesToWorld(placement.y),
            layout.bounds.minZ + inchesToWorld(placement.z) - bounds.min.z);
        pivot.updateMatrixWorld(true);
        const worldBounds = new THREE.Box3().setFromObject(pivot);
        neutralShadow.uniforms.computerShadowStrength.value = shadowLighting.shadowStrength;
        neutralShadow.uniforms.computerShadowReach.value = inchesToWorld(shadowLighting.shadowReach);
        neutralShadow.uniforms.computerShadowDecay.value = shadowLighting.shadowDecay;
        shadowCenter.set(pivot.position.x + inchesToWorld(shadowLighting.shadowX),
            Math.max(layout.floorY + inchesToWorld(12), worldBounds.min.y + inchesToWorld(12)) + inchesToWorld(shadowLighting.shadowY),
            Math.max(layout.bounds.minZ + inchesToWorld(6), worldBounds.min.z - inchesToWorld(6)) + inchesToWorld(shadowLighting.shadowZ));
        // Offsets are relative to the computer: positive Z moves in front of the screen.
        screenLight.position.set(inchesToWorld(screenSettings.x), inchesToWorld(screenSettings.y), inchesToWorld(screenSettings.z))
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), pivot.rotation.y).add(pivot.position);
        screenLight.color.setHSL(screenSettings.hue / 360, screenSettings.saturation > 0 ? 1 : 0,
            1 - screenSettings.saturation / 200, THREE.SRGBColorSpace);
        screenLight.intensity = screenSettings.enabled && (isComputerScreenLit(frame) || screenLightPreview) ? screenSettings.intensity : 0;
        screenLight.distance = inchesToWorld(screenSettings.reach);
        screenLight.decay = screenSettings.decay;
    };
    const show = next => { if (!disposed) { frame = next; update(); } };
    const sequence = steps => runComputerSequence(steps, { show, play, wait });
    const open = async () => {
        if (disposed || busy || viewer.open || editor.open) return;
        busy = true;
        try {
            await sequence(COMPUTER_BOOT);
            if (disposed) return;
            iframe.src = documentUrl;
            viewer.showModal();
            play('beep');
            viewer.querySelector('button').blur();
        } catch (error) { if (!disposed) console.error('Computer startup failed:', error); }
        finally { busy = false; }
    };
    listen(viewer, 'close', async () => {
        if (disposed) return;
        busy = true;
        try {
            play('beep');
            iframe.removeAttribute('src');
            show(ON_FRAME);
            await wait(1000);
            await sequence(COMPUTER_SHUTDOWN);
        } catch (error) { if (!disposed) console.error('Computer shutdown failed:', error); }
        finally { busy = false; }
    });
    let pressedOutside = false;
    const outside = event => {
        const rect = viewer.getBoundingClientRect();
        return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    listen(viewer, 'pointerdown', event => { pressedOutside = event.button === 0 && outside(event); });
    listen(viewer, 'pointercancel', () => { pressedOutside = false; });
    listen(viewer, 'click', event => {
        if (pressedOutside && outside(event)) viewer.close();
        pressedOutside = false;
    });
    for (const dialog of [viewer, editor]) listen(dialog, 'keydown', event => event.stopPropagation());

    const syncEditor = () => {
        for (const key of ['x', 'y', 'z', 'width', ...lightingKeys]) {
            const value = key in placement ? placement[key]
                : key.startsWith('shadow') ? profiles[shadowProfileKey()][key] : profiles[mode][key];
            form.elements[key].value = value;
            const unit = ['shadowStrength', 'shadowDecay', 'computerBrightness'].includes(key) ? '' : ' in';
            editor.querySelector(`[data-value="${key}"]`).textContent = `${value.toFixed(key === 'computerBrightness' ? 2 : 1)}${unit}`;
        }
        form.elements.angle.value = placement.rotation;
        form.elements.rotation.value = [0, 90, 180, 270].includes(placement.rotation) ? String(placement.rotation) : '';
        editor.querySelector('[data-value="angle"]').textContent = `${placement.rotation}°`;
        editor.querySelector('legend').textContent = `lighting · lights ${mode}${shadowProfileKey() === 'starsOff' ? ' · stars shadow' : ''}`;
        editor.querySelector('#computer-shadow-controls').hidden = false;
        form.elements.autoRotation.checked = autoRotation;
        for (const name of ['startup', 'shutdown']) {
            form.elements[`${name}Volume`].value = volumes[name];
            editor.querySelector(`[data-value="${name}Volume"]`).textContent = `${Math.round(volumes[name] * 100)}%`;
        }
        editor.querySelector('#computer-editor-title').textContent = 'computer · placement and lighting';
    };
    if (editorEnabled) {
        listen(form, 'input', event => {
            const key = event.target.name;
            if (key === 'startupVolume' || key === 'shutdownVolume') {
                volumes[key === 'startupVolume' ? 'startup' : 'shutdown'] = Number(event.target.value);
                save(STORAGE.volumes, volumes);
                syncEditor();
                return;
            }
            if (key === 'autoRotation') {
                autoRotation = event.target.checked;
                room.app.setAutoSpin(autoRotation ? 0.00035 : 0);
                try { storage?.setItem(STORAGE.rotation, autoRotation ? '1' : '0'); } catch { }
                return;
            }
            if (key === 'rotation' || key === 'angle') placement.rotation = Number(event.target.value);
            else if (placementKeys.includes(key)) placement[key] = Number(event.target.value);
            else if (lightingKeys.includes(key)) profiles[key.startsWith('shadow') ? shadowProfileKey() : mode][key] = Number(event.target.value);
            update();
            syncEditor();
            save(STORAGE.placement, placement);
            save(STORAGE[mode], profiles[mode]);
            if (shadowProfileKey() === 'starsOff') save(STORAGE.starsOff, profiles.starsOff);
        });
        listen(form.elements.restoreDefaults, 'click', () => {
            Object.assign(placement, COMPUTER_DEFAULTS.placement);
            Object.assign(volumes, COMPUTER_DEFAULTS.volumes);
            Object.assign(screenSettings, COMPUTER_DEFAULTS.screenLight);
            save(STORAGE.screenLight, screenSettings);
            save(STORAGE.volumes, volumes);
            profiles.on = { ...COMPUTER_DEFAULTS.on };
            profiles.off = { ...COMPUTER_DEFAULTS.off };
            profiles.starsOff = { ...COMPUTER_DEFAULTS.starsOff };
            save(STORAGE.placement, placement);
            save(STORAGE.on, profiles.on);
            save(STORAGE.off, profiles.off);
            save(STORAGE.starsOff, profiles.starsOff);
            update();
            syncEditor();
        });
    }
    const unsubscribeLights = room.app.roomLights.onChange(on => {
        mode = on ? 'on' : 'off';
        update();
        if (editor.open) syncEditor();
    });

    // Capture only computer presses; other props and the room keep their own handlers.
    const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
    let press = null;
    const cancelPress = () => { if (press) clearTimeout(press.timer); press = null; };
    listen(canvas, 'pointerdown', event => {
        if (event.button !== 0 || event.isPrimary === false) { cancelPress(); return; }
        const rect = canvas.getBoundingClientRect();
        pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
        ray.setFromCamera(pointer, camera);
        const hit = ray.intersectObjects(scene.children, true).find(hit => {
            for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
            return hit.object.isMesh;
        });
        if (hit?.object !== plane) return;
        event.stopImmediatePropagation();
        cancelPress();
        press = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, dragged: false, held: false };
        canvas.setPointerCapture(event.pointerId);
        if (editorEnabled) press.timer = setTimeout(() => {
            if (!press || press.dragged || busy) return;
            press.held = true;
            syncEditor();
            editor.showModal();
        }, 1650);
    }, true);
    listen(canvas, 'pointermove', event => {
        if (!press || press.id !== event.pointerId) return;
        event.stopImmediatePropagation();
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) {
            press.dragged = true;
            clearTimeout(press.timer);
        }
        if (press.dragged && !press.held) {
            const delta = (event.clientX - press.lastX) * 0.005;
            orbit.setAngle(orbit.getAngle() + delta);
            room._onUserRotate(delta);
        }
        press.lastX = event.clientX;
    }, true);
    listen(canvas, 'pointerup', event => {
        if (!press || press.id !== event.pointerId) return;
        event.stopImmediatePropagation();
        const clicked = !press.dragged && !press.held;
        cancelPress();
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (clicked) open();
    }, true);
    for (const event of ['pointercancel', 'lostpointercapture']) listen(canvas, event, cancelPress, true);
    listen(window, 'blur', cancelPress);

    return {
        open,
        close() { if (viewer.open) viewer.close(); },
        // Let test-room workshops tune a lighting profile without opening another dialog.
        setSky(sky) {
            if (disposed || environmentSky === sky) return;
            environmentSky = sky;
            update();
            if (editor.open) syncEditor();
        },
        getScreenLight() { return { ...screenSettings, preview: screenLightPreview }; },
        setScreenLightPreview(on) {
            if (disposed) return;
            screenLightPreview = !!on;
            update();
        },
        setScreenLight(patch) {
            if (disposed) return;
            if (typeof patch.enabled === 'boolean') screenSettings.enabled = patch.enabled;
            for (const [key, value] of Object.entries(patch)) {
                if (!Object.hasOwn(SCREEN_LIGHT_LIMITS, key) || !Number.isFinite(value)) continue;
                const [min, max] = SCREEN_LIGHT_LIMITS[key];
                screenSettings[key] = Math.max(min, Math.min(max, value));
            }
            save(STORAGE.screenLight, screenSettings);
            update();
        },
        getLighting(state) { return { ...profiles[state] }; },
        setLighting(state, patch) {
            if (disposed || !Object.hasOwn(profiles, state)) return;
            for (const [key, value] of Object.entries(patch)) {
                if (!Object.hasOwn(LIGHT_LIMITS, key) || !Number.isFinite(value)) continue;
                const [min, max] = LIGHT_LIMITS[key];
                profiles[state][key] = Math.max(min, Math.min(max, value));
            }
            save(STORAGE[state], profiles[state]);
            if (state === mode || state === shadowProfileKey()) { update(); if (editor.open) syncEditor(); }
        },
        // Removal cleans up this component without touching room audio, lighting, or other props.
        dispose() {
            if (disposed) return;
            disposed = true;
            unsubscribeLights();
            abort.abort();
            cancelPress();
            if (viewer.open) viewer.close();
            if (editor.open) editor.close();
            iframe.removeAttribute('src');
            viewer.remove();
            editor.remove();
            scene.remove(pivot, screenLight);
            const index = clickable.indexOf(plane);
            if (index !== -1) clickable.splice(index, 1);
            plane.geometry.dispose();
            plane.material.dispose();
            Object.values(textures).forEach(map => map.dispose());
            neutralShadow.dispose();
            screenLight.dispose();
            mounted.delete(room);
        },
    };
}

function installStyles() {
    if (document.getElementById('computer-styles')) return;
    const link = document.createElement('link');
    link.id = 'computer-styles';
    link.rel = 'stylesheet';
    const url = new URL('./computer.css', import.meta.url);
    if (ASSET_VERSION) url.searchParams.set('v', ASSET_VERSION);
    link.href = url.href;
    document.head.appendChild(link);
}

// Trusted component markup; no document content or URLs are interpolated here.
const DIALOGS = `
    <!-- Share the artwork dialog's yellow styling and bottom-left placement. -->
    <dialog id="computer-editor" class="wall-image-editor" aria-labelledby="computer-editor-title">
        <form method="dialog">
            <div class="wall-editor-header">
                <div id="computer-editor-title" class="wall-editor-filename">computer placement</div>
                <button type="submit" name="close" aria-label="close computer editor">x</button>
            </div>
            <p>X is from the wall center; Y is above or below the floor.<br>Z is the distance from the north wall.<br>Computer settings are saved in this browser.</p>
            <label><span class="modal-label">x</span>: <input name="x" type="range" min="-120" max="120" step="0.1" value="0"><output data-value="x"></output></label><br>
            <label><span class="modal-label">y</span>: <input name="y" type="range" min="-120" max="120" step="0.1" value="0"><output data-value="y"></output></label><br>
            <label><span class="modal-label">z</span>: <input name="z" type="range" min="0" max="240" step="0.1" value="3"><output data-value="z"></output></label><br>
            <label><span class="modal-label">width</span>: <input name="width" type="range" min="0.1" max="240" step="0.1" value="48"><output data-value="width"></output></label><br>
            <label><span class="modal-label">rotation</span>: <select name="rotation" aria-label="computer rotation"><option value="" disabled>custom</option><option value="0">north</option><option value="270">east</option><option value="180">south</option><option value="90">west</option></select></label><br>
            <label><span class="modal-label">angle</span>: <input name="angle" type="range" min="0" max="359" step="1" value="0"><output data-value="angle"></output></label><br>
            <label><span class="modal-label">auto rotation</span>: <input name="autoRotation" type="checkbox" checked></label><br>
            <label><span class="modal-label">startup volume</span>: <input name="startupVolume" type="range" min="0" max="1" step="0.01" value="0.2"><output data-value="startupVolume"></output></label><br>
            <label><span class="modal-label">shutdown volume</span>: <input name="shutdownVolume" type="range" min="0" max="1" step="0.01" value="0.2"><output data-value="shutdownVolume"></output></label><br>
            <fieldset id="computer-shadow-controls" hidden>
                <legend>lighting</legend>
                <label><span class="modal-label">computer brightness</span>: <input name="computerBrightness" type="range" min="0" max="2" step="0.05" value="1"><output data-value="computerBrightness"></output></label><br>
                <p>Position offsets are in room axes, relative to the shadow's starting position.<br>Strength 0 turns it off; higher falloff makes the effect more localized.</p>
                <label><span class="modal-label">shadow x</span>: <input name="shadowX" type="range" min="-120" max="120" step="0.1" value="0"><output data-value="shadowX"></output></label><br>
                <label><span class="modal-label">shadow y</span>: <input name="shadowY" type="range" min="-120" max="120" step="0.1" value="0"><output data-value="shadowY"></output></label><br>
                <label><span class="modal-label">shadow z</span>: <input name="shadowZ" type="range" min="-120" max="120" step="0.1" value="0"><output data-value="shadowZ"></output></label><br>
                <label><span class="modal-label">size / reach</span>: <input name="shadowReach" type="range" min="1" max="240" step="1" value="72"><output data-value="shadowReach"></output></label><br>
                <label><span class="modal-label">strength</span>: <input name="shadowStrength" type="range" min="0" max="30" step="0.1" value="4"><output data-value="shadowStrength"></output></label><br>
                <label><span class="modal-label">falloff</span>: <input name="shadowDecay" type="range" min="0" max="4" step="0.1" value="2"><output data-value="shadowDecay"></output></label><br>
            </fieldset>
            <div class="wall-editor-actions">
                <button type="button" name="restoreDefaults">restore defaults</button>
                <button type="submit">done</button>
            </div>
        </form>
    </dialog>
    <dialog id="computer-document" aria-label="Computer document viewer">
        <div class="document-frame">
            <div class="document-banner">
                <div class="document-title" aria-label="Document URL"></div>
                <form method="dialog" class="document-close"><button aria-label="close document viewer">x</button></form>
            </div>
            <div class="document-viewport">
                <div class="document-clip">
                    <iframe title="Computer Google document" referrerpolicy="no-referrer"></iframe>
                </div>
            </div>
        </div>
    </dialog>
`;
