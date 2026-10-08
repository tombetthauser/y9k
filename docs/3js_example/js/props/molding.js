import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const BASE_HEIGHT = 0.28;
const CROWN_HEIGHT = 0.09;
const DEPTH = 0.02;
const MOLDING_COLOR = 0xcbcbcb; // almost wall color (0xc8c8c8)

/**
 * Add baseboard + crown molding along every edge of a floorplan outline.
 * Segments overshoot each end by DEPTH so outside corners stay covered.
 * @param {THREE.Scene} scene
 * @param {number[][]} outline  XZ corners, CCW from above (same as hall wall outlines)
 * @param {number} roomHeight
 * @param {number} [color=MOLDING_COLOR]
 */
export function addHallMolding(scene, outline, roomHeight, color = MOLDING_COLOR) {
    const hy = roomHeight / 2;
    const mat = new THREE.MeshStandardMaterial({ color });

    for (let i = 0; i < outline.length; i++) {
        const [x1, z1] = outline[i];
        const [x2, z2] = outline[(i + 1) % outline.length];
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;

        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;
        // Overshoot both ends by DEPTH to cover out-facing corners.
        const runLen = len + DEPTH * 2;

        const edgeDir = new THREE.Vector3(dx, 0, dz).normalize();
        const normal = new THREE.Vector3().crossVectors(edgeDir, new THREE.Vector3(0, 1, 0));
        const toCenter = new THREE.Vector3(-cx, 0, -cz);
        if (normal.dot(toCenter) < 0) normal.negate();

        const rotY = Math.atan2(normal.x, normal.z);
        const ox = normal.x * (DEPTH / 2);
        const oz = normal.z * (DEPTH / 2);

        const base = new THREE.Mesh(
            new THREE.BoxGeometry(runLen, BASE_HEIGHT, DEPTH),
            mat
        );
        base.position.set(cx + ox, -hy + BASE_HEIGHT / 2, cz + oz);
        base.rotation.y = rotY;
        scene.add(base);

        const crown = new THREE.Mesh(
            new THREE.BoxGeometry(runLen, CROWN_HEIGHT, DEPTH),
            mat
        );
        crown.position.set(cx + ox, hy - CROWN_HEIGHT / 2, cz + oz);
        crown.rotation.y = rotY;
        scene.add(crown);
    }
}
