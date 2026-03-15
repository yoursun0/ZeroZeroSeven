# 007 入子彈 - Multiplayer Game Testing Guide

## ⚡ QUICK TROUBLESHOOTING (Multi-Round Bug Fix)

### Problem #1: Only host sees game, client stays on lobby screen
**FIXED**: Listener now watches entire room object (more reliable)

### Problem #2: Buttons disabled after Round 1, game freezes
**FIXED**: 
- ✅ Host: Now calls `enableActionButtons()` after turn resolution
- ✅ Client: Now detects turn resolution and auto-enables buttons
- ✅ Client: Auto-starts next turn cycle after resolution
- ✅ Added turn state tracking to detect resolution completion

**To Test the Fix:**
1. **Hard refresh both browsers** (Ctrl+F5 or Cmd+Shift+R)  
2. Open **Browser DevTools Console** on both (F12)
3. Follow test case 5 → 6 again
4. **After Round 1 completes, Watch the console**:
   - Host: `✅ HOST: Turn resolution complete, cleaning up for next turn`
   - **BOTH**: `🔄 CLIENT: Detected turn resolution complete...`
   - **BOTH**: `🔄 CLIENT: Starting next turn cycle...`
   - Both players should have buttons enabled for Round 2+ ✅

---

## Server Status ✅
- **Local Server**: Running on `http://localhost:8080`
- **Framework**: Vanilla JavaScript + Firebase Realtime Database
- **Authentication**: Firebase Anonymous Auth (auto-enabled on page load)

---

## Testing Scenarios

### Test 1: Lobby Screen & Firebase Authentication
**Goal**: Verify lobby loads and Firebase auth initializes

**Steps**:
1. Open `http://localhost:8080` in your browser
2. Open Browser DevTools Console (F12)
3. Check for message: `"Anonymous user UID: [some-uid]"`

**Expected Result**: ✅
- Lobby screen appears with "007 入子彈" title
- Two sections visible: "建立房間" (Create Room) and "加入房間" (Join Room)
- No JavaScript errors in console

---

### Test 2: Create Room as Host
**Goal**: Test room creation and room ID generation

**Steps**:
1. In the Lobby, click "🏠 建立房間" (Create Room) button
2. Adjust player count (2-8): Try setting it to **2 players**
3. Adjust timer (3-20s): Leave at **9 seconds**
4. Leave "顯示子彈數量" (Show Bullets) **checked**
5. Click button

**Expected Result**: ✅
- Room ID (4 characters, uppercase) displays in red box
- "玩家設定" (Player Setup) section appears
- "準備就緒" (Ready) button visible
- Room info panel shows: "房間ID: [XXXX]" with "玩家 1" (你) in player list
- Player count shows "1" immediately

---

### Test 3: Join Room as Client
**Goal**: Test joining existing room from another browser/tab

**Steps**:
1. **Browser 1 (Host)**: Note the Room ID (e.g., "A1B2")
2. **Browser 2 (Client)**: Open `http://localhost:8080` in another tab/browser
3. In "加入房間" section, enter the Room ID
4. Click "🎯 加入房間" button

**Expected Result**: ✅
- Browser 2 shows Lobby with "房間ID: A1B2"
- Room info panel displays both players: "玩家 1 (你)" and "玩家 2"
- Player count shows "2"
- Browser 1 automatically updates to show 2 players
- Both see each other's ready status

---

### Test 4: Ready Status Toggle
**Goal**: Verify ready mechanism and start game button visibility

**Steps**:
1. **Browser 1 (Host)**: Click "準備就緒" button
2. Check visual feedback (button text and color change)
3. **Browser 2 (Client)**: Click "準備就緒" button
4. Check Browser 1's "🎮 遊戲開始" button

**Expected Result**: ✅
- Ready button changes from yellow to green
- Button text changes to "已準備"
- Player badges show "準備就緒 ✓" with green border when ready
- Start Game button only appears on Host when ALL players are ready
- Button disappears if any player toggles not ready

