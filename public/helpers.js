import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

// Production gallery defaults also seed the test workshop. Keep both rooms in sync here.
export const GALLERY_LIGHTING_DEFAULTS = Object.freeze({
    skylightWidth: 12,
    skylightThickness: 6,
    skylightLip: true,
    skylightLipWidth: 1.5,
    skylightLipThickness: 0.5,
    skylightLipColor: 0xffffff,
    skylightEdgeColor: 0x666666,
    skylightOffEdgeColor: 0x555555,
    skylightLipEdgeColor: 0xd8d8d8,
    skylightLipOffEdgeColor: 0xc8c8c8,
    skylightDaylight: true,
    skylightLightIntensity: 0.35,
    skylightLightColor: 0xddeaff,
    galleryFillIntensity: 68,
    galleryFillColor: 0xfff7ed,
    galleryFillX: 0,
    galleryFillZ: 0,
    galleryFillHeight: 60,
    galleryFillRange: 24,
    galleryFillDecay: 2,
    galleryOffAmbientLight: 0.05,
    galleryOffDirectionalLight: 0.04,
    galleryFixtureBrightness: 1,
    galleryFixtureOffColor: 0xffffff,
    galleryFixtureOffGlow: 0.9,
    galleryEdgeColor: 0xc4c4c8,
    galleryOffEdgeColor: 0x757575,
});

export const roomAsset = (path) => {
    if (path.startsWith("images/") || path.startsWith("audio/"))
        return new URL("./assets/rooms/" + path, import.meta.url).href;
    return new URL("./index.php?asset=" + encodeURIComponent(path), import.meta.url).href;
};

// Store only lit rooms; missing entries mean off. Storage failures leave the room usable.
export const roomLightState = {
    isOn(id) {
        try { return localStorage.getItem("y9k-room-light:" + String(id).toLowerCase()) === "1"; }
        catch { return false; }
    },

    setOn(id, on) {
        try {
            const key = "y9k-room-light:" + String(id).toLowerCase();
            if (on) localStorage.setItem(key, "1");
            else localStorage.removeItem(key);
        } catch { }
    },

    arrival(id, neighbors = []) {
        let last = null;
        try { last = JSON.parse(localStorage.getItem("y9k-last-room")); } catch { }
        const previous = typeof last?.id === "string" ? last.id.toLowerCase() : null;
        const sameRoom = previous === String(id).toLowerCase();
        const adjacent = !sameRoom && neighbors.some(neighbor => String(neighbor).toLowerCase() === previous);
        return { alreadyOn: this.isOn(id), automatic: !(sameRoom || adjacent), adjacent, sameRoom };
    },

    visit(id) {
        try { localStorage.setItem("y9k-last-room", JSON.stringify({ id: String(id).toLowerCase(), timestamp: Date.now() })); }
        catch { }
    },
};

// Room ceilings and neighboring door textures share the same repeatable skylight decision.
export const galleryHasSkylight = (roomId, { gallerySkylight = false, skylightChance = 100, skylightSeed = "y9k-skylights-v1" } = {}) => {
    if (!gallerySkylight || roomId == null) return false;
    // Keep IDs as text so large room numbers remain exact.
    const identity = JSON.stringify([String(skylightSeed), String(roomId).toLowerCase()]);
    let hash = 2166136261;
    for (let i = 0; i < identity.length; i++)
        hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
    hash ^= hash >>> 16;
    const chance = Math.max(0, Math.min(100, Number(skylightChance) || 0));
    return (hash >>> 0) / 4294967296 < chance / 100;
};

// Door texture configuration. Paths resolve through roomAsset(), like other room images.
// Name custom files: door--from-<type>-<on|off>--to-<type>-<on|off>--<period>.png
// Types: hallway, gallery, gallery-skylight. Periods: day, dawn, evening, night.
export const DOOR_TEXTURES = {
    bright: 'images/door-2.jpg',
    medium: 'images/door-5.jpg',
    dark: 'images/door-1.jpg',
};
// Add exact scenarios here to experiment without changing the selection logic.
// Example entry (uncomment after adding the image):
// 'from-hallway-on__to-gallery-skylight-off__night': {
//     file: 'images/doors/door--from-hallway-on--to-gallery-skylight-off--night.png',
//     state: 'medium', glow: 0.5,
// },
export const DOOR_TEXTURE_OVERRIDES = {};

export function galleryDoorState({ lightsOn, period }) {
    if (lightsOn || period === 'day') return 'bright';
    return period === 'dawn' || period === 'evening' ? 'medium' : 'dark';
}
// Preserve the appearance from before the blue-night and dark-gallery experiments.
export function destinationDoorState({ viewerHallway, gallery, skylight, lightsOn, period, distinctGalleryDoors }) {
    if (skylight) return galleryDoorState({ lightsOn, period });
    if (viewerHallway && lightsOn) return gallery ? 'bright' : 'medium';
    return !viewerHallway && gallery && distinctGalleryDoors ? 'bright' : 'dark';
}
export const doorStateFile = state => DOOR_TEXTURES[state] ?? DOOR_TEXTURES.dark;
export function doorScenarioKey(context) {
    const from = context.viewerHallway ? 'hallway' : context.viewerSkylight ? 'gallery-skylight' : 'gallery';
    const to = !context.gallery ? 'hallway' : context.skylight ? 'gallery-skylight' : 'gallery';
    return `from-${from}-${context.viewerOn ? 'on' : 'off'}__to-${to}-${context.lightsOn ? 'on' : 'off'}__${context.period}`;
}
export function doorPresentation(context) {
    const key = doorScenarioKey(context), override = DOOR_TEXTURE_OVERRIDES[key] ?? {};
    const state = override.state ?? destinationDoorState(context);
    return { key, state, file: override.file ?? doorStateFile(state), glow: override.glow ?? 0.5 };
}

// BEGIN WALL TEXT: disable wallTextEnabled in index.php to remove the creation controls.
// Physical inches match gallery doors (80 inches). Insets protect artwork such as the clip.
export const WALL_TEXT_BACKGROUNDS = {
    'post-it-yellow': { label: 'Post-it · yellow', file: 'post-it-yellow.jpg', width: 3, height: 3 },
    'post-it-pink': { label: 'Post-it · pink', file: 'post-it-pink.jpg', width: 3, height: 3 },
    'post-it-blue': { label: 'Post-it · blue', file: 'post-it-blue.jpg', width: 3, height: 3 },
    'post-it-green': { label: 'Post-it · green', file: 'post-it-green.jpg', width: 3, height: 3 },
    'post-it-orange': { label: 'Post-it · orange', file: 'post-it-orange.jpg', width: 3, height: 3 },
    'college-rule': { label: 'College ruled', file: 'college-rule.jpg', width: 8.5, height: 11, inset: [0.6, 0.2, 0.2, 0.9] },
    'legal-pad': { label: 'Legal pad', file: 'legal-pad.jpg', width: 8.5, height: 14, inset: [1, 0.2, 0.3, 0.8] },
    clipboard: { label: 'Clipboard', file: 'clipboard.png', width: 9, height: 14.6, inset: [3, 0.5, 0.5, 0.6] },
    wall: { label: 'Wall text · transparent' },
};
// Reserved prefixes survive ordinary uploads and identify flattened notes after reload.
export const WALL_TEXT_PREFIXES = {
    'post-it-yellow': 'POSTITYELLOW', 'post-it-pink': 'POSTITPINK', 'post-it-blue': 'POSTITBLUE',
    'post-it-green': 'POSTITGREEN', 'post-it-orange': 'POSTITORANGE',
    'college-rule': 'COLLEGERULE', 'legal-pad': 'LEGALPAD', clipboard: 'CLIPBOARD', wall: 'WALLTEXT',
};
export function wallTextKind(filename = '') {
    const name = String(filename).split('/').pop();
    const prefix = name.split('__')[0].toUpperCase();
    const kind = Object.keys(WALL_TEXT_PREFIXES).find(key => WALL_TEXT_PREFIXES[key] === prefix);
    if (kind && name.includes('__')) return kind;
    // Recognize notes made before the reserved prefixes were introduced.
    const legacy = name.replace(/^text-/, '').replace(/\.png$/i, '');
    return name.startsWith('text-') && WALL_TEXT_BACKGROUNDS[legacy] ? legacy : null;
}
export function wallTextFilename(background, text) {
    const words = text.trim().split(/\s+/).slice(0, 5).join('-').normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return `${WALL_TEXT_PREFIXES[background]}__${(words || 'note').slice(0, 54)}.png`;
}
export const WALL_TEXT_FONTS = {
    serif: { label: 'Serif', css: 'Times New Roman, Times, serif' },
    sans: { label: 'Sans serif', css: 'Arial, Helvetica, sans-serif' },
    mono: { label: 'Monospace', css: 'Courier New, Courier, monospace' },
    comic: { label: 'Comic Sans', css: 'Comic Sans MS, Comic Sans, cursive' },
    georgia: { label: 'Georgia', css: 'Georgia, Times New Roman, serif' },
    verdana: { label: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
    trebuchet: { label: 'Trebuchet', css: 'Trebuchet MS, Arial, sans-serif' },
};
// Keep explicit newlines; split long words so even unbroken text stays inside its note.
export function wrapWallText(text, maxWidth, measure) {
    const lines = [];
    for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
        let line = '';
        for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
            if (line && measure(line + ' ' + word) <= maxWidth) { line += ' ' + word; continue; }
            if (line) { lines.push(line); line = ''; }
            for (const character of word) {
                if (line && measure(line + character) > maxWidth) { lines.push(line); line = ''; }
                line += character;
            }
        }
        lines.push(line);
    }
    return lines;
}
const wallTextPaperImages = new Map();
async function wallTextPaperImage(paper) {
    if (!paper.file) return null;
    if (!wallTextPaperImages.has(paper.file)) {
        const promise = new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => { wallTextPaperImages.delete(paper.file); reject(new Error('Could not load the paper background.')); };
            image.src = roomAsset('images/paper/' + paper.file);
        });
        wallTextPaperImages.set(paper.file, promise);
    }
    return wallTextPaperImages.get(paper.file);
}
// The same PNG supplies the live wall preview and the final ordinary image upload.
export async function renderWallText({ background, text, width, font, fontSize, padding = 0.2, paddingX = padding, paddingY = padding, lineHeight, align }) {
    const paper = WALL_TEXT_BACKGROUNDS[background];
    const image = await wallTextPaperImage(paper);
    width = paper.width ?? width;
    const dpi = Math.min(144, 4096 / width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * dpi));
    const context = canvas.getContext('2d');
    const fontCSS = `${fontSize * dpi / 72}px ${WALL_TEXT_FONTS[font].css}`;
    context.font = fontCSS;
    const [top, right, bottom, left] = (paper.inset ?? [0, 0, 0, 0]).map((value, index) => (value + (index % 2 === 0 ? paddingY : paddingX)) * dpi);
    const available = Math.max(1, canvas.width - left - right);
    const lines = wrapWallText(text || '[your text here]', available, value => context.measureText(value).width);
    const linePixels = fontSize * dpi / 72 * lineHeight;
    canvas.height = Math.max(1, Math.ceil(paper.height ? paper.height * dpi : top + bottom + lines.length * linePixels));
    if (image) context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.save();
    context.beginPath(); context.rect(left, top, available, Math.max(0, canvas.height - top - bottom)); context.clip();
    context.font = fontCSS; context.fillStyle = '#000'; context.textBaseline = 'top'; context.textAlign = align;
    const x = align === 'center' ? left + available / 2 : align === 'right' ? left + available : left;
    lines.forEach((line, index) => context.fillText(line, x, top + index * linePixels));
    context.restore();
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not create the note PNG.')), 'image/png'));
    return { file: new File([blob], wallTextFilename(background, text), { type: 'image/png' }), width, canvas,
        clipped: Boolean(paper.height && top + bottom + lines.length * linePixels > canvas.height),
        height: canvas.height / dpi };
}
// END WALL TEXT rendering helpers.

// Layer each wall independently by database ID; unsaved previews sit above saved artwork.
// One hundredth of an inch per image avoids coplanar flicker without a visible gap.
export function layerWallImages(images, step = inchesToWorld(0.01)) {
    const walls = new Map();
    const normals = { north: [0, 1], south: [0, -1], west: [1, 0], east: [-1, 0] };
    for (const art of images) {
        const data = art.userData, previous = normals[data.wallLayerWall];
        if (previous) {
            art.position.x -= previous[0] * (data.wallLayerOffset ?? 0);
            art.position.z -= previous[1] * (data.wallLayerOffset ?? 0);
        }
        data.wallLayerOffset = 0;
        const wall = data.placement.wall;
        const key = data.segment == null ? wall : `${wall}:${data.segment}`;
        if (!walls.has(key)) walls.set(key, []);
        walls.get(key).push(art);
    }
    for (const artwork of walls.values()) {
        const wall = artwork[0].userData.placement.wall;
        artwork.sort((a, b) => {
            const left = String(a.userData.roomImageId), right = String(b.userData.roomImageId);
            const leftSaved = /^\d+$/.test(left), rightSaved = /^\d+$/.test(right);
            if (leftSaved && rightSaved) return BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0;
            return leftSaved === rightSaved ? 0 : leftSaved ? -1 : 1;
        });
        artwork.forEach((art, rank) => {
            const offset = rank * step, normal = normals[wall];
            if (!normal) return;
            art.position.x += normal[0] * offset;
            art.position.z += normal[1] * offset;
            art.userData.wallLayerWall = wall;
            art.userData.wallLayerOffset = offset;
        });
    }
}

export const createRoom = (data = {}, options = {}) => {
    const doors = Object.fromEntries(Object.entries(data.doors ?? {}).map(([wall, door]) => {
        if (!door || door.exists === false)
            return [wall, false];
        if (door === true || door.neighborId == null)
            return [wall, door];
        return [wall, {
            ...door,
            href: door.href ?? new URL("./" + encodeURIComponent(door.neighborId), import.meta.url).href,
            label: door.label ?? door.neighborId.toUpperCase(),
        }];
    }));
    const config = { roomId: data.id ?? "demo", neighbors: data.neighbors ?? [], exitWall: data.exitWall, roomInfo: data.roomInfo, exitNotice: data.exitNotice, doors, ...options };
    const gallery = data.gallery ?? Object.values(config.doors).filter(door => door && door.exists !== false).length < 2;
    const room = gallery ? new Gallery(config) : new Hallway(config);
    room.addImages(data.images ?? [], { stored: true });
    return room;
};

export const createRoomStorage = (id, { endpoint = "index.php", onChange = () => { } } = {}) => {
    const url = endpoint + "?room=" + encodeURIComponent(id);
    const request = async (action, values = {}, file = null) => {
        const form = new FormData();
        form.set("room", id);
        form.set("action", action);
        for (const [key, value] of Object.entries(values))
            form.set(key, String(value));
        if (file)
            form.set("image", file);
        // Attach local file details even when the web server rejects the request before PHP runs.
        const fileDetails = file ? `\nFile: ${file.name}\nFile size: ${file.size.toLocaleString()} bytes (${(file.size / 1048576).toFixed(2)} MiB)\nBrowser file type: ${file.type || "unknown"}` : "";
        let res;
        try {
            res = await fetch(url, { method: "POST", body: form, headers: { Accept: "application/json" } });
        } catch (error) {
            throw new Error(`Network request failed: ${error.message}${fileDetails}`);
        }
        let raw;
        try { raw = await res.text(); }
        catch (error) { throw new Error(`Could not read server response: ${error.message}\nHTTP ${res.status}${fileDetails}`); }
        let data;
        try { data = JSON.parse(raw); }
        catch {
            // Treat server-generated HTML as plain text, never as modal markup.
            const excerpt = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
            const reason = res.status === 413 ? "The server rejected the request as too large."
                : "The server did not return the expected JSON response.";
            throw new Error(`${reason}\nHTTP ${res.status} ${res.statusText}${fileDetails}\nResponse: ${excerpt || "empty response"}`);
        }
        if (!res.ok || !data?.ok) {
            const diagnostics = Object.entries(data?.diagnostics ?? {}).map(([key, value]) => `${key}: ${value}`).join("\n");
            throw new Error(`${data?.error || "Could not save the change."}\nHTTP ${res.status}${fileDetails}${diagnostics ? "\n" + diagnostics : ""}`);
        }
        return data;
    };
    return {
        async upload(p, file) {
            const data = await request("upload", storedPlacement(p), file);
            onChange({ action: "upload", image: { ...data, ...storedPlacement(p) } });
            return data;
        },

        async move(p) {
            await request("move", { id: p.id, ...storedPlacement(p) });
            onChange({ action: "move", image: { id: p.id, ...storedPlacement(p) } });
        },

        async delete(p) {
            await request("delete", { id: p.id });
            onChange({ action: "delete", image: { id: p.id } });
        },
    };
};

export const storedPlacement = (p) => {
    return { wall: p.segment ?? CARDINAL_WALLS.indexOf(p.wall), x: p.x * 2.54, y: p.y * 2.54, width: p.width * 2.54 };
};

const CARDINAL_WALLS = ["north", "east", "south", "west"];

const INCHES_PER_WORLD_UNIT = 20;

let mountedRoom = null;

export const roomWall = (value = "north") => {
    const wall = typeof value === "number" ? CARDINAL_WALLS[value] : value;
    if (!CARDINAL_WALLS.includes(wall))
        throw new Error("Wall must be north/east/south/west or 0/1/2/3.");
    return wall;
};

const inchesToWorld = (inches) => Number(inches) / INCHES_PER_WORLD_UNIT;

const feetToWorld = (feet) => inchesToWorld(Number(feet) * 12);

const worldToInches = (world) => world * INCHES_PER_WORLD_UNIT;

const wallRightSign = (wall) => wall === "south" || wall === "west" ? -1 : 1;

export const roomOutline = ({ width = 12, length = 12, corridorWidth = 4, doors = {}, hallway = false } = {}) => {
    const w = feetToWorld(width), d = feetToWorld(length);
    if (!hallway)
        return outlineFromBox(w, d);
    const arm = feetToWorld(corridorWidth);
    if (!(arm > 0 && arm < Math.min(w, d)))
        throw new Error("corridorWidth must be smaller than width and length.");
    const xs = [-w / 2, -arm / 2, arm / 2, w / 2];
    const zs = [-d / 2, -arm / 2, arm / 2, d / 2];
    const occupied = new Set(["1,1"]);
    if (doors.north)
        occupied.add("1,0");
    if (doors.east)
        occupied.add("2,1");
    if (doors.south)
        occupied.add("1,2");
    if (doors.west)
        occupied.add("0,1");
    const edges = new Map();
    for (const cell of occupied) {
        const [x, z] = cell.split(",").map(Number);
        const corners = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]];
        const neighbors = [[x, z - 1], [x + 1, z], [x, z + 1], [x - 1, z]];
        corners.forEach((corner, i) => {
            if (!occupied.has(neighbors[i].join(",")))
                edges.set(corner.join(","), corners[(i + 1) % 4]);
        });
    }
    const start = edges.keys().next().value;
    let key = start;
    const points = [];
    do {
        const [x, z] = key.split(",").map(Number);
        points.push([xs[x], zs[z]]);
        key = edges.get(key).join(",");
    } while (key !== start);
    const outline = points.filter((point, i) => {
        const before = points[(i + points.length - 1) % points.length];
        const after = points[(i + 1) % points.length];
        return (point[0] - before[0]) * (after[1] - point[1]) !== (point[1] - before[1]) * (after[0] - point[0]);
    });
    // Start at the northernmost north-facing edge, then follow the clockwise perimeter.
    const north = outline.map(([x, z], index) => ({ x, z, index, next: outline[(index + 1) % outline.length] }))
        .filter(edge => edge.next[0] > edge.x && edge.next[1] === edge.z)
        .sort((a, b) => a.z - b.z || a.x - b.x)[0].index;
    return [...outline.slice(north), ...outline.slice(0, north)];
};

export const roomSegments = (outline) => {
    return outline.map(([x1, z1], index) => {
        const [x2, z2] = outline[(index + 1) % outline.length];
        const dx = x2 - x1, dz = z2 - z1;
        const wall = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "north" : "south") : (dz > 0 ? "east" : "west");
        return { index, wall, x: (x1 + x2) / 2, z: (z1 + z2) / 2, length: Math.hypot(dx, dz) };
    });
};

const installRoomUI = (target) => {
    if (!document.getElementById("room-library-styles")) {
        const style = document.createElement("style");
        style.id = "room-library-styles";
        style.textContent = ROOM_STYLES + `
            /* Canvas holds edit artwork instead of selecting text or opening mobile menus. */
            #stage canvas {
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
                -webkit-touch-callout: none;
            }
            #room-editor { display:none; position:absolute; right:12px; top:12px; z-index:12; padding:10px; max-width:240px; max-height:65vh; overflow:auto; background:#fffffff0; color:#111; font:13px sans-serif; }
            body.is-dev-mode #room-editor { display:block; }
            #room-editor label { display:block; margin:5px 0; }
            #room-editor input[type=number] { width:70px; }
            #room-editor button { margin:3px; }
            #room-editor-status { white-space:normal; }
            #room-editor [hidden] { display:none !important; }
            #lightbox.has-user-art-delete #lightbox-delete:not([hidden]) { display:inline-block; }
            #room-library-error { position:absolute; top:40%; left:10%; right:10%; background:white; color:black; padding:20px; z-index:20; }
        `;
        document.head.appendChild(style);
    }
    const stage = typeof target === "string" ? document.querySelector(target) : target;
    if (!stage)
        throw new Error("Room mount target was not found.");
    stage.id = "stage";
    if (!document.getElementById("music-toggle")) {
        const sound = document.createElement("button");
        sound.id = "music-toggle";
        sound.type = "button";
        sound.setAttribute("aria-label", "toggle sound");
        stage.appendChild(sound);
    }
    if (!document.getElementById("lightbox")) {
        const lightbox = document.createElement("div");
        lightbox.id = "lightbox";
        lightbox.innerHTML = '<div class="lightbox-frame"><div class="lightbox-stage"><img alt=""><a id="lightbox-caption" target="_blank" rel="noopener"></a></div></div>';
        stage.appendChild(lightbox);
    }
    return stage;
};

export class Room {
    constructor(options = {}, hallway = false) {
        // Scale hallway lighting together; 1 restores the original brightness.
        const hallwayBrightness = options.hallwayBrightness ?? 0.8;
        this.options = {
            hallwayBrightness,
            hallwayLightBoost: 3.5, hallwayLightRange: 5, hallwayAmbientLight: 0.06,
            hallwayLightColor: 0xfff0de,
            hallwayFixtureBrightness: 0.45, hallwayLightFlicker: true,
            width: hallway ? 55 / 3 : 20, length: hallway ? 55 / 3 : 20,
            height: hallway ? 6.25 : 10, corridorWidth: 35 / 6,
            doorHeight: hallway ? 64 : 80, artY: -12, artWidth: 32,
            orbitRadius: hallway ? 28 : 44, eyeHeight: hallway ? 49.5 : 60, lookAtHeight: hallway ? 45.5 : 60,
            autoSpin: 0.00035, background: hallway ? 0x111111 : 0xf0f0f0,
            ambientLight: hallway ? 0.05 * hallwayBrightness : 2.7, directionalLight: hallway ? 0.04 * hallwayBrightness : 0.55,
            directionalPosition: hallway ? [1, 3, 2] : [2, 5, 3],
            lightsOn: false, rememberLights: true, galleryLightFlicker: true,
            doorTransition: true, doorTransitionDuration: 2000, doorTransitionZoom: 1.30, doorTransitionFadeStart: 0.45,
            doorTransitionMode: "smooth", doorTransitionSteps: 4, doorTransitionBob: 0.4,
            stepSound: roomAsset("audio/step-1-hall.wav?v=3"), stepVolume: 0.8, rotationStepDegrees: 15, rotationStepMinInterval: null,
            doorOpenSound: roomAsset("audio/door-open-soft.WAV"), doorOpenVolume: 0.85, doorOpenFadeProgress: 0.5,
            doorCloseSound: roomAsset("audio/door-close-1.mp3"), doorSfxVolume: 0.35,
            roomEntryTransition: true, roomEntryZoom: 1.6, doorTransitionPan: true, doorTransitionPanSpeed: 45, doorTransitionPanMinDuration: 1200, doorTransitionPanThreshold: 3,
            floorTexture: roomAsset("images/static_images/floor-2.jpg"),
            ceilingTexture: undefined, wallTexture: null,
            gallerySkylight: false, skylightChance: 100, skylightSeed: "y9k-skylights-v1", skylightWidth: 12, skylightThickness: 6, skylightTreeLift: 36,
            skylightLip: true, skylightLipWidth: 1.5, skylightLipThickness: 0.5, skylightLipColor: 0xffffff, skylightEdgeColor: 0x666666, skylightOffEdgeColor: 0x555555, skylightLipEdgeColor: 0xd8d8d8, skylightLipOffEdgeColor: 0xc8c8c8,
            skylightTreeWidth: null, skylightTreeHeight: null, skylightTreeDepth: null,
            skylightTreeRepeatX: 1, skylightTreeRepeatY: 2,
            skylightDaylight: true, skylightLightIntensity: 0.65, skylightLightColor: 0xddeaff,
            galleryFillIntensity: 8, galleryFillColor: 0xfff7ed,
            galleryFillX: 0, galleryFillZ: 0, galleryFillHeight: 60, galleryFillRange: 24, galleryFillDecay: 2,
            galleryFixtureBrightness: 1, galleryFixtureOffColor: 0xffffff, galleryFixtureOffGlow: 0.2, galleryOffEdgeColor: 0xb8b8b8,
            galleryOffAmbientLight: 0.05, galleryOffDirectionalLight: 0.04,
            skylightWind: roomAsset("audio/birds.mp3"), skylightWindVolume: 0.12,
            wallColor: hallway ? 0xc8c8c8 : 0xfbfbfd, floorColor: 0xa6a6a6, ceilingColor: undefined,
            floorRepeat: { repeatX: hallway ? 0.2 : 0.25, repeatY: hallway ? 0.2 : 0.25 },
            ceilingRepeat: null,
            wallRepeat: { repeatX: 1, repeatY: 1 },
            molding: hallway ? true : 0xf4f4f6, cornerLines: hallway ? 0x111111 : (options.galleryEdgeColor ?? 0xc4c4c8),
            music: roomAsset("music/wind-indoors-1-muffled.mp3"), musicVolume: 0.25,
            backgroundMusicVolume: 0.45, lightSwitchVolume: 0.22, doorLockedVolume: 1, doorUnlockedVolume: 1, lightboxSfxVolume: 0.17, temporaryVolumeSliders: true,
            lightBuzz: hallway ? null : roomAsset("music/light-buzz.mp3"), lightBuzzVolume: 0.07,
            keyboard: true, keyboardTurnSpeed: 90, doorFacingTolerance: 45,
            showRoomNumbers: false, distinctGalleryDoors: true, defaultFixtures: true, defaultFurnishings: true, editor: !hallway, roomId: "demo", persistence: null,
            ...options,
        };
        this.skylightPolicy = { ...this.options };
        if (!hallway)
            this.options.gallerySkylight = galleryHasSkylight(this.options.roomId, this.options);
        if (!hallway && !this.options.gallerySkylight) {
            // Enclosed galleries keep their original dark lights-off appearance.
            // The brighter fill, diffuser glow and edge colors belong to skylight rooms only.
            Object.assign(this.options, {
                galleryFillIntensity: 0,
                galleryFixtureOffColor: FIXTURE_OFF_COLOR,
                galleryFixtureOffGlow: 0,
                galleryOffEdgeColor: 0x111111,
            });
        }
        // Saved browser volumes override code defaults before any room audio starts.
        for (const key of ["windVolume", "skylightWindVolume", "backgroundMusicVolume", "lightBuzzVolume",
            "lightSwitchVolume", "lightboxSfxVolume", "stepVolume", "doorOpenVolume", "doorSfxVolume",
            "doorLockedVolume", "doorUnlockedVolume"]) {
            try {
                const saved = localStorage.getItem(`y9k-volume:${key}`);
                const value = Number(saved);
                if (saved !== null && saved.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= 1)
                    this.options[key] = value;
            } catch { } // Restricted storage leaves the code defaults in place.
        }
        this.hallway = hallway;
        this.doors = {};
        this.commands = [];
        this.images = new Map();
        this.ready = Promise.resolve(this);
        for (const [wall, value] of Object.entries(options.doors || {})) {
            if (value && value.exists !== false)
                this.addDoor(wall, value === true ? {} : value);
        }
    }

    doorCount() { return Object.keys(this.doors).length; }

    addDoor(wall, options = {}) {
        if (this.app)
            throw new Error("Set doors before mount(); hallway outlines depend on them.");
        const name = roomWall(wall);
        if (!this.hallway && !this.doors[name] && this.doorCount() === 1)
            throw new Error("A Gallery can have at most one door.");
        this.doors[name] = { locked: false, ...options };
        return this;
    }

    addNorthDoor(options = {}) { return this.addDoor("north", options); }

    addEastDoor(options = {}) { return this.addDoor("east", options); }

    addSouthDoor(options = {}) { return this.addDoor("south", options); }

    addWestDoor(options = {}) { return this.addDoor("west", options); }

    _enqueue(task) {
        if (this.app)
            this.ready = this.ready.catch(() => { }).then(() => task()).then(() => this);
        else
            this.commands.push(task);
        return this;
    }

    _anchor({ wall = "north", x = 0, segment = null } = {}) {
        wall = roomWall(wall);
        const matches = this.segments.filter(edge => edge.wall === wall);
        matches.sort((a, b) => {
            const coordinate = wall === "north" || wall === "south" ? "z" : "x";
            return (wall === "north" || wall === "west" ? 1 : -1) * (a[coordinate] - b[coordinate]);
        });
        const edge = segment == null ? matches[0] : this.segments.find(edge => edge.index === segment && edge.wall === wall);
        if (!edge)
            throw new Error("No matching wall segment: " + wall);
        const along = inchesToWorld(x) * wallRightSign(wall);
        return { wall, edge, x: edge.x + (wall === "north" || wall === "south" ? along : 0), z: edge.z + (wall === "east" || wall === "west" ? along : 0) };
    }

    _wallBounds(anchor) {
        const b = { ...this.layout.bounds };
        const { wall, edge } = anchor;
        b.centerX = edge.x;
        b.centerZ = edge.z;
        if (wall === "north" || wall === "south") {
            b.halfX = edge.length / 2;
            if (wall === "north")
                b.minZ = edge.z;
            else
                b.maxZ = edge.z;
        }
        else {
            b.halfZ = edge.length / 2;
            if (wall === "west")
                b.minX = edge.x;
            else
                b.maxX = edge.x;
        }
        return b;
    }

    async mount(target = "#stage") {
        if (this.app)
            return this.ready;
        if (mountedRoom)
            throw new Error("Mount one room per page; navigate to display a different room.");
        if (this.hallway && (this.doorCount() < 2 || this.doorCount() > 4))
            throw new Error("A Hallway needs two to four doors.");
        const o = this.options;
        const arrival = o.rememberLights ? roomLightState.arrival(o.roomId, o.neighbors) : { alreadyOn: o.lightsOn, automatic: false };
        if (!(o.width > 0 && o.length > 0 && o.height > 0))
            throw new Error("Room dimensions must be positive feet.");
        this.stage = installRoomUI(target);
        const animateEntry = o.doorTransition && o.roomEntryTransition && arrival.adjacent;
        if (animateEntry) {
            // Cover the room before textures load or its first frame is rendered.
            this._doorFade = document.createElement("div");
            this._doorFade.className = "door-transition";
            this._doorFade.style.opacity = 1;
            this._doorFade.setAttribute("aria-hidden", "true");
            this.stage.appendChild(this._doorFade);
        }
        const height = feetToWorld(o.height);
        this.app = createRoomApp({
            // Wind uses one track at a time, with birds only beneath a skylight.
            musicPath: !this.hallway && o.gallerySkylight ? o.skylightWind : o.music,
            musicVolume: !this.hallway && o.gallerySkylight ? o.skylightWindVolume : (o.windVolume ?? o.musicVolume),
            backgroundMusicVolume: o.backgroundMusicVolume, lightSwitchVolume: o.lightSwitchVolume,
            doorLockedVolume: o.doorLockedVolume, doorUnlockedVolume: o.doorUnlockedVolume, musicEntryChance: arrival.sameRoom ? 0 : 0.2,
            lightBuzzPath: o.lightBuzz, lightBuzzVolume: o.lightBuzzVolume,
            orbitRadius: inchesToWorld(o.orbitRadius), floorY: -height / 2,
            heightFromFloor: inchesToWorld(o.eyeHeight), lookAtHeightFromFloor: inchesToWorld(o.lookAtHeight),
            autoSpin: o.autoSpin, background: o.background, enableLightbox: true, enableVideoLightbox: true,
            ambientLight: this.hallway ? o.hallwayAmbientLight : o.ambientLight,
            directionalLight: this.hallway ? 0 : o.directionalLight,
            offIntensity: this.hallway ? { ambient: o.ambientLight, directional: o.directionalLight }
                : { ambient: o.galleryOffAmbientLight, directional: o.galleryOffDirectionalLight },
            fixtureBrightness: this.hallway ? o.hallwayFixtureBrightness : o.galleryFixtureBrightness,
            fixtureOffColor: this.hallway ? FIXTURE_OFF_COLOR : o.galleryFixtureOffColor,
            fixtureOffGlow: this.hallway ? 0 : o.galleryFixtureOffGlow,
            lightColor: this.hallway ? o.hallwayLightColor : 0xffffff,
            lightboxSfxVolume: o.lightboxSfxVolume, doorLockedSound: o.doorLockedSound,
            doorUnlockedSound: o.doorUnlockedSound, lightSwitchSound: o.lightSwitchSound, pageSfx: o.pageSfx,
            directionalPosition: o.directionalPosition ?? [2, 5, 3], lightsOn: arrival.alreadyOn,
            onHit: object => this._hit(object),
            onRotate: radians => this._onUserRotate(radians),
            onFrame: delta => {
                if (this._doorTravelPending) {
                    this.app.orbit.setAngle(this._doorTravelAngle);
                    this._updateCompass();
                    return true;
                }
                const turning = this.keyboard?.update(delta) ?? false;
                this._updateCompass();
                return turning;
            },
        });
        if (!this.hallway && o.galleryFillIntensity > 0) {
            // Centered omnidirectional light with distance falloff, active only while electric lights are off.
            this.galleryFillLight = new THREE.PointLight(o.galleryFillColor, o.galleryFillIntensity,
                feetToWorld(o.galleryFillRange), o.galleryFillDecay);
            this.galleryFillLight.position.set(inchesToWorld(o.galleryFillX),
                -height / 2 + inchesToWorld(o.galleryFillHeight), inchesToWorld(o.galleryFillZ));
            this.galleryFillLight.castShadow = false;
            this.app.scene.add(this.galleryFillLight);
            this.app.roomLights.registerOffLight(this.galleryFillLight);
        }
        this.app.music.preloadSfx([o.stepSound, o.doorOpenSound, o.doorCloseSound]);
        mountedRoom = this;
        // Restore the view if the browser returns to this page from its back/forward cache.
        window.addEventListener("pageshow", event => {
            if (event.persisted) this._resetDoorTransition();
        });
        if (this.hallway) this._addCompass();
        this._addAudioToggle(document.querySelector("#video-lightbox .video-lightbox-frame"));
        if (this.hallway ? o.hallwayLightFlicker : o.galleryLightFlicker) {
            this.galleryLights = createGalleryLightStartup({ lights: this.app.roomLights });
        }
        this.app.camera.fov = o.fov ?? 72;
        this.app.camera.near = o.near ?? 0.1;
        this.app.camera.far = o.far ?? 100;
        this.app.camera.updateProjectionMatrix();
        const { scene, textureLoader, wallClick, roomLights } = this.app;
        const olderHallway = this.hallway && this.doorCount() < 4;
        const ceilingColor = o.ceilingColor ?? (this.hallway ? (olderHallway ? 0xc2c2c2 : 0xc9c9c9) : 0xfafafa);
        const ceilingTexture = o.ceilingTexture === undefined ? roomAsset("images/static_images/ceiling.jpg") : o.ceilingTexture;
        const materials = {
            wall: new THREE.MeshStandardMaterial({ color: o.wallColor, side: THREE.FrontSide, ...o.wallMaterial }),
            floor: new THREE.MeshStandardMaterial({ color: o.floorColor, side: THREE.FrontSide, ...o.floorMaterial }),
            ceiling: new THREE.MeshStandardMaterial({ color: ceilingColor, side: THREE.FrontSide, ...o.ceilingMaterial }),
        };
        const outline = o.outline ? o.outline.map(([x, z]) => [inchesToWorld(x), inchesToWorld(z)]) : roomOutline({ ...o, doors: this.doors, hallway: this.hallway });
        const bounds = outlineBounds(outline);
        for (const surface of ["wall", "floor", "ceiling"]) {
            const repeats = o[surface + "Repeat"] ?? { repeatX: bounds.width / CEILING_TILE_WORLD_SIZE, repeatY: bounds.depth / CEILING_TILE_WORLD_SIZE };
            const color = surface === "floor" ? 0xffffff : materials[surface].color.getHex();
            const texture = surface === "ceiling" ? ceilingTexture : o[surface + "Texture"];
            if (texture)
                loadMapOntoMaterial(textureLoader, materials[surface], texture, { color, ...repeats });
        }
        this.segments = roomSegments(outline);
        this.layout = createRoomLayout({
            scene, outline, height, floorY: -height / 2, materials,
            skylight: !this.hallway && o.gallerySkylight ? {
                width: feetToWorld(o.skylightWidth), thickness: inchesToWorld(o.skylightThickness),
                lip: o.skylightLip, lipWidth: inchesToWorld(o.skylightLipWidth),
                lipThickness: inchesToWorld(o.skylightLipThickness), lipColor: o.skylightLipColor,
                edgeColor: o.skylightEdgeColor, offEdgeColor: o.skylightOffEdgeColor,
                lipEdgeColor: o.skylightLipEdgeColor, lipOffEdgeColor: o.skylightLipOffEdgeColor,
            } : null,
            offLineColor: this.hallway ? 0x111111 : o.galleryOffEdgeColor,
            molding: o.molding, cornerLines: o.cornerLines, horizontalLines: o.horizontalLines ?? !olderHallway, wallClick, roomLights
        });
        this.layout.wallMeshes.forEach((mesh, index) => {
            mesh.userData.segment = index;
            mesh.userData.wall = this.segments[index].wall;
        });
        if (!this.hallway && o.gallerySkylight) this._addSkylightOutside();
        this.materials = materials;
        this._factories = this.app.createPropFactories({ ...this.layout, doorHeight: inchesToWorld(o.doorHeight) });
        this._factories.addLightFixture = createAddLightFixture({ scene, textureLoader, ...this.layout, roomLights,
            reactiveFace: !this.hallway && o.gallerySkylight });
        for (const [wall, door] of Object.entries(this.doors))
            await this._createDoor(wall, door);
        if (Object.values(this.doors).some(spec => spec.applySkyDoorGlow)) {
            setInterval(() => this._refreshSkylightDoors(), 30000);
            window.addEventListener('storage', () => this._refreshSkylightDoors());
        }
        if (this.hallway)
            this._addReferenceHallway();
        if (!this.hallway)
            this._addReferenceGallery();
        for (const task of this.commands.splice(0))
            await task();
        if (o.editor && !this.hallway)
            this.enableEditor();
        if (o.editor || (this.hallway && o.hallwayUploads))
            this.enableWallEditor();
        if (o.keyboard)
            this.keyboard = bindRoomKeyboard({ room: this, turnSpeed: o.keyboardTurnSpeed, facingTolerance: o.doorFacingTolerance });
        if (animateEntry) {
            this._doorTravelAngle = this.app.orbit.getAngle();
            this._doorTravelPending = true;
            this._runDoorTransition(true).then(() => {
                this._resetDoorTransition();
                this._playRoomSound(o.doorCloseSound, o.doorSfxVolume);
            })
                .catch(error => { this._resetDoorTransition(); console.error("Room entry transition failed", error); });
        }
        if (arrival.adjacent && !animateEntry) this._playRoomSound(o.doorCloseSound, o.doorSfxVolume);
        // The live page reveals skylight rooms only after their sky preset is ready.
        if (!(o.deferSkylightRender && !this.hallway && o.gallerySkylight)) this.app.startLoop();
        // Saved-on rooms render lit immediately; only new non-adjacent arrivals flicker on.
        if (!arrival.alreadyOn && arrival.automatic) this._setRoomLights(true);
        if (o.rememberLights) roomLightState.visit(o.roomId);
        this.ready = Promise.resolve(this);
        return this;
    }

    _setRoomLights(on) {
        if (this.galleryLights) this.galleryLights.setOn(on);
        else this.app.roomLights.setOn(on);
        if (this.options.rememberLights) roomLightState.setOn(this.options.roomId, on);
    }

    // Tree enclosure dimensions use feet; null preserves the example's room-relative proportions.
    _addSkylightOutside() {
        const { scene, textureLoader } = this.app;
        if (this.options.skylightDaylight) {
            const o = this.options;
            // Daylight fills the room only in the electric lights' off state.
            const daylight = new THREE.AmbientLight(o.skylightLightColor, o.skylightLightIntensity);
            daylight.name = "skylight-daylight";
            scene.add(daylight);
            this.app.roomLights.registerOffLight(daylight);
            this.skylightDaylight = daylight;
        }
        const outside = new THREE.Group();
        outside.name = "gallery-skylight-outside";
        const o = this.options;
        const width = o.skylightTreeWidth == null ? this.layout.bounds.width * 1.6 : feetToWorld(o.skylightTreeWidth);
        const height = o.skylightTreeHeight == null ? this.layout.height * 2.22 : feetToWorld(o.skylightTreeHeight);
        const depth = o.skylightTreeDepth == null ? this.layout.bounds.depth * 2.4 : feetToWorld(o.skylightTreeDepth);
        const centerY = this.layout.height * (1.15 / 15);
        // Outdoor imagery stays evenly bright regardless of the indoor electric lights.
        const trees = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide,
            transparent: true, alphaTest: 0.1, depthWrite: true, toneMapped: false });
        // Expose the outdoor surfaces for optional sky/lighting editors.
        this.skylightOutside = outside;
        this.skylightTreeMaterial = trees;
        const clear = new THREE.MeshStandardMaterial({ side: THREE.BackSide,
            transparent: true, opacity: 0, depthWrite: false });
        textureLoader.load(roomAsset("images/static_images/trees.png"), texture => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.magFilter = texture.minFilter = THREE.NearestFilter;
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(o.skylightTreeRepeatX, o.skylightTreeRepeatY);
            trees.map = texture;
            trees.needsUpdate = true;
        });
        const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth),
            [trees, trees, clear, clear, trees, trees]);
        box.position.y = centerY;
        outside.add(box);
        addVerticalCornerLinesFromOutline(outside,
            [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]],
            height, 0x333333, centerY - height / 2);
        // Lift the tree enclosure in inches without changing its original proportions.
        outside.position.y = inchesToWorld(this.options.skylightTreeLift);
        scene.add(outside);
        // Editors can wait for the original sky instead of racing its asynchronous load.
        this.skylightSkyReady = new Promise(resolve => {
            textureLoader.load(roomAsset("images/static_images/windows.png"), texture => {
                texture.colorSpace = THREE.SRGBColorSpace;
                scene.background = texture;
                resolve(texture);
            }, undefined, error => {
                console.warn("Skylight sky could not load:", error);
                resolve(null);
            });
        });
    }

    _addReferenceGallery() {
        const o = this.options, f = this._factories;
        if (o.defaultFixtures) {
            if (o.gallerySkylight) {
                const halfX = feetToWorld(o.width) / 2;
                const halfZ = feetToWorld(o.length) / 2;
                const opening = feetToWorld(o.skylightWidth) / 2;
                // Center fixtures in the solid ceiling strips outside the opening.
                const sideX = (halfX + opening) / 2;
                const sideZ = (halfZ + opening) / 2;
                const scale = Math.min(2.1, Math.min(halfX - opening, halfZ - opening) * 0.8 / LIGHT_WIDTH);
                for (const x of [-3.4, 3.4]) {
                    for (const z of [-sideZ, sideZ])
                        f.addLightFixture(x * feetToWorld(o.width) / 12, z, 0, { scale });
                }
                // The former middle pair turns in place and moves to the east/west strips.
                for (const x of [-sideX, sideX])
                    f.addLightFixture(x, 0, Math.PI / 2, { scale });
            } else {
                for (const x of [-3.4, 3.4]) {
                    for (const z of [-3.4, 0, 3.4]) {
                        f.addLightFixture(x * feetToWorld(o.width) / 12, z * feetToWorld(o.length) / 12, 0, { scale: 2.1 });
                    }
                }
            }
        }
        if (!o.defaultFurnishings)
            return;
        for (const [wall, spec] of Object.entries(this.doors)) {
            const door = spec.mesh;
            if (!door)
                continue;
            const a = this._anchor({ wall });
            const width = door.geometry.parameters.width;
            const along = wall === "north" || wall === "south" ? door.position.x : door.position.z;
            const switchAlong = along - width / 2 - 0.5;
            const wx = wall === "north" || wall === "south" ? switchAlong : this.layout.walls[wall].x;
            const wz = wall === "north" || wall === "south" ? this.layout.walls[wall].z : switchAlong;
            f.addLightSwitch(wall, wx, wz, door.geometry.parameters.height / 2, { scale: 1.55, switches: 1, isDisabled: false });
            const plaque = this._createRoomPlaque("Gallery " + String(o.roomId).toUpperCase(), 0.5, "#f4f4ec");
            plaque.rotation.y = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 }[wall];
            plaque.position.set(wx, -this.layout.height / 2 + door.geometry.parameters.height / 2 + 0.4, wz);
            plaque.translateZ(0.065);
            plaque.userData.galleryEntry = { id: String(o.roomId), url: window.location.href, current: true };
            this.app.scene.add(plaque);
            this.app.clickable.push(plaque);
            const half = a.edge.length / 2;
            const ventFromLeft = half + along * wallRightSign(wall);
            f.addVent(wall, ventFromLeft, { width: width * 2 / 3, yFromCeiling: 0.28 });
        }
    }

    _addReferenceHallway() {
        addReferenceHallwayContents(this);
    }

    async _createDoor(wall, spec) {
        const a = this._anchor({ wall });
        const add = createAddWallDoor({ ...this.app, ...this.layout, roomHeight: this.layout.height, bounds: this._wallBounds(a) });
        const galleryDoor = spec.destinationIsGallery ?? spec.bright ?? false;
        const skylightDoor = galleryDoor && galleryHasSkylight(spec.neighborId, this.skylightPolicy);
        const resolveAppearance = () => doorPresentation({ viewerHallway: this.hallway,
            viewerSkylight: !this.hallway && this.options.gallerySkylight,
            viewerOn: this.app.roomLights.isOn(), gallery: galleryDoor, skylight: skylightDoor,
            lightsOn: roomLightState.isOn(spec.neighborId), period: getCaliforniaSkyPeriod().period,
            distinctGalleryDoors: this.options.distinctGalleryDoors });
        const appearance = resolveAppearance();
        const state = appearance.state;
        const illuminated = state !== 'dark';
        const doorHeight = inchesToWorld(spec.height ?? this.options.doorHeight);
        const file = spec.file ?? roomAsset(appearance.file);
        const span = a.edge.length / 2;
        const fixedAlong = this.hallway ? 0 : span - doorHeight * (264 / 676) / 2 - 0.85;
        const mesh = await add(wall, file, doorHeight, {
            href: spec.href ?? null, locked: spec.locked,
            bright: illuminated,
            glow: 0.5,
            x: fixedAlong,
            isLabelled: this.options.showRoomNumbers && spec.label != null, label: spec.label ?? null,
            width: spec.width == null ? null : inchesToWorld(spec.width),
        });
        spec.mesh = mesh;
        if (mesh && !spec.file) {
            spec.skyDoorState = state;
            spec.doorAppearance = appearance;
            spec.resolveDoorAppearance = resolveAppearance;
            spec.applySkyDoorGlow = () => {
                const lit = spec.skyDoorState !== 'dark';
                const color = 0xffffff;
                mesh.material.color.setHex(color);
                mesh.material.emissive.setHex(lit ? color : 0x000000);
                mesh.material.emissiveMap = lit ? mesh.material.map : null;
                mesh.material.emissiveIntensity = lit ? spec.doorAppearance.glow * (this.app.roomLights.isOn() ? 1 : 0.8) : 0;
                mesh.material.toneMapped = !lit;
                mesh.material.needsUpdate = true;
            };
            spec.applySkyDoorGlow();
            this.app.roomLights.onChange(() => {
                spec.applySkyDoorGlow();
                this._refreshSkylightDoors();
            });
        } else if (mesh && this.hallway && illuminated)
            this.app.roomLights.registerDoorGlow(mesh.material);
        // Gallery entrances get the same raised, softly illuminated housing as exit signs.
        if (mesh && galleryDoor)
            this._factories.addExitSign(mesh, {
                file: roomAsset("images/enter.png"), right: true, heightRatio: 3 / 4, height: EXIT_DEFAULT_BOX_HEIGHT * 1.25,
                onCreate: sign => this._addGalleryEntryLabel(sign, spec)
            });
        if (spec.exitSign && mesh && !this.hallway)
            this._factories.addExitSign(mesh);
        return mesh;
    }

    async _refreshSkylightDoors() {
        for (const spec of Object.values(this.doors)) {
            if (!spec.applySkyDoorGlow) continue;
            const appearance = spec.resolveDoorAppearance();
            const token = JSON.stringify(appearance);
            if (token === JSON.stringify(spec.doorAppearance)) { spec.loadingSkyDoorState = null; continue; }
            if (token === spec.loadingSkyDoorState) continue;
            if (appearance.file === spec.doorAppearance.file) {
                spec.loadingSkyDoorState = null;
                spec.doorAppearance = appearance; spec.skyDoorState = appearance.state;
                spec.applySkyDoorGlow(); continue;
            }
            spec.loadingSkyDoorState = token;
            try {
                const file = appearance.file;
                const map = await this.app.textureLoader.loadAsync(roomAsset(file));
                // A newer refresh can supersede this texture while it loads.
                if (spec.loadingSkyDoorState !== token) { map.dispose(); continue; }
                map.colorSpace = THREE.SRGBColorSpace;
                map.magFilter = map.minFilter = THREE.NearestFilter;
                const previous = spec.mesh.material.map;
                spec.mesh.material.map = map;
                spec.skyDoorState = appearance.state;
                spec.doorAppearance = appearance;
                spec.applySkyDoorGlow();
                previous.dispose();
            } catch (error) { console.error('Gallery entrance could not update:', error); }
            finally { if (spec.loadingSkyDoorState === token) spec.loadingSkyDoorState = null; }
        }
    }

    // Exit signs expose compact location details without moving the user to another room.
    _addRoomExitSign(door) {
        this._factories.addExitSign(door, {
            file: EXIT_DEFAULT_IMAGE,
            onCreate: sign => {
                sign.userData.roomInfo = true;
                this.app.clickable.push(sign);
            },
        });
    }

    // Attach a small clickable destination plaque beneath the entrance sign.
    _addGalleryEntryLabel(sign, spec) {
        if (!spec.href) return;
        const url = new URL(spec.href, window.location.href);
        const id = String(spec.neighborId ?? url.searchParams.get("room") ?? spec.label ?? "gallery");
        const plaque = this._createRoomPlaque("Gallery " + id.toUpperCase(), sign.geometry.parameters.width, "#c9c9c9", 0.012);
        const height = plaque.geometry.parameters.height;
        plaque.position.set(0, -sign.geometry.parameters.height / 2 - height / 2 - 0.075,
            sign.geometry.parameters.depth / 2 + 0.002);
        plaque.userData.galleryEntry = { id, url: url.href };
        // The enter graphic and its plaque open the same destination information.
        if (this.hallway) {
            sign.userData.galleryEntry = plaque.userData.galleryEntry;
            this.app.clickable.push(sign);
        }
        sign.add(plaque);
        this.app.clickable.push(plaque);
    }

    // Labels follow room lighting, with an optional faint glow for dark hallways.
    _createRoomPlaque(text, width, background = "#d2d2d2", glow = 0) {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 192;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#191919";
        ctx.font = "48px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 40);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return new THREE.Mesh(new THREE.PlaneGeometry(width, width * canvas.height / canvas.width),
            new THREE.MeshStandardMaterial({
                map: texture, emissive: 0xffffff,
                emissiveMap: texture, emissiveIntensity: glow
            }));
    }

    // The compass asset contains 32 vertically stacked 16-pixel direction frames.
    _addCompass() {
        const compass = document.createElement("button");
        compass.type = "button";
        compass.className = "room-compass";
        compass.setAttribute("aria-label", "Open room information; red compass needle points north");
        compass.title = "room information";
        compass.addEventListener("click", () => {
            if (!this._doorTravelPending) this._openRoomInfo();
        });
        compass.style.backgroundImage = `url("${roomAsset("images/compass.png")}")`;
        compass.hidden = true;
        this.stage.appendChild(compass);
        this.compass = compass;
    }

    _updateCompass() {
        if (!this.compass) return;
        this.compass.hidden = Boolean(this.stage.querySelector(
            'dialog[open], #lightbox.is-open, #video-lightbox.is-open'
        ));
        // Frame 16 points up; positive camera angles turn the north needle clockwise.
        const frame = ((Math.round(16 + this.app.orbit.getAngle() * 32 / (Math.PI * 2)) % 32) + 32) % 32;
        this.compass.style.backgroundPosition = `0 ${frame * 100 / 31}%`;
    }

    // Compass and exit signs share all location details; only exit signs add their notice.
    _openRoomInfo(exitSign = false) {
        const shared = this.options.roomInfo ?? "Room " + String(this.options.roomId).toUpperCase();
        const notice = exitSign && this.options.exitNotice ? this.options.exitNotice + "\n" : "";
        return this._openGalleryEntry({
            id: String(this.options.roomId), url: window.location.href,
            info: notice + shared
        });
    }

    // Every panel shares the same saved audio preference and updates immediately when it changes.
    _addAudioToggle(panel) {
        this.skyLighting?.addControls(panel);
        if (!panel || panel.querySelector("[data-room-audio]")) return;
        const label = document.createElement("label");
        label.dataset.roomAudio = "";
        label.innerHTML = '<span class="modal-label">audio</span>: <input type="checkbox" aria-label="audio on/off">';
        const input = label.querySelector("input");
        this.app.music.onSoundChange(on => input.checked = on);
        input.onchange = () => this.app.music.setSoundOn(input.checked);
        // Keep checkbox taps from closing a lightbox or starting image dragging.
        for (const type of ["click", "pointerdown", "dblclick"])
            label.addEventListener(type, event => event.stopPropagation());
        panel.appendChild(label);
        const wind = document.createElement("label");
        wind.dataset.roomWind = "";
        wind.innerHTML = ' <span class="modal-label">wind</span>: <input type="checkbox" aria-label="wind on/off">';
        const windInput = wind.querySelector("input");
        this.app.music.onWindChange(on => windInput.checked = on);
        windInput.onchange = () => this.app.music.setWindOn(windInput.checked);
        for (const type of ["click", "pointerdown", "dblclick"])
            wind.addEventListener(type, event => event.stopPropagation());
        panel.appendChild(wind);
        const buzz = document.createElement("label");
        buzz.dataset.roomBuzz = "";
        buzz.innerHTML = ' <span class="modal-label">buzz</span>: <input type="checkbox" aria-label="light buzzing on/off">';
        const buzzInput = buzz.querySelector("input");
        this.app.music.onBuzzChange(on => buzzInput.checked = on);
        buzzInput.onchange = () => this.app.music.setBuzzOn(buzzInput.checked);
        for (const type of ["click", "pointerdown", "dblclick"])
            buzz.addEventListener(type, event => event.stopPropagation());
        panel.appendChild(buzz);
        const music = document.createElement("label");
        music.innerHTML = ' <span class="modal-label">music</span>: <input type="checkbox" aria-label="music on/off">';
        const musicInput = music.querySelector("input");
        this.app.music.onMusicChange(on => musicInput.checked = on);
        musicInput.onchange = () => this.app.music.setMusicOn(musicInput.checked);
        for (const type of ["click", "pointerdown", "dblclick"])
            music.addEventListener(type, event => event.stopPropagation());
        panel.appendChild(music);
        if (this.options.temporaryVolumeSliders) {
            const controls = document.createElement("div");
            controls.className = "room-volume-controls";
            const volumes = [
                ["windVolume", "wind", this.options.musicVolume],
                ["skylightWindVolume", "skylight wind / birds"],
                ["backgroundMusicVolume", "music"],
                ["lightBuzzVolume", "buzz"],
                ["lightSwitchVolume", "switch"],
                ["lightboxSfxVolume", "artwork"],
                ["stepVolume", "steps"],
                ["doorOpenVolume", "door opening"],
                ["doorSfxVolume", "door closing"],
                ["doorLockedVolume", "locked door"],
                ["doorUnlockedVolume", "legacy door"],
            ];
            for (const [key, name, fallback] of volumes) {
                const row = document.createElement("label");
                row.style.display = "flex";
                row.style.alignItems = "center";
                row.style.gap = "0.4em";
                const title = document.createElement("span");
                title.textContent = name + ":";
                const slider = document.createElement("input");
                slider.type = "range";
                slider.min = "0";
                slider.max = "1";
                slider.step = "0.01";
                slider.dataset.volumeKey = key;
                slider.setAttribute("aria-label", name + " volume");
                slider.value = this.options[key] ?? fallback ?? 1;
                const value = document.createElement("output");
                value.textContent = Number(slider.value).toFixed(2);
                slider.oninput = () => {
                    const level = Number(slider.value);
                    this.options[key] = level;
                    try { localStorage.setItem(`y9k-volume:${key}`, String(level)); } catch { }
                    this.app.setAudioVolume(key, level, !this.hallway && this.options.gallerySkylight);
                    // Keep sliders in every room panel showing the same current value.
                    document.querySelectorAll(`[data-volume-key="${key}"]`).forEach(input => {
                        input.value = level;
                        input.nextElementSibling.textContent = level.toFixed(2);
                    });
                };
                row.append(title, slider, value);
                controls.appendChild(row);
            }
            for (const type of ["click", "pointerdown", "dblclick"])
                controls.addEventListener(type, event => event.stopPropagation());
            panel.appendChild(controls);
        }

    }

    // Switching room interactions closes the old panel and discards unsaved previews first.
    async _closeModals() {
        if (this.wallEditor?.open) await this.closeWallEditor();
        this.entryDialog?.close();
        this.app.lightbox?.close();
        this.app.videoLightbox?.close();
        this.app.wallClick.hideCrosshair();
    }

    // Resolve door links against this deployment and offer copying without navigation.
    async _openGalleryEntry({ id, url, current = false, info = null }) {
        await this._closeModals();
        if (!this.entryDialog) {
            const panel = document.createElement("dialog");
            panel.className = "wall-image-editor";
            panel.setAttribute("aria-label", "gallery entry details");
            panel.innerHTML = `<div class="wall-editor-header">
                <span data-entry></span><button type="button" name="close" aria-label="close gallery details">x</button>
                </div><p data-info hidden style="white-space:pre-line"></p><p><a data-url></a></p>
                <button type="button" data-copy>copy room link</button><p role="status" aria-live="polite"></p>`;
            this.stage.appendChild(panel);
            this._addAudioToggle(panel);
            panel.querySelector('[name="close"]').onclick = () => panel.close();
            panel.querySelector("[data-copy]").onclick = async () => {
                const link = panel.querySelector("[data-url]"), status = panel.querySelector("[role=status]");
                const selectLink = () => {
                    const range = document.createRange();
                    range.selectNodeContents(link);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                };
                try {
                    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link.href);
                    else {
                        selectLink();
                        if (!document.execCommand("copy")) throw new Error("copy unavailable");
                    }
                    status.textContent = "room link copied";
                } catch {
                    selectLink();
                    status.textContent = "select and copy the room link manually";
                }
            };
            this.entryDialog = panel;
        }
        const heading = this.entryDialog.querySelector("[data-entry]");
        if (info || !current) {
            const label = document.createElement("span");
            label.className = "modal-label";
            label.textContent = info ? "Current Room" : "Entry to Gallery";
            heading.replaceChildren(label, document.createTextNode(": " + id.toUpperCase()));
        } else {
            heading.textContent = "Gallery " + id.toUpperCase();
        }
        const details = this.entryDialog.querySelector("[data-info]");
        details.hidden = !info;
        // Build text nodes so labels can be styled without treating room data as HTML.
        details.replaceChildren();
        for (const [index, line] of (info ?? "").split("\n").entries()) {
            if (index) details.append(document.createTextNode("\n"));
            const colon = line.indexOf(":");
            if (colon < 0) { details.append(document.createTextNode(line)); continue; }
            const label = document.createElement("span");
            label.className = "modal-label";
            label.textContent = line.slice(0, colon);
            details.append(label, document.createTextNode(line.slice(colon)));
        }
        const link = this.entryDialog.querySelector("[data-url]");
        link.href = url;
        link.textContent = url;
        this.entryDialog.querySelector("[role=status]").textContent = "";
        if (!this.entryDialog.open) this.entryDialog.show();
    }

    // Manual turns and door-centering pans share angular footsteps; idle auto-spin stays silent.
    _onUserRotate(radians, transitionPan = false) {
        const degrees = Number(this.options.rotationStepDegrees);
        if ((this._doorTravelPending && !transitionPan) || !(degrees > 0) || !this.app.music.isSoundOn()) {
            this._rotationStepTravel = 0;
            return;
        }
        const interval = degrees * Math.PI / 180;
        this._rotationStepTravel = (this._rotationStepTravel ?? 0) + Math.abs(radians);
        if (this._rotationStepTravel >= interval) {
            // Consume excess angle immediately: skipped footsteps never accumulate in a queue.
            this._rotationStepTravel %= interval;
            const walkingInterval = Math.max(1, Number(this.options.doorTransitionDuration) || 2000)
                / Math.max(1, Math.round(Number(this.options.doorTransitionSteps) || 4));
            const minimum = Math.max(0, Number(this.options.rotationStepMinInterval ?? walkingInterval) || 0);
            const now = performance.now();
            if (now - (this._lastRotationStepAt ?? -Infinity) < minimum) return;
            this._lastRotationStepAt = now;
            this._playRoomSound(this.options.stepSound, this.options.stepVolume);
        }
    }

    // Sound paths can be replaced or set to null; the shared audio toggle controls playback.
    _playRoomSound(path, volume) {
        return path ? this.app.music.playSfx(path, volume) : Promise.resolve();
    }

    // Rotate along the shortest arc until the clicked door is horizontally centered.
    _panToDoor(door) {
        if (!this.options.doorTransition || !this.options.doorTransitionPan) return Promise.resolve();
        const position = door.getWorldPosition(new THREE.Vector3());
        const from = this.app.orbit.getAngle();
        const target = Math.atan2(-position.x, -position.z);
        const difference = Math.atan2(Math.sin(target - from), Math.cos(target - from));
        const threshold = Math.max(0, Number(this.options.doorTransitionPanThreshold) || 0);
        // Skip nearly centered doors without snapping the camera to a new angle.
        if (Math.abs(difference) * 180 / Math.PI <= threshold) return Promise.resolve();
        // Constant angular speed: a 10-degree turn finishes much sooner than a 90-degree turn.
        const speed = Math.max(1, Number(this.options.doorTransitionPanSpeed) || 45);
        const minimum = Math.max(0, Number(this.options.doorTransitionPanMinDuration) || 0);
        const duration = Math.max(minimum, Math.abs(difference) * 180 / Math.PI / speed * 1000);
        const start = performance.now();
        let previousAngle = from;
        return new Promise(resolve => {
            const frame = now => {
                const progress = Math.min(1, Math.max(0, (now - start) / duration));
                const eased = progress * progress * (3 - 2 * progress);
                this._doorTravelAngle = from + difference * eased;
                this.app.orbit.setAngle(this._doorTravelAngle);
                this._onUserRotate(this._doorTravelAngle - previousAngle, true);
                previousAngle = this._doorTravelAngle;
                if (progress < 1) requestAnimationFrame(frame);
                else resolve();
            };
            requestAnimationFrame(frame);
        });
    }

    // Exit zooms in to black; adjacent-room entry starts wider and settles while fading in.
    _runDoorTransition(entering = false) {
        if (!this.options.doorTransition) return Promise.resolve();
        const camera = this.app.camera;
        const normalFov = camera.fov;
        this._doorOriginalFov = normalFov;
        const duration = Math.max(1, Number(this.options.doorTransitionDuration) || 2000);
        const zoom = Math.max(1, Number(entering ? this.options.roomEntryZoom : this.options.doorTransitionZoom) || 1);
        const fadeStart = Math.max(0, Math.min(0.99, Number(this.options.doorTransitionFadeStart) || 0));
        const startFov = entering ? Math.min(160, 2 * Math.atan(Math.tan(normalFov * Math.PI / 360) * zoom) * 180 / Math.PI) : normalFov;
        const endFov = entering ? normalFov : 2 * Math.atan(Math.tan(normalFov * Math.PI / 360) / zoom) * 180 / Math.PI;
        const cover = this._doorFade ?? document.createElement("div");
        cover.className = "door-transition";
        cover.setAttribute("aria-hidden", "true");
        cover.style.opacity = entering ? 1 : 0;
        this.stage.appendChild(cover);
        this._doorFade = cover;
        camera.fov = startFov;
        camera.updateProjectionMatrix();
        const start = performance.now();
        const smooth = t => t * t * (3 - 2 * t);
        const walking = this.options.doorTransitionMode === "walk";
        const steps = Math.max(1, Math.round(Number(this.options.doorTransitionSteps) || 4));
        const bob = inchesToWorld(Math.max(0, Number(this.options.doorTransitionBob) || 0));
        camera.userData.transitionBob = 0;
        let lastStep = 0;
        let opening = null;
        return new Promise((resolve, reject) => {
            const frame = now => {
                const progress = Math.min(1, Math.max(0, (now - start) / duration));
                const stride = progress * steps;
                const fraction = stride - Math.floor(stride);
                // One footfall near each stride's midpoint, without bursts after a stalled frame.
                const footfall = Math.min(steps, Math.floor(stride + 0.5));
                if (walking && footfall > lastStep) {
                    lastStep = footfall;
                    this._playRoomSound(this.options.stepSound, this.options.stepVolume);
                }
                // Each stride advances gently, then pauses briefly rather than snapping between frames.
                const stepped = (Math.floor(stride) + smooth(Math.min(1, fraction / 0.65))) / steps;
                const zoomProgress = walking ? Math.min(1, stepped) : progress;
                camera.fov = startFov + (endFov - startFov) * smooth(zoomProgress);
                camera.userData.transitionBob = walking
                    ? Math.sin(stride * Math.PI * 2) * bob * Math.sin(progress * Math.PI) : 0;
                camera.updateProjectionMatrix();
                cover.style.opacity = entering
                    ? 1 - smooth(Math.min(1, progress / (1 - fadeStart)))
                    : smooth(Math.max(0, (progress - fadeStart) / (1 - fadeStart)));
                // Position the opening sound within the fade-out; footsteps may overlap.
                const fadeProgress = Math.max(0, Math.min(1, Number(this.options.doorOpenFadeProgress) || 0));
                const openAt = fadeStart + (1 - fadeStart) * fadeProgress;
                if (!entering && !opening && progress >= openAt) {
                    opening = this._playRoomSound(this.options.doorOpenSound, this.options.doorOpenVolume);
                }
                if (progress < 1) requestAnimationFrame(frame);
                else {
                    camera.userData.transitionBob = 0;
                    Promise.resolve(opening).then(resolve, reject);
                }
            };
            requestAnimationFrame(frame);
        });
    }

    _resetDoorTransition() {
        this.app.camera.userData.transitionBob = 0;
        this._doorFade?.remove();
        this._doorFade = null;
        if (this._doorOriginalFov != null) {
            this.app.camera.fov = this._doorOriginalFov;
            this.app.camera.updateProjectionMatrix();
            this._doorOriginalFov = null;
        }
        this._doorTravelPending = false;
    }

    async _hit(object) {
        if (object.userData.isDoor && this.wallEditor?.open) return;
        if (this._doorTravelPending) return;
        const data = object.userData;
        // Releasing the press that opened artwork editing must not open its lightbox.
        if (data.imageFile && this._heldArtwork === data.roomImageId) {
            this._heldArtwork = null;
            return;
        }
        if (data.roomInfo) {
            this._openRoomInfo(true);
            return;
        }
        if (data.galleryEntry) { this._openGalleryEntry(data.galleryEntry); return; }
        await this._closeModals();
        if (data.roomImageId != null && !this.images.has(String(data.roomImageId))) return;
        if (data.isLightSwitch) {
            if (this._doorTravelPending)
                return;
            if (data.isDisabled === false) {
                const on = this.galleryLights ? this.galleryLights.isRequestedOn() : this.app.roomLights.isOn();
                this._setRoomLights(!on);
            }
            this.app.music.playSfx(this.options.lightSwitchSound ?? DEFAULT_LIGHT_SWITCH_SOUND, this.options.lightSwitchVolume);
        }
        else if (data.isDoor) {
            if (this._doorTravelPending)
                return;
            if (data.locked) {
                this.app.music.playSfx(this.app.doorLockedSound, this.options.doorLockedVolume);
            }
            else {
                writeStoredViewFacing(data.wall);
                this._doorTravelAngle = this.app.orbit.getAngle();
                this._doorTravelPending = true;
                const travel = async () => {
                    if (data.href) await this._panToDoor(object);
                    if (data.href && this.options.doorTransition) await this._runDoorTransition();
                    else await this._playRoomSound(this.options.doorOpenSound, this.options.doorOpenVolume);
                };
                travel().then(() => {
                    if (data.href)
                        window.location.assign(data.href);
                    else
                        this._resetDoorTransition();
                }).catch(error => {
                    this._resetDoorTransition();
                    console.error("Door travel failed", error);
                });
            }
        }
        else if (data.isVideoScreen) {
            if (data.videoUrl)
                this.app.videoLightbox.open(data.videoUrl);
        }
        else if (data.imageFile) {
            this.selectImage(data.roomImageId);
            this.app.lightbox.open(data.imageFile, this.app.music.isSoundOn(), data.imageName, { source: object });
        }
        this.options.onHit?.(object, this);
    }

    addImage({ wall = "north", x = 0, y = this.options.artY, width = this.options.artWidth, file, id = null, name = null, editable = true, segment = null } = {}) {
        if (!file)
            throw new Error("addImage needs a URL, File, or Blob in file.");
        if (this.hallway && typeof wall === "number") segment = wall;
        else wall = roomWall(wall);
        id = id ?? newPlacementId();
        return this._enqueue(async () => {
            if (this.images.has(String(id)))
                throw new Error("Duplicate image id: " + id);
            if (this.hallway && segment != null) {
                const edge = this.segments[segment];
                if (!edge) { console.warn('Skipping artwork with an unavailable hallway wall:', segment); return; }
                wall = edge.wall;
            }
            const anchor = this._anchor({ wall, segment });
            segment = this.hallway ? anchor.edge.index : null;
            const bounds = this._wallBounds(anchor);
            const add = createAddUserWallImage({ ...this.app, ...this.layout, bounds,
                wallInset: this.hallway ? (this.layout.wallInset ?? 0.05) + inchesToWorld(0.01) : this.layout.wallInset });
            const art = await add(wall, inchesToWorld(x) * wallRightSign(wall), file, inchesToWorld(width), {
                heightFromFloor: this.layout.height / 2 + inchesToWorld(y),
            });
            if (!art)
                throw new Error("Could not load image: " + (name ?? id));
            art.userData.roomImageId = String(id);
            art.userData.segment = segment;
            art.userData.artWallInset = this.hallway ? (this.layout.wallInset ?? 0.05) + inchesToWorld(0.01) : this.layout.wallInset;
            art.userData.editable = editable;
            art.userData.isUserArt = editable;
            if (name)
                art.userData.imageName = name;
            this.images.set(String(id), art);
            layerWallImages(this.images.values());
        });
    }

    addImages(images, { stored = false, ...options } = {}) {
        if (stored)
            return this.addDatabaseImages(images, options);
        for (const image of images)
            this.addImage(image);
        return this;
    }

    async placeImage(image) {
        if (!this.images.has(String(image.id))) {
            this.addImage({ id: image.id, file: image.url, name: image.filename });
            await this.ready;
        }
        this.selectImage(image.id);
        if (!document.body.classList.contains("is-dev-mode"))
            document.getElementById("dev-toggle").click();
        this.editor.open = true;
        this.editorStatus.textContent = "Choose a wall position, then Save selected to store it.";
        return this;
    }

    addDatabaseImages(rows, { url = row => row.url } = {}) {
        for (const row of rows) {
            if (row.wall == null || row.x == null || row.y == null || !(row.width > 0))
                continue;
            this.addImage({
                id: row.id, name: row.filename, file: url(row), wall: Number(row.wall),
                x: row.x / 2.54, y: row.y / 2.54, width: row.width / 2.54
            });
        }
        return this;
    }

    imagePlacement(id) {
        const art = this.images.get(String(id));
        if (!art)
            throw new Error("Unknown image id: " + id);
        const p = art.userData.placement;
        return {
            id: String(id), wall: p.wall, segment: art.userData.segment ?? null, x: worldToInches(p.x) * wallRightSign(p.wall),
            y: worldToInches(p.heightFromFloor - this.layout.height / 2), width: worldToInches(art.userData.artWidth)
        };
    }

    databasePlacement(id) {
        const p = this.imagePlacement(id);
        return { id: p.id, ...storedPlacement(p) };
    }

    async moveImage(id, patch = {}, { persist = true } = {}) {
        const art = this.images.get(String(id));
        if (!art || !art.userData.editable)
            throw new Error("This image cannot be edited.");
        const current = this.imagePlacement(id);
        const p = { ...current, ...patch };
        // Saved notes are static physical objects. Creation previews can still set their initial size.
        if (wallTextKind(art.userData.imageName) && !String(id).startsWith('preview-')) p.width = current.width;
        p.wall = roomWall(p.wall);
        const bounds = this._wallBounds(this._anchor({ wall: p.wall, segment: art.userData.segment }));
        const half = p.wall === "north" || p.wall === "south" ? bounds.halfX : bounds.halfZ;
        p.x = Math.max(-worldToInches(half), Math.min(worldToInches(half), Number(p.x)));
        p.y = Math.max(-this.options.height * 6, Math.min(this.options.height * 6, Number(p.y)));
        if (!(Number(p.width) > 0))
            throw new Error("Image width must be positive.");
        if (persist && this.options.persistence?.move)
            await this.options.persistence.move(p, art);
        art.userData.placement.wall = p.wall;
        updateUserArtPlacement(art, {
            width: inchesToWorld(p.width),
            uX: (inchesToWorld(p.x) * wallRightSign(p.wall) + half) / (2 * half),
            uY: (inchesToWorld(p.y) + this.layout.height / 2) / this.layout.height,
        }, { ...this.layout, bounds, wallInset: art.userData.artWallInset ?? this.layout.wallInset });
        // Placement resets the mesh to the wall, so its old offset is already gone.
        art.userData.wallLayerOffset = 0;
        layerWallImages(this.images.values());
        this.selectImage(id);
        return this.imagePlacement(id);
    }

    async deleteImage(id, { persist = true } = {}) {
        const art = this.images.get(String(id));
        if (!art || !art.userData.editable)
            throw new Error("This image cannot be deleted.");
        if (persist && this.options.persistence?.delete)
            await this.options.persistence.delete(this.imagePlacement(id), art);
        this.app.lightbox?.close();
        removeUserWallImage(art, { clickable: this.app.clickable });
        this.images.delete(String(id));
        layerWallImages(this.images.values());
        this.selectedImage = null;
        this._refreshEditor();
    }

    selectImage(id) {
        this.selectedImage = this.images.has(String(id)) ? String(id) : null;
        this._refreshEditor();
    }

    _addWallProp(position, build) {
        return this._enqueue(() => build(this._anchor(position)));
    }

    addBoxes({ wall = "north", x = 0, stack = 1, width = 14.4, height = 11.2, depth = 18.4, wobble = true, face, side, segment = null } = {}) {
        return this._addWallProp({ wall, x, segment }, a => {
            this._factories.addBoxStack(a.x, a.z, a.wall, stack, { width: inchesToWorld(width), height: inchesToWorld(height), depth: inchesToWorld(depth), wobble, face, side });
        });
    }

    addChairs({ wall = "north", x = 0, stack = 1, height = 40.5, width, lean = 0.2, gap = 1.6, clearance = 0.8, file, segment = null } = {}) {
        return this._addWallProp({ wall, x, segment }, a => {
            this._factories.addFoldingChairs(a.x, a.z, a.wall, stack, { height: inchesToWorld(height), width: width == null ? null : inchesToWorld(width), lean, gap: inchesToWorld(gap), clearance: inchesToWorld(clearance), file });
        });
    }

    addLightSwitch({ wall = "north", x = 24, y = 48 - this.options.height * 6, scale = 1.55, switches = 1, disabled = false, segment = null } = {}) {
        return this._addWallProp({ wall, x, segment }, a => {
            this._factories.addLightSwitch(a.wall, a.x, a.z, this.layout.height / 2 + inchesToWorld(y), { scale, switches, isDisabled: disabled });
        });
    }

    addElectricalBox({ wall = "north", x = 0, y = -20, width, height = 19, color = 0xb4b4b4, file = roomAsset("images/static_images/electrical.jpg"), segment = null } = {}) {
        return this._addWallProp({ wall, x, segment }, a => {
            this._factories.addElectricalBox(a.wall, a.x, a.z, file, this.layout.height / 2 + inchesToWorld(y - height / 2), width == null ? undefined : inchesToWorld(width), inchesToWorld(height), color);
        });
    }

    addExitSign({ wall = "north", x = 0, width, height = 7, ceilingGap = 4, color = 0xb4b4b4, file = roomAsset("images/static_images/exit-1.jpg"), segment = null } = {}) {
        return this._addWallProp({ wall, x, segment }, a => {
            this._factories.addExitSign(a.wall, a.x, a.z, file, width == null ? undefined : inchesToWorld(width), inchesToWorld(height), color, inchesToWorld(ceilingGap));
        });
    }

    addLight({ x = 0, z = 0, rotation = 0, scale = 1, length = 27, width = 5.6 } = {}) {
        return this._enqueue(() => this._factories.addLightFixture(inchesToWorld(x), inchesToWorld(z), rotation * Math.PI / 180, { scale, length: inchesToWorld(length), width: inchesToWorld(width) }));
    }

    addVent({ wall = "north", x = 0, width = 13, height = 5, ceilingGap = 5.6, segment = null } = {}) {
        return this._addWallProp({ wall, x, segment }, a => {
            const e = a.edge, sign = wallRightSign(a.wall);
            const spec = { x: e.x, z: e.z, leftX: e.x - sign * e.length / 2, leftZ: e.z - sign * e.length / 2 };
            const add = createAddVent({ ...this.app, ...this.layout, walls: { [a.wall]: spec } });
            add(a.wall, e.length / 2 + inchesToWorld(x), { width: inchesToWorld(width), height: inchesToWorld(height), yFromCeiling: inchesToWorld(ceilingGap) });
        });
    }

    addVideo({ wall = "north", x = 0, y = this.options.artY, width = 40, url = null, preview = null, aspect = 16 / 9, bezel = 2.4, bezelBottom, depth = 1.8, frameColor = 0x111111, color = 0x1a4cff, previewSpeed = 0.4, conduit = false, segment = null } = {}) {
        return this._enqueue(() => {
            const a = this._anchor({ wall, segment });
            const add = createAddWallVideoScreen({ ...this.app, ...this.layout, bounds: this._wallBounds(a) });
            add(a.wall, inchesToWorld(x) * wallRightSign(a.wall), inchesToWorld(width), {
                heightFromFloor: this.layout.height / 2 + inchesToWorld(y), videoUrl: url, previewSrc: preview,
                aspect, bezel: inchesToWorld(bezel), bezelBottom: bezelBottom == null ? undefined : inchesToWorld(bezelBottom),
                depth: inchesToWorld(depth), frameColor, color, previewSpeed, conduit,
            });
        });
    }

    setLights(on = true) {
        return this._enqueue(() => this._setRoomLights(on));
    }

    addCustom(build) {
        return this._enqueue(() => build({ THREE, room: this, ...this.app, layout: this.layout, inchesToWorld, feetToWorld }));
    }

    enableEditor() {
        if (this.hallway || this.editor)
            return this;
        const panel = document.createElement("details");
        panel.id = "room-editor";
        panel.innerHTML = `<summary>Edit artwork</summary>
            <p>Click a wall to choose a new position. Click artwork to select it.</p>
            <label>Wall <select name="wall"><option>north</option><option>east</option><option>south</option><option>west</option></select></label>
            <label>Right/left (in) <input name="x" type="number" step="0.1" value="0"></label>
            <label>Up/down (in) <input name="y" type="number" step="0.1" value="${this.options.artY}"></label>
            <label>Width (in) <input name="width" type="number" min="0.1" step="0.1" value="${this.options.artWidth}"></label>
            <input name="file" type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden>
            <button type="button" data-action="upload">Add image here</button>
            <button type="button" data-action="move">Save selected</button>
            <button type="button" data-action="delete">Delete selected</button>
            <button type="button" data-action="clear">Clear selection</button>
            <p id="room-editor-status" role="status"></p>`;
        this.stage.appendChild(panel);
        this.editor = panel;
        this.editorStatus = panel.querySelector("[role=status]");
        this.editorFields = Object.fromEntries(["wall", "x", "y", "width", "file"].map(key => [key, panel.querySelector(`[name=${key}]`)]));
        const fields = this.editorFields;
        this.app.wallClick.onWallPick(info => {
            if (!panel.open || document.getElementById("lightbox")?.classList.contains("is-open"))
                return;
            const p = info.world, wall = info.wall;
            fields.wall.value = wall;
            fields.x.value = (worldToInches(wall === "north" || wall === "south" ? p.x : p.z) * wallRightSign(wall)).toFixed(1);
            fields.y.value = worldToInches(p.y).toFixed(1);
            const hud = document.getElementById("wall-click-hud");
            if (hud)
                hud.textContent = `${wall}: x ${fields.x.value} in, y ${fields.y.value} in (wall center)`;
        });
        const run = async (action) => {
            panel.querySelectorAll("button").forEach(button => button.disabled = true);
            try {
                await action();
                this.editorStatus.textContent = this.options.persistence ? "Saved." : "Preview only; no storage adapter supplied.";
            }
            catch (error) {
                this.editorStatus.textContent = error.message;
            }
            finally {
                this._refreshEditor();
            }
        };
        const placement = () => ({ wall: fields.wall.value, x: Number(fields.x.value), y: Number(fields.y.value), width: Number(fields.width.value) });
        panel.querySelector('[data-action=upload]').onclick = () => fields.file.click();
        fields.file.onchange = () => run(async () => {
            const file = fields.file.files[0];
            if (!file)
                return;
            const p = placement();
            const saved = this.options.persistence?.upload ? await this.options.persistence.upload(p, file) : {};
            this.addImage({ ...p, file: saved.url ?? file, id: saved.id, name: saved.filename ?? file.name });
            await this.ready;
            fields.file.value = "";
            if (!this.options.persistence)
                this.editorStatus.textContent = "Preview only; no storage adapter supplied.";
        });
        panel.querySelector('[data-action=move]').onclick = () => run(() => this.moveImage(this.selectedImage, placement()));
        panel.querySelector('[data-action=delete]').onclick = () => run(() => this.deleteImage(this.selectedImage));
        panel.querySelector('[data-action=clear]').onclick = () => this.selectImage(null);
        this.app.lightbox.setUserArtDeleteHandler(null);
        this._refreshEditor();
        return this;
    }

    // Double-click a gallery wall to preview an upload without changing the saved room.
    enableWallEditor() {
        if (this.wallEditor)
            return this;
        const panel = document.createElement("dialog");
        panel.id = "wall-image-editor";
        // Style this panel through .wall-image-editor in index.php.
        panel.className = "wall-image-editor";
        panel.innerHTML = `<form>
            <div class="wall-editor-header">
                <div class="wall-editor-filename"></div>
                <button type="button" name="close" aria-label="close artwork editor">x</button>
            </div>
            <label data-create-kind hidden><span class="modal-label">type</span>: <select name="kind"><option value="image">image</option><option value="text">text</option></select></label><br data-create-kind hidden>
            <div data-image-file><input name="file" type="file" aria-label="choose image" accept="image/jpeg,image/png,image/gif,image/webp"><br>
                <label data-upload-name><span class="modal-label">filename</span>: <input name="uploadName" type="text" aria-label="Optional filename without extension" placeholder="original filename" maxlength="80"></label>
                <small data-upload-name>optional · no file extension</small>
            </div>
            <fieldset data-note-controls hidden>
                <legend>Static text image</legend>
                <label>paper <select name="notePaper">${Object.entries(WALL_TEXT_BACKGROUNDS).map(([key, paper]) => `<option value="${key}">${paper.label}</option>`).join('')}</select></label>
                <textarea name="noteText" rows="6" placeholder="[your text here]" aria-label="Note text"></textarea>
                <label>font <select name="noteFont">${Object.entries(WALL_TEXT_FONTS).map(([key, font]) => `<option value="${key}">${font.label}</option>`).join('')}</select></label>
                <label>font size <input name="noteFontSize" type="range" min="6" max="144" step="1" value="12"><output data-note-value="noteFontSize"></output></label>
                <label>left / right padding <input name="notePaddingX" type="range" min="0" max="2" step="0.05" value="0.2"><output data-note-value="notePaddingX"></output></label>
                <label>top / bottom padding <input name="notePaddingY" type="range" min="0" max="2" step="0.05" value="0.2"><output data-note-value="notePaddingY"></output></label>
                <label>line spacing <input name="noteLineHeight" type="range" min="1" max="2.5" step="0.05" value="1.3"><output data-note-value="noteLineHeight"></output></label>
                <label>alignment <select name="noteAlign"><option value="left">left</option><option value="center">center</option><option value="right">right</option></select></label>
                <div class="note-preview-label">Preview</div>
                <div data-note-preview role="img" aria-label="Text image preview"></div>
                <p data-note-size></p>
                <p>Black text is saved as a PNG. Paper sizes are fixed; text beyond the paper is clipped. Saved text cannot be edited.</p>
            </fieldset>
            <label><span><span class="modal-label">wall</span>:</span> <select name="wall"><option>north</option><option>east</option><option>south</option><option>west</option></select></label><br>
            <label><span><span class="modal-label">from left</span>:</span> <input name="x" type="range" step="0.1"><output data-value="x"></output></label><br>
            <label><span><span class="modal-label">from floor</span>:</span> <input name="y" type="range" step="0.1"><output data-value="y"></output></label><br>
            <label><span><span class="modal-label">width</span>:</span> <input name="width" type="range" min="0.1" step="0.1"><output data-value="width"></output></label><br>
            <div class="wall-editor-actions">
                <button type="submit">save</button>
                <button type="button" name="remove" hidden>delete</button>
            </div>
            <div role="status" aria-live="polite"></div>
        </form>`;
        panel.setAttribute("aria-label", "artwork upload and placement");
        this.stage.appendChild(panel);
        this.wallEditor = panel;
        this._addAudioToggle(panel);
        panel.addEventListener("close", () => this.app.wallClick.hideCrosshair());
        const form = panel.querySelector("form"), fields = form.elements;
        const status = panel.querySelector("[role=status]");
        const filename = panel.querySelector(".wall-editor-filename");
        // Preserve diagnostic line breaks and wrap long filenames or server messages.
        status.style.whiteSpace = "pre-wrap";
        status.style.overflowWrap = "anywhere";
        let id = null, file = null, saved = null, busy = false;
        let noteTimer = null, activeSegment = null;
        if (this.hallway) {
            fields.notePaper.querySelector('[value="wall"]').remove();
            fields.kind.querySelector('[value="image"]').remove();
        }
        const textMode = () => !saved && this.options.wallTextEnabled && fields.kind.value === 'text';
        const noteControls = panel.querySelector('[data-note-controls]');
        const syncNoteControls = () => {
            if (this.hallway && !saved) fields.kind.value = 'text';
            const isText = textMode();
            fields.wall.closest('label').hidden = this.hallway;
            fields.wall.disabled = busy || this.hallway;
            panel.querySelectorAll('[data-create-kind]').forEach(element => element.hidden = this.hallway || Boolean(saved) || !this.options.wallTextEnabled);
            noteControls.hidden = !isText;
            panel.querySelector('[data-image-file]').hidden = isText;
            const paper = WALL_TEXT_BACKGROUNDS[fields.notePaper.value];
            const savedName = saved && this.images.get(String(id))?.userData.imageName;
            const savedKind = savedName && wallTextKind(savedName);
            const locked = Boolean(savedKind) || Boolean(isText && paper.width);
            fields.width.disabled = busy || locked;
            fields.width.closest('label').hidden = locked;
            panel.querySelectorAll('[data-upload-name]').forEach(element => element.hidden = Boolean(saved));
            if (isText && paper.width) fields.width.value = paper.width;
            for (const key of ['noteFontSize', 'notePaddingX', 'notePaddingY', 'noteLineHeight'])
                panel.querySelector(`[data-note-value="${key}"]`).textContent = fields[key].value + (key === 'noteFontSize' ? ' pt' : key.startsWith('notePadding') ? ' in' : ' ×');
        };

        const idle = [];
        const halfWidth = () => this.hallway && activeSegment != null
            ? worldToInches(this.segments[activeSegment].length) / 2 : (fields.wall.value === "north" || fields.wall.value === "south"
            ? this.options.width : this.options.length) * 6;
        const halfHeight = this.options.height * 6;
        // The form uses left-edge/floor measurements; rendering and storage keep center coordinates.
        const placement = () => ({
            wall: fields.wall.value, segment: this.hallway ? activeSegment : null, x: Number(fields.x.value) - halfWidth(),
            y: Number(fields.y.value) - halfHeight, width: Number(fields.width.value)
        });
        // Match the marker to the rendered preview, including its wall orientation and width.
        const updateMarker = () => {
            if (saved) return;
            const p = placement();
            const art = id && this.images.get(id);
            const pose = art ?? new THREE.Object3D();
            if (!art) {
                const bounds = this._wallBounds(this._anchor({ wall: p.wall, segment: p.segment }));
                placeOnWall(pose, p.wall, inchesToWorld(p.x) * wallRightSign(p.wall),
                    inchesToWorld(p.y), inchesToWorld(p.width) / 2, bounds);
            }
            this.app.wallClick.updateCrosshair(pose, art?.userData.artWidth ?? inchesToWorld(p.width));
        };
        const measurements = () => {
            for (const key of ["x", "y", "width"])
                panel.querySelector(`[data-value=${key}]`).textContent = `${Number(fields[key].value).toFixed(1)} in`;
        };
        const limits = () => {
            fields.x.min = fields.y.min = 0;
            fields.x.max = halfWidth() * (this.hallway ? 2 : 3);
            fields.y.max = halfHeight * (this.hallway ? 2 : 3);
            fields.width.max = halfWidth() * 3;
        };
        const fill = p => {
            if (this.hallway && p.segment != null) activeSegment = p.segment;
            fields.wall.value = p.wall;
            limits();
            const values = { x: p.x + halfWidth(), y: p.y + halfHeight, width: p.width };
            // Preserve older placements that exceed the normal slider range.
            for (const [key, value] of Object.entries(values)) {
                fields[key].min = Math.min(Number(fields[key].min), value);
                fields[key].max = Math.max(Number(fields[key].max), value);
                fields[key].value = Number(value.toFixed(2));
            }
            measurements();
            updateMarker();
        };
        // Disable controls during file loading or a save so two operations cannot overlap.
        const run = async (action, { preview = false } = {}) => {
            if (busy) return;
            busy = true;
            // Keep the textarea focused while PNG previews update, including on mobile.
            const locked = [...fields].filter(field => !preview || field.tagName === 'BUTTON');
            locked.forEach(field => field.disabled = true);
            status.textContent = "";
            try { await action(); }
            catch (error) { status.textContent = error.message; }
            finally {
                busy = false;
                [...fields].forEach(field => field.disabled = false);
                syncNoteControls();
                idle.splice(0).forEach(resolve => resolve());
            }
        };
        const discard = async () => {
            clearTimeout(noteTimer);
            if (id && this.images.has(id)) {
                if (saved) await this.moveImage(id, saved, { persist: false });
                else await this.deleteImage(id, { persist: false });
            }
            id = file = saved = null;
            fields.file.value = "";
            fields.uploadName.value = "";
        };
        // BEGIN WALL TEXT editor integration. Existing uploaded images keep the original path.
        const renderTextPreview = async () => {
            if (!textMode()) return;
            const rendered = await renderWallText({ background: fields.notePaper.value, text: fields.noteText.value,
                width: Number(fields.width.value), font: fields.noteFont.value, fontSize: Number(fields.noteFontSize.value),
                paddingX: Number(fields.notePaddingX.value), paddingY: Number(fields.notePaddingY.value), lineHeight: Number(fields.noteLineHeight.value), align: fields.noteAlign.value });
            // Reuse the actual rendered canvas; no second rendering can drift from the PNG.
            panel.querySelector('[data-note-preview]').replaceChildren(rendered.canvas);
            const previous = id, next = 'preview-' + newPlacementId();
            this.addImage({ ...placement(), width: rendered.width, id: next, file: rendered.file, name: rendered.file.name });
            await this.ready;
            id = next; file = rendered.file;
            if (previous && this.images.has(previous)) await this.deleteImage(previous, { persist: false });
            fields.width.value = rendered.width;
            filename.textContent = WALL_TEXT_BACKGROUNDS[fields.notePaper.value].label;
            panel.querySelector('[data-note-size]').textContent = `${rendered.width.toFixed(1)} × ${rendered.height.toFixed(1)} in`;
            fill(this.imagePlacement(id));
            status.textContent = rendered.clipped ? 'Text overflows the paper and will be clipped. Reduce font size, padding or line spacing to fit.' : 'Preview only. Save to upload this static PNG.';
        };
        const scheduleTextPreview = () => {
            clearTimeout(noteTimer);
            noteTimer = setTimeout(() => {
                if (!textMode()) return;
                if (busy) { scheduleTextPreview(); return; }
                run(renderTextPreview, { preview: true });
            }, 220);
        };
        fields.kind.onchange = () => run(async () => {
            await discard();
            syncNoteControls();
            filename.textContent = '';
            if (textMode()) await renderTextPreview();
            else { fields.width.value = this.options.artWidth; measurements(); updateMarker(); }
        });
        fields.notePaper.onchange = () => run(async () => {
            clearTimeout(noteTimer);
            if (fields.notePaper.value === 'wall') {
                fields.width.value = 24; fields.noteFontSize.value = 48;
            } else fields.noteFontSize.value = 12;
            syncNoteControls();
            await renderTextPreview();
        });
        // END WALL TEXT editor integration.
        this.closeWallEditor = async () => {
            if (busy) await new Promise(resolve => idle.push(resolve));
            await discard();
            panel.close();
            this.app.wallClick.hideCrosshair();
        };
        const close = () => this.closeWallEditor();
        fields.close.onclick = close;
        fields.remove.onclick = () => run(async () => {
            if (!saved || !id) return;
            await this.deleteImage(id);
            id = file = saved = null;
            panel.close();
        });
        panel.addEventListener("cancel", event => { event.preventDefault(); close(); });
        fields.file.onchange = () => run(async () => {
            const next = fields.file.files[0];
            if (!next) return;
            await discard();
            file = next;
            fields.uploadName.placeholder = file.name.replace(/\.[^.]+$/, '');
            filename.textContent = file.name;
            id = "preview-" + newPlacementId();
            this.addImage({ ...placement(), id, file, name: file.name });
            try { await this.ready; }
            catch (error) { id = file = null; throw error; }
            fill(this.imagePlacement(id));
            status.textContent = "preview only. save image to upload it.";
        });
        // Moving the preview updates the mesh only; no request is sent until Save.
        form.addEventListener("input", event => {
            if (event.target === fields.kind || event.target === fields.notePaper || event.target === fields.uploadName) return;
            if (textMode() && (event.target.name.startsWith('note') || event.target === fields.width)) {
                syncNoteControls(); measurements(); scheduleTextPreview(); return;
            }
            if (event.target === fields.wall) limits();
            measurements();
            if (busy || event.target === fields.file || !form.checkValidity()) return;
            if (!id) { updateMarker(); return; }
            this.moveImage(id, placement(), { persist: false }).then(updateMarker)
                .catch(error => status.textContent = error.message.toLowerCase());
        });
        const save = () => run(async () => {
            clearTimeout(noteTimer);
            if (textMode()) {
                if (!fields.noteText.value.trim()) throw new Error('Enter some text before saving.');
                await renderTextPreview();
            }
            if (!id) { panel.close(); return; }
            const storage = this.options.persistence;
            if (!storage?.upload || !storage?.move) throw new Error("no image storage is configured.");
            await this.moveImage(id, placement(), { persist: false });
            if (file) {
                if (!textMode() && fields.uploadName.value.trim()) {
                    const extension = file.name.includes('.') ? file.name.split('.').pop() : 'png';
                    file = new File([file], fields.uploadName.value.trim() + '.' + extension, { type: file.type });
                }
                const result = await storage.upload(this.imagePlacement(id), file);
                // Keep the existing preview mesh, replacing only its temporary identity.
                const art = this.images.get(id);
                this.images.delete(id);
                id = String(result.id);
                art.userData.roomImageId = id;
                art.userData.imageName = result.filename ?? file.name;
                if (art.userData.imageFile?.startsWith("blob:")) URL.revokeObjectURL(art.userData.imageFile);
                art.userData.imageFile = result.url;
                this.images.set(id, art);
                layerWallImages(this.images.values());
                file = null;
                fields.file.value = "";
            } else {
                await this.moveImage(id);
            }
            saved = this.imagePlacement(id);
            this.selectImage(id);
            fill(saved);
            id = file = saved = null;
            panel.close();
        });
        form.onsubmit = event => { event.preventDefault(); save(); };
        const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
        const pick = event => {
            const rect = this.app.canvas.getBoundingClientRect();
            pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
                -(event.clientY - rect.top) / rect.height * 2 + 1);
            ray.setFromCamera(pointer, this.app.camera);
            // Only an exposed wall opens the panel; doors, artwork and props stay interactive.
            const hit = ray.intersectObjects(this.app.scene.children, true).find(hit => {
                for (let object = hit.object; object; object = object.parent)
                    if (!object.visible) return false;
                return hit.object.isMesh;
            });
            if (this.hallway && hit?.object.userData.isDoor)
                return ray.intersectObjects(this.app.wallClick.walls, false)[0];
            return hit;
        };
        const blocked = () => busy || this._doorTravelPending;
        const openWallEditor = async event => {
            if (blocked()) return;
            const hit = pick(event);
            if (!hit || !this.app.wallClick.walls.includes(hit.object)) return;
            const wall = hit.object.userData.wall;
            if (!CARDINAL_WALLS.includes(wall)) return;
            await this._closeModals();
            activeSegment = this.hallway ? hit.object.userData.segment : null;
            const edge = this.hallway ? this.segments[activeSegment] : null;
            fill({
                segment: activeSegment,
                wall, x: worldToInches(wall === "north" || wall === "south" ? hit.point.x - (edge?.x ?? 0) : hit.point.z - (edge?.z ?? 0)) * wallRightSign(wall),
                y: worldToInches(hit.point.y), width: this.options.artWidth
            });
            fields.kind.value = this.hallway ? 'text' : 'image';
            syncNoteControls();
            filename.textContent = "";
            fields.file.hidden = false;
            fields.remove.hidden = true;
            status.textContent = "";
            updateMarker();
            panel.show();
            if (textMode()) await run(renderTextPreview);
        };
        let lastTouch = -Infinity, touchStart = null, previousTap = null;
        this.app.canvas.addEventListener("dblclick", event => {
            // Ignore a browser-generated double-click following our touch handling.
            if (performance.now() - lastTouch > 700) openWallEditor(event);
        });
        // Mobile browsers need explicit double-tap recognition; drags and holds do not count.
        this.app.canvas.addEventListener("pointerdown", event => {
            if (event.pointerType !== "touch") return;
            lastTouch = performance.now();
            if (!event.isPrimary) { touchStart = previousTap = null; return; }
            touchStart = { id: event.pointerId, x: event.clientX, y: event.clientY, time: lastTouch };
        });
        this.app.canvas.addEventListener("pointermove", event => {
            if (touchStart && event.pointerId === touchStart.id
                && Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > 10)
                touchStart = previousTap = null;
        });
        this.app.canvas.addEventListener("pointerup", event => {
            if (event.pointerType !== "touch") return;
            const start = touchStart;
            touchStart = null;
            lastTouch = performance.now();
            if (!start || start.id !== event.pointerId || lastTouch - start.time > 300) {
                previousTap = null;
                return;
            }
            const hit = pick(event);
            if (!hit || !this.app.wallClick.walls.includes(hit.object)) { previousTap = null; return; }
            if (previousTap && lastTouch - previousTap.time <= 400
                && previousTap.wall === hit.object
                && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= 30) {
                previousTap = null;
                openWallEditor(event);
            } else {
                previousTap = { time: lastTouch, x: event.clientX, y: event.clientY, wall: hit.object };
            }
        });
        this.app.canvas.addEventListener("pointercancel", () => { touchStart = previousTap = null; });
        // Hold empty walls to add artwork, or existing artwork to edit; dragging cancels either hold.
        let hold = null, origin = null;
        const cancelHold = () => { clearTimeout(hold); hold = origin = null; };
        this.app.canvas.addEventListener("pointerdown", event => {
            cancelHold();
            this._heldArtwork = null;
            if (event.button !== 0 || event.isPrimary === false || blocked()) return;
            const hit = pick(event), art = hit?.object;
            const emptyWall = art && this.app.wallClick.walls.includes(art);
            const imageId = art?.userData.roomImageId;
            if (!emptyWall && (!art?.userData.editable || !this.images.has(String(imageId)))) return;
            origin = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
            // Keep the original press location even if the browser later releases pointer capture.
            const point = { clientX: event.clientX, clientY: event.clientY };
            hold = setTimeout(async () => {
                if (blocked()) return;
                if (!emptyWall && !this.images.has(String(imageId))) return;
                // Consume the entire hold gesture, even if release hits overlapping artwork.
                this.app.orbit.suppressClick();
                if (emptyWall) {
                    previousTap = touchStart = null;
                    await openWallEditor(point);
                    return;
                }
                if (!this.images.has(String(imageId))) return;
                this._heldArtwork = imageId;
                await this._closeModals();
                if (!this.images.has(String(imageId))) return;
                id = String(imageId);
                saved = this.imagePlacement(id);
                file = null;
                fields.kind.value = 'image';
                syncNoteControls();
                fill(saved);
                filename.textContent = wallTextKind(art.userData.imageName) ? "" : art.userData.imageName ?? "";
                fields.file.hidden = true;
                fields.remove.hidden = false;
                status.textContent = "";
                this.selectImage(id);
                this.app.wallClick.hideCrosshair();
                panel.show();
            }, 1650);
        });
        this.app.canvas.addEventListener("pointermove", event => {
            if (origin && (event.pointerId !== origin.pointerId || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 4))
                cancelHold();
        });
        for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
            this.app.canvas.addEventListener(event, cancelHold);
        window.addEventListener("blur", cancelHold);
        return this;
    }

    _refreshEditor() {
        if (!this.editor)
            return;
        const art = this.images.get(this.selectedImage);
        if (art) {
            const p = this.imagePlacement(this.selectedImage);
            for (const field of ["wall", "x", "y", "width"])
                this.editorFields[field].value = typeof p[field] === "number" ? Number(p[field].toFixed(2)) : p[field];
        }
        for (const action of ["move", "delete"])
            this.editor.querySelector(`[data-action=${action}]`).disabled = !art?.userData.editable;
        this.editorFields.width.disabled = Boolean(art && wallTextKind(art.userData.imageName));
        this.editor.querySelector('[data-action=upload]').disabled = false;
        this.editor.querySelector('[data-action=clear]').disabled = false;
    }
}

export class Gallery extends Room {
    constructor(options = {}) { super(options, false); }
}

export class Hallway extends Room {
    constructor(options = {}) { super(options, true); }
}

export const referenceHallwayVariant = (doors) => {
    const active = CARDINAL_WALLS.filter(wall => doors[wall]);
    const kind = active.length === 4 ? "cross" : active.length === 3 ? "tee"
        : active.some(wall => active.includes(CARDINAL_WALLS[(CARDINAL_WALLS.indexOf(wall) + 2) % 4])) ? "straight" : "corner";
    const canonical = {
        cross: ["north", "east", "south", "west"], tee: ["north", "east", "west"],
        corner: ["north", "east"], straight: ["east", "west"]
    }[kind];
    for (let turns = 0; turns < 4; turns++) {
        const rotated = canonical.map(wall => CARDINAL_WALLS[(CARDINAL_WALLS.indexOf(wall) + turns) % 4]);
        if (rotated.length === active.length && rotated.every(wall => active.includes(wall)))
            return { kind, turns };
    }
    throw new Error("A reference hallway needs two to four doors.");
};

const addReferenceHallwayContents = (room) => {
    const { kind, turns } = referenceHallwayVariant(room.doors);
    const group = new THREE.Group();
    const contents = new THREE.Group();
    group.name = "poc-hallway-furnishings";
    contents.rotation.y = -turns * Math.PI / 2;
    group.scale.set(feetToWorld(room.options.width) / 11, room.layout.height / 3.75, feetToWorld(room.options.length) / 11);
    group.add(contents);
    room.app.scene.add(group);
    const context = {
        scene: contents, textureLoader: room.app.textureLoader,
        roomHalfY: 3.75 / 2, roomLights: room.app.roomLights
    };
    const furnish = room.options.defaultFurnishings;
    const ignore = () => { };
    const fixturePositions = [];
    const addFixture = createAddLightFixture(context);
    const builders = {
        addElectricalBox: furnish ? createAddElectricalBox(context) : ignore,
        addFoldingChairs: furnish ? createAddFoldingChairs(context) : ignore,
        addBoxStack: furnish ? createAddBoxStack(context) : ignore,
        addLightSwitch: furnish ? createAddLightSwitch({ ...context, doorHeight: 3.2, clickable: room.app.clickable, defaultDisabled: false }) : ignore,
        addLightFixture: room.options.defaultFixtures ? (x, z, ...args) => {
            fixturePositions.push({ x, z });
            return addFixture(x, z, ...args);
        } : ignore,
    };
    const addVents = walls => furnish ? createAddVent({ ...context, walls }) : ignore;
    const recipes = { cross: referenceCrossContents, tee: referenceTeeContents, corner: referenceCornerContents, straight: referenceStraightContents };
    recipes[kind]({ ...builders, addVents });
    // Spread at most four shadow-free lights among the existing fixture locations.
    const selected = [];
    while (fixturePositions.length && selected.length < 4) {
        let best = 0, farthest = -1;
        fixturePositions.forEach((p, index) => {
            const distance = selected.length ? Math.min(...selected.map(q => (p.x - q.x) ** 2 + (p.z - q.z) ** 2)) : 0;
            if (distance > farthest) { farthest = distance; best = index; }
        });
        selected.push(fixturePositions.splice(best, 1)[0]);
    }
    for (const { x, z } of selected) {
        const light = new THREE.PointLight(room.options.hallwayLightColor,
            room.options.hallwayLightBoost * 0.5, room.options.hallwayLightRange, 2);
        light.position.set(x, context.roomHalfY - 0.15, z);
        light.castShadow = false;
        contents.add(light);
        room.app.roomLights.registerLight(light);
    }
    if (furnish) {
        const door = room.doors[room.options.exitWall ?? "north"];
        if (door?.mesh)
            room._addRoomExitSign(door.mesh);
    }
};

const referenceCrossContents = ({ addElectricalBox, addFoldingChairs, addBoxStack, addLightSwitch, addLightFixture, addVents }) => {
    const hw = 1.75, hl = 5.5, ARM_SIDE = 3.75, CROSS_SPAN = 11, WALL_INSET = 0.05;
    const ELECTRICAL_IMG = roomAsset("images/static_images/electrical.jpg");
    const addVent = addVents({
        west: { x: -(hw - WALL_INSET), leftZ: hw, rightZ: hl },
        east: { x: hw - WALL_INSET, leftZ: -hw, rightZ: -hl },
        north: { z: -(hw - WALL_INSET), leftX: hw, rightX: hl },
        south: { z: hw - WALL_INSET, leftX: -hw, rightX: -hl },
    });
    addElectricalBox("east", hw - WALL_INSET, (hw + hl) * 0.55, ELECTRICAL_IMG);
    {
        const sw = 0.58;
        addLightSwitch("north", 0.9, -(hl - WALL_INSET));
        {
            const wx = -(hw - WALL_INSET);
            const z0 = hw + 1.05;
            addLightSwitch("west", wx, z0);
            addLightSwitch("west", wx, z0 + sw);
        }
    }
    {
        const cx = -(hw - WALL_INSET);
        const cz = -(hw + hl) * 0.5;
        const gap = 0.85;
        addFoldingChairs(cx, cz - gap, "west", 3);
        addFoldingChairs(cx, cz, "west", 2);
        addFoldingChairs(cx, cz + gap, "west", 1);
    }
    {
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("west", x);
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("east", x);
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("north", x);
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("south", x);
    }
    {
        for (const t of lightPositionsAlong(ARM_SIDE, 1)) {
            addLightFixture(0, hw + t, Math.PI / 2);
            addLightFixture(0, -hw - t, Math.PI / 2);
            addLightFixture(hw + t, 0, 0);
            addLightFixture(-hw - t, 0, 0);
        }
    }
    {
        const z = hw - WALL_INSET;
        const base = hw + 1.05;
        addBoxStack(base, z, "south", 3);
        addBoxStack(base + 1.2, z, "south", 2);
        addBoxStack(base + 1.2 + 1.45, z, "south", 3);
        addBoxStack(-(hw + 1.6), -(hw - WALL_INSET), "north", 2);
    }
};

const referenceTeeContents = ({ addElectricalBox, addFoldingChairs, addBoxStack, addLightSwitch, addLightFixture, addVents }) => {
    const hw = 1.75, hl = 5.5, ARM_SIDE = 3.75, CROSS_SPAN = 11, WALL_INSET = 0.05;
    const ELECTRICAL_IMG = roomAsset("images/static_images/electrical.jpg");
    const addVent = addVents({
        south: { z: hw - WALL_INSET, leftX: hl, rightX: -hl },
        west: { x: -(hw - WALL_INSET), leftZ: -hl, rightZ: -hw },
    });
    addElectricalBox("east", hw - WALL_INSET, -(hw + hl) * 0.55, ELECTRICAL_IMG);
    {
        const sw = 0.58;
        addLightSwitch("north", 0.9, -(hl - WALL_INSET));
        {
            const z = -(hw - WALL_INSET);
            const x0 = hw + 1.2;
            addLightSwitch("north", x0, z);
            addLightSwitch("north", x0 + sw, z);
        }
    }
    {
        const cx = -(hw - WALL_INSET);
        const cz = -(hw + hl) * 0.45;
        const gap = 0.85;
        addFoldingChairs(cx, cz - gap, "west", 2);
        addFoldingChairs(cx, cz, "west", 3);
    }
    {
        for (const x of ventPositionsAlongWall(CROSS_SPAN, 3))
            addVent("south", x);
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("west", x);
    }
    {
        for (const t of lightPositionsAlong(CROSS_SPAN, 3)) {
            addLightFixture(-hl + t, 0, 0);
        }
        for (const t of lightPositionsAlong(ARM_SIDE, 1)) {
            addLightFixture(0, -hw - t, Math.PI / 2);
        }
    }
    {
        const z = hw - WALL_INSET;
        addBoxStack(2.2, z, "south", 2);
        addBoxStack(2.2 + 1.25, z, "south", 3);
        addBoxStack(2.2 + 1.25 + 1.1, z, "south", 2);
        addBoxStack(-3.55, z, "south", 3);
    }
};

const referenceCornerContents = ({ addElectricalBox, addFoldingChairs, addBoxStack, addLightSwitch, addLightFixture, addVents }) => {
    const hw = 1.75, hl = 5.5, ARM_SIDE = 3.75, CROSS_SPAN = 11, WALL_INSET = 0.05;
    const ELECTRICAL_IMG = roomAsset("images/static_images/electrical.jpg");
    const addVent = addVents({
        south: { z: hw - WALL_INSET, leftX: hl, rightX: -hw },
        north: { z: -(hw - WALL_INSET), leftX: hw, rightX: hl },
        east: { x: hw - WALL_INSET, leftZ: -hw, rightZ: -hl },
    });
    addElectricalBox("west", -(hw - WALL_INSET), -(hw + hl) * 0.55, ELECTRICAL_IMG);
    {
        const sw = 0.58;
        addLightSwitch("east", hl - WALL_INSET, -0.9);
        {
            const z = hw - WALL_INSET;
            const x0 = -0.2;
            addLightSwitch("south", x0, z);
            addLightSwitch("south", x0 + sw, z);
        }
    }
    {
        const cx = hw - WALL_INSET;
        const cz = -(hw + hl) * 0.45;
        const gap = 0.85;
        addFoldingChairs(cx, cz - gap, "east", 1);
        addFoldingChairs(cx, cz, "east", 2);
    }
    {
        const longLen = hl + hw;
        for (const x of ventPositionsAlongWall(longLen, 2))
            addVent("south", x);
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("north", x);
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("east", x);
    }
    {
        for (const t of lightPositionsAlong(hl + hw, 2)) {
            addLightFixture(0, -hl + t, Math.PI / 2);
        }
        for (const t of lightPositionsAlong(ARM_SIDE, 1)) {
            addLightFixture(hw + t, 0, 0);
        }
    }
    {
        const z = -(hw - WALL_INSET);
        addBoxStack(hw + 1.15, z, "north", 3);
        addBoxStack(hw + 1.15 + 1.35, z, "north", 2);
        addBoxStack(hl - 2.1, hw - WALL_INSET, "south", 2);
        addBoxStack(hl - 2.1 + 1.15, hw - WALL_INSET, "south", 3);
    }
};

const referenceStraightContents = ({ addElectricalBox, addFoldingChairs, addBoxStack, addLightSwitch, addLightFixture, addVents }) => {
    const hw = 1.75, hl = 5.5, ARM_SIDE = 3.75, CROSS_SPAN = 11, WALL_INSET = 0.05;
    const ELECTRICAL_IMG = roomAsset("images/static_images/electrical.jpg");
    const addVent = addVents({
        north: { z: -(hw - WALL_INSET), leftX: -hl, rightX: hl },
        south: { z: hw - WALL_INSET, leftX: hl, rightX: -hl },
        west: { x: -(hl - WALL_INSET), leftZ: -hw, rightZ: hw },
        east: { x: hl - WALL_INSET, leftZ: hw, rightZ: -hw },
    });
    addElectricalBox("north", -2.8, -(hw - WALL_INSET), ELECTRICAL_IMG);
    {
        const sw = 0.58;
        addLightSwitch("west", -(hl - WALL_INSET), 0.55);
        {
            const z = -(hw - WALL_INSET);
            const x0 = -4.6;
            addLightSwitch("north", x0, z);
            addLightSwitch("north", x0 + sw, z);
        }
        addLightSwitch("south", -1.4, hw - WALL_INSET);
    }
    {
        const cx = 2.5;
        const cz = hw - WALL_INSET;
        const gap = 0.85;
        addFoldingChairs(cx - gap, cz, "south", 1);
        addFoldingChairs(cx, cz, "south", 2);
        addFoldingChairs(cx + gap, cz, "south", 3);
    }
    {
        for (const x of ventPositionsAlongWall(CROSS_SPAN, 3))
            addVent("south", x);
    }
    {
        for (const t of lightPositionsAlong(CROSS_SPAN, 3)) {
            addLightFixture(-hl + t, 0, 0);
        }
    }
    {
        addBoxStack(1.6, -(hw - WALL_INSET), "north", 2);
        addBoxStack(1.6 + 1.3, -(hw - WALL_INSET), "north", 3);
        addBoxStack(1.6 + 1.3 + 1.15, -(hw - WALL_INSET), "north", 2);
        addBoxStack(-3.9, hw - WALL_INSET, "south", 3);
        addBoxStack(-3.9 + 1.4, hw - WALL_INSET, "south", 2);
    }
};

export const bindRoomKeyboard = ({ room, target = document, windowTarget = window, turnSpeed = 90, facingTolerance = 45 } = {}) => {
    const held = new Set();
    const arrowKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp"]);
    const blocked = () => room.app.lightbox?.isOpen() || room.app.videoLightbox?.isOpen()
        || target.activeElement?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])");
    const keydown = event => {
        if (!arrowKeys.has(event.key) || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || blocked())
            return;
        event.preventDefault();
        if (event.key !== "ArrowUp") {
            held.add(event.key);
            return;
        }
        if (event.repeat || room._doorTravelPending)
            return;
        const angle = room.app.orbit.getAngle();
        const forwardX = -Math.sin(angle), forwardZ = -Math.cos(angle);
        const camera = room.app.camera.position;
        let best = null, bestAlignment = Math.cos(facingTolerance * Math.PI / 180);
        for (const spec of Object.values(room.doors)) {
            if (!spec.mesh)
                continue;
            const dx = spec.mesh.position.x - camera.x, dz = spec.mesh.position.z - camera.z;
            const distance = Math.hypot(dx, dz);
            if (!distance)
                continue;
            const alignment = (dx * forwardX + dz * forwardZ) / distance;
            if (alignment > bestAlignment) {
                best = spec.mesh;
                bestAlignment = alignment;
            }
        }
        if (best)
            room._hit(best);
    };
    const keyup = event => held.delete(event.key);
    const clear = () => held.clear();
    target.addEventListener("keydown", keydown);
    target.addEventListener("keyup", keyup);
    windowTarget.addEventListener("blur", clear);
    return {
        update(delta) {
            if (blocked()) {
                clear();
                return false;
            }
            if (!held.size)
                return false;
            const direction = Number(held.has("ArrowLeft")) - Number(held.has("ArrowRight"));
            const rotation = direction * turnSpeed * Math.PI / 180 * delta;
            room.app.orbit.setAngle(room.app.orbit.getAngle() + rotation);
            room._onUserRotate(rotation);
            return true;
        },

        dispose() {
            clear();
            target.removeEventListener("keydown", keydown);
            target.removeEventListener("keyup", keyup);
            windowTarget.removeEventListener("blur", clear);
        },
    };
};

export const createGalleryLightStartup = ({ lights, schedule = setTimeout, unschedule = clearTimeout } = {}) => {
    const pulses = [[700, true], [25, false], [40, true], [30, false], [45, true], [20, false], [40, true]];
    let timer = null;
    let requestedOn = lights.isOn();
    let generation = 0;
    return {
        isRequestedOn() { return requestedOn; },

        setOn(on) {
            requestedOn = !!on;
            generation++;
            if (timer !== null)
                unschedule(timer);
            timer = null;
            lights.setOn(false);
            if (!requestedOn)
                return;
            const current = generation;
            const advance = index => {
                const [delay, lit] = pulses[index];
                timer = schedule(() => {
                    if (generation !== current || !requestedOn)
                        return;
                    timer = null;
                    lights.setOn(lit);
                    if (index + 1 < pulses.length)
                        advance(index + 1);
                }, delay);
            };
            advance(0);
        },
    };
};

const SOUND_PREF_KEY = "y9k-sound-on";

const readUnmuted = (soundPrefKey) => {
    try {
        const v = localStorage.getItem(soundPrefKey);
        return v === "1" || v === "true";
    }
    catch {
        return false;
    }
};

export const createCheckAndActivateAudio = ({ ensureMusicAudio, afterActivate = null, soundPrefKey = SOUND_PREF_KEY, }) => {
    return async () => {
        if (!readUnmuted(soundPrefKey))
            return;
        const a = ensureMusicAudio();
        if (a.paused) {
            try {
                await a.play();
            }
            catch (_) {
            }
        }
        if (typeof afterActivate === "function") {
            try {
                await afterActivate();
            }
            catch (_) { }
        }
    };
};

export const runOnFirstPointerDown = (fn) => {
    const handler = () => {
        window.removeEventListener("pointerdown", handler, true);
        fn();
    };
    window.addEventListener("pointerdown", handler, true);
};

const DEV_PREF_KEY = "y9k-dev-mode";

const readDevPref = () => {
    try {
        const v = localStorage.getItem(DEV_PREF_KEY);
        if (v === null)
            return false;
        return v === "1" || v === "true";
    }
    catch {
        return false;
    }
};

const writeDevPref = (on) => {
    try {
        localStorage.setItem(DEV_PREF_KEY, on ? "1" : "0");
    }
    catch (_) { }
};

let IS_DEV_MODE = readDevPref();

export const isDevMode = () => IS_DEV_MODE;

export const initDevMode = ({ stage, onChange } = {}) => {
    const host = stage || document.getElementById("stage");
    if (!host) {
        console.warn("initDevMode: #stage not found");
        return { button: null, isDevMode, setDevMode: () => { } };
    }
    let button = document.getElementById("dev-toggle");
    if (!button) {
        button = document.createElement("button");
        button.id = "dev-toggle";
        button.type = "button";
        button.textContent = "⚙️";
        host.appendChild(button);
    }
    const apply = (on) => {
        IS_DEV_MODE = on;
        document.body.classList.toggle("is-dev-mode", on);
        button.classList.toggle("is-on", on);
        button.title = on ? "exit developer mode" : "enter developer mode";
        button.setAttribute("aria-label", on ? "exit developer mode" : "enter developer mode");
        writeDevPref(on);
        if (typeof onChange === "function")
            onChange();
    };
    const setDevMode = (on) => apply(!!on);
    button.addEventListener("click", (e) => {
        e.stopPropagation();
        setDevMode(!IS_DEV_MODE);
    });
    apply(IS_DEV_MODE);
    return { button, isDevMode, setDevMode };
};

export const setupLightbox = ({ root = document.getElementById("lightbox"), sfxPath = roomAsset("music/page-3.mp3"), sfxVolume = 0.5, } = {}) => {
    if (!root)
        throw new Error("setupLightbox: #lightbox not found");
    let IS_SOUND_ON = false;
    const img = root.querySelector("img");
    const caption = root.querySelector("#lightbox-caption");
    const stage = root.querySelector(".lightbox-stage");
    if (!img || !caption || !stage) {
        throw new Error("setupLightbox: expected img, #lightbox-caption, .lightbox-stage");
    }
    let sfxGain = Math.max(0, Math.min(1, sfxVolume));
    let audioCtx = null;
    let sfxBuffer = null;
    const ensureAudioCtx = () => {
        if (!audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx)
                return null;
            audioCtx = new Ctx();
        }
        if (audioCtx.state === "suspended") {
            audioCtx.resume().catch(() => { });
        }
        return audioCtx;
    };
    (async () => {
        try {
            const res = await fetch(sfxPath);
            const data = await res.arrayBuffer();
            const ctx = ensureAudioCtx();
            if (!ctx)
                return;
            sfxBuffer = await ctx.decodeAudioData(data.slice(0));
        }
        catch (_) { }
    })();
    const playOpenSfx = () => {
        const ctx = ensureAudioCtx();
        if (!ctx || !sfxBuffer)
            return;
        const start = () => {
            try {
                const src = ctx.createBufferSource();
                const gain = ctx.createGain();
                src.buffer = sfxBuffer;
                gain.gain.value = sfxGain;
                src.connect(gain);
                gain.connect(ctx.destination);
                src.start(0);
            }
            catch (_) { }
        };
        if (ctx.state === "running")
            start();
        else
            ctx.resume().then(start).catch(() => { });
    };
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let fitW = 0;
    let fitH = 0;
    let maxScale = 1;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let panning = false;
    let panLastX = 0;
    let panLastY = 0;
    let didPan = false;
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    const touchDist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const measureFit = () => {
        stage.style.transform = "";
        const r = img.getBoundingClientRect();
        fitW = Math.max(1, r.width);
        fitH = Math.max(1, r.height);
        const nw = img.naturalWidth || fitW;
        maxScale = Math.max(1, nw / fitW);
    };
    const clampPan = () => {
        const vw = root.clientWidth;
        const vh = root.clientHeight;
        const scaledW = fitW * scale;
        const scaledH = fitH * scale;
        const maxX = Math.max(scaledW * 0.45, Math.abs(scaledW - vw) / 2);
        const maxY = Math.max(scaledH * 0.45, Math.abs(scaledH - vh) / 2);
        panX = Math.max(-maxX, Math.min(maxX, panX));
        panY = Math.max(-maxY, Math.min(maxY, panY));
    };
    const apply = () => {
        scale = Math.max(1, Math.min(maxScale, scale));
        if (scale <= 1.001) {
            scale = 1;
            panX = 0;
            panY = 0;
            root.classList.remove("is-zoomed");
            stage.style.transform = "";
            stage.classList.remove("is-panning");
            return;
        }
        clampPan();
        root.classList.add("is-zoomed");
        stage.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
    };
    const onPanMove = e => {
        if (!panning)
            return;
        e.preventDefault();
        const dx = e.clientX - panLastX;
        const dy = e.clientY - panLastY;
        if (Math.hypot(dx, dy) > 2)
            didPan = true;
        panLastX = e.clientX;
        panLastY = e.clientY;
        panX += dx;
        panY += dy;
        apply();
    };
    const onPanEnd = e => {
        if (!panning)
            return;
        panning = false;
        stage.classList.remove("is-panning");
        window.removeEventListener("pointermove", onPanMove);
        window.removeEventListener("pointerup", onPanEnd);
        window.removeEventListener("pointercancel", onPanEnd);
        try {
            stage.releasePointerCapture(e.pointerId);
        }
        catch (_) { }
    };
    const resetZoom = () => {
        scale = 1;
        panX = 0;
        panY = 0;
        pinchStartDist = 0;
        pinchStartScale = 1;
        panning = false;
        didPan = false;
        lastTapTime = 0;
        root.classList.remove("is-zoomed");
        stage.classList.remove("is-panning");
        stage.style.transform = "";
        window.removeEventListener("pointermove", onPanMove);
        window.removeEventListener("pointerup", onPanEnd);
        window.removeEventListener("pointercancel", onPanEnd);
    };
    const toggleExtreme = () => {
        if (!fitW)
            measureFit();
        if (scale > 1.05) {
            scale = 1;
            panX = 0;
            panY = 0;
        }
        else {
            scale = maxScale;
            panX = 0;
            panY = 0;
        }
        apply();
    };
    const startPan = e => {
        if (scale <= 1)
            return;
        if (e.pointerType === "mouse" && e.button !== 0)
            return;
        if (e.target === caption || e.target.closest("#lightbox-caption"))
            return;
        e.preventDefault();
        e.stopPropagation();
        panning = true;
        didPan = false;
        panLastX = e.clientX;
        panLastY = e.clientY;
        stage.classList.add("is-panning");
        window.addEventListener("pointermove", onPanMove, { passive: false });
        window.addEventListener("pointerup", onPanEnd);
        window.addEventListener("pointercancel", onPanEnd);
        try {
            stage.setPointerCapture(e.pointerId);
        }
        catch (_) { }
    };
    const open = (imageFile, isSoundOn = false, displayName = null, opts = {}) => {
        resetZoom();
        IS_SOUND_ON = isSoundOn;
        currentSource = opts.source || null;
        img.onload = () => {
            requestAnimationFrame(() => {
                measureFit();
                scale = 1;
                apply();
            });
        };
        img.src = imageFile;
        caption.href = imageFile.startsWith("blob:") ? "#" : imageFile;
        const label = displayName ||
            (imageFile.startsWith("blob:")
                ? "uploaded image"
                : imageFile.split("/").pop());
        caption.textContent = wallTextKind(displayName) ? '' : label;
        caption.hidden = Boolean(wallTextKind(displayName));
        root.classList.add("is-open");
        root.setAttribute("aria-hidden", "false");
        syncDeleteButton();
        if (isSoundOn) {
            playOpenSfx();
        }
    };
    const close = (_isSoundOn = false) => {
        if (!isOpen())
            return;
        root.classList.remove("is-open");
        root.setAttribute("aria-hidden", "true");
        img.onload = null;
        img.removeAttribute("src");
        caption.removeAttribute("href");
        caption.textContent = "";
        currentSource = null;
        syncDeleteButton();
        resetZoom();
    };
    const isOpen = () => {
        return root.classList.contains("is-open");
    };
    const remeasure = () => {
        if (!isOpen())
            return;
        const prevScale = scale;
        const prevPanX = panX;
        const prevPanY = panY;
        measureFit();
        scale = prevScale;
        panX = prevPanX;
        panY = prevPanY;
        apply();
    };
    root.addEventListener("click", () => {
        if (didPan) {
            didPan = false;
            return;
        }
        close(IS_SOUND_ON);
    });
    caption.addEventListener("click", e => e.stopPropagation());
    stage.addEventListener("click", e => e.stopPropagation());
    stage.addEventListener("dblclick", e => {
        e.preventDefault();
        e.stopPropagation();
        toggleExtreme();
    });
    root.addEventListener("wheel", e => {
        if (!isOpen())
            return;
        if (!fitW)
            measureFit();
        e.preventDefault();
        e.stopPropagation();
        const factor = Math.exp(-e.deltaY * 0.0025);
        scale *= factor;
        if (scale > 1) {
            panX *= factor;
            panY *= factor;
        }
        apply();
    }, { passive: false });
    stage.addEventListener("pointerdown", startPan);
    img.addEventListener("pointerdown", startPan);
    root.addEventListener("touchstart", e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            if (!fitW)
                measureFit();
            pinchStartDist = touchDist(e.touches[0], e.touches[1]);
            pinchStartScale = scale;
            panning = false;
        }
        else if (e.touches.length === 1 && scale > 1) {
            e.preventDefault();
            panning = true;
            didPan = false;
            panLastX = e.touches[0].clientX;
            panLastY = e.touches[0].clientY;
        }
    }, { passive: false });
    root.addEventListener("touchmove", e => {
        if (e.touches.length === 2 && pinchStartDist > 0) {
            e.preventDefault();
            const next = pinchStartScale * (touchDist(e.touches[0], e.touches[1]) / pinchStartDist);
            const factor = next / Math.max(0.001, scale);
            scale = next;
            if (scale > 1) {
                panX *= factor;
                panY *= factor;
            }
            apply();
        }
        else if (e.touches.length === 1 && panning && scale > 1) {
            e.preventDefault();
            const t = e.touches[0];
            const dx = t.clientX - panLastX;
            const dy = t.clientY - panLastY;
            if (Math.hypot(dx, dy) > 2)
                didPan = true;
            panLastX = t.clientX;
            panLastY = t.clientY;
            panX += dx;
            panY += dy;
            apply();
        }
    }, { passive: false });
    root.addEventListener("touchend", e => {
        if (e.touches.length < 2)
            pinchStartDist = 0;
        if (e.touches.length === 0) {
            const wasPanning = panning && didPan;
            panning = false;
            stage.classList.remove("is-panning");
            if (!wasPanning && !didPan && e.changedTouches.length === 1) {
                const t = e.changedTouches[0];
                const now = performance.now();
                const dt = now - lastTapTime;
                const dist = Math.hypot(t.clientX - lastTapX, t.clientY - lastTapY);
                if (dt < 320 && dist < 28) {
                    e.preventDefault();
                    toggleExtreme();
                    lastTapTime = 0;
                }
                else {
                    lastTapTime = now;
                    lastTapX = t.clientX;
                    lastTapY = t.clientY;
                }
            }
        }
    }, { passive: false });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape")
            close();
    });
    let currentSource = null;
    let userArtDeleteHandler = null;
    let deleteBtn = document.getElementById("lightbox-delete");
    if (!deleteBtn) {
        deleteBtn = document.createElement("button");
        deleteBtn.id = "lightbox-delete";
        deleteBtn.type = "button";
        deleteBtn.textContent = "delete image";
        deleteBtn.hidden = true;
        const frame = root.querySelector(".lightbox-frame") || root;
        frame.appendChild(deleteBtn);
    }
    const syncDeleteButton = () => {
        const canDelete = (isDevMode() || document.getElementById("room-editor")) &&
            !!currentSource?.userData?.isUserArt &&
            typeof userArtDeleteHandler === "function";
        deleteBtn.hidden = !canDelete;
        deleteBtn.disabled = !canDelete;
        root.classList.toggle("has-user-art-delete", canDelete);
    };
    deleteBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (deleteBtn.disabled || !currentSource || !userArtDeleteHandler)
            return;
        const art = currentSource;
        Promise.resolve(userArtDeleteHandler(art))
            .catch((err) => console.warn("lightbox delete failed", err))
            .finally(() => {
                close(IS_SOUND_ON);
            });
    });
    const moDev = new MutationObserver(syncDeleteButton);
    moDev.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    const setUserArtDeleteHandler = (fn) => {
        userArtDeleteHandler = typeof fn === "function" ? fn : null;
        syncDeleteButton();
    };
    return {
        setVolume: value => { sfxGain = value; },
        open,
        close,
        isOpen,
        remeasure,
        setUserArtDeleteHandler,
        unlockAudio: ensureAudioCtx,
        getCurrentSource: () => currentSource,
    };
};

export const youtubeIdFromUrl = (url) => {
    if (!url || typeof url !== "string")
        return null;
    try {
        const u = new URL(url.trim());
        const host = u.hostname.replace(/^www\./, "");
        if (host === "youtu.be") {
            const id = u.pathname.split("/").filter(Boolean)[0];
            return id || null;
        }
        if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
            if (u.pathname === "/watch")
                return u.searchParams.get("v");
            const parts = u.pathname.split("/").filter(Boolean);
            if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") {
                return parts[1] || null;
            }
        }
    }
    catch (_) {
    }
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
};

export const setupVideoLightbox = ({ stage = document.getElementById("stage"), root = document.getElementById("video-lightbox"), } = {}) => {
    let el = root;
    if (!el) {
        const host = stage || document.body;
        el = document.createElement("div");
        el.id = "video-lightbox";
        el.setAttribute("aria-hidden", "true");
        el.innerHTML = `
            <div class="video-lightbox-frame">
                <div class="video-lightbox-stage">
                    <iframe
                        title="YouTube video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen
                        referrerpolicy="strict-origin-when-cross-origin"
                    ></iframe>
                </div>
                <a id="video-lightbox-caption" href="#" target="_blank" rel="noopener noreferrer"></a>
            </div>
        `;
        host.appendChild(el);
    }
    const iframe = el.querySelector("iframe");
    const caption = el.querySelector("#video-lightbox-caption") ||
        el.querySelector(".video-lightbox-caption");
    if (!iframe)
        throw new Error("setupVideoLightbox: expected iframe");
    let captionEl = caption;
    if (!captionEl) {
        captionEl = document.createElement("a");
        captionEl.id = "video-lightbox-caption";
        captionEl.target = "_blank";
        captionEl.rel = "noopener noreferrer";
        const frame = el.querySelector(".video-lightbox-frame");
        if (frame)
            frame.appendChild(captionEl);
    }
    const isOpen = () => el.classList.contains("is-open");
    const close = () => {
        if (!isOpen())
            return;
        el.classList.remove("is-open");
        el.setAttribute("aria-hidden", "true");
        iframe.removeAttribute("src");
        captionEl.removeAttribute("href");
        captionEl.textContent = "";
    };
    const open = (videoUrl, { autoplay = true } = {}) => {
        const id = youtubeIdFromUrl(videoUrl) ||
            (/^[A-Za-z0-9_-]{6,}$/.test(videoUrl) ? videoUrl : null);
        if (!id) {
            console.warn("setupVideoLightbox.open: could not parse YouTube id from", videoUrl);
            return;
        }
        const params = new URLSearchParams({
            rel: "0",
            modestbranding: "1",
        });
        if (autoplay)
            params.set("autoplay", "1");
        iframe.src = `https://www.youtube.com/embed/${id}?${params.toString()}`;
        const watchUrl = typeof videoUrl === "string" && /youtu/.test(videoUrl)
            ? videoUrl
            : `https://www.youtube.com/watch?v=${id}`;
        captionEl.href = watchUrl;
        captionEl.textContent = watchUrl;
        el.classList.add("is-open");
        el.setAttribute("aria-hidden", "false");
    };
    el.addEventListener("click", (e) => {
        if (e.target === el)
            close();
    });
    const frame = el.querySelector(".video-lightbox-frame");
    if (frame) {
        frame.addEventListener("click", (e) => {
            if (e.target === frame)
                close();
        });
    }
    captionEl.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isOpen())
            close();
    });
    return { open, close, isOpen, root: el };
};

const BASE_HEIGHT = 0.28;

const CROWN_HEIGHT = 0.09;

const DEPTH = 0.02;

const MOLDING_COLOR = 0xcbcbcb;

export const addHallMolding = (scene, outline, roomHeight, color = MOLDING_COLOR, floorY = -roomHeight / 2) => {
    const ceilingY = floorY + roomHeight;
    const mat = new THREE.MeshStandardMaterial({ color });
    for (let i = 0; i < outline.length; i++) {
        const [x1, z1] = outline[i];
        const [x2, z2] = outline[(i + 1) % outline.length];
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6)
            continue;
        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;
        const runLen = len + DEPTH * 2;
        const edgeDir = new THREE.Vector3(dx, 0, dz).normalize();
        const normal = new THREE.Vector3().crossVectors(edgeDir, new THREE.Vector3(0, 1, 0));
        const toCenter = new THREE.Vector3(-cx, 0, -cz);
        if (normal.dot(toCenter) < 0)
            normal.negate();
        const rotY = Math.atan2(normal.x, normal.z);
        const ox = normal.x * (DEPTH / 2);
        const oz = normal.z * (DEPTH / 2);
        const base = new THREE.Mesh(new THREE.BoxGeometry(runLen, BASE_HEIGHT, DEPTH), mat);
        base.position.set(cx + ox, floorY + BASE_HEIGHT / 2, cz + oz);
        base.rotation.y = rotY;
        scene.add(base);
        const crown = new THREE.Mesh(new THREE.BoxGeometry(runLen, CROWN_HEIGHT, DEPTH), mat);
        crown.position.set(cx + ox, ceilingY - CROWN_HEIGHT / 2, cz + oz);
        crown.rotation.y = rotY;
        scene.add(crown);
    }
    // Expose the shared trim material for optional room-specific surface effects.
    return mat;
};

const DRAG_THRESHOLD = 4;

const BOX_FACE_NAMES = ["east", "west", "ceiling", "floor", "south", "north"];

// Enable this again when wall-position crosshairs are useful during development.
const SHOW_WALL_CROSSHAIRS = false;

const CROSS_SIZE = 0.22;

const CROSS_OFFSET = 0.03;

const fmt = (n) => {
    const v = Math.round(n * 1000) / 1000;
    return Object.is(v, -0) ? 0 : v;
};

const wallNameFromNormal = (nx, nz) => {
    if (Math.abs(nz) >= Math.abs(nx))
        return nz < 0 ? "north" : "south";
    return nx < 0 ? "west" : "east";
};

const resolveScene = (scene, object) => {
    if (scene)
        return scene;
    let o = object;
    while (o && o.parent)
        o = o.parent;
    return o || null;
};

export const createWallClickHelper = ({ canvas, camera, stage, scene } = {}) => {
    const host = stage || document.getElementById("stage");
    const walls = [];
    let hud = document.getElementById("wall-click-hud");
    if (!hud && host) {
        hud = document.createElement("div");
        hud.id = "wall-click-hud";
        hud.setAttribute("aria-live", "polite");
        hud.textContent = "click a wall for coordinates";
        host.appendChild(hud);
    }
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const local = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);
    let crosshair = null;
    let hasCrosshairPlacement = false;
    let lastHitInfo = null;
    let wallPickHandler = null;
    let tracking = false;
    let didDrag = false;
    let lastX = 0;
    let totalDrag = 0;
    const ensureCrosshair = (targetScene) => {
        if (crosshair)
            return crosshair;
        if (!targetScene)
            return null;
        const positions = new Float32Array([
            -CROSS_SIZE, 0, 0, CROSS_SIZE, 0, 0,
            0, -CROSS_SIZE, 0, 0, CROSS_SIZE, 0,
        ]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.LineBasicMaterial({
            color: 0xff2222,
            depthTest: true,
            depthWrite: false,
        });
        crosshair = new THREE.LineSegments(geo, mat);
        crosshair.name = "wall-click-crosshair";
        crosshair.renderOrder = 10;
        crosshair.visible = false;
        crosshair.frustumCulled = false;
        targetScene.add(crosshair);
        return crosshair;
    };
    let addingImageCrosshair = false;
    const syncCrosshairVisibility = () => {
        if (!crosshair)
            return;
        crosshair.visible = hasCrosshairPlacement && (addingImageCrosshair || (SHOW_WALL_CROSSHAIRS && isDevMode()));
    };
    const placeCrosshair = (hit) => {
        const targetScene = resolveScene(scene, hit.object);
        const marker = ensureCrosshair(targetScene);
        if (!marker || !hit.face)
            return;
        normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
        toCam.subVectors(camera.position, hit.point);
        if (normal.dot(toCam) < 0)
            normal.negate();
        marker.position.copy(hit.point).addScaledVector(normal, CROSS_OFFSET);
        marker.quaternion.setFromUnitVectors(zAxis, normal);
        hasCrosshairPlacement = true;
        syncCrosshairVisibility();
    };
    const register = (mesh, meta = {}) => {
        if (!mesh)
            return mesh;
        mesh.userData.isWall = true;
        if (typeof meta.wall === "string")
            mesh.userData.wall = meta.wall;
        if (meta.edge)
            mesh.userData.edge = meta.edge;
        if (!walls.includes(mesh))
            walls.push(mesh);
        return mesh;
    };
    const registerRoomBox = (mesh) => {
        if (!mesh)
            return mesh;
        mesh.userData.isRoomBox = true;
        if (!walls.includes(mesh))
            walls.push(mesh);
        return mesh;
    };
    const addWallSegment = (x1, z1, x2, z2, { material, height, wall, y = 0 } = {}) => {
        if (!scene) {
            console.warn("createWallClickHelper.addWallSegment: scene is required");
            return null;
        }
        if (!material || height == null) {
            console.warn("createWallClickHelper.addWallSegment: material and height are required");
            return null;
        }
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6)
            return null;
        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;
        const edgeDir = new THREE.Vector3(dx, 0, dz).normalize();
        const n = new THREE.Vector3().crossVectors(edgeDir, new THREE.Vector3(0, 1, 0));
        const toCenter = new THREE.Vector3(-cx, 0, -cz);
        if (n.dot(toCenter) < 0)
            n.negate();
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, height), material);
        mesh.position.set(cx, y, cz);
        mesh.rotation.y = Math.atan2(n.x, n.z);
        register(mesh, {
            wall,
            edge: { x1, z1, x2, z2 },
        });
        if (wall == null) {
            normal.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), mesh.rotation.y);
            mesh.userData.wall = wallNameFromNormal(-normal.x, -normal.z);
        }
        scene.add(mesh);
        return mesh;
    };
    const addWallsFromOutline = (outline, opts = {}) => {
        const built = [];
        if (!outline || outline.length < 2)
            return built;
        for (let i = 0; i < outline.length; i++) {
            const [x1, z1] = outline[i];
            const [x2, z2] = outline[(i + 1) % outline.length];
            const mesh = addWallSegment(x1, z1, x2, z2, opts);
            if (mesh)
                built.push(mesh);
        }
        return built;
    };
    const describeHit = (hit) => {
        const obj = hit.object;
        const world = hit.point;
        if (obj.userData.isRoomBox) {
            const face = Math.floor(hit.faceIndex / 2);
            const name = BOX_FACE_NAMES[face] || `face-${face}`;
            if (name === "ceiling" || name === "floor")
                return null;
            const along = name === "north" || name === "south" ? world.x : world.z;
            return {
                wall: name,
                world: { x: world.x, y: world.y, z: world.z },
                local: { x: along, y: world.y },
                uv: hit.uv ? { u: hit.uv.x, v: hit.uv.y } : null,
            };
        }
        local.copy(world);
        obj.worldToLocal(local);
        let name = obj.userData.wall;
        if (typeof name !== "string") {
            normal.set(0, 0, 1).transformDirection(obj.matrixWorld);
            name = wallNameFromNormal(-normal.x, -normal.z);
        }
        return {
            wall: name,
            world: { x: world.x, y: world.y, z: world.z },
            local: { x: local.x, y: local.y },
            uv: hit.uv ? { u: hit.uv.x, v: hit.uv.y } : null,
        };
    };
    const formatInfo = (info) => {
        const w = info.world;
        const l = info.local;
        const uv = info.uv
            ? `  uv=(${fmt(info.uv.u)}, ${fmt(info.uv.v)})`
            : "";
        return (`${info.wall}` +
            `  world=(${fmt(w.x)}, ${fmt(w.y)}, ${fmt(w.z)})` +
            `  local=(${fmt(l.x)}, ${fmt(l.y)})` +
            uv);
    };
    const reportClick = (clientX, clientY) => {
        if (!camera || !walls.length)
            return;
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(walls, false);
        if (!hits.length)
            return;
        const hit = hits[0];
        const info = describeHit(hit);
        if (!info)
            return;
        const line = formatInfo(info);
        console.log(`[wall-click] ${line}`);
        lastHitInfo = info;
        if (hud) {
            hud.textContent = line;
            hud.dataset.hasCoords = "1";
        }
        if (SHOW_WALL_CROSSHAIRS && isDevMode() && !addingImageCrosshair)
            placeCrosshair(hit);
        if (typeof wallPickHandler === "function")
            wallPickHandler(info);
    };
    ;
    if (canvas) {
        canvas.addEventListener("pointerdown", (e) => {
            if (e.button !== 0)
                return;
            tracking = true;
            didDrag = false;
            lastX = e.clientX;
            totalDrag = 0;
        });
        canvas.addEventListener("pointermove", (e) => {
            if (!tracking)
                return;
            totalDrag += Math.abs(e.clientX - lastX);
            if (totalDrag > DRAG_THRESHOLD)
                didDrag = true;
            lastX = e.clientX;
        });
        const endPointer = (e) => {
            if (!tracking)
                return;
            tracking = false;
            if (didDrag || e.type === "pointercancel")
                return;
            reportClick(e.clientX, e.clientY);
        };
        canvas.addEventListener("pointerup", endPointer);
        canvas.addEventListener("pointercancel", endPointer);
    }
    if (hud && !isDevMode()) {
        hud.textContent = "click a wall for coordinates";
    }
    const mo = new MutationObserver(syncCrosshairVisibility);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return {
        walls,
        register,
        registerRoomBox,
        addWallSegment,
        addWallsFromOutline,
        reportClick,
        // Show a fixed placement marker only while the new-image panel is open.
        showCrosshair: hit => {
            addingImageCrosshair = true;
            placeCrosshair(hit);
        },
        updateCrosshair: (pose, width) => {
            const marker = ensureCrosshair(scene);
            if (!marker) return;
            addingImageCrosshair = true;
            marker.position.copy(pose.position);
            marker.quaternion.copy(pose.quaternion);
            marker.translateZ(CROSS_OFFSET);
            marker.scale.set(width / (CROSS_SIZE * 2), 1, 1);
            marker.material.depthTest = false;
            hasCrosshairPlacement = true;
            syncCrosshairVisibility();
        },
        hideCrosshair: () => {
            addingImageCrosshair = false;
            hasCrosshairPlacement = false;
            syncCrosshairVisibility();
        },
        getLastHit: () => lastHitInfo,
        onWallPick: (fn) => {
            wallPickHandler = typeof fn === "function" ? fn : null;
        },
    };
};

const DEFAULT_HEIGHT_FROM_FLOOR = 1.1;

const DEFAULT_BOX_HEIGHT = 0.95;

const DEFAULT_BOX_COLOR = 0xb4b4b4;

const BOX_DEPTH = 0.14;

const CONDUIT_RADIUS = 0.032;

export const createAddElectricalBox = ({ scene, textureLoader, roomHalfY }) => {
    return (direction, x, y, imageFile, heightFromFloor = DEFAULT_HEIGHT_FROM_FLOOR, boxWidth, boxHeight = DEFAULT_BOX_HEIGHT, boxColor = DEFAULT_BOX_COLOR) => {
        textureLoader.load(imageFile, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const aspect = tex.image.width / tex.image.height;
            const w = boxWidth ?? boxHeight * aspect;
            const h = boxHeight;
            const d = BOX_DEPTH;
            const metalMat = new THREE.MeshStandardMaterial({ color: boxColor });
            const faceMat = new THREE.MeshStandardMaterial({ map: tex });
            const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [metalMat, metalMat, metalMat, metalMat, faceMat, metalMat]);
            const boxY = -roomHalfY + heightFromFloor + h / 2;
            let bx = x;
            let bz = y;
            let fx = 0;
            let fz = 0;
            if (direction === "north") {
                box.rotation.y = 0;
                bz = y + d / 2;
                fz = 1;
            }
            else if (direction === "south") {
                box.rotation.y = Math.PI;
                bz = y - d / 2;
                fz = -1;
            }
            else if (direction === "west") {
                box.rotation.y = Math.PI / 2;
                bx = x + d / 2;
                fx = 1;
            }
            else if (direction === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = x - d / 2;
                fx = -1;
            }
            else {
                console.warn("Invalid electrical box direction:", direction);
                return;
            }
            box.position.set(bx, boxY, bz);
            scene.add(box);
            const conduitMat = new THREE.MeshStandardMaterial({ color: boxColor });
            const topOfBox = boxY + h / 2;
            const conduitLen = roomHalfY - topOfBox;
            if (conduitLen <= 0)
                return;
            const conduitY = topOfBox + conduitLen / 2;
            const cx = bx - fx * d * 0.15;
            const cz = bz - fz * d * 0.15;
            const along = w * 0.22;
            for (const sign of [-1, 1]) {
                const tube = new THREE.Mesh(new THREE.CylinderGeometry(CONDUIT_RADIUS, CONDUIT_RADIUS, conduitLen, 12), conduitMat);
                if (direction === "north" || direction === "south") {
                    tube.position.set(cx + sign * along, conduitY, cz);
                }
                else {
                    tube.position.set(cx, conduitY, cz + sign * along);
                }
                scene.add(tube);
            }
        });
    };
};

const EXIT_DEFAULT_IMAGE = roomAsset("images/static_images/exit-1.jpg");

const EXIT_DEFAULT_BOX_HEIGHT = 0.22;

const EXIT_DEFAULT_BOX_COLOR = 0x3a3a3a;

const EXIT_DEFAULT_CEILING_GAP = 0.14;

const EXIT_BOX_DEPTH = 0.05;

export const createAddExitSign = ({ scene, textureLoader, roomHalfY }) => {
    const place = (direction, x, y, imageFile, boxWidth, boxHeight, boxColor, ceilingGap, beside = null, onCreate = null) => {
        textureLoader.load(imageFile, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const aspect = tex.image.width / tex.image.height;
            const h = boxHeight;
            const w = boxWidth ?? h * aspect;
            const d = EXIT_BOX_DEPTH;
            const metalMat = new THREE.MeshStandardMaterial({ color: boxColor });
            const faceMat = new THREE.MeshStandardMaterial({
                map: tex,
                emissive: 0xffffff,
                emissiveMap: tex,
                emissiveIntensity: imageFile === EXIT_DEFAULT_IMAGE ? 0.12 : 0.35,
                color: imageFile === EXIT_DEFAULT_IMAGE ? 0x999999 : 0xffffff,
                toneMapped: false,
            });
            const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [metalMat, metalMat, metalMat, metalMat, faceMat, metalMat]);
            const boxY = beside?.centerY ?? roomHalfY - ceilingGap - h / 2;
            // "Right" is measured while facing the door, including south and west walls.
            const offset = beside ? (beside.doorWidth / 2 + 0.12 + w / 2) * wallRightSign(direction) : 0;
            if (direction === "north" || direction === "south") x += offset;
            else y += offset;
            let bx = x;
            let bz = y;
            if (direction === "north") {
                box.rotation.y = 0;
                bz = y + d / 2;
            }
            else if (direction === "south") {
                box.rotation.y = Math.PI;
                bz = y - d / 2;
            }
            else if (direction === "west") {
                box.rotation.y = Math.PI / 2;
                bx = x + d / 2;
            }
            else if (direction === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = x - d / 2;
            }
            else {
                console.warn("Invalid exit sign direction:", direction);
                return;
            }
            box.position.set(bx, boxY, bz);
            scene.add(box);
            (onCreate ?? beside?.onCreate)?.(box);
        });
    };
    return (doorOrDirection, b, c, d, e, f, g, h) => {
        if (doorOrDirection && (doorOrDirection.isMesh || doorOrDirection.userData?.isDoor)) {
            const door = doorOrDirection;
            const direction = door.userData.wall;
            if (!direction) {
                console.warn("addExitSign: door is missing userData.wall");
                return;
            }
            if (b && typeof b === "object") {
                const height = door.geometry.parameters.height;
                const centerY = door.position.y - height / 2 + height * (b.heightRatio ?? 2 / 3);
                place(direction, door.position.x, door.position.z, b.file ?? EXIT_DEFAULT_IMAGE,
                    b.width, b.height ?? EXIT_DEFAULT_BOX_HEIGHT, b.color ?? EXIT_DEFAULT_BOX_COLOR,
                    EXIT_DEFAULT_CEILING_GAP, b.right ? { centerY, doorWidth: door.geometry.parameters.width, onCreate: b.onCreate } : null, b.onCreate);
                return;
            }
            place(direction, door.position.x, door.position.z, b ?? EXIT_DEFAULT_IMAGE, c, d ?? EXIT_DEFAULT_BOX_HEIGHT, e ?? EXIT_DEFAULT_BOX_COLOR, f ?? EXIT_DEFAULT_CEILING_GAP);
            return;
        }
        place(doorOrDirection, b, c, d ?? EXIT_DEFAULT_IMAGE, e, f ?? EXIT_DEFAULT_BOX_HEIGHT, g ?? EXIT_DEFAULT_BOX_COLOR, h ?? EXIT_DEFAULT_CEILING_GAP);
    };
};

const CHAIR_IMAGE = roomAsset("images/static_images/chair.png");

const CHAIR_H = 0.9 * 2.5 * 0.9;

const LEAN = 0.2;

const STACK_GAP = 0.08;

const WALL_CLEARANCE = 0.04;

export const createAddFoldingChairs = ({ scene, textureLoader, roomHalfY }) => {
    return (x, y, direction, numberOfChairs, { height = CHAIR_H, width = null, lean = LEAN, gap = STACK_GAP, clearance = WALL_CLEARANCE, file = CHAIR_IMAGE } = {}) => {
        const n = Math.max(1, Math.floor(Number(numberOfChairs) || 1));
        let rotY = 0;
        let fx = 0;
        let fz = 0;
        if (direction === "north") {
            rotY = 0;
            fz = 1;
        }
        else if (direction === "south") {
            rotY = Math.PI;
            fz = -1;
        }
        else if (direction === "west") {
            rotY = Math.PI / 2;
            fx = 1;
        }
        else if (direction === "east") {
            rotY = -Math.PI / 2;
            fx = -1;
        }
        else {
            console.warn("Invalid folding chair direction:", direction);
            return;
        }
        const baseOut = (height / 2) * Math.sin(lean) + clearance;
        textureLoader.load(file, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const aspect = tex.image.width / tex.image.height;
            const w = width ?? height * aspect;
            const h = height;
            const material = new THREE.MeshStandardMaterial({
                map: tex,
                transparent: true,
                alphaTest: 0.1,
                depthWrite: true,
                side: THREE.DoubleSide,
            });
            for (let i = 0; i < n; i++) {
                const chair = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
                chair.rotation.order = "YXZ";
                chair.rotation.y = rotY;
                chair.rotation.x = -lean;
                const out = baseOut + i * gap;
                chair.position.set(x + fx * out, -roomHalfY + h / 2 * Math.cos(lean), y + fz * out);
                scene.add(chair);
            }
        });
    };
};

const FACE_IMAGE = roomAsset("images/static_images/box-face.jpg");

const SIDE_IMAGE = roomAsset("images/static_images/box-side.jpg");

export const BOX_W = 0.72;

export const BOX_D = 0.92;

export const BOX_H = 0.56;

const TOP_COLOR = 0xdedede;

const FACE_TINT = 0xc4c4c4;

const WALL_FLUSH_PULL = 0.05;

const YAW = Math.PI / 2;

const WOBBLE_MIN = 0.042;

const WOBBLE_MAX = 0.09;

const prepTex = tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
};

const seed01 = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
};

const seed01n = (x, y, n) => seed01(x + n * 19.17, y - n * 7.31);

export const createAddBoxStack = ({ scene, textureLoader, roomHalfY }) => {
    return (x, y, direction, stackHeight, { width = BOX_W, height = BOX_H, depth = BOX_D, wobble = true, face = FACE_IMAGE, side = SIDE_IMAGE } = {}) => {
        const n = Math.max(1, Math.floor(Number(stackHeight) || 1));
        let rotY = 0;
        let fx = 0;
        let fz = 0;
        if (direction === "north") {
            rotY = 0;
            fz = 1;
        }
        else if (direction === "south") {
            rotY = Math.PI;
            fz = -1;
        }
        else if (direction === "west") {
            rotY = Math.PI / 2;
            fx = 1;
        }
        else if (direction === "east") {
            rotY = -Math.PI / 2;
            fx = -1;
        }
        else {
            console.warn("Invalid box stack direction:", direction);
            return;
        }
        rotY += YAW;
        const stackSeed = seed01(x, y);
        const startSign = stackSeed < 0.5 ? 1 : -1;
        const baseAmp = WOBBLE_MIN + stackSeed * (WOBBLE_MAX - WOBBLE_MIN);
        let faceTex = null;
        let sideTex = null;
        let left = 2;
        const build = () => {
            const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, color: FACE_TINT });
            const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, color: FACE_TINT });
            const topMat = new THREE.MeshStandardMaterial({ color: TOP_COLOR });
            const materials = [sideMat, sideMat, topMat, topMat, faceMat, faceMat];
            const out = width / 2 - WALL_FLUSH_PULL;
            const bx = x + fx * out;
            const bz = y + fz * out;
            for (let i = 0; i < n; i++) {
                const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials);
                const level = seed01n(x, y, i);
                const amp = baseAmp * (0.75 + level * 0.5);
                const yawOffset = startSign * (i % 2 === 0 ? 1 : -1) * amp;
                box.rotation.y = rotY + (wobble ? yawOffset : 0);
                box.position.set(bx, -roomHalfY + height / 2 + i * height, bz);
                scene.add(box);
            }
        };
        textureLoader.load(face, tex => {
            faceTex = prepTex(tex);
            if (--left === 0)
                build();
        });
        textureLoader.load(side, tex => {
            sideTex = prepTex(tex);
            if (--left === 0)
                build();
        });
    };
};

const SWITCH_IMAGE = roomAsset("images/static_images/switches.jpg");
const SWITCH_HEIGHT = 0.24;
const SWITCH_DEPTH = 0.04;
const PLATE_COLOR = 0xf4f4f4;
const SWITCH_FACE_TINT = 0xffffff;
const SWITCH_WALL_FLUSH_PULL = 0.05;

export const createAddLightSwitch = ({ scene, textureLoader, roomHalfY, doorHeight = 3.2, clickable = null, defaultDisabled = true, }) => {
    const defaultCenterFromFloor = doorHeight / 2;
    return (direction, x, y, heightFromFloor = defaultCenterFromFloor, { scale = 1, switches = 2, isDisabled = defaultDisabled } = {}) => {
        textureLoader.load(SWITCH_IMAGE, (tex) => {
            const count = Math.max(1, Math.round(Number(switches) || 2));
            const units = count / 2;
            const map = tex.clone();
            map.needsUpdate = true;
            map.colorSpace = THREE.SRGBColorSpace;
            map.magFilter = THREE.NearestFilter;
            map.minFilter = THREE.NearestFilter;
            map.wrapS = THREE.RepeatWrapping;
            map.wrapT = THREE.ClampToEdgeWrapping;
            map.repeat.set(units, 1);
            map.offset.set(0, 0);
            const aspect = tex.image.width / tex.image.height;
            const h = SWITCH_HEIGHT * scale;
            const w = h * aspect * units;
            const d = SWITCH_DEPTH;
            const plateMat = new THREE.MeshStandardMaterial({
                color: PLATE_COLOR,
            });
            const faceMat = new THREE.MeshStandardMaterial({
                map,
                color: SWITCH_FACE_TINT,
            });
            const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [plateMat, plateMat, plateMat, plateMat, faceMat, plateMat]);
            const boxY = -roomHalfY + heightFromFloor;
            const out = d / 2 - SWITCH_WALL_FLUSH_PULL;
            let bx = x;
            let bz = y;
            if (direction === "north") {
                box.rotation.y = 0;
                bz = y + out;
            }
            else if (direction === "south") {
                box.rotation.y = Math.PI;
                bz = y - out;
            }
            else if (direction === "west") {
                box.rotation.y = Math.PI / 2;
                bx = x + out;
            }
            else if (direction === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = x - out;
            }
            else {
                console.warn("Invalid light switch direction:", direction);
                return;
            }
            box.position.set(bx, boxY, bz);
            box.userData.isLightSwitch = true;
            box.userData.switches = count;
            box.userData.isDisabled = !!isDisabled;
            if (clickable)
                clickable.push(box);
            scene.add(box);
        });
    };
};

const FIXTURE_ON_RGB = [14, 13.2, 11.5];

const FIXTURE_OFF_COLOR = 0x585858;

export const createRoomLights = ({ ambient, directional, scene = null, isOn = true, offIntensity = { ambient: 0.05, directional: 0.04 }, offBackground = 0x111111, onChange = null, fixtureBrightness = 1, fixtureColor = 0xffffff, fixtureOffColor = FIXTURE_OFF_COLOR, fixtureOffGlow = 0, } = {}) => {
    const onIntensity = {
        ambient: ambient ? ambient.intensity : 1,
        directional: directional ? directional.intensity : 1,
    };
    const off = {
        ambient: offIntensity.ambient ?? 0.05,
        directional: offIntensity.directional ?? 0.04,
    };
    const onBackground = scene && scene.background && scene.background.isColor
        ? scene.background.getHex()
        : null;
    // Subscribers follow actual light pulses, including the startup flicker.
    const listeners = new Set();
    const notify = () => {
        if (typeof onChange === "function") onChange(on);
        for (const listener of listeners) listener(on);
    };
    let on = !!isOn;
    const fixtures = [];
    const localLights = [];
    const offLights = [];
    const doorGlows = [];
    const unlit = [];
    const applyFixtureFace = (face, lit) => {
        if (!face || !face.color)
            return;
        if (face.emissive) {
            face.color.set(lit ? 0xffffff : fixtureOffColor);
            if (lit) face.emissive.setRGB(...FIXTURE_ON_RGB.map(value => value * fixtureBrightness)).multiply(new THREE.Color(fixtureColor));
            else face.emissive.setRGB(fixtureOffGlow, fixtureOffGlow, fixtureOffGlow);
        } else if (lit) {
            face.color.setRGB(...FIXTURE_ON_RGB.map(value => value * fixtureBrightness)).multiply(new THREE.Color(fixtureColor));
        } else face.color.set(fixtureOffColor);
    };
    const apply = () => {
        const levels = on ? onIntensity : off;
        if (ambient)
            ambient.intensity = levels.ambient;
        if (directional)
            directional.intensity = levels.directional;
        for (const { light, intensity } of offLights)
            light.intensity = on ? 0 : intensity;
        for (const { light, intensity } of localLights)
            light.intensity = on ? intensity : 0;
        for (const { material, intensity, offMultiplier } of doorGlows)
            material.emissiveIntensity = intensity * (on ? 1 : offMultiplier);
        for (const { face } of fixtures)
            applyFixtureFace(face, on);
        for (const entry of unlit) {
            entry.material.color.setHex(on ? entry.onColor : entry.offColor);
        }
        if (scene?.background?.isColor && onBackground != null) {
            scene.background.setHex(on ? onBackground : offBackground);
        }
    };
    apply();
    return {
        isOn: () => on,
        onChange(listener) {
            listeners.add(listener);
            listener(on);
            return () => listeners.delete(listener);
        },

        setOn(next) {
            on = !!next;
            apply();
            notify();
        },

        toggle() {
            on = !on;
            apply();
            notify();
            return on;
        },

        // Keep destination-lit doors visible, but soften their glow in a dark hallway.
        registerDoorGlow(material, offMultiplier = 0.8) {
            const intensity = material.emissiveIntensity;
            doorGlows.push({ material, intensity, offMultiplier });
            material.emissiveIntensity = intensity * (on ? 1 : offMultiplier);
        },

        // Point lights use the same switch and timed flicker as the fixture faces.
        registerLight(light) {
            localLights.push({ light, intensity: light.intensity });
            if (!on) light.intensity = 0;
        },

        // Off-state fills never add brightness on top of the electric lighting.
        registerOffLight(light) {
            offLights.push({ light, intensity: light.intensity });
            if (on) light.intensity = 0;
        },

        registerFixture(faceMat) {
            if (!faceMat)
                return;
            fixtures.push({ face: faceMat });
            applyFixtureFace(faceMat, on);
        },

        registerUnlit(material, offColor = 0x111111) {
            if (!material || !material.color)
                return;
            unlit.push({
                material,
                onColor: material.color.getHex(),
                offColor,
            });
            material.color.setHex(on ? material.color.getHex() : offColor);
        },
    };
};

const LIGHT_IMAGE = roomAsset("images/static_images/lights-1.jpg");

export const LIGHT_LENGTH = 1.35;

export const LIGHT_WIDTH = 0.28;

const LIGHT_DEPTH = 0.06;

const HOUSING_COLOR = 0xb0b0b0;

const DROP_FROM_CEILING = 0.02;

export const createAddLightFixture = ({ scene, textureLoader, roomHalfY, ceilingY = roomHalfY, roomLights = null, reactiveFace = false, }) => {
    return (x, z, rotationY = 0, { isOn = false, scale = 1, length, width } = {}) => {
        textureLoader.load(LIGHT_IMAGE, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const len = (length ?? LIGHT_LENGTH) * scale;
            const wid = (width ?? LIGHT_WIDTH) * scale;
            const depth = LIGHT_DEPTH;
            const housing = new THREE.MeshStandardMaterial({
                color: HOUSING_COLOR,
            });
            // Only skylight galleries need light-reactive diffuser faces.
            const face = reactiveFace ? new THREE.MeshStandardMaterial({
                map: tex,
                emissiveMap: tex,
                emissive: 0x000000,
                roughness: 0.85,
                toneMapped: false,
            }) : new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
            const lit = roomLights ? roomLights.isOn() : isOn;
            if (lit) {
                if (face.emissive) face.emissive.setRGB(...FIXTURE_ON_RGB);
                else face.color.setRGB(...FIXTURE_ON_RGB);
            }
            else
                face.color.set(FIXTURE_OFF_COLOR);
            const box = new THREE.Mesh(new THREE.BoxGeometry(len, depth, wid), [housing, housing, housing, face, housing, housing]);
            box.rotation.y = rotationY;
            box.position.set(x, ceilingY - DROP_FROM_CEILING - depth / 2, z);
            box.userData.isLightFixture = true;
            box.userData.isOn = lit;
            if (roomLights)
                roomLights.registerFixture(face);
            scene.add(box);
        });
    };
};

export const lightPositionsAlong = (length, count) => {
    const n = Math.max(0, Math.floor(count));
    if (n === 0)
        return [];
    if (n === 1)
        return [length / 2];
    const gap = (length - n * LIGHT_LENGTH) / (n + 1);
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(gap + LIGHT_LENGTH / 2 + i * (LIGHT_LENGTH + gap));
    }
    return out;
};

const VENT_IMAGE = roomAsset("images/static_images/vent.jpg");
const VENT_HEIGHT = 0.3;
export const VENT_WIDTH = 0.95 * (2 / 3);
const VENT_DEPTH = 0.04;
const VENT_COLOR = 0x6a6a6a;
const DEFAULT_Y_FROM_CEILING = 0.12;
const VENT_WALL_FLUSH_PULL = 0.05;

export const createAddVent = ({ scene, textureLoader, roomHalfY, walls }) => {
    return (wall, xFromLeft, yFromCeilingOrOpts = DEFAULT_Y_FROM_CEILING) => {
        const spec = walls[wall];
        if (!spec) {
            console.warn("Invalid vent wall:", wall);
            return;
        }
        const opts = typeof yFromCeilingOrOpts === "object" && yFromCeilingOrOpts != null
            ? yFromCeilingOrOpts
            : { yFromCeiling: yFromCeilingOrOpts };
        const yFromCeiling = opts.yFromCeiling ?? DEFAULT_Y_FROM_CEILING;
        const w = opts.width ?? VENT_WIDTH;
        const h = opts.height ?? VENT_HEIGHT;
        const d = VENT_DEPTH;
        textureLoader.load(VENT_IMAGE, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const metalMat = new THREE.MeshStandardMaterial({
                color: VENT_COLOR,
            });
            const faceMat = new THREE.MeshStandardMaterial({ map: tex });
            const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [metalMat, metalMat, metalMat, metalMat, faceMat, metalMat]);
            const boxY = roomHalfY - yFromCeiling - h / 2;
            const out = d / 2 - VENT_WALL_FLUSH_PULL;
            let bx = 0;
            let bz = 0;
            if (wall === "north") {
                box.rotation.y = 0;
                bx = spec.leftX + xFromLeft;
                bz = spec.z + out;
            }
            else if (wall === "south") {
                box.rotation.y = Math.PI;
                bx = spec.leftX - xFromLeft;
                bz = spec.z - out;
            }
            else if (wall === "west") {
                box.rotation.y = Math.PI / 2;
                bx = spec.x + out;
                bz = spec.leftZ + xFromLeft;
            }
            else if (wall === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = spec.x - out;
                bz = spec.leftZ - xFromLeft;
            }
            box.position.set(bx, boxY, bz);
            scene.add(box);
        });
    };
};

export const ventPositionsAlongWall = (wallLength, count) => {
    const n = Math.max(0, Math.floor(count));
    if (n === 0)
        return [];
    if (n === 1)
        return [wallLength / 2];
    const gap = (wallLength - n * VENT_WIDTH) / (n + 1);
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(gap + VENT_WIDTH / 2 + i * (VENT_WIDTH + gap));
    }
    return out;
};

const DIR_DELTA = {
    north: [0, -1],
    south: [0, 1],
    east: [1, 0],
    west: [-1, 0],
};

export const outlineFromBox = (width, depth) => {
    const hx = width / 2;
    const hz = depth / 2;
    return [
        [-hx, -hz],
        [hx, -hz],
        [hx, hz],
        [-hx, hz],
    ];
};

export const outlineFromPath = (segments, start = [0, 0]) => {
    if (!segments || !segments.length) {
        console.warn("outlineFromPath: no segments");
        return [];
    }
    const pts = [[start[0], start[1]]];
    let x = start[0];
    let z = start[1];
    for (const seg of segments) {
        const d = DIR_DELTA[seg.dir];
        if (!d) {
            console.warn("outlineFromPath: invalid dir", seg.dir);
            continue;
        }
        const len = Number(seg.length) || 0;
        x += d[0] * len;
        z += d[1] * len;
        pts.push([x, z]);
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (pts.length > 1 &&
        Math.hypot(last[0] - first[0], last[1] - first[1]) < 1e-6) {
        pts.pop();
    }
    return pts;
};

export const outlineBounds = (outline) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of outline) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    return {
        minX,
        maxX,
        minZ,
        maxZ,
        halfX: (maxX - minX) / 2,
        halfZ: (maxZ - minZ) / 2,
        width: maxX - minX,
        depth: maxZ - minZ,
        centerX: (minX + maxX) / 2,
        centerZ: (minZ + maxZ) / 2,
    };
};

export const wallsFromOutline = (outline, wallInset = 0.05) => {
    const b = outlineBounds(outline);
    return {
        north: {
            z: b.minZ + wallInset,
            leftX: b.minX,
            rightX: b.maxX,
        },
        south: {
            z: b.maxZ - wallInset,
            leftX: b.maxX,
            rightX: b.minX,
        },
        west: {
            x: b.minX + wallInset,
            leftZ: b.minZ,
            rightZ: b.maxZ,
        },
        east: {
            x: b.maxX - wallInset,
            leftZ: b.maxZ,
            rightZ: b.minZ,
        },
    };
};

export const addVerticalCornerLinesFromOutline = (scene, corners, height, color = 0x111111, floorY = -height / 2) => {
    const ceilingY = floorY + height;
    const inset = 0.02;
    const positions = [];
    for (const [x, z] of corners) {
        const nx = x === 0 ? 0 : -Math.sign(x) * inset;
        const nz = z === 0 ? 0 : -Math.sign(z) * inset;
        positions.push(x + nx, floorY, z + nz, x + nx, ceilingY, z + nz);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
    scene.add(lines);
    return lines;
};

export const addHorizontalEdgeLinesFromOutline = (scene, outline, height, color = 0x111111, floorY = -height / 2) => {
    if (!outline || outline.length < 2)
        return null;
    const ceilingY = floorY + height;
    const intoRoom = 0.055;
    const yBottom = floorY + 0.003;
    const yTop = ceilingY - 0.003;
    const positions = [];
    const insetPt = ([x, z]) => {
        const nx = x === 0 ? 0 : -Math.sign(x) * intoRoom;
        const nz = z === 0 ? 0 : -Math.sign(z) * intoRoom;
        return [x + nx, z + nz];
    };
    for (let i = 0; i < outline.length; i++) {
        const [x1, z1] = insetPt(outline[i]);
        const [x2, z2] = insetPt(outline[(i + 1) % outline.length]);
        positions.push(x1, yBottom, z1, x2, yBottom, z2);
        positions.push(x1, yTop, z1, x2, yTop, z2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    }));
    lines.renderOrder = 1;
    scene.add(lines);
    return lines;
};

export const addVerticalCornerLinesFromBox = (scene, width, height, depth, yOffset = 0, color = 0xd2d2d2) => {
    const hx = width / 2;
    const hy = height / 2;
    const hz = depth / 2;
    const inset = 0.02;
    const corners = [
        [hx - inset, hz - inset],
        [hx - inset, -hz + inset],
        [-hx + inset, hz - inset],
        [-hx + inset, -hz + inset],
    ];
    const positions = [];
    for (const [x, z] of corners) {
        positions.push(x, -hy + yOffset, z, x, hy + yOffset, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
    scene.add(lines);
    return lines;
};

const shapeFromOutline = (outline) => {
    const s = new THREE.Shape();
    const [x0, z0] = outline[0];
    s.moveTo(x0, z0);
    for (let i = 1; i < outline.length; i++) {
        s.lineTo(outline[i][0], outline[i][1]);
    }
    s.lineTo(x0, z0);
    return s;
};

export const DEFAULT_ROOM_HEIGHT = 6;
export const CEILING_TILE_WORLD_SIZE = 64;

export const createRoomLayout = ({ scene, outline, height = DEFAULT_ROOM_HEIGHT, ceilingHeight, floorY: floorYOpt, materials, molding = true, cornerLines = true, horizontalLines = true, wallClick = null, wallInset = 0.05, roomLights = null, skylight = null, offLineColor = 0x111111, }) => {
    if (!outline || outline.length < 3) {
        throw new Error("createRoomLayout: outline needs at least 3 points");
    }
    const roomHeight = ceilingHeight ?? height;
    const floorY = floorYOpt !== undefined && floorYOpt !== null
        ? floorYOpt
        : -roomHeight / 2;
    const ceilingY = floorY + roomHeight;
    const wallCenterY = (floorY + ceilingY) / 2;
    const roomHalfY = -floorY;
    const shape = shapeFromOutline(outline);
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), materials.floor);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = floorY;
    floor.scale.z = -1;
    scene.add(floor);
    let ceilingShape = shape;
    let ceilingGeometry;
    let ceilingMaterial = materials.ceiling;
    let thickness = 0;
    if (skylight) {
        const bounds = outlineBounds(outline);
        const size = Number(skylight.width);
        thickness = Number(skylight.thickness);
        if (!(size > 0 && size < Math.min(bounds.width, bounds.depth) && thickness > 0))
            throw new Error("Skylight must fit inside the ceiling and have positive thickness.");
        ceilingShape = shapeFromOutline(outline);
        const half = size / 2;
        const hole = new THREE.Path();
        hole.moveTo(-half, -half);
        hole.lineTo(-half, half);
        hole.lineTo(half, half);
        hole.lineTo(half, -half);
        hole.closePath();
        ceilingShape.holes.push(hole);
        // Extrusion leaves real vertical reveals around the hole instead of a paper-thin edge.
        ceilingGeometry = new THREE.ExtrudeGeometry(ceilingShape, { depth: thickness, bevelEnabled: false, steps: 1 });
        // The sunlit opening surfaces keep their brightness when indoor lighting changes.
        const reveal = new THREE.MeshBasicMaterial({ color: materials.ceiling.color.clone(),
            side: THREE.FrontSide, toneMapped: false });
        ceilingMaterial = [materials.ceiling, reveal];
    } else ceilingGeometry = new THREE.ShapeGeometry(ceilingShape);
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = ceilingY + thickness;
    scene.add(ceiling);
    let skylightLip = null;
    if (skylight?.lip && skylight.lipWidth > 0 && skylight.lipThickness > 0) {
        const bounds = outlineBounds(outline);
        const size = skylight.width;
        const width = Math.min(skylight.lipWidth, (Math.min(bounds.width, bounds.depth) - size) / 2);
        const depth = skylight.lipThickness;
        const material = new THREE.MeshStandardMaterial({ color: skylight.lipColor, roughness: 0.85 });
        skylightLip = new THREE.Group();
        skylightLip.name = "skylight-trim-lip";
        // Four thin strips sit just below the ceiling, outside the clear opening.
        for (const sign of [-1, 1]) {
            const horizontal = new THREE.Mesh(new THREE.BoxGeometry(size + width * 2, depth, width), material);
            horizontal.position.set(0, ceilingY - depth / 2, sign * (size + width) / 2);
            skylightLip.add(horizontal);
            const vertical = new THREE.Mesh(new THREE.BoxGeometry(width, depth, size), material);
            vertical.position.set(sign * (size + width) / 2, ceilingY - depth / 2, 0);
            skylightLip.add(vertical);
        }
        scene.add(skylightLip);
    }
    let wallMeshes = [];
    if (wallClick) {
        wallMeshes = wallClick.addWallsFromOutline(outline, {
            material: materials.wall,
            height: roomHeight,
            y: wallCenterY,
        });
    }
    if (cornerLines !== false) {
        const color = typeof cornerLines === "number" ? cornerLines : 0x111111;
        const vert = addVerticalCornerLinesFromOutline(scene, outline, roomHeight, color, floorY);
        const horiz = horizontalLines ? addHorizontalEdgeLinesFromOutline(scene, outline, roomHeight, color, floorY) : null;
        if (roomLights) {
            if (vert?.material)
                roomLights.registerUnlit(vert.material, offLineColor);
            if (horiz?.material)
                roomLights.registerUnlit(horiz.material, offLineColor);
        }
        if (skylight) {
            const half = skylight.width / 2;
            const lipWidth = skylightLip ? Math.min(skylight.lipWidth, (Math.min(outlineBounds(outline).width, outlineBounds(outline).depth) - skylight.width) / 2) : 0;
            const bottom = ceilingY - (skylightLip ? skylight.lipThickness : 0);
            const top = ceilingY + thickness;
            const points = [];
            const verticalPoints = [];
            const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];
            const segment = (a, b) => points.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
            // Outline the opening and its vertical corners without seams between the trim strips.
            corners.forEach(([x, z], i) => {
                const [nx, nz] = corners[(i + 1) % corners.length];
                // Keep the inside vertical corners separate from the subtle trim outlines.
                verticalPoints.push(new THREE.Vector3(x, bottom, z), new THREE.Vector3(x, top, z));
                segment([x, top, z], [nx, top, nz]);
                segment([x, bottom, z], [nx, bottom, nz]);
                if (skylightLip) {
                    const ox = Math.sign(x) * (half + lipWidth);
                    const oz = Math.sign(z) * (half + lipWidth);
                    segment([ox, bottom, oz], [Math.sign(nx) * (half + lipWidth), bottom, Math.sign(nz) * (half + lipWidth)]);
                    segment([ox, bottom, oz], [ox, ceilingY, oz]);
                }
            });
            const addEdges = (vertices, name, onColor, offColor) => {
                const material = new THREE.LineBasicMaterial({ color: onColor, depthTest: true });
                const edges = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(vertices), material);
                edges.name = name;
                scene.add(edges);
                roomLights?.registerUnlit(material, offColor);
            };
            addEdges(points, "skylight-edge-lines", skylight.lipEdgeColor ?? 0xd8d8d8, skylight.lipOffEdgeColor ?? 0xc8c8c8);
            addEdges(verticalPoints, "skylight-vertical-lines", skylight.edgeColor ?? color, skylight.offEdgeColor ?? offLineColor);
        }
    }
    let moldingMaterial = null;
    if (molding !== false) {
        const color = typeof molding === "number" ? molding : undefined;
        moldingMaterial = addHallMolding(scene, outline, roomHeight, color, floorY);
    }
    const bounds = outlineBounds(outline);
    const walls = wallsFromOutline(outline, wallInset);
    return {
        outline,
        height: roomHeight,
        floorY,
        ceilingY,
        roomHalfY,
        floor,
        ceiling,
        skylightLip,
        moldingMaterial,
        wallMeshes,
        bounds,
        walls,
        wallInset,
    };
};

export const DEFAULT_GALLERY_DOOR_HEIGHT = 4;
export const DEFAULT_ART_HEIGHT_FROM_FLOOR = 2.4;
export const DEFAULT_CAMERA_HEIGHT_FROM_FLOOR = 3;

export const placeOnWall = (mesh, wall, x, y, halfW, bounds, wallInset = 0.05, { heightFromFloor, floorY, clamp = "edges" } = {}) => {
    let worldY = y;
    if (heightFromFloor != null) {
        if (floorY == null) {
            console.warn("placeOnWall: heightFromFloor requires floorY");
            return false;
        }
        worldY = floorY + heightFromFloor;
    }
    if (worldY == null || Number.isNaN(worldY)) {
        console.warn("placeOnWall: need y, or heightFromFloor with floorY");
        return false;
    }
    const halfX = bounds.halfX ?? bounds.width / 2;
    const halfZ = bounds.halfZ ?? bounds.depth / 2;
    const span = wall === "north" || wall === "south" ? halfX : halfZ;
    const maxX = clamp === "center" ? span : span - halfW;
    const lx = maxX < 0 ? 0 : Math.max(-maxX, Math.min(maxX, x));
    const cx = bounds.centerX ?? 0;
    const cz = bounds.centerZ ?? 0;
    if (wall === "north") {
        mesh.position.set(cx + lx, worldY, bounds.minZ + wallInset);
    }
    else if (wall === "south") {
        mesh.position.set(cx + lx, worldY, bounds.maxZ - wallInset);
        mesh.rotation.y = Math.PI;
    }
    else if (wall === "west") {
        mesh.position.set(bounds.minX + wallInset, worldY, cz + lx);
        mesh.rotation.y = Math.PI / 2;
    }
    else if (wall === "east") {
        mesh.position.set(bounds.maxX - wallInset, worldY, cz + lx);
        mesh.rotation.y = -Math.PI / 2;
    }
    else {
        console.warn("Invalid wall:", wall);
        return false;
    }
    return true;
};

const DOOR_LABEL_RIGHT_SIGN = {
    north: 1,
    south: -1,
    west: -1,
    east: 1,
};

export const roomNumberFromPath = (path) => {
    if (!path || typeof path !== "string")
        return null;
    const clean = path.split("?")[0].split("#")[0];
    const file = clean.split("/").pop() || "";
    const m = file.match(/^(\d+)\.html$/i);
    return m ? m[1] : null;
};

export const resolveDoorRoomLabel = (explicit, href) => {
    if (explicit != null && String(explicit).length)
        return String(explicit);
    const pagePath = typeof location !== "undefined" ? location.pathname : "";
    const fromPage = roomNumberFromPath(pagePath);
    const fromHref = roomNumberFromPath(href);
    const isHubPath = !pagePath ||
        /\/$/.test(pagePath) ||
        /\/index\.html$/i.test(pagePath);
    const isCentralHall = fromPage === "7";
    const isHallway = isHubPath || isCentralHall || fromPage == null;
    if (isHallway)
        return fromHref || fromPage;
    return fromPage || fromHref;
};

export const addDoorRoomLabel = ({ scene, wall, doorAlong, doorWidth, doorHeight, roomHalfY, bounds, wallInset = 0.05, label, } = {}) => {
    const BOX_W = 0.28;
    const BOX_H = 0.36;
    const BOX_D = 0.05;
    const BOX_COLOR = 0xe4e4e4;
    const FONT_COLOR = "#111111";
    const FONT_SIZE_PX = 152;
    const FONT_FAMILY = "Georgia, 'Times New Roman', Times, serif";
    const GAP_FROM_DOOR = 0.08;
    const INSET_FROM_DOOR_TOP = 0.06;
    const WALL_FLUSH_PULL = 0.05;
    const CANVAS_SIZE = 256;
    if (!scene || !bounds || label == null || label === "")
        return null;
    const text = String(label);
    const right = DOOR_LABEL_RIGHT_SIGN[wall] ?? 1;
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return null;
    ctx.fillStyle = `#${BOX_COLOR.toString(16).padStart(6, "0")}`;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = FONT_COLOR;
    ctx.font = `600 ${FONT_SIZE_PX}px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - FONT_SIZE_PX * 0.06);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearFilter;
    map.needsUpdate = true;
    const sideMat = new THREE.MeshStandardMaterial({ color: BOX_COLOR });
    const faceMat = new THREE.MeshStandardMaterial({
        map,
        color: 0xffffff,
        roughness: 0.85,
        metalness: 0,
    });
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D), [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat]);
    const along = doorAlong + right * (doorWidth / 2 + GAP_FROM_DOOR + BOX_W / 2);
    const worldY = -roomHalfY + doorHeight - INSET_FROM_DOOR_TOP - BOX_H / 2;
    if (!placeOnWall(plaque, wall, along, worldY, BOX_W / 2, bounds, wallInset)) {
        map.dispose();
        faceMat.dispose();
        sideMat.dispose();
        plaque.geometry.dispose();
        return null;
    }
    const out = BOX_D / 2 - WALL_FLUSH_PULL;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(plaque.quaternion);
    plaque.position.addScaledVector(forward, out);
    plaque.userData.isDoorLabel = true;
    plaque.userData.label = text;
    scene.add(plaque);
    return plaque;
};

export const createAddWallDoor = ({ scene, textureLoader, roomHalfY, roomHeight, clickable, bounds, wallInset = 0.05, }) => {
    return (wall, imageFile, doorHeight, { href = null, locked = true, bright = false, glow = 0.5, x = 0, isLabelled = false, label = null, width = null, } = {}) => {
        return new Promise((resolve, reject) => {
            textureLoader.load(imageFile, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                const aspect = tex.image.width / tex.image.height;
                const imageWidth = width ?? doorHeight * aspect;
                const imageHeight = Math.min(doorHeight, roomHeight);
                const material = bright
                    ? new THREE.MeshStandardMaterial({
                        map: tex,
                        color: 0xffffff,
                        emissive: 0xffffff,
                        emissiveMap: tex,
                        emissiveIntensity: glow,
                        toneMapped: false,
                    })
                    : new THREE.MeshStandardMaterial({ map: tex });
                const door = new THREE.Mesh(new THREE.PlaneGeometry(imageWidth, imageHeight), material);
                const ly = -roomHalfY + imageHeight / 2;
                if (!placeOnWall(door, wall, x, ly, imageWidth / 2, bounds, wallInset)) {
                    resolve(null);
                    return;
                }
                door.userData.isDoor = true;
                door.userData.wall = wall;
                door.userData.locked = locked;
                door.userData.href = href;
                clickable.push(door);
                scene.add(door);
                if (isLabelled) {
                    const plaque = resolveDoorRoomLabel(label, href);
                    if (plaque) {
                        addDoorRoomLabel({
                            scene,
                            wall,
                            doorAlong: x,
                            doorWidth: imageWidth,
                            doorHeight: imageHeight,
                            roomHalfY,
                            bounds,
                            wallInset,
                            label: plaque,
                        });
                    }
                }
                resolve(door);
            }, undefined, () => reject(new Error("Could not load door texture: " + imageFile)));
        });
    };
};

export const createAddWallImage = ({ scene, textureLoader, roomHalfY, floorY = -roomHalfY, ceilingY = roomHalfY, heightFromFloor = DEFAULT_ART_HEIGHT_FROM_FLOOR, clickable, bounds, wallInset = 0.05, }) => {
    return (wall, x, imageFile, imageWidth, { heightFromFloor: heightFromFloorOpt } = {}) => {
        textureLoader.load(imageFile, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const aspect = tex.image.width / tex.image.height;
            const imageHeight = imageWidth / aspect;
            const art = new THREE.Mesh(new THREE.PlaneGeometry(imageWidth, imageHeight), new THREE.MeshStandardMaterial({
                map: tex,
                transparent: true,
                alphaTest: 0.1,
                depthWrite: true,
            }));
            const roomH = ceilingY - floorY;
            const minHff = imageHeight / 2;
            const maxHff = roomH - imageHeight / 2;
            const hff = Math.max(minHff, Math.min(maxHff, heightFromFloorOpt ?? heightFromFloor));
            if (!placeOnWall(art, wall, x, null, imageWidth / 2, bounds, wallInset, { heightFromFloor: hff, floorY })) {
                return;
            }
            art.userData.imageFile = imageFile;
            clickable.push(art);
            scene.add(art);
        });
    };
};

export const DEFAULT_USER_ART_WIDTH = 1.6;

export const hitToWallPlacement = (info, { floorY, bounds } = {}) => {
    if (!info?.world || floorY == null)
        return null;
    if (info.wall === "ceiling" || info.wall === "floor")
        return null;
    let wall = info.wall;
    if (bounds) {
        const { minX, maxX, minZ, maxZ } = bounds;
        const wx = info.world.x;
        const wz = info.world.z;
        const dN = Math.abs(wz - minZ);
        const dS = Math.abs(wz - maxZ);
        const dW = Math.abs(wx - minX);
        const dE = Math.abs(wx - maxX);
        const nearest = Math.min(dN, dS, dW, dE);
        if (nearest === dN)
            wall = "north";
        else if (nearest === dS)
            wall = "south";
        else if (nearest === dW)
            wall = "west";
        else
            wall = "east";
    }
    if (typeof wall !== "string")
        return null;
    const cx = bounds?.centerX ?? 0;
    const cz = bounds?.centerZ ?? 0;
    const x = wall === "north" || wall === "south"
        ? info.world.x - cx
        : info.world.z - cz;
    return {
        wall,
        x,
        heightFromFloor: info.world.y - floorY,
    };
};

const resolveUserImageSource = (imageSource) => {
    if (typeof imageSource === "string") {
        return {
            url: imageSource,
            displayName: imageSource.startsWith("blob:")
                ? "uploaded image"
                : imageSource.split("/").pop() || null,
        };
    }
    if (typeof Blob !== "undefined" && imageSource instanceof Blob) {
        const name = typeof File !== "undefined" &&
            imageSource instanceof File &&
            imageSource.name
            ? imageSource.name
            : "uploaded image";
        return { url: URL.createObjectURL(imageSource), displayName: name };
    }
    console.warn("resolveUserImageSource: unsupported image source", imageSource);
    return { url: "", displayName: null };
};

export const createAddUserWallImage = ({ scene, textureLoader, roomHalfY, floorY = -roomHalfY, ceilingY = roomHalfY, heightFromFloor = DEFAULT_ART_HEIGHT_FROM_FLOOR, clickable, bounds, wallInset = 0.05, }) => {
    return (wall, x, imageSource, imageWidth = DEFAULT_USER_ART_WIDTH, { heightFromFloor: heightFromFloorOpt } = {}) => {
        const { url, displayName } = resolveUserImageSource(imageSource);
        if (!url)
            return Promise.resolve(null);
        return new Promise((resolve) => {
            textureLoader.load(url, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                const aspect = tex.image.width / tex.image.height;
                const imageHeight = imageWidth / aspect;
                const art = new THREE.Mesh(new THREE.PlaneGeometry(imageWidth, imageHeight), new THREE.MeshStandardMaterial({
                    map: tex,
                    transparent: true,
                    alphaTest: 0.1,
                    depthWrite: true,
                }));
                const roomH = ceilingY - floorY;
                const hffRaw = heightFromFloorOpt ?? heightFromFloor;
                const hff = Math.max(0, Math.min(roomH, hffRaw));
                if (!placeOnWall(art, wall, x, null, imageWidth / 2, bounds, wallInset, { heightFromFloor: hff, floorY, clamp: "center" })) {
                    resolve(null);
                    return;
                }
                const halfX = bounds.halfX ?? bounds.width / 2;
                const halfZ = bounds.halfZ ?? bounds.depth / 2;
                const maxAlong = wall === "north" || wall === "south" ? halfX : halfZ;
                const xClamped = maxAlong < 0
                    ? 0
                    : Math.max(-maxAlong, Math.min(maxAlong, x));
                const uX = maxAlong > 1e-6
                    ? (xClamped + maxAlong) / (2 * maxAlong)
                    : 0.5;
                const uY = roomH > 1e-6 ? hff / roomH : 0.5;
                art.userData.imageFile = url;
                art.userData.imageName = displayName;
                art.userData.isUserArt = true;
                art.userData.artWidth = imageWidth;
                art.userData.aspect = aspect;
                art.userData.placement = {
                    wall,
                    x: xClamped,
                    heightFromFloor: hff,
                    uX,
                    uY,
                };
                clickable.push(art);
                scene.add(art);
                resolve(art);
            }, undefined, () => {
                console.warn("addUserWallImage: failed to load", displayName || url);
                resolve(null);
            });
        });
    };
};

export const userArtTravelLimits = ({ wall, bounds, floorY, ceilingY }) => {
    const halfX = bounds.halfX ?? bounds.width / 2;
    const halfZ = bounds.halfZ ?? bounds.depth / 2;
    const maxAlong = wall === "north" || wall === "south" ? halfX : halfZ;
    return {
        maxAlong: Math.max(0, maxAlong),
        roomH: Math.max(0, ceilingY - floorY),
    };
};

const clamp01 = (t) => Math.max(0, Math.min(1, t));

export const updateUserArtPlacement = (art, patch = {}, { bounds, floorY, ceilingY, wallInset = 0.05 } = {}) => {
    if (!art?.userData?.isUserArt || !art.userData.placement)
        return false;
    if (bounds == null || floorY == null || ceilingY == null)
        return false;
    const aspect = art.userData.aspect;
    if (!(aspect > 0))
        return false;
    const placement = art.userData.placement;
    const wall = placement.wall;
    const width = patch.width != null ? patch.width : art.userData.artWidth;
    if (!(width > 0))
        return false;
    const { maxAlong, roomH } = userArtTravelLimits({
        wall,
        bounds,
        floorY,
        ceilingY,
    });
    let uX = patch.uX;
    let uY = patch.uY;
    if (uX == null) {
        uX =
            placement.uX != null
                ? placement.uX
                : maxAlong > 1e-6
                    ? (placement.x + maxAlong) / (2 * maxAlong)
                    : 0.5;
    }
    if (uY == null) {
        uY =
            placement.uY != null
                ? placement.uY
                : roomH > 1e-6
                    ? placement.heightFromFloor / roomH
                    : 0.5;
    }
    uX = clamp01(uX);
    uY = clamp01(uY);
    const x = -maxAlong + uX * (2 * maxAlong);
    const hff = uY * roomH;
    const imageHeight = width / aspect;
    if (width !== art.userData.artWidth) {
        art.geometry.dispose();
        art.geometry = new THREE.PlaneGeometry(width, imageHeight);
    }
    if (!placeOnWall(art, wall, x, null, width / 2, bounds, wallInset, {
        heightFromFloor: hff,
        floorY,
        clamp: "center",
    })) {
        return false;
    }
    art.userData.artWidth = width;
    art.userData.placement = {
        wall,
        x,
        heightFromFloor: hff,
        uX,
        uY,
    };
    return true;
};

export const setUserArtWidth = (art, width, ctx) => {
    return updateUserArtPlacement(art, { width }, ctx);
};

const USER_ART_DB_NAME = "y9k-user-art";
const USER_ART_DB_VERSION = 1;

const newPlacementId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `art-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const idbRequest = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
});

const idbTxDone = (tx) => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
});

export const createLocalPlacementStore = ({ dbName = USER_ART_DB_NAME } = {}) => {
    let dbPromise = null;
    const openDb = () => {
        if (dbPromise)
            return dbPromise;
        if (typeof indexedDB === "undefined") {
            return Promise.reject(new Error("IndexedDB is not available"));
        }
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, USER_ART_DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("placements")) {
                    const placements = db.createObjectStore("placements", {
                        keyPath: "id",
                    });
                    placements.createIndex("roomId", "roomId", { unique: false });
                }
                if (!db.objectStoreNames.contains("blobs")) {
                    db.createObjectStore("blobs", { keyPath: "id" });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error("Failed to open user-art DB"));
        });
        return dbPromise;
    };
    return {
        async list(roomId) {
            const db = await openDb();
            const tx = db.transaction("placements", "readonly");
            const index = tx.objectStore("placements").index("roomId");
            const rows = await idbRequest(index.getAll(roomId));
            await idbTxDone(tx);
            return Array.isArray(rows) ? rows : [];
        },

        async getBlob(id) {
            const db = await openDb();
            const tx = db.transaction("blobs", "readonly");
            const row = await idbRequest(tx.objectStore("blobs").get(id));
            await idbTxDone(tx);
            return row?.blob instanceof Blob ? row.blob : null;
        },

        async put({ placement, blob }) {
            if (!placement?.id || !(blob instanceof Blob)) {
                throw new Error("placement store put: placement.id and blob required");
            }
            const db = await openDb();
            const tx = db.transaction(["placements", "blobs"], "readwrite");
            tx.objectStore("placements").put(placement);
            tx.objectStore("blobs").put({ id: placement.id, blob });
            await idbTxDone(tx);
        },

        async updateMeta(id, partial) {
            const db = await openDb();
            const tx = db.transaction("placements", "readwrite");
            const store = tx.objectStore("placements");
            const existing = await idbRequest(store.get(id));
            if (!existing) {
                await idbTxDone(tx);
                return false;
            }
            store.put({
                ...existing,
                ...partial,
                id,
                updatedAt: Date.now(),
            });
            await idbTxDone(tx);
            return true;
        },

        async remove(id) {
            const db = await openDb();
            const tx = db.transaction(["placements", "blobs"], "readwrite");
            tx.objectStore("placements").delete(id);
            tx.objectStore("blobs").delete(id);
            await idbTxDone(tx);
        },
    };
};

const placementWorldFromUV = (wall, uX, uY, { bounds, floorY, ceilingY }) => {
    const { maxAlong, roomH } = userArtTravelLimits({
        wall,
        bounds,
        floorY,
        ceilingY,
    });
    const uu = clamp01(uX ?? 0.5);
    const vv = clamp01(uY ?? 0.5);
    return {
        x: -maxAlong + uu * (2 * maxAlong),
        heightFromFloor: vv * roomH,
        uX: uu,
        uY: vv,
    };
};

export const createUserArtSession = ({ store, roomId, addUserWallImage, clickable, bounds, floorY, ceilingY, wallInset = 0.05, }) => {
    const placeCtx = { bounds, floorY, ceilingY, wallInset };
    const metaFromArt = (art, id, createdAt) => {
        const p = art.userData.placement;
        const now = Date.now();
        return {
            id,
            roomId,
            wall: p.wall,
            width: art.userData.artWidth,
            uX: p.uX,
            uY: p.uY,
            imageName: art.userData.imageName || null,
            createdAt: createdAt ?? art.userData.createdAt ?? now,
            updatedAt: now,
        };
    };
    return {
        roomId,
        store,

        async hydrate() {
            if (!store || !roomId || typeof addUserWallImage !== "function") {
                return [];
            }
            let rows = [];
            try {
                rows = await store.list(roomId);
            }
            catch (err) {
                console.warn("user art hydrate: list failed", err);
                return [];
            }
            rows = [...rows].sort((a, b) => (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0));
            const meshes = [];
            for (const row of rows) {
                if (!row?.id || !row.wall)
                    continue;
                let blob = null;
                try {
                    blob = await store.getBlob(row.id);
                }
                catch (err) {
                    console.warn("user art hydrate: getBlob failed", row.id, err);
                    continue;
                }
                if (!blob) {
                    console.warn("user art hydrate: missing blob for", row.id);
                    continue;
                }
                const { x, heightFromFloor, uX, uY } = placementWorldFromUV(row.wall, row.uX, row.uY, placeCtx);
                const url = URL.createObjectURL(blob);
                try {
                    const art = await addUserWallImage(row.wall, x, url, row.width || DEFAULT_USER_ART_WIDTH, { heightFromFloor });
                    if (!art) {
                        URL.revokeObjectURL(url);
                        continue;
                    }
                    art.userData.placementId = row.id;
                    art.userData.createdAt = row.createdAt;
                    if (row.imageName)
                        art.userData.imageName = row.imageName;
                    updateUserArtPlacement(art, { width: row.width, uX, uY }, placeCtx);
                    meshes.push(art);
                }
                catch (err) {
                    console.warn("user art hydrate: place failed", row.id, err);
                    try {
                        URL.revokeObjectURL(url);
                    }
                    catch (_) { }
                }
            }
            return meshes;
        },

        async remember(art, blob) {
            if (!art?.userData?.isUserArt || !(blob instanceof Blob))
                return null;
            const id = art.userData.placementId || newPlacementId();
            art.userData.placementId = id;
            const placement = metaFromArt(art, id, art.userData.createdAt);
            art.userData.createdAt = placement.createdAt;
            await store.put({ placement, blob });
            return placement;
        },

        async sync(art) {
            const id = art?.userData?.placementId;
            if (!id || !art.userData?.placement)
                return false;
            return store.updateMeta(id, {
                wall: art.userData.placement.wall,
                width: art.userData.artWidth,
                uX: art.userData.placement.uX,
                uY: art.userData.placement.uY,
                imageName: art.userData.imageName || null,
            });
        },

        async forget(art) {
            const id = art?.userData?.placementId;
            removeUserWallImage(art, { clickable });
            if (id) {
                try {
                    await store.remove(id);
                }
                catch (err) {
                    console.warn("user art forget: remove failed", id, err);
                }
            }
            return true;
        },

        async forgetAll() {
            let rows = [];
            try {
                rows = await store.list(roomId);
            }
            catch (err) {
                console.warn("user art forgetAll: list failed", err);
                rows = [];
            }
            const meshes = Array.isArray(clickable)
                ? clickable.filter((o) => o?.userData?.isUserArt)
                : [];
            for (const mesh of [...meshes]) {
                removeUserWallImage(mesh, { clickable });
            }
            let removed = 0;
            for (const row of rows) {
                if (!row?.id)
                    continue;
                try {
                    await store.remove(row.id);
                    removed += 1;
                }
                catch (err) {
                    console.warn("user art forgetAll: remove failed", row.id, err);
                }
            }
            return removed;
        },
    };
};

export const removeUserWallImage = (art, { clickable } = {}) => {
    if (!art?.userData?.isUserArt)
        return false;
    if (Array.isArray(clickable)) {
        const i = clickable.indexOf(art);
        if (i >= 0)
            clickable.splice(i, 1);
    }
    if (art.parent)
        art.parent.remove(art);
    const url = art.userData.imageFile;
    if (typeof url === "string" && url.startsWith("blob:")) {
        try {
            URL.revokeObjectURL(url);
        }
        catch (_) { }
    }
    const mat = art.material;
    if (mat) {
        if (mat.map)
            mat.map.dispose();
        mat.dispose();
    }
    if (art.geometry)
        art.geometry.dispose();
    art.userData.isUserArt = false;
    return true;
};

export const initDevWallUpload = ({ wallClick, addUserWallImage, clickable, session = null, floorY, ceilingY, bounds, wallInset = 0.05, stage, defaultWidth = DEFAULT_USER_ART_WIDTH, minWidth = 0.5, maxWidth = 20, playAppearSfx = null, } = {}) => {
    const empty = {
        panel: null,
        button: null,
        deleteButton: null,
        input: null,
        slider: null,
        xSlider: null,
        ySlider: null,
        ready: Promise.resolve(),
    };
    const host = stage || document.getElementById("stage");
    if (!host || !wallClick || typeof addUserWallImage !== "function") {
        console.warn("initDevWallUpload: missing stage, wallClick, or addUserWallImage");
        return empty;
    }
    if (ceilingY == null) {
        console.warn("initDevWallUpload: ceilingY is required for resize");
        return empty;
    }
    const placeCtx = { bounds, floorY, ceilingY, wallInset };
    let panel = document.getElementById("dev-wall-upload-panel");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "dev-wall-upload-panel";
        host.appendChild(panel);
    }
    let actions = document.getElementById("dev-wall-upload-actions");
    if (!actions) {
        actions = document.createElement("div");
        actions.id = "dev-wall-upload-actions";
        panel.appendChild(actions);
    }
    let button = document.getElementById("dev-wall-upload");
    if (!button) {
        button = document.createElement("button");
        button.id = "dev-wall-upload";
        button.type = "button";
        button.textContent = "place image";
        actions.appendChild(button);
    }
    else if (button.parentElement !== actions) {
        actions.appendChild(button);
    }
    let deleteButton = document.getElementById("dev-wall-upload-delete");
    if (!deleteButton) {
        deleteButton = document.createElement("button");
        deleteButton.id = "dev-wall-upload-delete";
        deleteButton.type = "button";
        deleteButton.textContent = "delete image";
        actions.appendChild(deleteButton);
    }
    else if (deleteButton.parentElement !== actions) {
        actions.appendChild(deleteButton);
    }
    const ensureSliderRow = (rowId, sliderId, labelId, { min, max, step, prefix }) => {
        let row = document.getElementById(rowId);
        if (!row) {
            row = document.createElement("div");
            row.id = rowId;
            row.className = "dev-wall-upload-slider-row";
            panel.appendChild(row);
        }
        else {
            row.classList.add("dev-wall-upload-slider-row");
        }
        let nameEl = row.querySelector(".dev-wall-upload-slider-name");
        if (!nameEl) {
            nameEl = document.createElement("span");
            nameEl.className = "dev-wall-upload-slider-name";
            nameEl.textContent = prefix;
            row.insertBefore(nameEl, row.firstChild);
        }
        else {
            nameEl.textContent = prefix;
        }
        let range = document.getElementById(sliderId);
        if (!range) {
            range = document.createElement("input");
            range.id = sliderId;
            range.type = "range";
            range.min = String(min);
            range.max = String(max);
            range.step = String(step);
            row.appendChild(range);
        }
        else {
            range.min = String(min);
            range.max = String(max);
            range.step = String(step);
        }
        let label = document.getElementById(labelId);
        if (!label) {
            label = document.createElement("span");
            label.id = labelId;
            label.className = "dev-wall-upload-slider-label";
            row.appendChild(label);
        }
        return { row, range, label };
    };
    const legacySizeRow = document.getElementById("dev-wall-upload-size-row");
    if (legacySizeRow && !legacySizeRow.classList.contains("dev-wall-upload-slider-row")) {
        legacySizeRow.className = "dev-wall-upload-slider-row";
    }
    const size = ensureSliderRow("dev-wall-upload-size-row", "dev-wall-upload-size", "dev-wall-upload-size-label", { min: minWidth, max: maxWidth, step: 0.05, prefix: "size" });
    const posX = ensureSliderRow("dev-wall-upload-x-row", "dev-wall-upload-x", "dev-wall-upload-x-label", { min: 0, max: 100, step: 1, prefix: "x" });
    const posY = ensureSliderRow("dev-wall-upload-y-row", "dev-wall-upload-y", "dev-wall-upload-y-label", { min: 0, max: 100, step: 1, prefix: "y" });
    let resetButton = document.getElementById("dev-wall-upload-reset");
    if (!resetButton) {
        resetButton = document.createElement("button");
        resetButton.id = "dev-wall-upload-reset";
        resetButton.type = "button";
        resetButton.textContent = "reset art";
        panel.appendChild(resetButton);
    }
    else {
        panel.appendChild(resetButton);
    }
    const slider = size.range;
    const xSlider = posX.range;
    const ySlider = posY.range;
    let input = document.getElementById("dev-wall-upload-input");
    if (!input) {
        input = document.createElement("input");
        input.id = "dev-wall-upload-input";
        input.type = "file";
        input.accept = "image/*";
        input.hidden = true;
        panel.appendChild(input);
    }
    let lastArt = null;
    let syncTimer = null;
    const fmtWidth = (w) => `${Number(w).toFixed(2)}m`;
    const fmtPct = (v) => `${Math.round(Number(v))}%`;
    const syncLabels = () => {
        size.label.textContent = fmtWidth(slider.value);
        posX.label.textContent = fmtPct(xSlider.value);
        posY.label.textContent = fmtPct(ySlider.value);
    };
    const syncPosFromArt = (art) => {
        if (!art?.userData?.placement)
            return;
        const { uX = 0.5, uY = 0.5 } = art.userData.placement;
        xSlider.value = String(Math.round(clamp01(uX) * 100));
        ySlider.value = String(Math.round(clamp01(uY) * 100));
    };
    const scheduleSync = () => {
        if (!session || !lastArt)
            return;
        if (syncTimer)
            clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            session.sync(lastArt).catch((err) => {
                console.warn("user art sync failed", err);
            });
        }, 120);
    };
    const syncEnabled = () => {
        const hasHit = !!wallClick.getLastHit?.();
        const on = isDevMode() && hasHit;
        button.disabled = !on;
        button.title = !isDevMode()
            ? "enter developer mode"
            : hasHit
                ? "place an image at the crosshair"
                : "click a wall first";
        button.setAttribute("aria-label", button.title);
        const canDelete = isDevMode() && !!lastArt;
        deleteButton.disabled = !canDelete;
        deleteButton.title = canDelete
            ? "delete last placed image from the room and IndexedDB"
            : "place an image first";
        deleteButton.setAttribute("aria-label", deleteButton.title);
        resetButton.disabled = !isDevMode();
        resetButton.title = isDevMode()
            ? "remove all uploaded art in this room from the scene and IndexedDB"
            : "enter developer mode";
        resetButton.setAttribute("aria-label", resetButton.title);
        const sizeOn = isDevMode();
        slider.disabled = !sizeOn;
        size.row.classList.toggle("is-disabled", !sizeOn);
        slider.title = lastArt
            ? "resize last placed image (also size for next place)"
            : "size for next placed image";
        const posOn = isDevMode() && !!lastArt;
        for (const { row, range, title } of [
            {
                row: posX.row,
                range: xSlider,
                title: "horizontal position on wall",
            },
            {
                row: posY.row,
                range: ySlider,
                title: "vertical position on wall",
            },
        ]) {
            range.disabled = !posOn;
            row.classList.toggle("is-disabled", !posOn);
            range.title = posOn ? title : "place an image first";
        }
        syncLabels();
    };
    const applyFromSliders = (patch) => {
        if (!lastArt)
            return;
        updateUserArtPlacement(lastArt, patch, placeCtx);
        syncLabels();
        scheduleSync();
    };
    const placeFromFile = (file) => {
        if (!file || !file.type.startsWith("image/")) {
            console.warn("initDevWallUpload: choose an image file");
            return;
        }
        const info = wallClick.getLastHit?.();
        const placement = hitToWallPlacement(info, { floorY, bounds });
        if (!placement) {
            console.warn("initDevWallUpload: click a wall first");
            syncEnabled();
            return;
        }
        const width = Number(slider.value) || defaultWidth;
        addUserWallImage(placement.wall, placement.x, file, width, { heightFromFloor: placement.heightFromFloor }).then(async (art) => {
            if (art) {
                lastArt = art;
                slider.value = String(art.userData.artWidth ?? width);
                syncPosFromArt(art);
                if (typeof playAppearSfx === "function")
                    playAppearSfx();
                if (session) {
                    try {
                        await session.remember(art, file);
                    }
                    catch (err) {
                        console.warn("user art remember failed", err);
                    }
                }
            }
            syncEnabled();
        });
    };
    const deleteLastArt = async () => {
        if (!lastArt)
            return;
        const art = lastArt;
        lastArt = null;
        if (session) {
            try {
                await session.forget(art);
            }
            catch (err) {
                console.warn("user art forget failed", err);
                removeUserWallImage(art, { clickable });
            }
        }
        else {
            removeUserWallImage(art, { clickable });
        }
        syncEnabled();
    };
    const handleArtRemoved = (art) => {
        if (art && lastArt === art)
            lastArt = null;
        syncEnabled();
    };
    const resetAllArt = async () => {
        lastArt = null;
        if (session) {
            try {
                await session.forgetAll();
            }
            catch (err) {
                console.warn("user art reset failed", err);
            }
        }
        else if (Array.isArray(clickable)) {
            for (const mesh of [...clickable.filter((o) => o?.userData?.isUserArt)]) {
                removeUserWallImage(mesh, { clickable });
            }
        }
        syncEnabled();
    };
    button.addEventListener("click", (e) => {
        e.stopPropagation();
        if (button.disabled)
            return;
        input.value = "";
        input.click();
    });
    deleteButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (deleteButton.disabled)
            return;
        deleteLastArt();
    });
    resetButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (resetButton.disabled)
            return;
        resetAllArt();
    });
    input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (file)
            placeFromFile(file);
    });
    const bindSlider = (range, onInput) => {
        range.addEventListener("pointerdown", (e) => e.stopPropagation());
        range.addEventListener("click", (e) => e.stopPropagation());
        range.addEventListener("input", onInput);
    };
    bindSlider(slider, () => {
        syncLabels();
        if (!lastArt)
            return;
        applyFromSliders({ width: Number(slider.value) });
    });
    bindSlider(xSlider, () => {
        applyFromSliders({ uX: Number(xSlider.value) / 100 });
    });
    bindSlider(ySlider, () => {
        applyFromSliders({ uY: Number(ySlider.value) / 100 });
    });
    slider.value = String(defaultWidth);
    xSlider.value = "50";
    ySlider.value = "50";
    syncLabels();
    if (typeof wallClick.onWallPick === "function") {
        wallClick.onWallPick(() => syncEnabled());
    }
    const mo = new MutationObserver(syncEnabled);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    syncEnabled();
    const ready = (async () => {
        if (!session)
            return;
        try {
            const meshes = await session.hydrate();
            if (meshes.length) {
                lastArt = meshes[meshes.length - 1];
                slider.value = String(lastArt.userData.artWidth ?? defaultWidth);
                syncPosFromArt(lastArt);
            }
            syncEnabled();
        }
        catch (err) {
            console.warn("user art hydrate failed", err);
        }
    })();
    return {
        panel,
        button,
        deleteButton,
        resetButton,
        input,
        slider,
        xSlider,
        ySlider,
        ready,
        handleArtRemoved,
        resetAllArt,
    };
};

export const createAddWallVideoScreen = ({ scene, roomHalfY, floorY = -roomHalfY, ceilingY = roomHalfY, heightFromFloor = DEFAULT_ART_HEIGHT_FROM_FLOOR, clickable, bounds, wallInset = 0.05, }) => {
    return (wall, x, screenWidth, { heightFromFloor: heightFromFloorOpt, aspect = 16 / 9, color = 0x1a4cff, bezel = 0.12, bezelBottom, depth = 0.09, frameColor = 0x111111, videoUrl = null, previewSrc = null, previewSpeed = 0.4, conduit = false, } = {}) => {
        const screenHeight = screenWidth / aspect;
        const bottom = bezelBottom ?? bezel * 1.75;
        const frameW = screenWidth + bezel * 2;
        const frameH = screenHeight + bezel + bottom;
        const screenY = (bottom - bezel) / 2;
        const monitor = new THREE.Group();
        monitor.userData.isVideoScreen = true;
        monitor.userData.videoUrl = videoUrl;
        const frameMat = new THREE.MeshStandardMaterial({
            color: frameColor,
            roughness: 0.85,
            metalness: 0.05,
        });
        const frame = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, depth), frameMat);
        frame.position.z = depth / 2;
        frame.userData.isVideoScreen = true;
        frame.userData.videoUrl = videoUrl;
        monitor.add(frame);
        let screenMat = new THREE.MeshBasicMaterial({ color });
        let previewVideo = null;
        if (previewSrc) {
            let src = previewSrc;
            if (/\.gif$/i.test(src)) {
                src = src.replace(/\.gif$/i, "-preview.mp4");
            }
            const video = document.createElement("video");
            video.src = src;
            video.crossOrigin = "anonymous";
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.preload = "auto";
            video.playbackRate = previewSpeed;
            const tex = new THREE.VideoTexture(video);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            screenMat = new THREE.MeshBasicMaterial({ map: tex });
            previewVideo = video;
            const tryPlay = () => {
                video.playbackRate = previewSpeed;
                video.play().catch(() => { });
            };
            video.addEventListener("canplay", tryPlay, { once: true });
            tryPlay();
            runOnFirstPointerDown(tryPlay);
        }
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenWidth, screenHeight), screenMat);
        screen.position.set(0, screenY, depth + 0.002);
        screen.userData.isVideoScreen = true;
        screen.userData.videoUrl = videoUrl;
        monitor.add(screen);
        const ledR = Math.min(0.01, bezel * 0.14);
        const led = new THREE.Mesh(new THREE.SphereGeometry(ledR, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff1a1a }));
        const ledInset = bottom * 0.45;
        led.position.set(frameW / 2 - Math.min(ledInset, bezel * 0.55), -frameH / 2 + ledInset, depth + 0.004);
        led.userData.isVideoScreen = true;
        led.userData.videoUrl = videoUrl;
        monitor.add(led);
        const roomH = ceilingY - floorY;
        const minHff = frameH / 2;
        const maxHff = roomH - frameH / 2;
        const hff = Math.max(minHff, Math.min(maxHff, heightFromFloorOpt ?? heightFromFloor));
        if (!placeOnWall(monitor, wall, x, null, frameW / 2, bounds, wallInset, { heightFromFloor: hff, floorY })) {
            return null;
        }
        if (conduit !== false && conduit != null) {
            const MONITOR_CONDUIT_RADIUS = 0.022;
            const METAL = 0xb4b4b4;
            const MOLDING_OFFWHITE = 0xf7f7f7;
            let conduitColor = METAL;
            if (conduit === "molding")
                conduitColor = MOLDING_OFFWHITE;
            else if (conduit === "metal")
                conduitColor = METAL;
            else if (typeof conduit === "number")
                conduitColor = conduit;
            const bottomOfFrame = -frameH / 2;
            const ly = floorY + hff;
            const floorLocalY = floorY - ly;
            const conduitLen = bottomOfFrame - floorLocalY;
            if (conduitLen > 0) {
                const tube = new THREE.Mesh(new THREE.CylinderGeometry(MONITOR_CONDUIT_RADIUS, MONITOR_CONDUIT_RADIUS, conduitLen, 12), new THREE.MeshStandardMaterial({ color: conduitColor }));
                tube.position.set(0, (bottomOfFrame + floorLocalY) / 2, depth * 0.25);
                monitor.add(tube);
            }
        }
        monitor.userData.previewVideo = previewVideo;
        clickable.push(frame, screen);
        scene.add(monitor);
        return monitor;
    };
};

export const createMusicControls = ({ musicPath, volume = 0.25, musicEntryChance = 0.2, backgroundMusicVolume = 0.10, sfxVolume = 1, lightBuzzPath = null, lightBuzzVolume = 0.2, initialLightsOn = true, toggleEl = document.getElementById("music-toggle"), soundPrefKey = SOUND_PREF_KEY, } = {}) => {
    const readSoundPref = () => {
        try {
            const v = localStorage.getItem(soundPrefKey);
            if (v === null)
                return false;
            return v === "1" || v === "true";
        }
        catch {
            return false;
        }
    };
    const writeSoundPref = (on) => {
        try {
            localStorage.setItem(soundPrefKey, on ? "1" : "0");
        }
        catch (_) { }
    };
    let IS_SOUND_ON = readSoundPref();
    const windPrefKey = "y9k-wind-on";
    let windOn = false;
    try { windOn = localStorage.getItem(windPrefKey) === "1"; } catch { }
    const windListeners = new Set();
    const buzzPrefKey = "y9k-buzz-on";
    let buzzOn = false;
    try { buzzOn = localStorage.getItem(buzzPrefKey) === "1"; } catch { }
    const buzzListeners = new Set();
    const musicPrefKey = "y9k-music-on";
    let musicOn = false;
    try { musicOn = localStorage.getItem(musicPrefKey) === "1"; } catch { }
    const musicListeners = new Set();
    let backgroundMusicAudio = null;
    const soundListeners = new Set();
    let soundGeneration = 0;
    let lightsOn = initialLightsOn;
    let musicAudio = null;
    let lightBuzzAudio = null;
    const audioUnlockers = new Set();
    let sfxContext = null;
    const sfxBuffers = new Map();
    const activeSfx = new Set();
    const ensureSfxContext = () => {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!sfxContext && Context) sfxContext = new Context();
        return sfxContext;
    };
    const loadSfx = path => {
        if (!sfxBuffers.has(path)) {
            const pending = (async () => {
                const context = ensureSfxContext();
                if (!context) return null;
                const response = await fetch(path);
                if (!response.ok) throw new Error(`Sound request failed: HTTP ${response.status} (${path})`);
                return context.decodeAudioData(await response.arrayBuffer());
            })();
            sfxBuffers.set(path, pending);
            pending.catch(() => sfxBuffers.delete(path));
        }
        return sfxBuffers.get(path);
    };
    const preloadSfx = paths => Promise.allSettled(paths.filter(Boolean).map(loadSfx));

    const ensureMusicAudio = () => {
        if (musicAudio)
            return musicAudio;
        musicAudio = new Audio(musicPath);
        musicAudio.loop = true;
        musicAudio.volume = volume;
        return musicAudio;
    };
    // Room music plays once, with a fresh random quiet interval after every completion.
    const musicPauseMin = 2 * 60 * 1000;
    const musicPauseMax = 6 * 60 * 1000;
    let musicDue = Math.random() < musicEntryChance;
    let musicTimer = null;
    let musicStarting = false;
    let musicPageActive = true;
    const clearMusicTimer = () => {
        if (musicTimer !== null) clearTimeout(musicTimer);
        musicTimer = null;
    };
    const scheduleMusic = () => {
        if (musicTimer !== null || !musicPageActive || !IS_SOUND_ON || !musicOn) return;
        const delay = musicPauseMin + Math.random() * (musicPauseMax - musicPauseMin);
        musicTimer = setTimeout(() => {
            musicTimer = null;
            musicDue = true;
            syncBackgroundMusic();
        }, delay);
    };
    const stopBackgroundMusic = () => {
        clearMusicTimer();
        backgroundMusicAudio?.pause();
        musicDue = false;
    };
    const syncBackgroundMusic = async () => {
        if (!musicPageActive || !IS_SOUND_ON || !musicOn) { stopBackgroundMusic(); return; }
        if (musicStarting || (backgroundMusicAudio && !backgroundMusicAudio.paused)) return;
        if (!musicDue) { scheduleMusic(); return; }
        if (!backgroundMusicAudio) {
            backgroundMusicAudio = new Audio(roomAsset("audio/planetarium.mp3"));
            backgroundMusicAudio.loop = false;
            backgroundMusicAudio.volume = backgroundMusicVolume; // Keep music beneath footsteps and door effects.
            backgroundMusicAudio.addEventListener("ended", () => {
                musicDue = false;
                scheduleMusic();
            });
            backgroundMusicAudio.addEventListener("error", () => {
                musicDue = false;
                scheduleMusic();
            });
        }
        musicStarting = true;
        clearMusicTimer();
        try {
            backgroundMusicAudio.currentTime = 0;
            await backgroundMusicAudio.play();
            if (!musicPageActive || !IS_SOUND_ON || !musicOn) stopBackgroundMusic();
            else musicDue = false;
        } catch {
            // If autoplay is blocked, retry this one play on a later gesture; never queue copies.
            if (musicPageActive && IS_SOUND_ON && musicOn) musicDue = true;
        } finally { musicStarting = false; }
    };
    window.addEventListener("pagehide", () => { musicPageActive = false; stopBackgroundMusic(); });
    window.addEventListener("pageshow", event => {
        if (event.persisted) { musicPageActive = true; syncBackgroundMusic(); }
    });
    const ensureLightBuzzAudio = () => {
        if (!lightBuzzPath)
            return null;
        if (lightBuzzAudio)
            return lightBuzzAudio;
        lightBuzzAudio = new Audio(lightBuzzPath);
        lightBuzzAudio.loop = true;
        lightBuzzAudio.volume = lightBuzzVolume;
        return lightBuzzAudio;
    };
    const syncLightBuzz = async () => {
        const a = ensureLightBuzzAudio();
        if (!a)
            return;
        try {
            if (IS_SOUND_ON && buzzOn && lightsOn) {
                if (a.paused)
                    await a.play();
                if (!IS_SOUND_ON || !buzzOn || !lightsOn)
                    a.pause();
            }
            else {
                a.pause();
            }
        }
        catch (_) { }
    };
    const setLightsOn = (on) => {
        lightsOn = !!on;
        syncLightBuzz();
    };
    const syncMusicToggleUi = () => {
        soundListeners.forEach(listener => listener(IS_SOUND_ON));
        if (!toggleEl)
            return;
        toggleEl.textContent = IS_SOUND_ON ? "🔊" : "🔇";
        toggleEl.title = IS_SOUND_ON ? "mute sound" : "play sound";
        toggleEl.setAttribute("aria-label", IS_SOUND_ON ? "mute sound" : "play music");
    };
    const isSoundOn = () => IS_SOUND_ON;
    const activateAudio = async () => {
        if (!IS_SOUND_ON)
            return;
        const startMusic = async () => {
            if (!windOn) { musicAudio?.pause(); return; }
            const a = ensureMusicAudio();
            try {
                if (a.paused)
                    await a.play();
                if (!IS_SOUND_ON || !windOn)
                    a.pause();
            }
            catch (_) { }
        };
        // Resume during the actual gesture, before waiting for any media/network operation.
        const context = ensureSfxContext();
        const resume = context?.state === "suspended" ? context.resume() : Promise.resolve();
        const pending = [resume, startMusic(), syncLightBuzz(), syncBackgroundMusic()];
        for (const unlock of audioUnlockers) {
            try {
                pending.push(Promise.resolve(unlock()));
            }
            catch (_) { }
        }
        await Promise.allSettled(pending);
    };
    const setSoundOn = async on => {
        if (IS_SOUND_ON !== Boolean(on)) soundGeneration++;
        IS_SOUND_ON = Boolean(on);
        writeSoundPref(IS_SOUND_ON);
        syncMusicToggleUi();
        if (IS_SOUND_ON)
            await activateAudio();
        else {
            musicAudio?.pause();
            stopBackgroundMusic();
            for (const source of activeSfx) {
                try { source.stop(); } catch { }
            }
            await syncLightBuzz();
        }
    };
    const setWindOn = async on => {
        windOn = Boolean(on);
        try { localStorage.setItem(windPrefKey, windOn ? "1" : "0"); } catch { }
        windListeners.forEach(listener => listener(windOn));
        if (!windOn) musicAudio?.pause();
        else await activateAudio();
    };
    const setBuzzOn = async on => {
        buzzOn = Boolean(on);
        try { localStorage.setItem(buzzPrefKey, buzzOn ? "1" : "0"); } catch { }
        buzzListeners.forEach(listener => listener(buzzOn));
        if (buzzOn) await activateAudio();
        else await syncLightBuzz();
    };
    const setMusicOn = async on => {
        const enabling = Boolean(on) && !musicOn;
        musicOn = Boolean(on);
        if (enabling) { clearMusicTimer(); musicDue = true; }
        try { localStorage.setItem(musicPrefKey, musicOn ? "1" : "0"); } catch { }
        musicListeners.forEach(listener => listener(musicOn));
        if (musicOn) await activateAudio();
        else await syncBackgroundMusic();
    };
    const toggleMusic = () => setSoundOn(!IS_SOUND_ON);
    if (toggleEl) {
        toggleEl.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleMusic();
        });
    }
    const restore = async () => {
        syncMusicToggleUi();
        await activateAudio();
    };
    const playSfx = async (soundPath, vol = sfxVolume) => {
        if (!IS_SOUND_ON || !soundPath) return;
        const generation = soundGeneration;
        const requestedAt = performance.now();
        const current = () => IS_SOUND_ON && generation === soundGeneration
            && performance.now() - requestedAt <= 200;
        try {
            const context = ensureSfxContext();
            if (context) {
                // Gestures unlock audio; timed effects must never wait for a future gesture.
                if (context.state !== "running") return;
                let timeout;
                let buffer;
                try {
                    buffer = await Promise.race([
                        loadSfx(soundPath),
                        new Promise(resolve => { timeout = setTimeout(() => resolve(null), 200); }),
                    ]);
                } finally { clearTimeout(timeout); }
                // Discard stale loads and requests from before any mute/unmute change.
                if (!current() || !buffer || context.state !== "running") return;
                if (buffer) {
                    // Reuse decoded bytes, but give each footfall its own independent playback source.
                    const source = context.createBufferSource();
                    const gain = context.createGain();
                    source.buffer = buffer;
                    gain.gain.value = Math.max(0, Math.min(1, vol));
                    source.connect(gain);
                    gain.connect(context.destination);
                    return await new Promise(resolve => {
                        activeSfx.add(source);
                        source.onended = () => {
                            activeSfx.delete(source);
                            source.disconnect();
                            gain.disconnect();
                            resolve();
                        };
                        source.start();
                    });
                }
            }
        } catch (error) { console.warn("Sound playback fallback:", soundPath, error); }
        // Retain ordinary audio playback for browsers without Web Audio support.
        if (!current()) return;
        return new Promise(resolve => {
            const audio = new Audio(soundPath);
            audio.volume = vol;
            audio.addEventListener("ended", resolve, { once: true });
            audio.addEventListener("error", () => { console.warn("Sound could not load:", soundPath); resolve(); }, { once: true });
            audio.play().catch(error => { console.warn("Sound playback blocked:", soundPath, error); resolve(); });
        });
    };
    restore();
    const onAudioGesture = () => { activateAudio(); };
    for (const event of ["pointerdown", "click", "keydown"])
        window.addEventListener(event, onAudioGesture, true);
    return {
        // Update playing tracks without restarting them or changing mute preferences.
        setVolume(key, value) {
            if (key === "wind") { volume = value; if (musicAudio) musicAudio.volume = value; }
            if (key === "music") { backgroundMusicVolume = value; if (backgroundMusicAudio) backgroundMusicAudio.volume = value; }
            if (key === "buzz") { lightBuzzVolume = value; if (lightBuzzAudio) lightBuzzAudio.volume = value; }
        },
        ensureMusicAudio,
        isSoundOn,
        setSoundOn,
        setWindOn,
        setMusicOn,

        onMusicChange(listener) {
            musicListeners.add(listener);
            listener(musicOn);
            return () => musicListeners.delete(listener);
        },

        setBuzzOn,

        onBuzzChange(listener) {
            buzzListeners.add(listener);
            listener(buzzOn);
            return () => buzzListeners.delete(listener);
        },

        onWindChange(listener) {
            windListeners.add(listener);
            listener(windOn);
            return () => windListeners.delete(listener);
        },

        onSoundChange(listener) {
            soundListeners.add(listener);
            listener(IS_SOUND_ON);
            return () => soundListeners.delete(listener);
        },

        toggleMusic,
        preloadSfx,
        playSfx,
        restore,
        syncMusicToggleUi,
        setLightsOn,
        syncLightBuzz,
        activateAudio,

        registerAudioUnlock(unlock) {
            audioUnlockers.add(unlock);
            return () => audioUnlockers.delete(unlock);
        },
    };
};

export const bindViewport = ({ camera, renderer, stage, onResize } = {}) => {
    const syncViewportSize = () => {
        const host = stage || document.getElementById("stage");
        const w = Math.max(1, host.clientWidth);
        const h = Math.max(1, host.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        if (typeof onResize === "function")
            onResize();
    };
    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);
    window.addEventListener("orientationchange", () => setTimeout(syncViewportSize, 150));
    const host = stage || document.getElementById("stage");
    if (host) {
        host.addEventListener("fullscreenchange", syncViewportSize);
        host.addEventListener("webkitfullscreenchange", syncViewportSize);
    }
    return syncViewportSize;
};

export const bindWindowedToggle = ({ syncViewportSize } = {}) => {
    const toggleWindowed = () => {
        document.body.classList.toggle("is-windowed");
        if (typeof syncViewportSize === "function")
            syncViewportSize();
    };
    document.addEventListener("keydown", (e) => {
        if (e.key !== "f" && e.key !== "F")
            return;
        if (e.target.closest("input, textarea, [contenteditable]"))
            return;
        e.preventDefault();
        toggleWindowed();
    });
    return toggleWindowed;
};

export const bindOrbitPointer = ({ canvas, camera, clickable, onHit, dragSens = 0.005, dragThreshold = 4, getAngle, setAngle, onRotate = null, } = {}) => {
    let angle = typeof getAngle === "function" ? getAngle() : 0;
    const readAngle = () => typeof getAngle === "function" ? getAngle() : angle;
    const writeAngle = (a) => {
        angle = a;
        if (typeof setAngle === "function")
            setAngle(a);
    };
    let dragging = false;
    let didDrag = false;
    let lastX = 0;
    let totalDrag = 0;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    canvas.style.cursor = "grab";
    // Suppress native long-press selection/menu behavior only on the room canvas.
    canvas.addEventListener("selectstart", event => event.preventDefault());
    canvas.addEventListener("contextmenu", event => event.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 0)
            return;
        dragging = true;
        didDrag = false;
        lastX = e.clientX;
        totalDrag = 0;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", (e) => {
        if (!dragging) {
            const rect = canvas.getBoundingClientRect();
            pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            const hits = raycaster.intersectObjects(clickable);
            canvas.style.cursor = hits.length ? "pointer" : "grab";
            return;
        }
        const dx = e.clientX - lastX;
        totalDrag += Math.abs(dx);
        if (totalDrag > dragThreshold)
            didDrag = true;
        lastX = e.clientX;
        writeAngle(readAngle() + dx * dragSens);
        if (didDrag) onRotate?.(dx * dragSens);
    });
    const endDrag = (e) => {
        if (!dragging)
            return;
        dragging = false;
        canvas.style.cursor = "grab";
        try {
            canvas.releasePointerCapture(e.pointerId);
        }
        catch (_) { }
        if (didDrag || e.type !== "pointerup")
            return;
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(clickable);
        if (!hits.length)
            return;
        if (typeof onHit === "function")
            onHit(hits[0].object);
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("lostpointercapture", endDrag);
    return {
        getAngle: readAngle,
        setAngle: writeAngle,
        isDragging: () => dragging,
        // A long press handled by an editor must not also become a scene click.
        suppressClick: () => { didDrag = true; },
    };
};

const VIEW_FACING_KEY = "y9k-view-facing";

const VIEW_FACINGS = new Set(["north", "south", "east", "west"]);

export const viewFacingToAngle = (facing) => {
    switch (facing) {
        case "north":
            return 0;
        case "south":
            return Math.PI;
        case "east":
            return -Math.PI / 2;
        case "west":
            return Math.PI / 2;
        default:
            return 0;
    }
};

export const readStoredViewFacing = (fallback = "north") => {
    try {
        const v = localStorage.getItem(VIEW_FACING_KEY);
        if (v && VIEW_FACINGS.has(v))
            return v;
    }
    catch (_) { }
    return VIEW_FACINGS.has(fallback) ? fallback : "north";
};

export const writeStoredViewFacing = (facing) => {
    if (!VIEW_FACINGS.has(facing))
        return;
    try {
        localStorage.setItem(VIEW_FACING_KEY, facing);
    }
    catch (_) { }
};

const DEFAULT_DOOR_LOCKED_SOUND = roomAsset("music/door-soft-complete.mp3");
const DEFAULT_DOOR_UNLOCKED_SOUND = roomAsset("music/door-soft-complete.mp3");
const DEFAULT_LIGHT_SWITCH_SOUND = new URL("./assets/rooms/audio/light-switch.wav", import.meta.url).href;
const DEFAULT_PAGE_SFX = roomAsset("music/page-3.mp3");

export const createRoomApp = ({ musicPath, musicVolume = 0.25, musicEntryChance = 0.2, backgroundMusicVolume = 0.10, lightSwitchVolume = 1, doorLockedVolume = 1, doorUnlockedVolume = 1, lightBuzzPath = null, lightBuzzVolume = 0.2, camY = null, orbitRadius = 1.4, lookAtY = null, heightFromFloor = DEFAULT_CAMERA_HEIGHT_FROM_FLOOR, lookAtHeightFromFloor = null, floorY = -DEFAULT_ROOM_HEIGHT / 2, autoSpin = 0.00035, background = 0x111111, enableLightbox = false, enableVideoLightbox = false, lightboxSfxVolume = 1, doorLockedSound = DEFAULT_DOOR_LOCKED_SOUND, doorUnlockedSound = DEFAULT_DOOR_UNLOCKED_SOUND, lightSwitchSound = DEFAULT_LIGHT_SWITCH_SOUND, pageSfx = DEFAULT_PAGE_SFX, ambientLight = 0.05, directionalLight = 0.04, directionalPosition = [1, 3, 2], lightsOn = true, lightColor = 0xffffff, fixtureBrightness = 1, fixtureOffColor = FIXTURE_OFF_COLOR, fixtureOffGlow = 0, offIntensity = { ambient: 0.05, directional: 0.04 }, onHit = null, onFrame = null, onRotate = null, } = {}) => {
    const resolveCamY = (fromFloor, floor) => camY != null ? camY : floor + fromFloor;
    const resolveLookAtY = (fromFloor, lookFromFloor, floor) => lookAtY != null
        ? lookAtY
        : floor + (lookFromFloor ?? fromFloor);
    let viewFloorY = floorY;
    let viewHeightFromFloor = heightFromFloor;
    let viewLookAtHeightFromFloor = lookAtHeightFromFloor;
    let resolvedCamY = resolveCamY(viewHeightFromFloor, viewFloorY);
    let resolvedLookAtY = resolveLookAtY(viewHeightFromFloor, viewLookAtHeightFromFloor, viewFloorY);
    const canvas = document.createElement("canvas");
    const stage = document.getElementById("stage");
    if (!stage)
        throw new Error("createRoomApp: #stage not found");
    stage.appendChild(canvas);
    const music = createMusicControls({
        musicPath,
        volume: musicVolume,
        backgroundMusicVolume,
        musicEntryChance,
        lightBuzzPath,
        lightBuzzVolume,
        initialLightsOn: lightsOn,
    });
    const lightbox = enableLightbox
        ? setupLightbox({ sfxVolume: lightboxSfxVolume })
        : null;
    const videoLightbox = enableVideoLightbox
        ? setupVideoLightbox({ stage })
        : null;
    if (lightbox)
        music.registerAudioUnlock(lightbox.unlockAudio);
    const clickable = [];
    let angle = viewFacingToAngle(readStoredViewFacing("north"));
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    if (background != null) {
        scene.background = new THREE.Color(background);
    }
    const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, resolvedCamY, 0);
    const textureLoader = new THREE.TextureLoader();
    const syncViewportSize = bindViewport({
        camera,
        renderer,
        stage,
        onResize: () => {
            if (lightbox)
                lightbox.remeasure();
        },
    });
    bindWindowedToggle({ syncViewportSize });
    initDevMode({ stage });
    const ambient = new THREE.AmbientLight(lightColor, ambientLight);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(lightColor, directionalLight);
    dir.position.set(...directionalPosition);
    scene.add(dir);
    const roomLights = createRoomLights({
        ambient,
        directional: dir,
        scene,
        isOn: lightsOn,
        offIntensity,
        fixtureBrightness,
        fixtureOffColor,
        fixtureOffGlow,
        fixtureColor: lightColor,
        offBackground: 0x111111,
        onChange: (on) => music.setLightsOn(on),
    });
    music.setLightsOn(lightsOn);
    const defaultOnHit = (obj) => {
        if (obj.userData.isVideoScreen) {
            const url = obj.userData.videoUrl;
            if (url && videoLightbox)
                videoLightbox.open(url);
            return;
        }
        if (obj.userData.isLightSwitch) {
            if (obj.userData.isDisabled !== false) {
                music.playSfx(lightSwitchSound, lightSwitchVolume);
                return;
            }
            roomLights.toggle();
            music.playSfx(lightSwitchSound, lightSwitchVolume);
            return;
        }
        if (obj.userData.isDoor) {
            if (obj.userData.locked) {
                music.playSfx(doorLockedSound, doorLockedVolume);
                return;
            }
            const href = obj.userData.href;
            const wall = obj.userData.wall;
            if (typeof wall === "string")
                writeStoredViewFacing(wall);
            music.playSfx(doorUnlockedSound, doorUnlockedVolume).then(() => {
                if (href)
                    window.location.href = href;
            });
            return;
        }
        if (obj.userData.imageFile && lightbox) {
            lightbox.open(obj.userData.imageFile, music.isSoundOn(), obj.userData.imageName || null, { source: obj });
        }
    };
    const orbit = bindOrbitPointer({
        canvas,
        camera,
        clickable,
        onHit: typeof onHit === "function" ? onHit : defaultOnHit,
        onRotate,
        getAngle: () => angle,
        setAngle: (a) => {
            angle = a;
        },
    });
    if (lightbox) {
    }
    const wallClick = createWallClickHelper({ canvas, camera, stage, scene });
    const setViewHeight = ({ floorY: nextFloorY = viewFloorY, heightFromFloor: nextHff = viewHeightFromFloor, lookAtHeightFromFloor: nextLookHff = viewLookAtHeightFromFloor, } = {}) => {
        viewFloorY = nextFloorY;
        viewHeightFromFloor = nextHff;
        viewLookAtHeightFromFloor = nextLookHff;
        resolvedCamY = resolveCamY(viewHeightFromFloor, viewFloorY);
        resolvedLookAtY = resolveLookAtY(viewHeightFromFloor, viewLookAtHeightFromFloor, viewFloorY);
        camera.position.y = resolvedCamY;
    };
    let loopStarted = false;
    const startLoop = () => {
        if (loopStarted) return;
        loopStarted = true;
        let previousTime = performance.now();
        const loop = (time = performance.now()) => {
            const delta = Math.min(Math.max((time - previousTime) / 1000, 0), 0.1);
            previousTime = time;
            const keyboardActive = onFrame?.(delta) === true;
            if (!orbit.isDragging() && !keyboardActive)
                angle += autoSpin;
            camera.position.x = Math.sin(angle) * orbitRadius;
            const bob = camera.userData.transitionBob ?? 0;
            camera.position.y = resolvedCamY + bob;
            camera.position.z = Math.cos(angle) * orbitRadius;
            camera.lookAt(0, resolvedLookAtY + bob, 0);
            renderer.render(scene, camera);
            requestAnimationFrame(loop);
        };
        loop();
    };
    const createPropFactories = ({ roomHalfY, walls, doorHeight = 3.2 } = {}) => ({
        addElectricalBox: createAddElectricalBox({
            scene,
            textureLoader,
            roomHalfY,
        }),
        addExitSign: createAddExitSign({ scene, textureLoader, roomHalfY }),
        addFoldingChairs: createAddFoldingChairs({
            scene,
            textureLoader,
            roomHalfY,
        }),
        addBoxStack: createAddBoxStack({ scene, textureLoader, roomHalfY }),
        addLightSwitch: createAddLightSwitch({
            scene,
            textureLoader,
            roomHalfY,
            doorHeight,
            clickable,
        }),
        addLightFixture: createAddLightFixture({
            scene,
            textureLoader,
            roomHalfY,
        }),
        addVent: walls
            ? createAddVent({ scene, textureLoader, roomHalfY, walls })
            : null,
    });
    const enableDevWallUpload = ({ bounds, floorY: uploadFloorY = viewFloorY, ceilingY, roomHalfY = -uploadFloorY, wallInset = 0.05, heightFromFloor = DEFAULT_ART_HEIGHT_FROM_FLOOR, defaultWidth = DEFAULT_USER_ART_WIDTH, roomId = typeof location !== "undefined" ? location.pathname : "/", persist = true, store = null, } = {}) => {
        if (!bounds) {
            console.warn("enableDevWallUpload: bounds are required");
            return {
                button: null,
                input: null,
                addUserWallImage: null,
                session: null,
                ready: Promise.resolve(),
            };
        }
        const resolvedCeilingY = ceilingY != null ? ceilingY : uploadFloorY + DEFAULT_ROOM_HEIGHT;
        const addUserWallImage = createAddUserWallImage({
            scene,
            textureLoader,
            roomHalfY,
            floorY: uploadFloorY,
            ceilingY: resolvedCeilingY,
            heightFromFloor,
            clickable,
            bounds,
            wallInset,
        });
        const placementStore = persist === false
            ? null
            : store || createLocalPlacementStore();
        const session = placementStore
            ? createUserArtSession({
                store: placementStore,
                roomId,
                addUserWallImage,
                clickable,
                bounds,
                floorY: uploadFloorY,
                ceilingY: resolvedCeilingY,
                wallInset,
            })
            : null;
        const ui = initDevWallUpload({
            wallClick,
            addUserWallImage,
            clickable,
            session,
            floorY: uploadFloorY,
            ceilingY: resolvedCeilingY,
            bounds,
            wallInset,
            stage,
            defaultWidth,
            playAppearSfx: () => music.playSfx(pageSfx, lightboxSfxVolume),
        });
        if (lightbox && typeof lightbox.setUserArtDeleteHandler === "function") {
            lightbox.setUserArtDeleteHandler(async (art) => {
                if (session) {
                    await session.forget(art);
                }
                else {
                    removeUserWallImage(art, { clickable });
                }
                ui.handleArtRemoved?.(art);
            });
        }
        return { ...ui, addUserWallImage, session };
    };
    return {
        THREE,
        canvas,
        stage,
        renderer,
        scene,
        camera,
        textureLoader,
        clickable,
        music,
        lightbox,
        videoLightbox,
        wallClick,
        orbit,
        // Allow room controls to pause idle rotation without rebuilding the scene.
        setAutoSpin(speed) { autoSpin = Number(speed) || 0; },
        roomLights,
        syncViewportSize,
        setViewHeight,
        startLoop,
        createPropFactories,
        enableDevWallUpload,
        setAudioVolume(key, value, skylight) {
            if (key === (skylight ? "skylightWindVolume" : "windVolume")) music.setVolume("wind", value);
            if (key === "backgroundMusicVolume") music.setVolume("music", value);
            if (key === "lightBuzzVolume") music.setVolume("buzz", value);
            if (key === "lightSwitchVolume") lightSwitchVolume = value;
            if (key === "doorLockedVolume") doorLockedVolume = value;
            if (key === "doorUnlockedVolume") doorUnlockedVolume = value;
            if (key === "lightboxSfxVolume") {
                lightboxSfxVolume = value;
                lightbox?.setVolume(value);
            }
        },
        playDoorSound: music.playSfx,
        doorLockedSound,
        doorUnlockedSound,
        get camY() {
            return resolvedCamY;
        },
        get lookAtY() {
            return resolvedLookAtY;
        },
        get heightFromFloor() {
            return viewHeightFromFloor;
        },
        get floorY() {
            return viewFloorY;
        },
    };
};

export const loadMapOntoMaterial = (textureLoader, material, imageFile, { repeatX = 1, repeatY = 1, color = 0xffffff } = {}) => {
    textureLoader.load(imageFile, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
        material.map = tex;
        material.color.set(color);
        material.needsUpdate = true;
    });
};

const ROOM_STYLES = `
html, body {
    justify-content: center;
    align-items: center;
    overflow: hidden;
    display: flex;
    background: #000;
    width: 100%;
    height: 100%;
    margin: 0;
}

canvas,
#stage {
    width: 100vw;
    height: 100vh;
}
#stage {
    position: relative;
}
#stage canvas {
    image-rendering: crisp-edges;
    image-rendering: pixelated;
    display: block;
    width: 100%;
    height: 100%;
}
#overlay {
    position: absolute;
    pointer-events: none;
    padding: 0px 25px;
    color: #fff;
    z-index: 1;
    inset: 0;
}
#overlay h1 {
    margin: 1rem 0;
    text-shadow: 5px 5px 0 #ffffff66,
    10px 10px 0 #ffffff33,
    15px 15px 0 #ffffff11;
    background-color: rgba(100, 149, 237, .8);
    width: fit-content;
}
#overlay h1, 
#overlay h2, 
#overlay p, 
#overlay a {
    pointer-events: auto;
    user-select: text;
    -webkit-user-select: text;
    font-weight: 100;
}
#lightbox {
    background: rgba(0, 0, 0, 0);
    justify-content: center;
    pointer-events: auto;
    align-items: center;
    position: absolute;
    cursor: pointer;
    display: none;
    inset: 0;
    z-index: 2;
    overflow: hidden;
}
#lightbox.is-open {
    display: flex;
}
.lightbox-frame {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: fit-content;
    max-width: 85%;
    max-height: 85%;
    margin: auto;
    pointer-events: none;
}

.lightbox-stage {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: fit-content;
    max-width: 100%;
    pointer-events: auto;
    transform-origin: center center;
    will-change: transform;
    touch-action: none;
}
#lightbox img {
    display: block;
    pointer-events: auto;
    cursor: grab;
    object-fit: contain;
    max-width: calc(0.85 * 100vw);
    max-height: calc(0.85 * 100vh);
    user-select: none;
    -webkit-user-select: none;
}
#lightbox.is-zoomed .lightbox-stage { cursor: grab; }
#lightbox .lightbox-stage.is-panning,
#lightbox img:active { cursor: grabbing; }
#lightbox-caption {
    display: block;
    margin-top: 10px;
    font-size: 14px;
    color: revert;
    text-decoration: underline;
    pointer-events: auto;
    cursor: pointer;
    background-color: yellow;
    align-self: flex-start;
    text-align: left;
}


#video-lightbox {
    background: rgba(0, 0, 0, 0);
    justify-content: center;
    align-items: center;
    position: absolute;
    cursor: pointer;
    display: none;
    inset: 0;
    z-index: 3;
    overflow: hidden;
}
#video-lightbox.is-open {
    display: flex;
}
.video-lightbox-frame {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(960px, 90vw);
    max-height: 85vh;
    margin: auto;
    pointer-events: none;
}
.video-lightbox-stage {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #000;
    pointer-events: auto;
}
.video-lightbox-stage iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
    background: #000;
}
#video-lightbox-caption {
    display: block;
    margin-top: 10px;
    font-size: 14px;
    color: revert;
    text-decoration: underline;
    pointer-events: auto;
    cursor: pointer;
    background-color: yellow;
    align-self: flex-start;
    text-align: left;
}
body.is-windowed #video-lightbox .video-lightbox-frame {
    width: min(860px, 90%);
}
#music-toggle,
#dev-toggle {
    position: absolute;
    bottom: 15px;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 35px;
    line-height: 1;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    z-index: 1;
}
#music-toggle {
    right: 15px;
}
#dev-toggle {
    left: 15px;
    opacity: 0.4;
}
#dev-toggle.is-on {
    opacity: 1;
}
#wall-click-hud {
    display: none;
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    width: fit-content;
    z-index: 10;
    margin: 0;
    padding: 10px 16px;
    border: none;
    border-radius: 0;
    background: #fff;
    color: red;
    font-family: serif;
    font-weight: 100;
    font-size: 10px;
    letter-spacing: 0.02em;
    line-height: 1.3;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    box-sizing: border-box;
}
body.is-dev-mode #wall-click-hud {
    display: block;
}
#dev-wall-upload-panel {
    display: none;
    position: absolute;
    left: 16px;
    bottom: 52px;
    z-index: 10;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    pointer-events: auto;
}
body.is-dev-mode #dev-wall-upload-panel {
    display: flex;
}
#dev-wall-upload-actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
}
#dev-wall-upload:disabled,
#dev-wall-upload-delete:disabled,
#dev-wall-upload-reset:disabled {
    opacity: 0.35;
}
#lightbox-delete {
    display: none;
    margin-top: 8px;
    pointer-events: auto;
}
body.is-dev-mode #lightbox.has-user-art-delete #lightbox-delete {
    display: inline-block;
}
.dev-wall-upload-slider-row {
    display: flex;
    align-items: center;
    gap: 6px;
}
.dev-wall-upload-slider-row.is-disabled {
    opacity: 0.35;
}
.dev-wall-upload-slider-row input[type="range"] {
    width: 100px;
}

body.is-windowed #stage,
body.is-windowed canvas {
    width: min(100vw, 960px);
    height: min(100vh, 540px);
}
body.is-windowed #lightbox img {
    max-width: calc(0.85 * min(100vw, 960px));
    max-height: calc(0.85 * min(100vh, 540px));
}


#stage:fullscreen,
#stage:-webkit-full-screen {
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
}
#stage:fullscreen canvas,
#stage:-webkit-full-screen canvas {
    width: 100%;
    height: 100%;
}

`;

// Consolidated computer and sky system: data, timing, rendering, and optional workshop.
// Approved workshop export. Shared starter values for live rooms and test-room resets.
export const SKY_DEFAULTS = {
  "version": 1,
  "selection": "sunset",
  "schedule": {
    "dayStart": 6,
    "sunsetStart": 17,
    "nightStart": 20
  },
  "skies": {
    "day": {
      "label": "Current day sky",
      "skyImage": "./assets/rooms/images/static_images/windows.png",
      "states": {
        "on": {
          "lightsOn": true,
          "colorTarget": "room",
          "lighting": {
            "room": 1,
            "sky": 1,
            "trees": 1,
            "reveal": 0.95,
            "trim": 1,
            "wall": 1,
            "floor": 1,
            "ceiling": 1,
            "roomEdges": 1,
            "edges": 0.345,
            "verticalThickness": 0.12,
            "verticalBrightness": 0.845,
            "bandHue": 0,
            "bandSaturation": 0,
            "bandValue": 1,
            "lipBand": 1,
            "value": 1,
            "lipValue": 1,
            "lipBottom": 1.01,
            "bottomHue": 0,
            "bottomSaturation": 0,
            "bottomValue": 1,
            "hue": 0,
            "saturation": 0,
            "lipHue": 0,
            "lipSaturation": 0,
            "fixtures": 1,
            "ambient": 2.7,
            "directional": 0.55,
            "fill": 0,
            "daylight": 0,
            "fixtureGlow": 1
          },
          "computer": {
            "placement": {
              "width": 31.7,
              "rotation": 322,
              "x": 85,
              "y": 0.1,
              "z": 16.5
            },
            "lighting": {
              "shadowX": 11.6,
              "shadowY": -10.28,
              "shadowZ": 1.9,
              "shadowReach": 34,
              "shadowStrength": 1.47,
              "shadowDecay": 3.71,
              "shadowMoldingStrength": 1,
              "computerBrightness": 1.15
            },
            "screenLight": {
              "enabled": true,
              "intensity": 2.9,
              "reach": 36,
              "decay": 2.1,
              "x": 0,
              "y": 27,
              "z": 9.6,
              "hue": 229,
              "saturation": 30
            },
            "volumes": {
              "startup": 0.11,
              "shutdown": 0.06
            },
            "autoRotation": true,
            "screenLightPreview": false,
            "documentUrl": "https://docs.google.com/document/d/e/2PACX-1vS-NhUvNixeN_CbjA1c63Ukkwsz79cPiG48FbtImX9ZHTSywKDDJErJOwXP-vY_BJdD674UGCR4zHfs/pub?embedded=true"
          }
        },
        "off": {
          "lightsOn": false,
          "colorTarget": "room",
          "lighting": {
            "room": 1,
            "sky": 1,
            "trees": 1,
            "reveal": 1,
            "trim": 1,
            "wall": 1,
            "floor": 1,
            "ceiling": 1,
            "roomEdges": 1,
            "edges": 1,
            "verticalThickness": 0.12,
            "verticalBrightness": 1,
            "bandHue": 0,
            "bandSaturation": 0,
            "bandValue": 1,
            "lipBand": 1,
            "value": 1,
            "lipValue": 1,
            "lipBottom": 1,
            "bottomHue": 0,
            "bottomSaturation": 0,
            "bottomValue": 1,
            "hue": 0,
            "saturation": 0,
            "lipHue": 0,
            "lipSaturation": 0,
            "fixtures": 1,
            "ambient": 0.05,
            "directional": 0.04,
            "fill": 68,
            "daylight": 0.35,
            "fixtureGlow": 0.9
          },
          "computer": {
            "placement": {
              "width": 31.7,
              "rotation": 322,
              "x": 85,
              "y": 0.1,
              "z": 16.5
            },
            "lighting": {
              "shadowX": 8.6,
              "shadowY": -12.76,
              "shadowZ": 1.9,
              "shadowReach": 37,
              "shadowStrength": 1.6,
              "shadowDecay": 2.4,
              "shadowMoldingStrength": 1,
              "computerBrightness": 1
            },
            "screenLight": {
              "enabled": true,
              "intensity": 4.21,
              "reach": 36,
              "decay": 2.1,
              "x": 0,
              "y": 26.52,
              "z": 9.6,
              "hue": 229,
              "saturation": 30
            },
            "volumes": {
              "startup": 0.11,
              "shutdown": 0.06
            },
            "autoRotation": true,
            "screenLightPreview": false,
            "documentUrl": "https://docs.google.com/document/d/e/2PACX-1vS-NhUvNixeN_CbjA1c63Ukkwsz79cPiG48FbtImX9ZHTSywKDDJErJOwXP-vY_BJdD674UGCR4zHfs/pub?embedded=true"
          }
        }
      }
    },
    "stars": {
      "label": "Stars 1",
      "skyImage": "./assets/rooms/images/skies/stars-1.png",
      "states": {
        "on": {
          "lightsOn": true,
          "colorTarget": "room",
          "lighting": {
            "room": 1,
            "sky": 0.7,
            "trees": 0.15,
            "reveal": 0.555,
            "trim": 1,
            "wall": 1,
            "floor": 1,
            "ceiling": 1,
            "roomEdges": 1,
            "edges": 1,
            "verticalThickness": 0.12,
            "verticalBrightness": 1,
            "bandHue": 0,
            "bandSaturation": 0,
            "bandValue": 1,
            "lipBand": 1,
            "value": 1,
            "lipValue": 1,
            "lipBottom": 1,
            "bottomHue": 0,
            "bottomSaturation": 0,
            "bottomValue": 1,
            "hue": 0,
            "saturation": 0,
            "lipHue": 0,
            "lipSaturation": 0,
            "fixtures": 1,
            "ambient": 2.7,
            "directional": 0.55,
            "fill": 0,
            "daylight": 0,
            "fixtureGlow": 1
          },
          "computer": {
            "placement": {
              "width": 31.7,
              "rotation": 322,
              "x": 85,
              "y": 0.1,
              "z": 16.5
            },
            "lighting": {
              "shadowX": 15.9,
              "shadowY": -10,
              "shadowZ": -4.4,
              "shadowReach": 31,
              "shadowStrength": 2.1,
              "shadowDecay": 3.1,
              "shadowMoldingStrength": 1,
              "computerBrightness": 1.15
            },
            "screenLight": {
              "enabled": true,
              "intensity": 2.9,
              "reach": 36,
              "decay": 2.1,
              "x": 0,
              "y": 27,
              "z": 9.6,
              "hue": 229.11060322861283,
              "saturation": 29.958870558902728
            },
            "volumes": {
              "startup": 0.11,
              "shutdown": 0.06
            },
            "autoRotation": false,
            "screenLightPreview": false,
            "documentUrl": "https://docs.google.com/document/d/e/2PACX-1vS-NhUvNixeN_CbjA1c63Ukkwsz79cPiG48FbtImX9ZHTSywKDDJErJOwXP-vY_BJdD674UGCR4zHfs/pub?embedded=true"
          }
        },
        "off": {
          "lightsOn": false,
          "colorTarget": "room",
          "lighting": {
            "room": 0.25,
            "sky": 0.55,
            "trees": 0.045,
            "reveal": 0.08,
            "trim": 0.5,
            "wall": 0.75,
            "floor": 1.1,
            "ceiling": 1,
            "roomEdges": 0,
            "edges": 0.1,
            "verticalThickness": 0.07,
            "verticalBrightness": 0,
            "bandHue": 0,
            "bandSaturation": 0,
            "bandValue": 1,
            "lipBand": 1,
            "value": 1,
            "lipValue": 1,
            "lipBottom": 1,
            "bottomHue": 0,
            "bottomSaturation": 0,
            "bottomValue": 1,
            "hue": 215,
            "saturation": 20,
            "lipHue": 211.363636,
            "lipSaturation": 17.254902,
            "fixtures": 1,
            "ambient": 0.1,
            "directional": 0.55,
            "fill": 20,
            "daylight": 0.05,
            "fixtureGlow": 0.25
          },
          "computer": {
            "placement": {
              "width": 31.7,
              "rotation": 322,
              "x": 85,
              "y": 0.1,
              "z": 16.5
            },
            "lighting": {
              "shadowX": 8.6,
              "shadowY": -3,
              "shadowZ": 1.9,
              "shadowReach": 35,
              "shadowStrength": 0.9,
              "shadowDecay": 2,
              "shadowMoldingStrength": 1,
              "computerBrightness": 1
            },
            "screenLight": {
              "enabled": true,
              "intensity": 2.9,
              "reach": 36,
              "decay": 2.1,
              "x": 0,
              "y": 27,
              "z": 9.6,
              "hue": 229,
              "saturation": 30
            },
            "volumes": {
              "startup": 0.11,
              "shutdown": 0.06
            },
            "autoRotation": true,
            "screenLightPreview": false,
            "documentUrl": "https://docs.google.com/document/d/e/2PACX-1vS-NhUvNixeN_CbjA1c63Ukkwsz79cPiG48FbtImX9ZHTSywKDDJErJOwXP-vY_BJdD674UGCR4zHfs/pub?embedded=true"
          }
        }
      }
    },
    "sunset": {
      "label": "Doom sunset",
      "skyImage": "./assets/rooms/images/skies/doom-sunset.png",
      "states": {
        "on": {
          "lightsOn": true,
          "colorTarget": "band",
          "lighting": {
            "room": 1,
            "sky": 0.8,
            "trees": 0.115,
            "reveal": 0.57,
            "trim": 1,
            "wall": 1,
            "floor": 1,
            "ceiling": 1,
            "roomEdges": 1,
            "edges": 1,
            "verticalThickness": 0.12,
            "verticalBrightness": 1,
            "bandHue": 232.30909096900803,
            "bandSaturation": 11.630825950395185,
            "bandValue": 1,
            "lipBand": 1.14,
            "value": 1,
            "lipValue": 1,
            "lipBottom": 0.905,
            "bottomHue": 209.42728447788184,
            "bottomSaturation": 11.608898672511804,
            "bottomValue": 1,
            "hue": 0,
            "saturation": 0,
            "lipHue": 8.784096819017407,
            "lipSaturation": 8.488455010499553,
            "fixtures": 1,
            "ambient": 2.7,
            "directional": 0.55,
            "fill": 0,
            "daylight": 0,
            "fixtureGlow": 1
          },
          "computer": {
            "placement": {
              "width": 31.7,
              "rotation": 322,
              "x": 85,
              "y": 0.1,
              "z": 16.5
            },
            "lighting": {
              "shadowX": 9.12,
              "shadowY": -14.75,
              "shadowZ": 1.9,
              "shadowReach": 33.5,
              "shadowStrength": 1.72,
              "shadowDecay": 2.45,
              "shadowMoldingStrength": 1,
              "computerBrightness": 1.15
            },
            "screenLight": {
              "enabled": true,
              "intensity": 2.9,
              "reach": 36,
              "decay": 2.1,
              "x": 0,
              "y": 27,
              "z": 9.6,
              "hue": 229,
              "saturation": 30
            },
            "volumes": {
              "startup": 0.11,
              "shutdown": 0.06
            },
            "autoRotation": true,
            "screenLightPreview": false,
            "documentUrl": "https://docs.google.com/document/d/e/2PACX-1vS-NhUvNixeN_CbjA1c63Ukkwsz79cPiG48FbtImX9ZHTSywKDDJErJOwXP-vY_BJdD674UGCR4zHfs/pub?embedded=true"
          }
        },
        "off": {
          "lightsOn": false,
          "colorTarget": "bottom",
          "lighting": {
            "room": 0.75,
            "sky": 1,
            "trees": 0.05,
            "reveal": 0.535,
            "trim": 1,
            "wall": 1,
            "floor": 1,
            "ceiling": 1,
            "roomEdges": 0.4,
            "edges": 0.15,
            "verticalThickness": 0.12,
            "verticalBrightness": 1,
            "bandHue": 216.8590340708884,
            "bandSaturation": 19.511118921677014,
            "bandValue": 1,
            "lipBand": 1.545,
            "value": 1,
            "lipValue": 1,
            "lipBottom": 1.255,
            "bottomHue": 192.4052765415244,
            "bottomSaturation": 19.567970950062815,
            "bottomValue": 1,
            "hue": 28,
            "saturation": 30,
            "lipHue": 21.64205463679241,
            "lipSaturation": 19.78351036659495,
            "fixtures": 1,
            "ambient": 0.05,
            "directional": 0.04,
            "fill": 68,
            "daylight": 0.2,
            "fixtureGlow": 0.9
          },
          "computer": {
            "placement": {
              "width": 31.7,
              "rotation": 322,
              "x": 85,
              "y": 0.1,
              "z": 16.5
            },
            "lighting": {
              "shadowX": 8.6,
              "shadowY": -7.8,
              "shadowZ": 1.9,
              "shadowReach": 32,
              "shadowStrength": 1.7,
              "shadowDecay": 2.3,
              "shadowMoldingStrength": 1,
              "computerBrightness": 1
            },
            "screenLight": {
              "enabled": true,
              "intensity": 2.9,
              "reach": 36,
              "decay": 2.1,
              "x": 0,
              "y": 27,
              "z": 9.6,
              "hue": 229,
              "saturation": 30
            },
            "volumes": {
              "startup": 0.11,
              "shutdown": 0.06
            },
            "autoRotation": true,
            "screenLightPreview": false,
            "documentUrl": "https://docs.google.com/document/d/e/2PACX-1vS-NhUvNixeN_CbjA1c63Ukkwsz79cPiG48FbtImX9ZHTSywKDDJErJOwXP-vY_BJdD674UGCR4zHfs/pub?embedded=true"
          }
        }
      }
    }
  }
};

// California uses the same clock throughout the state, including daylight-saving changes.
export const CALIFORNIA_SKY_LOCATION = Object.freeze({ latitude: 38.5816, longitude: -121.4944, timeZone: 'America/Los_Angeles' });
const radians = degrees => degrees * Math.PI / 180;

export function californiaDateParts(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: CALIFORNIA_SKY_LOCATION.timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    }).formatToParts(now);
    return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

// NOAA's approximate solar equations give seasonal sunrise/sunset without network requests.
// Reference: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
export function californiaSunTimes(now = new Date(), location = CALIFORNIA_SKY_LOCATION) {
    const date = californiaDateParts(now);
    const noonUTC = Date.UTC(date.year, date.month - 1, date.day, 12);
    const dayOfYear = Math.floor((noonUTC - Date.UTC(date.year, 0, 1)) / 86400000) + 1;
    const daysInYear = (Date.UTC(date.year + 1, 0, 1) - Date.UTC(date.year, 0, 1)) / 86400000;
    const angle = 2 * Math.PI / daysInYear * (dayOfYear - 1);
    const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(angle) - 0.032077 * Math.sin(angle)
        - 0.014615 * Math.cos(2 * angle) - 0.040849 * Math.sin(2 * angle));
    const declination = 0.006918 - 0.399912 * Math.cos(angle) + 0.070257 * Math.sin(angle)
        - 0.006758 * Math.cos(2 * angle) + 0.000907 * Math.sin(2 * angle)
        - 0.002697 * Math.cos(3 * angle) + 0.00148 * Math.sin(3 * angle);
    const latitude = radians(location.latitude);
    const hourAngle = Math.acos(Math.cos(radians(90.833)) / (Math.cos(latitude) * Math.cos(declination))
        - Math.tan(latitude) * Math.tan(declination)) * 180 / Math.PI;
    // Convert UTC solar minutes to California wall-clock minutes using today's actual offset.
    const midday = new Date(noonUTC + 8 * 3600000);
    const localMidday = californiaDateParts(midday);
    const offset = (Date.UTC(localMidday.year, localMidday.month - 1, localMidday.day,
        localMidday.hour, localMidday.minute, localMidday.second) - midday.getTime()) / 60000;
    const solarNoon = 720 - 4 * location.longitude - equation + offset;
    return { sunrise: solarNoon - 4 * hourAngle, sunset: solarNoon + 4 * hourAngle };
}

export function getCaliforniaSkyPeriod(now = new Date(), selection = 'auto', location = CALIFORNIA_SKY_LOCATION) {
    const { sunrise, sunset } = californiaSunTimes(now, location);
    const parts = californiaDateParts(now);
    const minute = parts.hour * 60 + parts.minute + parts.second / 60;
    // A shared sunset appearance covers the hour centered on sunrise and sunset.
    const automatic = minute < sunrise - 30 || minute >= sunset + 30 ? 'night'
        : minute < sunrise + 30 ? 'dawn' : minute < sunset - 30 ? 'day' : 'evening';
    const period = ['day', 'dawn', 'evening', 'night'].includes(selection) ? selection : automatic;
    return { period, sky: period === 'day' ? 'day' : period === 'night' ? 'stars' : 'sunset', sunrise, sunset };
}

// Multiply surface brightness rather than subtracting RGB light, preserving the room's hue.
export function addNeutralComputerShadow(THREE, materials) {
    const uniforms = {
        computerShadowCenter: { value: new THREE.Vector3() },
        computerShadowReach: { value: 1 },
        computerShadowStrength: { value: 0 },
        computerShadowDecay: { value: 0 },
    };
    const originals = [];
    for (const material of new Set(materials.filter(Boolean))) {
        const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
        originals.push({ material, compile, cacheKey });
        material.onBeforeCompile = function (shader, renderer) {
            compile.call(this, shader, renderer);
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = 'varying vec3 vComputerShadowPosition;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>',
                '#include <worldpos_vertex>\nvComputerShadowPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
            shader.fragmentShader = `varying vec3 vComputerShadowPosition;
                uniform vec3 computerShadowCenter;
                uniform float computerShadowReach;
                uniform float computerShadowStrength;
                uniform float computerShadowDecay;\n` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>', `
                float computerDistance = length(vComputerShadowPosition - computerShadowCenter);
                float computerFade = pow(clamp(1.0 - pow(computerDistance / max(computerShadowReach, 0.001), 4.0), 0.0, 1.0), 2.0);
                float computerAttenuation = computerFade / pow(max(computerDistance, 0.1), computerShadowDecay);
                gl_FragColor.rgb *= 1.0 / (1.0 + computerShadowStrength * computerAttenuation);
                #include <tonemapping_fragment>`);
        };
        material.customProgramCacheKey = function () { return cacheKey.call(this) + ':neutral-computer-shadow-v1'; };
        material.needsUpdate = true;
    }
    return { uniforms, dispose() {
        for (const { material, compile, cacheKey } of originals) {
            material.onBeforeCompile = compile;
            material.customProgramCacheKey = cacheKey;
            material.needsUpdate = true;
        }
    } };
}

const COMPUTER_STYLES = `
/* Computer viewer and optional test controls; embedded in helpers.js. */

#computer-editor {
    position: fixed;
    inset: auto auto 0 0;
    margin: 0;
    padding: 1em;
    border: none;
    background: yellow;
    color: black;
    font-family: serif;
    font-size: 13px;
    line-height: 15px;
}

#computer-editor label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

#computer-editor input,
#computer-editor select,
#computer-editor button {
    font: inherit;
}

#computer-editor .modal-label {
    text-decoration: underline;
}

#computer-editor .wall-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

#computer-editor .wall-editor-filename {
    min-width: 0;
    font-size: 16px;
    color: purple;
    text-decoration: underline;
    overflow-wrap: anywhere;
}

#computer-editor .wall-editor-actions {
    margin-top: 12px;
}

#computer-editor button[name="close"] {
    font-size: 13px;
    font-weight: normal;
    flex-shrink: 0;
}

/* Leave space for a gray frame around the published document. */
        #computer-document {
    --document-top-crop: 64px;
    --document-scrollbar-crop: 24px;
    overflow: hidden;
    width: min(864px, 92vw);
    height: 88vh;
    max-width: 92vw;
    max-height: 90vh;
    padding: 0;
    border: 0;
    background: transparent;
    color: #ffb000;
    box-shadow: 0 24px 36px 4px #0009;
}

/* A taller top banner holds the title; the other frame edges stay narrow. */
        #computer-document .document-frame {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    padding: 10px 12px 12px;
    background: #adadad;
    border: 8px outset #c4c4c4;
}

#computer-document .document-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}

#computer-document .document-title {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    border: 4px inset #cccccc;
    background: white;
    color: #111;
    font: 14px/20px Arial, sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Keep the bevel outside the clipping layer so the iframe cannot cover its left edge. */
        #computer-document .document-viewport {
    min-height: 0;
    min-width: 0;
    border: 4px inset #cccccc;
    background: #000;
}

#computer-document .document-clip {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
}

#computer-document::backdrop {
    background: transparent;
}

#computer-document .document-close {
    flex: none;
    margin: 0;
}

#computer-document .document-close button {
    box-sizing: border-box;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 3px outset #cccccc;
    border-radius: 0;
    background: #adadad;
    color: #000;
    font: bold 18px/1 Arial, sans-serif;
    cursor: pointer;
}

/* Reverse the bevel while the mouse or keyboard presses the button. */
        #computer-document .document-close button:active {
    border-style: inset;
    padding: 2px 0 0 2px;
}

#computer-document .document-close button:focus {
    outline: none;
}

#computer-document .document-close button:focus-visible {
    outline: 1px dotted #000;
    outline-offset: -6px;
}

/* Push Google's scrollbar outside the clipped viewer; wheel and touch scrolling still work. */
        #computer-document iframe {
    position: absolute;
    top: calc(-1 * var(--document-top-crop));
    left: 0;
    display: block;
    width: calc(100% + var(--document-scrollbar-crop));
    height: calc(100% + var(--document-top-crop));
    border: 0;
    filter: invert(1) contrast(100) sepia(100) saturate(100) hue-rotate(-35deg);
}

#computer-editor {
    max-height: 85vh;
    overflow-y: auto;
}

#computer-editor [hidden] {
    display: none !important;
}

#computer-shadow-controls {
    margin: 12px 0 0;
    padding: 8px;
    border: 1px solid black;
}

/* Mobile reader: use the whole viewport and leave document scrolling to the iframe. */
@media (max-width: 767px), (hover: none) and (pointer: coarse) {
    #computer-document {
        position: fixed;
        inset: 0;
        margin: 0;
        width: 100%;
        height: 100vh;
        height: 100dvh;
        max-width: none;
        max-height: none;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: black;
        box-shadow: none;
    }
    #computer-document .document-frame {
        display: block;
        padding: 0;
        border: 0;
        background: black;
    }
    #computer-document .document-banner { display: contents; }
    #computer-document .document-title { display: none; }
    #computer-document .document-viewport,
    #computer-document .document-clip {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        border: 0;
        background: black;
    }
    #computer-document iframe {
        inset: 0;
        width: 100%;
        height: 100%;
        background: white;
        /* Neutralize source colors before inversion, avoiding the cyan/red cast. */
        filter: grayscale(1) invert(1);
    }
    #computer-document .document-close {
        position: absolute;
        top: max(12px, env(safe-area-inset-top));
        right: max(12px, env(safe-area-inset-right));
        z-index: 2;
    }
    #computer-document .document-close button {
        width: 30px;
        height: 30px;
        padding: 0;
        border: 1px solid white;
        border-radius: 0;
        background: black;
        color: white;
        font: 18px/1 Arial, sans-serif;
        box-shadow: none;
    }
    #computer-document .document-close button:active {
        padding: 0;
        border: 1px solid white;
        background: #222;
    }
    #computer-document .document-close button:focus-visible {
        outline: 1px solid white;
        outline-offset: 3px;
    }
}

`;
const SKY_WORKSHOP_STYLES = `
/* This workshop is used only by the archived test workshop. */
#sky-workshop {
    position: fixed;
    z-index: 30;
    inset: auto auto 0 0;
    margin: 0;
    padding: 1em;
    border: 0;
    background: yellow;
    color: black;
    font: 13px/1.3 serif;
    width: min(390px, calc(100vw - 32px));
    max-height: 85vh;
    overflow-y: auto;
}
#sky-workshop::backdrop { background: transparent; }
#sky-workshop input, #sky-workshop select, #sky-workshop button { font: inherit; }
#sky-workshop select { max-width: 100%; }
#sky-workshop fieldset { margin: 12px 0; padding: 8px; border: 1px solid black; }
#sky-workshop .sky-slider { display: grid; grid-template-columns: minmax(0, 1fr) 75px 48px; gap: 2px 6px; margin: 8px 0; }
#sky-workshop .sky-slider span { grid-column: 1 / -1; }
#sky-workshop input[type=range] { width: 100%; min-width: 0; }
#sky-workshop output { font-variant-numeric: tabular-nums; }
#sky-workshop .sky-wheel { position: relative; width: 180px; height: 180px; margin: 12px auto; }
#sky-workshop canvas { width: 100%; height: 100%; border-radius: 50%; touch-action: none; cursor: crosshair; }
#sky-workshop canvas:focus-visible { outline: 2px solid black; outline-offset: 3px; }
#sky-workshop [data-wheel-marker] { position: absolute; width: 10px; height: 10px; border: 2px solid white;
    box-shadow: 0 0 0 1px black; border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; }
#sky-workshop [data-color] { display: block; padding: 4px 8px; border: 1px solid black; text-align: center; }
#sky-workshop input[type=number] { width: 55px; }
#sky-workshop details label { display: flex; justify-content: space-between; margin: 4px 0; }

#sky-workshop [data-settings-json], #sky-workshop [data-all-settings-json] { white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; padding: 8px; border: 1px solid black; max-height: 300px; overflow-y: auto; font: 11px/1.4 monospace; }

#sky-workshop input[data-range-input] { width: 100%; min-width: 0; box-sizing: border-box; grid-column: 2; grid-row: 2; }
#sky-workshop .sky-slider input[type=range] { grid-column: 1; grid-row: 2; }
#sky-workshop .sky-slider output { grid-column: 3; grid-row: 2; align-self: center; }
#sky-workshop [data-color] { box-sizing: border-box; width: 100%; }
`;

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
        shadowReach: 37, shadowStrength: 2.4, shadowDecay: 0, shadowMoldingStrength: 1, computerBrightness: 1.15 }),
    off: Object.freeze({ shadowX: 8.6, shadowY: 2.2, shadowZ: 1.9,
        shadowReach: 37, shadowStrength: 0.8, shadowDecay: 0, shadowMoldingStrength: 1, computerBrightness: 1 }),
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
    { frame: 'computer-boot-4', pause: 2000 }, // Icons appear.
    { frame: 'computer-boot-5-complete', pause: 700 }, // Document application.
];
export const COMPUTER_SHUTDOWN = [
    { frame: 'computer-shutdown-0', pause: 1500 }, // Application closes.
    { frame: 'computer-shutdown-1', pause: 2500 }, // Confirmation.
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
    shadowReach: [1, 240], shadowStrength: [0, 30], shadowDecay: [0, 4], computerBrightness: [0, 2], shadowMoldingStrength: [0, 2] };
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

const COMPUTER_SKIES = ['day', 'sunset', 'stars'];
export const computerSkyStorageKey = (sky, mode) => mode ? `y9k-test-computer-sky-v2:${sky}:${mode}` : `y9k-test-computer-sky-v1:${sky}`;
export function defaultComputerSkySettings(sky, mode) {
    const state = { placement: { ...COMPUTER_DEFAULTS.placement },
        profiles: { on: { ...COMPUTER_DEFAULTS.on }, off: { ...COMPUTER_DEFAULTS.off }, starsOff: { ...COMPUTER_DEFAULTS.starsOff } },
        screenLight: { ...COMPUTER_DEFAULTS.screenLight }, volumes: { ...COMPUTER_DEFAULTS.volumes },
        autoRotation: true, screenLightPreview: false };
    const preset = SKY_DEFAULTS.skies[sky]?.states[mode]?.computer;
    if (preset) {
        Object.assign(state.placement, preset.placement);
        Object.assign(state.profiles[mode], preset.lighting);
        if (sky === 'stars' && mode === 'off') Object.assign(state.profiles.starsOff, preset.lighting);
        Object.assign(state.screenLight, preset.screenLight);
        Object.assign(state.volumes, preset.volumes);
        state.autoRotation = preset.autoRotation;
    }
    return state;
}
// Enclosed rooms deliberately use day/on and night/off computer settings.
export function computerRoomSettings(sky, mode) {
    return defaultComputerSkySettings(sky ?? (mode === 'on' ? 'day' : 'stars'), mode);
}

export function readComputerSkySettings(storage, sky, seed, mode) {
    let saved;
    try { saved = JSON.parse(storage?.getItem(computerSkyStorageKey(sky, mode)) ?? 'null'); } catch { }
    // Older per-sky saves seed each light state once, preserving existing tuning.
    if (!saved && mode) {
        try { saved = JSON.parse(storage?.getItem(computerSkyStorageKey(sky)) ?? 'null'); } catch { }
    }
    saved = saved && typeof saved === 'object' ? saved : seed;
    const settings = defaultComputerSkySettings(sky, mode);
    // Reuse the numeric limits for each part of a complete sky settings set.
    const read = (value, defaults, limits) => readComputerSettings({ getItem: () => JSON.stringify(value) }, '', defaults, limits);
    settings.placement = read(saved?.placement, settings.placement, PLACEMENT_LIMITS);
    for (const mode of ['on', 'off', 'starsOff']) settings.profiles[mode] = read(saved?.profiles?.[mode], settings.profiles[mode], LIGHT_LIMITS);
    settings.screenLight = read(saved?.screenLight, settings.screenLight, SCREEN_LIGHT_LIMITS);
    settings.volumes = read(saved?.volumes, settings.volumes, { startup: [0, 1], shutdown: [0, 1] });
    if (typeof saved?.screenLight?.enabled === 'boolean') settings.screenLight.enabled = saved.screenLight.enabled;
    for (const key of ['autoRotation', 'screenLightPreview']) if (typeof saved?.[key] === 'boolean') settings[key] = saved[key];
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
export async function addComputer(room, { editor = false, skyProfiles = false, shadowMolding = false, documentUrl = DEFAULT_COMPUTER_DOCUMENT_URL } = {}) {
    if (!room.app) throw new Error('Mount the room before adding its computer.');
    if (mounted.has(room)) return mounted.get(room);
    const task = (async () => {
        let computer;
        room.addCustom(async context => { computer = await mountComputer(context, { editorEnabled: editor, skyProfiles, shadowMolding, documentUrl }); });
        await room.ready;
        return computer;
    })();
    mounted.set(room, task);
    try { return await task; }
    catch (error) { mounted.delete(room); throw error; }
}

async function mountComputer({ THREE, room, scene, layout, inchesToWorld, textureLoader }, { editorEnabled, skyProfiles, shadowMolding, documentUrl }) {
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
    let scopedSky = null;
    const snapshot = () => structuredClone({ placement, profiles, volumes, screenLight: screenSettings, autoRotation, screenLightPreview });
    const saveSky = () => {
        if (!scopedSky) return;
        try { storage?.setItem(computerSkyStorageKey(scopedSky, mode), JSON.stringify(snapshot())); } catch { }
    };
    const save = (key, value) => {
        if (scopedSky) { saveSky(); return; }
        try { storage?.setItem(key, JSON.stringify(value)); } catch { }
    };
    const applySavedSky = state => {
        Object.assign(placement, state.placement);
        Object.assign(volumes, state.volumes);
        Object.assign(screenSettings, state.screenLight);
        for (const key of ['on', 'off', 'starsOff']) profiles[key] = { ...state.profiles[key] };
        autoRotation = state.autoRotation;
        screenLightPreview = state.screenLightPreview;
        if (editorEnabled) room.app.setAutoSpin(autoRotation ? 0.00035 : 0);
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
    // The neutral surface shader darkens toward black even under colored room lighting.
    const shadowMaterials = [...Object.values(room.materials),
        ...[].concat(layout.ceiling.material), ...(layout.skylightLip?.children.map(mesh => mesh.material) ?? [])];
    // Opt in from the test room while production keeps its existing appearance.
    const moldingShadow = shadowMolding && layout.moldingMaterial
        ? addNeutralComputerShadow(THREE, [layout.moldingMaterial]) : null;
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
        if (moldingShadow) {
            // Follow the room shadow, with an independent multiplier for the trim.
            for (const key of Object.keys(neutralShadow.uniforms)) {
                const value = neutralShadow.uniforms[key].value;
                if (key === 'computerShadowCenter') moldingShadow.uniforms[key].value.copy(value);
                else moldingShadow.uniforms[key].value = value;
            }
            moldingShadow.uniforms.computerShadowStrength.value *= shadowLighting.shadowMoldingStrength ?? profiles[mode].shadowMoldingStrength;
        }
        shadowCenter.set(pivot.position.x + inchesToWorld(shadowLighting.shadowX),
            Math.max(layout.floorY + inchesToWorld(12), worldBounds.min.y + inchesToWorld(12)) + inchesToWorld(shadowLighting.shadowY),
            Math.max(layout.bounds.minZ + inchesToWorld(6), worldBounds.min.z - inchesToWorld(6)) + inchesToWorld(shadowLighting.shadowZ));
        if (moldingShadow) moldingShadow.uniforms.computerShadowCenter.value.copy(shadowCenter);
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
                : key.startsWith('shadow') ? (profiles[shadowProfileKey()][key] ?? profiles[mode][key]) : profiles[mode][key];
            form.elements[key].value = value;
            const unit = ['shadowStrength', 'shadowDecay', 'shadowMoldingStrength', 'computerBrightness'].includes(key) ? '' : ' in';
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
                if (scopedSky) saveSky();
                else try { storage?.setItem(STORAGE.rotation, autoRotation ? '1' : '0'); } catch { }
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
        listen(form.elements.restoreDefaults, 'click', () => resetCurrentSky());
    }
    const resetCurrentSky = () => {
        // Reset only this sky/light-state slot; all seven other slots stay intact.
        applySavedSky(defaultComputerSkySettings(scopedSky, mode));
        if (scopedSky) saveSky();
        else {
            save(STORAGE.placement, placement); save(STORAGE.volumes, volumes);
            save(STORAGE.screenLight, screenSettings);
            for (const state of ['on', 'off', 'starsOff']) save(STORAGE[state], profiles[state]);
        }
        update();
        if (editor.open) syncEditor();
    };
    const unsubscribeLights = room.app.roomLights.onChange(on => {
        const nextMode = on ? 'on' : 'off';
        if (nextMode !== mode && scopedSky) {
            saveSky();
            mode = nextMode;
            applySavedSky(readComputerSkySettings(storage, scopedSky, undefined, mode));
            saveSky();
        } else mode = nextMode;
        if (skyProfiles && !editorEnabled) applySavedSky(computerRoomSettings(environmentSky, mode));
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
            // Seed only the first selected sky with existing tuning, not every newly visited sky.
            if (editorEnabled && COMPUTER_SKIES.includes(sky)) {
                const seed = scopedSky === null ? snapshot() : undefined;
                saveSky();
                const state = readComputerSkySettings(storage, sky, seed, mode);
                scopedSky = sky;
                applySavedSky(state);
                saveSky();
            }
            environmentSky = sky;
            if (skyProfiles && !editorEnabled) applySavedSky(computerRoomSettings(sky, mode));
            update();
            if (editor.open) syncEditor();
        },
        restoreSkyDefaults() { if (!disposed && editorEnabled) resetCurrentSky(); },
        // Export a detached copy of only the active sky/light-state controls.
        getSettings(sky = scopedSky, state = mode) {
            // Read inactive slots without switching the visible computer or writing storage.
            const values = sky === scopedSky && state === mode ? snapshot()
                : readComputerSkySettings(storage, sky, undefined, state);
            return structuredClone({ placement: values.placement,
                lighting: { ...values.profiles[state], ...values.profiles[computerShadowProfile(state, sky)] },
                screenLight: values.screenLight, volumes: values.volumes, autoRotation: values.autoRotation,
                screenLightPreview: values.screenLightPreview, documentUrl });
        },
        getScreenLight() { return { ...screenSettings, preview: screenLightPreview }; },
        setScreenLightPreview(on) {
            if (disposed) return;
            screenLightPreview = !!on;
            saveSky();
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
            moldingShadow?.dispose();
            screenLight.dispose();
            mounted.delete(room);
        },
    };
}

// Embed component styling here so the live page has one application helper dependency.
function installStyles() {
    if (document.getElementById('computer-styles')) return;
    const style = document.createElement('style');
    style.id = 'computer-styles';
    style.textContent = COMPUTER_STYLES;
    document.head.appendChild(style);
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
                <label><span class="modal-label">baseboard shadow multiplier</span>: <input name="shadowMoldingStrength" type="range" min="0" max="2" step="0.1"><output data-value="shadowMoldingStrength"></output></label><br>
                <label><span class="modal-label">strength</span>: <input name="shadowStrength" type="range" min="0" max="30" step="0.1" value="4"><output data-value="shadowStrength"></output></label><br>
                <label><span class="modal-label">falloff</span>: <input name="shadowDecay" type="range" min="0" max="4" step="0.1" value="2"><output data-value="shadowDecay"></output></label><br>
            </fieldset>
            <div class="wall-editor-actions">
                <button type="button" name="restoreDefaults">restore current sky / light state defaults</button>
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

// Apply only to actual skylight rooms. Other rooms keep their native room lighting.
export async function addSkyLighting(room, { computer = null } = {}) {
    if (room.hallway || !room.options.gallerySkylight) return null;
    const { THREE, scene, roomLights, textureLoader } = room.app;
    await room.skylightSkyReady;
    const textures = {};
    const results = await Promise.allSettled(Object.entries(SKY_DEFAULTS.skies).map(async ([sky, data]) => {
        const map = await textureLoader.loadAsync(new URL(data.skyImage, import.meta.url).href);
        map.colorSpace = THREE.SRGBColorSpace;
        map.magFilter = map.minFilter = THREE.NearestFilter;
        textures[sky] = map;
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) { Object.values(textures).forEach(map => map.dispose()); throw failure.reason; }
    const colors = new Map();
    const ambient = scene.children.find(object => object.isAmbientLight && object !== room.skylightDaylight);
    const directional = scene.children.find(object => object.isDirectionalLight);
    for (const light of [ambient, directional, room.galleryFillLight, room.skylightDaylight].filter(Boolean)) colors.set(light, light.color.clone());
    const surfaces = Object.entries(room.materials).map(([key, material]) => ({ key, material, color: material.color.clone() }));
    const reveal = room.layout.ceiling.material[1];
    const revealColor = reveal?.color.clone();
    const trimFaces = (room.layout.skylightLip?.children ?? []).map(mesh => {
        const original = mesh.material;
        const bottom = original.clone(), band = original.clone();
        mesh.material = [band, band, original, bottom, band, band];
        return { mesh, original, color: original.color.clone(), bottom, band };
    });
    const lines = scene.children.filter(object => object.isLineSegments);
    const lineColors = lines.map(line => {
        const skylight = line.name === 'skylight-edge-lines';
        return { line, on: new THREE.Color(skylight ? room.options.skylightLipEdgeColor : room.options.cornerLines),
            off: new THREE.Color(skylight ? room.options.skylightLipOffEdgeColor : room.options.galleryOffEdgeColor) };
    });
    const verticals = scene.getObjectByName('skylight-vertical-lines');
    const corners = new THREE.Group();
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 8);
    const material = new THREE.MeshBasicMaterial({ toneMapped: false });
    if (verticals) {
        verticals.visible = false;
        const positions = verticals.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i += 2) {
            const from = new THREE.Vector3().fromBufferAttribute(positions, i);
            const to = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
            const direction = to.clone().sub(from);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.length = direction.length();
            mesh.position.copy(from).add(to).multiplyScalar(0.5);
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
            corners.add(mesh);
        }
    }
    scene.add(corners);
    const selects = new Set();
    let selection = 'auto';
    let current = null;
    // Match the workshop HSV wheel: full value preserves the surface's base color.
    const tint = (hue, saturation, value = 1) => {
        const h = ((hue % 360) + 360) % 360 / 60, s = saturation / 100;
        const c = value * s, x = c * (1 - Math.abs(h % 2 - 1)), m = value - c;
        const rgb = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x]
            : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
        return new THREE.Color().setRGB(...rgb.map(channel => channel + m), THREE.SRGBColorSpace);
    };
    const apply = () => {
        current = getCaliforniaSkyPeriod(new Date(), selection);
        const state = roomLights.isOn() ? 'on' : 'off';
        const p = SKY_DEFAULTS.skies[current.sky].states[state].lighting;
        computer?.setSky(current.sky);
        scene.background = textures[current.sky];
        scene.backgroundIntensity = p.sky;
        const roomTint = tint(p.hue, p.saturation, p.value);
        for (const [light, color] of colors) light.color.copy(color).multiply(roomTint);
        if (ambient) ambient.intensity = p.ambient * p.room;
        if (directional) directional.intensity = p.directional * p.room;
        if (room.galleryFillLight) room.galleryFillLight.intensity = p.fill * p.room;
        if (room.skylightDaylight) room.skylightDaylight.intensity = p.daylight * p.room;
        room.skylightTreeMaterial?.color.setScalar(p.trees);
        room.skylightOutside?.traverse(object => {
            if (object.isLineSegments) object.material.color.setHex(0x333333).multiplyScalar(p.trees);
        });
        for (const { key, material, color } of surfaces) material.color.copy(color).multiplyScalar(p[key]);
        const lipTint = tint(p.lipHue, p.lipSaturation, p.lipValue);
        if (reveal) reveal.color.copy(revealColor).multiply(lipTint).multiplyScalar(p.reveal);
        for (const face of trimFaces) {
            face.original.color.copy(face.color).multiply(lipTint).multiplyScalar(p.trim);
            face.bottom.color.copy(face.original.color).multiply(tint(p.bottomHue, p.bottomSaturation, p.bottomValue)).multiplyScalar(p.lipBottom);
            face.band.color.copy(face.original.color).multiply(tint(p.bandHue, p.bandSaturation, p.bandValue)).multiplyScalar(p.lipBand);
        }
        material.color.setHex(state === 'on' ? room.options.skylightEdgeColor : room.options.skylightOffEdgeColor)
            .multiply(lipTint).multiplyScalar(p.verticalBrightness);
        corners.visible = p.verticalThickness > 0;
        for (const mesh of corners.children) mesh.scale.set(p.verticalThickness / 40, mesh.userData.length, p.verticalThickness / 40);
        for (const { line, on, off } of lineColors) line.material.color.copy(state === 'on' ? on : off)
            .multiplyScalar(line.name.startsWith('skylight-') ? p.edges : p.roomEdges);
        scene.traverse(object => {
            if (!object.userData?.isLightFixture) return;
            const face = object.material[3];
            face.color.setScalar(p.fixtures);
            if (state === 'on') face.emissive.setRGB(14, 13.2, 11.5).multiply(roomTint).multiplyScalar(p.fixtureGlow);
            else face.emissive.copy(roomTint).multiplyScalar(p.fixtureGlow);
        });
        for (const select of selects) select.value = selection;
    };
    const api = {
        setSelection(value) {
            if (!['auto', 'day', 'dawn', 'evening', 'night'].includes(value)) return;
            selection = value;
            apply();
        },
        addControls(panel) {
            if (!panel || panel.querySelector('[data-sky-period]')) return;
            const label = document.createElement('label');
            label.innerHTML = '<span class="modal-label">sky</span>: <select data-sky-period aria-label="Sky time of day"><option value="auto">Automatic · California time</option><option value="day">Day</option><option value="dawn">Dawn</option><option value="evening">Evening</option><option value="night">Night</option></select>';
            const select = label.querySelector('select');
            select.value = selection;
            select.addEventListener('change', () => api.setSelection(select.value));
            for (const type of ['click', 'pointerdown', 'dblclick']) label.addEventListener(type, event => event.stopPropagation());
            selects.add(select);
            panel.appendChild(label);
        },
        getState: () => ({ ...current, selection }),
        dispose() {
            clearInterval(timer); unsubscribe();
            if (room.skyLighting === api) room.skyLighting = null;
            for (const select of selects) select.parentElement.remove();
            for (const face of trimFaces) { face.mesh.material = face.original; face.bottom.dispose(); face.band.dispose(); }
            scene.remove(corners); geometry.dispose(); material.dispose();
            Object.values(textures).forEach(map => map.dispose());
        },
    };
    // Subscribe after construction; notifications include every real flicker pulse.
    const unsubscribe = roomLights.onChange(apply);
    const timer = setInterval(apply, 30000);
    room.skyLighting = api;
    for (const label of room.stage.querySelectorAll('[data-room-audio]')) api.addControls(label.parentElement);
    return api;
}

export const SKY_OPTIONS = Object.freeze({
    day: { label: 'Current day sky', path: './assets/rooms/images/static_images/windows.png' },
    stars: { label: 'Stars 1', path: './assets/rooms/images/skies/stars-1.png' },
    sunset: { label: 'Doom sunset', path: './assets/rooms/images/skies/doom-sunset.png' },
});
const SKY_WORKSHOP_STORAGE_KEY = 'y9k-test-sky-workshop-v1';
// Every slider is a separate value in each sky's lights-on and lights-off profile.
export const SKY_CONTROLS = Object.freeze({
    room: ['Room light brightness', 0, 3, 0.05],
    sky: ['Sky brightness', 0, 3, 0.05],
    trees: ['Trees brightness', 0, 3, 0.05],
    reveal: ['Inside opening brightness', 0, 3, 0.05],
    lipBand: ['Skylight lip side band brightness multiplier', 0, 3, 0.05],
    lipBottom: ['Skylight lip underside brightness multiplier', 0, 3, 0.05],
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
    return 'sunset';
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
        bandHue: 0, bandSaturation: 0, bandValue: 1, lipBand: 1, value: 1, lipValue: 1, lipBottom: 1, bottomHue: 0, bottomSaturation: 0, bottomValue: 1, hue: 0, saturation: 0, lipHue: 0, lipSaturation: 0, fixtures: 1 };
    const on = { ...common, ambient: options.ambientLight ?? 2.7, directional: options.directionalLight ?? 0.55,
        fill: 0, daylight: 0, fixtureGlow: options.galleryFixtureBrightness ?? 1 };
    const off = { ...common, ambient: options.galleryOffAmbientLight ?? 0.05,
        directional: options.galleryOffDirectionalLight ?? 0.04, fill: options.galleryFillIntensity ?? 68,
        daylight: options.skylightLightIntensity ?? 0.35, fixtureGlow: options.galleryFixtureOffGlow ?? 0.9 };
    const defaults = {
        selection: 'auto', dayStart: 6, sunsetStart: 17, nightStart: 20,
        colorTargetsByState: Object.fromEntries(Object.keys(SKY_OPTIONS).flatMap(sky => ['on', 'off'].map(mode => [`${sky}:${mode}`, 'room']))),
        colorTargets: { day: 'room', sunset: 'room', stars: 'room' },
        profiles: {
            day: { on: { ...on }, off: { ...off } },
            sunset: { on: { ...on, trees: 0.65, reveal: 0.7 },
                off: { ...off, room: 0.75, trees: 0.55, reveal: 0.65, hue: 28, saturation: 30, daylight: 0.2 } },
            stars: { on: { ...on, sky: 0.7, trees: 0.15, reveal: 0.2 },
                off: { ...off, room: 0.3, sky: 0.55, trees: 0.05, reveal: 0.1, trim: 0.5,
                    wall: 0.95, floor: 1.1, ceiling: 1, roomEdges: 0, edges: 0.1,
                    verticalThickness: 0.07, verticalBrightness: 0, ambient: 0.1, directional: 0.55,
                    hue: 215, saturation: 20, lipHue: 211.363636, lipSaturation: 17.254902,
                    fill: 20, daylight: 0.05, fixtures: 1, fixtureGlow: 0.25 } },
        },
    };
    // Keep unexported fields at their existing defaults, then apply approved tuning.
    for (const sky of Object.keys(SKY_OPTIONS)) for (const mode of ['on', 'off']) {
        Object.assign(defaults.profiles[sky][mode], SKY_DEFAULTS.skies[sky].states[mode].lighting);
        defaults.colorTargetsByState[`${sky}:${mode}`] = SKY_DEFAULTS.skies[sky].states[mode].colorTarget;
    }
    return defaults;
}

export function restoreSkySettings(saved, defaults) {
    const settings = structuredClone(defaults);
    if (!saved || typeof saved !== 'object') return settings;
    if (saved.selection === 'sunset2') settings.selection = 'sunset';
    if (saved.selection === 'auto' || Object.hasOwn(SKY_OPTIONS, saved.selection)) settings.selection = saved.selection;
    const schedule = ['dayStart', 'sunsetStart', 'nightStart'].map(key => saved[key]);
    if (schedule.every(Number.isFinite) && schedule[0] >= 0 && schedule[0] < schedule[1]
        && schedule[1] < schedule[2] && schedule[2] <= 24)
        for (const key of ['dayStart', 'sunsetStart', 'nightStart']) settings[key] = saved[key];
    for (const sky of Object.keys(SKY_OPTIONS))
        if (['room', 'lip', 'bottom', 'band', 'screen'].includes(saved.colorTargets?.[sky])) settings.colorTargets[sky] = saved.colorTargets[sky];
    for (const sky of Object.keys(SKY_OPTIONS)) for (const mode of ['on', 'off']) {
        for (const [key, [, min, max]] of Object.entries({ ...SKY_CONTROLS, bandHue: ['Band hue', 0, 359], bandSaturation: ['Band saturation', 0, 100], bandValue: ['Band value', 0, 1], value: ['Room color value', 0, 1], lipValue: ['Lip color value', 0, 1], bottomHue: ['Underside hue', 0, 359], bottomSaturation: ['Underside saturation', 0, 100], bottomValue: ['Underside value', 0, 1], lipHue: ['Lip hue', 0, 359], lipSaturation: ['Lip saturation', 0, 100] })) {
            const value = saved.profiles?.[sky]?.[mode]?.[key];
            if (typeof value === 'number' && Number.isFinite(value))
                settings.profiles[sky][mode][key] = Math.max(min, Math.min(max, value));
        }
    }
    for (const sky of Object.keys(SKY_OPTIONS)) for (const mode of ['on', 'off']) {
        const key = `${sky}:${mode}`;
        const target = saved.colorTargetsByState?.[key];
        settings.colorTargetsByState[key] = ['room', 'lip', 'bottom', 'band', 'screen'].includes(target) ? target : settings.colorTargets[sky];
    }
    return settings;
}

export async function addSkyWorkshop(room, { computer = null } = {}) {
    if (!room.app || !room.options.gallerySkylight) throw new Error('The sky workshop needs a mounted skylight gallery.');
    const { THREE, scene, textureLoader, canvas, camera, orbit, roomLights } = room.app;
    const defaults = createSkySettings(room.options);
    let saved;
    try { saved = JSON.parse(localStorage.getItem(SKY_WORKSHOP_STORAGE_KEY)); } catch { }
    let settings = restoreSkySettings(saved, defaults);
    // Let the gallery finish setting its original background before replacing it.
    await room.skylightSkyReady;
    const originalBackground = scene.background;
    const originalIntensity = scene.backgroundIntensity;
    const textures = {};
    const results = await Promise.allSettled(Object.entries(SKY_OPTIONS).map(async ([key, sky]) => {
        const texture = await textureLoader.loadAsync(new URL(sky.path, import.meta.url).href);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = texture.minFilter = THREE.NearestFilter;
        textures[key] = texture;
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) { Object.values(textures).forEach(texture => texture.dispose()); throw failure.reason; }
    const style = document.createElement('style');
    style.textContent = SKY_WORKSHOP_STYLES; document.head.appendChild(style);
    const panel = document.createElement('dialog');
    panel.id = 'sky-workshop'; panel.className = 'wall-image-editor';
    panel.setAttribute('aria-labelledby', 'sky-workshop-title');
    panel.innerHTML = makePanel();
    room.stage.appendChild(panel);
    const form = panel.querySelector('form'), fields = form.elements;
    const controller = new AbortController();
    const listen = (target, type, handler, capture = false) =>
        target.addEventListener(type, handler, { capture, signal: controller.signal });
    const save = () => { try { localStorage.setItem(SKY_WORKSHOP_STORAGE_KEY, JSON.stringify(settings)); } catch { } };
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
    // BoxGeometry face 3 faces down. Give only that face an independent material.
    const bottomFaces = (room.layout.skylightLip?.children ?? []).map(mesh => {
        const original = mesh.material, bottom = original.clone(), band = original.clone();
        mesh.material = [band, band, original, bottom, band, band];
        return { mesh, original, bottom, band };
    });
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
    const computerProfile = () => mode === 'off' && currentSky === 'stars' ? 'starsOff' : mode;
    const computerControls = {
        shadowX: ['Shadow X offset', -120, 120, 0.1], shadowY: ['Shadow Y offset', -120, 120, 0.1],
        shadowZ: ['Shadow Z offset', -120, 120, 0.1], shadowReach: ['Size / reach', 1, 240, 1],
        shadowMoldingStrength: ['Baseboard shadow multiplier (0 off, 1 normal)', 0, 2, 0.1],
        shadowStrength: ['Strength', 0, 30, 0.1], shadowDecay: ['Falloff', 0, 4, 0.1],
    };
    const computerSection = panel.querySelector('[data-computer-shadow]');
    computerSection.hidden = !computer;
    if (computer) {
        computerSection.insertAdjacentHTML('beforeend', Object.entries(computerControls).map(([key, [label, min, max, step]]) =>
            `<label class="sky-slider"><span>${label}</span><input name="computer-${key}" aria-label="Computer shadow ${label}" type="range" min="${min}" max="${max}" step="${step}"><output data-computer-output="${key}"></output></label>`).join(''));
    }
    const syncComputerControls = () => {
        if (!computer) return;
        const values = computer.getLighting(computerProfile());
        values.shadowMoldingStrength ??= computer.getLighting(mode).shadowMoldingStrength;
        computerSection.querySelector('legend').textContent = `Computer shadow · ${SKY_OPTIONS[currentSky].label} · lights ${mode}`;
        for (const key of Object.keys(computerControls)) {
            fields[`computer-${key}`].value = values[key];
            panel.querySelector(`[data-computer-output="${key}"]`).textContent =
                `${values[key].toFixed(1)}${['shadowStrength', 'shadowDecay', 'shadowMoldingStrength'].includes(key) ? '' : ' in'}`;
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
        ? computer.getScreenLight() : colorTarget === 'band'
            ? { hue: profile().bandHue, saturation: profile().bandSaturation, value: profile().bandValue } : colorTarget === 'bottom'
            ? { hue: profile().bottomHue, saturation: profile().bottomSaturation, value: profile().bottomValue } : colorTarget === 'lip'
            ? { hue: profile().lipHue, saturation: profile().lipSaturation, value: profile().lipValue } : profile();
    const setSelectedColor = (hue, saturation, value = 1) => {
        if (colorTarget === 'screen' && computer) computer.setScreenLight({ hue, saturation });
        else if (colorTarget === 'band') Object.assign(profile(), { bandHue: hue, bandSaturation: saturation, bandValue: value });
        else if (colorTarget === 'bottom') Object.assign(profile(), { bottomHue: hue, bottomSaturation: saturation, bottomValue: value });
        else if (colorTarget === 'lip') Object.assign(profile(), { lipHue: hue, lipSaturation: saturation, lipValue: value });
        else Object.assign(profile(), { hue, saturation, value });
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
    // Read live component values so the preview and clipboard always describe the same state.
    const exportSettings = () => ({
        version: 1, sky: currentSky, skyLabel: SKY_OPTIONS[currentSky]?.label,
        skyImage: SKY_OPTIONS[currentSky]?.path, lightsOn: mode === 'on',
        selection: settings.selection,
        schedule: { dayStart: settings.dayStart, sunsetStart: settings.sunsetStart, nightStart: settings.nightStart },
        colorTarget, lighting: structuredClone(profile()), computer: computer?.getSettings() ?? null,
    });
    const exportAllSettings = () => ({
        version: 1, selection: settings.selection,
        schedule: { dayStart: settings.dayStart, sunsetStart: settings.sunsetStart, nightStart: settings.nightStart },
        skies: Object.fromEntries(Object.entries(SKY_OPTIONS).map(([sky, info]) => [sky, {
            label: info.label, skyImage: info.path,
            states: Object.fromEntries(['on', 'off'].map(state => [state, {
                lightsOn: state === 'on',
                colorTarget: settings.colorTargetsByState[`${sky}:${state}`] ?? 'room',
                lighting: structuredClone(settings.profiles[sky][state]),
                computer: computer?.getSettings(sky, state) ?? null,
            }])),
        }])),
    });
    const syncJson = () => {
        for (const input of panel.querySelectorAll('[data-range-input]')) {
            if (document.activeElement !== input) input.value = fields[input.dataset.rangeInput].value;
        }
        panel.querySelector('[data-settings-json]').textContent = JSON.stringify(exportSettings(), null, 2);
        panel.querySelector('[data-all-settings-json]').textContent = JSON.stringify(exportAllSettings(), null, 2);
    };
    const syncFields = () => {
        syncComputerControls(); syncScreenControls();
        fields.colorTarget.value = colorTarget;
        fields.skySelection.value = settings.selection;
        fields.lightsOn.checked = mode === 'on';
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
        const rgb = hsvToRgb(color.hue, color.saturation / 100, color.value ?? 1);
        const hex = '#' + rgb.map(value => Math.round(value * 255).toString(16).padStart(2, '0')).join('');
        if (document.activeElement !== fields.hexColor) fields.hexColor.value = hex;
        panel.querySelector('[data-color]').style.backgroundColor = hex;
        panel.querySelector('[data-color]').style.color = rgb.reduce((a, b) => a + b) > 1.5 ? '#111' : 'white';
        const angle = color.hue * Math.PI / 180, radius = color.saturation / 100 * 50;
        const marker = panel.querySelector('[data-wheel-marker]');
        marker.style.left = `${50 + Math.cos(angle) * radius}%`;
        marker.style.top = `${50 + Math.sin(angle) * radius}%`;
        syncJson();
        wheel.setAttribute('aria-valuetext', `Hue ${color.hue.toFixed(0)} degrees, saturation ${color.saturation.toFixed(0)} percent`);
    };
    const apply = () => {
        const p = profile(), tint = new THREE.Color().setRGB(...hsvToRgb(p.hue, p.saturation / 100, p.value), THREE.SRGBColorSpace);
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
        const lipTint = new THREE.Color().setRGB(...hsvToRgb(p.lipHue, p.lipSaturation / 100, p.lipValue), THREE.SRGBColorSpace);
        if (reveal) reveal.color.copy(revealColor).multiply(lipTint).multiplyScalar(p.reveal);
        if (trim) trim.color.copy(trimColor).multiply(lipTint).multiplyScalar(p.trim);
        const bottomTint = new THREE.Color().setRGB(...hsvToRgb(p.bottomHue, p.bottomSaturation / 100, p.bottomValue), THREE.SRGBColorSpace);
        for (const { bottom } of bottomFaces) bottom.color.copy(trim.color).multiply(bottomTint).multiplyScalar(p.lipBottom);
        const bandTint = new THREE.Color().setRGB(...hsvToRgb(p.bandHue, p.bandSaturation / 100, p.bandValue), THREE.SRGBColorSpace);
        for (const { band } of bottomFaces) band.color.copy(trim.color).multiply(bandTint).multiplyScalar(p.lipBand);
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
        if (sky !== currentSky) {
            currentSky = sky;
            colorTarget = settings.colorTargetsByState[`${sky}:${mode}`] ?? settings.colorTargets[sky];
            if (colorTarget === 'screen' && !computer) colorTarget = 'room';
            computer?.setSky(currentSky);
            apply(); syncFields();
        }
    };
    // Pair every slider with a numeric field; native arrows use finer increments.
    for (const range of panel.querySelectorAll('input[type="range"]')) {
        const input = document.createElement('input');
        input.type = 'number'; input.min = range.min; input.max = range.max;
        input.step = String(Number(range.step) / 10); input.dataset.rangeInput = range.name;
        input.setAttribute('aria-label', `${range.getAttribute('aria-label') ?? range.name} precise value`);
        range.step = input.step;
        range.insertAdjacentElement('afterend', input);
        listen(input, 'input', event => {
            event.stopPropagation();
            if (input.value === '' || !input.validity.valid) return;
            range.value = input.value;
            range.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }
    listen(fields.hexColor, 'change', () => {
        const hex = fields.hexColor.value.trim();
        if (!/^#[0-9a-f]{6}$/i.test(hex)) {
            fields.hexColor.setCustomValidity('Enter a six-digit hex color, such as #d3e8ff.');
            fields.hexColor.reportValidity(); return;
        }
        fields.hexColor.setCustomValidity('');
        const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
        const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
        let hue = 0;
        if (delta) hue = 60 * (max === rgb[0] ? ((rgb[1] - rgb[2]) / delta + 6) % 6
            : max === rgb[1] ? (rgb[2] - rgb[0]) / delta + 2 : (rgb[0] - rgb[1]) / delta + 4);
        setSelectedColor(hue, max ? delta / max * 100 : 0, max);
        apply(); syncFields(); save();
    });
    listen(fields.hexColor, 'input', () => fields.hexColor.setCustomValidity(''));
    tick();
    const unsubscribe = roomLights.onChange(on => { mode = on ? 'on' : 'off'; colorTarget = settings.colorTargetsByState[`${currentSky}:${mode}`] ?? 'room'; apply(); if (panel.open) syncFields(); });
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
            computer.setLighting(computerProfile(), { [key.slice('computer-'.length)]: Number(event.target.value) });
            syncComputerControls();
            return;
        }
        if (!Object.hasOwn(SKY_CONTROLS, key)) return;
        profile()[key] = Number(event.target.value);
        apply(); syncFields(); save();
    });
    listen(fields.colorTarget, 'change', () => {
        colorTarget = fields.colorTarget.value; settings.colorTargetsByState[`${currentSky}:${mode}`] = colorTarget; syncFields(); save();
    });
    listen(fields.skySelection, 'change', () => { settings.selection = fields.skySelection.value; tick(); apply(); syncFields(); save(); });
    listen(fields.lightsOn, 'change', () => { room.setLights(fields.lightsOn.checked); });
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
        room.setLights(false);
    });
    listen(fields.defaults, 'click', () => {
        settings.profiles[currentSky][mode] = structuredClone(defaults.profiles[currentSky][mode]);
        colorTarget = settings.colorTargetsByState[`${currentSky}:${mode}`] = defaults.colorTargetsByState[`${currentSky}:${mode}`];
        computer?.restoreSkyDefaults();
        apply(); syncFields(); save();
    });
    // These listeners run after the control handlers have applied their new values.
    listen(form, 'input', syncJson);
    listen(form, 'change', syncJson);
    listen(panel.querySelector('[data-json-details]'), 'toggle', syncJson);
    const copySettings = async all => {
        syncJson();
        const text = JSON.stringify(all ? exportAllSettings() : exportSettings(), null, 2);
        const status = panel.querySelector('[data-copy-status]');
        try {
            await navigator.clipboard.writeText(text);
            status.textContent = all ? 'All sky / light states copied.' : 'Current state copied.';
        } catch {
            panel.querySelector(all ? '[data-all-json-details]' : '[data-json-details]').open = true;
            status.textContent = 'Clipboard unavailable. Select and copy the JSON below.';
        }
    };
    listen(fields.copyJson, 'click', () => copySettings(false));
    listen(fields.copyAllJson, 'click', () => copySettings(true));
    listen(panel, 'keydown', event => {
        event.stopPropagation();
        // Nonmodal dialogs need an explicit Escape handler.
        if (event.key === 'Escape') { event.preventDefault(); panel.close(); }
    });
    // Keep the exposed room interactive while the workshop controls remain open.
    const open = () => { tick(); syncFields(); if (!panel.open) panel.show(); };
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
        panel.close(); panel.remove(); style.remove();
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
        for (const { mesh, original, bottom, band } of bottomFaces) { mesh.material = original; bottom.dispose(); band.dispose(); }
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
            <p>Day → sunset → stars. No location permission is needed.</p>
            <label>Day starts <input name="dayStart" type="number" min="0" max="24" step="0.5"></label>
            <label>Sunset starts <input name="sunsetStart" type="number" min="0" max="24" step="0.5"></label>
            <label>Night starts <input name="nightStart" type="number" min="0" max="24" step="0.5"></label>
        </details>
        <label><input name="lightsOn" type="checkbox"> Lights on</label>
        <fieldset><legend data-profile></legend>
            <p>Settings save separately for each sky and light state. 0 is dark; 1 is normal for surface brightness.</p>
            <label>Color picker controls <select name="colorTarget"><option value="room">Room light</option><option value="lip">Skylight lip / inside opening</option><option value="band">Skylight lip side band</option><option value="bottom">Skylight lip underside</option><option value="screen">Computer screen light</option></select></label>
            <div class="sky-wheel"><canvas width="200" height="200" tabindex="0" role="slider" aria-label="Light hue and saturation" aria-valuemin="0" aria-valuemax="359"></canvas><span data-wheel-marker></span></div>
            <label>Hex color <input data-color name="hexColor" type="text" maxlength="7" spellcheck="false" aria-label="Hex color"></label><p>Wheel: hue around the edge, saturation toward the rim. Arrow keys also adjust the color.</p>
            ${sliders}
        </fieldset>
        <fieldset data-screen-light hidden><legend>Computer screen light</legend>
            <label>Enabled while computer is on <input name="screenEnabled" type="checkbox"></label><br>
            <label>Preview light while computer is off <input name="screenPreview" type="checkbox"></label>
            <p>Offsets follow the computer's rotation. Positive Z is in front of the screen. Set its hue using the color picker dropdown above.</p>
        </fieldset>
        <fieldset data-computer-shadow hidden><legend>Computer shadow · current sky / light state</legend>
            <p>These controls edit the selected sky and current electric-light state only. Each sky keeps its own computer settings.</p>
            <button type="button" name="previewComputerShadow">preview current sky with lights off</button>
        </fieldset>
        <details data-json-details><summary>Current sky / light state JSON</summary><pre data-settings-json tabindex="0" aria-label="Current settings JSON"></pre></details>
        <button type="button" name="copyJson">copy current state JSON</button>
        <details data-all-json-details><summary>All skies / light states JSON</summary><pre data-all-settings-json tabindex="0" aria-label="All settings JSON"></pre></details>
        <button type="button" name="copyAllJson">copy all skies / light states JSON</button>
        <span role="status" data-copy-status></span>
        <div role="status" data-status></div>
        <div class="wall-editor-actions"><button type="button" name="defaults">restore current sky / light state defaults</button><button>done</button></div>
    </form>`;
}
