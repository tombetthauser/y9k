import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

export const roomAsset = (path) => {
    if (path.startsWith("images/"))
        return new URL("./assets/rooms/" + path, import.meta.url).href;
    return new URL("./index.php?asset=" + encodeURIComponent(path), import.meta.url).href;
};

export const createRoom = (data = {}, options = {}) => {
    const doors = Object.fromEntries(Object.entries(data.doors ?? {}).map(([wall, door]) => {
        if (!door || door.exists === false)
            return [wall, false];
        if (door === true || door.neighborId == null)
            return [wall, door];
        return [wall, {
                ...door,
                href: door.href ?? new URL("./" + encodeURIComponent(door.neighborId), import.meta.url).href,
                label: door.label ?? door.neighborId.toUpperCase(),
            }];
    }));
    const config = { roomId: data.id ?? "demo", exitWall: data.exitWall, roomInfo: data.roomInfo, doors, ...options };
    const gallery = data.gallery ?? Object.values(config.doors).filter(door => door && door.exists !== false).length < 2;
    const room = gallery ? new Gallery(config) : new Hallway(config);
    if (gallery)
        room.addImages(data.images ?? [], { stored: true });
    return room;
};

export const createRoomStorage = (id, { endpoint = "index.php", onChange = () => {} } = {}) => {
    const url = endpoint + "?room=" + encodeURIComponent(id);
    const request = async (action, values = {}, file = null) => {
        const form = new FormData();
        form.set("room", id);
        form.set("action", action);
        for (const [key, value] of Object.entries(values))
            form.set(key, String(value));
        if (file)
            form.set("image", file);
        const res = await fetch(url, { method: "POST", body: form, headers: { Accept: "application/json" } });
        const data = await res.json();
        if (!res.ok || !data.ok)
            throw new Error(data.error || "Could not save the change.");
        return data;
    };
    return {
        async upload(p, file) {
            const data = await request("upload", storedPlacement(p), file);
            onChange({ action: "upload", image: { ...data, ...storedPlacement(p) } });
            return data;
        },
        async move(p) {
            await request("move", { id: p.id, ...storedPlacement(p) });
            onChange({ action: "move", image: { id: p.id, ...storedPlacement(p) } });
        },
        async delete(p) {
            await request("delete", { id: p.id });
            onChange({ action: "delete", image: { id: p.id } });
        },
    };
};

export const storedPlacement = (p) => {
    return { wall: CARDINAL_WALLS.indexOf(p.wall), x: p.x * 2.54, y: p.y * 2.54, width: p.width * 2.54 };
};

const CARDINAL_WALLS = ["north", "east", "south", "west"];

const INCHES_PER_WORLD_UNIT = 20;

let mountedRoom = null;

export const roomWall = (value = "north") => {
    const wall = typeof value === "number" ? CARDINAL_WALLS[value] : value;
    if (!CARDINAL_WALLS.includes(wall))
        throw new Error("Wall must be north/east/south/west or 0/1/2/3.");
    return wall;
};

const inchesToWorld = (inches) => Number(inches) / INCHES_PER_WORLD_UNIT;

const feetToWorld = (feet) => inchesToWorld(Number(feet) * 12);

const worldToInches = (world) => world * INCHES_PER_WORLD_UNIT;

const wallRightSign = (wall) => wall === "south" || wall === "west" ? -1 : 1;

export const roomOutline = ({ width = 12, length = 12, corridorWidth = 4, doors = {}, hallway = false } = {}) => {
    const w = feetToWorld(width), d = feetToWorld(length);
    if (!hallway)
        return outlineFromBox(w, d);
    const arm = feetToWorld(corridorWidth);
    if (!(arm > 0 && arm < Math.min(w, d)))
        throw new Error("corridorWidth must be smaller than width and length.");
    const xs = [-w / 2, -arm / 2, arm / 2, w / 2];
    const zs = [-d / 2, -arm / 2, arm / 2, d / 2];
    const occupied = new Set(["1,1"]);
    if (doors.north)
        occupied.add("1,0");
    if (doors.east)
        occupied.add("2,1");
    if (doors.south)
        occupied.add("1,2");
    if (doors.west)
        occupied.add("0,1");
    const edges = new Map();
    for (const cell of occupied) {
        const [x, z] = cell.split(",").map(Number);
        const corners = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]];
        const neighbors = [[x, z - 1], [x + 1, z], [x, z + 1], [x - 1, z]];
        corners.forEach((corner, i) => {
            if (!occupied.has(neighbors[i].join(",")))
                edges.set(corner.join(","), corners[(i + 1) % 4]);
        });
    }
    const start = edges.keys().next().value;
    let key = start;
    const points = [];
    do {
        const [x, z] = key.split(",").map(Number);
        points.push([xs[x], zs[z]]);
        key = edges.get(key).join(",");
    } while (key !== start);
    return points.filter((point, i) => {
        const before = points[(i + points.length - 1) % points.length];
        const after = points[(i + 1) % points.length];
        return (point[0] - before[0]) * (after[1] - point[1]) !== (point[1] - before[1]) * (after[0] - point[0]);
    });
};

const roomSegments = (outline) => {
    return outline.map(([x1, z1], index) => {
        const [x2, z2] = outline[(index + 1) % outline.length];
        const dx = x2 - x1, dz = z2 - z1;
        const wall = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "north" : "south") : (dz > 0 ? "east" : "west");
        return { index, wall, x: (x1 + x2) / 2, z: (z1 + z2) / 2, length: Math.hypot(dx, dz) };
    });
};

const installRoomUI = (target) => {
    if (!document.getElementById("room-library-styles")) {
        const style = document.createElement("style");
        style.id = "room-library-styles";
        style.textContent = ROOM_STYLES + `
            /* Canvas holds edit artwork instead of selecting text or opening mobile menus. */
            #stage canvas {
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
                -webkit-touch-callout: none;
            }
            #room-editor { display:none; position:absolute; right:12px; top:12px; z-index:12; padding:10px; max-width:240px; max-height:65vh; overflow:auto; background:#fffffff0; color:#111; font:13px sans-serif; }
            body.is-dev-mode #room-editor { display:block; }
            #room-editor label { display:block; margin:5px 0; }
            #room-editor input[type=number] { width:70px; }
            #room-editor button { margin:3px; }
            #room-editor-status { white-space:normal; }
            #room-editor [hidden] { display:none !important; }
            #lightbox.has-user-art-delete #lightbox-delete:not([hidden]) { display:inline-block; }
            #room-library-error { position:absolute; top:40%; left:10%; right:10%; background:white; color:black; padding:20px; z-index:20; }
        `;
        document.head.appendChild(style);
    }
    const stage = typeof target === "string" ? document.querySelector(target) : target;
    if (!stage)
        throw new Error("Room mount target was not found.");
    stage.id = "stage";
    if (!document.getElementById("music-toggle")) {
        const sound = document.createElement("button");
        sound.id = "music-toggle";
        sound.type = "button";
        sound.setAttribute("aria-label", "toggle sound");
        stage.appendChild(sound);
    }
    if (!document.getElementById("lightbox")) {
        const lightbox = document.createElement("div");
        lightbox.id = "lightbox";
        lightbox.innerHTML = '<div class="lightbox-frame"><div class="lightbox-stage"><img alt=""><a id="lightbox-caption" target="_blank" rel="noopener"></a></div></div>';
        stage.appendChild(lightbox);
    }
    return stage;
};

export class Room {
    constructor(options = {}, hallway = false) {
        // Scale hallway lighting together; 1 restores the original brightness.
        const hallwayBrightness = options.hallwayBrightness ?? 0.8;
        this.options = {
            hallwayBrightness,
            width: hallway ? 55 / 3 : 20, length: hallway ? 55 / 3 : 20,
            height: hallway ? 6.25 : 10, corridorWidth: 35 / 6,
            doorHeight: hallway ? 64 : 80, artY: -12, artWidth: 32,
            orbitRadius: hallway ? 28 : 44, eyeHeight: hallway ? 49.5 : 60, lookAtHeight: hallway ? 45.5 : 60,
            autoSpin: 0.00035, background: hallway ? 0x111111 : 0xf0f0f0,
            ambientLight: hallway ? 0.05 * hallwayBrightness : 2.7, directionalLight: hallway ? 0.04 * hallwayBrightness : 0.55,
            directionalPosition: hallway ? [1, 3, 2] : [2, 5, 3],
            lightsOn: true, galleryLightFlicker: true,
            floorTexture: roomAsset("images/static_images/floor-2.jpg"),
            ceilingTexture: undefined, wallTexture: null,
            wallColor: hallway ? 0xc8c8c8 : 0xfbfbfd, floorColor: 0xa6a6a6, ceilingColor: undefined,
            floorRepeat: { repeatX: hallway ? 0.2 : 0.25, repeatY: hallway ? 0.2 : 0.25 },
            ceilingRepeat: null,
            wallRepeat: { repeatX: 1, repeatY: 1 },
            molding: hallway ? true : 0xf4f4f6, cornerLines: hallway ? 0x111111 : 0xc4c4c8,
            music: roomAsset("music/wind-indoors-1-muffled.mp3"), musicVolume: 0.25,
            lightBuzz: hallway ? null : roomAsset("music/light-buzz.mp3"), lightBuzzVolume: 0.2,
            keyboard: true, keyboardTurnSpeed: 90, doorFacingTolerance: 45,
            showRoomNumbers: false, distinctGalleryDoors: true, defaultFixtures: true, defaultFurnishings: true, editor: !hallway, roomId: "demo", persistence: null,
            ...options,
        };
        this.hallway = hallway;
        this.doors = {};
        this.commands = [];
        this.images = new Map();
        this.ready = Promise.resolve(this);
        for (const [wall, value] of Object.entries(options.doors || {})) {
            if (value && value.exists !== false)
                this.addDoor(wall, value === true ? {} : value);
        }
    }

    doorCount() { return Object.keys(this.doors).length; }

    addDoor(wall, options = {}) {
        if (this.app)
            throw new Error("Set doors before mount(); hallway outlines depend on them.");
        const name = roomWall(wall);
        if (!this.hallway && !this.doors[name] && this.doorCount() === 1)
            throw new Error("A Gallery can have at most one door.");
        this.doors[name] = { locked: false, ...options };
        return this;
    }

    addNorthDoor(options = {}) { return this.addDoor("north", options); }

    addEastDoor(options = {}) { return this.addDoor("east", options); }

    addSouthDoor(options = {}) { return this.addDoor("south", options); }

    addWestDoor(options = {}) { return this.addDoor("west", options); }

    _enqueue(task) {
        if (this.app)
            this.ready = this.ready.catch(() => {}).then(() => task()).then(() => this);
        else
            this.commands.push(task);
        return this;
    }

    _anchor({ wall = "north", x = 0, segment = null } = {}) {
        wall = roomWall(wall);
        const matches = this.segments.filter(edge => edge.wall === wall);
        matches.sort((a, b) => {
            const coordinate = wall === "north" || wall === "south" ? "z" : "x";
            return (wall === "north" || wall === "west" ? 1 : -1) * (a[coordinate] - b[coordinate]);
        });
        const edge = segment == null ? matches[0] : this.segments.find(edge => edge.index === segment && edge.wall === wall);
        if (!edge)
            throw new Error("No matching wall segment: " + wall);
        const along = inchesToWorld(x) * wallRightSign(wall);
        return { wall, edge, x: edge.x + (wall === "north" || wall === "south" ? along : 0), z: edge.z + (wall === "east" || wall === "west" ? along : 0) };
    }

    _wallBounds(anchor) {
        const b = { ...this.layout.bounds };
        const { wall, edge } = anchor;
        b.centerX = edge.x;
        b.centerZ = edge.z;
        if (wall === "north" || wall === "south") {
            b.halfX = edge.length / 2;
            if (wall === "north")
                b.minZ = edge.z;
            else
                b.maxZ = edge.z;
        }
        else {
            b.halfZ = edge.length / 2;
            if (wall === "west")
                b.minX = edge.x;
            else
                b.maxX = edge.x;
        }
        return b;
    }

    async mount(target = "#stage") {
        if (this.app)
            return this.ready;
        if (mountedRoom)
            throw new Error("Mount one room per page; navigate to display a different room.");
        if (this.hallway && (this.doorCount() < 2 || this.doorCount() > 4))
            throw new Error("A Hallway needs two to four doors.");
        const o = this.options;
        if (!(o.width > 0 && o.length > 0 && o.height > 0))
            throw new Error("Room dimensions must be positive feet.");
        this.stage = installRoomUI(target);
        const height = feetToWorld(o.height);
        this.app = createRoomApp({
            musicPath: o.music, musicVolume: o.musicVolume,
            lightBuzzPath: o.lightBuzz, lightBuzzVolume: o.lightBuzzVolume,
            orbitRadius: inchesToWorld(o.orbitRadius), floorY: -height / 2,
            heightFromFloor: inchesToWorld(o.eyeHeight), lookAtHeightFromFloor: inchesToWorld(o.lookAtHeight),
            autoSpin: o.autoSpin, background: o.background, enableLightbox: true, enableVideoLightbox: true,
            ambientLight: o.ambientLight, directionalLight: o.directionalLight,
            lightboxSfxVolume: o.lightboxSfxVolume, doorLockedSound: o.doorLockedSound,
            doorUnlockedSound: o.doorUnlockedSound, lightSwitchSound: o.lightSwitchSound, pageSfx: o.pageSfx,
            directionalPosition: o.directionalPosition ?? [2, 5, 3], lightsOn: !this.hallway && o.galleryLightFlicker ? false : o.lightsOn,
            onHit: object => this._hit(object),
            onFrame: delta => this.keyboard?.update(delta) ?? false,
        });
        mountedRoom = this;
        this._addAudioToggle(document.querySelector("#lightbox .lightbox-frame"));
        this._addAudioToggle(document.querySelector("#video-lightbox .video-lightbox-frame"));
        if (!this.hallway && o.galleryLightFlicker) {
            this.galleryLights = createGalleryLightStartup({ lights: this.app.roomLights });
        }
        this.app.camera.fov = o.fov ?? 72;
        this.app.camera.near = o.near ?? 0.1;
        this.app.camera.far = o.far ?? 100;
        this.app.camera.updateProjectionMatrix();
        const { scene, textureLoader, wallClick, roomLights } = this.app;
        const olderHallway = this.hallway && this.doorCount() < 4;
        const ceilingColor = o.ceilingColor ?? (this.hallway ? (olderHallway ? 0xc2c2c2 : 0xc9c9c9) : 0xfafafa);
        const ceilingTexture = o.ceilingTexture === undefined ? roomAsset("images/static_images/ceiling.jpg") : o.ceilingTexture;
        const materials = {
            wall: new THREE.MeshStandardMaterial({ color: o.wallColor, side: THREE.FrontSide, ...o.wallMaterial }),
            floor: new THREE.MeshStandardMaterial({ color: o.floorColor, side: THREE.FrontSide, ...o.floorMaterial }),
            ceiling: new THREE.MeshStandardMaterial({ color: ceilingColor, side: THREE.FrontSide, ...o.ceilingMaterial }),
        };
        const outline = o.outline ? o.outline.map(([x, z]) => [inchesToWorld(x), inchesToWorld(z)]) : roomOutline({ ...o, doors: this.doors, hallway: this.hallway });
        const bounds = outlineBounds(outline);
        for (const surface of ["wall", "floor", "ceiling"]) {
            const repeats = o[surface + "Repeat"] ?? { repeatX: bounds.width / CEILING_TILE_WORLD_SIZE, repeatY: bounds.depth / CEILING_TILE_WORLD_SIZE };
            const color = surface === "floor" ? 0xffffff : materials[surface].color.getHex();
            const texture = surface === "ceiling" ? ceilingTexture : o[surface + "Texture"];
            if (texture)
                loadMapOntoMaterial(textureLoader, materials[surface], texture, { color, ...repeats });
        }
        this.segments = roomSegments(outline);
        this.layout = createRoomLayout({ scene, outline, height, floorY: -height / 2, materials,
            molding: o.molding, cornerLines: o.cornerLines, horizontalLines: o.horizontalLines ?? !olderHallway, wallClick, roomLights });
        this.materials = materials;
        this._factories = this.app.createPropFactories({ ...this.layout, doorHeight: inchesToWorld(o.doorHeight) });
        this._factories.addLightFixture = createAddLightFixture({ scene, textureLoader, ...this.layout, roomLights });
        for (const [wall, door] of Object.entries(this.doors))
            await this._createDoor(wall, door);
        if (this.hallway)
            this._addReferenceHallway();
        if (!this.hallway)
            this._addReferenceGallery();
        for (const task of this.commands.splice(0))
            await task();
        if (o.editor && !this.hallway)
            this.enableEditor();
        if (o.editor && !this.hallway)
            this.enableWallEditor();
        if (o.keyboard)
            this.keyboard = bindRoomKeyboard({ room: this, turnSpeed: o.keyboardTurnSpeed, facingTolerance: o.doorFacingTolerance });
        this.app.startLoop();
        if (this.galleryLights && o.lightsOn)
            this.galleryLights.setOn(true);
        this.ready = Promise.resolve(this);
        return this;
    }

