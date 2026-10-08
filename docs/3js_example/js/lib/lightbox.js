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

    function open(imageFile, isSoundOn = false) {
        resetZoom();
        IS_SOUND_ON = isSoundOn;
        img.onload = () => {
            requestAnimationFrame(() => {
                measureFit();
                scale = 1;
                apply();
            });
        };
        img.src = imageFile;
        caption.href = imageFile;
        caption.textContent = imageFile.split("/").pop();
        root.classList.add("is-open");
        root.setAttribute("aria-hidden", "false");
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

    return { open, close, isOpen, remeasure };
}
