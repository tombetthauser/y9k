# Portable room computer

The current test room initializes the computer with `addComputer(room, { editor: true })`.
The main page now assigns computers through `$roomComputers` in `public/index.php`.
Only `tom` is currently configured. No database assignments are used. The screen light follows computer power state and defaults
to intensity 2.9, a 36-inch reach, falloff 2.1, and local offsets X 0 / Y 27 / Z 9.6 inches.
Its hue is 229 degrees and saturation is 30%. It first illuminates at boot-2.

## Files to transfer

Keep these beside the existing room code:

- `public/helpers.js`: fixed defaults, screen sequences, sounds, texture loading, lighting profiles, interactions, dialogs, and optional editor.
- `public/helpers.js`: neutral surface-darkening shader, independent of the room light hue.
- `public/helpers.js`: scoped yellow controls and Windows-style document viewer. The module loads this automatically.
- `public/helpers.js`: the existing room renderer, including `roomLights.onChange()` and `app.setAutoSpin()`.
- `public/assets/rooms/models/computer-boot-0.png` through `computer-boot-4.png`, plus `computer-boot-5-complete.png`.
- `public/assets/rooms/models/computer-shutdown-0.png` through `computer-shutdown-3.png`, plus `computer-shutdown-4-complete.png`.
- `public/assets/rooms/audio/computer-modal.wav`, `computer-windows-startup.wav`, and `computer-windows-shutdown.wav`.

The component no longer uses the original glTF, earlier still-image experiments, or buzzing audio.
Those source files and backups are left in place.

## Add to a chosen gallery

Add this import beside the room's other module imports:

```js
import { addComputer } from './helpers.js';
```

Immediately after the existing `await room.mount('#stage')`, add:

```js
// Add the fixed computer after the gallery and its lighting exist.
const computer = await addComputer(room, {
    documentUrl: 'https://docs.google.com/document/d/e/YOUR_PUBLISHED_DOCUMENT/pub?embedded=true',
});
```

This normal mode always uses the hardcoded position and lighting defaults. It does not read test
placement overrides, change the room's automatic rotation, or offer placement controls.
The module gets Three.js, scene units, lighting, and audio from the existing room. No import map,
PHP endpoint, database, or separate Three.js import is needed.

Both pages pass `assetVersion` based on component and asset modification times.
The module forwards that version to its stylesheet and assets. Keep that pattern when integrating
into PHP if automatic cache refresh is desired. A plain HTML page can use the import above.

## Fixed defaults

Placement is identical with lights on or off:

| Setting | Default |
| --- | --- |
| X, inches from north-wall center | 85 |
| Y, inches above floor | 0.1 |
| Z, inches from north wall to rotated prop's nearest edge | 16.5 |
| Width before rotation, inches | 31.7 |
| Rotation, degrees | 322 |

| Lighting setting | Lights on | Lights off |
| --- | --- | --- |
| Shadow X / Y / Z offsets, inches | 8.6 / 2.2 / 1.9 | 8.6 / 2.2 / 1.9 |
| Shadow reach, inches | 37 | 37 |
| Shadow strength | 2.4 | 0.8 |
| Shadow falloff | 0 | 0 |
| Computer brightness | 1.15 | 1 |

Startup volume defaults to 11%; shutdown volume defaults to 6%. Their independent test sliders save under
`y9k-test-computer-volumes-v1`.

Edit `COMPUTER_DEFAULTS` in `helpers.js` to change these values. The darkening now multiplies room-surface brightness equally across RGB, fading toward black
without subtracting colored light. `roomLights.onChange()` switches the active profile on every actual flicker pulse.

## Behavior and timing

- Click/tap boots the computer, then opens the embedded document.
- Dragging turns the room without opening the viewer.
- X, Escape, or a click outside closes the viewer.
- Opening and closing the viewer play the beep. Closing leaves the completed boot image visible for one second, and then shuts down.
- Boot and shutdown each keep their frame, pause duration, and sound together in `COMPUTER_BOOT` and `COMPUTER_SHUTDOWN`.
- Stage playback waits for both the pause and sound. Muted sound does not shorten the animation.
- All computer sounds use the room's existing audio preference. Buzzing is not part of this component.
- Viewer URL, filters, frame, inset edges, top crop, clipped scrollbar, and shadow remain as in the test.

Pass `documentUrl` to choose the iframe document for an instance. In the main page, edit the
`documentUrl` value for that room inside `$roomComputers`. The iframe and address bar share the
same instance value. Omitting it uses `DEFAULT_COMPUTER_DOCUMENT_URL` in `helpers.js`.

`helpers.js` dynamically imports the component only when `addComputer()` is called. Its optional
`assetVersion` argument is forwarded to the module, stylesheet, images, and sounds. Rooms without
an assignment do not load the component or its media.

