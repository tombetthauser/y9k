import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const VENT_IMAGE = "images/static_images/vent.jpg";
const VENT_HEIGHT = 0.3; // a bit larger than exit signs (~0.22)
export const VENT_WIDTH = 0.95 * (2 / 3); // ~2/3 of prior width
const VENT_DEPTH = 0.04;
const VENT_COLOR = 0x6a6a6a;
const DEFAULT_Y_FROM_CEILING = 0.12;
// Room wall specs are inset (~WALL_INSET); pull back so the vent back sits on the wall.
const WALL_FLUSH_PULL = 0.05;

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY
 * @param {object} opts.walls  north/south/east/west specs:
 *   north/south: { z, leftX, rightX }  (leftX = left edge when viewed from inside)
 *   east/west:   { x, leftZ, rightZ }
 */
export function createAddVent({ scene, textureLoader, roomHalfY, walls }) {
    /**
     * HVAC vent near the ceiling.
     * `xFromLeft` is meters from the left edge of the wall to the vent center
     * when facing the wall from inside.
     * `yFromCeiling` defaults to a small gap under the ceiling.
     */
    return function addVent(wall, xFromLeft, yFromCeiling = DEFAULT_Y_FROM_CEILING) {
        const spec = walls[wall];
        if (!spec) {
            console.warn("Invalid vent wall:", wall);
            return;
        }

        textureLoader.load(VENT_IMAGE, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;

            const w = VENT_WIDTH;
            const h = VENT_HEIGHT;
            const d = VENT_DEPTH;

            const metalMat = new THREE.MeshStandardMaterial({ color: VENT_COLOR });
            const faceMat = new THREE.MeshStandardMaterial({ map: tex });
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                [metalMat, metalMat, metalMat, metalMat, faceMat, metalMat]
            );

            const boxY = roomHalfY - yFromCeiling - h / 2;
            // Specs are inset from the real wall; pull back so the vent back sits flush on it.
            const out = d / 2 - WALL_FLUSH_PULL;
            let bx = 0;
            let bz = 0;

            if (wall === "north") {
                // Facing wall (looking −Z): left is −X → leftX should be the more negative x.
                box.rotation.y = 0;
                bx = spec.leftX + xFromLeft;
                bz = spec.z + out;
            } else if (wall === "south") {
                // Facing wall (looking +Z): left is +X.
                box.rotation.y = Math.PI;
                bx = spec.leftX - xFromLeft;
                bz = spec.z - out;
            } else if (wall === "west") {
                // Facing wall (looking −X): left is −Z.
                box.rotation.y = Math.PI / 2;
                bx = spec.x + out;
                bz = spec.leftZ + xFromLeft;
            } else if (wall === "east") {
                // Facing wall (looking +X): left is +Z.
                box.rotation.y = -Math.PI / 2;
                bx = spec.x - out;
                bz = spec.leftZ - xFromLeft;
            }

            box.position.set(bx, boxY, bz);
            scene.add(box);
        });
    };
}

/**
 * Positions for vent centers along a wall (from the left edge).
 * One vent → centered. Multiple → equal gaps between vents and both edges (space-evenly).
 */
export function ventPositionsAlongWall(wallLength, count) {
    const n = Math.max(0, Math.floor(count));
    if (n === 0) return [];
    if (n === 1) return [wallLength / 2];

    const gap = (wallLength - n * VENT_WIDTH) / (n + 1);
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(gap + VENT_WIDTH / 2 + i * (VENT_WIDTH + gap));
    }
    return out;
}
