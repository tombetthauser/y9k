import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { setupLightbox } from "./lightbox.js";

const canvas = document.createElement("canvas");

const stage = document.getElementById("stage");
stage.appendChild(canvas);

// Audio levels (0 = silent, 1 = full)
const MUSIC_VOLUME = 0.45;
const LIGHTBOX_SFX_VOLUME = 1;

const lightbox = setupLightbox({ sfxVolume: LIGHTBOX_SFX_VOLUME });

const AUTO_SPIN = 0.00035;
const DRAG_SENS = 0.005;
const ORBIT_RADIUS = 2;
const LOOK_AT_Y = 1.2;
const MAX_EDGE = 480;
const CAM_Y = 1.4;

const AMBIENT_LIGHT_LEVEL = 3;
const DIRECTIONAL_LIGHT_LEVEL = 0.45;

const ROOM_WIDTH = 20;
const ROOM_DEPTH = 20;
const ROOM_HEIGHT = 7.5;

let angle = 0;
let lastX = 0;

let dragging = false;
let didDrag = false;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const DRAG_THRESHOLDER = 4;
const clickableArt = [];

// const MUSIC_PATH =  "music/wind.mp3";
const MUSIC_PATH =  "music/birds.mp3";
const musicToggle = document.getElementById("music-toggle");
let musicAudio = null;

const textureLoader = new THREE.TextureLoader();

const ensureMusicAudio = () => {
    if (musicAudio) return musicAudio;
    musicAudio = new Audio(MUSIC_PATH);
    musicAudio.loop = true;
    musicAudio.volume = MUSIC_VOLUME;
    return musicAudio;
}

const syncMusicToggleUi = () => {
    const on = musicAudio != null && !musicAudio.paused;
    musicToggle.textContent = on ? "🔊" : "🔇";
    musicToggle.title = on ? "mute sound" : "play sound";
    musicToggle.setAttribute("aria-label", on ? "mute sound" : "play music");
}

const toggleMusic = async () => {
    const a = ensureMusicAudio();
    try {
        if (a.paused) await a.play();
        else a.pause();
    } catch (err) {
        console.warn("sound play blocked or failed", err);
    }
    syncMusicToggleUi();
}

musicToggle.addEventListener("click", e => {
    e.stopPropagation();
    toggleMusic();
});
syncMusicToggleUi();


// ########################################

// const toggleFullscreen = async () => {
//     const el = stage;
//     try {
//         if (document.fullscreenElement || document.webkitFullscreenElement) {
//             await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
//         } else {
//             await (el.requestFullscreen?.() || el.webkitRequestFullscreen?.());
//         }
//     } catch (err) {
//         console.warn("fullscreen failed", err);
//     }
// };

// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^



canvas.style.cursor = "grab";

canvas.addEventListener("pointerdown", e => {
    if (e.button !== 0)return;
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
        const hits = raycaster.intersectObjects(clickableArt);
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
    const hits = raycaster.intersectObjects(clickableArt);

    if (hits.length > 0) {
        lightbox.open(hits[0].object.userData.imageFile);
    }
};

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

/*
TWO-FINGER ORBIT (room camera, when lightbox is closed)
------------------------------------------------------------
Use the midpoint of the two touches as the "drag X".
Mark didDrag = true so a two-finger gesture never opens an artwork.
canvas { touch-action: none } helps prevent browser scroll/zoom stealing the gesture.

let touchOrbiting = false;
let touchOrbitLastX = 0;

canvas.addEventListener("touchstart", e => {
    if (lightbox.isOpen()) return;
    if (e.touches.length >= 2) {
        e.preventDefault();
        touchOrbiting = true;
        dragging = false;
        didDrag = true;
        touchOrbitLastX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    }
}, { passive: false });

canvas.addEventListener("touchmove", e => {
    if (!touchOrbiting || e.touches.length < 2) return;
    e.preventDefault();
    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const dx = midX - touchOrbitLastX;
    touchOrbitLastX = midX;
    angle += dx * DRAG_SENS;
}, { passive: false });

canvas.addEventListener("touchend", e => {
    if (e.touches.length < 2) touchOrbiting = false;
});
canvas.addEventListener("touchcancel", () => { touchOrbiting = false; });
*/

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
// renderer.setPixelRatio(1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.4, 0);

// Must run after camera + renderer exist.
const syncViewportSize = () => {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    lightbox.remeasure();
};
syncViewportSize();
window.addEventListener("resize", syncViewportSize);
window.addEventListener("orientationchange", () => setTimeout(syncViewportSize, 150));
stage.addEventListener("fullscreenchange", syncViewportSize);
stage.addEventListener("webkitfullscreenchange", syncViewportSize); // Safari




// #################################

// FULL-BROWSER / WINDOWED TOGGLE (rebuild this after the CSS above)
// Default should be full browser; F toggles body.is-windowed for the small box.
// Always call syncViewportSize() after changing size so the camera matches.

// Toggle the CSS class that switches between full-browser and letterboxed.
const toggleWindowed = () => {
    // Add the class if missing, remove it if present.
    document.body.classList.toggle("is-windowed");
    // Resize the WebGL drawing buffer + camera aspect to the new stage size.
    syncViewportSize();
};

// Listen for key presses on the whole page.
document.addEventListener("keydown", e => {
    // Only react to F / f.
    if (e.key === "f" || e.key === "F") {
        // Don't steal F if the user is typing in a field.
        if (e.target.closest("input, textarea, [contenteditable]")) return;
        // Stop the browser from doing anything else with F.
        e.preventDefault();
        // Run the size toggle.
        toggleWindowed();
    }
});
// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^



const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, side: THREE.BackSide });
// Solid ceiling (default).
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false });
/*
Window-frame skylight: transparent ceiling material, then load window.png as map
(tile with wrapS/wrapT + repeat) and windows.png as scene.background.
const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false
});
*/


