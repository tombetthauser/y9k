/**
 * Central plus-shaped hallway (helper-functions port of 1.js).
 * Four lit doors lead to gallery rooms.
 */
import {
    createRoomApp,
    createRoomLayout,
    createAddWallDoor,
    createAddExitSign,
    createAddElectricalBox,
    lightPositionsAlong,
    ventPositionsAlongWall,
    loadMapOntoMaterial,
    outlineBounds,
    CEILING_TILE_WORLD_SIZE,
} from "./helper-functions.js";

const ROOM_HEIGHT = 3.75;
const DOOR_HEIGHT = 3.2;
const WALL_INSET = 0.05;
const ARM_WIDTH = 3.5;
const CROSS_SPAN = 11;
const hw = ARM_WIDTH / 2;
const hl = CROSS_SPAN / 2;
const ARM_SIDE = hl - hw;

// Plus / cross floorplan in XZ, CCW from above.
const PLUS_OUTLINE = [
    [-hw, -hl],
    [hw, -hl],
    [hw, -hw],
    [hl, -hw],
    [hl, hw],
    [hw, hw],
    [hw, hl],
    [-hw, hl],
    [-hw, hw],
    [-hl, hw],
    [-hl, -hw],
    [-hw, -hw],
];

const app = createRoomApp({
    musicPath: "music/wind-indoors-1-muffled.mp3",
    camY: 0.6,
    orbitRadius: 1.4,
    lookAtY: 0.4,
    background: 0x111111,
    ambientLight: 0.05,
    directionalLight: 0.04,
    directionalPosition: [1, 3, 2],
});

const {
    THREE,
    scene,
    textureLoader,
    clickable,
    wallClick,
    startLoop,
    createPropFactories,
} = app;

const wallMat = new THREE.MeshStandardMaterial({
    color: 0xc8c8c8,
    side: THREE.FrontSide,
});
const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0xc6c6c6,
    side: THREE.FrontSide,
});
const floorMat = new THREE.MeshStandardMaterial({
    color: 0xa6a6a6,
    side: THREE.FrontSide,
});

loadMapOntoMaterial(textureLoader, floorMat, "images/static_images/floor-2.jpg", {
    repeatX: 0.2,
    repeatY: 0.2,
});

{
    const b = outlineBounds(PLUS_OUTLINE);
    loadMapOntoMaterial(
        textureLoader,
        ceilingMat,
        "images/static_images/ceiling.jpg",
        {
            repeatX: b.width / CEILING_TILE_WORLD_SIZE,
            repeatY: b.depth / CEILING_TILE_WORLD_SIZE,
            color: 0xc6c6c6,
        }
    );
}

const layout = createRoomLayout({
    scene,
    outline: PLUS_OUTLINE,
    height: ROOM_HEIGHT,
    materials: { wall: wallMat, floor: floorMat, ceiling: ceilingMat },
    molding: true,
    cornerLines: 0x111111,
    wallClick,
    wallInset: WALL_INSET,
});

const { roomHalfY } = layout;

const addWallDoor = createAddWallDoor({
    scene,
    textureLoader,
    roomHalfY,
    roomHeight: ROOM_HEIGHT,
    clickable,
    bounds: layout.bounds,
    wallInset: WALL_INSET,
});

// Arm side walls for vents / props (not the AABB extremes).
const hallWalls = {
    west: { x: -(hw - WALL_INSET), leftZ: hw, rightZ: hl },
    east: { x: hw - WALL_INSET, leftZ: -hw, rightZ: -hl },
    north: { z: -(hw - WALL_INSET), leftX: hw, rightX: hl },
    south: { z: hw - WALL_INSET, leftX: -hw, rightX: -hl },
};

const props = createPropFactories({
    roomHalfY,
    walls: hallWalls,
    doorHeight: DOOR_HEIGHT,
});
const {
    addLightSwitch,
    addLightFixture,
    addVent,
    addFoldingChairs,
    addBoxStack,
} = props;

const addExitSign = createAddExitSign({ scene, textureLoader, roomHalfY });
const addElectricalBox = createAddElectricalBox({
    scene,
    textureLoader,
    roomHalfY,
});

const ELECTRICAL_IMG = "images/static_images/electrical.jpg";

//           [5 art]
//              |
//  [10] -- [7] -- [8]
//              |
//           [9]
const DOOR_LIT = "images/door-3.jpg";

addWallDoor("north", DOOR_LIT, DOOR_HEIGHT, {
    bright: true,
    locked: false,
    href: "./5.html",
    isLabelled: true,
}).then((door) => {
    if (door) addExitSign(door);
});
addWallDoor("east", DOOR_LIT, DOOR_HEIGHT, {
    bright: true,
    locked: false,
    href: "./8.html",
    isLabelled: true,
});
addWallDoor("south", DOOR_LIT, DOOR_HEIGHT, {
    bright: true,
    locked: false,
    href: "./9.html",
    isLabelled: true,
});
addWallDoor("west", DOOR_LIT, DOOR_HEIGHT, {
    bright: true,
    locked: false,
    href: "./10.html",
    isLabelled: true,
});

addElectricalBox("east", hw - WALL_INSET, (hw + hl) * 0.55, ELECTRICAL_IMG);

{
    const sw = 0.58;
    addLightSwitch("north", 0.9, -(hl - WALL_INSET));
    {
        const wx = -(hw - WALL_INSET);
        const z0 = hw + 1.05;
        addLightSwitch("west", wx, z0);
        addLightSwitch("west", wx, z0 + sw);
    }
}

{
    const cx = -(hw - WALL_INSET);
    const cz = -(hw + hl) * 0.5;
    const gap = 0.85;
    addFoldingChairs(cx, cz - gap, "west", 3);
    addFoldingChairs(cx, cz, "west", 2);
    addFoldingChairs(cx, cz + gap, "west", 1);
}

{
    for (const x of ventPositionsAlongWall(ARM_SIDE, 1)) addVent("west", x);
    for (const x of ventPositionsAlongWall(ARM_SIDE, 1)) addVent("east", x);
    for (const x of ventPositionsAlongWall(ARM_SIDE, 1)) addVent("north", x);
    for (const x of ventPositionsAlongWall(ARM_SIDE, 1)) addVent("south", x);
}

{
    for (const t of lightPositionsAlong(ARM_SIDE, 1)) {
        addLightFixture(0, hw + t, Math.PI / 2);
        addLightFixture(0, -hw - t, Math.PI / 2);
        addLightFixture(hw + t, 0, 0);
        addLightFixture(-hw - t, 0, 0);
    }
}

{
    const z = hw - WALL_INSET;
    const base = hw + 1.05;
    addBoxStack(base, z, "south", 3);
    addBoxStack(base + 1.2, z, "south", 2);
    addBoxStack(base + 1.2 + 1.45, z, "south", 3);
    addBoxStack(-(hw + 1.6), -(hw - WALL_INSET), "north", 2);
}

startLoop();