    _addReferenceGallery() {
        const o = this.options, f = this._factories;
        if (o.defaultFixtures) {
            for (const x of [-3.4, 3.4]) {
                for (const z of [-3.4, 0, 3.4]) {
                    f.addLightFixture(x * feetToWorld(o.width) / 12, z * feetToWorld(o.length) / 12, 0, { scale: 2.1 });
                }
            }
        }
        if (!o.defaultFurnishings)
            return;
        for (const [wall, spec] of Object.entries(this.doors)) {
            const door = spec.mesh;
            if (!door)
                continue;
            const a = this._anchor({ wall });
            const width = door.geometry.parameters.width;
            const along = wall === "north" || wall === "south" ? door.position.x : door.position.z;
            const switchAlong = along - width / 2 - 0.5;
            const wx = wall === "north" || wall === "south" ? switchAlong : this.layout.walls[wall].x;
            const wz = wall === "north" || wall === "south" ? this.layout.walls[wall].z : switchAlong;
            f.addLightSwitch(wall, wx, wz, door.geometry.parameters.height / 2, { scale: 1.55, switches: 1, isDisabled: false });
            const plaque = this._createRoomPlaque("Gallery " + String(o.roomId).toUpperCase(), 0.5, "#f4f4ec");
            plaque.rotation.y = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 }[wall];
            plaque.position.set(wx, -this.layout.height / 2 + door.geometry.parameters.height / 2 + 0.4, wz);
            plaque.translateZ(0.065);
            plaque.userData.galleryEntry = { id: String(o.roomId), url: window.location.href, current: true };
            this.app.scene.add(plaque);
            this.app.clickable.push(plaque);
            const half = a.edge.length / 2;
            const ventFromLeft = half + along * wallRightSign(wall);
            f.addVent(wall, ventFromLeft, { width: width * 2 / 3, yFromCeiling: 0.28 });
        }
    }

    _addReferenceHallway() {
        addReferenceHallwayContents(this);
    }

    async _createDoor(wall, spec) {
        const a = this._anchor({ wall });
        const add = createAddWallDoor({ ...this.app, ...this.layout, roomHeight: this.layout.height, bounds: this._wallBounds(a) });
        const galleryDoor = spec.destinationIsGallery ?? spec.bright ?? false;
        const illuminated = galleryDoor && this.options.distinctGalleryDoors;
        const doorHeight = inchesToWorld(spec.height ?? this.options.doorHeight);
        const file = spec.file ?? roomAsset(illuminated ? "images/door-3.jpg" : "images/door-1.jpg");
        const span = a.edge.length / 2;
        const fixedAlong = this.hallway ? 0 : span - doorHeight * (264 / 676) / 2 - 0.85;
        const mesh = await add(wall, file, doorHeight, {
            href: spec.href ?? null, locked: spec.locked,
            bright: this.hallway ? false : illuminated,
            x: fixedAlong,
            isLabelled: this.options.showRoomNumbers && spec.label != null, label: spec.label ?? null,
            width: spec.width == null ? null : inchesToWorld(spec.width),
        });
        spec.mesh = mesh;
        // Gallery entrances get the same raised, softly illuminated housing as exit signs.
        if (mesh && galleryDoor)
            this._factories.addExitSign(mesh, { file: roomAsset("images/enter.png"), right: true, heightRatio: 3 / 4, height: EXIT_DEFAULT_BOX_HEIGHT * 1.25,
                onCreate: sign => this._addGalleryEntryLabel(sign, spec) });
        if (spec.exitSign && mesh && !this.hallway)
            this._factories.addExitSign(mesh);
        return mesh;
    }

    // Exit signs expose compact location details without moving the user to another room.
    _addRoomExitSign(door) {
        this._factories.addExitSign(door, {
            file: EXIT_DEFAULT_IMAGE,
            onCreate: sign => {
                sign.userData.roomInfo = true;
                this.app.clickable.push(sign);
            },
        });
    }

    // Attach a small clickable destination plaque beneath the entrance sign.
    _addGalleryEntryLabel(sign, spec) {
        if (!spec.href) return;
        const url = new URL(spec.href, window.location.href);
        const id = String(spec.neighborId ?? url.searchParams.get("room") ?? spec.label ?? "gallery");
        const plaque = this._createRoomPlaque("Gallery " + id.toUpperCase(), sign.geometry.parameters.width, "#c9c9c9", 0.012);
        const height = plaque.geometry.parameters.height;
        plaque.position.set(0, -sign.geometry.parameters.height / 2 - height / 2 - 0.075,
            sign.geometry.parameters.depth / 2 + 0.002);
        plaque.userData.galleryEntry = { id, url: url.href };
        sign.add(plaque);
        this.app.clickable.push(plaque);
    }

    // Labels follow room lighting, with an optional faint glow for dark hallways.
    _createRoomPlaque(text, width, background = "#d2d2d2", glow = 0) {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 192;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#191919";
        ctx.font = "48px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 40);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return new THREE.Mesh(new THREE.PlaneGeometry(width, width * canvas.height / canvas.width),
            new THREE.MeshStandardMaterial({ map: texture, emissive: 0xffffff,
                emissiveMap: texture, emissiveIntensity: glow }));
    }

    // Every panel shares the same saved audio preference and updates immediately when it changes.
    _addAudioToggle(panel) {
        if (!panel || panel.querySelector("[data-room-audio]")) return;
        const label = document.createElement("label");
        label.dataset.roomAudio = "";
        label.innerHTML = '<span class="modal-label">audio</span>: <input type="checkbox" aria-label="audio on/off">';
        const input = label.querySelector("input");
        this.app.music.onSoundChange(on => input.checked = on);
        input.onchange = () => this.app.music.setSoundOn(input.checked);
        // Keep checkbox taps from closing a lightbox or starting image dragging.
        for (const type of ["click", "pointerdown", "dblclick"])
            label.addEventListener(type, event => event.stopPropagation());
        panel.appendChild(label);
    }

    // Switching room interactions closes the old panel and discards unsaved previews first.
    async _closeModals() {
        if (this.wallEditor?.open) await this.closeWallEditor();
        this.entryDialog?.close();
        this.app.lightbox?.close();
        this.app.videoLightbox?.close();
        this.app.wallClick.hideCrosshair();
    }

    // Resolve door links against this deployment and offer copying without navigation.
    async _openGalleryEntry({ id, url, current = false, info = null }) {
        await this._closeModals();
        if (!this.entryDialog) {
            const panel = document.createElement("dialog");
            panel.className = "wall-image-editor";
            panel.setAttribute("aria-label", "gallery entry details");
            panel.innerHTML = `<div class="wall-editor-header">
                <span data-entry></span><button type="button" name="close" aria-label="close gallery details">x</button>
                </div><p data-info hidden style="white-space:pre-line"></p><p><a data-url></a></p>
                <button type="button" data-copy>copy room link</button><p role="status" aria-live="polite"></p>`;
            this.stage.appendChild(panel);
            this._addAudioToggle(panel);
            panel.querySelector('[name="close"]').onclick = () => panel.close();
            panel.querySelector("[data-copy]").onclick = async () => {
                const link = panel.querySelector("[data-url]"), status = panel.querySelector("[role=status]");
                const selectLink = () => {
                    const range = document.createRange();
                    range.selectNodeContents(link);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                };
                try {
                    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link.href);
                    else {
                        selectLink();
                        if (!document.execCommand("copy")) throw new Error("copy unavailable");
                    }
                    status.textContent = "room link copied";
                } catch {
                    selectLink();
                    status.textContent = "select and copy the room link manually";
                }
            };
            this.entryDialog = panel;
        }
        const heading = this.entryDialog.querySelector("[data-entry]");
        if (info || !current) {
            const label = document.createElement("span");
            label.className = "modal-label";
            label.textContent = info ? "Current Room" : "Entry to Gallery";
            heading.replaceChildren(label, document.createTextNode(": " + id.toUpperCase()));
        } else {
            heading.textContent = "Gallery " + id.toUpperCase();
        }
        const details = this.entryDialog.querySelector("[data-info]");
        details.hidden = !info;
        // Build text nodes so labels can be styled without treating room data as HTML.
        details.replaceChildren();
        for (const [index, line] of (info ?? "").split("\n").entries()) {
            if (index) details.append(document.createTextNode("\n"));
            const colon = line.indexOf(":");
            if (colon < 0) { details.append(document.createTextNode(line)); continue; }
            const label = document.createElement("span");
            label.className = "modal-label";
            label.textContent = line.slice(0, colon);
            details.append(label, document.createTextNode(line.slice(colon)));
        }
        const link = this.entryDialog.querySelector("[data-url]");
        link.href = url;
        link.textContent = url;
        this.entryDialog.querySelector("[role=status]").textContent = "";
        if (!this.entryDialog.open) this.entryDialog.show();
    }

    async _hit(object) {
        const data = object.userData;
        // Releasing the press that opened artwork editing must not open its lightbox.
        if (data.imageFile && this._heldArtwork === data.roomImageId) {
            this._heldArtwork = null;
            return;
        }
        if (data.roomInfo) {
            this._openGalleryEntry({ id: String(this.options.roomId), url: window.location.href,
                info: this.options.roomInfo ?? "Room " + String(this.options.roomId).toUpperCase() });
            return;
        }
        if (data.galleryEntry) { this._openGalleryEntry(data.galleryEntry); return; }
        await this._closeModals();
        if (data.roomImageId != null && !this.images.has(String(data.roomImageId))) return;
        if (data.isLightSwitch) {
            if (this._doorTravelPending)
                return;
            if (data.isDisabled === false) {
                if (this.galleryLights)
                    this.galleryLights.setOn(!this.galleryLights.isRequestedOn());
                else
                    this.app.roomLights.toggle();
            }
            this.app.music.playSfx(this.options.lightSwitchSound ?? DEFAULT_LIGHT_SWITCH_SOUND);
        }
        else if (data.isDoor) {
            if (this._doorTravelPending)
                return;
            if (data.locked) {
                this.app.music.playSfx(this.app.doorLockedSound);
            }
            else {
                writeStoredViewFacing(data.wall);
                this._doorTravelPending = true;
                const exit = async () => {
                    if (!this.hallway && data.href) {
                        const lightsWereOn = this.app.roomLights.isOn();
                        (this.galleryLights ?? this.app.roomLights).setOn(false);
                        if (lightsWereOn) {
                            await this.app.music.playSfx(this.options.lightSwitchSound ?? DEFAULT_LIGHT_SWITCH_SOUND);
                            await new Promise(resolve => setTimeout(resolve, 120));
                        }
                    }
                    await this.app.music.playSfx(this.app.doorUnlockedSound);
                };
                exit().then(() => {
                    if (data.href)
                        window.location.assign(data.href);
                    else
                        this._doorTravelPending = false;
                }).catch(error => {
                    this._doorTravelPending = false;
                    console.error("Door travel failed", error);
                });
            }
        }
        else if (data.isVideoScreen) {
            if (data.videoUrl)
                this.app.videoLightbox.open(data.videoUrl);
        }
        else if (data.imageFile) {
            this.selectImage(data.roomImageId);
            this.app.lightbox.open(data.imageFile, this.app.music.isSoundOn(), data.imageName, { source: object });
        }
        this.options.onHit?.(object, this);
    }

    addImage({ wall = "north", x = 0, y = this.options.artY, width = this.options.artWidth, file, id = null, name = null, editable = true } = {}) {
        if (!file)
            throw new Error("addImage needs a URL, File, or Blob in file.");
        wall = roomWall(wall);
        id = id ?? globalThis.crypto?.randomUUID?.() ?? "art-" + Math.random().toString(36).slice(2);
        return this._enqueue(async () => {
            if (this.images.has(String(id)))
                throw new Error("Duplicate image id: " + id);
            const anchor = this._anchor({ wall });
            const bounds = this._wallBounds(anchor);
            const add = createAddUserWallImage({ ...this.app, ...this.layout, bounds });
            const art = await add(wall, inchesToWorld(x) * wallRightSign(wall), file, inchesToWorld(width), {
                heightFromFloor: this.layout.height / 2 + inchesToWorld(y),
            });
            if (!art)
                throw new Error("Could not load image: " + (name ?? id));
            art.userData.roomImageId = String(id);
            art.userData.editable = editable;
            art.userData.isUserArt = editable;
            if (name)
                art.userData.imageName = name;
            this.images.set(String(id), art);
        });
    }

    addImages(images, { stored = false, ...options } = {}) {
        if (stored)
            return this.addDatabaseImages(images, options);
        for (const image of images)
            this.addImage(image);
        return this;
    }

    async placeImage(image) {
        if (!this.images.has(String(image.id))) {
            this.addImage({ id: image.id, file: image.url, name: image.filename });
            await this.ready;
        }
        this.selectImage(image.id);
        if (!document.body.classList.contains("is-dev-mode"))
            document.getElementById("dev-toggle").click();
        this.editor.open = true;
        this.editorStatus.textContent = "Choose a wall position, then Save selected to store it.";
        return this;
    }

    addDatabaseImages(rows, { url = row => row.url } = {}) {
        for (const row of rows) {
            if (row.wall == null || row.x == null || row.y == null || !(row.width > 0))
                continue;
            this.addImage({ id: row.id, name: row.filename, file: url(row), wall: Number(row.wall),
                x: row.x / 2.54, y: row.y / 2.54, width: row.width / 2.54 });
        }
        return this;
    }

    imagePlacement(id) {
        const art = this.images.get(String(id));
        if (!art)
            throw new Error("Unknown image id: " + id);
        const p = art.userData.placement;
        return { id: String(id), wall: p.wall, x: worldToInches(p.x) * wallRightSign(p.wall),
            y: worldToInches(p.heightFromFloor - this.layout.height / 2), width: worldToInches(art.userData.artWidth) };
    }

    databasePlacement(id) {
        const p = this.imagePlacement(id);
        return { id: p.id, ...storedPlacement(p) };
    }

    async moveImage(id, patch = {}, { persist = true } = {}) {
        const art = this.images.get(String(id));
        if (!art || !art.userData.editable)
            throw new Error("This image cannot be edited.");
        const p = { ...this.imagePlacement(id), ...patch };
        p.wall = roomWall(p.wall);
        const bounds = this._wallBounds(this._anchor({ wall: p.wall }));
        const half = p.wall === "north" || p.wall === "south" ? bounds.halfX : bounds.halfZ;
        p.x = Math.max(-worldToInches(half), Math.min(worldToInches(half), Number(p.x)));
        p.y = Math.max(-this.options.height * 6, Math.min(this.options.height * 6, Number(p.y)));
        if (!(Number(p.width) > 0))
            throw new Error("Image width must be positive.");
        if (persist && this.options.persistence?.move)
            await this.options.persistence.move(p, art);
        art.userData.placement.wall = p.wall;
        updateUserArtPlacement(art, { width: inchesToWorld(p.width),
            uX: (inchesToWorld(p.x) * wallRightSign(p.wall) + half) / (2 * half),
            uY: (inchesToWorld(p.y) + this.layout.height / 2) / this.layout.height,
        }, { ...this.layout, bounds });
        this.selectImage(id);
        return this.imagePlacement(id);
    }

    async deleteImage(id, { persist = true } = {}) {
        const art = this.images.get(String(id));
        if (!art || !art.userData.editable)
            throw new Error("This image cannot be deleted.");
        if (persist && this.options.persistence?.delete)
            await this.options.persistence.delete(this.imagePlacement(id), art);
        this.app.lightbox?.close();
        removeUserWallImage(art, { clickable: this.app.clickable });
        this.images.delete(String(id));
        this.selectedImage = null;
        this._refreshEditor();
    }

    selectImage(id) {
        this.selectedImage = this.images.has(String(id)) ? String(id) : null;
        this._refreshEditor();
    }

    _addWallProp(position, build) {
        return this._enqueue(() => build(this._anchor(position)));
    }

    addBoxes({ wall = "north", x = 0, stack = 1, width = 14.4, height = 11.2, depth = 18.4, wobble = true, face, side, segment = null } = {}) {
        return this._addWallProp({ wall, x, segment }, a => {
            this._factories.addBoxStack(a.x, a.z, a.wall, stack, { width: inchesToWorld(width), height: inchesToWorld(height), depth: inchesToWorld(depth), wobble, face, side });
        });
    }

    addChairs({ wall = "north", x = 0, stack = 1, height = 40.5, width, lean = 0.2, gap = 1.6, clearance = 0.8, file, segment = null } = {}) {
        return this._addWallProp({ wall, x, segment }, a => {
            this._factories.addFoldingChairs(a.x, a.z, a.wall, stack, { height: inchesToWorld(height), width: width == null ? null : inchesToWorld(width), lean, gap: inchesToWorld(gap), clearance: inchesToWorld(clearance), file });
        });
    }

    addLightSwitch({ wall = "north", x = 24, y = 48 - this.options.height * 6, scale = 1.55, switches = 1, disabled = false, segment = null } = {}) {
        return this._addWallProp({ wall, x, segment }, a => {
            this._factories.addLightSwitch(a.wall, a.x, a.z, this.layout.height / 2 + inchesToWorld(y), { scale, switches, isDisabled: disabled });
        });
    }

    addElectricalBox({ wall = "north", x = 0, y = -20, width, height = 19, color = 0xb4b4b4, file = roomAsset("images/static_images/electrical.jpg"), segment = null } = {}) {
        return this._addWallProp({ wall, x, segment }, a => {
            this._factories.addElectricalBox(a.wall, a.x, a.z, file, this.layout.height / 2 + inchesToWorld(y - height / 2), width == null ? undefined : inchesToWorld(width), inchesToWorld(height), color);
        });
    }

    addExitSign({ wall = "north", x = 0, width, height = 7, ceilingGap = 4, color = 0xb4b4b4, file = roomAsset("images/static_images/exit-1.jpg"), segment = null } = {}) {
        return this._addWallProp({ wall, x, segment }, a => {
            this._factories.addExitSign(a.wall, a.x, a.z, file, width == null ? undefined : inchesToWorld(width), inchesToWorld(height), color, inchesToWorld(ceilingGap));
        });
    }

    addLight({ x = 0, z = 0, rotation = 0, scale = 1, length = 27, width = 5.6 } = {}) {
        return this._enqueue(() => this._factories.addLightFixture(inchesToWorld(x), inchesToWorld(z), rotation * Math.PI / 180, { scale, length: inchesToWorld(length), width: inchesToWorld(width) }));
    }

    addVent({ wall = "north", x = 0, width = 13, height = 5, ceilingGap = 5.6, segment = null } = {}) {
        return this._addWallProp({ wall, x, segment }, a => {
            const e = a.edge, sign = wallRightSign(a.wall);
            const spec = { x: e.x, z: e.z, leftX: e.x - sign * e.length / 2, leftZ: e.z - sign * e.length / 2 };
            const add = createAddVent({ ...this.app, ...this.layout, walls: { [a.wall]: spec } });
            add(a.wall, e.length / 2 + inchesToWorld(x), { width: inchesToWorld(width), height: inchesToWorld(height), yFromCeiling: inchesToWorld(ceilingGap) });
        });
    }

    addVideo({ wall = "north", x = 0, y = this.options.artY, width = 40, url = null, preview = null, aspect = 16 / 9, bezel = 2.4, bezelBottom, depth = 1.8, frameColor = 0x111111, color = 0x1a4cff, previewSpeed = 0.4, conduit = false, segment = null } = {}) {
        return this._enqueue(() => {
            const a = this._anchor({ wall, segment });
            const add = createAddWallVideoScreen({ ...this.app, ...this.layout, bounds: this._wallBounds(a) });
            add(a.wall, inchesToWorld(x) * wallRightSign(a.wall), inchesToWorld(width), {
                heightFromFloor: this.layout.height / 2 + inchesToWorld(y), videoUrl: url, previewSrc: preview,
                aspect, bezel: inchesToWorld(bezel), bezelBottom: bezelBottom == null ? undefined : inchesToWorld(bezelBottom),
                depth: inchesToWorld(depth), frameColor, color, previewSpeed, conduit,
            });
        });
    }

    setLights(on = true) {
        return this._enqueue(() => (this.galleryLights ?? this.app.roomLights).setOn(on));
    }

    addCustom(build) {
        return this._enqueue(() => build({ THREE, room: this, ...this.app, layout: this.layout, inchesToWorld, feetToWorld }));
    }

    enableEditor() {
        if (this.hallway || this.editor)
            return this;
        const panel = document.createElement("details");
        panel.id = "room-editor";
        panel.innerHTML = `<summary>Edit artwork</summary>
            <p>Click a wall to choose a new position. Click artwork to select it.</p>
            <label>Wall <select name="wall"><option>north</option><option>east</option><option>south</option><option>west</option></select></label>
            <label>Right/left (in) <input name="x" type="number" step="0.1" value="0"></label>
            <label>Up/down (in) <input name="y" type="number" step="0.1" value="${this.options.artY}"></label>
            <label>Width (in) <input name="width" type="number" min="0.1" step="0.1" value="${this.options.artWidth}"></label>
            <input name="file" type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden>
            <button type="button" data-action="upload">Add image here</button>
            <button type="button" data-action="move">Save selected</button>
            <button type="button" data-action="delete">Delete selected</button>
            <button type="button" data-action="clear">Clear selection</button>
            <p id="room-editor-status" role="status"></p>`;
        this.stage.appendChild(panel);
        this.editor = panel;
        this.editorStatus = panel.querySelector("[role=status]");
        this.editorFields = Object.fromEntries(["wall", "x", "y", "width", "file"].map(key => [key, panel.querySelector(`[name=${key}]`)]));
        const fields = this.editorFields;
        this.app.wallClick.onWallPick(info => {
            if (!panel.open || document.getElementById("lightbox")?.classList.contains("is-open"))
                return;
            const p = info.world, wall = info.wall;
            fields.wall.value = wall;
            fields.x.value = (worldToInches(wall === "north" || wall === "south" ? p.x : p.z) * wallRightSign(wall)).toFixed(1);
            fields.y.value = worldToInches(p.y).toFixed(1);
            const hud = document.getElementById("wall-click-hud");
            if (hud)
                hud.textContent = `${wall}: x ${fields.x.value} in, y ${fields.y.value} in (wall center)`;
        });
        const run = async (action) => {
            panel.querySelectorAll("button").forEach(button => button.disabled = true);
            try {
                await action();
                this.editorStatus.textContent = this.options.persistence ? "Saved." : "Preview only; no storage adapter supplied.";
            }
            catch (error) {
                this.editorStatus.textContent = error.message;
            }
            finally {
                this._refreshEditor();
            }
        };
        const placement = () => ({ wall: fields.wall.value, x: Number(fields.x.value), y: Number(fields.y.value), width: Number(fields.width.value) });
        panel.querySelector('[data-action=upload]').onclick = () => fields.file.click();
        fields.file.onchange = () => run(async () => {
            const file = fields.file.files[0];
            if (!file)
                return;
            const p = placement();
            const saved = this.options.persistence?.upload ? await this.options.persistence.upload(p, file) : {};
            this.addImage({ ...p, file: saved.url ?? file, id: saved.id, name: saved.filename ?? file.name });
            await this.ready;
            fields.file.value = "";
            if (!this.options.persistence)
                this.editorStatus.textContent = "Preview only; no storage adapter supplied.";
        });
        panel.querySelector('[data-action=move]').onclick = () => run(() => this.moveImage(this.selectedImage, placement()));
        panel.querySelector('[data-action=delete]').onclick = () => run(() => this.deleteImage(this.selectedImage));
        panel.querySelector('[data-action=clear]').onclick = () => this.selectImage(null);
        this.app.lightbox.setUserArtDeleteHandler(null);
        this._refreshEditor();
        return this;
    }

    // Double-click a gallery wall to preview an upload without changing the saved room.
    enableWallEditor() {
        if (this.hallway || this.wallEditor)
            return this;
        const panel = document.createElement("dialog");
        panel.id = "wall-image-editor";
        // Style this panel through .wall-image-editor in index.php.
        panel.className = "wall-image-editor";
        panel.innerHTML = `<form>
            <div class="wall-editor-header">
                <div class="wall-editor-filename"></div>
                <button type="button" name="close" aria-label="close artwork editor">x</button>
            </div>
            <input name="file" type="file" aria-label="choose image" accept="image/jpeg,image/png,image/gif,image/webp"><br>
            <label><span><span class="modal-label">wall</span>:</span> <select name="wall"><option>north</option><option>east</option><option>south</option><option>west</option></select></label><br>
            <label><span><span class="modal-label">from left</span>:</span> <input name="x" type="range" step="0.1"><output data-value="x"></output></label><br>
            <label><span><span class="modal-label">from floor</span>:</span> <input name="y" type="range" step="0.1"><output data-value="y"></output></label><br>
            <label><span><span class="modal-label">width</span>:</span> <input name="width" type="range" min="0.1" step="0.1"><output data-value="width"></output></label><br>
            <div class="wall-editor-actions">
                <button type="submit">save</button>
                <button type="button" name="remove" hidden>delete</button>
            </div>
            <div role="status" aria-live="polite"></div>
        </form>`;
        panel.setAttribute("aria-label", "artwork upload and placement");
        this.stage.appendChild(panel);
        this.wallEditor = panel;
        this._addAudioToggle(panel);
        panel.addEventListener("close", () => this.app.wallClick.hideCrosshair());
        const form = panel.querySelector("form"), fields = form.elements;
        const status = panel.querySelector("[role=status]");
        const filename = panel.querySelector(".wall-editor-filename");
        let id = null, file = null, saved = null, busy = false;
        const idle = [];
        const halfWidth = () => (fields.wall.value === "north" || fields.wall.value === "south"
            ? this.options.width : this.options.length) * 6;
        const halfHeight = this.options.height * 6;
        // The form uses left-edge/floor measurements; rendering and storage keep center coordinates.
        const placement = () => ({ wall: fields.wall.value, x: Number(fields.x.value) - halfWidth(),
            y: Number(fields.y.value) - halfHeight, width: Number(fields.width.value) });
        // Match the marker to the rendered preview, including its wall orientation and width.
        const updateMarker = () => {
            if (saved) return;
            const p = placement();
            const art = id && this.images.get(id);
            const pose = art ?? new THREE.Object3D();
            if (!art) {
                const bounds = this._wallBounds(this._anchor({ wall: p.wall }));
                placeOnWall(pose, p.wall, inchesToWorld(p.x) * wallRightSign(p.wall),
                    inchesToWorld(p.y), inchesToWorld(p.width) / 2, bounds);
            }
            this.app.wallClick.updateCrosshair(pose, art?.userData.artWidth ?? inchesToWorld(p.width));
        };
        const measurements = () => {
            for (const key of ["x", "y", "width"])
                panel.querySelector(`[data-value=${key}]`).textContent = `${Number(fields[key].value).toFixed(1)} in`;
        };
        const limits = () => {
            fields.x.min = fields.y.min = 0;
            fields.x.max = halfWidth() * 3;
            fields.y.max = halfHeight * 3;
            fields.width.max = halfWidth() * 3;
        };
        const fill = p => {
            fields.wall.value = p.wall;
            limits();
            const values = { x: p.x + halfWidth(), y: p.y + halfHeight, width: p.width };
            // Preserve older placements that exceed the normal slider range.
            for (const [key, value] of Object.entries(values)) {
                fields[key].min = Math.min(Number(fields[key].min), value);
                fields[key].max = Math.max(Number(fields[key].max), value);
                fields[key].value = Number(value.toFixed(2));
            }
            measurements();
            updateMarker();
        };
        // Disable controls during file loading or a save so two operations cannot overlap.
        const run = async action => {
            if (busy) return;
            busy = true;
            [...fields].forEach(field => field.disabled = true);
            status.textContent = "";
            try { await action(); }
            catch (error) { status.textContent = error.message.toLowerCase(); }
            finally {
                busy = false;
                [...fields].forEach(field => field.disabled = false);
                idle.splice(0).forEach(resolve => resolve());
            }
        };
        const discard = async () => {
            if (id && this.images.has(id)) {
                if (saved) await this.moveImage(id, saved, { persist: false });
                else await this.deleteImage(id, { persist: false });
            }
            id = file = saved = null;
            fields.file.value = "";
        };
        this.closeWallEditor = async () => {
            if (busy) await new Promise(resolve => idle.push(resolve));
            await discard();
            panel.close();
            this.app.wallClick.hideCrosshair();
        };
        const close = () => this.closeWallEditor();
        fields.close.onclick = close;
        fields.remove.onclick = () => run(async () => {
            if (!saved || !id) return;
            await this.deleteImage(id);
            id = file = saved = null;
            panel.close();
        });
        panel.addEventListener("cancel", event => { event.preventDefault(); close(); });
        fields.file.onchange = () => run(async () => {
            const next = fields.file.files[0];
            if (!next) return;
            await discard();
            file = next;
            filename.textContent = file.name;
            id = "preview-" + crypto.randomUUID();
            this.addImage({ ...placement(), id, file, name: file.name });
            try { await this.ready; }
            catch (error) { id = file = null; throw error; }
            fill(this.imagePlacement(id));
            status.textContent = "preview only. save image to upload it.";
        });
        // Moving the preview updates the mesh only; no request is sent until Save.
        form.addEventListener("input", event => {
            if (event.target === fields.wall) limits();
            measurements();
            if (busy || event.target === fields.file || !form.checkValidity()) return;
            if (!id) { updateMarker(); return; }
            this.moveImage(id, placement(), { persist: false }).then(updateMarker)
                .catch(error => status.textContent = error.message.toLowerCase());
        });
        const save = () => run(async () => {
                if (!id) { panel.close(); return; }
                const storage = this.options.persistence;
                if (!storage?.upload || !storage?.move) throw new Error("no image storage is configured.");
                await this.moveImage(id, placement(), { persist: false });
                if (file) {
                    const result = await storage.upload(this.imagePlacement(id), file);
                    // Keep the existing preview mesh, replacing only its temporary identity.
                    const art = this.images.get(id);
                    this.images.delete(id);
                    id = String(result.id);
                    art.userData.roomImageId = id;
                    art.userData.imageName = result.filename ?? file.name;
                    if (art.userData.imageFile?.startsWith("blob:")) URL.revokeObjectURL(art.userData.imageFile);
                    art.userData.imageFile = result.url;
                    this.images.set(id, art);
                    file = null;
                    fields.file.value = "";
                } else {
                    await this.moveImage(id);
                }
                saved = this.imagePlacement(id);
                this.selectImage(id);
                fill(saved);
                id = file = saved = null;
                panel.close();
        });
        form.onsubmit = event => { event.preventDefault(); save(); };
        const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
        const pick = event => {
            const rect = this.app.canvas.getBoundingClientRect();
            pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
                -(event.clientY - rect.top) / rect.height * 2 + 1);
            ray.setFromCamera(pointer, this.app.camera);
            // Only an exposed wall opens the panel; doors, artwork and props stay interactive.
            const hit = ray.intersectObjects(this.app.scene.children, true).find(hit => {
                for (let object = hit.object; object; object = object.parent)
                    if (!object.visible) return false;
                return hit.object.isMesh;
            });
            return hit;
        };
        const blocked = () => busy || this._doorTravelPending;
        const openWallEditor = async event => {
            if (blocked()) return;
            const hit = pick(event);
            if (!hit || !this.app.wallClick.walls.includes(hit.object)) return;
            const wall = hit.object.userData.wall;
            if (!CARDINAL_WALLS.includes(wall)) return;
            await this._closeModals();
            fill({ wall, x: worldToInches(wall === "north" || wall === "south" ? hit.point.x : hit.point.z) * wallRightSign(wall),
                y: worldToInches(hit.point.y), width: this.options.artWidth });
            filename.textContent = "";
            fields.file.hidden = false;
            fields.remove.hidden = true;
            status.textContent = "";
            updateMarker();
            panel.show();
        };
        let lastTouch = -Infinity, touchStart = null, previousTap = null;
        this.app.canvas.addEventListener("dblclick", event => {
            // Ignore a browser-generated double-click following our touch handling.
            if (performance.now() - lastTouch > 700) openWallEditor(event);
        });
        // Mobile browsers need explicit double-tap recognition; drags and holds do not count.
        this.app.canvas.addEventListener("pointerdown", event => {
            if (event.pointerType !== "touch") return;
            lastTouch = performance.now();
            if (!event.isPrimary) { touchStart = previousTap = null; return; }
            touchStart = { id: event.pointerId, x: event.clientX, y: event.clientY, time: lastTouch };
        });
        this.app.canvas.addEventListener("pointermove", event => {
            if (touchStart && event.pointerId === touchStart.id
                && Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > 10)
                touchStart = previousTap = null;
        });
        this.app.canvas.addEventListener("pointerup", event => {
            if (event.pointerType !== "touch") return;
            const start = touchStart;
            touchStart = null;
            lastTouch = performance.now();
            if (!start || start.id !== event.pointerId || lastTouch - start.time > 300) {
                previousTap = null;
                return;
            }
            const hit = pick(event);
            if (!hit || !this.app.wallClick.walls.includes(hit.object)) { previousTap = null; return; }
            if (previousTap && lastTouch - previousTap.time <= 400
                && previousTap.wall === hit.object
                && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= 30) {
                previousTap = null;
                openWallEditor(event);
            } else {
                previousTap = { time: lastTouch, x: event.clientX, y: event.clientY, wall: hit.object };
            }
        });
        this.app.canvas.addEventListener("pointercancel", () => { touchStart = previousTap = null; });
        // A stationary 1.65-second press edits artwork; dragging still rotates the view.
        let hold = null, origin = null;
        const cancelHold = () => { clearTimeout(hold); hold = origin = null; };
        this.app.canvas.addEventListener("pointerdown", event => {
            cancelHold();
            this._heldArtwork = null;
            if (event.button !== 0 || blocked()) return;
            const hit = pick(event), art = hit?.object;
            const imageId = art?.userData.roomImageId;
            if (!art?.userData.editable || !this.images.has(String(imageId))) return;
            origin = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
            hold = setTimeout(async () => {
                if (blocked() || !this.images.has(String(imageId))) return;
                this._heldArtwork = imageId;
                await this._closeModals();
                if (!this.images.has(String(imageId))) return;
                id = String(imageId);
                saved = this.imagePlacement(id);
                file = null;
                fill(saved);
                filename.textContent = art.userData.imageName ?? "";
                fields.file.hidden = true;
                fields.remove.hidden = false;
                status.textContent = "";
                this.selectImage(id);
                this.app.wallClick.hideCrosshair();
                panel.show();
            }, 1650);
        });
        this.app.canvas.addEventListener("pointermove", event => {
            if (origin && (event.pointerId !== origin.pointerId || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 4))
                cancelHold();
        });
        for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
            this.app.canvas.addEventListener(event, cancelHold);
        window.addEventListener("blur", cancelHold);
        return this;
    }

    _refreshEditor() {
        if (!this.editor)
            return;
        const art = this.images.get(this.selectedImage);
        if (art) {
            const p = this.imagePlacement(this.selectedImage);
            for (const field of ["wall", "x", "y", "width"])
                this.editorFields[field].value = typeof p[field] === "number" ? Number(p[field].toFixed(2)) : p[field];
        }
        for (const action of ["move", "delete"])
            this.editor.querySelector(`[data-action=${action}]`).disabled = !art?.userData.editable;
        this.editor.querySelector('[data-action=upload]').disabled = false;
        this.editor.querySelector('[data-action=clear]').disabled = false;
    }
}

