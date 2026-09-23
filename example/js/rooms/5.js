/**
 * Example gallery room built only with helper-functions.js.
 * Layout comes from outlineFromBox; art opens in the lightbox.
 */
import {
    createRoomApp,
    outlineFromBox,
    createRoomLayout,
    createAddWallDoor,
    createAddWallImage,
    createAddWallVideoScreen,
    createAddLightFixture,
    createAddLightSwitch,
    createAddVent,
    loadMapOntoMaterial,
    DEFAULT_ROOM_HEIGHT,
    DEFAULT_ART_HEIGHT_FROM_FLOOR,
    CEILING_TILE_WORLD_SIZE,
} from "./helper-functions.js";

const ROOM_WIDTH = 12;
const ROOM_DEPTH = 12;
const ROOM_HEIGHT = 6;
const DOOR_HEIGHT = 4;
const WALL_INSET = 0.05;

const app = createRoomApp({
    musicPath: "music/wind-indoors-1-muffled.mp3",
    lightBuzzPath: "music/light-buzz.mp3",
    lockDoorsWhenLightsOff: true,
    floorY: -DEFAULT_ROOM_HEIGHT / 2,
    orbitRadius: 2.2,
    background: 0xf0f0f0,
    enableLightbox: true,
    enableVideoLightbox: true,
    lightboxSfxVolume: 1,
    ambientLight: 2.7,
    directionalLight: 0.55,
    directionalPosition: [2, 5, 3],
});

const {
    THREE,
    scene,
    textureLoader,
    clickable,
    wallClick,
    roomLights,
    startLoop,
} = app;

const outline = outlineFromBox(ROOM_WIDTH, ROOM_DEPTH);

const wallMat = new THREE.MeshStandardMaterial({
    color: 0xfbfbfd,
    side: THREE.FrontSide,
});
const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0xfafafa,
    side: THREE.FrontSide,
});
const floorMat = new THREE.MeshStandardMaterial({
    color: 0xa6a6a6,
    side: THREE.FrontSide,
});

loadMapOntoMaterial(textureLoader, floorMat, "images/static_images/floor-2.jpg", {
    repeatX: .25,
    repeatY: .25,
});

loadMapOntoMaterial(
    textureLoader,
    ceilingMat,
    "images/static_images/ceiling.jpg",
    {
        repeatX: ROOM_WIDTH / CEILING_TILE_WORLD_SIZE,
        repeatY: ROOM_DEPTH / CEILING_TILE_WORLD_SIZE,
        color: 0xfafafa,
    }
);

// Pin the floor at the default-room elevation so changing ROOM_HEIGHT only
// moves the ceiling — art, door, and camera world Y stay as before.
const layout = createRoomLayout({
    scene,
    outline,
    height: ROOM_HEIGHT,
    floorY: -DEFAULT_ROOM_HEIGHT / 2,
    materials: { wall: wallMat, floor: floorMat, ceiling: ceilingMat },
    molding: 0xf4f4f6,
    cornerLines: 0xc4c4c8,
    wallClick,
    wallInset: WALL_INSET,
    roomLights,
});

const { roomHalfY, floorY, ceilingY, bounds, walls } = layout;

app.enableDevWallUpload({
    bounds,
    floorY,
    ceilingY,
    roomHalfY,
    wallInset: WALL_INSET,
});

const addWallDoor = createAddWallDoor({
    scene,
    textureLoader,
    roomHalfY,
    roomHeight: ROOM_HEIGHT,
    clickable,
    bounds,
    wallInset: WALL_INSET,
});

const addWallImage = createAddWallImage({
    scene,
    textureLoader,
    roomHalfY,
    floorY,
    ceilingY,
    heightFromFloor: DEFAULT_ART_HEIGHT_FROM_FLOOR,
    clickable,
    bounds,
    wallInset: WALL_INSET,
});

const addWallVideoScreen = createAddWallVideoScreen({
    scene,
    roomHalfY,
    floorY,
    ceilingY,
    heightFromFloor: DEFAULT_ART_HEIGHT_FROM_FLOOR,
    clickable,
    bounds,
    wallInset: WALL_INSET,
});

const addLightFixture = createAddLightFixture({
    scene,
    textureLoader,
    roomHalfY,
    ceilingY,
    roomLights,
});

const addLightSwitch = createAddLightSwitch({
    scene,
    textureLoader,
    roomHalfY,
    doorHeight: DOOR_HEIGHT,
    clickable,
});

const addVent = createAddVent({
    scene,
    textureLoader,
    roomHalfY,
    walls,
});

// Ceiling fluorescents: three parallel rows (2×3), larger; on/off via roomLights.
{
    const spanX = 3.4;
    const spanZ = 3.4;
    for (const x of [-spanX, spanX]) {
        for (const z of [-spanZ, 0, spanZ]) {
            addLightFixture(x, z, 0, { scale: 2.1 });
        }
    }
}

// Fan shirts — eye-line height; bigger, spaced around the room.
{
    const shirtW = 1.95;
    const pairHalf = 1.35;

    // North: pair
    addWallImage("north", -pairHalf, "images/fan-shirts/robinson.png", shirtW  * .92);
    addWallImage("north", pairHalf, "images/fan-shirts/dick.png", shirtW);

    // East: alone
    addWallImage("east", 0, "images/fan-shirts/tim.png", shirtW);

    // South: alone, clear of the door on +X
    addWallImage("south", -0.8, "images/fan-shirts/guston.png", shirtW);

    // West: alone, south of the video screen
    addWallImage("west", 1.8, "images/fan-shirts/terence.png", shirtW);
}

// West wall: medium video screen — gif preview loops slowly; click opens YouTube.
addWallVideoScreen("west", -1.8, 2.6, {
    videoUrl: "https://www.youtube.com/watch?v=NCaK35DQ4uk",
    previewSrc: "images/video-cache/NCaK35DQ4uk.gif",
    previewSpeed: 0.35,
    conduit: "molding",
    frameColor: 0x2a2a2a,
});

// Door with destination + switches beside it + vent above.
{
    const doorAspect = 264 / 676;
    const doorWidth = DOOR_HEIGHT * doorAspect;
    const doorX = bounds.halfX - doorWidth / 2 - 0.85;
    addWallDoor("south", "images/door-1.jpg", DOOR_HEIGHT, {
        locked: false,
        href: "./7.html",
        x: doorX,
        isLabelled: true,
    });

    const switchScale = 1.55;
    const switchX = doorX - doorWidth / 2 - 0.5;
    addLightSwitch("south", switchX, walls.south.z, DOOR_HEIGHT / 2, {
        scale: switchScale,
        switches: 1,
        isDisabled: false,
    });

    // Welcome note beside the switch, a little larger than the plate.
    addWallImage("south", switchX - 0.46, "images/welcome.jpg", 0.38, {
        heightFromFloor: DOOR_HEIGHT / 2,
    });

    // South wall: xFromLeft is measured from +X when facing the wall.
    addVent("south", walls.south.leftX - doorX, {
        width: (doorWidth / 3) * 2,
        yFromCeiling: 0.28,
    });
}

startLoop();
