import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const FACE_IMAGE = "images/static_images/box-face.jpg";
const SIDE_IMAGE = "images/static_images/box-side.jpg";

// Bankers-box proportions, scaled to sit beside the oversized chair billboards.
// BOX_W spans the box-face (±Z); BOX_D is the long side (±X after the +90° yaw).
export const BOX_W = 0.72;
export const BOX_D = 0.92;
export const BOX_H = 0.56;
const TOP_COLOR = 0xdedede;
const FACE_TINT = 0xc4c4c4;
const WALL_FLUSH_PULL = 0.05;
const YAW = Math.PI / 2;
/** Peak yaw wobble per box (~2.5–5°). */
const WOBBLE_MIN = 0.042;
const WOBBLE_MAX = 0.09;

const prepTex = tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
};

/** Deterministic 0..1 from floorplan coords. */
const seed01 = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
};

const seed01n = (x, y, n) => seed01(x + n * 19.17, y - n * 7.31);

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY
 */
export function createAddBoxStack({ scene, textureLoader, roomHalfY }) {
    /**
     * Stack of bankers boxes against a wall.
     * `x` / `y` are floorplan wall coordinates (y → world Z).
     * `direction` is the wall they sit against.
     * `stackHeight` is how many boxes tall.
     */
    return function addBoxStack(x, y, direction, stackHeight) {
        const n = Math.max(1, Math.floor(Number(stackHeight) || 1));

        let rotY = 0;
        let fx = 0;
        let fz = 0;

        if (direction === "north") {
            rotY = 0;
            fz = 1;
        } else if (direction === "south") {
            rotY = Math.PI;
            fz = -1;
        } else if (direction === "west") {
            rotY = Math.PI / 2;
            fx = 1;
        } else if (direction === "east") {
            rotY = -Math.PI / 2;
            fx = -1;
        } else {
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
            // +x, -x, +y, -y, +z, -z — box-face on ±Z, box-side on ±X, white top/bottom.
            const materials = [sideMat, sideMat, topMat, topMat, faceMat, faceMat];

            // After +90° yaw, local X (BOX_W / box-face span) points into the room.
            const out = BOX_W / 2 - WALL_FLUSH_PULL;
            const bx = x + fx * out;
            const bz = y + fz * out;

            for (let i = 0; i < n; i++) {
                const box = new THREE.Mesh(
                    new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D),
                    materials
                );
                // Alternate yaw back and forth; amplitude varies per level from the seed.
                const level = seed01n(x, y, i);
                const amp = baseAmp * (0.75 + level * 0.5);
                const wobble = startSign * (i % 2 === 0 ? 1 : -1) * amp;
                box.rotation.y = rotY + wobble;
                box.position.set(
                    bx,
                    -roomHalfY + BOX_H / 2 + i * BOX_H,
                    bz
                );
                scene.add(box);
            }
        };

        textureLoader.load(FACE_IMAGE, tex => {
            faceTex = prepTex(tex);
            if (--left === 0) build();
        });
        textureLoader.load(SIDE_IMAGE, tex => {
            sideTex = prepTex(tex);
            if (--left === 0) build();
        });
    };
}
