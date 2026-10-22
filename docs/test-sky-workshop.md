# Test-room sky workshop

Open `public/test.php` in the browser and click the gear icon or the sky through the skylight. Dragging across the
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
resets both light states for the currently displayed sky. It leaves the other skies and schedule
alone. Computer placement, brightness, audio, and neutral-darkening profiles remain managed by the
computer component.

The workshop also includes a Computer shadow · Stars 1 / lights off section with X/Y/Z offsets, reach,
strength, and falloff. These edit a separate `starsOff` profile that applies only when Stars 1 is the active sky and
electric lights are off. Other skies keep the regular on/off shadows. The preview button selects
stars and turns the lights off. The nighttime shadow defaults are reach 35 inches, strength 0.1,
falloff 0.4, and X/Y/Z offsets 8.6 / 2.2 / 1.9 inches.

The Computer screen light section has enable/disable, intensity, size/reach, falloff, and local
X/Y/Z offsets. Positive Z is in front of the computer, and offsets follow its rotation. The light
illuminates the computer face and surrounding surfaces starting at boot frame 2 (the Windows logo), then switches off
at shutdown-3 (the safe-to-turn-off image). The temporary Preview checkbox allows tuning while idle.
The screen color uses the shared picker with Computer screen light selected. Settings persist
under `y9k-test-computer-screen-light-v1`; preview does not persist.

The computer shadow uses neutral multiplicative surface darkening rather than a negative light,
avoiding hue shifts when the room light color changes.

## Code

- `public/sky-workshop.js`: sky selection, browser schedule, profiles, picker, light/material updates,
  and picking the sky opening.
- `public/sky-workshop.css`: scoped yellow editor styles.
- `public/test.php`: initialization and cache version for the module and converted assets.
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
