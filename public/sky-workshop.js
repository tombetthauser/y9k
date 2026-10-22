// Test-room sky workshop. Its settings and listeners are independent of production room setup.
const version = new URL(import.meta.url).searchParams.get('v');
const url = path => {
    const result = new URL(path, import.meta.url);
    if (version) result.searchParams.set('v', version);
    return result.href;
};
export const SKY_OPTIONS = Object.freeze({
    day: { label: 'Current day sky', path: './assets/rooms/images/static_images/windows.png' },
    stars: { label: 'Stars 1', path: './assets/rooms/images/skies/stars-1.png' },
    sunset: { label: 'Doom sunset', path: './assets/rooms/images/skies/doom-sunset.png' },
    sunset2: { label: 'Doom sunset 2', path: './assets/rooms/images/skies/doom-sunset-2.png' },
});
const STORAGE_KEY = 'y9k-test-sky-workshop-v1';
// Every slider is a separate value in each sky's lights-on and lights-off profile.
export const SKY_CONTROLS = Object.freeze({
    room: ['Room light brightness', 0, 3, 0.05],
    sky: ['Sky brightness', 0, 3, 0.05],
    trees: ['Trees brightness', 0, 3, 0.05],
    reveal: ['Inside opening brightness', 0, 3, 0.05],
    trim: ['Skylight lip brightness', 0, 3, 0.05],
    wall: ['Walls brightness', 0, 2, 0.05],
    floor: ['Floor brightness', 0, 2, 0.05],
    ceiling: ['Ceiling brightness', 0, 2, 0.05],
    roomEdges: ['Room edge line brightness', 0, 3, 0.05],
    edges: ['Skylight edge line brightness', 0, 3, 0.05],
    verticalThickness: ['4 inside lines thickness (inches)', 0, 2, 0.01],
    verticalBrightness: ['4 inside lines brightness', 0, 3, 0.05],
    ambient: ['Ambient light', 0, 6, 0.05],
    directional: ['Directional light', 0, 4, 0.05],
    fill: ['Center fill light', 0, 150, 0.5],
    daylight: ['Skylight daylight', 0, 3, 0.05],
    fixtures: ['Fixture face brightness', 0, 3, 0.05],
    fixtureGlow: ['Fixture glow', 0, 3, 0.05],
    hue: ['Selected color hue', 0, 359, 1],
    saturation: ['Selected color saturation', 0, 100, 1],
});

export function getSkyForHour(hour, { dayStart = 6, sunsetStart = 17, nightStart = 20 } = {}) {
    const time = ((hour % 24) + 24) % 24;
    if (time < dayStart || time >= nightStart) return 'stars';
    if (time < sunsetStart) return 'day';
    return time < (sunsetStart + nightStart) / 2 ? 'sunset' : 'sunset2';
}

// HSV keeps white at the wheel center and full-saturation colors around the rim.
export function hsvToRgb(hue, saturation, value = 1) {
    const h = ((hue % 360) + 360) % 360 / 60;
    const s = Math.max(0, Math.min(1, saturation));
    const c = value * s, x = c * (1 - Math.abs(h % 2 - 1)), m = value - c;
    const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x]
        : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m];
}

export function createSkySettings(options = {}) {
    const common = { room: 1, sky: 1, trees: 1, reveal: 1, trim: 1, wall: 1, floor: 1,
        ceiling: 1, roomEdges: 1, edges: 1, verticalThickness: 0.12, verticalBrightness: 1,
        hue: 0, saturation: 0, lipHue: 0, lipSaturation: 0, fixtures: 1 };
    const on = { ...common, ambient: options.ambientLight ?? 2.7, directional: options.directionalLight ?? 0.55,
        fill: 0, daylight: 0, fixtureGlow: options.galleryFixtureBrightness ?? 1 };
    const off = { ...common, ambient: options.galleryOffAmbientLight ?? 0.05,
        directional: options.galleryOffDirectionalLight ?? 0.04, fill: options.galleryFillIntensity ?? 68,
        daylight: options.skylightLightIntensity ?? 0.35, fixtureGlow: options.galleryFixtureOffGlow ?? 0.9 };
    return {
        selection: 'auto', dayStart: 6, sunsetStart: 17, nightStart: 20,
        profiles: {
            day: { on: { ...on }, off: { ...off } },
            sunset: { on: { ...on, trees: 0.65, reveal: 0.7 },
                off: { ...off, room: 0.75, trees: 0.55, reveal: 0.65, hue: 28, saturation: 30, daylight: 0.2 } },
            sunset2: { on: { ...on, trees: 0.4, reveal: 0.45 },
                off: { ...off, room: 0.5, trees: 0.3, reveal: 0.4, hue: 20, saturation: 40, daylight: 0.1 } },
            stars: { on: { ...on, sky: 0.7, trees: 0.15, reveal: 0.2 },
                off: { ...off, room: 0.3, sky: 0.55, trees: 0.05, reveal: 0.1, trim: 0.5,
                    wall: 0.95, floor: 1.1, ceiling: 1, roomEdges: 0, edges: 0.1,
                    verticalThickness: 0.07, verticalBrightness: 0, ambient: 0.1, directional: 0.55,
                    hue: 215, saturation: 20, lipHue: 211.363636, lipSaturation: 17.254902,
                    fill: 20, daylight: 0.05, fixtures: 1, fixtureGlow: 0.25 } },
        },
    };
}

