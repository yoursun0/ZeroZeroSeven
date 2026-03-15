# Bug Fixes Summary - March 15, 2026 (Updated)

## Overview
**Eleven critical issues** have been fixed in the multiplayer game:
1. ✅ Timer desynchronization between browsers
2. ✅ Victory screen not showing on losing player's browser
3. ✅ AI player configuration and integration in multiplayer
4. ✅ Player count inconsistency across browsers (game showed 2 vs 3 players)
5. ✅ Emoji assignment incorrect for joining players
6. ✅ Excess AI players not cleaned up when player count decreased
7. ✅ [NEW] Memory leaks from unmanaged Firebase listeners
8. ✅ [NEW] Shoot target validation crash when target invalid
9. ✅ [NEW] Missing listener cleanup on game end and room leave
10. ✅ [NEW] Firebase database not updated with player types during ready status
11. ✅ [NEW] Confusing local-mode panel in lobby (removed)

---

## Issue #1: Timer Synchronization

### Problem
Each browser's countdown timer was independent, causing them to drift apart. One browser might show 5 seconds while another showed 3 seconds.

### Root Cause
`setTimeout` with 1000ms intervals on each browser has different drift/precision. No centralized timing source.

### Solution Implemented
- Store `turnStartTime` in Firebase when host starts a turn
- All clients calculate remaining time using: `elapsed = (Date.now() - turnStartTime) / 1000`
- Display is calculated as: `remainingTime = Math.max(0, startBeat - elapsed)`

### Code Changes
**In `startTurnCycle()`:**
```javascript
if (currentRoomId && isHost) {
    const timestamp = Date.now();
    turnStartTime = timestamp;
    update(ref(database, `rooms/${currentRoomId}`), {
        turnStartTime: timestamp,
        turnStartBeat: startBeat
    });
}
```

**In `runCountdown()`:**
```javascript
if (currentRoomId && turnStartTime) {
    const elapsed = Math.floor((Date.now() - turnStartTime) / 1000);
    currentBeat = Math.max(0, startBeat - elapsed);
}
```

### How to Test
1. Hard refresh both browsers (Ctrl+F5)
2. Create + join room, both ready
3. Start game
4. Watch both countdown timers - they should stay synchronized
5. Both should show the same number (±0-1 second variation OK)

---

## Issue #2: Victory Screen Not Showing on Client

### Problem
When game ends (one player shoots and eliminates the last opponent):
- Host (Player 1) sees victory screen with winner info and "Return to Menu" button
- Client (Player 2) browser is frozen, no victory screen displayed

### Root Cause
Only host's `checkGameEndForMultiplayer()` was being called. Clients waited for turn state changes but never checked if game had actually ended.

### Solution Implemented
Updated `listenToGameStateUpdates()` to:
1. Detect when turn resolution completes (all `currentAction` fields become null)
2. Call `checkGameEndForMultiplayer()` on ALL clients, not just host
3. If game hasn't ended, client continues to next turn

### Code Changes
**In `listenToGameStateUpdates()`:**
```javascript
if (wasWaiting && isNowIdle) {
    console.log('🔄 PLAYER: Detected turn resolution complete');
    
    // Check if game has ended - called on ALL clients
    checkGameEndForMultiplayer();
    
    // If game hasn't ended, client continues
    if (!isHost) {
        hideWaitingOverlay();
        enableActionButtons();
        setTimeout(() => {
            const alive = players.filter(p => p.isAlive);
            if (alive.length > 1) {
                startTurnCycle();
            }
        }, 500);
    }
}
```

### How to Test
1. Follow multiplayer test: create room, join, ready, start game
2. Round 1: Both players submit Reload
3. Round 2: Player 1 shoots Player 2, eliminating them
4. Expected Result:
   - **BOTH browsers** should show victory screen
   - Both show winner emoji and "獲得勝利！" message
   - Both have "返回主選單" button working

---

## Issue #3: AI Players in Multiplayer

### Problem
Multiplayer games could only have human players (via Firebase auth). Adding AI to support 2 humans vs multiple AIs wasn't possible.

### Root Cause  
- Multipler only used locally-joined human players
- AI player configuration wasn't shown in lobby
- AI players couldn't submit actions to Firebase

### Solution Implemented

#### 3A: Player Type UI in Lobby
Added configuration UI to room creator's lobby screen:
- Shows counter of players in room
- For each player slot: emoji + name input + **Human/AI dropdown**
- First player (host) defaults to Human, others default to AI
- Selector: `真人 (Human)` or `電腦 AI (Computer AI)`

