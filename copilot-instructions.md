# Copilot Instructions — 007 入子彈 (Online Multiplayer Transformation)

## Project Objective
The current project is a single-browser, turn-based local multiplayer HTML5 game implemented entirely in `index.html` using vanilla JS and Tailwind CSS. 
The goal is to transform this into a **Serverless Online Multiplayer Web App** using **Firebase Realtime Database** for state synchronization and **Firebase Anonymous Authentication** for user identity.

## Tech Stack & Architecture
- **Frontend**: Vanilla JavaScript (ES6 Modules), HTML5, Tailwind CSS (via CDN).
- **Backend/State Sync**: Firebase Realtime Database (via v10 Modular SDK CDN).
- **Authentication**: Firebase Anonymous Auth.
- **Hosting**: Firebase Hosting.
- **Architecture Paradigm**: Serverless / Host-Client model. One player creates a room and acts as the "Host" (responsible for running the game resolution logic), while others act as "Clients" (submitting actions and listening for state changes).

---

## My Firebase Configuration
*Copilot: Please use this configuration when initializing Firebase in the codebase.*

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAsowaXjAhhoOnge5fjzb0UrMwvTzZfSKE",
  authDomain: "minigame-b258e.firebaseapp.com",
  databaseURL: "https://minigame-b258e-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "minigame-b258e",
  storageBucket: "minigame-b258e.firebasestorage.app",
  messagingSenderId: "1073020133596",
  appId: "1073020133596"
};
```

## Game Logic Overview
- Single-browser, turn-based local multiplayer HTML5 game titled “007 入子彈”.
- Implemented in a single `index.html` file using vanilla JS and Tailwind for styling.

Core Rules (as implemented)
- Actions per turn: `reload` (入子彈), `shield` (保護網), `shoot` (呯呯呯).
- `reload`: +1 bullet; player is vulnerable if attacked this turn.
- `shield`: blocks incoming shots this turn; cannot be used two turns in a row (checked via `lastAction`).
- `shoot`: consumes 1 bullet; requires selecting a target. If target is reloading, target dies; if target is shielding, target survives. If two players shoot each other directly, shots can cancel.
- A player with 0 bullets cannot `shoot`.

Data model (in-memory)
- `players`: array of player objects with fields: `idx`, `name`, `emoji`, `type` ('human'|'ai'), `bullets`, `isAlive`, `lastAction`, `currentAction`, `currentTarget`.
- `currentBeat`, `startBeat`, `gameActive`, `showBulletCount`, `humanCount`, `turnTimer` global state variables.

Important UI pieces
- Setup screen: `#setup-screen` — choose player count, timer, show bullets, name and type per player. JS populates `#player-config-list`.
- Game UI: `#game-ui` with `#game-arena` (circular layout), `beat-counter`, `game-status`.
- Control pods: created for human players (`.control-pod` with three buttons) and positioned around the arena.
- Target modal: `#target-modal` and `#target-list` for choosing a shoot target.
- Victory screen: `#victory-screen` shown when 0 or 1 players remain alive.

Key functions
- `updateConfigList()` — renders player setup entries.
- `renderArena()` — positions player nodes + control pods in a circle; updates avatars, shield and bullet UI elements.
- `startTurnCycle()` — initializes `currentBeat` and calls `runCountdown()`.
- `runCountdown()` — handles visual countdown and triggers AI at mid-beat and `resolveActions()` when timer hits 0.
- `handleInput(pIdx, action)` — registers human action, enforces constraints (no consecutive shield, cannot shoot with 0 bullets).
- `openTargetModal(shooterIdx)` / `closeTargetModal()` — target selection flow for shooting.
- `runAI(p)` — simple random choice among allowed actions (`reload`, `shield` unless last was shield, `shoot` if bullets > 0). Chooses random live target when shooting.
- `resolveActions()` — core resolution algorithm: collects incoming shots, applies action effects (bullets change, shield visuals), then computes `victims` according to implemented rules, marks players dead, updates UI, and resets action flags.
- `checkGameEnd()` — ends game if <=1 alive and shows `#victory-screen`, else starts next turn.

Action resolution details (implementation notes)
- Every alive player without a chosen action defaults to `reload`.
- `incomingShots` is built as an array of attacker indices per target.
- Death conditions implemented:
  - If target received shots and is `shield`, they survive.
  - If target is `reload` and has incoming shots -> die.
  - If target is `shoot`: resolution checks whether they were targeted by their own target and whether third-party shots exist. Implementation uses logic that can mark a shooter as victim depending on whether their target shot them back or third parties shot them.
- After marking victims, UI shows elimination and hides control pod for humans.

Known behaviors & constraints
- Single-file app: all logic, markup, and styles live in `index.html`.
- AI is non-deterministic and simple (random). No difficulty levels.
- Shield constraint enforced by `p.lastAction === 'shield'` check in `handleInput` and AI choices.
- Button UI updates behave differently when `humanCount > 1` (skips per-player selected highlight).
- No persistent state or networking; designed for pass-and-play on same device.

Potential issues or improvement areas
- The action-resolution logic is compact but non-trivial; edge cases (multi-attacker, mutual-shoot scenarios) may need clearer tests and comments.
- UI accessibility: keyboard controls and clearer disabled states for unavailable actions (e.g., shoot when bullets=0) could be improved.
- Move JS into modules and split markup into small templates for maintainability.
- Add unit tests for `resolveActions()` and multi-shot scenarios.