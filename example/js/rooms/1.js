import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { createAddElectricalBox } from "./electrical-box.js";
import { createAddExitSign } from "./exit-sign.js";
import { createAddFoldingChairs } from "./folding-chairs.js";
import { createCheckAndActivateAudio, runOnFirstPointerDown } from "./audio-activate.js";
import { createAddVent, ventPositionsAlongWall } from "./vent.js";
import { createAddLightFixture, lightPositionsAlong } from "./light-fixture.js";
import { createAddBoxStack } from "./box-stack.js";
import { createAddLightSwitch } from "./light-switch.js";
import { addHallMolding } from "./molding.js";
import { initDevMode } from "./dev-mode.js";
import { createWallClickHelper } from "./wall-click.js";

const canvas = document.createElement("canvas");
const stage = document.getElementById("stage");
stage.appendChild(canvas);

const MUSIC_VOLUME = 0.25;
const DOOR_SFX_VOLUME = 1;
const DOOR_LOCKED_SOUND = "music/door-soft-complete.mp3";
const DOOR_UNLOCKED_SOUND = "music/door-soft-complete.mp3";
const SOUND_PREF_KEY = "y9k-sound-on";

const readSoundPref = () => {
    try {
        const v = localStorage.getItem(SOUND_PREF_KEY);
        if (v === null) return false;
        return v === "1" || v === "true";
    } catch {
        return false;
    }
};

const writeSoundPref = (on) => {
    try {
        localStorage.setItem(SOUND_PREF_KEY, on ? "1" : "0");
    } catch (_) {}
};

let IS_SOUND_ON = readSoundPref();

const AUTO_SPIN = 0.00035;
const DRAG_SENS = 0.005;
const ORBIT_RADIUS = 1.4;
const LOOK_AT_Y = 0.4;
const CAM_Y = 0.6;

const AMBIENT_LIGHT_LEVEL = 0.05;
const DIRECTIONAL_LIGHT_LEVEL = 0.04;

// Smaller than the gallery (20×7.5×20); plus arms sized below.
const ROOM_HEIGHT = 3.75;

let angle = 0;
let lastX = 0;
let dragging = false;
let didDrag = false;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const DRAG_THRESHOLDER = 4;
const clickableDoors = [];

const MUSIC_PATH = "music/wind-indoors-1-muffled.mp3";
const musicToggle = document.getElementById("music-toggle");
let musicAudio = null;

const textureLoader = new THREE.TextureLoader();

const ensureMusicAudio = () => {
    if (musicAudio) return musicAudio;
    musicAudio = new Audio(MUSIC_PATH);
    musicAudio.loop = true;
    musicAudio.volume = MUSIC_VOLUME;
    return musicAudio;
};

const syncMusicToggleUi = () => {
    musicToggle.textContent = IS_SOUND_ON ? "🔊" : "🔇";
    musicToggle.title = IS_SOUND_ON ? "mute sound" : "play sound";
    musicToggle.setAttribute("aria-label", IS_SOUND_ON ? "mute sound" : "play music");
};

const toggleMusic = async () => {
    const a = ensureMusicAudio();
    try {
        if (IS_SOUND_ON) {
            a.pause();
            IS_SOUND_ON = false;
        } else {
            await a.play();
            IS_SOUND_ON = true;
        }
    } catch (err) {
        console.warn("sound play blocked or failed", err);
    }
    writeSoundPref(IS_SOUND_ON);
    syncMusicToggleUi();
};

musicToggle.addEventListener("click", e => {
    e.stopPropagation();
    toggleMusic();
});

const restoreSound = async () => {
    syncMusicToggleUi();
    if (!IS_SOUND_ON) return;
    try {
        await ensureMusicAudio().play();
    } catch (_) {
        // Autoplay may be blocked until a user gesture; preference stays on for SFX.
    }
    syncMusicToggleUi();
};
restoreSound();