---

### Test 5: Start Game
**Goal**: Test game initialization for all players

**Steps**:
1. Both players marked ready (from Test 4)
2. **Host Browser**: Click "🎮 遊戲開始"
3. Both browsers should transition to game

**Expected Result**: ✅
- Lobby screen disappears on BOTH browsers simultaneously
- Game arena appears with circular layout
- Both players visible in arena circle (with emojis)
- Beat counter shows: 9 (or your selected timer value)
- Game status says: "請選擇行動..." (Please choose action)
- Host sees own control pods (3 buttons: 🔋 🛡️ 🔫)
- Client sees own control pods (3 buttons: 🔋 🛡️ 🔫)

---

### Test 6: Action Submission (Reload/Shield)
**Goal**: Test submitting actions and waiting mechanism

**Steps**:
1. **Host Browser**: Click 🔋 (Reload) button
2. **Client Browser**: Click 🛡️ (Shield) button

**Expected Result**: ✅
- Both browsers show "等待其他玩家..." (Waiting for other players) overlay
- Overlay shows both players' submission status:
  - "✓ 玩家 1" (checkmark when submitted)
  - "✓ 玩家 2" (checkmark when submitted)
- Action buttons disabled (grayed out) while waiting
- Overlay automatically hides when all players submit
- Both clients see updated turn display

---

### Test 7: Shooting & Target Selection
**Goal**: Test shoot action and target modal

**Steps**:
1. **Host Browser**: Click 🔫 (Shoot) button
2. Modal appears titled "鎖定目標" (Lock Target)
3. Click on "玩家 2" (其他玩家)
4. **Client Browser**: Click 🔫 (Shoot) button
5. Select "玩家 1" as target

**Expected Result**: ✅
- Target modal shows all alive enemy players
- Back to waiting overlay when target selected
- Both players show shooting action tags when submitted
- Target tags display: "🎯 -> [Target Name]"

---

### Test 8: Turn Resolution & Action Display
**Goal**: Verify action resolution and state updates

**Steps**:
1. After all players submit, wait for countdown to reach 0
2. Observe action resolution animation

**Expected Result**: ✅
- Action tags display above players:
  - Reload: "+1 子彈"
  - Shield: "防禦" (with blue shield animation)
  - Shoot: "🎯 -> [Target Name]"
- Game status shows "結算中..." during resolution
- Bullet counts update correctly
- Elimination shows "❌" mark after 2.2 second delay
- Turn cycles to next round or game end

---

### Test 9: Game End & Victory Screen
**Goal**: Test game conclusion

**Expected Result**: ✅
- When 1 or 0 players alive, victory screen appears
- Shows winner emoji and name
- Displays "獲得勝利！" or "平手！" message
- "返回主選單" button works
- Clicking returns to lobby (if was multiplayer) or setup (if single-player)

---

### Test 10: Leave Room
**Goal**: Test graceful room exit

**Steps**:
1. While in lobby, click "離開房間" button
2. Should return to clean lobby setup

**Expected Result**: ✅
- Lobby screen hides
- Setup screen shows
- All fields reset to defaults
- Can create/join new room

---

## Single-Player Mode Testing (Backward Compatibility)

**Steps**:
1. Page loads → Lobby visible
2. Page shows only Create/Join options
3. Verify old setup screen still accessible

**Note**: Single-player uses the original local multiplayer logic without Firebase

---

## Firebase Console Verification

Check your Firebase project at https://console.firebase.google.com/

