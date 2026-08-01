import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.createElement("canvas");
const stage = document.getElementById("stage");
stage.appendChild(canvas);

const MUSIC_VOLUME = 0.25;
const DOOR_SFX_VOLUME = 1;
const DOOR_LOCKED_SOUND = "music/door-locked.mp3";
const DOOR_UNLOCKED_SOUND = "music/door-squeek-complete.mp3";
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

const ROOM_HEIGHT = 3.75;

let angle = 0;
let lastX = 0;
let dragging = false;
let didDrag = false;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const DRAG_THRESHOLDER = 4;
const clickableDoors = [];

const MUSIC_PATH = "music/wind-indoors-1.mp3";
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

    if (hits.length > 0 && hits[0].object.userData.isDoor) {
        const door = hits[0].object;
        if (door.userData.locked) {
            playDoorSound(DOOR_LOCKED_SOUND);
            return;
        }
        const href = door.userData.href;
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

// L floorplan: north + east arms only.
const ARM_WIDTH = 3.5;
const CROSS_SPAN = 11;
const ROOM_HALF_Y = ROOM_HEIGHT / 2;
const hw = ARM_WIDTH / 2;
const hl = CROSS_SPAN / 2;
const WALL_INSET = 0.05;

// Outline in XZ, CCW when viewed from above (Y up). Arms: N, E.
const HALL_OUTLINE = [
    [-hw, -hl],
    [hw, -hl],
    [hw, -hw],
    [hl, -hw],
    [hl, hw],
    [-hw, hw],
];

const createHallShape = () => {
    const s = new THREE.Shape();
    const [x0, z0] = HALL_OUTLINE[0];
    s.moveTo(x0, z0);
    for (let i = 1; i < HALL_OUTLINE.length; i++) {
        s.lineTo(HALL_OUTLINE[i][0], HALL_OUTLINE[i][1]);
    }
    s.lineTo(x0, z0);
    return s;
};

const hallShape = createHallShape();

const floor = new THREE.Mesh(new THREE.ShapeGeometry(hallShape), floorMat);
floor.rotation.x = Math.PI / 2;
floor.position.y = -ROOM_HALF_Y;
floor.scale.z = -1;
scene.add(floor);

const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(hallShape), ceilingMat);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = ROOM_HALF_Y;
scene.add(ceiling);

const addWallSegment = (x1, z1, x2, z2) => {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;

    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;

    const edgeDir = new THREE.Vector3(dx, 0, dz).normalize();
    const normal = new THREE.Vector3().crossVectors(edgeDir, new THREE.Vector3(0, 1, 0));
    const toCenter = new THREE.Vector3(-cx, 0, -cz);
    if (normal.dot(toCenter) < 0) normal.negate();

    const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(len, ROOM_HEIGHT),
        wallMat
    );
    wall.position.set(cx, 0, cz);
    wall.rotation.y = Math.atan2(normal.x, normal.z);
    scene.add(wall);
};

for (let i = 0; i < HALL_OUTLINE.length; i++) {
    const [x1, z1] = HALL_OUTLINE[i];
    const [x2, z2] = HALL_OUTLINE[(i + 1) % HALL_OUTLINE.length];
    addWallSegment(x1, z1, x2, z2);
}

const addVerticalCornerLines = (corners, height, color = 0x111111) => {
    const hy = height / 2;
    const inset = 0.02;
    const positions = [];

    for (const [x, z] of corners) {
        const nx = x === 0 ? 0 : -Math.sign(x) * inset;
        const nz = z === 0 ? 0 : -Math.sign(z) * inset;
        positions.push(x + nx, -hy, z + nz, x + nx, hy, z + nz);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color })));
};

addVerticalCornerLines(HALL_OUTLINE, ROOM_HEIGHT, 0x111111);

const addWallDoor = (wall, imageFile, doorHeight, {
    bright = false,
    locked = true,
    href = null,
} = {}) => {
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
                emissiveIntensity: .25,
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
            return;
        }

        door.userData.isDoor = true;
        door.userData.locked = locked;
        door.userData.href = href;
        clickableDoors.push(door);
        scene.add(door);
    });
};

const DOOR_HEIGHT = 3.2;

addWallDoor("north", "images/door-1.jpg", DOOR_HEIGHT, {
    locked: false,
    href: "./2.html",
});
addWallDoor("east", "images/door-1.jpg", DOOR_HEIGHT, {
    locked: false,
    href: "./1.html",
});

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
