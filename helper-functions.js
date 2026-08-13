/**
 * Consolidated room helpers for y9k.
 * Copies existing module logic plus room-shell APIs (layout, doors, music, orbit, bootstrap).
 * Existing per-module files remain untouched; new rooms can import only from here.
 */
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

// =============================================================================
// Audio activate
// =============================================================================

const SOUND_PREF_KEY = "y9k-sound-on";

const readUnmuted = (soundPrefKey) => {
    try {
        const v = localStorage.getItem(soundPrefKey);
        return v === "1" || v === "true";
    } catch {
        return false;
    }
};

/**
 * @param {object} opts
 * @param {() => HTMLAudioElement} opts.ensureMusicAudio
 * @param {() => void|Promise<void>} [opts.afterActivate]
 *   Extra layers (e.g. light buzz) to start after music, if unmuted.
 * @param {string} [opts.soundPrefKey]
 * @returns {() => Promise<void>} checkAndActivateAudio
 */
export function createCheckAndActivateAudio({
    ensureMusicAudio,
    afterActivate = null,
    soundPrefKey = SOUND_PREF_KEY,
}) {
    /**
     * If localStorage says audio is unmuted, start background music
     * when it is not already playing. No-op when muted.
     */
    return async function checkAndActivateAudio() {
        if (!readUnmuted(soundPrefKey)) return;

        const a = ensureMusicAudio();
        if (a.paused) {
            try {
                await a.play();
            } catch (_) {
                // Still blocked or failed; a later gesture may retry if re-bound.
            }
        }
        if (typeof afterActivate === "function") {
            try {
                await afterActivate();
            } catch (_) {}
        }
    };
}

/** Run `fn` once on the first pointerdown anywhere in the page. */
export function runOnFirstPointerDown(fn) {
    const handler = () => {
        window.removeEventListener("pointerdown", handler, true);
        fn();
    };
    window.addEventListener("pointerdown", handler, true);
}


// =============================================================================
// Dev mode
// =============================================================================

const DEV_PREF_KEY = "y9k-dev-mode";

const readDevPref = () => {
    try {
        const v = localStorage.getItem(DEV_PREF_KEY);
        if (v === null) return false;
        return v === "1" || v === "true";
    } catch {
        return false;
    }
};

const writeDevPref = (on) => {
    try {
        localStorage.setItem(DEV_PREF_KEY, on ? "1" : "0");
    } catch (_) {}
};

let IS_DEV_MODE = readDevPref();

export const isDevMode = () => IS_DEV_MODE;

/**
 * Temporary bottom-left gear control. Toggles developer mode
 * (body.is-dev-mode) and persists to localStorage. Use is-dev-mode
 * in CSS/JS to show or hide upcoming debug UI — does not change layout.
 *
 * @param {object} [opts]
 * @param {HTMLElement} [opts.stage]  Defaults to #stage
 * @param {() => void} [opts.onChange] Called after applying mode
 * @returns {{ button: HTMLButtonElement, isDevMode: () => boolean, setDevMode: (on: boolean) => void }}
 */
export function initDevMode({ stage, onChange } = {}) {
    const host = stage || document.getElementById("stage");
    if (!host) {
        console.warn("initDevMode: #stage not found");
        return { button: null, isDevMode, setDevMode: () => {} };
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
        button.setAttribute(
            "aria-label",
            on ? "exit developer mode" : "enter developer mode"
        );
        writeDevPref(on);
        if (typeof onChange === "function") onChange();
    };

    const setDevMode = (on) => apply(!!on);

    button.addEventListener("click", (e) => {
        e.stopPropagation();
        setDevMode(!IS_DEV_MODE);
    });

    apply(IS_DEV_MODE);

    return { button, isDevMode, setDevMode };
}


// =============================================================================
// Lightbox
// =============================================================================

/**
 * Lightbox with open/close + zoom/pan/pinch/double-tap.
 * Public surface: setupLightbox() → { open, close, isOpen, remeasure }
 *
 * @param {object} [options]
 * @param {HTMLElement} [options.root]
 * @param {string} [options.sfxPath]
 * @param {number} [options.sfxVolume] 0..1
 */
export function setupLightbox({
    root = document.getElementById("lightbox"),
    sfxPath = "music/page-3.mp3",
    sfxVolume = 0.5,
} = {}) {
    if (!root) throw new Error("setupLightbox: #lightbox not found");

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
            if (!Ctx) return null;
            audioCtx = new Ctx();
        }
        if (audioCtx.state === "suspended") {
            audioCtx.resume().catch(() => {});
        }
        return audioCtx;
    };

    // Decode once and keep in memory so open/close has no fetch/decode delay.
    (async () => {
        try {
            const res = await fetch(sfxPath);
            const data = await res.arrayBuffer();
            const ctx = ensureAudioCtx();
            if (!ctx) return;
            sfxBuffer = await ctx.decodeAudioData(data.slice(0));
        } catch (_) {}
    })();

    const playOpenSfx = () => {
        const ctx = ensureAudioCtx();
        if (!ctx || !sfxBuffer) return;
        const start = () => {
            try {
                const src = ctx.createBufferSource();
                const gain = ctx.createGain();
                src.buffer = sfxBuffer;
                gain.gain.value = sfxGain;
                src.connect(gain);
                gain.connect(ctx.destination);
                src.start(0);
            } catch (_) {}
        };
        if (ctx.state === "running") start();
        else ctx.resume().then(start).catch(() => {});
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

    const touchDist = (a, b) =>
        Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

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
        if (!panning) return;
        e.preventDefault();
        const dx = e.clientX - panLastX;
        const dy = e.clientY - panLastY;
        if (Math.hypot(dx, dy) > 2) didPan = true;
        panLastX = e.clientX;
        panLastY = e.clientY;
        panX += dx;
        panY += dy;
        apply();
    };

    const onPanEnd = e => {
        if (!panning) return;
        panning = false;
        stage.classList.remove("is-panning");
        window.removeEventListener("pointermove", onPanMove);
        window.removeEventListener("pointerup", onPanEnd);
        window.removeEventListener("pointercancel", onPanEnd);
        try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
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
        if (!fitW) measureFit();
        if (scale > 1.05) {
            scale = 1;
            panX = 0;
            panY = 0;
        } else {
            scale = maxScale;
            panX = 0;
            panY = 0;
        }
        apply();
    };

    const startPan = e => {
        if (scale <= 1) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (e.target === caption || e.target.closest("#lightbox-caption")) return;
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
        try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    };

    function open(imageFile, isSoundOn = false, displayName = null, opts = {}) {
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
        const label =
            displayName ||
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
    }

    function close(_isSoundOn = false) {
        if (!isOpen()) return;
        root.classList.remove("is-open");
        root.setAttribute("aria-hidden", "true");
        img.onload = null;
        img.removeAttribute("src");
        caption.removeAttribute("href");
        caption.textContent = "";
        currentSource = null;
        syncDeleteButton();
        resetZoom();
    }

    function isOpen() {
        return root.classList.contains("is-open");
    }

    /** Re-measure fit after resize / fullscreen; keeps current zoom if possible. */
    function remeasure() {
        if (!isOpen()) return;
        const prevScale = scale;
        const prevPanX = panX;
        const prevPanY = panY;
        measureFit();
        scale = prevScale;
        panX = prevPanX;
        panY = prevPanY;
        apply();
    }

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
        if (!isOpen()) return;
        if (!fitW) measureFit();
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
            if (!fitW) measureFit();
            pinchStartDist = touchDist(e.touches[0], e.touches[1]);
            pinchStartScale = scale;
            panning = false;
        } else if (e.touches.length === 1 && scale > 1) {
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
        } else if (e.touches.length === 1 && panning && scale > 1) {
            e.preventDefault();
            const t = e.touches[0];
            const dx = t.clientX - panLastX;
            const dy = t.clientY - panLastY;
            if (Math.hypot(dx, dy) > 2) didPan = true;
            panLastX = t.clientX;
            panLastY = t.clientY;
            panX += dx;
            panY += dy;
            apply();
        }
    }, { passive: false });

    root.addEventListener("touchend", e => {
        if (e.touches.length < 2) pinchStartDist = 0;
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
                } else {
                    lastTapTime = now;
                    lastTapX = t.clientX;
                    lastTapY = t.clientY;
                }
            }
        }
    }, { passive: false });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape") close();
    });

    /** @type {THREE.Object3D|null} */
    let currentSource = null;
    /** @type {((art: THREE.Object3D) => void|Promise<void>)|null} */
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
        const canDelete =
            isDevMode() &&
            !!currentSource?.userData?.isUserArt &&
            typeof userArtDeleteHandler === "function";
        deleteBtn.hidden = !canDelete;
        deleteBtn.disabled = !canDelete;
        root.classList.toggle("has-user-art-delete", canDelete);
    };

    deleteBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (deleteBtn.disabled || !currentSource || !userArtDeleteHandler) return;
        const art = currentSource;
        Promise.resolve(userArtDeleteHandler(art))
            .catch((err) => console.warn("lightbox delete failed", err))
            .finally(() => {
                close(IS_SOUND_ON);
            });
    });

    const moDev = new MutationObserver(syncDeleteButton);
    moDev.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    /**
     * Wire delete for user-uploaded art (dev mode). Handler should remove
     * the mesh and IndexedDB record (e.g. session.forget).
     * @param {((art: THREE.Object3D) => void|Promise<void>)|null} fn
     */
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
        getCurrentSource: () => currentSource,
    };
}

/**
 * Parse a YouTube watch / share / embed URL into a video id.
 * @param {string} url
 * @returns {string|null}
 */
export function youtubeIdFromUrl(url) {
    if (!url || typeof url !== "string") return null;
    try {
        const u = new URL(url.trim());
        const host = u.hostname.replace(/^www\./, "");
        if (host === "youtu.be") {
            const id = u.pathname.split("/").filter(Boolean)[0];
            return id || null;
        }
        if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
            if (u.pathname === "/watch") return u.searchParams.get("v");
            const parts = u.pathname.split("/").filter(Boolean);
            if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") {
                return parts[1] || null;
            }
        }
    } catch (_) {
        // Fall through to regex.
    }
    const m = url.match(
        /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/
    );
    return m ? m[1] : null;
}

/**
 * Simple YouTube embed lightbox. Creates #video-lightbox under #stage if missing.
 * Public surface: setupVideoLightbox() → { open, close, isOpen }
 *
 * @param {object} [options]
 * @param {HTMLElement} [options.stage]
 * @param {HTMLElement} [options.root]
 */
export function setupVideoLightbox({
    stage = document.getElementById("stage"),
    root = document.getElementById("video-lightbox"),
} = {}) {
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
    const caption =
        el.querySelector("#video-lightbox-caption") ||
        el.querySelector(".video-lightbox-caption");
    if (!iframe) throw new Error("setupVideoLightbox: expected iframe");

    // Upgrade an older markup shell that was created without a caption.
    let captionEl = caption;
    if (!captionEl) {
        captionEl = document.createElement("a");
        captionEl.id = "video-lightbox-caption";
        captionEl.target = "_blank";
        captionEl.rel = "noopener noreferrer";
        const frame = el.querySelector(".video-lightbox-frame");
        if (frame) frame.appendChild(captionEl);
    }

    const isOpen = () => el.classList.contains("is-open");

    const close = () => {
        if (!isOpen()) return;
        el.classList.remove("is-open");
        el.setAttribute("aria-hidden", "true");
        // Clear src so playback stops.
        iframe.removeAttribute("src");
        captionEl.removeAttribute("href");
        captionEl.textContent = "";
    };

    /**
     * @param {string} videoUrl  YouTube watch/share/embed URL or bare id
     * @param {object} [opts]
     * @param {boolean} [opts.autoplay=true]
     */
    const open = (videoUrl, { autoplay = true } = {}) => {
        const id =
            youtubeIdFromUrl(videoUrl) ||
            (/^[A-Za-z0-9_-]{6,}$/.test(videoUrl) ? videoUrl : null);
        if (!id) {
            console.warn(
                "setupVideoLightbox.open: could not parse YouTube id from",
                videoUrl
            );
            return;
        }
        const params = new URLSearchParams({
            rel: "0",
            modestbranding: "1",
        });
        if (autoplay) params.set("autoplay", "1");
        iframe.src = `https://www.youtube.com/embed/${id}?${params.toString()}`;

        const watchUrl =
            typeof videoUrl === "string" && /youtu/.test(videoUrl)
                ? videoUrl
                : `https://www.youtube.com/watch?v=${id}`;
        captionEl.href = watchUrl;
        captionEl.textContent = watchUrl;

        el.classList.add("is-open");
        el.setAttribute("aria-hidden", "false");
    };

    el.addEventListener("click", (e) => {
        // Click backdrop (not the iframe/frame/caption) closes.
        if (e.target === el) close();
    });

    const frame = el.querySelector(".video-lightbox-frame");
    if (frame) {
        frame.addEventListener("click", (e) => {
            if (e.target === frame) close();
        });
    }

    captionEl.addEventListener("click", (e) => e.stopPropagation());

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isOpen()) close();
    });

    return { open, close, isOpen, root: el };
}