### Expected Database Structure:
```
rooms/
  └── [ROOMID]/
      ├── hostUid: "[uid]"
      ├── playerCount: 2
      ├── timerSetting: 9
      ├── showBullets: true
      ├── gameState: "playing"
      ├── currentTurn: 1
      ├── createdAt: "2026-03-14T..."
      └── players/
          ├── [HOST-UID]/
          │   ├── uid: "[HOST-UID]"
          │   ├── name: "玩家 1"
          │   ├── emoji: "🕵️"
          │   ├── type: "human"
          │   ├── ready: true
          │   ├── bullets: 1
          │   ├── isAlive: true
          │   ├── lastAction: "reload"
          │   ├── currentAction: null
          │   ├── currentTarget: null
          │   └── joinedAt: "2026-03-14T..."
          └── [CLIENT-UID]/
              ├── uid: "[CLIENT-UID]"
              ├── name: "玩家 2"
              ├── emoji: "🕶️"
              ├── type: "human"
              ├── ready: true
              ├── bullets: 0
              ├── isAlive: true
              ├── lastAction: "shield"
              ├── currentAction: null
              ├── currentTarget: null
              └── joinedAt: "2026-03-14T..."
```

---

## Debugging Tips

## Debugging Tips

### Console Logs to Watch:

**When Host Creates Room:**
```
🎮 HOST: Creating room with ID: ABCD
✅ HOST: Room data written to Firebase
✅ HOST: Player data written to Firebase
✅ Room created: ABCD
📦 Room data fetched: {gameState: 'lobby', ...}
```

**When Client Joins Room:**
```
🎮 CLIENT: Attempting to join room: ABCD
📦 CLIENT: Room data fetched: {gameState: 'lobby', ...}
✅ CLIENT: Player data written to Firebase
✅ CLIENT: Joined room: ABCD
```

**When Host Clicks "Start Game":**
```
🎮 HOST: Starting game, setting gameState to playing...
✅ HOST: gameState successfully updated to playing
✅ HOST: Verified gameState in DB: playing
```

**When Client Receives Game Start:**
```
📦 Client: Current gameState: lobby
🎮 Client: gameState changed to playing! Starting game...
🎮 Starting multiplayer game...
📦 Room data fetched: {gameState: 'playing', ...}
👥 Players data fetched: {[uids]: {...}}
📦 Players initialized: [Array of 2 players]
✅ Client game UI appears!
```

### Critical Check - BOTH Browsers Should See These:
1. ✅ Anonymous user UID logged on page load
2. ✅ Room creation with 4-char ID
3. ✅ Both players visible in lobby with ready status
4. ✅ "🎮 Client: gameState changed to playing" message on BOTH browsers
5. ✅ Game arena visible on BOTH browsers simultaneously

### If Game Doesn't Start on Client Browser:
**Check console for:**
- ❌ Any red errors about Firebase database
- ❌ "Room not found" or "Room is full" messages
- ❌ Missing "gameState changed to playing" message
- ❌ CORS or permission errors

**If you see errors, try:**
1. Refresh both browsers
2. Check Firebase console permissions (should allow read/write for all users)
3. Verify both browsers are connecting to same Firebase project
4. Check internet connection is stable

| Issue | Solution |
|-------|----------|
| Lobby doesn't appear | Clear browser cache, reload page |
| Firebase errors | Check Firebase config in game.js line 1056 |
| Room join fails | Verify Room ID is exactly 4 characters |
| Buttons don't work | Check browser console for JavaScript errors |
| Game doesn't start | Ensure all players are ready + minimum players met |
| Actions don't submit | Check Firebase permissions in console |

---

## Browser Requirements
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

**Required**: JavaScript enabled, Cookies/localStorage allowed

---

## Performance Notes
- Initial load: ~1-2 seconds (Firebase SDK loading from CDN)
- Firebase listeners: Real-time ~50-200ms latency
- Turn resolution: ~2.2 seconds (includes animations)

---

---

## Edge Cases & Critical Scenarios Testing

### Edge Case 1: Shoot Invalid Target (Issue #10)
**Goal**: Verify game doesn't crash when target becomes invalid

**Scenario A: Target Dies Before Resolution**
1. 3+ players, Round starts
2. Player A submits: Shoot Player B
3. Player B gets eliminated in their action (e.g., took 2 shots from others)
4. Player A's shoot resolves → what happens?

