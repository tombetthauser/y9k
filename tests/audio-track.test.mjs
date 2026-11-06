import { helpers } from './helpers-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('ambient wind track changes preserve the wind preference and stop when no track is selected', async () => {
    const originalWindow = globalThis.window;
    const originalStorage = globalThis.localStorage;
    const originalAudio = globalThis.Audio;
    const audios = [];
    globalThis.window = new EventTarget();
    globalThis.localStorage = {
        getItem(key) {
            return key === 'y9k-sound-on' || key === 'y9k-wind-on' ? '1' : null;
        },
        setItem() {},
    };
    globalThis.Audio = class {
        constructor(src) {
            this.src = src;
            this.paused = true;
            this.volume = 1;
            audios.push(this);
        }
        play() {
            this.paused = false;
            return Promise.resolve();
        }
        pause() { this.paused = true; }
    };

    try {
        const music = helpers.createMusicControls({
            musicPath: '/birds-wind.mp3',
            volume: 0.12,
            toggleEl: null,
        });
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(audios.map(audio => audio.src), ['/birds-wind.mp3']);
        await music.setMusicPath('/muffled-wind.mp3', 0.25);
        assert.equal(audios[0].paused, true);
        assert.equal(audios[1].src, '/muffled-wind.mp3');
        assert.equal(audios[1].volume, 0.25);
        assert.equal(audios[1].paused, false);

        await music.setMusicPath(null);
        assert.equal(audios[1].paused, true);
        await music.setWindOn(true);
        assert.equal(audios.length, 2);
    } finally {
        globalThis.window = originalWindow;
        globalThis.localStorage = originalStorage;
        globalThis.Audio = originalAudio;
    }
});