// =============================================================================
// Molding
// =============================================================================


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
 * @param {number} [floorY=-roomHeight/2]  World Y of the floor (for non-centered rooms)
 */
export function addHallMolding(
    scene,
    outline,
    roomHeight,
    color = MOLDING_COLOR,
    floorY = -roomHeight / 2
) {
    const ceilingY = floorY + roomHeight;
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
        base.position.set(cx + ox, floorY + BASE_HEIGHT / 2, cz + oz);
        base.rotation.y = rotY;
        scene.add(base);

        const crown = new THREE.Mesh(
            new THREE.BoxGeometry(runLen, CROWN_HEIGHT, DEPTH),
            mat
        );
        crown.position.set(cx + ox, ceilingY - CROWN_HEIGHT / 2, cz + oz);
        crown.rotation.y = rotY;
        scene.add(crown);
    }
}


// =============================================================================
// Wall click
// =============================================================================


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

    /** @type {ReturnType<typeof describeHit>|null} */
    let lastHitInfo = null;
    /** @type {((info: NonNullable<ReturnType<typeof describeHit>>) => void)|null} */
    let wallPickHandler = null;

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

        lastHitInfo = info;

        if (hud) {
            hud.textContent = line;
            hud.dataset.hasCoords = "1";
        }

        // Crosshair is a developer-mode visual only; still move it while on.
        if (isDevMode()) placeCrosshair(hit);

        if (typeof wallPickHandler === "function") wallPickHandler(info);
    };;

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
        getLastHit: () => lastHitInfo,
        onWallPick: (fn) => {
            wallPickHandler = typeof fn === "function" ? fn : null;
        },
    };
}


// =============================================================================
// Electrical box
// =============================================================================


const DEFAULT_HEIGHT_FROM_FLOOR = 1.1;
const DEFAULT_BOX_HEIGHT = 0.95;
const DEFAULT_BOX_COLOR = 0xb4b4b4;
const BOX_DEPTH = 0.14;
const CONDUIT_RADIUS = 0.032;

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY  Half the room height (ceiling at +roomHalfY, floor at -roomHalfY)
 * @returns {typeof addElectricalBox}
 */
export function createAddElectricalBox({ scene, textureLoader, roomHalfY }) {
    /**
     * Wall-mounted electrical box with conduit tubes to the ceiling.
     * `x` / `y` are floorplan coordinates on the wall surface (y → world Z).
     * `direction` is the wall the box is mounted on (face points into the room).
     */
    return function addElectricalBox(
        direction,
        x,
        y,
        imageFile,
        heightFromFloor = DEFAULT_HEIGHT_FROM_FLOOR,
        boxWidth,
        boxHeight = DEFAULT_BOX_HEIGHT,
        boxColor = DEFAULT_BOX_COLOR,
    ) {
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
            // BoxGeometry materials: +x, -x, +y, -y, +z, -z — texture on +z (front).
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                [metalMat, metalMat, metalMat, metalMat, faceMat, metalMat]
            );

            const boxY = -roomHalfY + heightFromFloor + h / 2;
            let bx = x;
            let bz = y;
            // Unit vector from wall into the room (face forward).
            let fx = 0;
            let fz = 0;

            if (direction === "north") {
                // On -Z wall; face +Z into room.
                box.rotation.y = 0;
                bz = y + d / 2;
                fz = 1;
            } else if (direction === "south") {
                box.rotation.y = Math.PI;
                bz = y - d / 2;
                fz = -1;
            } else if (direction === "west") {
                box.rotation.y = Math.PI / 2;
                bx = x + d / 2;
                fx = 1;
            } else if (direction === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = x - d / 2;
                fx = -1;
            } else {
                console.warn("Invalid electrical box direction:", direction);
                return;
            }

            box.position.set(bx, boxY, bz);
            scene.add(box);

            const conduitMat = new THREE.MeshStandardMaterial({ color: boxColor });
            const topOfBox = boxY + h / 2;
            const conduitLen = roomHalfY - topOfBox;
            if (conduitLen <= 0) return;

            const conduitY = topOfBox + conduitLen / 2;
            // Sit conduits toward the wall side of the box top.
            const cx = bx - fx * d * 0.15;
            const cz = bz - fz * d * 0.15;
            const along = w * 0.22;

            for (const sign of [-1, 1]) {
                const tube = new THREE.Mesh(
                    new THREE.CylinderGeometry(CONDUIT_RADIUS, CONDUIT_RADIUS, conduitLen, 12),
                    conduitMat
                );
                if (direction === "north" || direction === "south") {
                    tube.position.set(cx + sign * along, conduitY, cz);
                } else {
                    tube.position.set(cx, conduitY, cz + sign * along);
                }
                scene.add(tube);
            }
        });
    };
}


// =============================================================================
// Exit sign
// =============================================================================


const EXIT_DEFAULT_IMAGE = "images/static_images/exit-1.jpg";
const EXIT_DEFAULT_BOX_HEIGHT = 0.22;
const EXIT_DEFAULT_BOX_COLOR = 0x3a3a3a;
const EXIT_DEFAULT_CEILING_GAP = 0.14;
const EXIT_BOX_DEPTH = 0.05;

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
            const d = EXIT_BOX_DEPTH;

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
                b ?? EXIT_DEFAULT_IMAGE,
                c,
                d ?? EXIT_DEFAULT_BOX_HEIGHT,
                e ?? EXIT_DEFAULT_BOX_COLOR,
                f ?? EXIT_DEFAULT_CEILING_GAP,
            );
            return;
        }

        place(
            doorOrDirection,
            b,
            c,
            d ?? EXIT_DEFAULT_IMAGE,
            e,
            f ?? EXIT_DEFAULT_BOX_HEIGHT,
            g ?? EXIT_DEFAULT_BOX_COLOR,
            h ?? EXIT_DEFAULT_CEILING_GAP,
        );
    };
}


// =============================================================================
// Folding chairs
// =============================================================================


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


// =============================================================================
// Box stack
// =============================================================================


const FACE_IMAGE = "images/static_images/box-face.jpg";
const SIDE_IMAGE = "images/static_images/box-side.jpg";

// Bankers-box proportions, scaled to sit beside the oversized chair billboards.
// BOX_W spans the box-face (±Z); BOX_D is the long side (±X after the +90° yaw).
export const BOX_W = 0.72;
export const BOX_D = 0.92;
export const BOX_H = 0.56;
const TOP_COLOR = 0xdedede;
const FACE_TINT = 0xc4c4c4;
const WALL_FLUSH_PULL = 0.05;
const YAW = Math.PI / 2;
/** Peak yaw wobble per box (~2.5–5°). */
const WOBBLE_MIN = 0.042;
const WOBBLE_MAX = 0.09;

const prepTex = tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
};

/** Deterministic 0..1 from floorplan coords. */
const seed01 = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
};

const seed01n = (x, y, n) => seed01(x + n * 19.17, y - n * 7.31);

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY
 */
export function createAddBoxStack({ scene, textureLoader, roomHalfY }) {
    /**
     * Stack of bankers boxes against a wall.
     * `x` / `y` are floorplan wall coordinates (y → world Z).
     * `direction` is the wall they sit against.
     * `stackHeight` is how many boxes tall.
     */
    return function addBoxStack(x, y, direction, stackHeight) {
        const n = Math.max(1, Math.floor(Number(stackHeight) || 1));

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
            // +x, -x, +y, -y, +z, -z — box-face on ±Z, box-side on ±X, white top/bottom.
            const materials = [sideMat, sideMat, topMat, topMat, faceMat, faceMat];

            // After +90° yaw, local X (BOX_W / box-face span) points into the room.
            const out = BOX_W / 2 - WALL_FLUSH_PULL;
            const bx = x + fx * out;
            const bz = y + fz * out;

            for (let i = 0; i < n; i++) {
                const box = new THREE.Mesh(
                    new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D),
                    materials
                );
                // Alternate yaw back and forth; amplitude varies per level from the seed.
                const level = seed01n(x, y, i);
                const amp = baseAmp * (0.75 + level * 0.5);
                const wobble = startSign * (i % 2 === 0 ? 1 : -1) * amp;
                box.rotation.y = rotY + wobble;
                box.position.set(
                    bx,
                    -roomHalfY + BOX_H / 2 + i * BOX_H,
                    bz
                );
                scene.add(box);
            }
        };

        textureLoader.load(FACE_IMAGE, tex => {
            faceTex = prepTex(tex);
            if (--left === 0) build();
        });
        textureLoader.load(SIDE_IMAGE, tex => {
            sideTex = prepTex(tex);
            if (--left === 0) build();
        });
    };
}


// =============================================================================
// Light switch
// =============================================================================


const SWITCH_IMAGE = "images/static_images/switches.jpg";
const SWITCH_HEIGHT = 0.24; // 2× prior size
const SWITCH_DEPTH = 0.04;
const PLATE_COLOR = 0xf4f4f4;
const SWITCH_FACE_TINT = 0xffffff;
const SWITCH_WALL_FLUSH_PULL = 0.05;

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY
 * @param {number} [opts.doorHeight]  Switch centers at half this height by default
 * @param {THREE.Object3D[]} [opts.clickable]  Raycast targets (pointer + click)
 */
export function createAddLightSwitch({
    scene,
    textureLoader,
    roomHalfY,
    doorHeight = 3.2,
    clickable = null,
}) {
    const defaultCenterFromFloor = doorHeight / 2;

    /**
     * Wall light-switch plate.
     * `x` / `y` are floorplan wall coordinates (y → world Z).
     * `direction` is the wall it mounts on.
     * `heightFromFloor` is the vertical center (defaults to half door height).
     * @param {string} direction
     * @param {number} x
     * @param {number} y
     * @param {number} [heightFromFloor]
     * @param {object} [options]
     * @param {number} [options.scale=1]  Uniform size multiplier
     * @param {number} [options.switches=2]
     *   How many switches wide. `2` is the current full-texture plate.
     *   `1` = half width, left half of the texture (cropped, not squashed).
     *   `3+` = wider plate with the texture repeating (not stretched).
     * @param {boolean} [options.isDisabled=true]
     *   When true, clicks play the locked SFX and do not toggle room lights.
     */
    return function addLightSwitch(
        direction,
        x,
        y,
        heightFromFloor = defaultCenterFromFloor,
        { scale = 1, switches = 2, isDisabled = true } = {}
    ) {
        textureLoader.load(SWITCH_IMAGE, (tex) => {
            const count = Math.max(1, Math.round(Number(switches) || 2));
            // Full texture on the default plate = 2 switches wide.
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
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                [plateMat, plateMat, plateMat, plateMat, faceMat, plateMat]
            );

            const boxY = -roomHalfY + heightFromFloor;
            const out = d / 2 - SWITCH_WALL_FLUSH_PULL;
            let bx = x;
            let bz = y;

            if (direction === "north") {
                box.rotation.y = 0;
                bz = y + out;
            } else if (direction === "south") {
                box.rotation.y = Math.PI;
                bz = y - out;
            } else if (direction === "west") {
                box.rotation.y = Math.PI / 2;
                bx = x + out;
            } else if (direction === "east") {
                box.rotation.y = -Math.PI / 2;
                bx = x - out;
            } else {
                console.warn("Invalid light switch direction:", direction);
                return;
            }

            box.position.set(bx, boxY, bz);
            box.userData.isLightSwitch = true;
            box.userData.switches = count;
            box.userData.isDisabled = !!isDisabled;
            if (clickable) clickable.push(box);
            scene.add(box);
        });
    };
}