**Expected Result - CRASH PROTECTION**: ✅
- No crash with "Cannot read property 'name' of undefined"
- Console shows: `⚠️  Target [index] is dead or invalid, defaulting to reload`
- Player A gets reload instead: "+1 子彈"
- Game continues normally
- Victory/elimination shows properly

**Scenario B: Target Index Out of Bounds**
1. During action submission, player count slider decreases
2. Player selected target 4, but game now has only 2 players
3. Resolution happens
4. What happens?

**Expected Result - BOUNDS PROTECTION**: ✅
- No crash with "Cannot read property 'name'"
- Console shows: `⚠️  Invalid target index [4] for [Player], defaulting to reload`
- Player gets reload action instead
- Bullets increase by 1
- No errors in console

**Scenario C: Undefined Target Index**
1. During network lag, player action submitted without target
2. Player data: `{..., currentTarget: null, currentAction: 'shoot'}`
3. Resolution starts

**Expected Result - NULL PROTECTION**: ✅
- No crash
- Console shows: `⚠️  Invalid target index null for [Player], defaulting to reload`
- Action defaults to reload
- Game continues

**How to Test**:
1. Open DevTools Console (F12) on Host browser
2. Look for warning messages with "⚠️  Invalid target index" or "⚠️  Target [X] is dead"
3. Verify NO red errors starting with "Cannot read property"
4. Check that player bullets increase when target invalid

---

### Edge Case 2: Memory Leak Prevention - Listener Cleanup (Issue #9)
**Goal**: Verify Firebase listeners are cleaned up and don't accumulate

**Scenario A: Play Multiple Rounds Then Leave**
1. Start multiplayer game with 2 players
2. Play 3 complete rounds (each round: choose action → resolution → next round)
3. Game ends (someone wins)
4. Host clicks "返回主選單" button

**Expected Console Output During Cleanup**: ✅
```
🧹 Cleaning up all Firebase listeners...  [appears when leaving]
🛑 Cleaning up previous roomPlayersListener
🛑 Cleaning up previous gameStateListener
🛑 Cleaning up previous gameStateUpdatesListener
🛑 Cleaning up previous playerActionsListener
```

**After Return to Menu**:
- Console should NOT show any more Firebase update messages
- Old listeners should not fire anymore
- Joining new room should start fresh (no interference from old room)

**Test Steps**:
```
1. Open console, Play → Game ends → Return to menu
2. Don't look for cleanup messages yet (scroll console if needed)
3. Join DIFFERENT room (or new instance of same room)
4. If old listener fires, console shows "[OLD-ROOM-ID] players updated" - BAD
5. If only NEW room data arrives, listener cleanup WORKED - GOOD
```

**Scenario B: Rapidly Switch Rooms**
1. Create Room A, start game, play 1 round
2. Return to menu (should cleanup Room A listeners)
3. Immediately after "返回主選單", join Room B

**Expected Result**: ✅
- No errors about Room A in console
- Room B listeners activate cleanly
- Only Room B data in console logs
- Console shows: `🧹 Cleaning up all Firebase listeners...` only once (for Room A)

**Scenario C: Long Multiplayer Session**
1. Play same room for 5+ rounds
2. After each round, check console memory usage indicator
3. Watch for Firefox/Chrome memory climbing
4. Play final round, return to menu

**Expected Result** - No Memory Growth: ✅
- Console remains responsive
- No lag as rounds progress
- Memory usage stable after cleanup
- Browser doesn't slow down despite multiple rounds

**How to Test Memory**:
- **Chrome**: Open DevTools → Memory tab → Take heap snapshot before round 1
- **Firefox**: Open DevTools → Memory tab → Track memory at round 1, 3, 5...
- Expected: Memory stable ~3-5 MB after cleanup, no growth per round

---

### Edge Case 3: Game End Listener Cleanup (Issue #11)
**Goal**: Verify all listeners stop firing after victory screen

**Scenario A: Verify No Ghost Data Updates**
1. Play game until someone wins (1 player alive)
2. Victory screen appears on both browsers
3. Host browser: Stay on victory screen for 10 seconds
4. Meanwhile, in Firebase console, manually add data to room