export class Gallery extends Room {
    constructor(options = {}) { super(options, false); }
}

export class Hallway extends Room {
    constructor(options = {}) { super(options, true); }
}

export const referenceHallwayVariant = (doors) => {
    const active = CARDINAL_WALLS.filter(wall => doors[wall]);
    const kind = active.length === 4 ? "cross" : active.length === 3 ? "tee"
        : active.some(wall => active.includes(CARDINAL_WALLS[(CARDINAL_WALLS.indexOf(wall) + 2) % 4])) ? "straight" : "corner";
    const canonical = { cross: ["north", "east", "south", "west"], tee: ["north", "east", "west"],
        corner: ["north", "east"], straight: ["east", "west"] }[kind];
    for (let turns = 0; turns < 4; turns++) {
        const rotated = canonical.map(wall => CARDINAL_WALLS[(CARDINAL_WALLS.indexOf(wall) + turns) % 4]);
        if (rotated.length === active.length && rotated.every(wall => active.includes(wall)))
            return { kind, turns };
    }
    throw new Error("A reference hallway needs two to four doors.");
};

const addReferenceHallwayContents = (room) => {
    const { kind, turns } = referenceHallwayVariant(room.doors);
    const group = new THREE.Group();
    const contents = new THREE.Group();
    group.name = "poc-hallway-furnishings";
    contents.rotation.y = -turns * Math.PI / 2;
    group.scale.set(feetToWorld(room.options.width) / 11, room.layout.height / 3.75, feetToWorld(room.options.length) / 11);
    group.add(contents);
    room.app.scene.add(group);
    const context = { scene: contents, textureLoader: room.app.textureLoader, roomHalfY: 3.75 / 2 };
    const furnish = room.options.defaultFurnishings;
    const ignore = () => { };
    const builders = {
        addElectricalBox: furnish ? createAddElectricalBox(context) : ignore,
        addFoldingChairs: furnish ? createAddFoldingChairs(context) : ignore,
        addBoxStack: furnish ? createAddBoxStack(context) : ignore,
        addLightSwitch: furnish ? createAddLightSwitch({ ...context, doorHeight: 3.2, clickable: room.app.clickable }) : ignore,
        addLightFixture: room.options.defaultFixtures ? createAddLightFixture(context) : ignore,
    };
    const addVents = walls => furnish ? createAddVent({ ...context, walls }) : ignore;
    const recipes = { cross: referenceCrossContents, tee: referenceTeeContents, corner: referenceCornerContents, straight: referenceStraightContents };
    recipes[kind]({ ...builders, addVents });
    if (furnish) {
        const door = room.doors[room.options.exitWall ?? "north"];
        if (door?.mesh)
            room._addRoomExitSign(door.mesh);
    }
};

const referenceCrossContents = ({ addElectricalBox, addFoldingChairs, addBoxStack, addLightSwitch, addLightFixture, addVents }) => {
    const hw = 1.75, hl = 5.5, ARM_SIDE = 3.75, CROSS_SPAN = 11, WALL_INSET = 0.05;
    const ELECTRICAL_IMG = roomAsset("images/static_images/electrical.jpg");
    const addVent = addVents({
        west: { x: -(hw - WALL_INSET), leftZ: hw, rightZ: hl },
        east: { x: hw - WALL_INSET, leftZ: -hw, rightZ: -hl },
        north: { z: -(hw - WALL_INSET), leftX: hw, rightX: hl },
        south: { z: hw - WALL_INSET, leftX: -hw, rightX: -hl },
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
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("west", x);
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("east", x);
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("north", x);
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("south", x);
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
};

const referenceTeeContents = ({ addElectricalBox, addFoldingChairs, addBoxStack, addLightSwitch, addLightFixture, addVents }) => {
    const hw = 1.75, hl = 5.5, ARM_SIDE = 3.75, CROSS_SPAN = 11, WALL_INSET = 0.05;
    const ELECTRICAL_IMG = roomAsset("images/static_images/electrical.jpg");
    const addVent = addVents({
        south: { z: hw - WALL_INSET, leftX: hl, rightX: -hl },
        west: { x: -(hw - WALL_INSET), leftZ: -hl, rightZ: -hw },
    });
    addElectricalBox("east", hw - WALL_INSET, -(hw + hl) * 0.55, ELECTRICAL_IMG);
    {
        const sw = 0.58;
        addLightSwitch("north", 0.9, -(hl - WALL_INSET));
        {
            const z = -(hw - WALL_INSET);
            const x0 = hw + 1.2;
            addLightSwitch("north", x0, z);
            addLightSwitch("north", x0 + sw, z);
        }
    }
    {
        const cx = -(hw - WALL_INSET);
        const cz = -(hw + hl) * 0.45;
        const gap = 0.85;
        addFoldingChairs(cx, cz - gap, "west", 2);
        addFoldingChairs(cx, cz, "west", 3);
    }
    {
        for (const x of ventPositionsAlongWall(CROSS_SPAN, 3))
            addVent("south", x);
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("west", x);
    }
    {
        for (const t of lightPositionsAlong(CROSS_SPAN, 3)) {
            addLightFixture(-hl + t, 0, 0);
        }
        for (const t of lightPositionsAlong(ARM_SIDE, 1)) {
            addLightFixture(0, -hw - t, Math.PI / 2);
        }
    }
    {
        const z = hw - WALL_INSET;
        addBoxStack(2.2, z, "south", 2);
        addBoxStack(2.2 + 1.25, z, "south", 3);
        addBoxStack(2.2 + 1.25 + 1.1, z, "south", 2);
        addBoxStack(-3.55, z, "south", 3);
    }
};

const referenceCornerContents = ({ addElectricalBox, addFoldingChairs, addBoxStack, addLightSwitch, addLightFixture, addVents }) => {
    const hw = 1.75, hl = 5.5, ARM_SIDE = 3.75, CROSS_SPAN = 11, WALL_INSET = 0.05;
    const ELECTRICAL_IMG = roomAsset("images/static_images/electrical.jpg");
    const addVent = addVents({
        south: { z: hw - WALL_INSET, leftX: hl, rightX: -hw },
        north: { z: -(hw - WALL_INSET), leftX: hw, rightX: hl },
        east: { x: hw - WALL_INSET, leftZ: -hw, rightZ: -hl },
    });
    addElectricalBox("west", -(hw - WALL_INSET), -(hw + hl) * 0.55, ELECTRICAL_IMG);
    {
        const sw = 0.58;
        addLightSwitch("east", hl - WALL_INSET, -0.9);
        {
            const z = hw - WALL_INSET;
            const x0 = -0.2;
            addLightSwitch("south", x0, z);
            addLightSwitch("south", x0 + sw, z);
        }
    }
    {
        const cx = hw - WALL_INSET;
        const cz = -(hw + hl) * 0.45;
        const gap = 0.85;
        addFoldingChairs(cx, cz - gap, "east", 1);
        addFoldingChairs(cx, cz, "east", 2);
    }
    {
        const longLen = hl + hw;
        for (const x of ventPositionsAlongWall(longLen, 2))
            addVent("south", x);
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("north", x);
        for (const x of ventPositionsAlongWall(ARM_SIDE, 1))
            addVent("east", x);
    }
    {
        for (const t of lightPositionsAlong(hl + hw, 2)) {
            addLightFixture(0, -hl + t, Math.PI / 2);
        }
        for (const t of lightPositionsAlong(ARM_SIDE, 1)) {
            addLightFixture(hw + t, 0, 0);
        }
    }
    {
        const z = -(hw - WALL_INSET);
        addBoxStack(hw + 1.15, z, "north", 3);
        addBoxStack(hw + 1.15 + 1.35, z, "north", 2);
        addBoxStack(hl - 2.1, hw - WALL_INSET, "south", 2);
        addBoxStack(hl - 2.1 + 1.15, hw - WALL_INSET, "south", 3);
    }
};

const referenceStraightContents = ({ addElectricalBox, addFoldingChairs, addBoxStack, addLightSwitch, addLightFixture, addVents }) => {
    const hw = 1.75, hl = 5.5, ARM_SIDE = 3.75, CROSS_SPAN = 11, WALL_INSET = 0.05;
    const ELECTRICAL_IMG = roomAsset("images/static_images/electrical.jpg");
    const addVent = addVents({
        north: { z: -(hw - WALL_INSET), leftX: -hl, rightX: hl },
        south: { z: hw - WALL_INSET, leftX: hl, rightX: -hl },
        west: { x: -(hl - WALL_INSET), leftZ: -hw, rightZ: hw },
        east: { x: hl - WALL_INSET, leftZ: hw, rightZ: -hw },
    });
    addElectricalBox("north", -2.8, -(hw - WALL_INSET), ELECTRICAL_IMG);
    {
        const sw = 0.58;
        addLightSwitch("west", -(hl - WALL_INSET), 0.55);
        {
            const z = -(hw - WALL_INSET);
            const x0 = -4.6;
            addLightSwitch("north", x0, z);
            addLightSwitch("north", x0 + sw, z);
        }
        addLightSwitch("south", -1.4, hw - WALL_INSET);
    }
    {
        const cx = 2.5;
        const cz = hw - WALL_INSET;
        const gap = 0.85;
        addFoldingChairs(cx - gap, cz, "south", 1);
        addFoldingChairs(cx, cz, "south", 2);
        addFoldingChairs(cx + gap, cz, "south", 3);
    }
    {
        for (const x of ventPositionsAlongWall(CROSS_SPAN, 3))
            addVent("south", x);
    }
    {
        for (const t of lightPositionsAlong(CROSS_SPAN, 3)) {
            addLightFixture(-hl + t, 0, 0);
        }
    }
    {
        addBoxStack(1.6, -(hw - WALL_INSET), "north", 2);
        addBoxStack(1.6 + 1.3, -(hw - WALL_INSET), "north", 3);
        addBoxStack(1.6 + 1.3 + 1.15, -(hw - WALL_INSET), "north", 2);
        addBoxStack(-3.9, hw - WALL_INSET, "south", 3);
        addBoxStack(-3.9 + 1.4, hw - WALL_INSET, "south", 2);
    }
};

export const bindRoomKeyboard = ({ room, target = document, windowTarget = window, turnSpeed = 90, facingTolerance = 45 } = {}) => {
    const held = new Set();
    const arrowKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp"]);
    const blocked = () => room.app.lightbox?.isOpen() || room.app.videoLightbox?.isOpen()
        || target.activeElement?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])");
    const keydown = event => {
        if (!arrowKeys.has(event.key) || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || blocked())
            return;
        event.preventDefault();
        if (event.key !== "ArrowUp") {
            held.add(event.key);
            return;
        }
        if (event.repeat || room._doorTravelPending)
            return;
        const angle = room.app.orbit.getAngle();
        const forwardX = -Math.sin(angle), forwardZ = -Math.cos(angle);
        const camera = room.app.camera.position;
        let best = null, bestAlignment = Math.cos(facingTolerance * Math.PI / 180);
        for (const spec of Object.values(room.doors)) {
            if (!spec.mesh)
                continue;
            const dx = spec.mesh.position.x - camera.x, dz = spec.mesh.position.z - camera.z;
            const distance = Math.hypot(dx, dz);
            if (!distance)
                continue;
            const alignment = (dx * forwardX + dz * forwardZ) / distance;
            if (alignment > bestAlignment) {
                best = spec.mesh;
                bestAlignment = alignment;
            }
        }
        if (best)
            room._hit(best);
    };
    const keyup = event => held.delete(event.key);
    const clear = () => held.clear();
    target.addEventListener("keydown", keydown);
    target.addEventListener("keyup", keyup);
    windowTarget.addEventListener("blur", clear);
    return {
        update(delta) {
            if (blocked()) {
                clear();
                return false;
            }
            if (!held.size)
                return false;
            const direction = Number(held.has("ArrowLeft")) - Number(held.has("ArrowRight"));
            room.app.orbit.setAngle(room.app.orbit.getAngle() + direction * turnSpeed * Math.PI / 180 * delta);
            return true;
        },
        dispose() {
            clear();
            target.removeEventListener("keydown", keydown);
            target.removeEventListener("keyup", keyup);
            windowTarget.removeEventListener("blur", clear);
        },
    };
};

export const createGalleryLightStartup = ({ lights, schedule = setTimeout, unschedule = clearTimeout } = {}) => {
    const pulses = [[700, true], [25, false], [40, true], [30, false], [45, true], [20, false], [40, true]];
    let timer = null;
    let requestedOn = false;
    let generation = 0;
    return {
        isRequestedOn() { return requestedOn; },
        setOn(on) {
            requestedOn = !!on;
            generation++;
            if (timer !== null)
                unschedule(timer);
            timer = null;
            lights.setOn(false);
            if (!requestedOn)
                return;
            const current = generation;
            const advance = index => {
                const [delay, lit] = pulses[index];
                timer = schedule(() => {
                    if (generation !== current || !requestedOn)
                        return;
                    timer = null;
                    lights.setOn(lit);
                    if (index + 1 < pulses.length)
                        advance(index + 1);
                }, delay);
            };
            advance(0);
        },
    };
};

const SOUND_PREF_KEY = "y9k-sound-on";

const readUnmuted = (soundPrefKey) => {
    try {
        const v = localStorage.getItem(soundPrefKey);
        return v === "1" || v === "true";
    }
    catch {
        return false;
    }
};

export const createCheckAndActivateAudio = ({ ensureMusicAudio, afterActivate = null, soundPrefKey = SOUND_PREF_KEY, }) => {
    return async () => {
        if (!readUnmuted(soundPrefKey))
            return;
        const a = ensureMusicAudio();
        if (a.paused) {
            try {
                await a.play();
            }
            catch (_) {
            }
        }
        if (typeof afterActivate === "function") {
            try {
                await afterActivate();
            }
            catch (_) { }
        }
    };
};

export const runOnFirstPointerDown = (fn) => {
    const handler = () => {
        window.removeEventListener("pointerdown", handler, true);
        fn();
    };
    window.addEventListener("pointerdown", handler, true);
};

const DEV_PREF_KEY = "y9k-dev-mode";

const readDevPref = () => {
    try {
        const v = localStorage.getItem(DEV_PREF_KEY);
        if (v === null)
            return false;
        return v === "1" || v === "true";
    }
    catch {
        return false;
    }
};

const writeDevPref = (on) => {
    try {
        localStorage.setItem(DEV_PREF_KEY, on ? "1" : "0");
    }
    catch (_) { }
};

let IS_DEV_MODE = readDevPref();

export const isDevMode = () => IS_DEV_MODE;

export const initDevMode = ({ stage, onChange } = {}) => {
    const host = stage || document.getElementById("stage");
    if (!host) {
        console.warn("initDevMode: #stage not found");
        return { button: null, isDevMode, setDevMode: () => { } };
    }
    let button = document.getElementById("dev-toggle");
    if (!button) {
        button = document.createElement("button");
        button.id = "dev-toggle";
        button.type = "button";
        button.textContent = "⚙️";
        host.appendChild(button);
    }
    const apply = (on) => {
        IS_DEV_MODE = on;
        document.body.classList.toggle("is-dev-mode", on);
        button.classList.toggle("is-on", on);
        button.title = on ? "exit developer mode" : "enter developer mode";
        button.setAttribute("aria-label", on ? "exit developer mode" : "enter developer mode");
        writeDevPref(on);
        if (typeof onChange === "function")
            onChange();
    };
    const setDevMode = (on) => apply(!!on);
    button.addEventListener("click", (e) => {
        e.stopPropagation();
        setDevMode(!IS_DEV_MODE);
    });
    apply(IS_DEV_MODE);
    return { button, isDevMode, setDevMode };
};