const checkAndActivateAudio = createCheckAndActivateAudio({ ensureMusicAudio });
runOnFirstPointerDown(checkAndActivateAudio);

const playDoorSound = (soundPath) => {
    if (!IS_SOUND_ON) return Promise.resolve();
    return new Promise(resolve => {
        const a = new Audio(soundPath);
        a.volume = DOOR_SFX_VOLUME;
        const done = () => resolve();
        a.addEventListener("ended", done, { once: true });
        a.addEventListener("error", done, { once: true });
        a.play().catch(done);
    });
};

canvas.style.cursor = "grab";

canvas.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    dragging = true;
    didDrag = false;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
});

canvas.addEventListener("pointermove", e => {
    if (!dragging) {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(clickableDoors);
        canvas.style.cursor = hits.length ? "pointer" : "grab";
        return;
    }

    const dx = e.clientX - lastX;
    if (Math.abs(dx) > DRAG_THRESHOLDER) didDrag = true;
    lastX = e.clientX;
    angle += dx * DRAG_SENS;
});

const endDrag = e => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = "grab";

    try {
        canvas.releasePointerCapture(e.pointerId);
    } catch (_err) {}

    if (didDrag) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(clickableDoors);
    if (!hits.length) return;

    const obj = hits[0].object;
    if (obj.userData.isLightSwitch) {
        playDoorSound(DOOR_LOCKED_SOUND);
        return;
    }
    if (obj.userData.isDoor) {
        if (obj.userData.locked) {
            playDoorSound(DOOR_LOCKED_SOUND);
            return;
        }
        const href = obj.userData.href;
        playDoorSound(DOOR_UNLOCKED_SOUND).then(() => {
            if (href) window.location.href = href;
        });
    }
};

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, CAM_Y, 0);

const syncViewportSize = () => {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
};
syncViewportSize();
window.addEventListener("resize", syncViewportSize);
window.addEventListener("orientationchange", () => setTimeout(syncViewportSize, 150));
stage.addEventListener("fullscreenchange", syncViewportSize);
stage.addEventListener("webkitfullscreenchange", syncViewportSize);

initDevMode({ stage });

const toggleWindowed = () => {
    document.body.classList.toggle("is-windowed");
    syncViewportSize();
};

document.addEventListener("keydown", e => {
    if (e.key === "f" || e.key === "F") {
        if (e.target.closest("input, textarea, [contenteditable]")) return;
        e.preventDefault();
        toggleWindowed();
    }
});

const wallMat = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, side: THREE.FrontSide });
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, side: THREE.FrontSide });
const floorMat = new THREE.MeshStandardMaterial({ color: 0xa6a6a6, side: THREE.FrontSide });

textureLoader.load("images/static_images/floor-2.jpg", tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(.2, .2);
    floorMat.map = tex;
    floorMat.color.set(0xffffff);
    floorMat.needsUpdate = true;
});

// Plus / cross floorplan (overhead): short hallways on N/E/S/W.
const ARM_WIDTH = 3.5;
const CROSS_SPAN = 11;
const ROOM_HALF_Y = ROOM_HEIGHT / 2;
const hw = ARM_WIDTH / 2;
const hl = CROSS_SPAN / 2;
const WALL_INSET = 0.05;

// Outline in XZ, CCW when viewed from above (Y up).
const PLUS_OUTLINE = [
    [-hw, -hl],
    [hw, -hl],
    [hw, -hw],
    [hl, -hw],
    [hl, hw],
    [hw, hw],
    [hw, hl],
    [-hw, hl],
    [-hw, hw],
    [-hl, hw],
    [-hl, -hw],
    [-hw, -hw],
];

const createPlusShape = () => {
    const s = new THREE.Shape();
    const [x0, z0] = PLUS_OUTLINE[0];
    // Shape is XY; second coord becomes world Z after rotateX(π/2).
    s.moveTo(x0, z0);
    for (let i = 1; i < PLUS_OUTLINE.length; i++) {
        s.lineTo(PLUS_OUTLINE[i][0], PLUS_OUTLINE[i][1]);
    }
    s.lineTo(x0, z0);
    return s;
};