**Procedure**:
1. Open https://console.firebase.google.com → your project → Database
2. Find room in structure: `rooms/[ROOMID]/players/[HOST-UID]/bullets`
3. Change bullets value while game shows victory screen
4. Check Host console

**Expected Result** - No Updates After Victory: ✅
- Console shows NO update messages after victory
- Player data doesn't reflect the Firebase change
- Player panel stays stale with old data
- Only "返回主選單" action works

**If Listeners NOT Cleaned** (Bug): ❌
- Console would show: `📦 Player data updated...` or similar
- Player bullets would change on screen
- Game would continue reacting to Firebase
- Indicates memory leak is present

**Scenario B: Victory Screen → Return to Menu**
1. Victory screen showing
2. Click "返回主選單" button
3. Check console cleanup messages

**Expected Result**: ✅
- Console shows: `🧹 Cleaning up all Firebase listeners...`
- All listeners unsubscribe messages appear
- Menu appears with clean state
- Can immediately start new game

---

### Edge Case 4: Player Count Slider During Game (Issue #6)
**Goal**: Verify AI cleanup when host decreases player count

**Scenario A: 2H + 2AI → Decrease to 2H Only**
1. Host: Create room with 4 players (2 human, 2 AI expected)
2. Verify 2 AI players join: `[HUMAN1], [HUMAN2], ai-0, ai-1`
3. Client joins
4. Before "遊戲開始", Host drags player count slider from 4 → 2
5. Watch Firebase console

**Expected Console Output**: ✅
```
🗑️ Removing excess AI player ai-1 (index 1 >= playerCount 2)
🗑️ Removed excess AI player ai-1
🗑️ Removing excess AI player ai-0 (index 0 >= playerCount 2)
🗑️ Removed excess AI player ai-0
```

**In Room Player Panel**: ✅
- Player count badge shows "2"
- AI players disappear from player list
- Only "玩家 1" and "玩家 2" visible
- No orphaned AI players in ready status

**Scenario B: Add Players After Removing**
1. Had 4, decreased to 2 (ai-0, ai-1 removed as above)
2. Now increase back to 4
3. Check Firebase

**Expected Result**: ✅
- New AI players created: might be ai-2, ai-3 (or reuse ai-0, ai-1)
- No errors about duplicate UIDs
- Game proceeds normally with 4 players total
- Console shows AI creation messages

---

### Edge Case 5: Player Disconnects Mid-Game (Network Failure)
**Goal**: Verify game handles player leaving unexpectedly

**Scenario A: Client Disconnects During Waiting**
1. Two players in game, Round 2 starting
2. Host submits action: Click 🔋 (Reload)
3. Waiting overlay appears
4. Client browser: Hard close tab or disable network
5. Wait 15 seconds
6. Check Host console

**Expected Result**: ✅
- Host still waits for Client (graceful timeout, not crash)
- Console shows attempt to read Client's action
- Eventually Host either: times out or continues with AI/default action
- Game doesn't crash with "Cannot read player data" error

**Scenario B: Host Disconnects**
1. Two players in game, Host's turn to choose action
2. Host closes browser tab
3. Client browser shows...?

**Expected Result**: ✅
- Client stays on waiting screen or game view
- Eventually Client detects host absence (Firebase data stops updating)
- No crash, no infinite loading spinner
- Client sees "房間已結束" or similar message (if implemented)

---

### Edge Case 6: Broken Connection After Submit, Before Resolution
**Goal**: Verify no data corruption when connection drops

**Scenario A: Connection Lost During Action Waiting**
1. Both submit actions, in "等待其他玩家..." overlay
2. One browser loses network (can use DevTools Network Throttle)
3. Other browser completes turn resolution
4. First browser reconnects

**Expected Result**: ✅
- No duplicate actions
- Game state consistent when reconnected
- No "Action submitted twice" errors
- Player can continue next round

---