textureLoader.load("images/static_images/white-wall.jpg", tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    // Optional: chunky pixel look like your wall art
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    // Tile the bricks across each wall face
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, .5); // tweak: more tiles = smaller bricks
    // wallMat.map = tex;
    wallMat.color.set(0xffffff); // avoid gray tinting the texture
    wallMat.needsUpdate = true;
});

const floorMat = new THREE.MeshStandardMaterial({ color: 0xA6A6A6, side: THREE.BackSide });


textureLoader.load("images/static_images/floor-2.jpg", tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    // Optional: chunky pixel look like your wall art
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    // Tile the bricks across each wall face
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1); // tweak: more tiles = smaller bricks
    floorMat.map = tex;
    floorMat.color.set(0xffffff); // avoid gray tinting the texture
    floorMat.needsUpdate = true;
});

const room = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_WIDTH,ROOM_HEIGHT,ROOM_DEPTH),
    [wallMat, wallMat, ceilingMat, floorMat, wallMat, wallMat]
);
scene.add(room);

// Subtle dark gray lines on the four vertical corners of a room box.
const addVerticalCornerLines = (width, height, depth, yOffset = 0, color=0xd2d2d2) => {
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

    const lines = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color: color })
    );
    scene.add(lines);
    return lines;
};

addVerticalCornerLines(ROOM_WIDTH, ROOM_HEIGHT, ROOM_DEPTH);

// ########################################

const OUTER_PAD = 2;        // how much wider/deeper than the inner room
const OUTER_EXTRA_H = 1.15;  // make it a bit taller so gray walls show above the inner roof
const outerWallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.BackSide,
    transparent: true,   // honor PNG alpha in trees.png
    alphaTest: 0.1,      // discard near-clear pixels (cleaner cutouts / depth)
    depthWrite: true,
});

const outerFloorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
});

const outerCeilingMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
});

textureLoader.load("images/static_images/trees.png", tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 2);
    outerWallMat.map = tex;
    outerWallMat.needsUpdate = true;
});

const outerW = ROOM_WIDTH + OUTER_PAD * 6;
const outerH = ROOM_HEIGHT + OUTER_EXTRA_H + 8;
const outerD = ROOM_DEPTH + OUTER_PAD * 14;

const outerRoom = new THREE.Mesh(
    new THREE.BoxGeometry(outerW, outerH, outerD),
    [outerWallMat, outerWallMat, outerCeilingMat, outerFloorMat, outerWallMat, outerWallMat]
);
// Lift so floors roughly align (extra height grows upward)
outerRoom.position.y = OUTER_EXTRA_H / 2;
scene.add(outerRoom);

addVerticalCornerLines(outerW, outerH, outerD, OUTER_EXTRA_H / 2, 0x333333);

// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^



// const textureLoader = new THREE.TextureLoader();

// Window-frame ceiling: opaque muntins, transparent panes → Bliss shows through.
// textureLoader.load("images/static_images/window.png", tex => {
//     tex.colorSpace = THREE.SRGBColorSpace;
//     tex.magFilter = THREE.NearestFilter;
//     tex.minFilter = THREE.NearestFilter;
//     tex.wrapS = THREE.RepeatWrapping;
//     tex.wrapT = THREE.RepeatWrapping;
//     tex.repeat.set(8, 8); // ~8×8 tiles across the ceiling
//     ceilingMat.map = tex;
//     ceilingMat.needsUpdate = true;
// });
//
// Backdrop seen through the window panes.
// textureLoader.load("images/static_images/windows.png", tex => {
//     tex.colorSpace = THREE.SRGBColorSpace;
//     scene.background = tex;
// });

textureLoader.load("images/static_images/windows.png", tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
})

// const ROOM_W = ROOM_WIDTH;
// const ROOM_H = ROOM_HEIGHT;
// const ROOM_D = ROOM_DEPTH;
const ROOM_HALF_X = ROOM_WIDTH / 2;
const ROOM_HALF_Y = ROOM_HEIGHT / 2;
const ROOM_HALF_Z = ROOM_DEPTH / 2;
const WALL_INSET = 0.05;