## Test controls and browser storage

For local tuning only:

```js
// Holding the computer for 1.65 seconds opens its saved test controls.
const computer = await addComputer(room, { editor: true });
```

This preserves the existing placement, on/off lighting, and rotation storage keys. Position and
lighting edits save independently. Restore defaults resets placement, both lighting profiles,
brightness, and both sound volumes; it preserves the separate room auto-rotation preference.

## Removing a mounted computer

```js
// Remove its scene objects, dialogs, pointer listeners, light subscription, and textures.
computer.dispose();
```

`computer.getScreenLight()` / `setScreenLight()` expose screen-light settings to the test workshop.
`setScreenLightPreview()` is a tuning override, saved with the active test sky.

`computer.open()` starts booting, and `computer.close()` closes an open viewer and starts shutdown.
Repeated initialization on the same room returns the existing controller. The component assumes
one computer per page, matching the current design.

## Checks

```sh
node --test tests/computer.test.mjs
php -l tests/test.php
```

Tests cover fixed defaults, saved overrides, frame and sound order, sound completion, cancellation,
asset consistency, and real room-light flicker notifications. Browser appearance and audio still
need a manual check after integration.


The sky workshop passes its selected sky to `computer.setSky()`. Only `stars` with electric lights
off selects `COMPUTER_DEFAULTS.starsOff` (reach 35, strength 0.1, falloff 0.4). The ordinary lights-off
profile retains its prior defaults under a new `shadow-off-v2` storage key, while the scoped night
profile uses `y9k-test-computer-stars-off-shadow-v1`. The old global off-profile key is left intact
but no longer read, preventing earlier nighttime edits from leaking into daytime shadows.


When the test workshop selects a sky, the computer reads and saves its complete editable state
under `y9k-test-computer-sky-v1:<sky>`. This supersedes shared test override keys for that workshop;
normal production instances still use fixed defaults. `restoreSkyDefaults()` resets only the
active sky's computer settings. Workshop reset additionally resets that sky's room-light profiles.
The old keys remain available as a one-time seed for the first selected sky without a saved set.

### Independent sky and light-state settings

The test computer now stores a complete settings snapshot for each of the eight sky/light-state combinations under `y9k-test-computer-sky-v2:<sky>:<on|off>`. Placement, rotation, brightness, shadow, screen light, preview and sound volumes all switch with the sky and actual light state, including flicker. Existing per-sky saves seed each new state once. Both restore buttons reset only the current sky/light-state slot. Room workshop profiles and color-picker targets are also separate by sky and light state; the automatic schedule remains global.

`GALLERY_LIGHTING_DEFAULTS` in `public/helpers.js` supplies the production gallery values to both index.php and test.php. Computer starter values come from the same `COMPUTER_DEFAULTS` used in production. Explicit sunset and stars workshop presets remain in place because production has no corresponding time-of-day presets. Saved browser overrides remain until reset.

### Live California sky system

The approved six-state export is now hardcoded in `public/helpers.js`. It supplies test-room reset defaults and live lighting/computer profiles. Existing test browser overrides remain local; production never reads them.

`public/helpers.js` applies these surfaces only in galleries with an actual skylight. It follows California time (`America/Los_Angeles`, including DST) and seasonal Sacramento sunrise/sunset estimates from `public/helpers.js`. Dawn runs from 30 minutes before sunrise to 30 minutes after; evening runs from 30 minutes before sunset to 30 minutes after. Both use the sunset preset. Day fills the interval between them, and night uses stars. The room configuration panel offers Automatic, Day, Dawn, Evening and Night; manual selection lasts for the current page visit. Every actual light-switch flicker applies the matching on/off profile.

Computers opt into these profiles through `skyProfiles: true`. Their boot/shutdown stages, beep and screen-light gating are unchanged. In enclosed galleries or hallways, only the computer changes: day/on when room lights are on, stars/off when off. Native room lighting stays intact. Baseboard shadows are enabled for live computers as well as the test computer. Production retains its existing camera rotation behavior and room-to-computer assignments.

### Consolidated file layout

All computer and sky code, approved defaults, California timing, shadow shader, modal markup, and scoped styles now live in `public/helpers.js`. `public/index.php` imports `addComputer` and `addSkyLighting` directly from that file. There are no separate computer/sky implementation or stylesheet files. Media assets remain in `public/assets/rooms/` at their existing URLs.

The optional workshop functions are also in helpers.js, but production does not initialize them. The test page is archived at `tests/test.php`; it is not a public entry point. Automated tests import the consolidated helper through a Node-only adapter that stubs the external Three.js import, while the scene integration tests provide their own Three.js fixtures.