export const setupLightbox = ({ root = document.getElementById("lightbox"), sfxPath = roomAsset("music/page-3.mp3"), sfxVolume = 0.5, } = {}) => {
    if (!root)
        throw new Error("setupLightbox: #lightbox not found");
    let IS_SOUND_ON = false;
    const img = root.querySelector("img");
    const caption = root.querySelector("#lightbox-caption");
    const stage = root.querySelector(".lightbox-stage");
    if (!img || !caption || !stage) {
        throw new Error("setupLightbox: expected img, #lightbox-caption, .lightbox-stage");
    }
    const sfxGain = Math.max(0, Math.min(1, sfxVolume));
    let audioCtx = null;
    let sfxBuffer = null;
    const ensureAudioCtx = () => {
        if (!audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx)
                return null;
            audioCtx = new Ctx();
        }
        if (audioCtx.state === "suspended") {
            audioCtx.resume().catch(() => { });
        }
        return audioCtx;
    };
    (async () => {
        try {
            const res = await fetch(sfxPath);
            const data = await res.arrayBuffer();
            const ctx = ensureAudioCtx();
            if (!ctx)
                return;
            sfxBuffer = await ctx.decodeAudioData(data.slice(0));
        }
        catch (_) { }
    })();
    const playOpenSfx = () => {
        const ctx = ensureAudioCtx();
        if (!ctx || !sfxBuffer)
            return;
        const start = () => {
            try {
                const src = ctx.createBufferSource();
                const gain = ctx.createGain();
                src.buffer = sfxBuffer;
                gain.gain.value = sfxGain;
                src.connect(gain);
                gain.connect(ctx.destination);
                src.start(0);
            }
            catch (_) { }
        };
        if (ctx.state === "running")
            start();
        else
            ctx.resume().then(start).catch(() => { });
    };
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let fitW = 0;
    let fitH = 0;
    let maxScale = 1;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let panning = false;
    let panLastX = 0;
    let panLastY = 0;
    let didPan = false;
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    const touchDist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const measureFit = () => {
        stage.style.transform = "";
        const r = img.getBoundingClientRect();
        fitW = Math.max(1, r.width);
        fitH = Math.max(1, r.height);
        const nw = img.naturalWidth || fitW;
        maxScale = Math.max(1, nw / fitW);
    };
    const clampPan = () => {
        const vw = root.clientWidth;
        const vh = root.clientHeight;
        const scaledW = fitW * scale;
        const scaledH = fitH * scale;
        const maxX = Math.max(scaledW * 0.45, Math.abs(scaledW - vw) / 2);
        const maxY = Math.max(scaledH * 0.45, Math.abs(scaledH - vh) / 2);
        panX = Math.max(-maxX, Math.min(maxX, panX));
        panY = Math.max(-maxY, Math.min(maxY, panY));
    };
    const apply = () => {
        scale = Math.max(1, Math.min(maxScale, scale));
        if (scale <= 1.001) {
            scale = 1;
            panX = 0;
            panY = 0;
            root.classList.remove("is-zoomed");
            stage.style.transform = "";
            stage.classList.remove("is-panning");
            return;
        }
        clampPan();
        root.classList.add("is-zoomed");
        stage.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
    };
    const onPanMove = e => {
        if (!panning)
            return;
        e.preventDefault();
        const dx = e.clientX - panLastX;
        const dy = e.clientY - panLastY;
        if (Math.hypot(dx, dy) > 2)
            didPan = true;
        panLastX = e.clientX;
        panLastY = e.clientY;
        panX += dx;
        panY += dy;
        apply();
    };
    const onPanEnd = e => {
        if (!panning)
            return;
        panning = false;
        stage.classList.remove("is-panning");
        window.removeEventListener("pointermove", onPanMove);
        window.removeEventListener("pointerup", onPanEnd);
        window.removeEventListener("pointercancel", onPanEnd);
        try {
            stage.releasePointerCapture(e.pointerId);
        }
        catch (_) { }
    };
    const resetZoom = () => {
        scale = 1;
        panX = 0;
        panY = 0;
        pinchStartDist = 0;
        pinchStartScale = 1;
        panning = false;
        didPan = false;
        lastTapTime = 0;
        root.classList.remove("is-zoomed");
        stage.classList.remove("is-panning");
        stage.style.transform = "";
        window.removeEventListener("pointermove", onPanMove);
        window.removeEventListener("pointerup", onPanEnd);
        window.removeEventListener("pointercancel", onPanEnd);
    };
    const toggleExtreme = () => {
        if (!fitW)
            measureFit();
        if (scale > 1.05) {
            scale = 1;
            panX = 0;
            panY = 0;
        }
        else {
            scale = maxScale;
            panX = 0;
            panY = 0;
        }
        apply();
    };
    const startPan = e => {
        if (scale <= 1)
            return;
        if (e.pointerType === "mouse" && e.button !== 0)
            return;
        if (e.target === caption || e.target.closest("#lightbox-caption"))
            return;
        e.preventDefault();
        e.stopPropagation();
        panning = true;
        didPan = false;
        panLastX = e.clientX;
        panLastY = e.clientY;
        stage.classList.add("is-panning");
        window.addEventListener("pointermove", onPanMove, { passive: false });
        window.addEventListener("pointerup", onPanEnd);
        window.addEventListener("pointercancel", onPanEnd);
        try {
            stage.setPointerCapture(e.pointerId);
        }
        catch (_) { }
    };
    const open = (imageFile, isSoundOn = false, displayName = null, opts = {}) => {
        resetZoom();
        IS_SOUND_ON = isSoundOn;
        currentSource = opts.source || null;
        img.onload = () => {
            requestAnimationFrame(() => {
                measureFit();
                scale = 1;
                apply();
            });
        };
        img.src = imageFile;
        caption.href = imageFile.startsWith("blob:") ? "#" : imageFile;
        const label = displayName ||
            (imageFile.startsWith("blob:")
                ? "uploaded image"
                : imageFile.split("/").pop());
        caption.textContent = label;
        root.classList.add("is-open");
        root.setAttribute("aria-hidden", "false");
        syncDeleteButton();
        if (isSoundOn) {
            playOpenSfx();
        }
    };
    const close = (_isSoundOn = false) => {
        if (!isOpen())
            return;
        root.classList.remove("is-open");
        root.setAttribute("aria-hidden", "true");
        img.onload = null;
        img.removeAttribute("src");
        caption.removeAttribute("href");
        caption.textContent = "";
        currentSource = null;
        syncDeleteButton();
        resetZoom();
    };
    const isOpen = () => {
        return root.classList.contains("is-open");
    };
    const remeasure = () => {
        if (!isOpen())
            return;
        const prevScale = scale;
        const prevPanX = panX;
        const prevPanY = panY;
        measureFit();
        scale = prevScale;
        panX = prevPanX;
        panY = prevPanY;
        apply();
    };
    root.addEventListener("click", () => {
        if (didPan) {
            didPan = false;
            return;
        }
        close(IS_SOUND_ON);
    });
    caption.addEventListener("click", e => e.stopPropagation());
    stage.addEventListener("click", e => e.stopPropagation());
    stage.addEventListener("dblclick", e => {
        e.preventDefault();
        e.stopPropagation();
        toggleExtreme();
    });
    root.addEventListener("wheel", e => {
        if (!isOpen())
            return;
        if (!fitW)
            measureFit();
        e.preventDefault();
        e.stopPropagation();
        const factor = Math.exp(-e.deltaY * 0.0025);
        scale *= factor;
        if (scale > 1) {
            panX *= factor;
            panY *= factor;
        }
        apply();
    }, { passive: false });
    stage.addEventListener("pointerdown", startPan);
    img.addEventListener("pointerdown", startPan);
    root.addEventListener("touchstart", e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            if (!fitW)
                measureFit();
            pinchStartDist = touchDist(e.touches[0], e.touches[1]);
            pinchStartScale = scale;
            panning = false;
        }
        else if (e.touches.length === 1 && scale > 1) {
            e.preventDefault();
            panning = true;
            didPan = false;
            panLastX = e.touches[0].clientX;
            panLastY = e.touches[0].clientY;
        }
    }, { passive: false });
    root.addEventListener("touchmove", e => {
        if (e.touches.length === 2 && pinchStartDist > 0) {
            e.preventDefault();
            const next = pinchStartScale * (touchDist(e.touches[0], e.touches[1]) / pinchStartDist);
            const factor = next / Math.max(0.001, scale);
            scale = next;
            if (scale > 1) {
                panX *= factor;
                panY *= factor;
            }
            apply();
        }
        else if (e.touches.length === 1 && panning && scale > 1) {
            e.preventDefault();
            const t = e.touches[0];
            const dx = t.clientX - panLastX;
            const dy = t.clientY - panLastY;
            if (Math.hypot(dx, dy) > 2)
                didPan = true;
            panLastX = t.clientX;
            panLastY = t.clientY;
            panX += dx;
            panY += dy;
            apply();
        }
    }, { passive: false });
    root.addEventListener("touchend", e => {
        if (e.touches.length < 2)
            pinchStartDist = 0;
        if (e.touches.length === 0) {
            const wasPanning = panning && didPan;
            panning = false;
            stage.classList.remove("is-panning");
            if (!wasPanning && !didPan && e.changedTouches.length === 1) {
                const t = e.changedTouches[0];
                const now = performance.now();
                const dt = now - lastTapTime;
                const dist = Math.hypot(t.clientX - lastTapX, t.clientY - lastTapY);
                if (dt < 320 && dist < 28) {
                    e.preventDefault();
                    toggleExtreme();
                    lastTapTime = 0;
                }
                else {
                    lastTapTime = now;
                    lastTapX = t.clientX;
                    lastTapY = t.clientY;
                }
            }
        }
    }, { passive: false });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape")
            close();
    });
    let currentSource = null;
    let userArtDeleteHandler = null;
    let deleteBtn = document.getElementById("lightbox-delete");
    if (!deleteBtn) {
        deleteBtn = document.createElement("button");
        deleteBtn.id = "lightbox-delete";
        deleteBtn.type = "button";
        deleteBtn.textContent = "delete image";
        deleteBtn.hidden = true;
        const frame = root.querySelector(".lightbox-frame") || root;
        frame.appendChild(deleteBtn);
    }
    const syncDeleteButton = () => {
        const canDelete = (isDevMode() || document.getElementById("room-editor")) &&
            !!currentSource?.userData?.isUserArt &&
            typeof userArtDeleteHandler === "function";
        deleteBtn.hidden = !canDelete;
        deleteBtn.disabled = !canDelete;
        root.classList.toggle("has-user-art-delete", canDelete);
    };
    deleteBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (deleteBtn.disabled || !currentSource || !userArtDeleteHandler)
            return;
        const art = currentSource;
        Promise.resolve(userArtDeleteHandler(art))
            .catch((err) => console.warn("lightbox delete failed", err))
            .finally(() => {
            close(IS_SOUND_ON);
        });
    });
    const moDev = new MutationObserver(syncDeleteButton);
    moDev.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    const setUserArtDeleteHandler = (fn) => {
        userArtDeleteHandler = typeof fn === "function" ? fn : null;
        syncDeleteButton();
    };
    return {
        open,
        close,
        isOpen,
        remeasure,
        setUserArtDeleteHandler,
        unlockAudio: ensureAudioCtx,
        getCurrentSource: () => currentSource,
    };
};

export const youtubeIdFromUrl = (url) => {
    if (!url || typeof url !== "string")
        return null;
    try {
        const u = new URL(url.trim());
        const host = u.hostname.replace(/^www\./, "");
        if (host === "youtu.be") {
            const id = u.pathname.split("/").filter(Boolean)[0];
            return id || null;
        }
        if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
            if (u.pathname === "/watch")
                return u.searchParams.get("v");
            const parts = u.pathname.split("/").filter(Boolean);
            if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") {
                return parts[1] || null;
            }
        }
    }
    catch (_) {
    }
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
};

export const setupVideoLightbox = ({ stage = document.getElementById("stage"), root = document.getElementById("video-lightbox"), } = {}) => {
    let el = root;
    if (!el) {
        const host = stage || document.body;
        el = document.createElement("div");
        el.id = "video-lightbox";
        el.setAttribute("aria-hidden", "true");
        el.innerHTML = `
            <div class="video-lightbox-frame">
                <div class="video-lightbox-stage">
                    <iframe
                        title="YouTube video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen
                        referrerpolicy="strict-origin-when-cross-origin"
                    ></iframe>
                </div>
                <a id="video-lightbox-caption" href="#" target="_blank" rel="noopener noreferrer"></a>
            </div>
        `;
        host.appendChild(el);
    }
    const iframe = el.querySelector("iframe");
    const caption = el.querySelector("#video-lightbox-caption") ||
        el.querySelector(".video-lightbox-caption");
    if (!iframe)
        throw new Error("setupVideoLightbox: expected iframe");
    let captionEl = caption;
    if (!captionEl) {
        captionEl = document.createElement("a");
        captionEl.id = "video-lightbox-caption";
        captionEl.target = "_blank";
        captionEl.rel = "noopener noreferrer";
        const frame = el.querySelector(".video-lightbox-frame");
        if (frame)
            frame.appendChild(captionEl);
    }
    const isOpen = () => el.classList.contains("is-open");
    const close = () => {
        if (!isOpen())
            return;
        el.classList.remove("is-open");
        el.setAttribute("aria-hidden", "true");
        iframe.removeAttribute("src");
        captionEl.removeAttribute("href");
        captionEl.textContent = "";
    };
    const open = (videoUrl, { autoplay = true } = {}) => {
        const id = youtubeIdFromUrl(videoUrl) ||
            (/^[A-Za-z0-9_-]{6,}$/.test(videoUrl) ? videoUrl : null);
        if (!id) {
            console.warn("setupVideoLightbox.open: could not parse YouTube id from", videoUrl);
            return;
        }
        const params = new URLSearchParams({
            rel: "0",
            modestbranding: "1",
        });
        if (autoplay)
            params.set("autoplay", "1");
        iframe.src = `https://www.youtube.com/embed/${id}?${params.toString()}`;
        const watchUrl = typeof videoUrl === "string" && /youtu/.test(videoUrl)
            ? videoUrl
            : `https://www.youtube.com/watch?v=${id}`;
        captionEl.href = watchUrl;
        captionEl.textContent = watchUrl;
        el.classList.add("is-open");
        el.setAttribute("aria-hidden", "false");
    };
    el.addEventListener("click", (e) => {
        if (e.target === el)
            close();
    });
    const frame = el.querySelector(".video-lightbox-frame");
    if (frame) {
        frame.addEventListener("click", (e) => {
            if (e.target === frame)
                close();
        });
    }
    captionEl.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isOpen())
            close();
    });
    return { open, close, isOpen, root: el };
};

const BASE_HEIGHT = 0.28;

const CROWN_HEIGHT = 0.09;

const DEPTH = 0.02;

const MOLDING_COLOR = 0xcbcbcb;

export const addHallMolding = (scene, outline, roomHeight, color = MOLDING_COLOR, floorY = -roomHeight / 2) => {
    const ceilingY = floorY + roomHeight;
    const mat = new THREE.MeshStandardMaterial({ color });
    for (let i = 0; i < outline.length; i++) {
        const [x1, z1] = outline[i];
        const [x2, z2] = outline[(i + 1) % outline.length];
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6)
            continue;
        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;
        const runLen = len + DEPTH * 2;
        const edgeDir = new THREE.Vector3(dx, 0, dz).normalize();
        const normal = new THREE.Vector3().crossVectors(edgeDir, new THREE.Vector3(0, 1, 0));
        const toCenter = new THREE.Vector3(-cx, 0, -cz);
        if (normal.dot(toCenter) < 0)
            normal.negate();
        const rotY = Math.atan2(normal.x, normal.z);
        const ox = normal.x * (DEPTH / 2);
        const oz = normal.z * (DEPTH / 2);
        const base = new THREE.Mesh(new THREE.BoxGeometry(runLen, BASE_HEIGHT, DEPTH), mat);
        base.position.set(cx + ox, floorY + BASE_HEIGHT / 2, cz + oz);
        base.rotation.y = rotY;
        scene.add(base);
        const crown = new THREE.Mesh(new THREE.BoxGeometry(runLen, CROWN_HEIGHT, DEPTH), mat);
        crown.position.set(cx + ox, ceilingY - CROWN_HEIGHT / 2, cz + oz);
        crown.rotation.y = rotY;
        scene.add(crown);
    }
};

const DRAG_THRESHOLD = 4;

const BOX_FACE_NAMES = ["east", "west", "ceiling", "floor", "south", "north"];

// Enable this again when wall-position crosshairs are useful during development.
const SHOW_WALL_CROSSHAIRS = false;

const CROSS_SIZE = 0.22;

const CROSS_OFFSET = 0.03;

const fmt = (n) => {
    const v = Math.round(n * 1000) / 1000;
    return Object.is(v, -0) ? 0 : v;
};

const wallNameFromNormal = (nx, nz) => {
    if (Math.abs(nz) >= Math.abs(nx))
        return nz < 0 ? "north" : "south";
    return nx < 0 ? "west" : "east";
};

const resolveScene = (scene, object) => {
    if (scene)
        return scene;
    let o = object;
    while (o && o.parent)
        o = o.parent;
    return o || null;
};

export const createWallClickHelper = ({ canvas, camera, stage, scene } = {}) => {
    const host = stage || document.getElementById("stage");
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
    let crosshair = null;
    let hasCrosshairPlacement = false;
    let lastHitInfo = null;
    let wallPickHandler = null;
    let tracking = false;
    let didDrag = false;
    let lastX = 0;
    let totalDrag = 0;
    const ensureCrosshair = (targetScene) => {
        if (crosshair)
            return crosshair;
        if (!targetScene)
            return null;
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
    let addingImageCrosshair = false;
    const syncCrosshairVisibility = () => {
        if (!crosshair)
            return;
        crosshair.visible = hasCrosshairPlacement && (addingImageCrosshair || (SHOW_WALL_CROSSHAIRS && isDevMode()));
    };
    const placeCrosshair = (hit) => {
        const targetScene = resolveScene(scene, hit.object);
        const marker = ensureCrosshair(targetScene);
        if (!marker || !hit.face)
            return;
        normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
        toCam.subVectors(camera.position, hit.point);
        if (normal.dot(toCam) < 0)
            normal.negate();
        marker.position.copy(hit.point).addScaledVector(normal, CROSS_OFFSET);
        marker.quaternion.setFromUnitVectors(zAxis, normal);
        hasCrosshairPlacement = true;
        syncCrosshairVisibility();
    };
    const register = (mesh, meta = {}) => {
        if (!mesh)
            return mesh;
        mesh.userData.isWall = true;
        if (typeof meta.wall === "string")
            mesh.userData.wall = meta.wall;
        if (meta.edge)
            mesh.userData.edge = meta.edge;
        if (!walls.includes(mesh))
            walls.push(mesh);
        return mesh;
    };
    const registerRoomBox = (mesh) => {
        if (!mesh)
            return mesh;
        mesh.userData.isRoomBox = true;
        if (!walls.includes(mesh))
            walls.push(mesh);
        return mesh;
    };
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
        if (len < 1e-6)
            return null;
        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;
        const edgeDir = new THREE.Vector3(dx, 0, dz).normalize();
        const n = new THREE.Vector3().crossVectors(edgeDir, new THREE.Vector3(0, 1, 0));
        const toCenter = new THREE.Vector3(-cx, 0, -cz);
        if (n.dot(toCenter) < 0)
            n.negate();
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, height), material);
        mesh.position.set(cx, y, cz);
        mesh.rotation.y = Math.atan2(n.x, n.z);
        register(mesh, {
            wall,
            edge: { x1, z1, x2, z2 },
        });
        if (wall == null) {
            normal.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), mesh.rotation.y);
            mesh.userData.wall = wallNameFromNormal(-normal.x, -normal.z);
        }
        scene.add(mesh);
        return mesh;
    };
    const addWallsFromOutline = (outline, opts = {}) => {
        const built = [];
        if (!outline || outline.length < 2)
            return built;
        for (let i = 0; i < outline.length; i++) {
            const [x1, z1] = outline[i];
            const [x2, z2] = outline[(i + 1) % outline.length];
            const mesh = addWallSegment(x1, z1, x2, z2, opts);
            if (mesh)
                built.push(mesh);
        }
        return built;
    };
    const describeHit = (hit) => {
        const obj = hit.object;
        const world = hit.point;
        if (obj.userData.isRoomBox) {
            const face = Math.floor(hit.faceIndex / 2);
            const name = BOX_FACE_NAMES[face] || `face-${face}`;
            if (name === "ceiling" || name === "floor")
                return null;
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
        return (`${info.wall}` +
            `  world=(${fmt(w.x)}, ${fmt(w.y)}, ${fmt(w.z)})` +
            `  local=(${fmt(l.x)}, ${fmt(l.y)})` +
            uv);
    };
    const reportClick = (clientX, clientY) => {
        if (!camera || !walls.length)
            return;
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(walls, false);
        if (!hits.length)
            return;
        const hit = hits[0];
        const info = describeHit(hit);
        if (!info)
            return;
        const line = formatInfo(info);
        console.log(`[wall-click] ${line}`);
        lastHitInfo = info;
        if (hud) {
            hud.textContent = line;
            hud.dataset.hasCoords = "1";
        }
        if (SHOW_WALL_CROSSHAIRS && isDevMode() && !addingImageCrosshair)
            placeCrosshair(hit);
        if (typeof wallPickHandler === "function")
            wallPickHandler(info);
    };
    ;
    if (canvas) {
        canvas.addEventListener("pointerdown", (e) => {
            if (e.button !== 0)
                return;
            tracking = true;
            didDrag = false;
            lastX = e.clientX;
            totalDrag = 0;
        });
        canvas.addEventListener("pointermove", (e) => {
            if (!tracking)
                return;
            totalDrag += Math.abs(e.clientX - lastX);
            if (totalDrag > DRAG_THRESHOLD)
                didDrag = true;
            lastX = e.clientX;
        });
        const endPointer = (e) => {
            if (!tracking)
                return;
            tracking = false;
            if (didDrag || e.type === "pointercancel")
                return;
            reportClick(e.clientX, e.clientY);
        };
        canvas.addEventListener("pointerup", endPointer);
        canvas.addEventListener("pointercancel", endPointer);
    }
    if (hud && !isDevMode()) {
        hud.textContent = "click a wall for coordinates";
    }
    const mo = new MutationObserver(syncCrosshairVisibility);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return {
        walls,
        register,
        registerRoomBox,
        addWallSegment,
        addWallsFromOutline,
        reportClick,
        // Show a fixed placement marker only while the new-image panel is open.
        showCrosshair: hit => {
            addingImageCrosshair = true;
            placeCrosshair(hit);
        },
        updateCrosshair: (pose, width) => {
            const marker = ensureCrosshair(scene);
            if (!marker) return;
            addingImageCrosshair = true;
            marker.position.copy(pose.position);
            marker.quaternion.copy(pose.quaternion);
            marker.translateZ(CROSS_OFFSET);
            marker.scale.set(width / (CROSS_SIZE * 2), 1, 1);
            marker.material.depthTest = false;
            hasCrosshairPlacement = true;
            syncCrosshairVisibility();
        },
        hideCrosshair: () => {
            addingImageCrosshair = false;
            hasCrosshairPlacement = false;
            syncCrosshairVisibility();
        },
        getLastHit: () => lastHitInfo,
        onWallPick: (fn) => {
            wallPickHandler = typeof fn === "function" ? fn : null;
        },
    };
};