// =============================================================================
// Room lights (switchable ambient / fixtures)
// =============================================================================

/** Face tint when a fluorescent is lit (MeshBasicMaterial color multiply). */
const FIXTURE_ON_RGB = [14, 13.2, 11.5];
const FIXTURE_OFF_COLOR = 0x585858;

/**
 * Minimal room lighting controller: dims scene lights + registered fixture faces.
 * Video screens use MeshBasicMaterial and are unaffected by scene light intensity.
 * Unlit edge lines / background can register so they match hallway darkness when off.
 *
 * @param {object} opts
 * @param {THREE.AmbientLight} opts.ambient
 * @param {THREE.DirectionalLight} opts.directional
 * @param {THREE.Scene} [opts.scene]  Used to dim `scene.background` when lights are off
 * @param {boolean} [opts.isOn=true]
 * @param {{ ambient?: number, directional?: number }} [opts.offIntensity]
 *   Defaults match the example hallway (0.05 / 0.04).
 * @param {number} [opts.offBackground=0x111111]
 * @param {(on: boolean) => void} [opts.onChange]  Fired after on/off changes
 */
export function createRoomLights({
    ambient,
    directional,
    scene = null,
    isOn = true,
    offIntensity = { ambient: 0.05, directional: 0.04 },
    offBackground = 0x111111,
    onChange = null,
} = {}) {
    const onIntensity = {
        ambient: ambient ? ambient.intensity : 1,
        directional: directional ? directional.intensity : 1,
    };
    const off = {
        ambient: offIntensity.ambient ?? 0.05,
        directional: offIntensity.directional ?? 0.04,
    };
    const onBackground =
        scene && scene.background && scene.background.isColor
            ? scene.background.getHex()
            : null;

    let on = !!isOn;
    /** @type {{ face: THREE.Material }[]} */
    const fixtures = [];
    /** @type {{ material: THREE.Material, onColor: number, offColor: number }[]} */
    const unlit = [];

    const applyFixtureFace = (face, lit) => {
        if (!face || !face.color) return;
        if (lit) face.color.setRGB(...FIXTURE_ON_RGB);
        else face.color.set(FIXTURE_OFF_COLOR);
    };

    const apply = () => {
        const levels = on ? onIntensity : off;
        if (ambient) ambient.intensity = levels.ambient;
        if (directional) directional.intensity = levels.directional;
        for (const { face } of fixtures) applyFixtureFace(face, on);
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
            if (typeof onChange === "function") onChange(on);
        },
        toggle() {
            on = !on;
            apply();
            if (typeof onChange === "function") onChange(on);
            return on;
        },
        /** Register a fixture diffuser face so it tracks room on/off. */
        registerFixture(faceMat) {
            if (!faceMat) return;
            fixtures.push({ face: faceMat });
            applyFixtureFace(faceMat, on);
        },
        /**
         * Register an unlit material (e.g. edge LineBasicMaterial) to dim when off.
         * @param {THREE.Material} material
         * @param {number} [offColor=0x111111]
         */
        registerUnlit(material, offColor = 0x111111) {
            if (!material || !material.color) return;
            unlit.push({
                material,
                onColor: material.color.getHex(),
                offColor,
            });
            material.color.setHex(on ? material.color.getHex() : offColor);
        },
    };
}


// =============================================================================
// Light fixture
// =============================================================================


const LIGHT_IMAGE = "images/static_images/lights-1.jpg";
/** Medium fluorescent troffer — long axis along local X. */
export const LIGHT_LENGTH = 1.35;
export const LIGHT_WIDTH = 0.28;
const LIGHT_DEPTH = 0.06;
const HOUSING_COLOR = 0xb0b0b0;
const DROP_FROM_CEILING = 0.02;

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY
 * @param {number} [opts.ceilingY=roomHalfY]  World Y of the ceiling
 * @param {ReturnType<typeof createRoomLights>|null} [opts.roomLights]
 */
export function createAddLightFixture({
    scene,
    textureLoader,
    roomHalfY,
    ceilingY = roomHalfY,
    roomLights = null,
}) {
    /**
     * Ceiling fluorescent fixture at floorplan (x, z).
     * `rotationY` orients the long axis (0 = along +X, π/2 = along +Z).
     * @param {number} x
     * @param {number} z
     * @param {number} [rotationY=0]
     * @param {object} [options]
     * @param {boolean} [options.isOn=false]  Brighten the downward face when on
     *   (ignored when `roomLights` is set — then the controller owns on/off).
     * @param {number} [options.scale=1]  Uniform size multiplier (length + width)
     * @param {number} [options.length]  Override fixture length
     * @param {number} [options.width]  Override fixture width
     */
    return function addLightFixture(
        x,
        z,
        rotationY = 0,
        { isOn = false, scale = 1, length, width } = {}
    ) {
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
            // Texture is a dark "off" fixture photo — emissiveMap would stay dim.
            // Off: crush further. On: unlit + hard color multiply so tubes blow out white
            // (same self-lit / toneMapped:false idea as exit signs).
            const face = new THREE.MeshBasicMaterial({
                map: tex,
                toneMapped: false,
            });
            const lit = roomLights ? roomLights.isOn() : isOn;
            if (lit) face.color.setRGB(...FIXTURE_ON_RGB);
            else face.color.set(FIXTURE_OFF_COLOR);

            // BoxGeometry materials: +x, -x, +y, -y, +z, -z
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(len, depth, wid),
                [housing, housing, housing, face, housing, housing]
            );

            box.rotation.y = rotationY;
            box.position.set(
                x,
                ceilingY - DROP_FROM_CEILING - depth / 2,
                z
            );
            box.userData.isLightFixture = true;
            box.userData.isOn = lit;
            if (roomLights) roomLights.registerFixture(face);
            scene.add(box);
        });
    };
}

/**
 * Centers along a run of `length` (space-evenly, accounting for fixture length).
 * One fixture → midpoint. Returns distances from the start of the run.
 */
export function lightPositionsAlong(length, count) {
    const n = Math.max(0, Math.floor(count));
    if (n === 0) return [];
    if (n === 1) return [length / 2];

    const gap = (length - n * LIGHT_LENGTH) / (n + 1);
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(gap + LIGHT_LENGTH / 2 + i * (LIGHT_LENGTH + gap));
    }
    return out;
}


// =============================================================================
// Vent
// =============================================================================


const VENT_IMAGE = "images/static_images/vent.jpg";
const VENT_HEIGHT = 0.3; // a bit larger than exit signs (~0.22)
export const VENT_WIDTH = 0.95 * (2 / 3); // ~2/3 of prior width
const VENT_DEPTH = 0.04;
const VENT_COLOR = 0x6a6a6a;
const DEFAULT_Y_FROM_CEILING = 0.12;
// Room wall specs are inset (~WALL_INSET); pull back so the vent back sits on the wall.
const VENT_WALL_FLUSH_PULL = 0.05;

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY
 * @param {object} opts.walls  north/south/east/west specs:
 *   north/south: { z, leftX, rightX }  (leftX = left edge when viewed from inside)
 *   east/west:   { x, leftZ, rightZ }
 */
export function createAddVent({ scene, textureLoader, roomHalfY, walls }) {
    /**
     * HVAC vent near the ceiling.
     * `xFromLeft` is meters from the left edge of the wall to the vent center
     * when facing the wall from inside.
     * @param {string} wall
     * @param {number} xFromLeft
     * @param {number|object} [yFromCeilingOrOpts=DEFAULT_Y_FROM_CEILING]
     *   Gap under the ceiling, or options `{ yFromCeiling, width, height }`.
     */
    return function addVent(wall, xFromLeft, yFromCeilingOrOpts = DEFAULT_Y_FROM_CEILING) {
        const spec = walls[wall];
        if (!spec) {
            console.warn("Invalid vent wall:", wall);
            return;
        }

        const opts =
            typeof yFromCeilingOrOpts === "object" && yFromCeilingOrOpts != null
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
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                [metalMat, metalMat, metalMat, metalMat, faceMat, metalMat]
            );

            const boxY = roomHalfY - yFromCeiling - h / 2;
            // Specs are inset from the real wall; pull back so the vent back sits flush on it.
            const out = d / 2 - VENT_WALL_FLUSH_PULL;
            let bx = 0;
            let bz = 0;

            if (wall === "north") {
                // Facing wall (looking −Z): left is −X → leftX should be the more negative x.
                box.rotation.y = 0;
                bx = spec.leftX + xFromLeft;
                bz = spec.z + out;
            } else if (wall === "south") {
                // Facing wall (looking +Z): left is +X.
                box.rotation.y = Math.PI;
                bx = spec.leftX - xFromLeft;
                bz = spec.z - out;
            } else if (wall === "west") {
                // Facing wall (looking −X): left is −Z.
                box.rotation.y = Math.PI / 2;
                bx = spec.x + out;
                bz = spec.leftZ + xFromLeft;
            } else if (wall === "east") {
                // Facing wall (looking +X): left is +Z.
                box.rotation.y = -Math.PI / 2;
                bx = spec.x - out;
                bz = spec.leftZ - xFromLeft;
            }

            box.position.set(bx, boxY, bz);
            scene.add(box);
        });
    };
}

/**
 * Positions for vent centers along a wall (from the left edge).
 * One vent → centered. Multiple → equal gaps between vents and both edges (space-evenly).
 */
export function ventPositionsAlongWall(wallLength, count) {
    const n = Math.max(0, Math.floor(count));
    if (n === 0) return [];
    if (n === 1) return [wallLength / 2];

    const gap = (wallLength - n * VENT_WIDTH) / (n + 1);
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(gap + VENT_WIDTH / 2 + i * (VENT_WIDTH + gap));
    }
    return out;
}

// =============================================================================
// Outline builders
// =============================================================================

const DIR_DELTA = {
    north: [0, -1],
    south: [0, 1],
    east: [1, 0],
    west: [-1, 0],
};

/**
 * Axis-aligned rectangle centered at the origin (CCW from above).
 * @param {number} width  X span
 * @param {number} depth  Z span
 * @returns {number[][]}
 */
export function outlineFromBox(width, depth) {
    const hx = width / 2;
    const hz = depth / 2;
    return [
        [-hx, -hz],
        [hx, -hz],
        [hx, hz],
        [-hx, hz],
    ];
}

/**
 * Turtle-style path of wall segments. Directions: north/south/east/west.
 * Closes automatically (does not duplicate the start point in the returned outline).
 * @param {{ dir: string, length: number }[]} segments
 * @param {number[]} [start=[0,0]]
 * @returns {number[][]}
 */
export function outlineFromPath(segments, start = [0, 0]) {
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
    // Drop duplicate closing vertex if the path already returns to start.
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (
        pts.length > 1 &&
        Math.hypot(last[0] - first[0], last[1] - first[1]) < 1e-6
    ) {
        pts.pop();
    }
    return pts;
}

/**
 * Axis-aligned bounding box of an outline.
 * @param {number[][]} outline
 */
export function outlineBounds(outline) {
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
}

/**
 * Cardinal wall flush specs for vent/prop placement from outline AABB.
 * north/south: { z, leftX, rightX }; east/west: { x, leftZ, rightZ }.
 */
export function wallsFromOutline(outline, wallInset = 0.05) {
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
}

// =============================================================================
// Corner lines
// =============================================================================

export function addVerticalCornerLinesFromOutline(
    scene,
    corners,
    height,
    color = 0x111111,
    floorY = -height / 2
) {
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
    const lines = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color })
    );
    scene.add(lines);
    return lines;
}

/**
 * Horizontal lines along every wall edge at the floor and ceiling junctions.
 * Inset into the room past the molding so they stay visible.
 */
export function addHorizontalEdgeLinesFromOutline(
    scene,
    outline,
    height,
    color = 0x111111,
    floorY = -height / 2
) {
    if (!outline || outline.length < 2) return null;
    const ceilingY = floorY + height;
    // Past molding depth (DEPTH) so lines aren't buried in baseboard/crown.
    const intoRoom = 0.055;
    // Hairline above the floor / below the ceiling to avoid z-fighting.
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
    const lines = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({
            color,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        })
    );
    lines.renderOrder = 1;
    scene.add(lines);
    return lines;
}