#### 3B: Store Player Types in Firebase
When host clicks "Start Game":
- Collect type selection (human/ai) from each dropdown
- Store as: `roomData.playerTypes = {0: 'human', 1: 'ai', 2: 'ai', ...}`
- Create Firebase player entries for AI with synthetic UIDs: `ai-0`, `ai-1`, etc.

#### 3C: AI Action Submission in Multiplayer
**Updated `runCountdown()` at midpoint:**
```javascript
players.forEach(p => {
    if (p.isAlive && p.type === 'ai') {
        runAI(p);  // Generate AI action
        if (currentRoomId && p.uid) {
            // Submit to Firebase with AI's uid
            submitActionToFirebase(p.idx, p.currentAction, p.currentTarget);
        }
    }
});
```

**Updated `submitActionToFirebase()`:**
```javascript
const uid = player.type === 'ai' ? `ai-${pIdx}` : currentUser?.uid;
// Submit action to Firebase with correct UID
```

### Code Changes Made

**In `index.html` - Lobby UI:**
- Added `<div id="player-config-list-lobby">` section in player-setup-section
- Shows player configuration (Human/AI) for each slot

**In `game.js`:**
1. New function: `updateLobbyPlayerConfigList()` - Dynamically creates UI elements
2. Modified: `startGameAsHost()` - Collects player types, stores in Firebase, creates AI player entries
3. Modified: `startMultiplayerGame()` - Loads playerTypes from room, applies to players array
4. Modified: `runCountdown()` - AI players call `submitActionToFirebase()`
5. Modified: `submitActionToFirebase()` - Handles synthetic UIDs for AI players

### How to Test AI Players

**Setup:**
1. Hard refresh host browser (Ctrl+F5)
2. Click "Create Room"
3. In lobby, set:
   - Player Count: 3
   - Player 1: Human (host - locked)
   - Player 2: Human (for you to control)
   - Player 3: AI (computer)
4. Give them names (e.g., "Host", "You", "AI-Bot")
5. Click "Ready" as host

**Test AI behavior:**
1. Another player joins (Player 2, human)
2. Player 2 clicks Ready
3. Host clicks "Start Game"
   - Should see 3 player nodes + 3 control pods (excluding AI)
   - AI player has no buttons (Computer controlled)
4. Round 1:
   - At ~4.5 seconds: AI player automatically submits an action
   - Host and Player 2 can manually submit actions
   - Watch waiting overlay show all 3 players' submission status
5. Resolution: 
   - AI action is included in resolution
   - Proper game state results (kills, shields, reloads)
6. Round 2+: 
   - AI continues playing autonomously
   - Can play multiple rounds with AI

---

## Test Case: Full Multiplayer 2 Humans + 2 AI

**Step-by-step guide:**

1. **Browser 1 (Host):**
   - Hard refresh (Ctrl+F5)
   - Click "Create Room"
   - Set: Players=4, Timer=9     - Player Config: 
     - 0: Human (you)
     - 1: Human (your friend)
     - 2: AI
     - 3: AI
   - Click "Ready"
   - Share room ID

2. **Browser 2 (Friend):**
   - Hard refresh
   - Paste room ID
   - Click "Join Room"
   - See all 4 players in list
   - Notice players 2-3 show "Computer" next to their names? (Actually, in this UI they won't show names since they haven't joined, so we only see the 2 humans who joined)
   - Click "Ready"

3. **Browser 1 (Host):**
   - See Player 2 is ready
   - Notice Button changes to "Start Game" (all ready)
   - Click "Start Game"

4. **Both Browsers:**
   - Should show game arena with 4 player nodes
   - Only 2 control pods (for the 2 humans)
   - AI players have no buttons
   - Countdown starts
   - ~4.5 seconds: AI players auto-submit actions
   - Waiting overlay shows all 4 players status

5. **After Resolution:**
   - Should see results
   - Any eliminations show ❌
   - Both browsers sync properly
   - Both show new round starting

6. **Continue to Round 2:**
   - If no one died, new actions can be submitted
   - Focus on human players with buttons
   - AI players submit automatically again

---

## Console Debugging

When testing, watch console for these logs:

### Timer Sync:
```
🔄 Starting new turn cycle
⏱️ Countdown reached 0, host resolving actions...
```

### AI Players:
```
🧀 HOST: Created AI player ai-0
AI: Submitting action for [Name]: reload
```