const DEFAULT_HEIGHT_FROM_FLOOR = 1.1;

const DEFAULT_BOX_HEIGHT = 0.95;

const DEFAULT_BOX_COLOR = 0xb4b4b4;

const BOX_DEPTH = 0.14;

const CONDUIT_RADIUS = 0.032;

export const createAddElectricalBox = ({ scene, textureLoader, roomHalfY }) => {
    return (direction, x, y, imageFile, heightFromFloor = DEFAULT_HEIGHT_FROM_FLOOR, boxWidth, boxHeight = DEFAULT_BOX_HEIGHT, boxColor = DEFAULT_BOX_COLOR) => {
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
            const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [metalMat, metalMat, metalMat, metalMat, faceMat, metalMat]);
            const boxY = -roomHalfY + heightFromFloor + h / 2;
            let bx = x;
            let bz = y;
            let fx = 0;
            let fz = 0;
            if (direction === "north") {
                box.rotation.y = 0;
                bz = y + d / 2;
                fz = 1;
            }
            else if (direction === "south") {
                box.rotation.y = Math.PI;
                bz = y - d / 2;
                fz = -1;
            }
            else if (direction === "west") {
                box.rotation.y = Math.PI / 2;
                bx = x + d / 2;
                fx = 1;
            }
            else if (direction === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = x - d / 2;
                fx = -1;
            }
            else {
                console.warn("Invalid electrical box direction:", direction);
                return;
            }
            box.position.set(bx, boxY, bz);
            scene.add(box);
            const conduitMat = new THREE.MeshStandardMaterial({ color: boxColor });
            const topOfBox = boxY + h / 2;
            const conduitLen = roomHalfY - topOfBox;
            if (conduitLen <= 0)
                return;
            const conduitY = topOfBox + conduitLen / 2;
            const cx = bx - fx * d * 0.15;
            const cz = bz - fz * d * 0.15;
            const along = w * 0.22;
            for (const sign of [-1, 1]) {
                const tube = new THREE.Mesh(new THREE.CylinderGeometry(CONDUIT_RADIUS, CONDUIT_RADIUS, conduitLen, 12), conduitMat);
                if (direction === "north" || direction === "south") {
                    tube.position.set(cx + sign * along, conduitY, cz);
                }
                else {
                    tube.position.set(cx, conduitY, cz + sign * along);
                }
                scene.add(tube);
            }
        });
    };
};

const EXIT_DEFAULT_IMAGE = roomAsset("images/static_images/exit-1.jpg");

const EXIT_DEFAULT_BOX_HEIGHT = 0.22;

const EXIT_DEFAULT_BOX_COLOR = 0x3a3a3a;

const EXIT_DEFAULT_CEILING_GAP = 0.14;

const EXIT_BOX_DEPTH = 0.05;

export const createAddExitSign = ({ scene, textureLoader, roomHalfY }) => {
    const place = (direction, x, y, imageFile, boxWidth, boxHeight, boxColor, ceilingGap, beside = null, onCreate = null) => {
        textureLoader.load(imageFile, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const aspect = tex.image.width / tex.image.height;
            const h = boxHeight;
            const w = boxWidth ?? h * aspect;
            const d = EXIT_BOX_DEPTH;
            const metalMat = new THREE.MeshStandardMaterial({ color: boxColor });
            const faceMat = new THREE.MeshStandardMaterial({
                map: tex,
                emissive: 0xffffff,
                emissiveMap: tex,
                emissiveIntensity: imageFile === EXIT_DEFAULT_IMAGE ? 0.12 : 0.35,
                color: imageFile === EXIT_DEFAULT_IMAGE ? 0x999999 : 0xffffff,
                toneMapped: false,
            });
            const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [metalMat, metalMat, metalMat, metalMat, faceMat, metalMat]);
            const boxY = beside?.centerY ?? roomHalfY - ceilingGap - h / 2;
            // "Right" is measured while facing the door, including south and west walls.
            const offset = beside ? (beside.doorWidth / 2 + 0.12 + w / 2) * wallRightSign(direction) : 0;
            if (direction === "north" || direction === "south") x += offset;
            else y += offset;
            let bx = x;
            let bz = y;
            if (direction === "north") {
                box.rotation.y = 0;
                bz = y + d / 2;
            }
            else if (direction === "south") {
                box.rotation.y = Math.PI;
                bz = y - d / 2;
            }
            else if (direction === "west") {
                box.rotation.y = Math.PI / 2;
                bx = x + d / 2;
            }
            else if (direction === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = x - d / 2;
            }
            else {
                console.warn("Invalid exit sign direction:", direction);
                return;
            }
            box.position.set(bx, boxY, bz);
            scene.add(box);
            (onCreate ?? beside?.onCreate)?.(box);
        });
    };
    return (doorOrDirection, b, c, d, e, f, g, h) => {
        if (doorOrDirection && (doorOrDirection.isMesh || doorOrDirection.userData?.isDoor)) {
            const door = doorOrDirection;
            const direction = door.userData.wall;
            if (!direction) {
                console.warn("addExitSign: door is missing userData.wall");
                return;
            }
            if (b && typeof b === "object") {
                const height = door.geometry.parameters.height;
                const centerY = door.position.y - height / 2 + height * (b.heightRatio ?? 2 / 3);
                place(direction, door.position.x, door.position.z, b.file ?? EXIT_DEFAULT_IMAGE,
                    b.width, b.height ?? EXIT_DEFAULT_BOX_HEIGHT, b.color ?? EXIT_DEFAULT_BOX_COLOR,
                    EXIT_DEFAULT_CEILING_GAP, b.right ? { centerY, doorWidth: door.geometry.parameters.width, onCreate: b.onCreate } : null, b.onCreate);
                return;
            }
            place(direction, door.position.x, door.position.z, b ?? EXIT_DEFAULT_IMAGE, c, d ?? EXIT_DEFAULT_BOX_HEIGHT, e ?? EXIT_DEFAULT_BOX_COLOR, f ?? EXIT_DEFAULT_CEILING_GAP);
            return;
        }
        place(doorOrDirection, b, c, d ?? EXIT_DEFAULT_IMAGE, e, f ?? EXIT_DEFAULT_BOX_HEIGHT, g ?? EXIT_DEFAULT_BOX_COLOR, h ?? EXIT_DEFAULT_CEILING_GAP);
    };
};

const CHAIR_IMAGE = roomAsset("images/static_images/chair.png");

const CHAIR_H = 0.9 * 2.5 * 0.9;

const LEAN = 0.2;

const STACK_GAP = 0.08;

const WALL_CLEARANCE = 0.04;

export const createAddFoldingChairs = ({ scene, textureLoader, roomHalfY }) => {
    return (x, y, direction, numberOfChairs, { height = CHAIR_H, width = null, lean = LEAN, gap = STACK_GAP, clearance = WALL_CLEARANCE, file = CHAIR_IMAGE } = {}) => {
        const n = Math.max(1, Math.floor(Number(numberOfChairs) || 1));
        let rotY = 0;
        let fx = 0;
        let fz = 0;
        if (direction === "north") {
            rotY = 0;
            fz = 1;
        }
        else if (direction === "south") {
            rotY = Math.PI;
            fz = -1;
        }
        else if (direction === "west") {
            rotY = Math.PI / 2;
            fx = 1;
        }
        else if (direction === "east") {
            rotY = -Math.PI / 2;
            fx = -1;
        }
        else {
            console.warn("Invalid folding chair direction:", direction);
            return;
        }
        const baseOut = (height / 2) * Math.sin(lean) + clearance;
        textureLoader.load(file, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const aspect = tex.image.width / tex.image.height;
            const w = width ?? height * aspect;
            const h = height;
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
                chair.rotation.x = -lean;
                const out = baseOut + i * gap;
                chair.position.set(x + fx * out, -roomHalfY + h / 2 * Math.cos(lean), y + fz * out);
                scene.add(chair);
            }
        });
    };
};

const FACE_IMAGE = roomAsset("images/static_images/box-face.jpg");

const SIDE_IMAGE = roomAsset("images/static_images/box-side.jpg");

export const BOX_W = 0.72;

export const BOX_D = 0.92;

export const BOX_H = 0.56;

const TOP_COLOR = 0xdedede;

const FACE_TINT = 0xc4c4c4;

const WALL_FLUSH_PULL = 0.05;

const YAW = Math.PI / 2;

const WOBBLE_MIN = 0.042;

const WOBBLE_MAX = 0.09;

const prepTex = tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
};

const seed01 = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
};

const seed01n = (x, y, n) => seed01(x + n * 19.17, y - n * 7.31);

export const createAddBoxStack = ({ scene, textureLoader, roomHalfY }) => {
    return (x, y, direction, stackHeight, { width = BOX_W, height = BOX_H, depth = BOX_D, wobble = true, face = FACE_IMAGE, side = SIDE_IMAGE } = {}) => {
        const n = Math.max(1, Math.floor(Number(stackHeight) || 1));
        let rotY = 0;
        let fx = 0;
        let fz = 0;
        if (direction === "north") {
            rotY = 0;
            fz = 1;
        }
        else if (direction === "south") {
            rotY = Math.PI;
            fz = -1;
        }
        else if (direction === "west") {
            rotY = Math.PI / 2;
            fx = 1;
        }
        else if (direction === "east") {
            rotY = -Math.PI / 2;
            fx = -1;
        }
        else {
            console.warn("Invalid box stack direction:", direction);
            return;
        }
        rotY += YAW;
        const stackSeed = seed01(x, y);
        const startSign = stackSeed < 0.5 ? 1 : -1;
        const baseAmp = WOBBLE_MIN + stackSeed * (WOBBLE_MAX - WOBBLE_MIN);
        let faceTex = null;
        let sideTex = null;
        let left = 2;
        const build = () => {
            const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, color: FACE_TINT });
            const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, color: FACE_TINT });
            const topMat = new THREE.MeshStandardMaterial({ color: TOP_COLOR });
            const materials = [sideMat, sideMat, topMat, topMat, faceMat, faceMat];
            const out = width / 2 - WALL_FLUSH_PULL;
            const bx = x + fx * out;
            const bz = y + fz * out;
            for (let i = 0; i < n; i++) {
                const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials);
                const level = seed01n(x, y, i);
                const amp = baseAmp * (0.75 + level * 0.5);
                const yawOffset = startSign * (i % 2 === 0 ? 1 : -1) * amp;
                box.rotation.y = rotY + (wobble ? yawOffset : 0);
                box.position.set(bx, -roomHalfY + height / 2 + i * height, bz);
                scene.add(box);
            }
        };
        textureLoader.load(face, tex => {
            faceTex = prepTex(tex);
            if (--left === 0)
                build();
        });
        textureLoader.load(side, tex => {
            sideTex = prepTex(tex);
            if (--left === 0)
                build();
        });
    };
};

const SWITCH_IMAGE = roomAsset("images/static_images/switches.jpg");
const SWITCH_HEIGHT = 0.24;
const SWITCH_DEPTH = 0.04;
const PLATE_COLOR = 0xf4f4f4;
const SWITCH_FACE_TINT = 0xffffff;
const SWITCH_WALL_FLUSH_PULL = 0.05;

export const createAddLightSwitch = ({ scene, textureLoader, roomHalfY, doorHeight = 3.2, clickable = null, }) => {
    const defaultCenterFromFloor = doorHeight / 2;
    return (direction, x, y, heightFromFloor = defaultCenterFromFloor, { scale = 1, switches = 2, isDisabled = true } = {}) => {
        textureLoader.load(SWITCH_IMAGE, (tex) => {
            const count = Math.max(1, Math.round(Number(switches) || 2));
            const units = count / 2;
            const map = tex.clone();
            map.needsUpdate = true;
            map.colorSpace = THREE.SRGBColorSpace;
            map.magFilter = THREE.NearestFilter;
            map.minFilter = THREE.NearestFilter;
            map.wrapS = THREE.RepeatWrapping;
            map.wrapT = THREE.ClampToEdgeWrapping;
            map.repeat.set(units, 1);
            map.offset.set(0, 0);
            const aspect = tex.image.width / tex.image.height;
            const h = SWITCH_HEIGHT * scale;
            const w = h * aspect * units;
            const d = SWITCH_DEPTH;
            const plateMat = new THREE.MeshStandardMaterial({
                color: PLATE_COLOR,
            });
            const faceMat = new THREE.MeshStandardMaterial({
                map,
                color: SWITCH_FACE_TINT,
            });
            const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [plateMat, plateMat, plateMat, plateMat, faceMat, plateMat]);
            const boxY = -roomHalfY + heightFromFloor;
            const out = d / 2 - SWITCH_WALL_FLUSH_PULL;
            let bx = x;
            let bz = y;
            if (direction === "north") {
                box.rotation.y = 0;
                bz = y + out;
            }
            else if (direction === "south") {
                box.rotation.y = Math.PI;
                bz = y - out;
            }
            else if (direction === "west") {
                box.rotation.y = Math.PI / 2;
                bx = x + out;
            }
            else if (direction === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = x - out;
            }
            else {
                console.warn("Invalid light switch direction:", direction);
                return;
            }
            box.position.set(bx, boxY, bz);
            box.userData.isLightSwitch = true;
            box.userData.switches = count;
            box.userData.isDisabled = !!isDisabled;
            if (clickable)
                clickable.push(box);
            scene.add(box);
        });
    };
};

const FIXTURE_ON_RGB = [14, 13.2, 11.5];

const FIXTURE_OFF_COLOR = 0x585858;

export const createRoomLights = ({ ambient, directional, scene = null, isOn = true, offIntensity = { ambient: 0.05, directional: 0.04 }, offBackground = 0x111111, onChange = null, } = {}) => {
    const onIntensity = {
        ambient: ambient ? ambient.intensity : 1,
        directional: directional ? directional.intensity : 1,
    };
    const off = {
        ambient: offIntensity.ambient ?? 0.05,
        directional: offIntensity.directional ?? 0.04,
    };
    const onBackground = scene && scene.background && scene.background.isColor
        ? scene.background.getHex()
        : null;
    let on = !!isOn;
    const fixtures = [];
    const unlit = [];
    const applyFixtureFace = (face, lit) => {
        if (!face || !face.color)
            return;
        if (lit)
            face.color.setRGB(...FIXTURE_ON_RGB);
        else
            face.color.set(FIXTURE_OFF_COLOR);
    };
    const apply = () => {
        const levels = on ? onIntensity : off;
        if (ambient)
            ambient.intensity = levels.ambient;
        if (directional)
            directional.intensity = levels.directional;
        for (const { face } of fixtures)
            applyFixtureFace(face, on);
        for (const entry of unlit) {
            entry.material.color.setHex(on ? entry.onColor : entry.offColor);
        }
        if (scene && onBackground != null) {
            scene.background.setHex(on ? onBackground : offBackground);
        }
    };
    apply();
    return {
        isOn: () => on,
        setOn(next) {
            on = !!next;
            apply();
            if (typeof onChange === "function")
                onChange(on);
        },
        toggle() {
            on = !on;
            apply();
            if (typeof onChange === "function")
                onChange(on);
            return on;
        },
        registerFixture(faceMat) {
            if (!faceMat)
                return;
            fixtures.push({ face: faceMat });
            applyFixtureFace(faceMat, on);
        },
        registerUnlit(material, offColor = 0x111111) {
            if (!material || !material.color)
                return;
            unlit.push({
                material,
                onColor: material.color.getHex(),
                offColor,
            });
            material.color.setHex(on ? material.color.getHex() : offColor);
        },
    };
};

const LIGHT_IMAGE = roomAsset("images/static_images/lights-1.jpg");

export const LIGHT_LENGTH = 1.35;

export const LIGHT_WIDTH = 0.28;

const LIGHT_DEPTH = 0.06;

const HOUSING_COLOR = 0xb0b0b0;

const DROP_FROM_CEILING = 0.02;

export const createAddLightFixture = ({ scene, textureLoader, roomHalfY, ceilingY = roomHalfY, roomLights = null, }) => {
    return (x, z, rotationY = 0, { isOn = false, scale = 1, length, width } = {}) => {
        textureLoader.load(LIGHT_IMAGE, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const len = (length ?? LIGHT_LENGTH) * scale;
            const wid = (width ?? LIGHT_WIDTH) * scale;
            const depth = LIGHT_DEPTH;
            const housing = new THREE.MeshStandardMaterial({
                color: HOUSING_COLOR,
            });
            const face = new THREE.MeshBasicMaterial({
                map: tex,
                toneMapped: false,
            });
            const lit = roomLights ? roomLights.isOn() : isOn;
            if (lit)
                face.color.setRGB(...FIXTURE_ON_RGB);
            else
                face.color.set(FIXTURE_OFF_COLOR);
            const box = new THREE.Mesh(new THREE.BoxGeometry(len, depth, wid), [housing, housing, housing, face, housing, housing]);
            box.rotation.y = rotationY;
            box.position.set(x, ceilingY - DROP_FROM_CEILING - depth / 2, z);
            box.userData.isLightFixture = true;
            box.userData.isOn = lit;
            if (roomLights)
                roomLights.registerFixture(face);
            scene.add(box);
        });
    };
};

export const lightPositionsAlong = (length, count) => {
    const n = Math.max(0, Math.floor(count));
    if (n === 0)
        return [];
    if (n === 1)
        return [length / 2];
    const gap = (length - n * LIGHT_LENGTH) / (n + 1);
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(gap + LIGHT_LENGTH / 2 + i * (LIGHT_LENGTH + gap));
    }
    return out;
};

const VENT_IMAGE = roomAsset("images/static_images/vent.jpg");
const VENT_HEIGHT = 0.3;
export const VENT_WIDTH = 0.95 * (2 / 3);
const VENT_DEPTH = 0.04;
const VENT_COLOR = 0x6a6a6a;
const DEFAULT_Y_FROM_CEILING = 0.12;
const VENT_WALL_FLUSH_PULL = 0.05;

export const createAddVent = ({ scene, textureLoader, roomHalfY, walls }) => {
    return (wall, xFromLeft, yFromCeilingOrOpts = DEFAULT_Y_FROM_CEILING) => {
        const spec = walls[wall];
        if (!spec) {
            console.warn("Invalid vent wall:", wall);
            return;
        }
        const opts = typeof yFromCeilingOrOpts === "object" && yFromCeilingOrOpts != null
            ? yFromCeilingOrOpts
            : { yFromCeiling: yFromCeilingOrOpts };
        const yFromCeiling = opts.yFromCeiling ?? DEFAULT_Y_FROM_CEILING;
        const w = opts.width ?? VENT_WIDTH;
        const h = opts.height ?? VENT_HEIGHT;
        const d = VENT_DEPTH;
        textureLoader.load(VENT_IMAGE, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const metalMat = new THREE.MeshStandardMaterial({
                color: VENT_COLOR,
            });
            const faceMat = new THREE.MeshStandardMaterial({ map: tex });
            const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [metalMat, metalMat, metalMat, metalMat, faceMat, metalMat]);
            const boxY = roomHalfY - yFromCeiling - h / 2;
            const out = d / 2 - VENT_WALL_FLUSH_PULL;
            let bx = 0;
            let bz = 0;
            if (wall === "north") {
                box.rotation.y = 0;
                bx = spec.leftX + xFromLeft;
                bz = spec.z + out;
            }
            else if (wall === "south") {
                box.rotation.y = Math.PI;
                bx = spec.leftX - xFromLeft;
                bz = spec.z - out;
            }
            else if (wall === "west") {
                box.rotation.y = Math.PI / 2;
                bx = spec.x + out;
                bz = spec.leftZ + xFromLeft;
            }
            else if (wall === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = spec.x - out;
                bz = spec.leftZ - xFromLeft;
            }
            box.position.set(bx, boxY, bz);
            scene.add(box);
        });
    };
};

export const ventPositionsAlongWall = (wallLength, count) => {
    const n = Math.max(0, Math.floor(count));
    if (n === 0)
        return [];
    if (n === 1)
        return [wallLength / 2];
    const gap = (wallLength - n * VENT_WIDTH) / (n + 1);
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(gap + VENT_WIDTH / 2 + i * (VENT_WIDTH + gap));
    }
    return out;
};

const DIR_DELTA = {
    north: [0, -1],
    south: [0, 1],
    east: [1, 0],
    west: [-1, 0],
};

export const outlineFromBox = (width, depth) => {
    const hx = width / 2;
    const hz = depth / 2;
    return [
        [-hx, -hz],
        [hx, -hz],
        [hx, hz],
        [-hx, hz],
    ];
};

export const outlineFromPath = (segments, start = [0, 0]) => {
    if (!segments || !segments.length) {
        console.warn("outlineFromPath: no segments");
        return [];
    }
    const pts = [[start[0], start[1]]];
    let x = start[0];
    let z = start[1];
    for (const seg of segments) {
        const d = DIR_DELTA[seg.dir];
        if (!d) {
            console.warn("outlineFromPath: invalid dir", seg.dir);
            continue;
        }
        const len = Number(seg.length) || 0;
        x += d[0] * len;
        z += d[1] * len;
        pts.push([x, z]);
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (pts.length > 1 &&
        Math.hypot(last[0] - first[0], last[1] - first[1]) < 1e-6) {
        pts.pop();
    }
    return pts;
};

export const outlineBounds = (outline) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of outline) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    return {
        minX,
        maxX,
        minZ,
        maxZ,
        halfX: (maxX - minX) / 2,
        halfZ: (maxZ - minZ) / 2,
        width: maxX - minX,
        depth: maxZ - minZ,
        centerX: (minX + maxX) / 2,
        centerZ: (minZ + maxZ) / 2,
    };
};