export function addVerticalCornerLinesFromBox(
    scene,
    width,
    height,
    depth,
    yOffset = 0,
    color = 0xd2d2d2
) {
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
    const lines = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color })
    );
    scene.add(lines);
    return lines;
}

// =============================================================================
// Room layout
// =============================================================================

function shapeFromOutline(outline) {
    const s = new THREE.Shape();
    const [x0, z0] = outline[0];
    s.moveTo(x0, z0);
    for (let i = 1; i < outline.length; i++) {
        s.lineTo(outline[i][0], outline[i][1]);
    }
    s.lineTo(x0, z0);
    return s;
}

/** Default floor-to-ceiling height when `createRoomLayout` omits `height` / `ceilingHeight`. */
export const DEFAULT_ROOM_HEIGHT = 6;

/**
 * World-space size of one `ceiling.jpg` tile (≈ 2/3 of the example gallery's 12-unit width,
 * then scaled ×8 so the pattern reads larger in-room).
 */
export const CEILING_TILE_WORLD_SIZE = 64;

/**
 * Build floor, ceiling, walls, optional molding + corner lines from a CCW outline.
 *
 * Default (omit `height` / use DEFAULT_ROOM_HEIGHT, omit `floorY`): room is
 * centered on y=0 — identical to the original layout.
 *
 * Pass `floorY` to pin the floor in world space and only move the ceiling when
 * `height` changes (art / doors / camera at fixed world Y stay aligned).
 *
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {number[][]} opts.outline
 * @param {number} [opts.height=DEFAULT_ROOM_HEIGHT]  Floor-to-ceiling height
 * @param {number} [opts.ceilingHeight]  Optional override for `height`
 * @param {number} [opts.floorY]  World Y of the floor; default `-height/2` (centered)
 * @param {{ wall: THREE.Material, floor: THREE.Material, ceiling: THREE.Material }} opts.materials
 * @param {boolean|number} [opts.molding=true]  true = default color, number = hex color, false = skip
 * @param {boolean|number} [opts.cornerLines=true]
 * @param {ReturnType<typeof createWallClickHelper>} [opts.wallClick]
 * @param {number} [opts.wallInset=0.05]
 * @param {ReturnType<typeof createRoomLights>|null} [opts.roomLights]
 *   When set, edge-line materials dim with room lights off.
 */
export function createRoomLayout({
    scene,
    outline,
    height = DEFAULT_ROOM_HEIGHT,
    ceilingHeight,
    floorY: floorYOpt,
    materials,
    molding = true,
    cornerLines = true,
    wallClick = null,
    wallInset = 0.05,
    roomLights = null,
}) {
    if (!outline || outline.length < 3) {
        throw new Error("createRoomLayout: outline needs at least 3 points");
    }
    const roomHeight = ceilingHeight ?? height;
    const floorY =
        floorYOpt !== undefined && floorYOpt !== null
            ? floorYOpt
            : -roomHeight / 2;
    const ceilingY = floorY + roomHeight;
    const wallCenterY = (floorY + ceilingY) / 2;
    // Kept for callers that use `-roomHalfY` as the floor world Y.
    const roomHalfY = -floorY;
    const shape = shapeFromOutline(outline);

    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), materials.floor);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = floorY;
    floor.scale.z = -1;
    scene.add(floor);

    const ceiling = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        materials.ceiling
    );
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
        const vert = addVerticalCornerLinesFromOutline(
            scene,
            outline,
            roomHeight,
            color,
            floorY
        );
        const horiz = addHorizontalEdgeLinesFromOutline(
            scene,
            outline,
            roomHeight,
            color,
            floorY
        );
        if (roomLights) {
            if (vert?.material) roomLights.registerUnlit(vert.material);
            if (horiz?.material) roomLights.registerUnlit(horiz.material);
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
}

// =============================================================================
// Wall placement (doors + art)
// =============================================================================

/** Gallery door height used as the reference for the standard art eye-line. */
export const DEFAULT_GALLERY_DOOR_HEIGHT = 4;

/** Center of wall art / screens above the floor (gallery eye-line). */
export const DEFAULT_ART_HEIGHT_FROM_FLOOR = 2.4;

/** Camera / POV height above the floor — slightly above the art eye-line. */
export const DEFAULT_CAMERA_HEIGHT_FROM_FLOOR = 3;

/**
 * Place a mesh flush on a cardinal wall using AABB bounds.
 * `x` is along-wall offset from the room center (north/south → world X, east/west → world Z).
 *
 * Vertical placement: pass world `y`, or pass `heightFromFloor` + `floorY` so the
 * mesh center sits that far above the floor (gallery eye-line).
 *
 * @param {THREE.Object3D} mesh
 * @param {string} wall
 * @param {number} x
 * @param {number|null} y  World Y of the mesh center (ignored when heightFromFloor is set)
 * @param {number} halfW
 * @param {ReturnType<typeof outlineBounds>} bounds
 * @param {number} [wallInset=0.05]
 * @param {object} [opts]
 * @param {number} [opts.heightFromFloor]  Center height above the floor
 * @param {number} [opts.floorY]  World Y of the floor (required with heightFromFloor)
 */
export function placeOnWall(
    mesh,
    wall,
    x,
    y,
    halfW,
    bounds,
    wallInset = 0.05,
    { heightFromFloor, floorY, clamp = "edges" } = {}
) {
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
    const span =
        wall === "north" || wall === "south" ? halfX : halfZ;
    // "edges": keep the whole plane on the wall. "center": allow the center
    // out to the wall edge (~50% of the image can hang off).
    const maxX = clamp === "center" ? span : span - halfW;
    const lx =
        maxX < 0 ? 0 : Math.max(-maxX, Math.min(maxX, x));
    const cx = bounds.centerX ?? 0;
    const cz = bounds.centerZ ?? 0;

    if (wall === "north") {
        mesh.position.set(cx + lx, worldY, bounds.minZ + wallInset);
    } else if (wall === "south") {
        mesh.position.set(cx + lx, worldY, bounds.maxZ - wallInset);
        mesh.rotation.y = Math.PI;
    } else if (wall === "west") {
        mesh.position.set(bounds.minX + wallInset, worldY, cz + lx);
        mesh.rotation.y = Math.PI / 2;
    } else if (wall === "east") {
        mesh.position.set(bounds.maxX - wallInset, worldY, cz + lx);
        mesh.rotation.y = -Math.PI / 2;
    } else {
        console.warn("Invalid wall:", wall);
        return false;
    }
    return true;
}

// =============================================================================
// Door room label
// =============================================================================

/** Along-wall sign: +1 means increasing placeOnWall `x` is to the viewer's right. */
const DOOR_LABEL_RIGHT_SIGN = {
    north: 1,
    south: -1,
    west: -1,
    east: 1,
};

/**
 * Pull a room number from a path or URL (`5.html` → `"5"`).
 * @param {string|null|undefined} path
 * @returns {string|null}
 */
export function roomNumberFromPath(path) {
    if (!path || typeof path !== "string") return null;
    const clean = path.split("?")[0].split("#")[0];
    const file = clean.split("/").pop() || "";
    const m = file.match(/^(\d+)\.html$/i);
    return m ? m[1] : null;
}

/**
 * Galleries (numbered pages other than the central hall): current file number.
 * Hallways (`index` / `7.html`): number from the door `href` destination.
 * @param {string|number|null|undefined} explicit
 * @param {string|null|undefined} href
 * @returns {string|null}
 */
export function resolveDoorRoomLabel(explicit, href) {
    if (explicit != null && String(explicit).length) return String(explicit);

    const pagePath =
        typeof location !== "undefined" ? location.pathname : "";
    const fromPage = roomNumberFromPath(pagePath);
    const fromHref = roomNumberFromPath(href);

    const isHubPath =
        !pagePath ||
        /\/$/.test(pagePath) ||
        /\/index\.html$/i.test(pagePath);
    const isCentralHall = fromPage === "7";
    const isHallway = isHubPath || isCentralHall || fromPage == null;

    if (isHallway) return fromHref || fromPage;
    return fromPage || fromHref;
}

/**
 * Small raised plaque at the top-right of a door (viewer-facing).
 * Fiddle sizes / colors via the constants at the top of this function.
 *
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {string} opts.wall
 * @param {number} opts.doorAlong  placeOnWall along-wall `x` of the door center
 * @param {number} opts.doorWidth
 * @param {number} opts.doorHeight
 * @param {number} opts.roomHalfY
 * @param {ReturnType<typeof outlineBounds>} opts.bounds
 * @param {number} [opts.wallInset=0.05]
 * @param {string} opts.label
 * @returns {THREE.Mesh|null}
 */
export function addDoorRoomLabel({
    scene,
    wall,
    doorAlong,
    doorWidth,
    doorHeight,
    roomHalfY,
    bounds,
    wallInset = 0.05,
    label,
} = {}) {
    // --- fiddly defaults (edit these) ---
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
    // --- end fiddly defaults ---

    if (!scene || !bounds || label == null || label === "") return null;
    const text = String(label);
    const right = DOOR_LABEL_RIGHT_SIGN[wall] ?? 1;

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

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
    const plaque = new THREE.Mesh(
        new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D),
        [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat]
    );

    const along =
        doorAlong + right * (doorWidth / 2 + GAP_FROM_DOOR + BOX_W / 2);
    const worldY =
        -roomHalfY + doorHeight - INSET_FROM_DOOR_TOP - BOX_H / 2;

    if (
        !placeOnWall(
            plaque,
            wall,
            along,
            worldY,
            BOX_W / 2,
            bounds,
            wallInset
        )
    ) {
        map.dispose();
        faceMat.dispose();
        sideMat.dispose();
        plaque.geometry.dispose();
        return null;
    }

    // Nudge out of the wall like a light-switch plate.
    const out = BOX_D / 2 - WALL_FLUSH_PULL;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(plaque.quaternion);
    plaque.position.addScaledVector(forward, out);

    plaque.userData.isDoorLabel = true;
    plaque.userData.label = text;
    scene.add(plaque);
    return plaque;
}

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY
 * @param {number} opts.roomHeight
 * @param {THREE.Object3D[]} opts.clickable
 * @param {ReturnType<typeof outlineBounds>} opts.bounds
 * @param {number} [opts.wallInset=0.05]
 */
export function createAddWallDoor({
    scene,
    textureLoader,
    roomHalfY,
    roomHeight,
    clickable,
    bounds,
    wallInset = 0.05,
}) {
    /**
     * Floor-flush door plane on a cardinal wall.
     * @param {string} wall  north|south|east|west
     * @param {string} imageFile
     * @param {number} doorHeight
     * @param {object} [options]
     * @param {string|null} [options.href]  Destination URL when unlocked
     * @param {boolean} [options.locked=true]
     * @param {boolean} [options.bright=false]
     * @param {number} [options.x=0]  Along-wall offset from center
     * @param {boolean} [options.isLabelled=false]
     *   When true, mounts a room-number plaque at the door's top-right.
     * @param {string|number|null} [options.label=null]
     *   Optional plaque text override (otherwise derived from href / pathname).
     * @returns {Promise<THREE.Mesh|null>}
     */
    return function addWallDoor(
        wall,
        imageFile,
        doorHeight,
        {
            href = null,
            locked = true,
            bright = false,
            x = 0,
            isLabelled = false,
            label = null,
        } = {}
    ) {
        return new Promise((resolve) => {
            textureLoader.load(imageFile, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;

                const aspect = tex.image.width / tex.image.height;
                const imageWidth = doorHeight * aspect;
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

                const door = new THREE.Mesh(
                    new THREE.PlaneGeometry(imageWidth, imageHeight),
                    material
                );

                const ly = -roomHalfY + imageHeight / 2;
                if (
                    !placeOnWall(
                        door,
                        wall,
                        x,
                        ly,
                        imageWidth / 2,
                        bounds,
                        wallInset
                    )
                ) {
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
            });
        });
    };
}

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY  `-floorY` (floor at `-roomHalfY` when centered)
 * @param {number} [opts.floorY=-roomHalfY]
 * @param {number} [opts.ceilingY=roomHalfY]
 * @param {number} [opts.heightFromFloor=DEFAULT_ART_HEIGHT_FROM_FLOOR]
 *   Default center height above the floor (gallery eye-line).
 * @param {THREE.Object3D[]} opts.clickable
 * @param {ReturnType<typeof outlineBounds>} opts.bounds
 * @param {number} [opts.wallInset=0.05]
 */
