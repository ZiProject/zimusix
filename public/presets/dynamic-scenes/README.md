# Dynamic Scenes

One preset, five music-reactive backgrounds. Pick the scene in **Themes → Customize → Scene**.

| Scene | What you see | How it reacts to the music |
| --- | --- | --- |
| Sakura | a blossoming branch under a dusk sky and moon, petals swirling in a wind field | each beat makes the blossoms pulse and shed a burst of petals; energy strengthens the wind and the flutter; the moon glow breathes with the bass |
| Rainy city | layered rain over a night street, perspective puddle ripples, glowing city bokeh | energy slants and thickens the rain, lamps swell with the bass, the hardest hits call a lightning bolt |
| Fireworks | shells over a skyline and water; peony, tilted ring, spiral, willow and crackle bursts with reflections | every beat launches a shell (two on the hardest hits), energy raises the launch rate and brightness, bass glows the horizon and ripples the water |
| Love hearts | glossy hearts rising like bubbles that pop into sparkles | a lub-dub heartbeat pulse on every beat with an expanding ring and a few new hearts; energy makes hearts rise faster |
| Note rain | musical notes falling in depth layers over a trembling staff | left lanes follow the bass and right lanes the overall energy; each beat sends a shock-wave that swells the notes it passes |

All scenes are original artwork drawn by the app (`src/presets/bg-scenes.js`); the preset itself only chooses
`background.effect` and numbers, so it stays declarative (no JS/HTML).

Customize options (Themes → Customize, or the Background panel in the toolbar): scene, brightness, density, speed, react on/off, reaction strength, cover art
behind the scene, visualizer type, spinning artwork, lyrics size.

`style.css` re-tints the entire interface (accent, panels, text) for each scene through the
`data-bg-effect` attribute on `<html>`.
