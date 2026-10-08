import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const LIGHT_IMAGE = "images/static_images/lights-1.jpg";
/** Medium fluorescent troffer — long axis along local X. */
export const LIGHT_LENGTH = 1.35;
export const LIGHT_WIDTH = 0.28;
const LIGHT_DEPTH = 0.06;
const HOUSING_COLOR = 0xb0b0b0;
const DROP_FROM_CEILING = 0.02;

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY
 */
export function createAddLightFixture({ scene, textureLoader, roomHalfY }) {
    /**
     * Ceiling fluorescent fixture at floorplan (x, z).
     * `rotationY` orients the long axis (0 = along +X, π/2 = along +Z).
     */
    return function addLightFixture(x, z, rotationY = 0) {
        textureLoader.load(LIGHT_IMAGE, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;

            const housing = new THREE.MeshStandardMaterial({ color: HOUSING_COLOR });
            // Unlit face (readable in dark halls), mid tint between washed-out and crushed.
            const face = new THREE.MeshBasicMaterial({
                map: tex,
                color: 0x585858,
            });
            // BoxGeometry materials: +x, -x, +y, -y, +z, -z
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(LIGHT_LENGTH, LIGHT_DEPTH, LIGHT_WIDTH),
                [housing, housing, housing, face, housing, housing]
            );

            box.rotation.y = rotationY;
            box.position.set(
                x,
                roomHalfY - DROP_FROM_CEILING - LIGHT_DEPTH / 2,
                z
            );
            scene.add(box);
        });
    };
}

/**
 * Centers along a run of `length` (space-evenly, accounting for fixture length).
 * One fixture → midpoint. Returns distances from the start of the run.
 */
export function lightPositionsAlong(length, count) {
    const n = Math.max(0, Math.floor(count));
    if (n === 0) return [];
    if (n === 1) return [length / 2];

    const gap = (length - n * LIGHT_LENGTH) / (n + 1);
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(gap + LIGHT_LENGTH / 2 + i * (LIGHT_LENGTH + gap));
    }
    return out;
}