export function createAddWallImage({
    scene,
    textureLoader,
    roomHalfY,
    floorY = -roomHalfY,
    ceilingY = roomHalfY,
    heightFromFloor = DEFAULT_ART_HEIGHT_FROM_FLOOR,
    clickable,
    bounds,
    wallInset = 0.05,
}) {
    /**
     * Clickable wall art (opens lightbox when hit handler supports it).
     * Vertical center defaults to the gallery eye-line (`heightFromFloor`).
     *
     * @param {string} wall
     * @param {number} x  Along-wall offset from center
     * @param {string} imageFile
     * @param {number} imageWidth
     * @param {object} [options]
     * @param {number} [options.heightFromFloor]  Override center height above floor
     */
    return function addWallImage(
        wall,
        x,
        imageFile,
        imageWidth,
        { heightFromFloor: heightFromFloorOpt } = {}
    ) {
        textureLoader.load(imageFile, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;

            const aspect = tex.image.width / tex.image.height;
            const imageHeight = imageWidth / aspect;

            const art = new THREE.Mesh(
                new THREE.PlaneGeometry(imageWidth, imageHeight),
                new THREE.MeshStandardMaterial({
                    map: tex,
                    transparent: true,
                    alphaTest: 0.1,
                    depthWrite: true,
                })
            );

            const roomH = ceilingY - floorY;
            const minHff = imageHeight / 2;
            const maxHff = roomH - imageHeight / 2;
            const hff = Math.max(
                minHff,
                Math.min(
                    maxHff,
                    heightFromFloorOpt ?? heightFromFloor
                )
            );

            if (
                !placeOnWall(
                    art,
                    wall,
                    x,
                    null,
                    imageWidth / 2,
                    bounds,
                    wallInset,
                    { heightFromFloor: hff, floorY }
                )
            ) {
                return;
            }

            art.userData.imageFile = imageFile;
            clickable.push(art);
            scene.add(art);
        });
    };
}

/** Default world width (meters) for user-uploaded gallery art. */
export const DEFAULT_USER_ART_WIDTH = 1.6;

/**
 * Map a wall-click `describeHit` result to `placeOnWall` args (AABB / gallery rooms).
 * Uses world position so box faces and full-side outline segments both work.
 *
 * @param {{ wall: string, world: { x: number, y: number, z: number }, local?: { x: number, y: number } }|null|undefined} info
 * @param {object} opts
 * @param {number} opts.floorY
 * @param {ReturnType<typeof outlineBounds>} [opts.bounds]
 * @returns {{ wall: string, x: number, heightFromFloor: number }|null}
 */
export function hitToWallPlacement(info, { floorY, bounds } = {}) {
    if (!info?.world || floorY == null) return null;
    if (info.wall === "ceiling" || info.wall === "floor") return null;

    let wall = info.wall;

    // Prefer nearest AABB face so placement matches placeOnWall even if the
    // hit's cardinal label was derived from an inward face normal.
    if (bounds) {
        const { minX, maxX, minZ, maxZ } = bounds;
        const wx = info.world.x;
        const wz = info.world.z;
        const dN = Math.abs(wz - minZ);
        const dS = Math.abs(wz - maxZ);
        const dW = Math.abs(wx - minX);
        const dE = Math.abs(wx - maxX);
        const nearest = Math.min(dN, dS, dW, dE);
        if (nearest === dN) wall = "north";
        else if (nearest === dS) wall = "south";
        else if (nearest === dW) wall = "west";
        else wall = "east";
    }

    if (typeof wall !== "string") return null;

    const cx = bounds?.centerX ?? 0;
    const cz = bounds?.centerZ ?? 0;
    const x =
        wall === "north" || wall === "south"
            ? info.world.x - cx
            : info.world.z - cz;

    return {
        wall,
        x,
        heightFromFloor: info.world.y - floorY,
    };
}

/**
 * Resolve a path string, File, Blob, or existing object URL for TextureLoader.
 * @param {string|Blob|File} imageSource
 * @returns {{ url: string, displayName: string|null }}
 */
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
        const name =
            typeof File !== "undefined" &&
            imageSource instanceof File &&
            imageSource.name
                ? imageSource.name
                : "uploaded image";
        return { url: URL.createObjectURL(imageSource), displayName: name };
    }
    console.warn("resolveUserImageSource: unsupported image source", imageSource);
    return { url: "", displayName: null };
};

/**
 * Like `createAddWallImage`, but accepts a local File/Blob (or path / object URL).
 * Gallery / AABB rooms via `placeOnWall`. Persistence is handled by
 * `createUserArtSession` when wired through `enableDevWallUpload`.
 *
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.TextureLoader} opts.textureLoader
 * @param {number} opts.roomHalfY
 * @param {number} [opts.floorY=-roomHalfY]
 * @param {number} [opts.ceilingY=roomHalfY]
 * @param {number} [opts.heightFromFloor=DEFAULT_ART_HEIGHT_FROM_FLOOR]
 * @param {THREE.Object3D[]} opts.clickable
 * @param {ReturnType<typeof outlineBounds>} opts.bounds
 * @param {number} [opts.wallInset=0.05]
 */
export function createAddUserWallImage({
    scene,
    textureLoader,
    roomHalfY,
    floorY = -roomHalfY,
    ceilingY = roomHalfY,
    heightFromFloor = DEFAULT_ART_HEIGHT_FROM_FLOOR,
    clickable,
    bounds,
    wallInset = 0.05,
}) {
    /**
     * @param {string} wall
     * @param {number} x  Along-wall offset from room center
     * @param {string|Blob|File} imageSource
     * @param {number} [imageWidth=DEFAULT_USER_ART_WIDTH]
     * @param {object} [options]
     * @param {number} [options.heightFromFloor]
     * @returns {Promise<THREE.Mesh|null>}
     */
    return function addUserWallImage(
        wall,
        x,
        imageSource,
        imageWidth = DEFAULT_USER_ART_WIDTH,
        { heightFromFloor: heightFromFloorOpt } = {}
    ) {
        const { url, displayName } = resolveUserImageSource(imageSource);
        if (!url) return Promise.resolve(null);

        return new Promise((resolve) => {
            textureLoader.load(
                url,
                (tex) => {
                    tex.colorSpace = THREE.SRGBColorSpace;
                    tex.magFilter = THREE.NearestFilter;
                    tex.minFilter = THREE.NearestFilter;

                    const aspect = tex.image.width / tex.image.height;
                    const imageHeight = imageWidth / aspect;

                    const art = new THREE.Mesh(
                        new THREE.PlaneGeometry(imageWidth, imageHeight),
                        new THREE.MeshStandardMaterial({
                            map: tex,
                            transparent: true,
                            alphaTest: 0.1,
                            depthWrite: true,
                        })
                    );

                    const roomH = ceilingY - floorY;
                    // Center-clamp: allow ~50% of the image past floor/ceiling.
                    const hffRaw = heightFromFloorOpt ?? heightFromFloor;
                    const hff = Math.max(0, Math.min(roomH, hffRaw));

                    if (
                        !placeOnWall(
                            art,
                            wall,
                            x,
                            null,
                            imageWidth / 2,
                            bounds,
                            wallInset,
                            { heightFromFloor: hff, floorY, clamp: "center" }
                        )
                    ) {
                        resolve(null);
                        return;
                    }

                    const halfX = bounds.halfX ?? bounds.width / 2;
                    const halfZ = bounds.halfZ ?? bounds.depth / 2;
                    const maxAlong =
                        wall === "north" || wall === "south" ? halfX : halfZ;
                    const xClamped =
                        maxAlong < 0
                            ? 0
                            : Math.max(-maxAlong, Math.min(maxAlong, x));
                    const uX =
                        maxAlong > 1e-6
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
                },
                undefined,
                () => {
                    console.warn("addUserWallImage: failed to load", displayName || url);
                    resolve(null);
                }
            );
        });
    };
}

/**
 * Along-wall / vertical travel for user art with center-at-edge limits
 * (~50% of the image may hang off the wall / floor / ceiling).
 *
 * @param {object} opts
 * @param {string} opts.wall
 * @param {ReturnType<typeof outlineBounds>} opts.bounds
 * @param {number} opts.floorY
 * @param {number} opts.ceilingY
 * @returns {{ maxAlong: number, roomH: number }}
 */
export function userArtTravelLimits({ wall, bounds, floorY, ceilingY }) {
    const halfX = bounds.halfX ?? bounds.width / 2;
    const halfZ = bounds.halfZ ?? bounds.depth / 2;
    const maxAlong =
        wall === "north" || wall === "south" ? halfX : halfZ;
    return {
        maxAlong: Math.max(0, maxAlong),
        roomH: Math.max(0, ceilingY - floorY),
    };
}

const clamp01 = (t) => Math.max(0, Math.min(1, t));

/**
 * Update user-hung gallery art size and/or normalized wall position.
 * `uX` / `uY` are 0..1 across the wall (center may sit on the edge).
 * Size changes keep existing uX/uY so relative placement stays put.
 *
 * @param {THREE.Mesh} art
 * @param {object} [patch]
 * @param {number} [patch.width]
 * @param {number} [patch.uX]
 * @param {number} [patch.uY]
 * @param {object} ctx
 * @param {ReturnType<typeof outlineBounds>} ctx.bounds
 * @param {number} ctx.floorY
 * @param {number} ctx.ceilingY
 * @param {number} [ctx.wallInset=0.05]
 * @returns {boolean}
 */
