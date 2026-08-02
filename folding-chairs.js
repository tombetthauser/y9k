import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const CHAIR_IMAGE = "images/static_images/chair.png";
const CHAIR_H = 0.9 * 2.5 * 0.9; // same default height as before (2.5× then −10%)
const LEAN = 0.2; // radians — same lean for every chair in a stack
const STACK_GAP = 0.08;
const WALL_CLEARANCE = 0.04;

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY
 */
export function createAddFoldingChairs({ scene, textureLoader, roomHalfY }) {
    /**
     * Stack of folded-chair billboards leaned against a wall.
     * `x` / `y` are floorplan wall coordinates (y → world Z).
     * `direction` is the wall they lean on.
     * `numberOfChairs` stacks them out from the wall.
     */
    return function addFoldingChairs(x, y, direction, numberOfChairs) {
        const n = Math.max(1, Math.floor(Number(numberOfChairs) || 1));

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
            console.warn("Invalid folding chair direction:", direction);
            return;
        }

        // Plane pivots about its center; tip toward wall by (h/2)*sin(lean).
        const baseOut = (CHAIR_H / 2) * Math.sin(LEAN) + WALL_CLEARANCE;

        textureLoader.load(CHAIR_IMAGE, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;

            const aspect = tex.image.width / tex.image.height;
            const w = CHAIR_H * aspect;
            const h = CHAIR_H;

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
                chair.rotation.x = -LEAN;

                const out = baseOut + i * STACK_GAP;
                // Bottom of the plane on the floor.
                chair.position.set(
                    x + fx * out,
                    -roomHalfY + h / 2 * Math.cos(LEAN),
                    y + fz * out
                );
                scene.add(chair);
            }
        });
    };
}