export function restoreSkySettings(saved, defaults) {
    const settings = structuredClone(defaults);
    if (!saved || typeof saved !== 'object') return settings;
    if (saved.selection === 'auto' || Object.hasOwn(SKY_OPTIONS, saved.selection)) settings.selection = saved.selection;
    const schedule = ['dayStart', 'sunsetStart', 'nightStart'].map(key => saved[key]);
    if (schedule.every(Number.isFinite) && schedule[0] >= 0 && schedule[0] < schedule[1]
        && schedule[1] < schedule[2] && schedule[2] <= 24)
        for (const key of ['dayStart', 'sunsetStart', 'nightStart']) settings[key] = saved[key];
    for (const sky of Object.keys(SKY_OPTIONS)) for (const mode of ['on', 'off']) {
        for (const [key, [, min, max]] of Object.entries({ ...SKY_CONTROLS, lipHue: ['Lip hue', 0, 359], lipSaturation: ['Lip saturation', 0, 100] })) {
            const value = saved.profiles?.[sky]?.[mode]?.[key];
            if (typeof value === 'number' && Number.isFinite(value))
                settings.profiles[sky][mode][key] = Math.max(min, Math.min(max, value));
        }
    }
    return settings;
}

export async function addSkyWorkshop(room, { computer = null } = {}) {
    if (!room.app || !room.options.gallerySkylight) throw new Error('The sky workshop needs a mounted skylight gallery.');
    const { THREE, scene, textureLoader, canvas, camera, orbit, roomLights } = room.app;
    const defaults = createSkySettings(room.options);
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { }
    let settings = restoreSkySettings(saved, defaults);
    // Let the gallery finish setting its original background before replacing it.
    await room.skylightSkyReady;
    const originalBackground = scene.background;
    const originalIntensity = scene.backgroundIntensity;
    const textures = {};
    const results = await Promise.allSettled(Object.entries(SKY_OPTIONS).map(async ([key, sky]) => {
        const texture = await textureLoader.loadAsync(url(sky.path));
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = texture.minFilter = THREE.NearestFilter;
        textures[key] = texture;
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) { Object.values(textures).forEach(texture => texture.dispose()); throw failure.reason; }
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = url('./sky-workshop.css'); document.head.appendChild(link);
    const panel = document.createElement('dialog');
    panel.id = 'sky-workshop'; panel.className = 'wall-image-editor';
    panel.setAttribute('aria-labelledby', 'sky-workshop-title');
    panel.innerHTML = makePanel();
    room.stage.appendChild(panel);
    const form = panel.querySelector('form'), fields = form.elements;
    const controller = new AbortController();
    const listen = (target, type, handler, capture = false) =>
        target.addEventListener(type, handler, { capture, signal: controller.signal });
    const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { } };
    let currentSky = '', mode = roomLights.isOn() ? 'on' : 'off';
    const ambient = scene.children.find(object => object.isAmbientLight && object !== room.skylightDaylight);
    const directional = scene.children.find(object => object.isDirectionalLight);
    const lightColors = new Map([ambient, directional, room.galleryFillLight, room.skylightDaylight]
        .filter(Boolean).map(light => [light, light.color.clone()]));
    const surfaces = Object.fromEntries(Object.entries(room.materials).map(([name, material]) =>
        [name, { material, color: material.color.clone() }]));
    const reveal = Array.isArray(room.layout.ceiling.material) ? room.layout.ceiling.material[1] : null;
    const revealColor = reveal?.color.clone();
    const trim = room.layout.skylightLip?.children[0]?.material;
    const trimColor = trim?.color.clone();
    const lines = scene.children.filter(object => object.isLineSegments);
    const edgeColor = (object, on) => object.name === 'skylight-edge-lines'
        ? (on ? room.options.skylightLipEdgeColor : room.options.skylightLipOffEdgeColor)
        : object.name === 'skylight-vertical-lines'
            ? (on ? room.options.skylightEdgeColor : room.options.skylightOffEdgeColor)
            : (on ? room.options.cornerLines : room.options.galleryOffEdgeColor);
    const baseLines = new Map(lines.map(line => [line, {
        on: new THREE.Color(typeof edgeColor(line, true) === 'number' ? edgeColor(line, true) : 0xc4c4c8),
        off: new THREE.Color(edgeColor(line, false) ?? 0x757575),
    }]));
    let disposed = false;
    const wheel = panel.querySelector('canvas'), wheelContext = wheel.getContext('2d');
    drawWheel(wheel, wheelContext);
    const profile = () => settings.profiles[currentSky][mode];
    const format = (key, value) => key.endsWith('Hue') || key === 'hue' ? `${value.toFixed(0)}°`
        : key === 'saturation' ? `${value.toFixed(0)}%` : value.toFixed(2);
    const computerControls = {
        shadowX: ['Shadow X offset', -120, 120, 0.1], shadowY: ['Shadow Y offset', -120, 120, 0.1],
        shadowZ: ['Shadow Z offset', -120, 120, 0.1], shadowReach: ['Size / reach', 1, 240, 1],
        shadowStrength: ['Strength', 0, 30, 0.1], shadowDecay: ['Falloff', 0, 4, 0.1],
    };
    const computerSection = panel.querySelector('[data-computer-shadow]');
    computerSection.hidden = !computer;
    if (computer) {
        computerSection.insertAdjacentHTML('beforeend', Object.entries(computerControls).map(([key, [label, min, max, step]]) =>
            `<label class="sky-slider"><span>${label}</span><input name="computer-${key}" aria-label="Computer lights-off ${label}" type="range" min="${min}" max="${max}" step="${step}"><output data-computer-output="${key}"></output></label>`).join(''));
    }
    const syncComputerControls = () => {
        if (!computer) return;
        const values = computer.getLighting('starsOff');
        for (const key of Object.keys(computerControls)) {
            fields[`computer-${key}`].value = values[key];
            panel.querySelector(`[data-computer-output="${key}"]`).textContent =
                `${values[key].toFixed(1)}${['shadowStrength', 'shadowDecay'].includes(key) ? '' : ' in'}`;
        }
    };
    // Cylinders give the four inside lines a real thickness; WebGL line width is usually fixed at 1px.
    const originalVerticals = scene.getObjectByName('skylight-vertical-lines');
    const cornerGroup = new THREE.Group();
    cornerGroup.name = 'workshop-skylight-corner-lines';
    const cornerGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
    const cornerMaterial = new THREE.MeshBasicMaterial({ color: 0x666666, toneMapped: false });
    const cornerLengths = [];
    if (originalVerticals) {
        const positions = originalVerticals.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i += 2) {
            const from = new THREE.Vector3().fromBufferAttribute(positions, i);
            const to = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
            const direction = to.clone().sub(from), length = direction.length();
            const mesh = new THREE.Mesh(cornerGeometry, cornerMaterial);
            mesh.position.copy(from).add(to).multiplyScalar(0.5);
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
            cornerGroup.add(mesh); cornerLengths.push(length);
        }
        originalVerticals.visible = false;
    }
    scene.add(cornerGroup);
    let colorTarget = 'room';
    const selectedColor = () => colorTarget === 'screen' && computer
        ? computer.getScreenLight() : colorTarget === 'lip'
            ? { hue: profile().lipHue, saturation: profile().lipSaturation } : profile();
    const setSelectedColor = (hue, saturation) => {
        if (colorTarget === 'screen' && computer) computer.setScreenLight({ hue, saturation });
        else if (colorTarget === 'lip') Object.assign(profile(), { lipHue: hue, lipSaturation: saturation });
        else Object.assign(profile(), { hue, saturation });
    };
    const screenControls = { intensity: ['Light intensity', 0, 30, 0.1], reach: ['Size / reach (inches)', 1, 240, 1],
        decay: ['Falloff', 0, 4, 0.1], x: ['Right / left offset (inches)', -120, 120, 0.1],
        y: ['Height above computer base (inches)', -120, 120, 0.1], z: ['In front of screen (inches)', -120, 120, 0.1] };
    const screenSection = panel.querySelector('[data-screen-light]');
    screenSection.hidden = !computer;
    fields.colorTarget.querySelector('[value="screen"]').disabled = !computer;
    if (computer) screenSection.insertAdjacentHTML('beforeend', Object.entries(screenControls).map(([key, [label, min, max, step]]) =>
        `<label class="sky-slider"><span>${label}</span><input name="screen-${key}" aria-label="Screen ${label}" type="range" min="${min}" max="${max}" step="${step}"><output data-screen-output="${key}"></output></label>`).join(''));
    const syncScreenControls = () => {
        if (!computer) return;
        const values = computer.getScreenLight();
        fields.screenEnabled.checked = values.enabled;
        fields.screenPreview.checked = values.preview;
        for (const key of Object.keys(screenControls)) {
            fields[`screen-${key}`].value = values[key];
            panel.querySelector(`[data-screen-output="${key}"]`).textContent = values[key].toFixed(1);
        }
    };
    const syncFields = () => {
        syncComputerControls(); syncScreenControls();
        fields.skySelection.value = settings.selection;
        fields.lights.value = mode;
        for (const key of ['dayStart', 'sunsetStart', 'nightStart']) fields[key].value = settings[key];
        for (const [key, value] of Object.entries(profile())) {
            if (!Object.hasOwn(SKY_CONTROLS, key)) continue;
            fields[key].value = value;
            panel.querySelector(`[data-output="${key}"]`).textContent = format(key, value);
        }
        panel.querySelector('legend[data-profile]').textContent = `${SKY_OPTIONS[currentSky].label} · lights ${mode}`;
        const color = selectedColor();
        fields.hue.value = color.hue; fields.saturation.value = color.saturation;
        panel.querySelector('[data-output="hue"]').textContent = format('hue', color.hue);
        panel.querySelector('[data-output="saturation"]').textContent = format('saturation', color.saturation);
        const rgb = hsvToRgb(color.hue, color.saturation / 100);
        const hex = '#' + rgb.map(value => Math.round(value * 255).toString(16).padStart(2, '0')).join('');
        panel.querySelector('[data-color]').textContent = hex;
        panel.querySelector('[data-color]').style.backgroundColor = hex;
        panel.querySelector('[data-color]').style.color = rgb.reduce((a, b) => a + b) > 1.5 ? '#111' : 'white';
        const angle = color.hue * Math.PI / 180, radius = color.saturation / 100 * 50;
        const marker = panel.querySelector('[data-wheel-marker]');
        marker.style.left = `${50 + Math.cos(angle) * radius}%`;
        marker.style.top = `${50 + Math.sin(angle) * radius}%`;
        wheel.setAttribute('aria-valuetext', `Hue ${color.hue.toFixed(0)} degrees, saturation ${color.saturation.toFixed(0)} percent`);
    };
    const apply = () => {
        const p = profile(), tint = new THREE.Color().setRGB(...hsvToRgb(p.hue, p.saturation / 100), THREE.SRGBColorSpace);
        scene.background = textures[currentSky];
        scene.backgroundIntensity = p.sky;
        for (const [light, base] of lightColors) light.color.copy(base).multiply(tint);
        if (ambient) ambient.intensity = p.ambient * p.room;
        if (directional) directional.intensity = p.directional * p.room;
        if (room.galleryFillLight) room.galleryFillLight.intensity = p.fill * p.room;
        if (room.skylightDaylight) room.skylightDaylight.intensity = p.daylight * p.room;
        room.skylightTreeMaterial?.color.setScalar(p.trees);
        room.skylightOutside?.traverse(object => {
            if (object.isLineSegments) object.material.color.setHex(0x333333).multiplyScalar(p.trees);
        });
        for (const [key, surface] of Object.entries(surfaces)) surface.material.color.copy(surface.color).multiplyScalar(p[key]);
        const lipTint = new THREE.Color().setRGB(...hsvToRgb(p.lipHue, p.lipSaturation / 100), THREE.SRGBColorSpace);
        if (reveal) reveal.color.copy(revealColor).multiply(lipTint).multiplyScalar(p.reveal);
        if (trim) trim.color.copy(trimColor).multiply(lipTint).multiplyScalar(p.trim);
        cornerMaterial.color.setHex(mode === 'on' ? room.options.skylightEdgeColor : room.options.skylightOffEdgeColor)
            .multiply(lipTint).multiplyScalar(p.verticalBrightness);
        cornerGroup.visible = p.verticalThickness > 0;
        cornerGroup.children.forEach((mesh, i) => mesh.scale.set(p.verticalThickness / 40, cornerLengths[i], p.verticalThickness / 40));
        for (const [line, base] of baseLines) line.material.color.copy(base[mode])
            .multiplyScalar(line.name.startsWith('skylight-') ? p.edges : p.roomEdges);
        scene.traverse(object => {
            if (!object.userData.isLightFixture) return;
            const face = object.material[3];
            face.color.setScalar(p.fixtures);
            if (mode === 'on') face.emissive.setRGB(14, 13.2, 11.5).multiply(tint).multiplyScalar(p.fixtureGlow);
            else face.emissive.copy(tint).multiplyScalar(p.fixtureGlow);
        });
    };
    const tick = () => {
        if (disposed) return;
        const now = new Date(), hour = now.getHours() + now.getMinutes() / 60;
        const sky = settings.selection === 'auto' ? getSkyForHour(hour, settings) : settings.selection;
        panel.querySelector('[data-clock]').textContent = `Browser time: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${SKY_OPTIONS[sky].label}`;
        if (sky !== currentSky) { currentSky = sky; computer?.setSky(currentSky); apply(); syncFields(); }
    };
    tick();
    const unsubscribe = roomLights.onChange(on => { mode = on ? 'on' : 'off'; apply(); if (panel.open) syncFields(); });
    const timer = setInterval(tick, 30000);
    listen(form, 'input', event => {
        const key = event.target.name;
        if (computer && key === 'screenPreview') {
            computer.setScreenLightPreview(event.target.checked); syncScreenControls(); return;
        }
        if (computer && key === 'screenEnabled') {
            computer.setScreenLight({ enabled: event.target.checked }); syncScreenControls(); return;
        }
        if (computer && key.startsWith('screen-')) {
            computer.setScreenLight({ [key.slice(7)]: Number(event.target.value) });
            syncScreenControls(); return;
        }
        if (key === 'hue' || key === 'saturation') {
            const color = selectedColor();
            setSelectedColor(key === 'hue' ? Number(event.target.value) : color.hue,
                key === 'saturation' ? Number(event.target.value) : color.saturation);
            apply(); syncFields(); save(); return;
        }
        if (computer && key.startsWith('computer-')) {
            computer.setLighting('starsOff', { [key.slice('computer-'.length)]: Number(event.target.value) });
            syncComputerControls();
            return;
        }
        if (!Object.hasOwn(SKY_CONTROLS, key)) return;
        profile()[key] = Number(event.target.value);
        apply(); syncFields(); save();
    });
    listen(fields.colorTarget, 'change', () => { colorTarget = fields.colorTarget.value; syncFields(); });
    listen(fields.skySelection, 'change', () => { settings.selection = fields.skySelection.value; tick(); apply(); syncFields(); save(); });
    listen(fields.lights, 'change', () => { room.setLights(fields.lights.value === 'on'); });
    for (const key of ['dayStart', 'sunsetStart', 'nightStart']) listen(fields[key], 'change', () => {
        const [dayStart, sunsetStart, nightStart] = ['dayStart', 'sunsetStart', 'nightStart'].map(key => Number(fields[key].value));
        if (!(dayStart >= 0 && dayStart < sunsetStart && sunsetStart < nightStart && nightStart <= 24)) {
            panel.querySelector('[data-status]').textContent = 'Use increasing hours: day < sunset < night, between 0 and 24.';
            return;
        }
        Object.assign(settings, { dayStart, sunsetStart, nightStart });
        panel.querySelector('[data-status]').textContent = ''; tick(); save();
    });
    listen(fields.previewComputerShadow, 'click', () => {
        settings.selection = 'stars'; tick(); save(); room.setLights(false);
    });
    listen(fields.defaults, 'click', () => {
        settings.profiles[currentSky] = structuredClone(defaults.profiles[currentSky]);
        apply(); syncFields(); save();
    });
    listen(panel, 'keydown', event => event.stopPropagation());
    const open = () => { tick(); syncFields(); if (!panel.open) panel.showModal(); };
    // Reuse the existing gear in this test room without toggling developer mode beneath it.
    const gear = room.stage.querySelector('#dev-toggle');
    const gearLabel = gear?.getAttribute('aria-label'), gearTitle = gear?.title;
    if (gear) {
        gear.title = 'sky and lighting controls';
        gear.setAttribute('aria-label', 'Open sky and lighting controls');
        listen(gear, 'click', event => { event.stopImmediatePropagation(); open(); }, true);
    }
    // The wheel and the numeric hue/saturation sliders always update the same values.
    let pickingColor = false;
    const pickColor = event => {
        const rect = wheel.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * 2 - 1,
            y = (event.clientY - rect.top) / rect.height * 2 - 1;
        setSelectedColor(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360,
            Math.min(1, Math.hypot(x, y)) * 100);
        apply(); syncFields(); save();
    };
    listen(wheel, 'pointerdown', event => {
        if (event.button !== 0) return;
        pickingColor = true; wheel.setPointerCapture(event.pointerId); pickColor(event);
    });
    listen(wheel, 'pointermove', event => { if (pickingColor) pickColor(event); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(wheel, type, () => { pickingColor = false; });
    listen(wheel, 'keydown', event => {
        const p = { ...selectedColor() }, step = event.shiftKey ? 10 : 1;
        if (event.key === 'ArrowLeft') p.hue = (p.hue - step + 360) % 360;
        else if (event.key === 'ArrowRight') p.hue = (p.hue + step) % 360;
        else if (event.key === 'ArrowUp') p.saturation = Math.min(100, p.saturation + step);
        else if (event.key === 'ArrowDown') p.saturation = Math.max(0, p.saturation - step);
        else return;
        event.preventDefault(); setSelectedColor(p.hue, p.saturation); apply(); syncFields(); save();
    });
    bindSkyClick({ room, THREE, canvas, camera, scene, orbit, listen, open });
    return { open, dispose() {
        disposed = true; clearInterval(timer); unsubscribe(); controller.abort();
        computer?.setScreenLightPreview(false);
        computer?.setSky(null);
        panel.close(); panel.remove(); link.remove();
        scene.remove(cornerGroup); cornerGeometry.dispose(); cornerMaterial.dispose();
        if (originalVerticals) originalVerticals.visible = true;
        if (gear) {
            gear.title = gearTitle;
            if (gearLabel == null) gear.removeAttribute('aria-label'); else gear.setAttribute('aria-label', gearLabel);
        }
        // Restore the room's own light settings before removing the sky editor.
        for (const [light, color] of lightColors) light.color.copy(color);
        for (const surface of Object.values(surfaces)) surface.material.color.copy(surface.color);
        if (reveal) reveal.color.copy(revealColor); if (trim) trim.color.copy(trimColor);
        room.skylightTreeMaterial?.color.setScalar(1);
        roomLights.setOn(roomLights.isOn());
        scene.background = originalBackground; scene.backgroundIntensity = originalIntensity;
        Object.values(textures).forEach(texture => texture.dispose());
    } };
}

function drawWheel(canvas, context) {
    const size = canvas.width, radius = size / 2, image = context.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - radius) / radius, dy = (y + 0.5 - radius) / radius, distance = Math.hypot(dx, dy);
        if (distance > 1) continue;
        const rgb = hsvToRgb(Math.atan2(dy, dx) * 180 / Math.PI, distance);
        const index = (y * size + x) * 4;
        rgb.forEach((value, channel) => { image.data[index + channel] = Math.round(value * 255); });
        image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
}

function bindSkyClick({ room, THREE, canvas, camera, scene, orbit, listen, open }) {
    const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(), point = new THREE.Vector3();
    let press = null;
    const cancel = () => { press = null; };
    listen(canvas, 'pointerdown', event => {
        if (event.button !== 0 || event.isPrimary === false) { cancel(); return; }
        const rect = canvas.getBoundingClientRect();
        pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
        ray.setFromCamera(pointer, camera);
        if (ray.ray.direction.y <= 0) return;
        const top = room.layout.ceilingY + room.options.skylightThickness / 20;
        const distance = (top - ray.ray.origin.y) / ray.ray.direction.y;
        if (distance <= 0) return;
        ray.ray.at(distance, point);
        const half = room.options.skylightWidth * 12 / 20 / 2;
        if (Math.abs(point.x) >= half || Math.abs(point.z) >= half) return;
        // The click must pass through the hole, not a fixture, artwork, or the lip in front of it.
        const obstructed = ray.intersectObjects(scene.children, true).some(hit => {
            if (hit.distance >= distance - 0.01 || !hit.object.isMesh) return false;
            for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
            return true;
        });
        if (obstructed) return;
        event.stopImmediatePropagation();
        press = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, dragged: false };
        canvas.setPointerCapture(event.pointerId);
    }, true);
    listen(canvas, 'pointermove', event => {
        if (!press || press.id !== event.pointerId) return;
        event.stopImmediatePropagation();
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) press.dragged = true;
        if (press.dragged) {
            const delta = (event.clientX - press.lastX) * 0.005;
            orbit.setAngle(orbit.getAngle() + delta); room._onUserRotate(delta);
        }
        press.lastX = event.clientX;
    }, true);
    listen(canvas, 'pointerup', event => {
        if (!press || press.id !== event.pointerId) return;
        event.stopImmediatePropagation();
        const clicked = !press.dragged; cancel();
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (clicked) open();
    }, true);
    for (const type of ['pointercancel', 'lostpointercapture']) listen(canvas, type, cancel, true);
    listen(window, 'blur', cancel);
}