### Victory Detection:
```
🔄 PLAYER: Detected turn resolution complete
🏆 Game over! Showing victory screen
```

---

## Browser Testing Checklist

- [ ] Timer stays synchronized (both show same countdown ±1 sec)
- [ ] Victory screen appears on BOTH browsers when game ends
- [ ] AI players configured in lobby show up correctly
- [ ] AI players auto-submit actions at midt turn
- [ ] Can play multiple rounds with AI
- [ ] Game resolution includes AI actions
- [ ] No console errors
- [ ] Chat room works: multiple rounds possible

---

## Issue #4: Game Screen Showed Different Player Counts on Host vs Client (CRITICAL)

### Problem
When testing 2 humans + 1 AI:
- **Host browser**: Game arena showed only 2 player nodes
- **Client browser**: Game arena showed 3 player nodes
- Both were playing the same game, but saw inconsistent game state

### Root Cause
**Two synchronization bugs working together:**

1. **gameState set too early**: `startGameAsHost()` was setting `gameState: 'playing'` BEFORE creating AI players
   - Host and client listeners triggered immediately
   - Client fetched player list before all AI players were created
   - Host fetched player list at slightly different time
   - Race condition caused different player counts

2. **Unpredictable player ordering**: Players array was built using `Object.entries(playersData).map()` 
   - Object iteration order is not guaranteed to be consistent
   - Firebase UIDs (user-xxx) and AI UIDs (ai-x) could return in different orders on different browsers
   - Players could be assigned wrong indices and emojis

### Solution Implemented

#### 4A: Create AI Players BEFORE Setting gameState
**In `startGameAsHost()`:**
```javascript
// BEFORE (broken):
await update(ref(database, `rooms/${currentRoomId}`), {
    gameState: 'playing',  // Listeners trigger immediately!
    ...
});
// Create AI players...

// AFTER (fixed):
// Create AI players...
for (let i = 0; i < playerCount; i++) {
    if (playerTypes[i] === 'ai' && !existingPlayers[`ai-${i}`]) {
        await set(...);  // Create AI player
    }
}
// NOW set gameState after all players exist in Firebase
await update(ref(database, `rooms/${currentRoomId}`), {
    gameState: 'playing',  // Safe to trigger listeners now
    ...
});
```

#### 4B: Build Players Array in Deterministic Order
**In `startMultiplayerGame()`:**
```javascript
// Build array respecting playerTypes[0], [1], [2], ... order
const playerTypeIndices = Object.keys(playerTypes).map(Number).sort((a, b) => a - b);
playerTypeIndices.forEach(typeIdx => {
    const expectedType = playerTypes[typeIdx];
    if (expectedType === 'ai') {
        // Look up AI player by exact index: aiPlayers[typeIdx]
        playerEntry = aiPlayers[typeIdx];
    } else {
        // Get next human from ordered list
        playerEntry = humanPlayers[humanIndex++];
    }
    // Assign to final position...
});
```

### How to Test
1. **Browser A (Host)**: Create room with 3 players (2 human, 1 AI)
2. **Browser B (Client)**: Join and ready
3. **Host**: Click "Start Game"
4. **Expected Result**: 
   - ✅ **BOTH browsers show exactly 3 player nodes** (not 2 vs 3)
   - ✅ All players appear in same order on both browsers
   - ✅ Emoji assignments match across browsers (no mismatches)
   - ✅ Game plays consistently on both browsers

---

## Issue #5: Emoji Assignment Incorrect for Joining Players

### Problem
When players joined a room with AI players already created, they received wrong emoji assignments:
- Setup: 2 humans, 1 AI (expected emojis: 🕵️, 🕶️, 💼)
- Host got: 🕵️ (correct)
- AI-1 got: 🕶️ (correct)
- Joining player got: 💼 (wrong! should be 🕶️)

### Root Cause
**In `joinRoom()`**, emoji was assigned based on total player count in Firebase:
```javascript
const playerCount = Object.keys(playersSnap.val()).length;  // Counts ALL players
const playerIndex = playerCount;  // This includes AI players!
const emoji = emojis[playerIndex];  // Wrong calculation
```

When player 2 joins:
- Firebase has: host + ai-1 = 2 players total
- `playerCount = 2`
- New player gets `emoji[2] = 💼` (incorrect)
- Should get `emoji[1] = 🕶️` (position for 2nd human)

