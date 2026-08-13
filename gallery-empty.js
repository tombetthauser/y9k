/**
 * Empty gallery room (box layout) with door back to the central hallway.
 * Used by 8.js / 9.js / 10.js — no authored wall art or video screen.
 *
 * `exitWall` is the wall with the door back to the hall. It must be opposite
 * the hall door you came through so travel facing stays consistent:
 *   hall north → room 5 south   |  hall east → room 8 west
 *   hall south → room 9 north   |  hall west → room 10 east
 */
import {
    createRoomApp,
    outlineFromBox,
    createRoomLayout,
    createAddWallDoor,
    createAddLightFixture,
    createAddLightSwitch,
    createAddVent,
    loadMapOntoMaterial,
    DEFAULT_ROOM_HEIGHT,
    CEILING_TILE_WORLD_SIZE,
} from "./helper-functions.js";

const ROOM_WIDTH = 12;
const ROOM_DEPTH = 12;
const ROOM_HEIGHT = 6;
const DOOR_HEIGHT = 4;
const WALL_INSET = 0.05;

/**
 * @param {object} [opts]
 * @param {"north"|"south"|"east"|"west"} [opts.exitWall="south"]
 * @param {string} [opts.href="./7.html"]
 */
export function startEmptyGallery({
    exitWall = "south",
    href = "./7.html",
} = {}) {
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
        repeatX: 0.25,
        repeatY: 0.25,
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

    {
        const spanX = 3.4;
        const spanZ = 3.4;
        for (const x of [-spanX, spanX]) {
            for (const z of [-spanZ, 0, spanZ]) {
                addLightFixture(x, z, 0, { scale: 2.1 });
            }
        }
    }

    {
        const doorAspect = 264 / 676;
        const doorWidth = DOOR_HEIGHT * doorAspect;
        const alongHalf =
            exitWall === "north" || exitWall === "south"
                ? bounds.halfX
                : bounds.halfZ;
        // Same offset as room 5: toward the +along end of the wall.
        const doorAlong = alongHalf - doorWidth / 2 - 0.85;
        addWallDoor(exitWall, "images/door-1.jpg", DOOR_HEIGHT, {
            locked: false,
            href,
            x: doorAlong,
            isLabelled: true,
        });

        const switchScale = 1.55;
        const switchAlong = doorAlong - doorWidth / 2 - 0.5;
        if (exitWall === "north" || exitWall === "south") {
            addLightSwitch(exitWall, switchAlong, walls[exitWall].z, DOOR_HEIGHT / 2, {
                scale: switchScale,
                switches: 1,
                isDisabled: false,
            });
        } else {
            addLightSwitch(exitWall, walls[exitWall].x, switchAlong, DOOR_HEIGHT / 2, {
                scale: switchScale,
                switches: 1,
                isDisabled: false,
            });
        }

        const wall = walls[exitWall];
        let ventFromLeft;
        if (exitWall === "north") {
            ventFromLeft = doorAlong - wall.leftX;
        } else if (exitWall === "south") {
            ventFromLeft = wall.leftX - doorAlong;
        } else if (exitWall === "west") {
            ventFromLeft = doorAlong - wall.leftZ;
        } else {
            ventFromLeft = wall.leftZ - doorAlong;
        }
        addVent(exitWall, ventFromLeft, {
            width: (doorWidth / 3) * 2,
            yFromCeiling: 0.28,
        });
    }

    startLoop();
}
