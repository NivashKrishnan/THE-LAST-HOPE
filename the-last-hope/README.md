# THE LAST HOPE

A complete, playable 3D third-person story-adventure + environmental-puzzle game that runs in
the browser. Built with Three.js (vendored, no CDN needed) — zero build tools, zero external
assets. Every texture is procedurally generated, every sound is synthesized with WebAudio.

> *"If you want to restore what was lost, reach the Creator."*

You are **Arin**, a student who survived a worldwide cosmic event. Cities stand empty and the
networks are dead — but a mysterious signal promises a way back. Follow it through four chapters
with **Petalo**, your floating guidance robot, solve environmental puzzles, and reach the
Creator's restoration system.

---

## Run it

The game must be served over HTTP (ES modules don't load from `file://`).

### Windows PowerShell (Built-in Server)
```powershell
cd the-last-hope
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 8123
# Then open http://localhost:8123/ in your browser
```

### Python or Node.js
```bash
# Python
python -m http.server 8123

# Node.js
npx serve -l 8123
```

Chrome, Edge, and Firefox on Windows, Mac, or Linux are fully supported.

## Controls

| Input | Action |
|---|---|
| **W A S D** | Move / Strafe |
| **Mouse** | Camera (click once into the canvas to capture pointer) |
| **Shift** | Sprint |
| **Space** | Jump |
| **E** | Interact (terminals, documents, switches, keys, valves) |
| **Left Mouse Button (LMB)** | **Katana Attack** (3-hit combo: Slash → Slash → Heavy Finisher) |
| **Right Mouse Button (RMB)** | **Katana Block / Parry** (absorbs 85% damage with parry spark VFX) |
| **H** | Ask Petalo for a hint / objective guidance |
| **Esc / P** | Pause menu |

If pointer-lock is unavailable, the game automatically falls back to **drag-to-look**.

---

## Combat & Enemies

### Katana Combat
- **Weapon Discovery**: Located in Chapter 1 in the Armory Lockbox (requires accessing the secret cache).
- **3-Hit Combo**: LMB attacks perform sequential sweeping strikes with forward weapon arcs and cyan slash trails.
- **Finisher Impact**: The 3rd combo hit deals double damage with extended knockback and stagger chance.
- **Defensive Guard**: RMB holds an active blade parry stance. Blocking incoming monster strikes mitigates 85% damage and triggers a metallic deflection chime and sparks.
- **Health & Recovery**: Arin has 100 max HP. Taking lethal damage triggers the Respawn screen, smoothly returning to the active chapter checkpoint without losing puzzle state.

### Monsters & AI
- **Procedural 3D Monster**: Articulated torso, skull with glowing crimson eyes, quadruped clawed limbs, spinal spikes, and organic breathing/stride animations.
- **State Machine**:
  - `PATROL`: Roams designated waypoints with heavy footsteps.
  - `ALERT`: Spots player via line-of-sight and proximity, growling and locking gaze.
  - `CHASE`: Sprints aggressively toward the player, pathfinding through the level.
  - `ATTACK_NORMAL` & `ATTACK_HEAVY`: Windup claw swipes and ground slams telegraphed by eye flare and warning cries.
  - `STAGGER`: Heavy hits interrupt monster attacks and leave it open to counter-strikes.
  - `RETREAT` & `SEARCH`: Monsters wounded below 25% HP retreat to shadow corridors, searching for cover before ambushing or returning to patrol.
- **Final Boss: Void Behemoth**:
  - Encoutered in Chapter 4 guarding the Restoration Matrix.
  - 460 HP, towering 2.3x scale, boss health bar HUD.
  - 3 dynamic combat phases: Dual claw sweep, Ground shockwave slam (must jump to avoid damage), and high-speed Charge attack.
  - Defeating the Behemoth drops the Master Matrix Core required for Puzzle 8.

---

## 8 Environmental Puzzles

1. **Puzzle 1: Symbol Terminal (Ch. 1)** — Match the survivor frequency broadcast code at the city communications array to unlock the northern transit gate.
2. **Puzzle 2: Sequential Conduit Switches (Ch. 2)** — Activate three electrical power relays in correct resonance sequence indicated by the ancient tablet.
3. **Puzzle 3: Power Substation (Ch. 1)** — Insert the dropped Fuse Core into the substation generator to re-route energy to the main gate locks.
4. **Puzzle 4: Archivist Key Vault (Ch. 2)** — Defeat the Forest Hunter to retrieve the Archivist Crest and unlock the sealed subterranean vault.
5. **Puzzle 5: Triple Rune Pedestals (Ch. 2)** — Align the ancient stone runes (Leaf → Moon → Star) revealed by Petalo's clue discoveries.
6. **Puzzle 6: Celestial Clock (Ch. 3)** — Rotate the hour and minute dials on the ancient observatory timepiece to match the cosmic mural alignment (03:45 AM).
7. **Puzzle 7: Auxiliary Thermal Generator (Ch. 3)** — Prime the spark igniter, calibrate the coolant valve, and energize the crystal cavern matrix.
8. **Puzzle 8: Final Restoration Matrix (Ch. 4)** — Enter the grand 6-symbol master cipher (Leaf, Moon, Star, Eye, Wave, Flame) to power the Creator's Gate and trigger the world restoration ending.

---

## Audio & Procedural Sound Synthesis

All audio in **THE LAST HOPE** is synthesized in real time via the WebAudio API (zero audio files or downloads):
- **Combat**: Blade swoosh, metallic katana hits, parry blocks, and combo finisher whooshes.
- **Monsters**: Dynamic footsteps, low sub-bass growls, piercing alert roars, impact grunts, and death dispersion rumble.
- **Ambience & Tension**: Adaptive tension drone that fades in seamlessly whenever a hostile creature enters alert/chase radius.
- **Interactive Mechanisms**: Mechanical switch clunks, clock ticks, chime bells, generator hums, and heavy stone door grinding.

---

## Code Architecture

```
the-last-hope/
├── index.html          # UI DOM, HUD (HP, Boss bar, Katana combo), Modals (Clock, Key, Reader)
├── serve.ps1           # Built-in lightweight HTTP server for Windows PowerShell
├── lib/three.module.js # Three.js r160 (vendored)
└── src/
    ├── main.js         # Game orchestrator, loop, combat integration, input listeners
    ├── player.js       # Player movement controller, camera, katana bone attachments
    ├── combat.js       # CombatSystem, Katana 3D procedural model, combos, hitboxes, VFX
    ├── monster.js      # Monster & VoidBehemoth boss AI, 3D articulated models, attack logic
    ├── puzzles.js      # SymbolPad, ClockPuzzle, KeyPuzzle, SwitchPuzzleController, DocumentReader
    ├── levels.js       # 4 Chapters with progression, enemy encounters, secrets, armory, puzzles
    ├── environment.js  # Procedural PBR scatter, materials, atmospheric lighting
    ├── petalo.js       # Floating companion AI, illumination, hint detection
    ├── interactables.js# Interaction base class with proximity markers and tooltips
    ├── ui.js           # UI controller: Health bars, HUD pips, dialogue modals, death screens
    ├── audio.js        # Procedural WebAudio synthesizers (combat, monsters, puzzles, ambience)
    ├── vfx.js          # Particle bursts, sparks, shockwaves, rings, beams
    ├── save.js         # localStorage persistence (checkpoints, clues, puzzles)
    └── util.js         # Math helpers, collision tests, procedural textures
```

## Porting notes (UE5 Blueprints)

Each JS system maps 1:1 to a Blueprint concept if you rebuild this in UE5:
`Interactable` → a `BPI_Interact` interface + a `BP_InteractableBase` actor; `SymbolPad` → a
`WBP_RunePuzzle` widget; `Petalo` → a floating Pawn with a simple behavior state enum;
`levels.js` scripts → Level Blueprint event graphs; the objective manager → a GameInstance
subsystem; the save system → `USaveGame`; cinematics → Level Sequencer; the guidance beam and
bursts → Niagara systems.

---

*Prototype scope by design: four small connected locations, one complete polished loop.*
Made as a faithful playable interpretation of the THE LAST HOPE master prompt.
