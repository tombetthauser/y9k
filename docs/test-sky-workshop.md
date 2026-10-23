# Test-room sky workshop

The test page is archived at `tests/test.php` outside the public directory. Once deliberately restored, open it in the browser and click the gear icon or the sky through the skylight. Dragging across the
opening still turns the room; a click on a fixture or the lip does not open the sky editor.
This workshop is initialized only in the test page.

## Skies and browser time

The selector offers the current day sky, Stars 1, Doom sunset, Doom sunset 2, and Automatic.
Automatic reads `new Date()` in the visitor's browser and checks the clock every 30 seconds:

- 06:00–17:00: day.
- 17:00–18:30: Doom sunset.
- 18:30–20:00: Doom sunset 2.
- 20:00–06:00: stars.

The day/sunset/night hours are editable under Automatic schedule. The two sunset images split
the sunset interval equally. This is a local-clock schedule, not a geographical sunrise/sunset
calculation. It needs neither a server-time request nor location permission.

The new WebP source files were converted to PNG under `public/assets/rooms/images/skies/`.
The original WebP files remain untouched. PNG preserves the source pixels without another lossy
compression pass. The current day sky still uses `images/static_images/windows.png`.

## Lighting profiles

Each of the four skies has separate profiles for electric lights on and off. Profiles follow
actual light pulses, including flickering. Use Electric lights inside the editor to preview both
states, or use the existing wall switch when the panel is closed.

Room edge lines and skylight edge lines have separate brightness controls in each profile.
Controls include room light brightness, sky and trees, walls/floor/ceiling, the skylight's inside
opening and trim lip, edge lines, ambient/directional/center/daylight intensity, fixture face
brightness, and fixture glow. Surface brightness 1 is normal; 0 is black. Individual light sliders
set their intensity and are multiplied by Room light brightness. Brightness of the sky, trees,
opening, trim, and fixture faces is controlled independently.

The color-target dropdown switches the circular HSV picker and hue/saturation sliders between
room light, skylight lip / inside opening, and computer screen light. Lip tint is saved separately
for each sky and electric-light state; it does not overwrite the room-light color.
The four vertical inside corners use thin cylinders rather than native WebGL lines, allowing
independent thickness (inches) and brightness sliders to work consistently. The wheel's
center is white, its rim is saturated, and angle selects hue. It supports pointer dragging and
arrow keys. Light tint multiplies the room's original light colors, retaining the original warm
fill / blue skylight at zero saturation.

Settings save only in browser local storage, under `y9k-test-sky-workshop-v1`. The Restore button
resets both light states and the computer for the currently displayed sky. It leaves other skies and the schedule
alone. Computer placement, brightness, audio, and neutral-darkening profiles remain managed by the
computer component.

The workshop also includes a Computer shadow section for the selected sky and current electric-light
state. Controls switch immediately when the sky or actual light state changes. Stars/off retains
its special starter shadow; all other sky states start from the standard on/off defaults.

All test-computer settings now save under `y9k-test-computer-sky-v1:<sky>`: placement, on/off
brightness and shadows, the special Stars/off shadow, screen-light settings and color, sound
volumes, auto-rotation, and preview state. The initially selected sky can inherit previous tuning
if it has no saved settings yet. Other new skies start at the hardcoded defaults. The color-picker
target is also remembered separately for each sky in the workshop settings.

Restore this sky's defaults resets both room-light profiles and all computer settings for only
the selected sky. The schedule, selected sky, and other skies' saved settings stay intact. The
computer's own Restore defaults button resets only that sky's computer settings.

The Computer screen light section has enable/disable, intensity, size/reach, falloff, and local
X/Y/Z offsets. Positive Z is in front of the computer, and offsets follow its rotation. The light
illuminates the computer face and surrounding surfaces starting at boot frame 2 (the Windows logo), then switches off
at shutdown-3 (the safe-to-turn-off image). The temporary Preview checkbox allows tuning while idle.
The screen color uses the shared picker with Computer screen light selected. Settings and the preview checkbox persist in the selected sky's computer settings set.

The computer shadow uses neutral multiplicative surface darkening rather than a negative light,
avoiding hue shifts when the room light color changes.

## Code

- `public/helpers.js`: sky selection, browser schedule, profiles, picker, light/material updates,
  and picking the sky opening.
- `public/helpers.js`: scoped yellow editor styles.
- `tests/test.php`: initialization and cache version for the module and converted assets.
- `public/helpers.js`: exposes the existing tree material / outdoor group and a promise for the
  original sky texture. Main rooms keep their existing sky behavior.

Tests: `node --test tests/sky-workshop.test.mjs tests/computer.test.mjs`.
Browser appearance and final brightness values still need a visual check.


Stars / lights-off defaults now match the selected workshop values: sky 0.55, trees 0.05,
inside opening 0.1, lip 0.5, wall 0.95, floor 1.1, room edges 0, skylight edges 0.1,
vertical line thickness 0.07 inches and brightness 0, ambient 0.1, directional 0.55,
center fill 20, daylight 0.05, fixture glow 0.25. Lip color is #d3e8ff.
The screen light defaults to intensity 2.9, reach 36 inches, falloff 2.1, local X/Y/Z 0 / 27 / 9.6,
and hue 229 / saturation 30 percent.

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
