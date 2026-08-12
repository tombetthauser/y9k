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