### Solution Implemented
**Count only human players**, not AI players:
```javascript
const humanCount = Object.values(playersInRoom).filter(p => p.type !== 'ai').length;
const playerIndex = humanCount;  // Correct: position of next human
const emoji = emojis[playerIndex];
```

Now when player 2 joins:
- Firebase has: host (type: human) + ai-1 (type: ai) = 2 total, 1 human
- `humanCount = 1`
- New player gets `emoji[1] = 🕶️` (correct!)

### How to Test
1. Create room with 3 players (2 human, 1 AI)
2. After player 2 joins, hover over each player in room list
3. Verify emoji colors match expected seats (🕵️, 🕶️, 💼)
4. Start game and verify arena shows correct emoji positions

---

## Issue #6: Excess AI Players Not Cleaned Up When Player Count Decreased

### Problem
**Scenario:**
1. Host creates room, sets player count to 4
2. Default configuration: [human, ai, ai, ai]
3. AI players ai-1, ai-2, ai-3 created in Firebase
4. Host decreases player count to 2
5. New dropdowns created for 2 players: [human, ai]
6. But ai-1, ai-2, ai-3 still exist in Firebase (orphaned!)
7. When game starts, inconsistent player counts again

### Root Cause
When host adjusted player count slider, `updateLobbyPlayerConfigList()` was called but it only:
- Recreated UI dropdowns for new count
- Did NOT clean up excess AI players from previous configuration

Orphaned AI players remained in Firebase, potentially causing:
- Wrong number of players in game
- Mismatch between expected playerTypes and actual players
- Inconsistent state across browsers

### Solution Implemented
**Enhanced player count change listener:**
```javascript
document.getElementById('player-count-lobby').addEventListener('input', async () => {
    // ... update UI ...
    
    // NEW: Clean up excess AI players
    if (currentRoomId && isHost) {
        const newPlayerCount = parseInt(document.getElementById('player-count-lobby').value);
        const playersRef = ref(database, `rooms/${currentRoomId}/players`);
        const snapshot = await get(playersRef);
        const playersData = snapshot.val() || {};
        
        // Remove any AI players with indices >= newPlayerCount
        for (let i = 0; i < 8; i++) {
            if (i >= newPlayerCount) {
                const aiUid = `ai-${i}`;
                if (playersData[aiUid]) {
                    await remove(ref(database, `rooms/${currentRoomId}/players/${aiUid}`));
                    console.log(`🗑️  Removed excess AI player ai-${i}`);
                }
            }
        }
    }
});
```

### How to Test
1. Host creates room, sets player count to 4
2. Host decreases to 2
3. Check Firebase console: should see only ai-0 and ai-1 removed properly
4. Console should show: `🗑️  Removed excess AI player ai-2` and `ai-3`
5. Start game: should have correct number of players (2, not leftover more)

---

## Issue #7: updateButtonUI Logic Prevented Action Highlighting in Multiplayer

### Problem
When 2+ human players were in the game:
- Selected actions (reload, shield, shoot) were not highlighted
- Button visual feedback was missing
- Players couldn't see which action they had selected

### Root Cause
**In `updateButtonUI()`:**
```javascript
function updateButtonUI(pIdx) {
    if (humanCount > 1) return;  // BUG: Don't highlight if 2+ humans exist!
    // ...apply highlighting...
}
```

Logic was backwards: when there were multiple humans (multiplayer), no highlighting was applied. This was likely an artifact from early single-player development.

### Solution Implemented
**Removed the problematic humanCount check:**
```javascript
function updateButtonUI(pIdx) {
    // Apply highlighting to show selected action
    // In multiplayer, only buttons for your own player exist, so this is safe
    document.querySelectorAll(`#pod-${pIdx} .pod-btn`).forEach(b => b.classList.remove('selected-highlight'));
    const p = players[pIdx];
    if (p.currentAction) {
        const btn = document.getElementById(`btn-${pIdx}-${p.currentAction}`);
        if (btn) {
            btn.classList.add('selected-highlight');
        }
    }
}
```

Since `renderArena()` only creates control pods for players you control (in multiplayer), this is safe and correct.

### How to Test
1. Start 2-human game
2. Select an action (reload/shield/shoot)
3. Button should highlight immediately
4. Visual feedback confirms your selection

---

## Issue #8: Improved Error Handling in Player Array Building

### Problem
If player count didn't match Firebase state (missing humans or AI players), the game would silently skip players or use wrong data, causing:
- Games starting with fewer players than expected
- No warning to users about inconsistent state
- Difficult debugging

### Root Cause
Player array building used `if (playerEntry)` to skip missing players, but didn't log warnings or validate totals.

### Solution Implemented
**Added comprehensive validation and logging:**
```javascript
// Track which humans we've assigned
let humanIndex = 0;