export const wallsFromOutline = (outline, wallInset = 0.05) => {
    const b = outlineBounds(outline);
    return {
        north: {
            z: b.minZ + wallInset,
            leftX: b.minX,
            rightX: b.maxX,
        },
        south: {
            z: b.maxZ - wallInset,
            leftX: b.maxX,
            rightX: b.minX,
        },
        west: {
            x: b.minX + wallInset,
            leftZ: b.minZ,
            rightZ: b.maxZ,
        },
        east: {
            x: b.maxX - wallInset,
            leftZ: b.maxZ,
            rightZ: b.minZ,
        },
    };
};

export const addVerticalCornerLinesFromOutline = (scene, corners, height, color = 0x111111, floorY = -height / 2) => {
    const ceilingY = floorY + height;
    const inset = 0.02;
    const positions = [];
    for (const [x, z] of corners) {
        const nx = x === 0 ? 0 : -Math.sign(x) * inset;
        const nz = z === 0 ? 0 : -Math.sign(z) * inset;
        positions.push(x + nx, floorY, z + nz, x + nx, ceilingY, z + nz);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
    scene.add(lines);
    return lines;
};

export const addHorizontalEdgeLinesFromOutline = (scene, outline, height, color = 0x111111, floorY = -height / 2) => {
    if (!outline || outline.length < 2)
        return null;
    const ceilingY = floorY + height;
    const intoRoom = 0.055;
    const yBottom = floorY + 0.003;
    const yTop = ceilingY - 0.003;
    const positions = [];
    const insetPt = ([x, z]) => {
        const nx = x === 0 ? 0 : -Math.sign(x) * intoRoom;
        const nz = z === 0 ? 0 : -Math.sign(z) * intoRoom;
        return [x + nx, z + nz];
    };
    for (let i = 0; i < outline.length; i++) {
        const [x1, z1] = insetPt(outline[i]);
        const [x2, z2] = insetPt(outline[(i + 1) % outline.length]);
        positions.push(x1, yBottom, z1, x2, yBottom, z2);
        positions.push(x1, yTop, z1, x2, yTop, z2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    }));
    lines.renderOrder = 1;
    scene.add(lines);
    return lines;
};

export const addVerticalCornerLinesFromBox = (scene, width, height, depth, yOffset = 0, color = 0xd2d2d2) => {
    const hx = width / 2;
    const hy = height / 2;
    const hz = depth / 2;
    const inset = 0.02;
    const corners = [
        [hx - inset, hz - inset],
        [hx - inset, -hz + inset],
        [-hx + inset, hz - inset],
        [-hx + inset, -hz + inset],
    ];
    const positions = [];
    for (const [x, z] of corners) {
        positions.push(x, -hy + yOffset, z, x, hy + yOffset, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
    scene.add(lines);
    return lines;
};

const shapeFromOutline = (outline) => {
    const s = new THREE.Shape();
    const [x0, z0] = outline[0];
    s.moveTo(x0, z0);
    for (let i = 1; i < outline.length; i++) {
        s.lineTo(outline[i][0], outline[i][1]);
    }
    s.lineTo(x0, z0);
    return s;
};

export const DEFAULT_ROOM_HEIGHT = 6;
export const CEILING_TILE_WORLD_SIZE = 64;

export const createRoomLayout = ({ scene, outline, height = DEFAULT_ROOM_HEIGHT, ceilingHeight, floorY: floorYOpt, materials, molding = true, cornerLines = true, horizontalLines = true, wallClick = null, wallInset = 0.05, roomLights = null, }) => {
    if (!outline || outline.length < 3) {
        throw new Error("createRoomLayout: outline needs at least 3 points");
    }
    const roomHeight = ceilingHeight ?? height;
    const floorY = floorYOpt !== undefined && floorYOpt !== null
        ? floorYOpt
        : -roomHeight / 2;
    const ceilingY = floorY + roomHeight;
    const wallCenterY = (floorY + ceilingY) / 2;
    const roomHalfY = -floorY;
    const shape = shapeFromOutline(outline);
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), materials.floor);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = floorY;
    floor.scale.z = -1;
    scene.add(floor);
    const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(shape), materials.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = ceilingY;
    scene.add(ceiling);
    let wallMeshes = [];
    if (wallClick) {
        wallMeshes = wallClick.addWallsFromOutline(outline, {
            material: materials.wall,
            height: roomHeight,
            y: wallCenterY,
        });
    }
    if (cornerLines !== false) {
        const color = typeof cornerLines === "number" ? cornerLines : 0x111111;
        const vert = addVerticalCornerLinesFromOutline(scene, outline, roomHeight, color, floorY);
        const horiz = horizontalLines ? addHorizontalEdgeLinesFromOutline(scene, outline, roomHeight, color, floorY) : null;
        if (roomLights) {
            if (vert?.material)
                roomLights.registerUnlit(vert.material);
            if (horiz?.material)
                roomLights.registerUnlit(horiz.material);
        }
    }
    if (molding !== false) {
        const color = typeof molding === "number" ? molding : undefined;
        addHallMolding(scene, outline, roomHeight, color, floorY);
    }
    const bounds = outlineBounds(outline);
    const walls = wallsFromOutline(outline, wallInset);
    return {
        outline,
        height: roomHeight,
        floorY,
        ceilingY,
        roomHalfY,
        floor,
        ceiling,
        wallMeshes,
        bounds,
        walls,
        wallInset,
    };
};

export const DEFAULT_GALLERY_DOOR_HEIGHT = 4;
export const DEFAULT_ART_HEIGHT_FROM_FLOOR = 2.4;
export const DEFAULT_CAMERA_HEIGHT_FROM_FLOOR = 3;

export const placeOnWall = (mesh, wall, x, y, halfW, bounds, wallInset = 0.05, { heightFromFloor, floorY, clamp = "edges" } = {}) => {
    let worldY = y;
    if (heightFromFloor != null) {
        if (floorY == null) {
            console.warn("placeOnWall: heightFromFloor requires floorY");
            return false;
        }
        worldY = floorY + heightFromFloor;
    }
    if (worldY == null || Number.isNaN(worldY)) {
        console.warn("placeOnWall: need y, or heightFromFloor with floorY");
        return false;
    }
    const halfX = bounds.halfX ?? bounds.width / 2;
    const halfZ = bounds.halfZ ?? bounds.depth / 2;
    const span = wall === "north" || wall === "south" ? halfX : halfZ;
    const maxX = clamp === "center" ? span : span - halfW;
    const lx = maxX < 0 ? 0 : Math.max(-maxX, Math.min(maxX, x));
    const cx = bounds.centerX ?? 0;
    const cz = bounds.centerZ ?? 0;
    if (wall === "north") {
        mesh.position.set(cx + lx, worldY, bounds.minZ + wallInset);
    }
    else if (wall === "south") {
        mesh.position.set(cx + lx, worldY, bounds.maxZ - wallInset);
        mesh.rotation.y = Math.PI;
    }
    else if (wall === "west") {
        mesh.position.set(bounds.minX + wallInset, worldY, cz + lx);
        mesh.rotation.y = Math.PI / 2;
    }
    else if (wall === "east") {
        mesh.position.set(bounds.maxX - wallInset, worldY, cz + lx);
        mesh.rotation.y = -Math.PI / 2;
    }
    else {
        console.warn("Invalid wall:", wall);
        return false;
    }
    return true;
};

const DOOR_LABEL_RIGHT_SIGN = {
    north: 1,
    south: -1,
    west: -1,
    east: 1,
};

export const roomNumberFromPath = (path) => {
    if (!path || typeof path !== "string")
        return null;
    const clean = path.split("?")[0].split("#")[0];
    const file = clean.split("/").pop() || "";
    const m = file.match(/^(\d+)\.html$/i);
    return m ? m[1] : null;
};

export const resolveDoorRoomLabel = (explicit, href) => {
    if (explicit != null && String(explicit).length)
        return String(explicit);
    const pagePath = typeof location !== "undefined" ? location.pathname : "";
    const fromPage = roomNumberFromPath(pagePath);
    const fromHref = roomNumberFromPath(href);
    const isHubPath = !pagePath ||
        /\/$/.test(pagePath) ||
        /\/index\.html$/i.test(pagePath);
    const isCentralHall = fromPage === "7";
    const isHallway = isHubPath || isCentralHall || fromPage == null;
    if (isHallway)
        return fromHref || fromPage;
    return fromPage || fromHref;
};

export const addDoorRoomLabel = ({ scene, wall, doorAlong, doorWidth, doorHeight, roomHalfY, bounds, wallInset = 0.05, label, } = {}) => {
    const BOX_W = 0.28;
    const BOX_H = 0.36;
    const BOX_D = 0.05;
    const BOX_COLOR = 0xe4e4e4;
    const FONT_COLOR = "#111111";
    const FONT_SIZE_PX = 152;
    const FONT_FAMILY = "Georgia, 'Times New Roman', Times, serif";
    const GAP_FROM_DOOR = 0.08;
    const INSET_FROM_DOOR_TOP = 0.06;
    const WALL_FLUSH_PULL = 0.05;
    const CANVAS_SIZE = 256;
    if (!scene || !bounds || label == null || label === "")
        return null;
    const text = String(label);
    const right = DOOR_LABEL_RIGHT_SIGN[wall] ?? 1;
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return null;
    ctx.fillStyle = `#${BOX_COLOR.toString(16).padStart(6, "0")}`;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = FONT_COLOR;
    ctx.font = `600 ${FONT_SIZE_PX}px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - FONT_SIZE_PX * 0.06);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearFilter;
    map.needsUpdate = true;
    const sideMat = new THREE.MeshStandardMaterial({ color: BOX_COLOR });
    const faceMat = new THREE.MeshStandardMaterial({
        map,
        color: 0xffffff,
        roughness: 0.85,
        metalness: 0,
    });
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D), [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat]);
    const along = doorAlong + right * (doorWidth / 2 + GAP_FROM_DOOR + BOX_W / 2);
    const worldY = -roomHalfY + doorHeight - INSET_FROM_DOOR_TOP - BOX_H / 2;
    if (!placeOnWall(plaque, wall, along, worldY, BOX_W / 2, bounds, wallInset)) {
        map.dispose();
        faceMat.dispose();
        sideMat.dispose();
        plaque.geometry.dispose();
        return null;
    }
    const out = BOX_D / 2 - WALL_FLUSH_PULL;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(plaque.quaternion);
    plaque.position.addScaledVector(forward, out);
    plaque.userData.isDoorLabel = true;
    plaque.userData.label = text;
    scene.add(plaque);
    return plaque;
};

export const createAddWallDoor = ({ scene, textureLoader, roomHalfY, roomHeight, clickable, bounds, wallInset = 0.05, }) => {
    return (wall, imageFile, doorHeight, { href = null, locked = true, bright = false, x = 0, isLabelled = false, label = null, width = null, } = {}) => {
        return new Promise((resolve, reject) => {
            textureLoader.load(imageFile, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                const aspect = tex.image.width / tex.image.height;
                const imageWidth = width ?? doorHeight * aspect;
                const imageHeight = Math.min(doorHeight, roomHeight);
                const material = bright
                    ? new THREE.MeshStandardMaterial({
                        map: tex,
                        color: 0xffffff,
                        emissive: 0xffffff,
                        emissiveMap: tex,
                        emissiveIntensity: 0.5,
                        toneMapped: false,
                    })
                    : new THREE.MeshStandardMaterial({ map: tex });
                const door = new THREE.Mesh(new THREE.PlaneGeometry(imageWidth, imageHeight), material);
                const ly = -roomHalfY + imageHeight / 2;
                if (!placeOnWall(door, wall, x, ly, imageWidth / 2, bounds, wallInset)) {
                    resolve(null);
                    return;
                }
                door.userData.isDoor = true;
                door.userData.wall = wall;
                door.userData.locked = locked;
                door.userData.href = href;
                clickable.push(door);
                scene.add(door);
                if (isLabelled) {
                    const plaque = resolveDoorRoomLabel(label, href);
                    if (plaque) {
                        addDoorRoomLabel({
                            scene,
                            wall,
                            doorAlong: x,
                            doorWidth: imageWidth,
                            doorHeight: imageHeight,
                            roomHalfY,
                            bounds,
                            wallInset,
                            label: plaque,
                        });
                    }
                }
                resolve(door);
            }, undefined, () => reject(new Error("Could not load door texture: " + imageFile)));
        });
    };
};

export const createAddWallImage = ({ scene, textureLoader, roomHalfY, floorY = -roomHalfY, ceilingY = roomHalfY, heightFromFloor = DEFAULT_ART_HEIGHT_FROM_FLOOR, clickable, bounds, wallInset = 0.05, }) => {
    return (wall, x, imageFile, imageWidth, { heightFromFloor: heightFromFloorOpt } = {}) => {
        textureLoader.load(imageFile, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const aspect = tex.image.width / tex.image.height;
            const imageHeight = imageWidth / aspect;
            const art = new THREE.Mesh(new THREE.PlaneGeometry(imageWidth, imageHeight), new THREE.MeshStandardMaterial({
                map: tex,
                transparent: true,
                alphaTest: 0.1,
                depthWrite: true,
            }));
            const roomH = ceilingY - floorY;
            const minHff = imageHeight / 2;
            const maxHff = roomH - imageHeight / 2;
            const hff = Math.max(minHff, Math.min(maxHff, heightFromFloorOpt ?? heightFromFloor));
            if (!placeOnWall(art, wall, x, null, imageWidth / 2, bounds, wallInset, { heightFromFloor: hff, floorY })) {
                return;
            }
            art.userData.imageFile = imageFile;
            clickable.push(art);
            scene.add(art);
        });
    };
};

export const DEFAULT_USER_ART_WIDTH = 1.6;

export const hitToWallPlacement = (info, { floorY, bounds } = {}) => {
    if (!info?.world || floorY == null)
        return null;
    if (info.wall === "ceiling" || info.wall === "floor")
        return null;
    let wall = info.wall;
    if (bounds) {
        const { minX, maxX, minZ, maxZ } = bounds;
        const wx = info.world.x;
        const wz = info.world.z;
        const dN = Math.abs(wz - minZ);
        const dS = Math.abs(wz - maxZ);
        const dW = Math.abs(wx - minX);
        const dE = Math.abs(wx - maxX);
        const nearest = Math.min(dN, dS, dW, dE);
        if (nearest === dN)
            wall = "north";
        else if (nearest === dS)
            wall = "south";
        else if (nearest === dW)
            wall = "west";
        else
            wall = "east";
    }
    if (typeof wall !== "string")
        return null;
    const cx = bounds?.centerX ?? 0;
    const cz = bounds?.centerZ ?? 0;
    const x = wall === "north" || wall === "south"
        ? info.world.x - cx
        : info.world.z - cz;
    return {
        wall,
        x,
        heightFromFloor: info.world.y - floorY,
    };
};

const resolveUserImageSource = (imageSource) => {
    if (typeof imageSource === "string") {
        return {
            url: imageSource,
            displayName: imageSource.startsWith("blob:")
                ? "uploaded image"
                : imageSource.split("/").pop() || null,
        };
    }
    if (typeof Blob !== "undefined" && imageSource instanceof Blob) {
        const name = typeof File !== "undefined" &&
            imageSource instanceof File &&
            imageSource.name
            ? imageSource.name
            : "uploaded image";
        return { url: URL.createObjectURL(imageSource), displayName: name };
    }
    console.warn("resolveUserImageSource: unsupported image source", imageSource);
    return { url: "", displayName: null };
};

export const createAddUserWallImage = ({ scene, textureLoader, roomHalfY, floorY = -roomHalfY, ceilingY = roomHalfY, heightFromFloor = DEFAULT_ART_HEIGHT_FROM_FLOOR, clickable, bounds, wallInset = 0.05, }) => {
    return (wall, x, imageSource, imageWidth = DEFAULT_USER_ART_WIDTH, { heightFromFloor: heightFromFloorOpt } = {}) => {
        const { url, displayName } = resolveUserImageSource(imageSource);
        if (!url)
            return Promise.resolve(null);
        return new Promise((resolve) => {
            textureLoader.load(url, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                const aspect = tex.image.width / tex.image.height;
                const imageHeight = imageWidth / aspect;
                const art = new THREE.Mesh(new THREE.PlaneGeometry(imageWidth, imageHeight), new THREE.MeshStandardMaterial({
                    map: tex,
                    transparent: true,
                    alphaTest: 0.1,
                    depthWrite: true,
                }));
                const roomH = ceilingY - floorY;
                const hffRaw = heightFromFloorOpt ?? heightFromFloor;
                const hff = Math.max(0, Math.min(roomH, hffRaw));
                if (!placeOnWall(art, wall, x, null, imageWidth / 2, bounds, wallInset, { heightFromFloor: hff, floorY, clamp: "center" })) {
                    resolve(null);
                    return;
                }
                const halfX = bounds.halfX ?? bounds.width / 2;
                const halfZ = bounds.halfZ ?? bounds.depth / 2;
                const maxAlong = wall === "north" || wall === "south" ? halfX : halfZ;
                const xClamped = maxAlong < 0
                    ? 0
                    : Math.max(-maxAlong, Math.min(maxAlong, x));
                const uX = maxAlong > 1e-6
                    ? (xClamped + maxAlong) / (2 * maxAlong)
                    : 0.5;
                const uY = roomH > 1e-6 ? hff / roomH : 0.5;
                art.userData.imageFile = url;
                art.userData.imageName = displayName;
                art.userData.isUserArt = true;
                art.userData.artWidth = imageWidth;
                art.userData.aspect = aspect;
                art.userData.placement = {
                    wall,
                    x: xClamped,
                    heightFromFloor: hff,
                    uX,
                    uY,
                };
                clickable.push(art);
                scene.add(art);
                resolve(art);
            }, undefined, () => {
                console.warn("addUserWallImage: failed to load", displayName || url);
                resolve(null);
            });
        });
    };
};

export const userArtTravelLimits = ({ wall, bounds, floorY, ceilingY }) => {
    const halfX = bounds.halfX ?? bounds.width / 2;
    const halfZ = bounds.halfZ ?? bounds.depth / 2;
    const maxAlong = wall === "north" || wall === "south" ? halfX : halfZ;
    return {
        maxAlong: Math.max(0, maxAlong),
        roomH: Math.max(0, ceilingY - floorY),
    };
};

const clamp01 = (t) => Math.max(0, Math.min(1, t));

export const updateUserArtPlacement = (art, patch = {}, { bounds, floorY, ceilingY, wallInset = 0.05 } = {}) => {
    if (!art?.userData?.isUserArt || !art.userData.placement)
        return false;
    if (bounds == null || floorY == null || ceilingY == null)
        return false;
    const aspect = art.userData.aspect;
    if (!(aspect > 0))
        return false;
    const placement = art.userData.placement;
    const wall = placement.wall;
    const width = patch.width != null ? patch.width : art.userData.artWidth;
    if (!(width > 0))
        return false;
    const { maxAlong, roomH } = userArtTravelLimits({
        wall,
        bounds,
        floorY,
        ceilingY,
    });
    let uX = patch.uX;
    let uY = patch.uY;
    if (uX == null) {
        uX =
            placement.uX != null
                ? placement.uX
                : maxAlong > 1e-6
                    ? (placement.x + maxAlong) / (2 * maxAlong)
                    : 0.5;
    }
    if (uY == null) {
        uY =
            placement.uY != null
                ? placement.uY
                : roomH > 1e-6
                    ? placement.heightFromFloor / roomH
                    : 0.5;
    }
    uX = clamp01(uX);
    uY = clamp01(uY);
    const x = -maxAlong + uX * (2 * maxAlong);
    const hff = uY * roomH;
    const imageHeight = width / aspect;
    if (width !== art.userData.artWidth) {
        art.geometry.dispose();
        art.geometry = new THREE.PlaneGeometry(width, imageHeight);
    }
    if (!placeOnWall(art, wall, x, null, width / 2, bounds, wallInset, {
        heightFromFloor: hff,
        floorY,
        clamp: "center",
    })) {
        return false;
    }
    art.userData.artWidth = width;
    art.userData.placement = {
        wall,
        x,
        heightFromFloor: hff,
        uX,
        uY,
    };
    return true;
};

export const setUserArtWidth = (art, width, ctx) => {
    return updateUserArtPlacement(art, { width }, ctx);
};

const USER_ART_DB_NAME = "y9k-user-art";
const USER_ART_DB_VERSION = 1;

const newPlacementId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `art-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const idbRequest = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
});

const idbTxDone = (tx) => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
});

export const createLocalPlacementStore = ({ dbName = USER_ART_DB_NAME } = {}) => {
    let dbPromise = null;
    const openDb = () => {
        if (dbPromise)
            return dbPromise;
        if (typeof indexedDB === "undefined") {
            return Promise.reject(new Error("IndexedDB is not available"));
        }
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, USER_ART_DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("placements")) {
                    const placements = db.createObjectStore("placements", {
                        keyPath: "id",
                    });
                    placements.createIndex("roomId", "roomId", { unique: false });
                }
                if (!db.objectStoreNames.contains("blobs")) {
                    db.createObjectStore("blobs", { keyPath: "id" });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error("Failed to open user-art DB"));
        });
        return dbPromise;
    };
    return {
        async list(roomId) {
            const db = await openDb();
            const tx = db.transaction("placements", "readonly");
            const index = tx.objectStore("placements").index("roomId");
            const rows = await idbRequest(index.getAll(roomId));
            await idbTxDone(tx);
            return Array.isArray(rows) ? rows : [];
        },
        async getBlob(id) {
            const db = await openDb();
            const tx = db.transaction("blobs", "readonly");
            const row = await idbRequest(tx.objectStore("blobs").get(id));
            await idbTxDone(tx);
            return row?.blob instanceof Blob ? row.blob : null;
        },
        async put({ placement, blob }) {
            if (!placement?.id || !(blob instanceof Blob)) {
                throw new Error("placement store put: placement.id and blob required");
            }
            const db = await openDb();
            const tx = db.transaction(["placements", "blobs"], "readwrite");
            tx.objectStore("placements").put(placement);
            tx.objectStore("blobs").put({ id: placement.id, blob });
            await idbTxDone(tx);
        },
        async updateMeta(id, partial) {
            const db = await openDb();
            const tx = db.transaction("placements", "readwrite");
            const store = tx.objectStore("placements");
            const existing = await idbRequest(store.get(id));
            if (!existing) {
                await idbTxDone(tx);
                return false;
            }
            store.put({
                ...existing,
                ...partial,
                id,
                updatedAt: Date.now(),
            });
            await idbTxDone(tx);
            return true;
        },
        async remove(id) {
            const db = await openDb();
            const tx = db.transaction(["placements", "blobs"], "readwrite");
            tx.objectStore("placements").delete(id);
            tx.objectStore("blobs").delete(id);
            await idbTxDone(tx);
        },
    };
};

