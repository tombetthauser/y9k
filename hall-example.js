/**
 * Example hallway room built only with helper-functions.js.
 * Layout comes from outlineFromPath (L-shaped corridor).
 */
import {
    createRoomApp,
    outlineFromPath,
    createRoomLayout,
    createAddWallDoor,
    createAddExitSign,
    lightPositionsAlong,
    ventPositionsAlongWall,
    loadMapOntoMaterial,
    outlineBounds,
    CEILING_TILE_WORLD_SIZE,
} from "./helper-functions.js";

const ROOM_HEIGHT = 3.75;
const DOOR_HEIGHT = 3.2;
const WALL_INSET = 0.05;

const app = createRoomApp({
    musicPath: "music/wind-indoors-1-muffled.mp3",
    camY: 0.6,
    orbitRadius: 1.6,
    lookAtY: 0.4,
    background: 0x111111,
    ambientLight: 0.05,
    directionalLight: 0.04,
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

// L-shaped hall, roughly centered on the origin (CCW, turtle path).
const outline = outlineFromPath(
    [
        { dir: "north", length: 5 },
        { dir: "west", length: 5 },
        { dir: "south", length: 5 },
        { dir: "west", length: 5 },
        { dir: "south", length: 5 },
        { dir: "east", length: 5 },
        { dir: "south", length: 5 },
        { dir: "east", length: 5 },
        { dir: "north", length: 5 },
        { dir: "east", length: 5 },
        { dir: "north", length: 5 },
        { dir: "west", length: 5 },
    ],
    [2.5, -2.5]
);

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
    const b = outlineBounds(outline);
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
    outline,
    height: ROOM_HEIGHT,
    materials: { wall: wallMat, floor: floorMat, ceiling: ceilingMat },
    molding: true,
    cornerLines: 0x111111,
    wallClick,
    wallInset: WALL_INSET,
});

const { roomHalfY, walls, bounds } = layout;

const addWallDoor = createAddWallDoor({
    scene,
    textureLoader,
    roomHalfY,
    roomHeight: ROOM_HEIGHT,
    clickable,
    bounds,
    wallInset: WALL_INSET,
});

const props = createPropFactories({
    roomHalfY,
    walls,
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

// Doors with destinations (href) as a first-class option.
addWallDoor("north", "images/door-3.jpg", DOOR_HEIGHT, {
    bright: true,
    locked: false,
    href: "./index.html",
    x: -3.25,
}).then((door) => {
    if (door) addExitSign(door);
});

addWallDoor("east", "images/door-1.jpg", DOOR_HEIGHT, {
    locked: false,
    href: "./1.html",
    x: 2.2,
});

addWallDoor("south", "images/door-1.jpg", DOOR_HEIGHT, {
    locked: true,
    x: 1.5,
});

addLightSwitch("north", walls.north.leftX + 1.2, walls.north.z);

{
    const run = 6;
    for (const t of lightPositionsAlong(run, 2)) {
        addLightFixture(-5 + 1.75, -3.75 + t, Math.PI / 2);
    }
    for (const t of lightPositionsAlong(6, 2)) {
        addLightFixture(-1.5 + t, 0.25, 0);
    }
}

{
    const lenN = Math.abs(walls.north.rightX - walls.north.leftX);
    for (const x of ventPositionsAlongWall(lenN, 1)) addVent("north", x);
    const lenE = Math.abs(walls.east.rightZ - walls.east.leftZ);
    for (const x of ventPositionsAlongWall(lenE, 1)) addVent("east", x);
}

addFoldingChairs(walls.west.x, -1.5, "west", 3);
addBoxStack(1.5, walls.south.z, "south", 2);

startLoop();