function makePanel() {
    const sliders = Object.entries(SKY_CONTROLS).map(([key, [label, min, max, step]]) =>
        `<label class="sky-slider"><span>${label}</span><input name="${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}"><output data-output="${key}"></output></label>`).join('');
    return `<form method="dialog">
        <div class="wall-editor-header"><span id="sky-workshop-title" class="wall-editor-filename">sky / lighting workshop</span>
            <button name="close" aria-label="close sky controls">x</button></div>
        <p data-clock></p>
        <label>Sky <select name="skySelection"><option value="auto">Automatic · browser local time</option>${Object.entries(SKY_OPTIONS).map(([key, sky]) => `<option value="${key}">${sky.label}</option>`).join('')}</select></label>
        <details><summary>Automatic schedule (local hours)</summary>
            <p>Day → sunset → second sunset → stars. No location permission is needed.</p>
            <label>Day starts <input name="dayStart" type="number" min="0" max="24" step="0.5"></label>
            <label>Sunset starts <input name="sunsetStart" type="number" min="0" max="24" step="0.5"></label>
            <label>Night starts <input name="nightStart" type="number" min="0" max="24" step="0.5"></label>
        </details>
        <label>Electric lights <select name="lights"><option value="on">on</option><option value="off">off</option></select></label>
        <fieldset><legend data-profile></legend>
            <p>Settings save separately for each sky and light state. 0 is dark; 1 is normal for surface brightness.</p>
            <label>Color picker controls <select name="colorTarget"><option value="room">Room light</option><option value="lip">Skylight lip / inside opening</option><option value="screen">Computer screen light</option></select></label>
            <div class="sky-wheel"><canvas width="200" height="200" tabindex="0" role="slider" aria-label="Light hue and saturation" aria-valuemin="0" aria-valuemax="359"></canvas><span data-wheel-marker></span></div>
            <output data-color></output><p>Wheel: hue around the edge, saturation toward the rim. Arrow keys also adjust the color.</p>
            ${sliders}
        </fieldset>
        <fieldset data-screen-light hidden><legend>Computer screen light</legend>
            <label>Enabled while computer is on <input name="screenEnabled" type="checkbox"></label><br>
            <label>Preview light while computer is off <input name="screenPreview" type="checkbox"></label>
            <p>Offsets follow the computer's rotation. Positive Z is in front of the screen. Set its hue using the color picker dropdown above.</p>
        </fieldset>
        <fieldset data-computer-shadow hidden><legend>Computer shadow · Stars 1 / lights off</legend>
            <p>These settings apply only with Stars 1 and electric lights off. Other skies keep the regular shadow.</p>
            <button type="button" name="previewComputerShadow">preview stars with lights off</button>
        </fieldset>
        <div role="status" data-status></div>
        <div class="wall-editor-actions"><button type="button" name="defaults">restore this sky's defaults</button><button>done</button></div>
    </form>`;
}
