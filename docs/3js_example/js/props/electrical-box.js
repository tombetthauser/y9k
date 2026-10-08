import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const DEFAULT_HEIGHT_FROM_FLOOR = 1.1;
const DEFAULT_BOX_HEIGHT = 0.95;
const DEFAULT_BOX_COLOR = 0xb4b4b4;
const BOX_DEPTH = 0.14;
const CONDUIT_RADIUS = 0.032;

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY  Half the room height (ceiling at +roomHalfY, floor at -roomHalfY)
 * @returns {typeof addElectricalBox}
 */
export function createAddElectricalBox({ scene, textureLoader, roomHalfY }) {
    /**
     * Wall-mounted electrical box with conduit tubes to the ceiling.
     * `x` / `y` are floorplan coordinates on the wall surface (y → world Z).
     * `direction` is the wall the box is mounted on (face points into the room).
     */
    return function addElectricalBox(
        direction,
        x,
        y,
        imageFile,
        heightFromFloor = DEFAULT_HEIGHT_FROM_FLOOR,
        boxWidth,
        boxHeight = DEFAULT_BOX_HEIGHT,
        boxColor = DEFAULT_BOX_COLOR,
    ) {
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
            // BoxGeometry materials: +x, -x, +y, -y, +z, -z — texture on +z (front).
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                [metalMat, metalMat, metalMat, metalMat, faceMat, metalMat]
            );

            const boxY = -roomHalfY + heightFromFloor + h / 2;
            let bx = x;
            let bz = y;
            // Unit vector from wall into the room (face forward).
            let fx = 0;
            let fz = 0;

            if (direction === "north") {
                // On -Z wall; face +Z into room.
                box.rotation.y = 0;
                bz = y + d / 2;
                fz = 1;
            } else if (direction === "south") {
                box.rotation.y = Math.PI;
                bz = y - d / 2;
                fz = -1;
            } else if (direction === "west") {
                box.rotation.y = Math.PI / 2;
                bx = x + d / 2;
                fx = 1;
            } else if (direction === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = x - d / 2;
                fx = -1;
            } else {
                console.warn("Invalid electrical box direction:", direction);
                return;
            }

            box.position.set(bx, boxY, bz);
            scene.add(box);

            const conduitMat = new THREE.MeshStandardMaterial({ color: boxColor });
            const topOfBox = boxY + h / 2;
            const conduitLen = roomHalfY - topOfBox;
            if (conduitLen <= 0) return;

            const conduitY = topOfBox + conduitLen / 2;
            // Sit conduits toward the wall side of the box top.
            const cx = bx - fx * d * 0.15;
            const cz = bz - fz * d * 0.15;
            const along = w * 0.22;

            for (const sign of [-1, 1]) {
                const tube = new THREE.Mesh(
                    new THREE.CylinderGeometry(CONDUIT_RADIUS, CONDUIT_RADIUS, conduitLen, 12),
                    conduitMat
                );
                if (direction === "north" || direction === "south") {
                    tube.position.set(cx + sign * along, conduitY, cz);
                } else {
                    tube.position.set(cx, conduitY, cz + sign * along);
                }
                scene.add(tube);
            }
        });
    };
}
