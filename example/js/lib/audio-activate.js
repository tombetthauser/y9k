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
 * @param {string} [opts.soundPrefKey]
 * @returns {() => Promise<void>} checkAndActivateAudio
 */
export function createCheckAndActivateAudio({
    ensureMusicAudio,
    soundPrefKey = SOUND_PREF_KEY,
}) {
    /**
     * If localStorage says audio is unmuted, start background music
     * when it is not already playing. No-op when muted.
     */
    return async function checkAndActivateAudio() {
        if (!readUnmuted(soundPrefKey)) return;

        const a = ensureMusicAudio();
        if (!a.paused) return;

        try {
            await a.play();
        } catch (_) {
            // Still blocked or failed; a later gesture may retry if re-bound.
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