### Edge Case 7: Target Validation in Single-Player Mode (Issue #10 - Backward Compat)
**Goal**: Verify single-player game works after target validation fix

**Scenario A: Create Single-Player Game**
1. Page loads → Lobby
2. No "Create Room" visible (single-player disabled), use old setup
3. Select setup and start game
4. Choose Shoot action and pick target
5. Verify no crashes

**Expected Result**: ✅
- Game works exactly as before
- Target validation applies but doesn't cause issues
- Shooting kills targets normally
- No regression in single-player mode

---

### Critical Console Log Checklist

When running comprehensive edge case tests, verify these logs appear:

**On Game Start (Both Browsers)**:
- ✅ `🎮 Starting multiplayer game...`
- ✅ `👥 Players data fetched: [Array]`
- ✅ `📦 Players initialized: 2 players`

**During Multiple Rounds**:
- ✅ `🎮 Turn 1:` / `2:` / `3:` messages
- ✅ `⏰ Starting turn cycle for turn [N]`
- ✅ `✅ Set gameState to: updating-turn`
- ✅ `✅ Turn resolution complete...`

**When Shooting a Target**:
- ✅ `🎯 Player [X] shoots [Y]` (if target valid)
- ⚠️ `⚠️  Invalid target index [X]...` (if target invalid - this is CORRECT output)

**When Leaving Game**:
- ✅ `🧹 Cleaning up all Firebase listeners...`
- ✅ `🛑 Cleaning up previous [listener-type]...` (at least 2-3 of these)

**When Returning to Lobby**:
- ✅ `🎮 Game ended, returning to menu...`
- ✅ No Firebase-related logs should appear after this
- ✅ Joining new room only shows NEW room's logs

---

### Performance Baseline Test

**Test Duration**: 30 minutes continuous play

1. **Setup**: 2 human + 2 AI, timer 6 seconds per round
2. **Run**: Play until 15+ rounds complete
3. **Monitor**:
   - Browser DevTools Memory: Should stay below 50 MB
   - Console lag: Should be responsive (not taking 5+ sec to log)
   - UI response: Buttons should click instantly

**Acceptable Results**:
- ✅ Memory growth ≤ 10 MB per 10 rounds
- ✅ Console scrolls without lag
- ✅ Buttons interactive throughout
- ✅ No "out of memory" warnings

**If Issues Occur**:
- Check FIXES_SUMMARY Issue #9 was applied
- Verify cleanupAllListeners() called after each game
- Monitor Firebase rules aren't causing excessive data reads

---

## Final Validation Checklist (After All Fixes)

Run this before declaring game "production ready":

- [ ] **Issue #1-3**: Original AI fixes applied ✅ (FIXES_SUMMARY)
- [ ] **Issue #4**: Player count consistent across browsers ✅ (tested Test Case 3)
- [ ] **Issue #5**: Emoji assignments match ✅ (tested Test Case 3)
- [ ] **Issue #6**: AI cleanup on slider decrease ✅ (tested Edge Case 4)
- [ ] **Issue #7**: Action buttons highlight in multiplayer ✅ (tested Test Case 6)
- [ ] **Issue #8**: Player array validation warnings present ✅ (console check)
- [ ] **Issue #9**: No memory leaks - listeners cleanup ✅ (Edge Case 2 step 1)
- [ ] **Issue #10**: No crash on invalid target ✅ (Edge Case 1)
- [ ] **Issue #11**: Game end cleanup complete ✅ (Edge Case 3 scenario B)
- [ ] **Issue #12**: Listener cleanup on all exit paths ✅ (Edge Cases 2&3)

---

## Next Steps After Testing
1. ✅ Verify all 10 basic tests pass
2. ✅ Verify all 7 edge case scenarios pass
3. Deploy to Firebase Hosting (`firebase deploy`)
4. Share public URL with players
5. Monitor Firebase Realtime Database for performance
6. Consider adding turn timeout limits for slower players
7. Monitor console logs for any new issues

