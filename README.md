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
| Kick | E | B |
| Active Buster (once found) | Q or middle click | RB |
| Talk / inspect | F             | Y            |
| Continue / retry | Enter       | A            |

## Walkthrough

Head up the path from the crash site. The sealed ruin door sits west of the
Apple Market gate: shoot the glowing crystal in its middle to open it. Inside,
fight through the Reaverbots, grab the Active Buster from the chest on the
ledge in the first big hall, and face the Colossus Reaverbot in the chamber at
the end. Beat it and pick up the Reaverbot core to finish the demo.

## Layout

- `src/engine/` — renderer helpers (toon materials and outlines), input, collision, sound synth
- `src/game/` — player, camera, projectiles, enemies, props and areas

## Roadmap

1. **Foundation** — player controller, cel shading, buster, kick, lock-on, test area ✅
2. **The world** — character select (Mega Man or Roll), Flutter crash site, grassy path, Apple Market with townsfolk, the kickable can and its town theme, sealed ruin entrance ✅
3. **The ruin and boss** — ruin interior, three Reaverbot types, zenny and life drops, Active Buster missiles, three-phase Colossus Reaverbot boss, ruin and boss themes, game over and retry ✅
4. **Polish and ship** — title screen, game over, sound pass, GitHub Pages
