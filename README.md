# Mega Man Legends 3 — browser tech demo

A fan-made Mega Man Legends style tech demo that runs in the browser. Everything
(models, textures, sound effects and music) is generated in code; there are no
asset files.

**Stack:** Three.js, Vite, TypeScript, Web Audio API.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
```

## Controls

| Action  | Keyboard + mouse     | Controller   |
| ------- | -------------------- | ------------ |
| Move    | WASD                 | Left stick   |
| Camera  | Mouse                | Right stick  |
| Jump    | Space                | A            |
| Buster  | Left click           | X or RT      |
| Lock-on | Right click (hold) or Left Shift | LT (hold) |
| Kick    | E                    | B            |

## Layout

- `src/engine/` — renderer helpers (toon materials and outlines), input, collision, sound synth
- `src/game/` — player, camera, projectiles, enemies, props and areas

## Roadmap

1. **Foundation** — player controller, cel shading, buster, kick, lock-on, test area ✅
2. **The world** — Flutter crash site, grassy path, Apple Market with the can and town theme
3. **The ruin and boss** — Reaverbots, zenny, special weapon, giant Reaverbot boss
4. **Polish and ship** — title screen, game over, sound pass, GitHub Pages
