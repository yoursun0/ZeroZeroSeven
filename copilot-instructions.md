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

## Core Refactoring Rules for Copilot
Incremental Changes: Do NOT rewrite the entire application at once. Follow the step-by-step prompts below. I will ask for these steps one by one.

Preserve Game Logic: Keep the core game rules, resolveActions(), and Tailwind UI as intact as possible.

Vanilla JS Only: Do not introduce React, React Native, Vue, or Webpack. Stick to Vanilla JS and CDN imports. Use ES6 modules (<script type="module">).

## Step-by-Step Transformation Prompts

Step 1: File Modularization
Prompt: "Please split the current monolithic index.html. Extract the inline JavaScript into a separate game.js file, and extract the custom <style> block into a style.css file. Make sure game.js is imported as an ES6 module (<script type="module" src="game.js"></script>). Ensure the local game still works perfectly after this split."

Step 2: Firebase SDK Integration & Auth Initialization
Prompt: "Please import the Firebase v10 Modular SDKs (App, Auth, and Database) via CDN into game.js. Using the firebaseConfig provided in copilot-instructions.md, initialize the Firebase app. Implement a function to perform Anonymous Authentication (signInAnonymously) on page load. Log the user's uid to the console."

Step 3: Implement Lobby & Room System UI
Prompt: "Create a new 'Lobby' UI section in index.html (hide #setup-screen and #game-ui initially).

Add a 'Create Room' button.

Add a 'Join Room' input field and button.

When 'Create Room' is clicked, generate a random 4-character alphanumeric Room ID, save it to Firebase under rooms/{roomId}, make the current user the 'Host', and join the room.

When 'Join Room' is clicked, validate the Room ID and add the current user to rooms/{roomId}/players.

Display the Room ID and the list of connected players in the UI, listening to Firebase for real-time player updates."

Step 4: Sync Player State & Ready Mechanism
Prompt: "Remove the old local player setup logic. Update the logic so that players data is driven entirely by Firebase (rooms/{roomId}/players). Add a 'Ready' button for clients and a 'Start Game' button for the Host. When the Host clicks 'Start Game', update a gameState flag in Firebase. All clients should listen to this flag to transition from the Lobby UI to the #game-ui arena."

Step 5: Online Action Submission (Client-Side)
Prompt: "Refactor handleInput(pIdx, action). Instead of resolving the game immediately when actions are clicked, clients should write their chosen action (and target, if shooting) to Firebase under rooms/{roomId}/players/{uid}/currentAction. Show a 'Waiting for others...' UI overlay for that player until all players have submitted their actions."

Step 6: Serverless Turn Resolution (Host-Side)
Prompt: "Implement the Host-based turn resolution.

Only the Host's client should listen for all players' actions.

When the Host detects that all alive players have submitted an action, the Host triggers the existing resolveActions() function locally.

The Host then writes the updated game state (bullets, isAlive, new beat count) and action history back to Firebase.

All clients (including the Host) should listen to these state changes, trigger their local animations/UI updates, and clear their action selections for the next turn."


## Existing Game Logic Overview
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