import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const SWITCH_IMAGE = "images/static_images/switches.jpg";
const SWITCH_HEIGHT = 0.24; // 2× prior size
const SWITCH_DEPTH = 0.04;
const PLATE_COLOR = 0xf4f4f4;
const FACE_TINT = 0xffffff;
const WALL_FLUSH_PULL = 0.05;

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY
 * @param {number} [opts.doorHeight]  Switch centers at half this height by default
 * @param {THREE.Object3D[]} [opts.clickable]  Raycast targets (pointer + click)
 */
export function createAddLightSwitch({
    scene,
    textureLoader,
    roomHalfY,
    doorHeight = 3.2,
    clickable = null,
}) {
    const defaultCenterFromFloor = doorHeight / 2;

    /**
     * Wall light-switch plate.
     * `x` / `y` are floorplan wall coordinates (y → world Z).
     * `direction` is the wall it mounts on.
     * `heightFromFloor` is the vertical center (defaults to half door height).
     */
    return function addLightSwitch(
        direction,
        x,
        y,
        heightFromFloor = defaultCenterFromFloor,
    ) {
        textureLoader.load(SWITCH_IMAGE, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;

            const aspect = tex.image.width / tex.image.height;
            const h = SWITCH_HEIGHT;
            const w = h * aspect;
            const d = SWITCH_DEPTH;

            const plateMat = new THREE.MeshStandardMaterial({ color: PLATE_COLOR });
            const faceMat = new THREE.MeshStandardMaterial({ map: tex, color: FACE_TINT });
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                [plateMat, plateMat, plateMat, plateMat, faceMat, plateMat]
            );

            const boxY = -roomHalfY + heightFromFloor;
            const out = d / 2 - WALL_FLUSH_PULL;
            let bx = x;
            let bz = y;

            if (direction === "north") {
                box.rotation.y = 0;
                bz = y + out;
            } else if (direction === "south") {
                box.rotation.y = Math.PI;
                bz = y - out;
            } else if (direction === "west") {
                box.rotation.y = Math.PI / 2;
                bx = x + out;
            } else if (direction === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = x - out;
            } else {
                console.warn("Invalid light switch direction:", direction);
                return;
            }

            box.position.set(bx, boxY, bz);
            box.userData.isLightSwitch = true;
            if (clickable) clickable.push(box);
            scene.add(box);
        });
    };
}
