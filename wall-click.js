import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { isDevMode } from "./dev-mode.js";

const DRAG_THRESHOLD = 4;
const BOX_FACE_NAMES = ["east", "west", "ceiling", "floor", "south", "north"];
const CROSS_SIZE = 0.22;
const CROSS_OFFSET = 0.03;

const fmt = (n) => {
    const v = Math.round(n * 1000) / 1000;
    return Object.is(v, -0) ? 0 : v;
};

const wallNameFromNormal = (nx, nz) => {
    if (Math.abs(nz) >= Math.abs(nx)) return nz < 0 ? "north" : "south";
    return nx < 0 ? "west" : "east";
};

const resolveScene = (scene, object) => {
    if (scene) return scene;
    let o = object;
    while (o && o.parent) o = o.parent;
    return o || null;
};

/**
 * Shared wall registry + click probe for any room.
 *
 * Typical hall room:
 *   const wallClick = createWallClickHelper({ canvas, camera, stage, scene });
 *   wallClick.addWallsFromOutline(OUTLINE, { material: wallMat, height: ROOM_HEIGHT });
 *
 * Typical box room (lobby):
 *   const wallClick = createWallClickHelper({ canvas, camera, stage, scene });
 *   wallClick.registerRoomBox(room);
 *
 * Custom / extra walls:
 *   wallClick.register(mesh, { wall: "north" });
 *   wallClick.addWallSegment(x1, z1, x2, z2, { material, height, wall: "east" });
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {THREE.Camera} opts.camera
 * @param {HTMLElement} [opts.stage]
 * @param {THREE.Scene} [opts.scene] Required for addWallSegment / addWallsFromOutline / crosshair
 */