const plusShape = createPlusShape();

const floor = new THREE.Mesh(new THREE.ShapeGeometry(plusShape), floorMat);
floor.rotation.x = Math.PI / 2;
floor.position.y = -ROOM_HALF_Y;
// rotateX(π/2) points normals down; flip so the top face is visible from inside.
floor.scale.z = -1;
scene.add(floor);

const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(plusShape), ceilingMat);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = ROOM_HALF_Y;
scene.add(ceiling);

const wallClick = createWallClickHelper({ canvas, camera, stage, scene });
wallClick.addWallsFromOutline(PLUS_OUTLINE, { material: wallMat, height: ROOM_HEIGHT });

const addVerticalCornerLines = (corners, height, color = 0x111111) => {
    const hy = height / 2;
    const inset = 0.02;
    const positions = [];

    for (const [x, z] of corners) {
        // Nudge slightly toward center so lines sit on the interior corner.
        const nx = x === 0 ? 0 : -Math.sign(x) * inset;
        const nz = z === 0 ? 0 : -Math.sign(z) * inset;
        positions.push(x + nx, -hy, z + nz, x + nx, hy, z + nz);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color })));
};

addVerticalCornerLines(PLUS_OUTLINE, ROOM_HEIGHT, 0x111111);
addHallMolding(scene, PLUS_OUTLINE, ROOM_HEIGHT);

const addWallDoor = (wall, imageFile, doorHeight, {
    bright = false,
    locked = true,
    href = null,
} = {}) => new Promise(resolve => {
    textureLoader.load(imageFile, tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;

        const aspect = tex.image.width / tex.image.height;
        const imageWidth = doorHeight * aspect;
        const imageHeight = Math.min(doorHeight, ROOM_HEIGHT);

        const material = bright
            ? new THREE.MeshStandardMaterial({
                map: tex,
                color: 0xffffff,
                emissive: 0xffffff,
                emissiveMap: tex,
                emissiveIntensity: .5,
                toneMapped: false,
            })
            : new THREE.MeshStandardMaterial({ map: tex });

        const door = new THREE.Mesh(
            new THREE.PlaneGeometry(imageWidth, imageHeight),
            material
        );

        const ly = -ROOM_HALF_Y + imageHeight / 2;

        if (wall === "north") {
            door.position.set(0, ly, -(hl - WALL_INSET));
        } else if (wall === "south") {
            door.position.set(0, ly, hl - WALL_INSET);
            door.rotation.y = Math.PI;
        } else if (wall === "west") {
            door.position.set(-(hl - WALL_INSET), ly, 0);
            door.rotation.y = Math.PI / 2;
        } else if (wall === "east") {
            door.position.set(hl - WALL_INSET, ly, 0);
            door.rotation.y = -Math.PI / 2;
        } else {
            console.warn("Invalid wall: ", wall);
            resolve(null);
            return;
        }

        door.userData.isDoor = true;
        door.userData.wall = wall;
        door.userData.locked = locked;
        door.userData.href = href;
        clickableDoors.push(door);
        scene.add(door);
        resolve(door);
    });
});

const DOOR_HEIGHT = 3.2;