playerTypeIndices.forEach(typeIdx => {
    const expectedType = playerTypes[typeIdx];
    
    if (expectedType === 'ai') {
        playerEntry = aiPlayers[typeIdx];
        if (!playerEntry) {
            console.warn(`⚠️  Expected AI at index ${typeIdx} not found`);
            return;
        }
    } else {
        if (humanIndex >= humanPlayers.length) {
            console.warn(`⚠️  Expected human at index ${typeIdx} but ran out (have ${humanIndex})`);
            return;
        }
        playerEntry = humanPlayers[humanIndex++];
    }
    
    // Build player entry...
});

// Validate final count
if (players.length !== playerTypeIndices.length) {
    console.warn(`⚠️  Player count mismatch: built ${players.length} but expected ${playerTypeIndices.length}`);
}
```

### How to Test
Check browser console during game start:
- Should see player assignments clearly logged
- No "undefined" player errors
- Warnings if player count doesn't match expectations

---

## Browser Testing Checklist (Updated)

### Critical Multiplayer Tests
- [ ] 2 humans + 1 AI: Host and client show 3 players (not 2 vs 3)
- [ ] 2 humans + 2 AI: Both browsers show 4 players in same order
- [ ] Emoji assignments match across browsers
- [ ] Player indices consistent (no out-of-order rendering)
- [ ] Action highlighting works in multiplayer (button feedback visible)
- [ ] Timer stays synchronized (±1 sec variation OK)
- [ ] Victory screen on BOTH browsers when game ends
- [ ] AI auto-submit actions at mid-turn on all browsers
- [ ] Player count decrease cleans up excess AI from Firebase
- [ ] Can play multiple rounds without player count mismatch
- [ ] No console errors or warnings about missing players
- [ ] Game resolution includes all players' actions

### Single-Player Tests
- [ ] Single-player game still works correctly
- [ ] AI opponents function normally
- [ ] Victory screen displays correctly
- [ ] No regressions from multiplayer fixes

---

## Rollback Instructions

If any issues occur, the changes are localized to `game.js`:

**Changed functions:**
- `createRoom()` - Now creates AI BEFORE gameState change
- `startMultiplayerGame()` - Deterministic player ordering + validation
- `joinRoom()` - Fixed emoji calculation
- `updateButtonUI()` - Removed incorrect humanCount check
- Player count listener - Added AI cleanup
- `hostCheckAllActionsSubmitted()` - Improved logging

All changes maintain backward compatibility with single-player games.

---

## Issue #9: Memory Leaks from Unmanaged Firebase Listeners (CRITICAL)

### Problem
Firebase listeners were created but the unsubscribe functions were never stored, causing:
- Memory leaks: listeners continue running after game ends
- Firebase bandwidth waste: continued listening to data changes
- Multiple listeners accumulating: each game start adds more listeners

### Root Cause
Functions like `listenToGameStateUpdates()` and `listenToPlayerActions()` called `onValue()` but didn't store the returned unsubscribe function.

Example bug:
```javascript
// BUG: onValue returns unsubscriber, but we're ignoring it!
onValue(playersRef, (snapshot) => {
    // ... handle data ...
});
```

### Solution Implemented

#### 9A: Store All Listener Unsubscribers in Global Variables
```javascript
let gameStateUpdatesListener = null;  // NEW
let playerActionsListener = null;      // NEW
```

#### 9B: Store Returned Unsubscriber When Creating Listeners
**In `listenToGameStateUpdates()`:**
```javascript
// Clean up any previous listener
if (gameStateUpdatesListener) {
    gameStateUpdatesListener();
}
// Store new unsubscriber
gameStateUpdatesListener = onValue(playersRef, (snapshot) => {
    // ... callback ...
});
```

**In `listenToPlayerActions()`:**
```javascript
if (playerActionsListener) {
    playerActionsListener();
}
playerActionsListener = onValue(playersRef, (snapshot) => {
    // ... callback ...
});
```

#### 9C: Create Centralized Cleanup Function
New function `cleanupAllListeners()` unsubscribes from all Firebase listeners:
```javascript
function cleanupAllListeners() {
    console.log('🧹 Cleaning up all Firebase listeners...');
    if (roomPlayersListener) {
        roomPlayersListener();
        roomPlayersListener = null;
    }
    if (gameStateListener) {
        gameStateListener();
        gameStateListener = null;
    }
    if (gameStateUpdatesListener) {
        gameStateUpdatesListener();
        gameStateUpdatesListener = null;
    }
    if (playerActionsListener) {
        playerActionsListener();
        playerActionsListener = null;
    }
    if (waitingListener) {
        waitingListener();
        waitingListener = null;
    }
}
```

#### 9D: Call Cleanup in All Exit Points
- `resetToMenu()` - Calls `cleanupAllListeners()` before returning to menu
- `leaveRoom()` - Calls `cleanupAllListeners()` before leaving room
- `checkGameEndForMultiplayer()` - Calls `cleanupAllListeners()` when game ends

### Impact
- ✅ Memory immediately freed when game ends
- ✅ Firebase connection count reduced
- ✅ No data being unnecessarily synced from Firebase
- ✅ Clean state for starting new games

---

## Issue #10: Shoot Target Validation Crash (CRITICAL)

### Problem
If a player's shoot target index was invalid (undefined, out of bounds, or pointing to dead player):
- Game crashed with "Cannot read property 'name' of undefined"
- Affected both single-player and multiplayer modes
- Occurred during action resolution

### Root Cause
Code accessed `players[targetIdx].name` without validating `targetIdx`:
```javascript
const targetIdx = p.currentTarget;
incomingShots[targetIdx].push(p.idx);  // Could crash if targetIdx invalid!
const targetName = players[targetIdx].name;  // Definitely crashes if undefined
```

Possible causes of invalid targetIdx:
- UI desynchronization
- Target player died between action submission and resolution
- Network race condition in multiplayer
- Incomplete action submision

### Solution Implemented

**Added comprehensive validation before using targetIdx:**
```javascript
if (targetIdx === undefined || targetIdx === null || targetIdx < 0 || targetIdx >= players.length) {
    console.warn(`⚠️  Invalid target index ${targetIdx} for ${p.name}, defaulting to reload`);
    p.currentAction = 'reload';
    p.bullets++;
    tag.textContent = "+1 子彈";
} else {
    const targetPlayer = players[targetIdx];
    if (!targetPlayer || !targetPlayer.isAlive) {
        console.warn(`⚠️  Target ${targetIdx} is dead or invalid, defaulting to reload`);
        p.currentAction = 'reload';
        p.bullets++;
        tag.textContent = "+1 子彈";
    } else {
        p.bullets--;
        incomingShots[targetIdx].push(p.idx);
        const targetName = targetPlayer.name;
        tag.textContent = `🎯 -> ${targetName}`;
    }
}
```

**Applied to:**
- `resolveActions()` (single-player mode, line ~474)
- `hostResolveActions()` (multiplayer mode, line ~1173)

### How to Test
1. Attempt to shoot a player in a round
2. Verify no crashes occur even if target dies
3. Check console: no "Cannot read property" errors
4. See fallback reload action if target becomes invalid

---

## Issue #11: Missing Listener Cleanup on Game End and Room Leave

### Problem
When a player:
- Returns to menu (`resetToMenu()`)
- Leaves room (`leaveRoom()`)
- Game ends (`checkGameEndForMultiplayer()`)

The Firebase listeners were either not cleaned up or only partially cleaned up, leaving active listeners consuming resources.

### Root Cause
- `resetToMenu()` didn't clean up listeners at all
- `leaveRoom()` only cleaned up 2 out of 5 possible listeners
- `checkGameEndForMultiplayer()` only cleaned up `gameStateListener`

### Solution Implemented

**Updated all exit points to call `cleanupAllListeners()`:**

1. **In `resetToMenu()`:**
   ```javascript
   function resetToMenu() {
       gameActive = false;
       clearTimeout(turnTimer);
       cleanupAllListeners();  // NEW
       // ... rest of function ...
   }
   ```

2. **In `leaveRoom()`:**
   ```javascript
   remove(ref(database, ...)).then(() => {
       cleanupAllListeners();  // NEW - replaced selective cleanup
       currentRoomId = null;
       // ...
   });
   ```

3. **In `checkGameEndForMultiplayer()`:**
   ```javascript
   if (alive.length <= 1) {
       screen.classList.remove('hidden');
       cleanupAllListeners();  // NEW - replaced single listener cleanup
   }
   ```

### Impact
- ✅ No lingering Firebase connections
- ✅ Clean state transitions between games
- ✅ Memory properly freed when leaving rooms
- ✅ Prevents cross-room interference if user quickly joins new room

---

## Browser Testing Checklist (Final)

### Critical New Fixes
- [ ] Game doesn't crash when target is invalid
- [ ] No "Cannot read property" errors in console
- [ ] Can return to menu without hanging (all listeners cleaned)
- [ ] Can join new room immediately after leaving old (no interference)
- [ ] No memory growth when playing multiple rounds
- [ ] Console shows cleanup messages: "🧹 Cleaning up all Firebase listeners"

### Complete Multiplayer Tests
- [ ] 2H + 1 AI: Both browsers show 3 players (not 2 vs 3)
- [ ] 2H + 2 AI: Consistent player count across browsers
- [ ] Emoji assignments match across browsers
- [ ] Player indices consistent (no rendering bugs)
- [ ] Action highlighting works in multiplayer
- [ ] Timer stays synchronized (±1 sec OK)
- [ ] Victory screen on BOTH browsers
- [ ] AI auto-submit at mid-turn on all browsers
- [ ] Player count decrease removes excess AI
- [ ] Multiple rounds play without error
- [ ] Game ends properly and cleans up listeners
- [ ] Leaving room works smoothly
- [ ] Returning to menu cleans up all listeners
- [ ] No console errors or warnings
- [ ] Shoot target validation doesn't crash

---

## Updated Rollback Instructions

If critical issues occur, changes are localized to `game.js`:

**New/Modified functions:**
- `cleanupAllListeners()` - NEW centralized cleanup
- `getPlayer()` - NEW validation function
- `resetToMenu()` - Now calls `cleanupAllListeners()`
- `leaveRoom()` - Now calls `cleanupAllListeners()`
- `listenToGameStateUpdates()` - Now stores unsubscriber
- `listenToPlayerActions()` - Now stores unsubscriber  
- `checkGameEndForMultiplayer()` - Now calls `cleanupAllListeners()`
- `resolveActions()` - Added target validation
- `hostResolveActions()` - Added target validation

**Global variables added:**
- `gameStateUpdatesListener` - NEW
- `playerActionsListener` - NEW

---

## Issue #13: Firebase Database Not Updated with Player Types During Ready Status (CRITICAL)

### Problem
**Scenario**: Host creates room with 5 players (2 human + 3 AI) and clicks "Ready". Client joining the room only sees 2 players in lobby, not realizing there will be 5 total players including 3 AI players. The Firebase database never records the `playerTypes` mapping until "Start Game" is clicked.

**Impact**:
- ❌ Client confused about actual player count
- ❌ Mismatch between expected and actual game setup
- ❌ Client can't see AI player allocation before game starts
- ❌ Requires looking at game arena to discover AI players exist

### Root Cause
The `markPlayerReady()` function only updated the player's `ready` status in Firebase. The `playerTypes` mapping (which specifies index-to-type assignments like `{0: 'human', 1: 'human', 2: 'ai', 3: 'ai', 4: 'ai'}`) was only written to Firebase when `startGameAsHost()` called, not when host clicked "Ready".

### Solution Implemented

**Updated `markPlayerReady()` function:**
```javascript
async function markPlayerReady() {
    if (!currentRoomId || !currentUser) return;

    readyStatus = !readyStatus;
    
    try {
        // Always update ready status
        await update(ref(database, `rooms/${currentRoomId}/players/${currentUser.uid}`), {
            ready: readyStatus
        });
        
        // NEW: If host is ready, also write playerTypes configuration
        // so client can see the full player count (including AI) before game starts
        if (isHost && readyStatus) {
            console.log('🎮 HOST: Ready status set, publishing playerTypes configuration...');
            
            const typeInputs = document.querySelectorAll('.p-type-lobby');
            const playerTypes = {};
            
            typeInputs.forEach((input, idx) => {
                playerTypes[idx] = input.value; // 'human' or 'ai'
            });
            
            // Write playerTypes to room data immediately
            await update(ref(database, `rooms/${currentRoomId}`), {
                playerTypes: playerTypes
            });
            
            console.log('✅ HOST: playerTypes configuration written to Firebase');
        }
    } catch (error) {
        console.error('❌ Error updating ready status:', error);
    }
    
    // Update button UI...
}
```

### How Client Now Works

**Client's room listener automatically sees playerTypes:**
```javascript
// Client listener detects room update
onValue(roomRef, (snapshot) => {
    const roomData = snapshot.val();
    const playerTypes = roomData.playerTypes;  // NOW VISIBLE!
    // Calculate total players: Object.keys(playerTypes).length
    const totalPlayers = playerTypes ? Object.keys(playerTypes).length : humanPlayerCount;
});
```

### Firebase Database Change

**Before (BUG)**:
```
rooms/A1B2/
  ├── playerTypes: null  ← NOT WRITTEN YET
  └── players/
      ├── uid123/ {name: "玩家 1", type: "human"}
      └── uid456/ {name: "玩家 2", type: "human"}
      └── // AI players don't exist until game starts!
