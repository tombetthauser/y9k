import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const DEFAULT_IMAGE = "images/static_images/exit-1.jpg";
const DEFAULT_BOX_HEIGHT = 0.22;
const DEFAULT_BOX_COLOR = 0x3a3a3a;
const DEFAULT_CEILING_GAP = 0.14;
const BOX_DEPTH = 0.05;

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY
 */
export function createAddExitSign({ scene, textureLoader, roomHalfY }) {
    const place = (direction, x, y, imageFile, boxWidth, boxHeight, boxColor, ceilingGap) => {
        textureLoader.load(imageFile, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;

            const aspect = tex.image.width / tex.image.height;
            const h = boxHeight;
            const w = boxWidth ?? h * aspect;
            const d = BOX_DEPTH;

            const metalMat = new THREE.MeshStandardMaterial({ color: boxColor });
            const faceMat = new THREE.MeshStandardMaterial({
                map: tex,
                emissive: 0xffffff,
                emissiveMap: tex,
                emissiveIntensity: 0.35,
                toneMapped: false,
            });
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                [metalMat, metalMat, metalMat, metalMat, faceMat, metalMat]
            );

            const boxY = roomHalfY - ceilingGap - h / 2;
            let bx = x;
            let bz = y;

            if (direction === "north") {
                box.rotation.y = 0;
                bz = y + d / 2;
            } else if (direction === "south") {
                box.rotation.y = Math.PI;
                bz = y - d / 2;
            } else if (direction === "west") {
                box.rotation.y = Math.PI / 2;
                bx = x + d / 2;
            } else if (direction === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = x - d / 2;
            } else {
                console.warn("Invalid exit sign direction:", direction);
                return;
            }

            box.position.set(bx, boxY, bz);
            scene.add(box);
        });
    };

    /**
     * Exit sign above a door, or at a manual wall position.
     *
     * Door form:
     *   addExitSign(door, imageFile?, boxWidth?, boxHeight?, boxColor?, ceilingGap?)
     *
     * Manual form:
     *   addExitSign(direction, x, y, imageFile?, boxWidth?, boxHeight?, boxColor?, ceilingGap?)
     */
    return function addExitSign(doorOrDirection, b, c, d, e, f, g, h) {
        if (doorOrDirection && (doorOrDirection.isMesh || doorOrDirection.userData?.isDoor)) {
            const door = doorOrDirection;
            const direction = door.userData.wall;
            if (!direction) {
                console.warn("addExitSign: door is missing userData.wall");
                return;
            }
            place(
                direction,
                door.position.x,
                door.position.z,
                b ?? DEFAULT_IMAGE,
                c,
                d ?? DEFAULT_BOX_HEIGHT,
                e ?? DEFAULT_BOX_COLOR,
                f ?? DEFAULT_CEILING_GAP,
            );
            return;
        }

        place(
            doorOrDirection,
            b,
            c,
            d ?? DEFAULT_IMAGE,
            e,
            f ?? DEFAULT_BOX_HEIGHT,
            g ?? DEFAULT_BOX_COLOR,
            h ?? DEFAULT_CEILING_GAP,
        );
    };
}