const placementWorldFromUV = (wall, uX, uY, { bounds, floorY, ceilingY }) => {
    const { maxAlong, roomH } = userArtTravelLimits({
        wall,
        bounds,
        floorY,
        ceilingY,
    });
    const uu = clamp01(uX ?? 0.5);
    const vv = clamp01(uY ?? 0.5);
    return {
        x: -maxAlong + uu * (2 * maxAlong),
        heightFromFloor: vv * roomH,
        uX: uu,
        uY: vv,
    };
};

export const createUserArtSession = ({ store, roomId, addUserWallImage, clickable, bounds, floorY, ceilingY, wallInset = 0.05, }) => {
    const placeCtx = { bounds, floorY, ceilingY, wallInset };
    const metaFromArt = (art, id, createdAt) => {
        const p = art.userData.placement;
        const now = Date.now();
        return {
            id,
            roomId,
            wall: p.wall,
            width: art.userData.artWidth,
            uX: p.uX,
            uY: p.uY,
            imageName: art.userData.imageName || null,
            createdAt: createdAt ?? art.userData.createdAt ?? now,
            updatedAt: now,
        };
    };
    return {
        roomId,
        store,
        async hydrate() {
            if (!store || !roomId || typeof addUserWallImage !== "function") {
                return [];
            }
            let rows = [];
            try {
                rows = await store.list(roomId);
            }
            catch (err) {
                console.warn("user art hydrate: list failed", err);
                return [];
            }
            rows = [...rows].sort((a, b) => (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0));
            const meshes = [];
            for (const row of rows) {
                if (!row?.id || !row.wall)
                    continue;
                let blob = null;
                try {
                    blob = await store.getBlob(row.id);
                }
                catch (err) {
                    console.warn("user art hydrate: getBlob failed", row.id, err);
                    continue;
                }
                if (!blob) {
                    console.warn("user art hydrate: missing blob for", row.id);
                    continue;
                }
                const { x, heightFromFloor, uX, uY } = placementWorldFromUV(row.wall, row.uX, row.uY, placeCtx);
                const url = URL.createObjectURL(blob);
                try {
                    const art = await addUserWallImage(row.wall, x, url, row.width || DEFAULT_USER_ART_WIDTH, { heightFromFloor });
                    if (!art) {
                        URL.revokeObjectURL(url);
                        continue;
                    }
                    art.userData.placementId = row.id;
                    art.userData.createdAt = row.createdAt;
                    if (row.imageName)
                        art.userData.imageName = row.imageName;
                    updateUserArtPlacement(art, { width: row.width, uX, uY }, placeCtx);
                    meshes.push(art);
                }
                catch (err) {
                    console.warn("user art hydrate: place failed", row.id, err);
                    try {
                        URL.revokeObjectURL(url);
                    }
                    catch (_) { }
                }
            }
            return meshes;
        },
        async remember(art, blob) {
            if (!art?.userData?.isUserArt || !(blob instanceof Blob))
                return null;
            const id = art.userData.placementId || newPlacementId();
            art.userData.placementId = id;
            const placement = metaFromArt(art, id, art.userData.createdAt);
            art.userData.createdAt = placement.createdAt;
            await store.put({ placement, blob });
            return placement;
        },
        async sync(art) {
            const id = art?.userData?.placementId;
            if (!id || !art.userData?.placement)
                return false;
            return store.updateMeta(id, {
                wall: art.userData.placement.wall,
                width: art.userData.artWidth,
                uX: art.userData.placement.uX,
                uY: art.userData.placement.uY,
                imageName: art.userData.imageName || null,
            });
        },
        async forget(art) {
            const id = art?.userData?.placementId;
            removeUserWallImage(art, { clickable });
            if (id) {
                try {
                    await store.remove(id);
                }
                catch (err) {
                    console.warn("user art forget: remove failed", id, err);
                }
            }
            return true;
        },
        async forgetAll() {
            let rows = [];
            try {
                rows = await store.list(roomId);
            }
            catch (err) {
                console.warn("user art forgetAll: list failed", err);
                rows = [];
            }
            const meshes = Array.isArray(clickable)
                ? clickable.filter((o) => o?.userData?.isUserArt)
                : [];
            for (const mesh of [...meshes]) {
                removeUserWallImage(mesh, { clickable });
            }
            let removed = 0;
            for (const row of rows) {
                if (!row?.id)
                    continue;
                try {
                    await store.remove(row.id);
                    removed += 1;
                }
                catch (err) {
                    console.warn("user art forgetAll: remove failed", row.id, err);
                }
            }
            return removed;
        },
    };
};

export const removeUserWallImage = (art, { clickable } = {}) => {
    if (!art?.userData?.isUserArt)
        return false;
    if (Array.isArray(clickable)) {
        const i = clickable.indexOf(art);
        if (i >= 0)
            clickable.splice(i, 1);
    }
    if (art.parent)
        art.parent.remove(art);
    const url = art.userData.imageFile;
    if (typeof url === "string" && url.startsWith("blob:")) {
        try {
            URL.revokeObjectURL(url);
        }
        catch (_) { }
    }
    const mat = art.material;
    if (mat) {
        if (mat.map)
            mat.map.dispose();
        mat.dispose();
    }
    if (art.geometry)
        art.geometry.dispose();
    art.userData.isUserArt = false;
    return true;
};

export const initDevWallUpload = ({ wallClick, addUserWallImage, clickable, session = null, floorY, ceilingY, bounds, wallInset = 0.05, stage, defaultWidth = DEFAULT_USER_ART_WIDTH, minWidth = 0.5, maxWidth = 20, playAppearSfx = null, } = {}) => {
    const empty = {
        panel: null,
        button: null,
        deleteButton: null,
        input: null,
        slider: null,
        xSlider: null,
        ySlider: null,
        ready: Promise.resolve(),
    };
    const host = stage || document.getElementById("stage");
    if (!host || !wallClick || typeof addUserWallImage !== "function") {
        console.warn("initDevWallUpload: missing stage, wallClick, or addUserWallImage");
        return empty;
    }
    if (ceilingY == null) {
        console.warn("initDevWallUpload: ceilingY is required for resize");
        return empty;
    }
    const placeCtx = { bounds, floorY, ceilingY, wallInset };
    let panel = document.getElementById("dev-wall-upload-panel");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "dev-wall-upload-panel";
        host.appendChild(panel);
    }
    let actions = document.getElementById("dev-wall-upload-actions");
    if (!actions) {
        actions = document.createElement("div");
        actions.id = "dev-wall-upload-actions";
        panel.appendChild(actions);
    }
    let button = document.getElementById("dev-wall-upload");
    if (!button) {
        button = document.createElement("button");
        button.id = "dev-wall-upload";
        button.type = "button";
        button.textContent = "place image";
        actions.appendChild(button);
    }
    else if (button.parentElement !== actions) {
        actions.appendChild(button);
    }
    let deleteButton = document.getElementById("dev-wall-upload-delete");
    if (!deleteButton) {
        deleteButton = document.createElement("button");
        deleteButton.id = "dev-wall-upload-delete";
        deleteButton.type = "button";
        deleteButton.textContent = "delete image";
        actions.appendChild(deleteButton);
    }
    else if (deleteButton.parentElement !== actions) {
        actions.appendChild(deleteButton);
    }
    const ensureSliderRow = (rowId, sliderId, labelId, { min, max, step, prefix }) => {
        let row = document.getElementById(rowId);
        if (!row) {
            row = document.createElement("div");
            row.id = rowId;
            row.className = "dev-wall-upload-slider-row";
            panel.appendChild(row);
        }
        else {
            row.classList.add("dev-wall-upload-slider-row");
        }
        let nameEl = row.querySelector(".dev-wall-upload-slider-name");
        if (!nameEl) {
            nameEl = document.createElement("span");
            nameEl.className = "dev-wall-upload-slider-name";
            nameEl.textContent = prefix;
            row.insertBefore(nameEl, row.firstChild);
        }
        else {
            nameEl.textContent = prefix;
        }
        let range = document.getElementById(sliderId);
        if (!range) {
            range = document.createElement("input");
            range.id = sliderId;
            range.type = "range";
            range.min = String(min);
            range.max = String(max);
            range.step = String(step);
            row.appendChild(range);
        }
        else {
            range.min = String(min);
            range.max = String(max);
            range.step = String(step);
        }
        let label = document.getElementById(labelId);
        if (!label) {
            label = document.createElement("span");
            label.id = labelId;
            label.className = "dev-wall-upload-slider-label";
            row.appendChild(label);
        }
        return { row, range, label };
    };
    const legacySizeRow = document.getElementById("dev-wall-upload-size-row");
    if (legacySizeRow && !legacySizeRow.classList.contains("dev-wall-upload-slider-row")) {
        legacySizeRow.className = "dev-wall-upload-slider-row";
    }
    const size = ensureSliderRow("dev-wall-upload-size-row", "dev-wall-upload-size", "dev-wall-upload-size-label", { min: minWidth, max: maxWidth, step: 0.05, prefix: "size" });
    const posX = ensureSliderRow("dev-wall-upload-x-row", "dev-wall-upload-x", "dev-wall-upload-x-label", { min: 0, max: 100, step: 1, prefix: "x" });
    const posY = ensureSliderRow("dev-wall-upload-y-row", "dev-wall-upload-y", "dev-wall-upload-y-label", { min: 0, max: 100, step: 1, prefix: "y" });
    let resetButton = document.getElementById("dev-wall-upload-reset");
    if (!resetButton) {
        resetButton = document.createElement("button");
        resetButton.id = "dev-wall-upload-reset";
        resetButton.type = "button";
        resetButton.textContent = "reset art";
        panel.appendChild(resetButton);
    }
    else {
        panel.appendChild(resetButton);
    }
    const slider = size.range;
    const xSlider = posX.range;
    const ySlider = posY.range;
    let input = document.getElementById("dev-wall-upload-input");
    if (!input) {
        input = document.createElement("input");
        input.id = "dev-wall-upload-input";
        input.type = "file";
        input.accept = "image/*";
        input.hidden = true;
        panel.appendChild(input);
    }
    let lastArt = null;
    let syncTimer = null;
    const fmtWidth = (w) => `${Number(w).toFixed(2)}m`;
    const fmtPct = (v) => `${Math.round(Number(v))}%`;
    const syncLabels = () => {
        size.label.textContent = fmtWidth(slider.value);
        posX.label.textContent = fmtPct(xSlider.value);
        posY.label.textContent = fmtPct(ySlider.value);
    };
    const syncPosFromArt = (art) => {
        if (!art?.userData?.placement)
            return;
        const { uX = 0.5, uY = 0.5 } = art.userData.placement;
        xSlider.value = String(Math.round(clamp01(uX) * 100));
        ySlider.value = String(Math.round(clamp01(uY) * 100));
    };
    const scheduleSync = () => {
        if (!session || !lastArt)
            return;
        if (syncTimer)
            clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            session.sync(lastArt).catch((err) => {
                console.warn("user art sync failed", err);
            });
        }, 120);
    };
    const syncEnabled = () => {
        const hasHit = !!wallClick.getLastHit?.();
        const on = isDevMode() && hasHit;
        button.disabled = !on;
        button.title = !isDevMode()
            ? "enter developer mode"
            : hasHit
                ? "place an image at the crosshair"
                : "click a wall first";
        button.setAttribute("aria-label", button.title);
        const canDelete = isDevMode() && !!lastArt;
        deleteButton.disabled = !canDelete;
        deleteButton.title = canDelete
            ? "delete last placed image from the room and IndexedDB"
            : "place an image first";
        deleteButton.setAttribute("aria-label", deleteButton.title);
        resetButton.disabled = !isDevMode();
        resetButton.title = isDevMode()
            ? "remove all uploaded art in this room from the scene and IndexedDB"
            : "enter developer mode";
        resetButton.setAttribute("aria-label", resetButton.title);
        const sizeOn = isDevMode();
        slider.disabled = !sizeOn;
        size.row.classList.toggle("is-disabled", !sizeOn);
        slider.title = lastArt
            ? "resize last placed image (also size for next place)"
            : "size for next placed image";
        const posOn = isDevMode() && !!lastArt;
        for (const { row, range, title } of [
            {
                row: posX.row,
                range: xSlider,
                title: "horizontal position on wall",
            },
            {
                row: posY.row,
                range: ySlider,
                title: "vertical position on wall",
            },
        ]) {
            range.disabled = !posOn;
            row.classList.toggle("is-disabled", !posOn);
            range.title = posOn ? title : "place an image first";
        }
        syncLabels();
    };
    const applyFromSliders = (patch) => {
        if (!lastArt)
            return;
        updateUserArtPlacement(lastArt, patch, placeCtx);
        syncLabels();
        scheduleSync();
    };
    const placeFromFile = (file) => {
        if (!file || !file.type.startsWith("image/")) {
            console.warn("initDevWallUpload: choose an image file");
            return;
        }
        const info = wallClick.getLastHit?.();
        const placement = hitToWallPlacement(info, { floorY, bounds });
        if (!placement) {
            console.warn("initDevWallUpload: click a wall first");
            syncEnabled();
            return;
        }
        const width = Number(slider.value) || defaultWidth;
        addUserWallImage(placement.wall, placement.x, file, width, { heightFromFloor: placement.heightFromFloor }).then(async (art) => {
            if (art) {
                lastArt = art;
                slider.value = String(art.userData.artWidth ?? width);
                syncPosFromArt(art);
                if (typeof playAppearSfx === "function")
                    playAppearSfx();
                if (session) {
                    try {
                        await session.remember(art, file);
                    }
                    catch (err) {
                        console.warn("user art remember failed", err);
                    }
                }
            }
            syncEnabled();
        });
    };
    const deleteLastArt = async () => {
        if (!lastArt)
            return;
        const art = lastArt;
        lastArt = null;
        if (session) {
            try {
                await session.forget(art);
            }
            catch (err) {
                console.warn("user art forget failed", err);
                removeUserWallImage(art, { clickable });
            }
        }
        else {
            removeUserWallImage(art, { clickable });
        }
        syncEnabled();
    };
    const handleArtRemoved = (art) => {
        if (art && lastArt === art)
            lastArt = null;
        syncEnabled();
    };
    const resetAllArt = async () => {
        lastArt = null;
        if (session) {
            try {
                await session.forgetAll();
            }
            catch (err) {
                console.warn("user art reset failed", err);
            }
        }
        else if (Array.isArray(clickable)) {
            for (const mesh of [...clickable.filter((o) => o?.userData?.isUserArt)]) {
                removeUserWallImage(mesh, { clickable });
            }
        }
        syncEnabled();
    };
    button.addEventListener("click", (e) => {
        e.stopPropagation();
        if (button.disabled)
            return;
        input.value = "";
        input.click();
    });
    deleteButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (deleteButton.disabled)
            return;
        deleteLastArt();
    });
    resetButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (resetButton.disabled)
            return;
        resetAllArt();
    });
    input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (file)
            placeFromFile(file);
    });
    const bindSlider = (range, onInput) => {
        range.addEventListener("pointerdown", (e) => e.stopPropagation());
        range.addEventListener("click", (e) => e.stopPropagation());
        range.addEventListener("input", onInput);
    };
    bindSlider(slider, () => {
        syncLabels();
        if (!lastArt)
            return;
        applyFromSliders({ width: Number(slider.value) });
    });
    bindSlider(xSlider, () => {
        applyFromSliders({ uX: Number(xSlider.value) / 100 });
    });
    bindSlider(ySlider, () => {
        applyFromSliders({ uY: Number(ySlider.value) / 100 });
    });
    slider.value = String(defaultWidth);
    xSlider.value = "50";
    ySlider.value = "50";
    syncLabels();
    if (typeof wallClick.onWallPick === "function") {
        wallClick.onWallPick(() => syncEnabled());
    }
    const mo = new MutationObserver(syncEnabled);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    syncEnabled();
    const ready = (async () => {
        if (!session)
            return;
        try {
            const meshes = await session.hydrate();
            if (meshes.length) {
                lastArt = meshes[meshes.length - 1];
                slider.value = String(lastArt.userData.artWidth ?? defaultWidth);
                syncPosFromArt(lastArt);
            }
            syncEnabled();
        }
        catch (err) {
            console.warn("user art hydrate failed", err);
        }
    })();
    return {
        panel,
        button,
        deleteButton,
        resetButton,
        input,
        slider,
        xSlider,
        ySlider,
        ready,
        handleArtRemoved,
        resetAllArt,
    };
};

export const createAddWallVideoScreen = ({ scene, roomHalfY, floorY = -roomHalfY, ceilingY = roomHalfY, heightFromFloor = DEFAULT_ART_HEIGHT_FROM_FLOOR, clickable, bounds, wallInset = 0.05, }) => {
    return (wall, x, screenWidth, { heightFromFloor: heightFromFloorOpt, aspect = 16 / 9, color = 0x1a4cff, bezel = 0.12, bezelBottom, depth = 0.09, frameColor = 0x111111, videoUrl = null, previewSrc = null, previewSpeed = 0.4, conduit = false, } = {}) => {
        const screenHeight = screenWidth / aspect;
        const bottom = bezelBottom ?? bezel * 1.75;
        const frameW = screenWidth + bezel * 2;
        const frameH = screenHeight + bezel + bottom;
        const screenY = (bottom - bezel) / 2;
        const monitor = new THREE.Group();
        monitor.userData.isVideoScreen = true;
        monitor.userData.videoUrl = videoUrl;
        const frameMat = new THREE.MeshStandardMaterial({
            color: frameColor,
            roughness: 0.85,
            metalness: 0.05,
        });
        const frame = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, depth), frameMat);
        frame.position.z = depth / 2;
        frame.userData.isVideoScreen = true;
        frame.userData.videoUrl = videoUrl;
        monitor.add(frame);
        let screenMat = new THREE.MeshBasicMaterial({ color });
        let previewVideo = null;
        if (previewSrc) {
            let src = previewSrc;
            if (/\.gif$/i.test(src)) {
                src = src.replace(/\.gif$/i, "-preview.mp4");
            }
            const video = document.createElement("video");
            video.src = src;
            video.crossOrigin = "anonymous";
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.preload = "auto";
            video.playbackRate = previewSpeed;
            const tex = new THREE.VideoTexture(video);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            screenMat = new THREE.MeshBasicMaterial({ map: tex });
            previewVideo = video;
            const tryPlay = () => {
                video.playbackRate = previewSpeed;
                video.play().catch(() => { });
            };
            video.addEventListener("canplay", tryPlay, { once: true });
            tryPlay();
            runOnFirstPointerDown(tryPlay);
        }
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenWidth, screenHeight), screenMat);
        screen.position.set(0, screenY, depth + 0.002);
        screen.userData.isVideoScreen = true;
        screen.userData.videoUrl = videoUrl;
        monitor.add(screen);
        const ledR = Math.min(0.01, bezel * 0.14);
        const led = new THREE.Mesh(new THREE.SphereGeometry(ledR, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff1a1a }));
        const ledInset = bottom * 0.45;
        led.position.set(frameW / 2 - Math.min(ledInset, bezel * 0.55), -frameH / 2 + ledInset, depth + 0.004);
        led.userData.isVideoScreen = true;
        led.userData.videoUrl = videoUrl;
        monitor.add(led);
        const roomH = ceilingY - floorY;
        const minHff = frameH / 2;
        const maxHff = roomH - frameH / 2;
        const hff = Math.max(minHff, Math.min(maxHff, heightFromFloorOpt ?? heightFromFloor));
        if (!placeOnWall(monitor, wall, x, null, frameW / 2, bounds, wallInset, { heightFromFloor: hff, floorY })) {
            return null;
        }
        if (conduit !== false && conduit != null) {
            const MONITOR_CONDUIT_RADIUS = 0.022;
            const METAL = 0xb4b4b4;
            const MOLDING_OFFWHITE = 0xf7f7f7;
            let conduitColor = METAL;
            if (conduit === "molding")
                conduitColor = MOLDING_OFFWHITE;
            else if (conduit === "metal")
                conduitColor = METAL;
            else if (typeof conduit === "number")
                conduitColor = conduit;
            const bottomOfFrame = -frameH / 2;
            const ly = floorY + hff;
            const floorLocalY = floorY - ly;
            const conduitLen = bottomOfFrame - floorLocalY;
            if (conduitLen > 0) {
                const tube = new THREE.Mesh(new THREE.CylinderGeometry(MONITOR_CONDUIT_RADIUS, MONITOR_CONDUIT_RADIUS, conduitLen, 12), new THREE.MeshStandardMaterial({ color: conduitColor }));
                tube.position.set(0, (bottomOfFrame + floorLocalY) / 2, depth * 0.25);
                monitor.add(tube);
            }
        }
        monitor.userData.previewVideo = previewVideo;
        clickable.push(frame, screen);
        scene.add(monitor);
        return monitor;
    };
};

