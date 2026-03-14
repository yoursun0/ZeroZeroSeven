# Bug Fixes Summary - March 14, 2026

## Overview
Three major issues have been fixed in the multiplayer game:
1. ✅ Timer desynchronization between browsers
2. ✅ Victory screen not showing on losing player's browser
3. ✅ AI player configuration and integration in multiplayer

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

## Rollback Instructions

If any issues occur, the changes are localized to:
- `index.html` - Added player config UI section
- `game.js` - Updated timer, victory detection, AI submission, room startup

All changes maintain backward compatibility with single-player games.