export function updateUserArtPlacement(
    art,
    patch = {},
    { bounds, floorY, ceilingY, wallInset = 0.05 } = {}
) {
    if (!art?.userData?.isUserArt || !art.userData.placement) return false;
    if (bounds == null || floorY == null || ceilingY == null) return false;

    const aspect = art.userData.aspect;
    if (!(aspect > 0)) return false;

    const placement = art.userData.placement;
    const wall = placement.wall;
    const width =
        patch.width != null ? patch.width : art.userData.artWidth;
    if (!(width > 0)) return false;

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

    if (
        !placeOnWall(art, wall, x, null, width / 2, bounds, wallInset, {
            heightFromFloor: hff,
            floorY,
            clamp: "center",
        })
    ) {
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
}

/**
 * Resize user-hung gallery art (keeps normalized X/Y on the wall).
 * @returns {boolean}
 */
export function setUserArtWidth(art, width, ctx) {
    return updateUserArtPlacement(art, { width }, ctx);
}

// =============================================================================
// User art persistence (IndexedDB) — swappable for a remote store later
// =============================================================================

const USER_ART_DB_NAME = "y9k-user-art";
const USER_ART_DB_VERSION = 1;

const newPlacementId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `art-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const idbRequest = (req) =>
    new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
    });

const idbTxDone = (tx) =>
    new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });

/**
 * Browser-local placement store (IndexedDB). Same method shape can later be
 * implemented by a remote/backend adapter.
 *
 * @param {object} [opts]
 * @param {string} [opts.dbName]
 */
export function createLocalPlacementStore({ dbName = USER_ART_DB_NAME } = {}) {
    /** @type {Promise<IDBDatabase>|null} */
    let dbPromise = null;

    const openDb = () => {
        if (dbPromise) return dbPromise;
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
            req.onerror = () =>
                reject(req.error || new Error("Failed to open user-art DB"));
        });
        return dbPromise;
    };

    return {
        /**
         * @param {string} roomId
         * @returns {Promise<object[]>}
         */
        async list(roomId) {
            const db = await openDb();
            const tx = db.transaction("placements", "readonly");
            const index = tx.objectStore("placements").index("roomId");
            const rows = await idbRequest(index.getAll(roomId));
            await idbTxDone(tx);
            return Array.isArray(rows) ? rows : [];
        },

        /**
         * @param {string} id
         * @returns {Promise<Blob|null>}
         */
        async getBlob(id) {
            const db = await openDb();
            const tx = db.transaction("blobs", "readonly");
            const row = await idbRequest(tx.objectStore("blobs").get(id));
            await idbTxDone(tx);
            return row?.blob instanceof Blob ? row.blob : null;
        },

        /**
         * @param {object} opts
         * @param {object} opts.placement
         * @param {Blob} opts.blob
         */
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

        /**
         * @param {string} id
         * @param {object} partial
         */
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

        /**
         * @param {string} id
         */
        async remove(id) {
            const db = await openDb();
            const tx = db.transaction(["placements", "blobs"], "readwrite");
            tx.objectStore("placements").delete(id);
            tx.objectStore("blobs").delete(id);
            await idbTxDone(tx);
        },
    };
}

/**
 * Build world x / heightFromFloor from normalized wall coords.
 */
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

/**
 * Live user-art meshes for one room, backed by a PlacementStore.
 *
 * @param {object} opts
 * @param {ReturnType<typeof createLocalPlacementStore>} opts.store
 * @param {string} opts.roomId
 * @param {ReturnType<typeof createAddUserWallImage>} opts.addUserWallImage
 * @param {THREE.Object3D[]} opts.clickable
 * @param {ReturnType<typeof outlineBounds>} opts.bounds
 * @param {number} opts.floorY
 * @param {number} opts.ceilingY
 * @param {number} [opts.wallInset=0.05]
 */
export function createUserArtSession({
    store,
    roomId,
    addUserWallImage,
    clickable,
    bounds,
    floorY,
    ceilingY,
    wallInset = 0.05,
}) {
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

        /**
         * Load saved placements for this room into the scene.
         * @returns {Promise<THREE.Mesh[]>}
         */
        async hydrate() {
            if (!store || !roomId || typeof addUserWallImage !== "function") {
                return [];
            }
            let rows = [];
            try {
                rows = await store.list(roomId);
            } catch (err) {
                console.warn("user art hydrate: list failed", err);
                return [];
            }

            rows = [...rows].sort(
                (a, b) => (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0)
            );

            /** @type {THREE.Mesh[]} */
            const meshes = [];
            for (const row of rows) {
                if (!row?.id || !row.wall) continue;
                let blob = null;
                try {
                    blob = await store.getBlob(row.id);
                } catch (err) {
                    console.warn("user art hydrate: getBlob failed", row.id, err);
                    continue;
                }
                if (!blob) {
                    console.warn("user art hydrate: missing blob for", row.id);
                    continue;
                }

                const { x, heightFromFloor, uX, uY } = placementWorldFromUV(
                    row.wall,
                    row.uX,
                    row.uY,
                    placeCtx
                );
                const url = URL.createObjectURL(blob);
                try {
                    const art = await addUserWallImage(
                        row.wall,
                        x,
                        url,
                        row.width || DEFAULT_USER_ART_WIDTH,
                        { heightFromFloor }
                    );
                    if (!art) {
                        URL.revokeObjectURL(url);
                        continue;
                    }
                    art.userData.placementId = row.id;
                    art.userData.createdAt = row.createdAt;
                    if (row.imageName) art.userData.imageName = row.imageName;
                    updateUserArtPlacement(
                        art,
                        { width: row.width, uX, uY },
                        placeCtx
                    );
                    meshes.push(art);
                } catch (err) {
                    console.warn("user art hydrate: place failed", row.id, err);
                    try {
                        URL.revokeObjectURL(url);
                    } catch (_) {}
                }
            }
            return meshes;
        },

        /**
         * Persist a newly placed mesh + its source File/Blob.
         * @param {THREE.Mesh} art
         * @param {Blob} blob
         */
        async remember(art, blob) {
            if (!art?.userData?.isUserArt || !(blob instanceof Blob)) return null;
            const id = art.userData.placementId || newPlacementId();
            art.userData.placementId = id;
            const placement = metaFromArt(art, id, art.userData.createdAt);
            art.userData.createdAt = placement.createdAt;
            await store.put({ placement, blob });
            return placement;
        },

        /**
         * Persist size/position changes (no blob rewrite).
         * @param {THREE.Mesh} art
         */
        async sync(art) {
            const id = art?.userData?.placementId;
            if (!id || !art.userData?.placement) return false;
            return store.updateMeta(id, {
                wall: art.userData.placement.wall,
                width: art.userData.artWidth,
                uX: art.userData.placement.uX,
                uY: art.userData.placement.uY,
                imageName: art.userData.imageName || null,
            });
        },

        /**
         * Remove mesh from the scene and delete its store record.
         * @param {THREE.Mesh} art
         */
        async forget(art) {
            const id = art?.userData?.placementId;
            removeUserWallImage(art, { clickable });
            if (id) {
                try {
                    await store.remove(id);
                } catch (err) {
                    console.warn("user art forget: remove failed", id, err);
                }
            }
            return true;
        },

        /**
         * Remove every user-hung image for this room (scene + IndexedDB).
         * @returns {Promise<number>} number of store rows removed
         */
        async forgetAll() {
            let rows = [];
            try {
                rows = await store.list(roomId);
            } catch (err) {
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
                if (!row?.id) continue;
                try {
                    await store.remove(row.id);
                    removed += 1;
                } catch (err) {
                    console.warn("user art forgetAll: remove failed", row.id, err);
                }
            }
            return removed;
        },
    };
}

/**
 * Remove user-hung gallery art from the scene and clickable list.
 * Disposes geometry / material / map and revokes blob object URLs.
 *
 * @param {THREE.Mesh|null|undefined} art
 * @param {object} [opts]
 * @param {THREE.Object3D[]} [opts.clickable]
 * @returns {boolean}
 */
export function removeUserWallImage(art, { clickable } = {}) {
    if (!art?.userData?.isUserArt) return false;

    if (Array.isArray(clickable)) {
        const i = clickable.indexOf(art);
        if (i >= 0) clickable.splice(i, 1);
    }

    if (art.parent) art.parent.remove(art);

    const url = art.userData.imageFile;
    if (typeof url === "string" && url.startsWith("blob:")) {
        try {
            URL.revokeObjectURL(url);
        } catch (_) {}
    }

    const mat = art.material;
    if (mat) {
        if (mat.map) mat.map.dispose();
        mat.dispose();
    }
    if (art.geometry) art.geometry.dispose();

    art.userData.isUserArt = false;
    return true;
}

/**
 * Developer-mode control: after clicking a wall (crosshair), upload a local
 * image and hang it at that spot. Size + X/Y% sliders adjust the last placed
 * image (size also presets the next upload). Persists via `session` when set.
 *
 * @param {object} opts
 * @param {ReturnType<typeof createWallClickHelper>} opts.wallClick
 * @param {ReturnType<typeof createAddUserWallImage>} opts.addUserWallImage
 * @param {THREE.Object3D[]} [opts.clickable]
 * @param {ReturnType<typeof createUserArtSession>|null} [opts.session]
 * @param {number} opts.floorY
 * @param {number} opts.ceilingY
 * @param {ReturnType<typeof outlineBounds>} [opts.bounds]
 * @param {number} [opts.wallInset=0.05]
 * @param {HTMLElement} [opts.stage]
 * @param {number} [opts.defaultWidth=DEFAULT_USER_ART_WIDTH]
 * @param {number} [opts.minWidth=0.5]
 * @param {number} [opts.maxWidth=20]
 * @param {(() => void)|null} [opts.playAppearSfx]  Page flip when a new image is hung
 * @returns {{ panel: HTMLElement|null, button: HTMLButtonElement|null, deleteButton: HTMLButtonElement|null, input: HTMLInputElement|null, slider: HTMLInputElement|null, xSlider: HTMLInputElement|null, ySlider: HTMLInputElement|null, ready: Promise<void> }}
 */
export function initDevWallUpload({
    wallClick,
    addUserWallImage,
    clickable,
    session = null,
    floorY,
    ceilingY,
    bounds,
    wallInset = 0.05,
    stage,
    defaultWidth = DEFAULT_USER_ART_WIDTH,
    minWidth = 0.5,
    maxWidth = 20,
    playAppearSfx = null,
} = {}) {
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
    } else if (button.parentElement !== actions) {
        actions.appendChild(button);
    }

    let deleteButton = document.getElementById("dev-wall-upload-delete");
    if (!deleteButton) {
        deleteButton = document.createElement("button");
        deleteButton.id = "dev-wall-upload-delete";
        deleteButton.type = "button";
        deleteButton.textContent = "delete image";
        actions.appendChild(deleteButton);
    } else if (deleteButton.parentElement !== actions) {
        actions.appendChild(deleteButton);
    }

    const ensureSliderRow = (rowId, sliderId, labelId, { min, max, step, prefix }) => {
        let row = document.getElementById(rowId);
        if (!row) {
            row = document.createElement("div");
            row.id = rowId;
            row.className = "dev-wall-upload-slider-row";
            panel.appendChild(row);
        } else {
            row.classList.add("dev-wall-upload-slider-row");
        }
        let nameEl = row.querySelector(".dev-wall-upload-slider-name");
        if (!nameEl) {
            nameEl = document.createElement("span");
            nameEl.className = "dev-wall-upload-slider-name";
            nameEl.textContent = prefix;
            row.insertBefore(nameEl, row.firstChild);
        } else {
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
        } else {
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

    const size = ensureSliderRow(
        "dev-wall-upload-size-row",
        "dev-wall-upload-size",
        "dev-wall-upload-size-label",
        { min: minWidth, max: maxWidth, step: 0.05, prefix: "size" }
    );
    const posX = ensureSliderRow(
        "dev-wall-upload-x-row",
        "dev-wall-upload-x",
        "dev-wall-upload-x-label",
        { min: 0, max: 100, step: 1, prefix: "x" }
    );
    const posY = ensureSliderRow(
        "dev-wall-upload-y-row",
        "dev-wall-upload-y",
        "dev-wall-upload-y-label",
        { min: 0, max: 100, step: 1, prefix: "y" }
    );

    let resetButton = document.getElementById("dev-wall-upload-reset");
    if (!resetButton) {
        resetButton = document.createElement("button");
        resetButton.id = "dev-wall-upload-reset";
        resetButton.type = "button";
        resetButton.textContent = "reset art";
        panel.appendChild(resetButton);
    } else {
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

    /** @type {THREE.Mesh|null} */
    let lastArt = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    let syncTimer = null;

    const fmtWidth = (w) => `${Number(w).toFixed(2)}m`;
    const fmtPct = (v) => `${Math.round(Number(v))}%`;

    const syncLabels = () => {
        size.label.textContent = fmtWidth(slider.value);
        posX.label.textContent = fmtPct(xSlider.value);
        posY.label.textContent = fmtPct(ySlider.value);
    };

    const syncPosFromArt = (art) => {
        if (!art?.userData?.placement) return;
        const { uX = 0.5, uY = 0.5 } = art.userData.placement;
        xSlider.value = String(Math.round(clamp01(uX) * 100));
        ySlider.value = String(Math.round(clamp01(uY) * 100));
    };

    const scheduleSync = () => {
        if (!session || !lastArt) return;
        if (syncTimer) clearTimeout(syncTimer);
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
        if (!lastArt) return;
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
        addUserWallImage(
            placement.wall,
            placement.x,
            file,
            width,
            { heightFromFloor: placement.heightFromFloor }
        ).then(async (art) => {
            if (art) {
                lastArt = art;
                slider.value = String(art.userData.artWidth ?? width);
                syncPosFromArt(art);
                if (typeof playAppearSfx === "function") playAppearSfx();
                if (session) {
                    try {
                        await session.remember(art, file);
                    } catch (err) {
                        console.warn("user art remember failed", err);
                    }
                }
            }
            syncEnabled();
        });
    };

    const deleteLastArt = async () => {
        if (!lastArt) return;
        const art = lastArt;
        lastArt = null;
        if (session) {
            try {
                await session.forget(art);
            } catch (err) {
                console.warn("user art forget failed", err);
                removeUserWallImage(art, { clickable });
            }
        } else {
            removeUserWallImage(art, { clickable });
        }
        syncEnabled();
    };

    const handleArtRemoved = (art) => {
        if (art && lastArt === art) lastArt = null;
        syncEnabled();
    };

    const resetAllArt = async () => {
        lastArt = null;
        if (session) {
            try {
                await session.forgetAll();
            } catch (err) {
                console.warn("user art reset failed", err);
            }
        } else if (Array.isArray(clickable)) {
            for (const mesh of [...clickable.filter((o) => o?.userData?.isUserArt)]) {
                removeUserWallImage(mesh, { clickable });
            }
        }
        syncEnabled();
    };

    button.addEventListener("click", (e) => {
        e.stopPropagation();
        if (button.disabled) return;
        input.value = "";
        input.click();
    });

    deleteButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (deleteButton.disabled) return;
        deleteLastArt();
    });

    resetButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (resetButton.disabled) return;
        resetAllArt();
    });

    input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (file) placeFromFile(file);
    });

    const bindSlider = (range, onInput) => {
        range.addEventListener("pointerdown", (e) => e.stopPropagation());
        range.addEventListener("click", (e) => e.stopPropagation());
        range.addEventListener("input", onInput);
    };

    bindSlider(slider, () => {
        syncLabels();
        if (!lastArt) return;
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
        if (!session) return;
        try {
            const meshes = await session.hydrate();
            if (meshes.length) {
                lastArt = meshes[meshes.length - 1];
                slider.value = String(
                    lastArt.userData.artWidth ?? defaultWidth
                );
                syncPosFromArt(lastArt);
            }
            syncEnabled();
        } catch (err) {
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
}

/**
 * Wall-mounted video screen with black bezel + power LED (blue placeholder for now).
 * Clickable for hover cursor; default hit handler does nothing.
 *
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {number} opts.roomHalfY  `-floorY`
 * @param {number} [opts.floorY=-roomHalfY]
 * @param {number} [opts.ceilingY=roomHalfY]
 * @param {number} [opts.heightFromFloor=DEFAULT_ART_HEIGHT_FROM_FLOOR]
 *   Default frame-center height above the floor (same gallery eye-line as art).
 * @param {THREE.Object3D[]} opts.clickable
 * @param {ReturnType<typeof outlineBounds>} opts.bounds
 * @param {number} [opts.wallInset=0.05]
 */
export function createAddWallVideoScreen({
    scene,
    roomHalfY,
    floorY = -roomHalfY,
    ceilingY = roomHalfY,
    heightFromFloor = DEFAULT_ART_HEIGHT_FROM_FLOOR,
    clickable,
    bounds,
    wallInset = 0.05,
}) {
    /**
     * @param {string} wall  north|south|east|west
     * @param {number} x  Along-wall offset from center
     * @param {number} screenWidth  Visible screen width (inside the bezel)
     * @param {object} [options]
     * @param {number} [options.heightFromFloor]  Override frame-center height above floor
     * @param {number} [options.aspect=16/9]
     * @param {number} [options.color=0x1a4cff]  Screen fill (TV blue)
     * @param {number} [options.bezel=0.12]  Frame border width (top + sides)
     * @param {number} [options.bezelBottom]  Bottom chin width (defaults to ~1.75× bezel)
     * @param {number} [options.depth=0.09]  Frame thickness into the room
     * @param {number} [options.frameColor=0x111111]
     * @param {string|null} [options.videoUrl=null]  YouTube URL assigned to this screen
     * @param {string|null} [options.previewSrc=null]  Looping screen preview (mp4/webm; gif not animated in WebGL)
     * @param {number} [options.previewSpeed=0.4]  Playback rate for the preview loop
     * @param {false|'metal'|'molding'|number} [options.conduit=false]
     *   Drop conduit from monitor bottom to floor. `metal` matches junction-box gray,
     *   `molding` is gallery off-white, or pass a hex color.
     * @returns {THREE.Group|null}
     */
    return function addWallVideoScreen(
        wall,
        x,
        screenWidth,
        {
            heightFromFloor: heightFromFloorOpt,
            aspect = 16 / 9,
            color = 0x1a4cff,
            bezel = 0.12,
            bezelBottom,
            depth = 0.09,
            frameColor = 0x111111,
            videoUrl = null,
            previewSrc = null,
            previewSpeed = 0.4,
            conduit = false,
        } = {}
    ) {
        const screenHeight = screenWidth / aspect;
        const bottom = bezelBottom ?? bezel * 1.75;
        const frameW = screenWidth + bezel * 2;
        const frameH = screenHeight + bezel + bottom;
        // Shift screen up so the extra chin sits below it.
        const screenY = (bottom - bezel) / 2;

        const monitor = new THREE.Group();
        monitor.userData.isVideoScreen = true;
        monitor.userData.videoUrl = videoUrl;

        const frameMat = new THREE.MeshStandardMaterial({
            color: frameColor,
            roughness: 0.85,
            metalness: 0.05,
        });
        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(frameW, frameH, depth),
            frameMat
        );
        // Local +Z faces into the room after placeOnWall; back of box sits on the wall.
        frame.position.z = depth / 2;
        frame.userData.isVideoScreen = true;
        frame.userData.videoUrl = videoUrl;
        monitor.add(frame);

        let screenMat = new THREE.MeshBasicMaterial({ color });
        let previewVideo = null;

        if (previewSrc) {
            // WebGL won't animate GIFs via TextureLoader — prefer mp4/webm VideoTexture.
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
                video.play().catch(() => {});
            };
            video.addEventListener("canplay", tryPlay, { once: true });
            tryPlay();
            runOnFirstPointerDown(tryPlay);
        }

        const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(screenWidth, screenHeight),
            screenMat
        );
        // Sit on the front face of the bezel, slightly proud so it doesn't z-fight.
        screen.position.set(0, screenY, depth + 0.002);
        screen.userData.isVideoScreen = true;
        screen.userData.videoUrl = videoUrl;
        monitor.add(screen);

        // Bright red power LED at bottom-right of the front bezel.
        const ledR = Math.min(0.01, bezel * 0.14);
        const led = new THREE.Mesh(
            new THREE.SphereGeometry(ledR, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xff1a1a })
        );
        const ledInset = bottom * 0.45;
        led.position.set(
            frameW / 2 - Math.min(ledInset, bezel * 0.55),
            -frameH / 2 + ledInset,
            depth + 0.004
        );
        led.userData.isVideoScreen = true;
        led.userData.videoUrl = videoUrl;
        monitor.add(led);

        const roomH = ceilingY - floorY;
        const minHff = frameH / 2;
        const maxHff = roomH - frameH / 2;
        const hff = Math.max(
            minHff,
            Math.min(maxHff, heightFromFloorOpt ?? heightFromFloor)
        );

        if (
            !placeOnWall(
                monitor,
                wall,
                x,
                null,
                frameW / 2,
                bounds,
                wallInset,
                { heightFromFloor: hff, floorY }
            )
        ) {
            return null;
        }

        if (conduit !== false && conduit != null) {
            // Thinner than junction-box conduit (0.032).
            const MONITOR_CONDUIT_RADIUS = 0.022;
            const METAL = 0xb4b4b4; // DEFAULT_BOX_COLOR
            const MOLDING_OFFWHITE = 0xf7f7f7;
            let conduitColor = METAL;
            if (conduit === "molding") conduitColor = MOLDING_OFFWHITE;
            else if (conduit === "metal") conduitColor = METAL;
            else if (typeof conduit === "number") conduitColor = conduit;

            const bottomOfFrame = -frameH / 2;
            const ly = floorY + hff;
            const floorLocalY = floorY - ly;
            const conduitLen = bottomOfFrame - floorLocalY;
            if (conduitLen > 0) {
                const tube = new THREE.Mesh(
                    new THREE.CylinderGeometry(
                        MONITOR_CONDUIT_RADIUS,
                        MONITOR_CONDUIT_RADIUS,
                        conduitLen,
                        12
                    ),
                    new THREE.MeshStandardMaterial({ color: conduitColor })
                );
                // Sit toward the wall side of the frame depth (local +Z into room).
                tube.position.set(
                    0,
                    (bottomOfFrame + floorLocalY) / 2,
                    depth * 0.25
                );
                monitor.add(tube);
            }
        }

        monitor.userData.previewVideo = previewVideo;
        clickable.push(frame, screen);
        scene.add(monitor);
        return monitor;
    };
}

// =============================================================================
// Music / sound
// =============================================================================

/**
 * Background music toggle + one-shot SFX, persisted via localStorage.
 */
export function createMusicControls({
    musicPath,
    volume = 0.25,
    sfxVolume = 1,
    /** Optional looping layer (e.g. fluorescent buzz) gated by room lights. */
    lightBuzzPath = null,
    lightBuzzVolume = 0.2,
    toggleEl = document.getElementById("music-toggle"),
    soundPrefKey = SOUND_PREF_KEY,
} = {}) {
    const readSoundPref = () => {
        try {
            const v = localStorage.getItem(soundPrefKey);
            if (v === null) return false;
            return v === "1" || v === "true";
        } catch {
            return false;
        }
    };

    const writeSoundPref = (on) => {
        try {
            localStorage.setItem(soundPrefKey, on ? "1" : "0");
        } catch (_) {}
    };

    let IS_SOUND_ON = readSoundPref();
    let lightsOn = true;
    let musicAudio = null;
    let lightBuzzAudio = null;

    const ensureMusicAudio = () => {
        if (musicAudio) return musicAudio;
        musicAudio = new Audio(musicPath);
        musicAudio.loop = true;
        musicAudio.volume = volume;
        return musicAudio;
    };

    const ensureLightBuzzAudio = () => {
        if (!lightBuzzPath) return null;
        if (lightBuzzAudio) return lightBuzzAudio;
        lightBuzzAudio = new Audio(lightBuzzPath);
        lightBuzzAudio.loop = true;
        lightBuzzAudio.volume = lightBuzzVolume;
        return lightBuzzAudio;
    };

    const syncLightBuzz = async () => {
        const a = ensureLightBuzzAudio();
        if (!a) return;
        try {
            if (IS_SOUND_ON && lightsOn) {
                if (a.paused) await a.play();
            } else {
                a.pause();
            }
        } catch (_) {}
    };

    const setLightsOn = (on) => {
        lightsOn = !!on;
        syncLightBuzz();
    };

    const syncMusicToggleUi = () => {
        if (!toggleEl) return;
        toggleEl.textContent = IS_SOUND_ON ? "🔊" : "🔇";
        toggleEl.title = IS_SOUND_ON ? "mute sound" : "play sound";
        toggleEl.setAttribute(
            "aria-label",
            IS_SOUND_ON ? "mute sound" : "play music"
        );
    };

    const isSoundOn = () => IS_SOUND_ON;

    const toggleMusic = async () => {
        const a = ensureMusicAudio();
        try {
            if (IS_SOUND_ON) {
                a.pause();
                IS_SOUND_ON = false;
            } else {
                await a.play();
                IS_SOUND_ON = true;
            }
        } catch (err) {
            console.warn("sound play blocked or failed", err);
        }
        writeSoundPref(IS_SOUND_ON);
        syncMusicToggleUi();
        await syncLightBuzz();
    };

    if (toggleEl) {
        toggleEl.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleMusic();
        });
    }

    const restore = async () => {
        syncMusicToggleUi();
        if (!IS_SOUND_ON) return;
        try {
            await ensureMusicAudio().play();
        } catch (_) {}
        await syncLightBuzz();
        syncMusicToggleUi();
    };

    const playSfx = (soundPath, vol = sfxVolume) => {
        if (!IS_SOUND_ON) return Promise.resolve();
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

    const checkAndActivateAudio = createCheckAndActivateAudio({
        ensureMusicAudio,
        afterActivate: syncLightBuzz,
        soundPrefKey,
    });
    runOnFirstPointerDown(checkAndActivateAudio);

    return {
        ensureMusicAudio,
        isSoundOn,
        toggleMusic,
        playSfx,
        restore,
        syncMusicToggleUi,
        setLightsOn,
        syncLightBuzz,
    };
}

// =============================================================================
// Viewport + windowed mode
// =============================================================================

export function bindViewport({ camera, renderer, stage, onResize } = {}) {
    const syncViewportSize = () => {
        const host = stage || document.getElementById("stage");
        const w = Math.max(1, host.clientWidth);
        const h = Math.max(1, host.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        if (typeof onResize === "function") onResize();
    };
    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);
    window.addEventListener("orientationchange", () =>
        setTimeout(syncViewportSize, 150)
    );
    const host = stage || document.getElementById("stage");
    if (host) {
        host.addEventListener("fullscreenchange", syncViewportSize);
        host.addEventListener("webkitfullscreenchange", syncViewportSize);
    }
    return syncViewportSize;
}

export function bindWindowedToggle({ syncViewportSize } = {}) {
    const toggleWindowed = () => {
        document.body.classList.toggle("is-windowed");
        if (typeof syncViewportSize === "function") syncViewportSize();
    };
    document.addEventListener("keydown", (e) => {
        if (e.key !== "f" && e.key !== "F") return;
        if (e.target.closest("input, textarea, [contenteditable]")) return;
        e.preventDefault();
        toggleWindowed();
    });
    return toggleWindowed;
}

// =============================================================================
// Orbit pointer interaction
// =============================================================================

/**
 * Drag-to-orbit + hover/click raycast against `clickable`.
 * @returns {{ getAngle: () => number, setAngle: (a: number) => void, isDragging: () => boolean }}
 */
export function bindOrbitPointer({
    canvas,
    camera,
    clickable,
    onHit,
    dragSens = 0.005,
    dragThreshold = 4,
    getAngle,
    setAngle,
} = {}) {
    let angle = typeof getAngle === "function" ? getAngle() : 0;
    const readAngle = () =>
        typeof getAngle === "function" ? getAngle() : angle;
    const writeAngle = (a) => {
        angle = a;
        if (typeof setAngle === "function") setAngle(a);
    };

    let dragging = false;
    let didDrag = false;
    let lastX = 0;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    canvas.style.cursor = "grab";

    canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        dragging = true;
        didDrag = false;
        lastX = e.clientX;
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
        if (Math.abs(dx) > dragThreshold) didDrag = true;
        lastX = e.clientX;
        writeAngle(readAngle() + dx * dragSens);
    });

    const endDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        canvas.style.cursor = "grab";
        try {
            canvas.releasePointerCapture(e.pointerId);
        } catch (_) {}

        if (didDrag) return;
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(clickable);
        if (!hits.length) return;
        if (typeof onHit === "function") onHit(hits[0].object);
    };

    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    return {
        getAngle: readAngle,
        setAngle: writeAngle,
        isDragging: () => dragging,
    };
}

// =============================================================================
// View facing (cardinal) — localStorage only, for door transitions
// =============================================================================

const VIEW_FACING_KEY = "y9k-view-facing";
const VIEW_FACINGS = new Set(["north", "south", "east", "west"]);

/**
 * Map travel/facing direction to orbit angle.
 * angle=0 → camera on +Z looking toward −Z (north).
 */
export function viewFacingToAngle(facing) {
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
}

/**
 * @param {string} [fallback="north"]
 * @returns {"north"|"south"|"east"|"west"}
 */
export function readStoredViewFacing(fallback = "north") {
    try {
        const v = localStorage.getItem(VIEW_FACING_KEY);
        if (v && VIEW_FACINGS.has(v)) return v;
    } catch (_) {}
    return VIEW_FACINGS.has(fallback) ? fallback : "north";
}

/**
 * Persist cardinal facing for the next room load (set when entering a door).
 * @param {string} facing  north|south|east|west (usually door.userData.wall)
 */
export function writeStoredViewFacing(facing) {
    if (!VIEW_FACINGS.has(facing)) return;
    try {
        localStorage.setItem(VIEW_FACING_KEY, facing);
    } catch (_) {}
}

// =============================================================================
// Room app bootstrap
// =============================================================================

const DEFAULT_DOOR_LOCKED_SOUND = "music/door-soft-complete.mp3";
const DEFAULT_DOOR_UNLOCKED_SOUND = "music/door-soft-complete.mp3";
const DEFAULT_LIGHT_SWITCH_SOUND = "music/door-locked.mp3";
const DEFAULT_PAGE_SFX = "music/page-3.mp3";

/**
 * Canvas, renderer, scene, camera, music, viewport, orbit, wall-click, optional lightbox.
 *
 * Camera height defaults to the gallery POV eye-line
 * (`DEFAULT_CAMERA_HEIGHT_FROM_FLOOR` above `floorY`). Pass absolute `camY` /
 * `lookAtY` to override (legacy).
 *
 * Typical flow:
 *   const app = createRoomApp({ musicPath, floorY, heightFromFloor, ... });
 *   const layout = createRoomLayout({ scene: app.scene, outline, floorY, ... });
 *   // place props / doors
 *   app.startLoop();
 */
export function createRoomApp({
    musicPath,
    musicVolume = 0.25,
    /** Optional looping fluorescent buzz; plays over music while lights are on. */
    lightBuzzPath = null,
    lightBuzzVolume = 0.2,
    /** Absolute camera Y (overrides heightFromFloor when set). */
    camY = null,
    orbitRadius = 1.4,
    /** Absolute look-at Y (overrides lookAtHeightFromFloor when set). */
    lookAtY = null,
    /**
     * Camera / eye height above the floor. Defaults slightly above the art eye-line.
     * Ignored when `camY` is set.
     */
    heightFromFloor = DEFAULT_CAMERA_HEIGHT_FROM_FLOOR,
    /**
     * Look-at height above the floor. Defaults to `heightFromFloor` (level gaze).
     * Ignored when `lookAtY` is set.
     */
    lookAtHeightFromFloor = null,
    /** World Y of the floor — camera height is always `floorY + heightFromFloor`. */
    floorY = -DEFAULT_ROOM_HEIGHT / 2,
    autoSpin = 0.00035,
    background = 0x111111,
    enableLightbox = false,
    enableVideoLightbox = false,
    lightboxSfxVolume = 1,
    doorLockedSound = DEFAULT_DOOR_LOCKED_SOUND,
    doorUnlockedSound = DEFAULT_DOOR_UNLOCKED_SOUND,
    lightSwitchSound = DEFAULT_LIGHT_SWITCH_SOUND,
    pageSfx = DEFAULT_PAGE_SFX,
    ambientLight = 0.05,
    directionalLight = 0.04,
    directionalPosition = [1, 3, 2],
    /** Initial on/off for `roomLights` (scene lights + registered fixtures). */
    lightsOn = true,
    /**
     * When true, unlocked doors act locked while room lights are off
     * (locked SFX, no navigation). Gallery rooms only.
     */
    lockDoorsWhenLightsOff = false,
    onHit = null,
} = {}) {
    const resolveCamY = (fromFloor, floor) =>
        camY != null ? camY : floor + fromFloor;
    const resolveLookAtY = (fromFloor, lookFromFloor, floor) =>
        lookAtY != null
            ? lookAtY
            : floor + (lookFromFloor ?? fromFloor);

    let viewFloorY = floorY;
    let viewHeightFromFloor = heightFromFloor;
    let viewLookAtHeightFromFloor = lookAtHeightFromFloor;
    let resolvedCamY = resolveCamY(viewHeightFromFloor, viewFloorY);
    let resolvedLookAtY = resolveLookAtY(
        viewHeightFromFloor,
        viewLookAtHeightFromFloor,
        viewFloorY
    );

    const canvas = document.createElement("canvas");
    const stage = document.getElementById("stage");
    if (!stage) throw new Error("createRoomApp: #stage not found");
    stage.appendChild(canvas);

    const music = createMusicControls({
        musicPath,
        volume: musicVolume,
        lightBuzzPath,
        lightBuzzVolume,
    });

    const lightbox = enableLightbox
        ? setupLightbox({ sfxVolume: lightboxSfxVolume })
        : null;

    const videoLightbox = enableVideoLightbox
        ? setupVideoLightbox({ stage })
        : null;

    const clickable = [];
    let angle = viewFacingToAngle(readStoredViewFacing("north"));

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    if (background != null) {
        scene.background = new THREE.Color(background);
    }

    const camera = new THREE.PerspectiveCamera(
        72,
        window.innerWidth / window.innerHeight,
        0.1,
        100
    );
    camera.position.set(0, resolvedCamY, 0);

    const textureLoader = new THREE.TextureLoader();

    const syncViewportSize = bindViewport({
        camera,
        renderer,
        stage,
        onResize: () => {
            if (lightbox) lightbox.remeasure();
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
        // Match example hallway darkness when off.
        offIntensity: { ambient: 0.05, directional: 0.04 },
        offBackground: 0x111111,
        onChange: (on) => music.setLightsOn(on),
    });
    music.setLightsOn(lightsOn);

    const defaultOnHit = (obj) => {
        if (obj.userData.isVideoScreen) {
            const url = obj.userData.videoUrl;
            if (url && videoLightbox) videoLightbox.open(url);
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
            if (
                obj.userData.locked ||
                (lockDoorsWhenLightsOff && !roomLights.isOn())
            ) {
                music.playSfx(doorLockedSound);
                return;
            }
            const href = obj.userData.href;
            const wall = obj.userData.wall;
            if (typeof wall === "string") writeStoredViewFacing(wall);
            music.playSfx(doorUnlockedSound).then(() => {
                if (href) window.location.href = href;
            });
            return;
        }
        if (obj.userData.imageFile && lightbox) {
            lightbox.open(
                obj.userData.imageFile,
                music.isSoundOn(),
                obj.userData.imageName || null,
                { source: obj }
            );
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

    // Close lightbox on Escape is built-in; also skip orbit hits while open via onHit wrapper if needed.
    if (lightbox) {
        // Re-bind hit so lightbox-open art clicks still work; orbit continues while closed.
    }

    const wallClick = createWallClickHelper({ canvas, camera, stage, scene });

    /**
     * Update camera / look-at from floor-relative heights (e.g. after layout).
     * Absolute camY / lookAtY passed to createRoomApp still win when set.
     */
    const setViewHeight = ({
        floorY: nextFloorY = viewFloorY,
        heightFromFloor: nextHff = viewHeightFromFloor,
        lookAtHeightFromFloor: nextLookHff = viewLookAtHeightFromFloor,
    } = {}) => {
        viewFloorY = nextFloorY;
        viewHeightFromFloor = nextHff;
        viewLookAtHeightFromFloor = nextLookHff;
        resolvedCamY = resolveCamY(viewHeightFromFloor, viewFloorY);
        resolvedLookAtY = resolveLookAtY(
            viewHeightFromFloor,
            viewLookAtHeightFromFloor,
            viewFloorY
        );
        camera.position.y = resolvedCamY;
    };

    const startLoop = () => {
        const loop = () => {
            if (!orbit.isDragging()) angle += autoSpin;
            camera.position.x = Math.sin(angle) * orbitRadius;
            camera.position.y = resolvedCamY;
            camera.position.z = Math.cos(angle) * orbitRadius;
            camera.lookAt(0, resolvedLookAtY, 0);
            renderer.render(scene, camera);
            requestAnimationFrame(loop);
        };
        loop();
    };

    /**
     * Convenience: build prop factories bound to this room after layout exists.
     */
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

    /**
     * Gallery-only: hang local images at the wall-click crosshair in developer mode.
     * Call after `createRoomLayout` so bounds / floorY match the room.
     * Persists placements in IndexedDB (hydrate on load) by default.
     */
    const enableDevWallUpload = ({
        bounds,
        floorY: uploadFloorY = viewFloorY,
        ceilingY,
        roomHalfY = -uploadFloorY,
        wallInset = 0.05,
        heightFromFloor = DEFAULT_ART_HEIGHT_FROM_FLOOR,
        defaultWidth = DEFAULT_USER_ART_WIDTH,
        roomId = typeof location !== "undefined" ? location.pathname : "/",
        persist = true,
        store = null,
    } = {}) => {
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
        const resolvedCeilingY =
            ceilingY != null ? ceilingY : uploadFloorY + DEFAULT_ROOM_HEIGHT;
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

        const placementStore =
            persist === false
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
                } else {
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
}

/** Load a nearest-filtered, optionally repeating texture onto a material. */
export function loadMapOntoMaterial(
    textureLoader,
    material,
    imageFile,
    { repeatX = 1, repeatY = 1, color = 0xffffff } = {}
) {
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
}