export const createMusicControls = ({ musicPath, volume = 0.25, sfxVolume = 1, lightBuzzPath = null, lightBuzzVolume = 0.2, initialLightsOn = true, toggleEl = document.getElementById("music-toggle"), soundPrefKey = SOUND_PREF_KEY, } = {}) => {
    const readSoundPref = () => {
        try {
            const v = localStorage.getItem(soundPrefKey);
            if (v === null)
                return false;
            return v === "1" || v === "true";
        }
        catch {
            return false;
        }
    };
    const writeSoundPref = (on) => {
        try {
            localStorage.setItem(soundPrefKey, on ? "1" : "0");
        }
        catch (_) { }
    };
    let IS_SOUND_ON = readSoundPref();
    const soundListeners = new Set();
    let lightsOn = initialLightsOn;
    let musicAudio = null;
    let lightBuzzAudio = null;
    const audioUnlockers = new Set();
    const ensureMusicAudio = () => {
        if (musicAudio)
            return musicAudio;
        musicAudio = new Audio(musicPath);
        musicAudio.loop = true;
        musicAudio.volume = volume;
        return musicAudio;
    };
    const ensureLightBuzzAudio = () => {
        if (!lightBuzzPath)
            return null;
        if (lightBuzzAudio)
            return lightBuzzAudio;
        lightBuzzAudio = new Audio(lightBuzzPath);
        lightBuzzAudio.loop = true;
        lightBuzzAudio.volume = lightBuzzVolume;
        return lightBuzzAudio;
    };
    const syncLightBuzz = async () => {
        const a = ensureLightBuzzAudio();
        if (!a)
            return;
        try {
            if (IS_SOUND_ON && lightsOn) {
                if (a.paused)
                    await a.play();
                if (!IS_SOUND_ON || !lightsOn)
                    a.pause();
            }
            else {
                a.pause();
            }
        }
        catch (_) { }
    };
    const setLightsOn = (on) => {
        lightsOn = !!on;
        syncLightBuzz();
    };
    const syncMusicToggleUi = () => {
        soundListeners.forEach(listener => listener(IS_SOUND_ON));
        if (!toggleEl)
            return;
        toggleEl.textContent = IS_SOUND_ON ? "🔊" : "🔇";
        toggleEl.title = IS_SOUND_ON ? "mute sound" : "play sound";
        toggleEl.setAttribute("aria-label", IS_SOUND_ON ? "mute sound" : "play music");
    };
    const isSoundOn = () => IS_SOUND_ON;
    const activateAudio = async () => {
        if (!IS_SOUND_ON)
            return;
        const startMusic = async () => {
            const a = ensureMusicAudio();
            try {
                if (a.paused)
                    await a.play();
                if (!IS_SOUND_ON)
                    a.pause();
            }
            catch (_) { }
        };
        const pending = [startMusic(), syncLightBuzz()];
        for (const unlock of audioUnlockers) {
            try {
                pending.push(Promise.resolve(unlock()));
            }
            catch (_) { }
        }
        await Promise.allSettled(pending);
    };
    const setSoundOn = async on => {
        IS_SOUND_ON = Boolean(on);
        writeSoundPref(IS_SOUND_ON);
        syncMusicToggleUi();
        if (IS_SOUND_ON)
            await activateAudio();
        else {
            musicAudio?.pause();
            await syncLightBuzz();
        }
    };
    const toggleMusic = () => setSoundOn(!IS_SOUND_ON);
    if (toggleEl) {
        toggleEl.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleMusic();
        });
    }
    const restore = async () => {
        syncMusicToggleUi();
        await activateAudio();
    };
    const playSfx = (soundPath, vol = sfxVolume) => {
        if (!IS_SOUND_ON)
            return Promise.resolve();
        return new Promise((resolve) => {
            const a = new Audio(soundPath);
            a.volume = vol;
            const done = () => resolve();
            a.addEventListener("ended", done, { once: true });
            a.addEventListener("error", done, { once: true });
            a.play().catch(done);
        });
    };
    restore();
    const onAudioGesture = () => { activateAudio(); };
    for (const event of ["pointerdown", "click", "keydown"])
        window.addEventListener(event, onAudioGesture, true);
    return {
        ensureMusicAudio,
        isSoundOn,
        setSoundOn,
        onSoundChange(listener) {
            soundListeners.add(listener);
            listener(IS_SOUND_ON);
            return () => soundListeners.delete(listener);
        },
        toggleMusic,
        playSfx,
        restore,
        syncMusicToggleUi,
        setLightsOn,
        syncLightBuzz,
        activateAudio,
        registerAudioUnlock(unlock) {
            audioUnlockers.add(unlock);
            return () => audioUnlockers.delete(unlock);
        },
    };
};

export const bindViewport = ({ camera, renderer, stage, onResize } = {}) => {
    const syncViewportSize = () => {
        const host = stage || document.getElementById("stage");
        const w = Math.max(1, host.clientWidth);
        const h = Math.max(1, host.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        if (typeof onResize === "function")
            onResize();
    };
    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);
    window.addEventListener("orientationchange", () => setTimeout(syncViewportSize, 150));
    const host = stage || document.getElementById("stage");
    if (host) {
        host.addEventListener("fullscreenchange", syncViewportSize);
        host.addEventListener("webkitfullscreenchange", syncViewportSize);
    }
    return syncViewportSize;
};

export const bindWindowedToggle = ({ syncViewportSize } = {}) => {
    const toggleWindowed = () => {
        document.body.classList.toggle("is-windowed");
        if (typeof syncViewportSize === "function")
            syncViewportSize();
    };
    document.addEventListener("keydown", (e) => {
        if (e.key !== "f" && e.key !== "F")
            return;
        if (e.target.closest("input, textarea, [contenteditable]"))
            return;
        e.preventDefault();
        toggleWindowed();
    });
    return toggleWindowed;
};

export const bindOrbitPointer = ({ canvas, camera, clickable, onHit, dragSens = 0.005, dragThreshold = 4, getAngle, setAngle, } = {}) => {
    let angle = typeof getAngle === "function" ? getAngle() : 0;
    const readAngle = () => typeof getAngle === "function" ? getAngle() : angle;
    const writeAngle = (a) => {
        angle = a;
        if (typeof setAngle === "function")
            setAngle(a);
    };
    let dragging = false;
    let didDrag = false;
    let lastX = 0;
    let totalDrag = 0;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    canvas.style.cursor = "grab";
    // Suppress native long-press selection/menu behavior only on the room canvas.
    canvas.addEventListener("selectstart", event => event.preventDefault());
    canvas.addEventListener("contextmenu", event => event.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 0)
            return;
        dragging = true;
        didDrag = false;
        lastX = e.clientX;
        totalDrag = 0;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", (e) => {
        if (!dragging) {
            const rect = canvas.getBoundingClientRect();
            pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            const hits = raycaster.intersectObjects(clickable);
            canvas.style.cursor = hits.length ? "pointer" : "grab";
            return;
        }
        const dx = e.clientX - lastX;
        totalDrag += Math.abs(dx);
        if (totalDrag > dragThreshold)
            didDrag = true;
        lastX = e.clientX;
        writeAngle(readAngle() + dx * dragSens);
    });
    const endDrag = (e) => {
        if (!dragging)
            return;
        dragging = false;
        canvas.style.cursor = "grab";
        try {
            canvas.releasePointerCapture(e.pointerId);
        }
        catch (_) { }
        if (didDrag || e.type === "pointercancel")
            return;
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(clickable);
        if (!hits.length)
            return;
        if (typeof onHit === "function")
            onHit(hits[0].object);
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    return {
        getAngle: readAngle,
        setAngle: writeAngle,
        isDragging: () => dragging,
    };
};

const VIEW_FACING_KEY = "y9k-view-facing";

const VIEW_FACINGS = new Set(["north", "south", "east", "west"]);

export const viewFacingToAngle = (facing) => {
    switch (facing) {
        case "north":
            return 0;
        case "south":
            return Math.PI;
        case "east":
            return -Math.PI / 2;
        case "west":
            return Math.PI / 2;
        default:
            return 0;
    }
};

export const readStoredViewFacing = (fallback = "north") => {
    try {
        const v = localStorage.getItem(VIEW_FACING_KEY);
        if (v && VIEW_FACINGS.has(v))
            return v;
    }
    catch (_) { }
    return VIEW_FACINGS.has(fallback) ? fallback : "north";
};

export const writeStoredViewFacing = (facing) => {
    if (!VIEW_FACINGS.has(facing))
        return;
    try {
        localStorage.setItem(VIEW_FACING_KEY, facing);
    }
    catch (_) { }
};

const DEFAULT_DOOR_LOCKED_SOUND = roomAsset("music/door-soft-complete.mp3");
const DEFAULT_DOOR_UNLOCKED_SOUND = roomAsset("music/door-soft-complete.mp3");
const DEFAULT_LIGHT_SWITCH_SOUND = new URL("./assets/rooms/audio/light-switch.wav", import.meta.url).href;
const DEFAULT_PAGE_SFX = roomAsset("music/page-3.mp3");

export const createRoomApp = ({ musicPath, musicVolume = 0.25, lightBuzzPath = null, lightBuzzVolume = 0.2, camY = null, orbitRadius = 1.4, lookAtY = null, heightFromFloor = DEFAULT_CAMERA_HEIGHT_FROM_FLOOR, lookAtHeightFromFloor = null, floorY = -DEFAULT_ROOM_HEIGHT / 2, autoSpin = 0.00035, background = 0x111111, enableLightbox = false, enableVideoLightbox = false, lightboxSfxVolume = 1, doorLockedSound = DEFAULT_DOOR_LOCKED_SOUND, doorUnlockedSound = DEFAULT_DOOR_UNLOCKED_SOUND, lightSwitchSound = DEFAULT_LIGHT_SWITCH_SOUND, pageSfx = DEFAULT_PAGE_SFX, ambientLight = 0.05, directionalLight = 0.04, directionalPosition = [1, 3, 2], lightsOn = true, onHit = null, onFrame = null, } = {}) => {
    const resolveCamY = (fromFloor, floor) => camY != null ? camY : floor + fromFloor;
    const resolveLookAtY = (fromFloor, lookFromFloor, floor) => lookAtY != null
        ? lookAtY
        : floor + (lookFromFloor ?? fromFloor);
    let viewFloorY = floorY;
    let viewHeightFromFloor = heightFromFloor;
    let viewLookAtHeightFromFloor = lookAtHeightFromFloor;
    let resolvedCamY = resolveCamY(viewHeightFromFloor, viewFloorY);
    let resolvedLookAtY = resolveLookAtY(viewHeightFromFloor, viewLookAtHeightFromFloor, viewFloorY);
    const canvas = document.createElement("canvas");
    const stage = document.getElementById("stage");
    if (!stage)
        throw new Error("createRoomApp: #stage not found");
    stage.appendChild(canvas);
    const music = createMusicControls({
        musicPath,
        volume: musicVolume,
        lightBuzzPath,
        lightBuzzVolume,
        initialLightsOn: lightsOn,
    });
    const lightbox = enableLightbox
        ? setupLightbox({ sfxVolume: lightboxSfxVolume })
        : null;
    const videoLightbox = enableVideoLightbox
        ? setupVideoLightbox({ stage })
        : null;
    if (lightbox)
        music.registerAudioUnlock(lightbox.unlockAudio);
    const clickable = [];
    let angle = viewFacingToAngle(readStoredViewFacing("north"));
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    if (background != null) {
        scene.background = new THREE.Color(background);
    }
    const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, resolvedCamY, 0);
    const textureLoader = new THREE.TextureLoader();
    const syncViewportSize = bindViewport({
        camera,
        renderer,
        stage,
        onResize: () => {
            if (lightbox)
                lightbox.remeasure();
        },
    });
    bindWindowedToggle({ syncViewportSize });
    initDevMode({ stage });
    const ambient = new THREE.AmbientLight(0xffffff, ambientLight);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, directionalLight);
    dir.position.set(...directionalPosition);
    scene.add(dir);
    const roomLights = createRoomLights({
        ambient,
        directional: dir,
        scene,
        isOn: lightsOn,
        offIntensity: { ambient: 0.05, directional: 0.04 },
        offBackground: 0x111111,
        onChange: (on) => music.setLightsOn(on),
    });
    music.setLightsOn(lightsOn);
    const defaultOnHit = (obj) => {
        if (obj.userData.isVideoScreen) {
            const url = obj.userData.videoUrl;
            if (url && videoLightbox)
                videoLightbox.open(url);
            return;
        }
        if (obj.userData.isLightSwitch) {
            if (obj.userData.isDisabled !== false) {
                music.playSfx(lightSwitchSound);
                return;
            }
            roomLights.toggle();
            music.playSfx(lightSwitchSound);
            return;
        }
        if (obj.userData.isDoor) {
            if (obj.userData.locked) {
                music.playSfx(doorLockedSound);
                return;
            }
            const href = obj.userData.href;
            const wall = obj.userData.wall;
            if (typeof wall === "string")
                writeStoredViewFacing(wall);
            music.playSfx(doorUnlockedSound).then(() => {
                if (href)
                    window.location.href = href;
            });
            return;
        }
        if (obj.userData.imageFile && lightbox) {
            lightbox.open(obj.userData.imageFile, music.isSoundOn(), obj.userData.imageName || null, { source: obj });
        }
    };
    const orbit = bindOrbitPointer({
        canvas,
        camera,
        clickable,
        onHit: typeof onHit === "function" ? onHit : defaultOnHit,
        getAngle: () => angle,
        setAngle: (a) => {
            angle = a;
        },
    });
    if (lightbox) {
    }
    const wallClick = createWallClickHelper({ canvas, camera, stage, scene });
    const setViewHeight = ({ floorY: nextFloorY = viewFloorY, heightFromFloor: nextHff = viewHeightFromFloor, lookAtHeightFromFloor: nextLookHff = viewLookAtHeightFromFloor, } = {}) => {
        viewFloorY = nextFloorY;
        viewHeightFromFloor = nextHff;
        viewLookAtHeightFromFloor = nextLookHff;
        resolvedCamY = resolveCamY(viewHeightFromFloor, viewFloorY);
        resolvedLookAtY = resolveLookAtY(viewHeightFromFloor, viewLookAtHeightFromFloor, viewFloorY);
        camera.position.y = resolvedCamY;
    };
    const startLoop = () => {
        let previousTime = performance.now();
        const loop = (time = performance.now()) => {
            const delta = Math.min(Math.max((time - previousTime) / 1000, 0), 0.1);
            previousTime = time;
            const keyboardActive = onFrame?.(delta) === true;
            if (!orbit.isDragging() && !keyboardActive)
                angle += autoSpin;
            camera.position.x = Math.sin(angle) * orbitRadius;
            camera.position.y = resolvedCamY;
            camera.position.z = Math.cos(angle) * orbitRadius;
            camera.lookAt(0, resolvedLookAtY, 0);
            renderer.render(scene, camera);
            requestAnimationFrame(loop);
        };
        loop();
    };
    const createPropFactories = ({ roomHalfY, walls, doorHeight = 3.2 } = {}) => ({
        addElectricalBox: createAddElectricalBox({
            scene,
            textureLoader,
            roomHalfY,
        }),
        addExitSign: createAddExitSign({ scene, textureLoader, roomHalfY }),
        addFoldingChairs: createAddFoldingChairs({
            scene,
            textureLoader,
            roomHalfY,
        }),
        addBoxStack: createAddBoxStack({ scene, textureLoader, roomHalfY }),
        addLightSwitch: createAddLightSwitch({
            scene,
            textureLoader,
            roomHalfY,
            doorHeight,
            clickable,
        }),
        addLightFixture: createAddLightFixture({
            scene,
            textureLoader,
            roomHalfY,
        }),
        addVent: walls
            ? createAddVent({ scene, textureLoader, roomHalfY, walls })
            : null,
    });
    const enableDevWallUpload = ({ bounds, floorY: uploadFloorY = viewFloorY, ceilingY, roomHalfY = -uploadFloorY, wallInset = 0.05, heightFromFloor = DEFAULT_ART_HEIGHT_FROM_FLOOR, defaultWidth = DEFAULT_USER_ART_WIDTH, roomId = typeof location !== "undefined" ? location.pathname : "/", persist = true, store = null, } = {}) => {
        if (!bounds) {
            console.warn("enableDevWallUpload: bounds are required");
            return {
                button: null,
                input: null,
                addUserWallImage: null,
                session: null,
                ready: Promise.resolve(),
            };
        }
        const resolvedCeilingY = ceilingY != null ? ceilingY : uploadFloorY + DEFAULT_ROOM_HEIGHT;
        const addUserWallImage = createAddUserWallImage({
            scene,
            textureLoader,
            roomHalfY,
            floorY: uploadFloorY,
            ceilingY: resolvedCeilingY,
            heightFromFloor,
            clickable,
            bounds,
            wallInset,
        });
        const placementStore = persist === false
            ? null
            : store || createLocalPlacementStore();
        const session = placementStore
            ? createUserArtSession({
                store: placementStore,
                roomId,
                addUserWallImage,
                clickable,
                bounds,
                floorY: uploadFloorY,
                ceilingY: resolvedCeilingY,
                wallInset,
            })
            : null;
        const ui = initDevWallUpload({
            wallClick,
            addUserWallImage,
            clickable,
            session,
            floorY: uploadFloorY,
            ceilingY: resolvedCeilingY,
            bounds,
            wallInset,
            stage,
            defaultWidth,
            playAppearSfx: () => music.playSfx(pageSfx, lightboxSfxVolume),
        });
        if (lightbox && typeof lightbox.setUserArtDeleteHandler === "function") {
            lightbox.setUserArtDeleteHandler(async (art) => {
                if (session) {
                    await session.forget(art);
                }
                else {
                    removeUserWallImage(art, { clickable });
                }
                ui.handleArtRemoved?.(art);
            });
        }
        return { ...ui, addUserWallImage, session };
    };
    return {
        THREE,
        canvas,
        stage,
        renderer,
        scene,
        camera,
        textureLoader,
        clickable,
        music,
        lightbox,
        videoLightbox,
        wallClick,
        orbit,
        roomLights,
        syncViewportSize,
        setViewHeight,
        startLoop,
        createPropFactories,
        enableDevWallUpload,
        playDoorSound: music.playSfx,
        doorLockedSound,
        doorUnlockedSound,
        get camY() {
            return resolvedCamY;
        },
        get lookAtY() {
            return resolvedLookAtY;
        },
        get heightFromFloor() {
            return viewHeightFromFloor;
        },
        get floorY() {
            return viewFloorY;
        },
    };
};

export const loadMapOntoMaterial = (textureLoader, material, imageFile, { repeatX = 1, repeatY = 1, color = 0xffffff } = {}) => {
    textureLoader.load(imageFile, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
        material.map = tex;
        material.color.set(color);
        material.needsUpdate = true;
    });
};

const ROOM_STYLES = `
html, body {
    justify-content: center;
    align-items: center;
    overflow: hidden;
    display: flex;
    background: #000;
    width: 100%;
    height: 100%;
    margin: 0;
}

canvas,
#stage {
    width: 100vw;
    height: 100vh;
}
#stage {
    position: relative;
}
#stage canvas {
    image-rendering: crisp-edges;
    image-rendering: pixelated;
    display: block;
    width: 100%;
    height: 100%;
}
#overlay {
    position: absolute;
    pointer-events: none;
    padding: 0px 25px;
    color: #fff;
    z-index: 1;
    inset: 0;
}
#overlay h1 {
    margin: 1rem 0;
    text-shadow: 5px 5px 0 #ffffff66,
    10px 10px 0 #ffffff33,
    15px 15px 0 #ffffff11;
    background-color: rgba(100, 149, 237, .8);
    width: fit-content;
}
#overlay h1, 
#overlay h2, 
#overlay p, 
#overlay a {
    pointer-events: auto;
    user-select: text;
    -webkit-user-select: text;
    font-weight: 100;
}
#lightbox {
    background: rgba(0, 0, 0, 0);
    justify-content: center;
    pointer-events: auto;
    align-items: center;
    position: absolute;
    cursor: pointer;
    display: none;
    inset: 0;
    z-index: 2;
    overflow: hidden;
}
#lightbox.is-open {
    display: flex;
}
.lightbox-frame {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: fit-content;
    max-width: 85%;
    max-height: 85%;
    margin: auto;
    pointer-events: none;
}

.lightbox-stage {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: fit-content;
    max-width: 100%;
    pointer-events: auto;
    transform-origin: center center;
    will-change: transform;
    touch-action: none;
}
#lightbox img {
    display: block;
    pointer-events: auto;
    cursor: grab;
    object-fit: contain;
    max-width: calc(0.85 * 100vw);
    max-height: calc(0.85 * 100vh);
    user-select: none;
    -webkit-user-select: none;
}
#lightbox.is-zoomed .lightbox-stage { cursor: grab; }
#lightbox .lightbox-stage.is-panning,
#lightbox img:active { cursor: grabbing; }
#lightbox-caption {
    display: block;
    margin-top: 10px;
    font-size: 14px;
    color: revert;
    text-decoration: underline;
    pointer-events: auto;
    cursor: pointer;
    background-color: yellow;
    align-self: flex-start;
    text-align: left;
}


#video-lightbox {
    background: rgba(0, 0, 0, 0);
    justify-content: center;
    align-items: center;
    position: absolute;
    cursor: pointer;
    display: none;
    inset: 0;
    z-index: 3;
    overflow: hidden;
}
#video-lightbox.is-open {
    display: flex;
}
.video-lightbox-frame {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(960px, 90vw);
    max-height: 85vh;
    margin: auto;
    pointer-events: none;
}
.video-lightbox-stage {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #000;
    pointer-events: auto;
}
.video-lightbox-stage iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
    background: #000;
}
#video-lightbox-caption {
    display: block;
    margin-top: 10px;
    font-size: 14px;
    color: revert;
    text-decoration: underline;
    pointer-events: auto;
    cursor: pointer;
    background-color: yellow;
    align-self: flex-start;
    text-align: left;
}
body.is-windowed #video-lightbox .video-lightbox-frame {
    width: min(860px, 90%);
}
#music-toggle,
#dev-toggle {
    position: absolute;
    bottom: 15px;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 35px;
    line-height: 1;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    z-index: 1;
}
#music-toggle {
    right: 15px;
}
#dev-toggle {
    left: 15px;
    opacity: 0.4;
}
#dev-toggle.is-on {
    opacity: 1;
}
#wall-click-hud {
    display: none;
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    width: fit-content;
    z-index: 10;
    margin: 0;
    padding: 10px 16px;
    border: none;
    border-radius: 0;
    background: #fff;
    color: red;
    font-family: serif;
    font-weight: 100;
    font-size: 10px;
    letter-spacing: 0.02em;
    line-height: 1.3;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    box-sizing: border-box;
}
body.is-dev-mode #wall-click-hud {
    display: block;
}
#dev-wall-upload-panel {
    display: none;
    position: absolute;
    left: 16px;
    bottom: 52px;
    z-index: 10;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    pointer-events: auto;
}
body.is-dev-mode #dev-wall-upload-panel {
    display: flex;
}
#dev-wall-upload-actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
}
#dev-wall-upload:disabled,
#dev-wall-upload-delete:disabled,
#dev-wall-upload-reset:disabled {
    opacity: 0.35;
}
#lightbox-delete {
    display: none;
    margin-top: 8px;
    pointer-events: auto;
}
body.is-dev-mode #lightbox.has-user-art-delete #lightbox-delete {
    display: inline-block;
}
.dev-wall-upload-slider-row {
    display: flex;
    align-items: center;
    gap: 6px;
}
.dev-wall-upload-slider-row.is-disabled {
    opacity: 0.35;
}
.dev-wall-upload-slider-row input[type="range"] {
    width: 100px;
}

body.is-windowed #stage,
body.is-windowed canvas {
    width: min(100vw, 960px);
    height: min(100vh, 540px);
}
body.is-windowed #lightbox img {
    max-width: calc(0.85 * min(100vw, 960px));
    max-height: calc(0.85 * min(100vh, 540px));
}


#stage:fullscreen,
#stage:-webkit-full-screen {
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
}
#stage:fullscreen canvas,
#stage:-webkit-full-screen canvas {
    width: 100%;
    height: 100%;
}

`;