export function createWallClickHelper({ canvas, camera, stage, scene } = {}) {
    const host = stage || document.getElementById("stage");
    /** @type {THREE.Object3D[]} */
    const walls = [];

    let hud = document.getElementById("wall-click-hud");
    if (!hud && host) {
        hud = document.createElement("div");
        hud.id = "wall-click-hud";
        hud.setAttribute("aria-live", "polite");
        hud.textContent = "click a wall for coordinates";
        host.appendChild(hud);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const local = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);

    /** @type {THREE.LineSegments|null} */
    let crosshair = null;
    let hasCrosshairPlacement = false;

    let tracking = false;
    let didDrag = false;
    let lastX = 0;

    const ensureCrosshair = (targetScene) => {
        if (crosshair) return crosshair;
        if (!targetScene) return null;

        const positions = new Float32Array([
            -CROSS_SIZE, 0, 0, CROSS_SIZE, 0, 0,
            0, -CROSS_SIZE, 0, 0, CROSS_SIZE, 0,
        ]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.LineBasicMaterial({
            color: 0xff2222,
            depthTest: true,
            depthWrite: false,
        });
        crosshair = new THREE.LineSegments(geo, mat);
        crosshair.name = "wall-click-crosshair";
        crosshair.renderOrder = 10;
        crosshair.visible = false;
        crosshair.frustumCulled = false;
        targetScene.add(crosshair);
        return crosshair;
    };

    const syncCrosshairVisibility = () => {
        if (!crosshair) return;
        crosshair.visible = isDevMode() && hasCrosshairPlacement;
    };

    const placeCrosshair = (hit) => {
        const targetScene = resolveScene(scene, hit.object);
        const marker = ensureCrosshair(targetScene);
        if (!marker || !hit.face) return;

        normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
        toCam.subVectors(camera.position, hit.point);
        if (normal.dot(toCam) < 0) normal.negate();

        marker.position.copy(hit.point).addScaledVector(normal, CROSS_OFFSET);
        marker.quaternion.setFromUnitVectors(zAxis, normal);
        hasCrosshairPlacement = true;
        syncCrosshairVisibility();
    };

    /** Mark an existing mesh as a clickable wall target. */
    const register = (mesh, meta = {}) => {
        if (!mesh) return mesh;
        mesh.userData.isWall = true;
        if (typeof meta.wall === "string") mesh.userData.wall = meta.wall;
        if (meta.edge) mesh.userData.edge = meta.edge;
        if (!walls.includes(mesh)) walls.push(mesh);
        return mesh;
    };

    /** Mark a BackSide/FrontSide room box; ceiling/floor faces are ignored on click. */
    const registerRoomBox = (mesh) => {
        if (!mesh) return mesh;
        mesh.userData.isRoomBox = true;
        if (!walls.includes(mesh)) walls.push(mesh);
        return mesh;
    };

    /**
     * Build one vertical wall plane from floorplan endpoints and register it.
     * @returns {THREE.Mesh|null}
     */
    const addWallSegment = (x1, z1, x2, z2, { material, height, wall, y = 0 } = {}) => {
        if (!scene) {
            console.warn("createWallClickHelper.addWallSegment: scene is required");
            return null;
        }
        if (!material || height == null) {
            console.warn("createWallClickHelper.addWallSegment: material and height are required");
            return null;
        }

        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) return null;

        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;

        const edgeDir = new THREE.Vector3(dx, 0, dz).normalize();
        const n = new THREE.Vector3().crossVectors(edgeDir, new THREE.Vector3(0, 1, 0));
        const toCenter = new THREE.Vector3(-cx, 0, -cz);
        if (n.dot(toCenter) < 0) n.negate();

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, height), material);
        mesh.position.set(cx, y, cz);
        mesh.rotation.y = Math.atan2(n.x, n.z);

        register(mesh, {
            wall,
            edge: { x1, z1, x2, z2 },
        });
        if (wall == null) {
            // Plane faces into the room; cardinal labels are which side of the
            // room the wall sits on (outward), matching placeOnWall.
            normal.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), mesh.rotation.y);
            mesh.userData.wall = wallNameFromNormal(-normal.x, -normal.z);
        }

        scene.add(mesh);
        return mesh;
    };

    /** Walk a closed [x,z][] outline and add a wall for each edge. */
    const addWallsFromOutline = (outline, opts = {}) => {
        const built = [];
        if (!outline || outline.length < 2) return built;
        for (let i = 0; i < outline.length; i++) {
            const [x1, z1] = outline[i];
            const [x2, z2] = outline[(i + 1) % outline.length];
            const mesh = addWallSegment(x1, z1, x2, z2, opts);
            if (mesh) built.push(mesh);
        }
        return built;
    };

    const describeHit = (hit) => {
        const obj = hit.object;
        const world = hit.point;

        if (obj.userData.isRoomBox) {
            const face = Math.floor(hit.faceIndex / 2);
            const name = BOX_FACE_NAMES[face] || `face-${face}`;
            if (name === "ceiling" || name === "floor") return null;

            const along = name === "north" || name === "south" ? world.x : world.z;
            return {
                wall: name,
                world: { x: world.x, y: world.y, z: world.z },
                local: { x: along, y: world.y },
                uv: hit.uv ? { u: hit.uv.x, v: hit.uv.y } : null,
            };
        }

        local.copy(world);
        obj.worldToLocal(local);

        let name = obj.userData.wall;
        if (typeof name !== "string") {
            // Face normal points into the room; label by outward side.
            normal.set(0, 0, 1).transformDirection(obj.matrixWorld);
            name = wallNameFromNormal(-normal.x, -normal.z);
        }

        return {
            wall: name,
            world: { x: world.x, y: world.y, z: world.z },
            local: { x: local.x, y: local.y },
            uv: hit.uv ? { u: hit.uv.x, v: hit.uv.y } : null,
        };
    };

    const formatInfo = (info) => {
        const w = info.world;
        const l = info.local;
        const uv = info.uv
            ? `  uv=(${fmt(info.uv.u)}, ${fmt(info.uv.v)})`
            : "";
        return (
            `${info.wall}` +
            `  world=(${fmt(w.x)}, ${fmt(w.y)}, ${fmt(w.z)})` +
            `  local=(${fmt(l.x)}, ${fmt(l.y)})` +
            uv
        );
    };

    const reportClick = (clientX, clientY) => {
        if (!camera || !walls.length) return;

        const rect = canvas.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        const hits = raycaster.intersectObjects(walls, false);
        if (!hits.length) return;

        const hit = hits[0];
        const info = describeHit(hit);
        if (!info) return;

        const line = formatInfo(info);
        console.log(`[wall-click] ${line}`);

        if (hud) {
            hud.textContent = line;
            hud.dataset.hasCoords = "1";
        }

        // Crosshair is a developer-mode visual only; still move it while on.
        if (isDevMode()) placeCrosshair(hit);
    };

    if (canvas) {
        canvas.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            tracking = true;
            didDrag = false;
            lastX = e.clientX;
        });

        canvas.addEventListener("pointermove", (e) => {
            if (!tracking) return;
            if (Math.abs(e.clientX - lastX) > DRAG_THRESHOLD) didDrag = true;
            lastX = e.clientX;
        });

        const endPointer = (e) => {
            if (!tracking) return;
            tracking = false;
            if (didDrag) return;
            reportClick(e.clientX, e.clientY);
        };

        canvas.addEventListener("pointerup", endPointer);
        canvas.addEventListener("pointercancel", endPointer);
    }

    if (hud && !isDevMode()) {
        hud.textContent = "click a wall for coordinates";
    }

    // Keep crosshair in sync when the gear toggles developer mode.
    const mo = new MutationObserver(syncCrosshairVisibility);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    return {
        walls,
        register,
        registerRoomBox,
        addWallSegment,
        addWallsFromOutline,
        reportClick,
    };
}