const addWallImage = (wall, x, y, imageFile, imageWidth) => {
    textureLoader.load(imageFile, tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;

        const aspect = tex.image.width / tex.image.height;
        const imageHeight = imageWidth / aspect;

        const art = new THREE.Mesh(
            new THREE.PlaneGeometry(imageWidth, imageHeight),
            new THREE.MeshStandardMaterial({ map: tex })
        );

        const maxX = wall === "north" || wall === "south"
            ? ROOM_HALF_X - imageWidth / 2
            : ROOM_HALF_Z - imageWidth / 2;
        const maxY = ROOM_HALF_Y - imageHeight / 2;
        const lx = Math.max(-maxX, Math.min(maxX, x));
        const ly = Math.max(-maxY, Math.min(maxY, y));

        if (wall === "north") {
            art.position.set(lx, ly, -(ROOM_HALF_Z - WALL_INSET));
        } else if (wall === "south") {
            art.position.set(lx, ly, ROOM_HALF_Z - WALL_INSET);
            art.rotation.y = Math.PI;
        } else if (wall === "west") {
            art.position.set(-(ROOM_HALF_X - WALL_INSET), ly, lx);
            art.rotation.y = Math.PI / 2;
        } else if (wall === "east") {
            art.position.set(ROOM_HALF_X - WALL_INSET, ly, lx);
            art.rotation.y = -Math.PI / 2;
        } else {
            console.warn("Invalid wall: ", wall);
            return;
        }

        art.userData.imageFile = imageFile;
        clickableArt.push(art);
        scene.add(art);
    });
}

const SIZE_NORMAL = 0.9;
const SIZE_AMAR = 1.55;
const SIZE_TALL = 2.5;

addWallImage("south", 0, 0, "images/surface.jpg", 1);
addWallImage("south", 1.5, 0, "images/futuremen.jpg", 0.8);
addWallImage("south", -1.5, 0, "images/jupiter.jpg", SIZE_NORMAL);
addWallImage("south", -3.1, 0, "images/bstar.jpg", SIZE_NORMAL);
addWallImage("south", 3.1, 0, "images/packers.jpg", SIZE_NORMAL);
addWallImage("south", -4.5, 0, "images/bruegel.jpg", SIZE_NORMAL);

addWallImage("north", -0.95, 0, "images/amar1.jpg", SIZE_AMAR);
addWallImage("north", 0.95, 0, "images/amar2.jpg", SIZE_AMAR);
addWallImage("north", -3.3, 0, "images/streaks.jpg", SIZE_NORMAL);
addWallImage("north", 3.3, 0, "images/conan.jpg", SIZE_NORMAL);
addWallImage("north", -4.7, 0, "images/mom.jpg", SIZE_NORMAL);

addWallImage("west", -1.45, 0, "images/tallman.jpg", SIZE_TALL);
addWallImage("west", 1.45, 0, "images/tallbear.jpg", SIZE_TALL);
addWallImage("west", -4.3, 0, "images/map.jpg", SIZE_NORMAL);
addWallImage("west", 4.3, 0, "images/nightbird.jpg", SIZE_NORMAL);

addWallImage("east", -1.45, 0, "images/tallarch.jpg", SIZE_TALL);
addWallImage("east", 1.45, 0, "images/tallpool.jpg", SIZE_TALL);
addWallImage("east", -4.3, 0, "images/faces.jpg", SIZE_NORMAL);
addWallImage("east", 4.3, 0, "images/vinci.jpg", SIZE_NORMAL);

scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_LIGHT_LEVEL));
const light = new THREE.DirectionalLight(0xffffff, DIRECTIONAL_LIGHT_LEVEL);
light.position.set(2,5,3);
scene.add(light);

const loop = () => {
    if (!dragging) angle += AUTO_SPIN;
    
    camera.position.x = Math.sin(angle) * ORBIT_RADIUS;
    camera.position.y = CAM_Y;
    camera.position.z = Math.cos(angle) * ORBIT_RADIUS;
    camera.lookAt(0, LOOK_AT_Y, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
}

loop();

// function resize() {
//     const cssW = window.innerWidth;
//     const cssH = window.innerHeight;
//     let w = cssW;
//     let h = cssH;
//     const longEdge = Math.max(w, h);
//     if (longEdge > MAX_EDGE) {
//         const r = MAX_EDGE / longEdge;
//         w = Math.floor(w * r);
//         h = Math.floor(h * r);
//     }
//     // false = keep CSS size fullscreen; only shrink the drawing buffer
//     renderer.setSize(w, h, false);
//     camera.aspect = w / h;
//     camera.updateProjectionMatrix();
// }
// resize();
// window.addEventListener("resize", resize);