```

**After (FIXED)**:
```
rooms/A1B2/
  ├── playerTypes: {0: 'human', 1: 'human', 2: 'ai', 3: 'ai', 4: 'ai'}  ← WRITTEN NOW!
  └── players/
      ├── uid123/ {name: "玩家 1", type: "human", ready: true}
      └── uid456/ {name: "玩家 2", type: "human", ready: false}
```

### How to Test

1. **Browser 1 (Host)**: Create room with 5 players, set to 2H + 3 AI
2. **Browser 2 (Client)**: Join room → sees "玩家 (2)" initially
3. **Browser 1**: Click "準備就緒" button
   - Console shows: `✅ HOST: playerTypes configuration written to Firebase`
4. **Browser 2**: Room listener fires automatically
   - Player count badge updates to "玩家 (5)"
   - No "遊戲開始" needed yet  
   - Client already knows: 2 humans, 3 AI

---

## Issue #14: Confusing Local-Mode Panel in Lobby (UI/UX Issue)

### Problem
The lobby screen had a confusing layout when scrolling:
1. **Top section**: Firebase multiplayer (Create/Join room)
2. **Bottom section**: Local mode (Play without Firebase)

**Issues**:
- ❌ Users scroll and find unexpected local-mode setup
- ❌ Confusing which mode they're using
- ❌ Redundant - multiplayer with AI achieves same goal
- ❌ Local mode wasn't truly "multiplayer" for one player solo with AI

### Solution Implemented

**Removed from `index.html`:****  - Deleted entire `<div id="setup-screen">` block (previously lines 104-142)
  - Removed local mode player configuration UI
  - Removed "開始遊戲" button for local mode

**Removed from `game.js`:****  - Deleted local mode variables: `playerCountInput`, `timerSettingInput`, `playerConfigList`
  - Deleted `updateConfigList()` function
  - Deleted `start-game-btn` click handler (was for local mode)
  - Simplified `resetToMenu()`: always returns to lobby (no if/else for setup-screen)
  - Removed all setup-screen show/hide logic

### After Fix

**Lobby Now Shows**:
1. **Create Room** - Host multiplayer with friends/AI
2. **Join Room** - Players join existing room

**Solo Play Option**:
- Host creates room with "2 players"
- Sets: Player 1 = Human (you), Player 2 = AI
- Plays with AI (same as old local mode, but now with networking)

### Files Changed
- **index.html**: Removed setup-screen div
- **game.js**: Removed 30+ lines of local mode code

### How to Test

1. **Page Load**: Only lobby visible, no scrollable setup panel
2. **Playing Solo**: Create room (2 players: human + AI) → same experience as before
3. **Return to Menu**: Always goes back to lobby, never tries to show setup-screen

---

## Final Validation Checklist (After All 14 Fixes)

- [ ] **Issues #1-3**: Original AI/timer/victory fixes working
- [ ] **Issue #4**: Player count consistent across browsers (2H+1AI = 3 on both)
- [ ] **Issue #5**: Emoji assignments correct for joining players
- [ ] **Issue #6**: Player count decrease removes orphaned AI from Firebase
- [ ] **Issue #7**: Action buttons highlight in multiplayer games
- [ ] **Issue #8**: Player array building shows validation warnings
- [ ] **Issue #9**: Listeners cleanup on exit (console shows 🧹 messages)
- [ ] **Issue #10**: Invalid shoot targets don't crash game
- [ ] **Issue #11**: Game end cleans up all listeners immediately
- [ ] **Issue #12**: Room transitions have no listener interference
- [ ] **Issue #13**: PlayerTypes written to Firebase when host clicks "Ready"
- [ ] **Issue #14**: Only lobby visible, no confusing local mode panel
