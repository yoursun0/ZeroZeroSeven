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

## Next Steps After Testing
1. ✅ Verify all 10 tests pass
2. Deploy to Firebase Hosting (`firebase deploy`)
3. Share public URL with players
4. Monitor Firebase Realtime Database for performance
5. Consider adding turn timeout limits for slower players