// Room map (overhead):
//           [index]
//              |
//   [3]--[1]--[4]
//              |
//           [2]
const addElectricalBox = createAddElectricalBox({ scene, textureLoader, roomHalfY: ROOM_HALF_Y });
const addExitSign = createAddExitSign({ scene, textureLoader, roomHalfY: ROOM_HALF_Y });
const addFoldingChairs = createAddFoldingChairs({ scene, textureLoader, roomHalfY: ROOM_HALF_Y });
const ARM_SIDE = hl - hw;
const hallWalls = {
    // Arm side walls only — end walls have doors; north-arm east has the electrical box.
    west: { x: -(hw - WALL_INSET), leftZ: hw, rightZ: hl },       // north-arm west
    east: { x: hw - WALL_INSET, leftZ: -hw, rightZ: -hl },         // south-arm east
    north: { z: -(hw - WALL_INSET), leftX: hw, rightX: hl },       // east-arm south side
    south: { z: hw - WALL_INSET, leftX: -hw, rightX: -hl },        // west-arm north side
};
const addVent = createAddVent({
    scene,
    textureLoader,
    roomHalfY: ROOM_HALF_Y,
    walls: hallWalls,
});
const addLightFixture = createAddLightFixture({ scene, textureLoader, roomHalfY: ROOM_HALF_Y });
const addBoxStack = createAddBoxStack({ scene, textureLoader, roomHalfY: ROOM_HALF_Y });
const addLightSwitch = createAddLightSwitch({
    scene,
    textureLoader,
    roomHalfY: ROOM_HALF_Y,
    doorHeight: DOOR_HEIGHT,
    clickable: clickableDoors,
});
const ELECTRICAL_IMG = "images/static_images/electrical.jpg";

addWallDoor("north", "images/door-3.jpg", DOOR_HEIGHT, {
    bright: true,
    locked: false,
    href: "./index.html",
}).then(door => { if (door) addExitSign(door); });
addWallDoor("south", "images/door-1.jpg", DOOR_HEIGHT, {
    locked: false,
    href: "./2.html",
});
addWallDoor("west", "images/door-1.jpg", DOOR_HEIGHT, {
    locked: false,
    href: "./3.html",
});
addWallDoor("east", "images/door-1.jpg", DOOR_HEIGHT, {
    locked: false,
    href: "./4.html",
});

addElectricalBox("east", hw - WALL_INSET, (hw + hl) * 0.55, ELECTRICAL_IMG);
{
    const sw = 0.58; // center-to-center spacing in a set
    // Beside the north door only.
    addLightSwitch("north", 0.9, -(hl - WALL_INSET));
    // Set of 2 on the empty north-arm west wall.
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
    for (const x of ventPositionsAlongWall(ARM_SIDE, 1)) addVent("west", x);
    for (const x of ventPositionsAlongWall(ARM_SIDE, 1)) addVent("east", x);
    for (const x of ventPositionsAlongWall(ARM_SIDE, 1)) addVent("north", x);
    for (const x of ventPositionsAlongWall(ARM_SIDE, 1)) addVent("south", x);
}
{
    // One fixture centered in each arm, long axis along the corridor.
    for (const t of lightPositionsAlong(ARM_SIDE, 1)) {
        addLightFixture(0, hw + t, Math.PI / 2);   // north arm
        addLightFixture(0, -hw - t, Math.PI / 2);  // south arm
        addLightFixture(hw + t, 0, 0);             // east arm
        addLightFixture(-hw - t, 0, 0);            // west arm
    }
}
{
    // East-arm north wall (away from doors / chairs / electrical on north-arm east).
    const z = hw - WALL_INSET;
    const base = hw + 1.05;
    addBoxStack(base, z, "south", 3);
    addBoxStack(base + 1.2, z, "south", 2);
    addBoxStack(base + 1.2 + 1.45, z, "south", 3);
    // Single stack on west-arm south wall.
    addBoxStack(-(hw + 1.6), -(hw - WALL_INSET), "north", 2);
}

scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_LIGHT_LEVEL));
const light = new THREE.DirectionalLight(0xffffff, DIRECTIONAL_LIGHT_LEVEL);
light.position.set(1, 3, 2);
scene.add(light);

const loop = () => {
    if (!dragging) angle += AUTO_SPIN;

    camera.position.x = Math.sin(angle) * ORBIT_RADIUS;
    camera.position.y = CAM_Y;
    camera.position.z = Math.cos(angle) * ORBIT_RADIUS;
    camera.lookAt(0, LOOK_AT_Y, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
};

loop();
