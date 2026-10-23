<?php
// Archived outside public/; restore the page deliberately before using it again.
// One version covers the portable component, its styles, and the assets it loads.
$computerVersion = max(array_map('filemtime', array_merge(
    [__DIR__ . '/../public/helpers.js'],
    glob(__DIR__ . '/../public/assets/rooms/models/computer-*.png'),
    glob(__DIR__ . '/../public/assets/rooms/audio/computer-*.wav')
)));
// Keep the test-only sky module and converted sky images fresh together.
$skyVersion = max(array_map('filemtime', array_merge(
    [__DIR__ . '/../public/helpers.js'],
    glob(__DIR__ . '/../public/assets/rooms/images/skies/*.png')
)));
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>y9k — model test room</title>
    <style>
        .wall-image-editor {
                position: fixed;
                inset: auto auto 0 0;
                margin: 0;
                padding: 1em;
                border: none;
                background: yellow;
                color: black;
                font-family: serif;
                font-size: 13px;
                line-height: 15px;
            }
            .wall-image-editor label {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            .wall-image-editor input,
            .wall-image-editor select,
            .wall-image-editor button {
                font: inherit;
            }
            .wall-image-editor input[type="file"] {
                margin-bottom: 12px;
            }
            .wall-image-editor [data-url] {
                color: blue;
                text-decoration: underline;
                overflow-wrap: anywhere;
            }
            .wall-image-editor .modal-label {
                text-decoration: underline;
            }
            .wall-editor-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }
            .wall-editor-filename {
                min-width: 0;
                font-size: 16px;
                color: purple;
                text-decoration: underline;
                overflow-wrap: anywhere;
            }
            .wall-editor-actions {
                margin-top: 12px;
            }
            .wall-image-editor button[name="close"] {
                font-size: 13px;
                font-weight: normal;
                flex-shrink: 0;
            }

        #room-editor, #music-toggle, #wall-click-hud { display: none !important; }
    </style>
</head>
<body>
    <div id="stage"></div>
    <script type="module">
        import { GALLERY_LIGHTING_DEFAULTS, createRoom, roomAsset, addComputer, addSkyWorkshop } from '../public/helpers.js?v=<?= max($computerVersion, $skyVersion) ?>';

        const imageURLs = new Map();

        // A browser-only adapter gives the existing editor Save/Move/Delete behavior.
        // No files or placements are sent to PHP or the application database.
        const persistence = {
            async upload(placement, file) {
                const id = crypto.randomUUID();
                const url = URL.createObjectURL(file);
                imageURLs.set(id, url);
                return { id, url, filename: file.name };
            },
            async move() {}, // The room already moves the image mesh in this tab.
            async delete(placement) {
                const id = String(placement.id);
                const url = imageURLs.get(id);
                if (url) URL.revokeObjectURL(url);
                imageURLs.delete(id);
            },
        };

        const room = createRoom({
            id: 'local-model-test', gallery: true, images: [],
            roomInfo: 'Model test room — computer settings are saved in this browser.',
            doors: { south: { locked: true, href: null } },
        }, {
            persistence,
            rememberLights: false, lightsOn: true,
            gallerySkylight: true, skylightChance: 100,
            ...GALLERY_LIGHTING_DEFAULTS,
            ambientLight: 2.7, directionalLight: 0.55,
            skylightTreeLift: 82, skylightTreeWidth: 32,
            skylightTreeHeight: 15, skylightTreeDepth: 36,
            defaultFurnishings: false, distinctGalleryDoors: false,
            showRoomNumbers: false, roomEntryTransition: false,
            // Use static audio URLs so this page never needs index.php's asset route.
            music: roomAsset('audio/wind-indoors-1.mp3'), lightBuzz: null,
            doorLockedSound: roomAsset('audio/door-close-1.mp3'),
            doorUnlockedSound: roomAsset('audio/door-close-1.mp3'),
            pageSfx: roomAsset('audio/light-switch.wav'),
            doorLockedVolume: 0, temporaryVolumeSliders: true,
        });

        try {
            await room.mount();
            // Keep the door visible but remove it from both mouse and keyboard interactions.
            const door = room.doors.south.mesh;
            const index = room.app.clickable.indexOf(door);
            if (index !== -1) room.app.clickable.splice(index, 1);
            if (door) door.userData.isDoor = false;

            // Match the normal gallery switch and plaque positions beside the door.
            room.addCustom(({ scene, layout }) => {
                const switchX = door.position.x - door.geometry.parameters.width / 2 - 0.5;
                const wallZ = layout.walls.south.z;
                const switchHeight = door.geometry.parameters.height / 2;
                room._factories.addLightSwitch('south', switchX, wallZ, switchHeight,
                    { scale: 1.55, switches: 1, isDisabled: false });
                const tag = room._createRoomPlaque('info / sound', 0.5, '#f4f4ec');
                tag.rotation.y = Math.PI;
                tag.position.set(switchX, layout.floorY + switchHeight + 0.4, wallZ);
                tag.translateZ(0.065);
                tag.userData.roomInfo = true;
                scene.add(tag);
                room.app.clickable.push(tag);
            });

            await room.ready;
            // Test mode keeps hold-to-edit controls and existing browser settings.
            const computer = await addComputer(room, { editor: true, shadowMolding: true, assetVersion: <?= $computerVersion ?> })
                .catch(error => { console.error('Computer could not load:', error); return null; });
            // The gear and sky opening share one workshop, including the computer's off-state shadow.
            await addSkyWorkshop(room, { computer }).catch(error => console.error('Sky workshop could not load:', error));
        } catch (error) {
            console.error(error);
        }
    </script>
</body>
</html>
