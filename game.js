// Firebase imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getDatabase, ref, set, get, onValue, update, remove, push } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const emojis = ["🕵️", "🕶️", "💼", "🧨", "🚔", "🔫", "🎯", "🥷"];
let players = [];
let currentBeat = 9;
let startBeat = 9;
let gameActive = false;
let showBulletCount = true;
let humanCount = 0;
let turnTimer = null;
let turnStartTime = null; // Firebase server timestamp for synchronized countdown

// Multiplayer state
let currentUser = null;
let currentRoomId = null;
let isHost = false;
let readyStatus = false;
// Firebase listeners - store unsubscriber functions for cleanup
let firebaseRoomListener = null;
let roomPlayersListener = null;
let gameStateListener = null;
let playerActionsListener = null;  // NEW: Store host's action listener for cleanup
let gameStateUpdatesListener = null;  // NEW: Store all clients' game state listener for cleanup

const playerCountInput = document.getElementById('player-count');
const timerSettingInput = document.getElementById('timer-setting');
const playerConfigList = document.getElementById('player-config-list');

function updateConfigList() {
    const count = parseInt(playerCountInput.value);
    document.getElementById('player-count-val').textContent = count;
    playerConfigList.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-800/50 p-3 rounded-xl border border-gray-700';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-2xl">${emojis[i]}</span>
                <input type="text" class="nickname-input p-nick" data-idx="${i}" value="玩家 ${i+1}" maxlength="8">
            </div>
            <select class="bg-gray-700 rounded-lg text-xs font-black px-3 py-2 p-type uppercase" data-idx="${i}">
                <option value="human" ${i===0?'selected':''}>真人</option>
                <option value="ai" ${i!==0?'selected':''}>電腦 AI</option>
            </select>
        `;
        playerConfigList.appendChild(div);
    }
}

playerCountInput.addEventListener('input', updateConfigList);
timerSettingInput.addEventListener('input', () => {
    document.getElementById('timer-val').textContent = timerSettingInput.value;
});
updateConfigList();

document.getElementById('start-game-btn').onclick = () => {
    const count = parseInt(playerCountInput.value);
    startBeat = parseInt(timerSettingInput.value);
    showBulletCount = document.getElementById('show-bullets').checked;
    
    const nicks = document.querySelectorAll('.p-nick');
    const types = document.querySelectorAll('.p-type');
    
    humanCount = 0;
    players = Array.from({length: count}, (_, i) => {
        if (types[i].value === 'human') humanCount++;
        return {
            idx: i,
            name: nicks[i].value || `玩家 ${i+1}`,
            emoji: emojis[i],
            type: types[i].value,
            bullets: 0,
            isAlive: true,
            lastAction: null,
            currentAction: null,
            currentTarget: null
        };
    });

    document.body.classList.add('playing');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-ui').classList.remove('hidden');
    window.scrollTo(0, 0); // Reset scroll for game start
    renderArena();
    startTurnCycle();
};

function resetToMenu() {
    gameActive = false;
    clearTimeout(turnTimer);
    document.body.classList.remove('playing');
    
    // Clean up ALL Firebase listeners
    cleanupAllListeners();
    
    // If in a room, return to lobby. Otherwise return to setup
    if (currentRoomId) {
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('victory-screen').classList.add('hidden');
        document.getElementById('lobby-screen').classList.remove('hidden');
        const arena = document.getElementById('game-arena');
        arena.querySelectorAll('.player-node, .control-pod').forEach(n => n.remove());
    } else {
        document.getElementById('setup-screen').classList.remove('hidden');
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('victory-screen').classList.add('hidden');
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('exit-to-menu').classList.add('hidden');
        const arena = document.getElementById('game-arena');
        arena.querySelectorAll('.player-node, .control-pod').forEach(n => n.remove());
    }
}

// NEW: Centralized listener cleanup function
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

// NEW: Validate player index to prevent crashes
function getPlayer(pIdx) {
    if (pIdx === undefined || pIdx === null || pIdx < 0 || pIdx >= players.length) {
        console.warn(`⚠️  Invalid player index: ${pIdx} (valid range: 0-${players.length - 1})`);
        return null;
    }
    return players[pIdx];
}

function renderArena() {
    const arena = document.getElementById('game-arena');
    arena.querySelectorAll('.player-node, .control-pod').forEach(n => n.remove());
    
    const radius = arena.offsetWidth / 2;
    players.forEach((p, i) => {
        const angle = (i * (360 / players.length)) - 90;
        const rad = angle * Math.PI / 180;
        const x = radius + radius * Math.cos(rad);
        const y = radius + radius * Math.sin(rad);

        const node = document.createElement('div');
        node.id = `node-${i}`;
        node.className = 'player-node';
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;

        const podOffset = 80; 
        const px = x + podOffset * Math.cos(rad);
        const py = y + podOffset * Math.sin(rad);

        node.innerHTML = `
            <div class="player-avatar" id="avatar-${i}">
                ${p.emoji}
                <div id="shield-${i}" class="hidden absolute inset-0 rounded-full border-4 border-cyan-400 animate-pulse"></div>
                <div id="bullet-ui-${i}" class="${showBulletCount ? '' : 'hidden'} absolute -top-2 -right-2 bg-yellow-500 text-black text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-black">
                    0
                </div>
            </div>
            <div class="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-black text-white/80 whitespace-nowrap bg-black/40 px-2 rounded">
                ${p.name}
            </div>
            <div id="action-tag-${i}" class="absolute -top-10 left-1/2 -translate-x-1/2 text-[10px] font-black text-yellow-400 whitespace-nowrap tracking-wider"></div>
        `;

        // In single-player, show control pods for all human players
        // In multiplayer, show control pods only for the current player
        const shouldShowPod = p.type === 'human' && (!currentRoomId || p.uid === currentUser.uid);
        
        if (shouldShowPod) {
            const pod = document.createElement('div');
            pod.id = `pod-${i}`;
            pod.className = 'control-pod';
            pod.style.left = `${px}px`;
            pod.style.top = `${py}px`;
            pod.style.transform = 'translate(-50%, -50%)';
            
            pod.innerHTML = `
                <button onclick="handleInput(${i}, 'reload')" id="btn-${i}-reload" class="pod-btn bg-blue-900/80 text-white">🔋</button>
                <button onclick="handleInput(${i}, 'shield')" id="btn-${i}-shield" class="pod-btn bg-gray-800/80 text-white">🛡️</button>
                <button onclick="handleInput(${i}, 'shoot')" id="btn-${i}-shoot" class="pod-btn bg-red-900/80 text-white">🔫</button>
            `;
            arena.appendChild(pod);
        }
        arena.appendChild(node);
    });
}

function startTurnCycle() {
    console.log('🔄 Starting new turn cycle');
    const aliveHumans = players.filter(p => p.isAlive && p.type === 'human');
    if (aliveHumans.length === 0) {
        document.getElementById('exit-to-menu').classList.remove('hidden');
    }
    gameActive = true;
    currentBeat = startBeat;
    
    // Write turn start time to Firebase for synchronized countdown
    if (currentRoomId && isHost) {
        const timestamp = Date.now();
        turnStartTime = timestamp;
        update(ref(database, `rooms/${currentRoomId}`), {
            turnStartTime: timestamp,
            turnStartBeat: startBeat
        }).catch(err => console.error('Error writing turn start time:', err));
    }
    
    runCountdown();
}

function runCountdown() {
    if (!gameActive) return;
    const display = document.getElementById('beat-counter');
    const status = document.getElementById('game-status');
    
    // Use synchronized time from Firebase if available
    if (currentRoomId && turnStartTime) {
        const elapsed = Math.floor((Date.now() - turnStartTime) / 1000);
        currentBeat = Math.max(0, startBeat - elapsed);
    }
    
    display.textContent = currentBeat;
    
    display.animate([
        { transform: 'scale(1.3)', opacity: 1 },
        { transform: 'scale(1)', opacity: 1 }
    ], { duration: 250 });

    if (currentBeat === 0) {
        if (currentRoomId && isHost) {
            // In multiplayer, host triggers resolution
            console.log('⏱️ Countdown reached 0, host resolving actions...');
            hostCheckAllActionsSubmitted();
        } else if (!currentRoomId) {
            // In single-player, immediately resolve
            resolveActions();
        }
        return;
    }

    if (currentBeat === Math.floor(startBeat / 2)) {
        // Handle AI actions for both local and multiplayer
        players.forEach(p => { 
            if (p.isAlive && p.type === 'ai') {
                runAI(p);
                // In multiplayer, submit AI action to Firebase with AI's uid
                if (currentRoomId && p.uid) {
                    submitActionToFirebase(p.idx, p.currentAction, p.currentTarget, p.uid);
                }
            }
        });
        status.textContent = "最後衝刺！";
    } else if (currentBeat === startBeat) {
        console.log(`⏱️ Turn countdown starting: ${startBeat} seconds`);
        status.textContent = "請選擇行動...";
    }

    currentBeat--;
    turnTimer = setTimeout(runCountdown, 1000);
}

function handleInput(pIdx, action) {
    if (currentBeat < 0 || !gameActive) return;
    const p = players[pIdx];
    if (!p.isAlive) return;
    
    // In multiplayer, only allow controlling your own player
    if (currentRoomId && p.uid !== currentUser.uid) return;
    
    if (action === 'shield' && p.lastAction === 'shield') return;
    if (action === 'shoot' && p.bullets <= 0) return;
    if (action === 'shoot') {
        openTargetModal(pIdx);
    } else {
        p.currentAction = action;
        p.currentTarget = null;
        updateButtonUI(pIdx);
        
        // In multiplayer, submit action to Firebase
        if (currentRoomId) {
            submitActionToFirebase(pIdx, action, null, p.uid);
        }
    }
}

async function submitActionToFirebase(pIdx, action, target, playerUid) {
    if (!currentRoomId) return;

    // Use provided uid, or for human players use currentUser.uid, or for AI use ai-{idx}
    const uid = playerUid || currentUser?.uid || `ai-${pIdx}`;
    const player = players[pIdx];
    
    console.log(`📤 CLIENT: Submitting action for ${player.name} (uid: ${uid}): ${action}${target ? ' -> ' + players[target].name : ''}`);
    try {
        await update(ref(database, `rooms/${currentRoomId}/players/${uid}`), {
            currentAction: action,
            currentTarget: target || null
        });
        console.log(`✅ ACTION SENT to Firebase`);

        // Show waiting overlay
        showWaitingOverlay();
        
        // Disable buttons while waiting
        disableActionButtons();
    } catch (error) {
        console.error('❌ Error submitting action:', error);
    }
}

let waitingListener = null;

function showWaitingOverlay() {
    document.getElementById('waiting-overlay').classList.remove('hidden');
    
    // Listen for updates and check if all players have submitted
    const playersRef = ref(database, `rooms/${currentRoomId}/players`);
    if (waitingListener) waitingListener();
    
    waitingListener = onValue(playersRef, (snapshot) => {
        const playersData = snapshot.val() || {};
        updateWaitingPlayersInfo(playersData);
    });
}

function hideWaitingOverlay() {
    console.log('👁️ Hiding waiting overlay, cleaning up listener');
    document.getElementById('waiting-overlay').classList.add('hidden');
    if (waitingListener) {
        waitingListener();
        waitingListener = null;
    }
}

function updateWaitingPlayersInfo(playersData) {
    const info = document.getElementById('waiting-players-info');
    let waitingList = '';
    let allSubmitted = true;

    Object.entries(playersData).forEach(([uid, pData]) => {
        const submitted = pData.currentAction !== null && pData.currentAction !== undefined;
        const status = submitted ? '✓' : '⏳';
        const name = pData.name;
        waitingList += `<p>${status} ${name}</p>`;
        if (!submitted) allSubmitted = false;
    });

    info.innerHTML = waitingList;

    // If all submitted, hide overlay
    if (allSubmitted) {
        hideWaitingOverlay();
    }
}

function disableActionButtons() {
    console.log('🔒 Disabling action buttons');
    document.querySelectorAll('.pod-btn').forEach(btn => {
        btn.disabled = true;
        btn.classList.add('opacity-50');
    });
}

function enableActionButtons() {
    console.log('🔓 Enabling action buttons');
    document.querySelectorAll('.pod-btn').forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('opacity-50');
    });
}

function updateButtonUI(pIdx) {
    // Apply highlighting to show selected action
    // In multiplayer, only buttons for your own player exist, so this is safe
    document.querySelectorAll(`#pod-${pIdx} .pod-btn`).forEach(b => b.classList.remove('selected-highlight'));
    const p = players[pIdx];
    if (p.currentAction) {
        const btn = document.getElementById(`btn-${pIdx}-${p.currentAction}`);
        if (btn) {
            btn.classList.add('selected-highlight');
            console.log(`🎯 Action highlighted for ${p.name}: ${p.currentAction}`);
        }
    }
}

function openTargetModal(shooterIdx) {
    const list = document.getElementById('target-list');
    list.innerHTML = '';
    players.forEach(p => {
        if (p.isAlive && p.idx !== shooterIdx) {
            const btn = document.createElement('button');
            btn.className = 'bg-gray-800 p-4 rounded-xl text-2xl hover:bg-red-900 border-2 border-transparent hover:border-red-500 transition-all flex flex-col items-center';
            btn.innerHTML = `<span>${p.emoji}</span><span class="text-[10px] font-bold mt-1">${p.name}</span>`;
            btn.onclick = () => {
                players[shooterIdx].currentAction = 'shoot';
                players[shooterIdx].currentTarget = p.idx;
                updateButtonUI(shooterIdx);
                closeTargetModal();
                
                // In multiplayer, submit action to Firebase
                if (currentRoomId) {
                    submitActionToFirebase(shooterIdx, 'shoot', p.idx, players[shooterIdx].uid);
                }
            };
            list.appendChild(btn);
        }
    });
    document.getElementById('target-modal').classList.remove('hidden');
}

function closeTargetModal() {
    document.getElementById('target-modal').classList.add('hidden');
}

function runAI(p) {
    const aliveOthers = players.filter(o => o.isAlive && o.idx !== p.idx);
    if (aliveOthers.length === 0) return;
    let choices = ['reload'];
    if (p.lastAction !== 'shield') choices.push('shield');
    if (p.bullets > 0) choices.push('shoot');
    const choice = choices[Math.floor(Math.random() * choices.length)];
    p.currentAction = choice;
    if (choice === 'shoot') {
        p.currentTarget = aliveOthers[Math.floor(Math.random() * aliveOthers.length)].idx;
    }
}

async function resolveActions() {
    // Single-player resolution - no Firebase involved
    if (currentRoomId) {
        // In multiplayer, use host resolution
        if (isHost) {
            await hostResolveActions();
        }
        return;
    }

    gameActive = false;
    document.getElementById('game-status').textContent = "結算中...";
    players.forEach(p => {
        if (p.isAlive && !p.currentAction) p.currentAction = 'reload';
    });
    const incomingShots = players.map(() => []);
    players.forEach(p => {
        if (!p.isAlive) return;
        const tag = document.getElementById(`action-tag-${p.idx}`);
        if (p.currentAction === 'reload') {
            p.bullets++;
            tag.textContent = "+1 子彈";
        } else if (p.currentAction === 'shield') {
            tag.textContent = "防禦";
            document.getElementById(`shield-${p.idx}`).classList.remove('hidden');
        } else if (p.currentAction === 'shoot') {
            const targetIdx = p.currentTarget;
            // NEW: Validate target index to prevent crash
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
        }
        document.getElementById(`bullet-ui-${p.idx}`).textContent = p.bullets;
    });
    let victims = new Set();
    players.forEach((p, idx) => {
        if (!p.isAlive) return;
        const shots = incomingShots[idx];
        if (shots.length === 0) return;
        if (p.currentAction === 'shield') return;
        if (p.currentAction === 'reload') {
            victims.add(idx);
        } else if (p.currentAction === 'shoot') {
            const myTargetIdx = p.currentTarget;
            const thirdPartyShots = shots.filter(attackerIdx => attackerIdx !== myTargetIdx);
            const targetShotMe = shots.includes(myTargetIdx);
            if (thirdPartyShots.length > 0) {
                victims.add(idx);
            } else if (!targetShotMe) {
                victims.add(idx);
            }
        }
    });
    victims.forEach(vIdx => {
        players[vIdx].isAlive = false;
        const node = document.getElementById(`node-${vIdx}`);
        node.classList.add('eliminated');
        const pod = document.getElementById(`pod-${vIdx}`);
        if (pod) pod.classList.add('hidden');
        const cross = document.createElement('div');
        cross.className = 'cross-mark';
        cross.textContent = '❌';
        node.appendChild(cross);
    });
    await new Promise(r => setTimeout(r, 2200));
    players.forEach(p => {
        p.lastAction = p.currentAction;
        p.currentAction = null;
        p.currentTarget = null;
        const tag = document.getElementById(`action-tag-${p.idx}`);
        if (tag) tag.textContent = '';
        const shield = document.getElementById(`shield-${p.idx}`);
        if (shield) shield.classList.add('hidden');
        const podBtns = document.querySelectorAll(`#pod-${p.idx} .pod-btn`);
        podBtns.forEach(b => b.classList.remove('selected-highlight'));
    });
    enableActionButtons();
    checkGameEnd();
}

function checkGameEnd() {
    if (currentRoomId) {
        checkGameEndForMultiplayer();
    } else {
        const alive = players.filter(p => p.isAlive);
        if (alive.length <= 1) {
            const screen = document.getElementById('victory-screen');
            const winEmoji = document.getElementById('winner-emoji');
            const winName = document.getElementById('winner-name');
            const winTitle = document.getElementById('winner-title');
            if (alive.length === 1) {
                winEmoji.textContent = alive[0].emoji;
                winName.textContent = alive[0].name;
                winTitle.textContent = "獲得勝利！";
            } else {
                winEmoji.textContent = "🤝";
                winName.textContent = "無人生還";
                winTitle.textContent = "平手！";
            }
            screen.classList.remove('hidden');
        } else {
            startTurnCycle();
        }
    }
}

// Expose functions to global window for HTML onclick attributes
window.resetToMenu = resetToMenu;
window.handleInput = handleInput;
window.closeTargetModal = closeTargetModal;
window.markPlayerReady = markPlayerReady;
window.startGameAsHost = startGameAsHost;
window.leaveRoom = leaveRoom;

// ============================================================
// MULTIPLAYER ROOM MANAGEMENT FUNCTIONS
// ============================================================

function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 4; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

async function createRoom() {
    if (!currentUser) {
        console.error('User not authenticated');
        return;
    }

    const roomId = generateRoomId();
    currentRoomId = roomId;
    isHost = true;

    const playerCount = parseInt(document.getElementById('player-count-lobby').value);
    const timerSetting = parseInt(document.getElementById('timer-setting-lobby').value);
    const showBullets = document.getElementById('show-bullets-lobby').checked;

    const roomData = {
        hostUid: currentUser.uid,
        playerCount: playerCount,
        timerSetting: timerSetting,
        showBullets: showBullets,
        gameState: 'lobby', // 'lobby', 'playing', 'finished'
        createdAt: new Date().toISOString()
    };

    try {
        console.log('🎮 HOST: Creating room with ID:', roomId);
        await set(ref(database, `rooms/${roomId}`), roomData);
        console.log('✅ HOST: Room data written to Firebase');
        
        // Add current user as host player
        const playerData = {
            uid: currentUser.uid,
            name: `玩家 1`,
            emoji: emojis[0],
            type: 'human',
            ready: false,
            joinedAt: new Date().toISOString()
        };
        await set(ref(database, `rooms/${roomId}/players/${currentUser.uid}`), playerData);
        console.log('✅ HOST: Player data written to Firebase');

        showLobbyUI();
        listenToRoomUpdates();
        
        console.log('✅ Room created:', roomId);
    } catch (error) {
        console.error('❌ Error creating room:', error);
    }
}

async function joinRoom() {
    if (!currentUser) {
        console.error('User not authenticated');
        return;
    }

    const roomId = document.getElementById('join-room-input').value.toUpperCase().trim();
    if (!roomId || roomId.length !== 4) {
        showJoinError('房間ID無效');
        return;
    }

    try {
        console.log('🎮 CLIENT: Attempting to join room:', roomId);
        const roomSnap = await get(ref(database, `rooms/${roomId}`));
        if (!roomSnap.exists()) {
            showJoinError('房間不存在');
            console.error('❌ Room not found:', roomId);
            return;
        }

        const roomData = roomSnap.val();
        console.log('📦 CLIENT: Room data fetched:', roomData);
        
        if (roomData.gameState !== 'lobby') {
            showJoinError('房間已開始或已結束');
            console.error('❌ Room not in lobby state:', roomData.gameState);
            return;
        }

        const playersSnap = await get(ref(database, `rooms/${roomId}/players`));
        const playersInRoom = playersSnap.exists() ? playersSnap.val() : {};
        const totalPlayerCount = Object.keys(playersInRoom).length;

        if (totalPlayerCount >= roomData.playerCount) {
            showJoinError('房間已滿');
            console.error('❌ Room is full');
            return;
        }

        currentRoomId = roomId;
        isHost = false;
        readyStatus = false;

        // Count only human players (not AI) to determine emoji position
        const humanCount = Object.values(playersInRoom).filter(p => p.type !== 'ai').length;
        const playerIndex = humanCount; // This is correct for the next human's position
        const playerData = {
            uid: currentUser.uid,
            name: `玩家 ${playerIndex + 1}`,
            emoji: emojis[playerIndex % emojis.length],
            type: 'human',
            ready: false,
            joinedAt: new Date().toISOString()
        };
        
        await set(ref(database, `rooms/${roomId}/players/${currentUser.uid}`), playerData);
        console.log('✅ CLIENT: Player data written to Firebase');

        // Hide join error
        const joinError = document.getElementById('join-error');
        joinError.classList.add('hidden');
        joinError.textContent = '';

        showLobbyUI();
        listenToRoomUpdates();
        console.log('✅ CLIENT: Joined room:', roomId);
    } catch (error) {
        console.error('❌ Error joining room:', error);
        showJoinError('加入房間時發生錯誤');
    }
}

function showJoinError(message) {
    const joinError = document.getElementById('join-error');
    joinError.textContent = message;
    joinError.classList.remove('hidden');
}

function showLobbyUI() {
    document.getElementById('lobby-screen').classList.remove('hidden');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-ui').classList.add('hidden');

    if (isHost) {
        document.getElementById('player-setup-section').classList.remove('hidden');
        document.getElementById('create-room-btn').disabled = true;
        document.getElementById('created-room-info').classList.remove('hidden');
        document.getElementById('room-id-display').textContent = currentRoomId;
        // Initialize player config list when host enters lobby
        updateLobbyPlayerConfigList();
    } else {
        document.getElementById('player-setup-section').classList.add('hidden');
    }

    document.getElementById('room-info-panel').classList.remove('hidden');
    document.getElementById('current-room-id').textContent = currentRoomId;
}

function listenToRoomUpdates() {
    // Listen to entire room object to get both players AND playerTypes
    const fullRoomRef = ref(database, `rooms/${currentRoomId}`);
    roomPlayersListener = onValue(fullRoomRef, (snapshot) => {
        const roomData = snapshot.val() || {};
        const playersData = roomData.players || {};
        const playerTypes = roomData.playerTypes || {};
        
        // Update players list with player types for ready check
        updatePlayersList(playersData, playerTypes);
        
        // Check gameState changes
        if (roomData.gameState === 'playing') {
            console.log('🎮 Client: gameState changed to playing! Starting game...');
            startMultiplayerGame();
        } else if (roomData.gameState) {
            console.log('📦 Client: Current gameState:', roomData.gameState);
        }
    });
}

function updatePlayersList(playersData, playerTypes = {}) {
    const playerList = document.getElementById('room-players-list');
    playerList.innerHTML = '';
    document.getElementById('player-count-joined').textContent = Object.keys(playersData).length;

    let playerIndex = 0;
    Object.entries(playersData).forEach(([uid, playerData]) => {
        const isCurrentUser = uid === currentUser.uid;
        const playerType = playerTypes[playerIndex] || playerData.type || 'human';
        const playerBadge = document.createElement('div');
        playerBadge.className = `flex items-center gap-2 bg-gray-800 p-3 rounded-lg border-2 ${playerData.ready ? 'border-green-500' : 'border-gray-600'}`;
        playerBadge.innerHTML = `
            <span class="text-2xl">${playerData.emoji}</span>
            <div class="flex-1">
                <p class="font-bold text-white text-sm">${playerData.name}${isCurrentUser ? ' (你)' : ''}</p>
                <p class="text-[10px] ${playerData.ready ? 'text-green-400' : 'text-gray-400'}">${playerData.ready ? '準備就緒 ✓' : playerType === 'ai' ? '電腦 AI' : '未準備'}</p>
            </div>
        `;
        playerList.appendChild(playerBadge);
        playerIndex++;
    });

    // Check if all HUMAN players are ready (AI players are always considered ready)
    if (isHost) {
        const humanPlayersReady = Object.entries(playersData).every(([ uid, p], idx) => {
            const playerType = playerTypes[idx] || p.type || 'human';
            return playerType === 'ai' || p.ready; // AI is always ready, human must be ready
        });
        const playerCount = Object.keys(playersData).length;
        const minPlayers = parseInt(document.getElementById('player-count-lobby').value);
        
        const startBtn = document.getElementById('start-game-btn-host');
        if (playerCount >= minPlayers && humanPlayersReady) {
            startBtn.classList.remove('hidden');
        } else {
            startBtn.classList.add('hidden');
        }
    }
}

async function markPlayerReady() {
    if (!currentRoomId || !currentUser) return;

    readyStatus = !readyStatus;
    await update(ref(database, `rooms/${currentRoomId}/players/${currentUser.uid}`), {
        ready: readyStatus
    });

    const readyBtn = isHost ? document.getElementById('ready-btn-host') : document.getElementById('ready-btn-client');
    readyBtn.textContent = readyStatus ? '已準備' : '準備就緒';
    readyBtn.classList.toggle('bg-green-600', readyStatus);
    readyBtn.classList.toggle('bg-yellow-500', !readyStatus);
    readyBtn.classList.toggle('text-white', readyStatus);
    readyBtn.classList.toggle('text-black', !readyStatus);
}

async function startGameAsHost() {    if (!isHost || !currentRoomId) {
        console.error('❌ Cannot start game: isHost=' + isHost + ', currentRoomId=' + currentRoomId);
        return;
    }

    try {
        console.log('🎮 HOST: Starting game...');
        
        // Collect player type configs from lobby UI
        const typeInputs = document.querySelectorAll('.p-type-lobby');
        console.log('📋 HOST: Found ' + typeInputs.length + ' type inputs');
        
        const playerCount = parseInt(document.getElementById('player-count-lobby').value);
        console.log('📋 HOST: Player count from slider: ' + playerCount);
        
        if (typeInputs.length === 0) {
            console.error('❌ No player type inputs found! Player config list not populated');
            alert('Please set player types. Refresh the page and try again.');
            return;
        }
        
        const playerTypes = {};
        typeInputs.forEach((input, idx) => {
            playerTypes[idx] = input.value; // 'human' or 'ai'
        });
        console.log('🔧 HOST: Player types collected:', playerTypes);
        
        // CREATE AI PLAYERS FIRST before setting gameState
        const playersRef = ref(database, `rooms/${currentRoomId}/players`);
        const playersSnapshot = await get(playersRef);
        const existingPlayers = playersSnapshot.val() || {};
        console.log('👥 HOST: Existing players:', Object.keys(existingPlayers));
        
        for (let i = 0; i < playerCount; i++) {
            if (playerTypes[i] === 'ai' && !existingPlayers[`ai-${i}`]) {
                // Get nickname for AI player
                const nickInputs = document.querySelectorAll('.p-nick-lobby');
                const aiName = nickInputs[i]?.value || `玩家 ${i+1}`;
                
                // Create AI player entry
                await set(ref(database, `rooms/${currentRoomId}/players/ai-${i}`), {
                    uid: `ai-${i}`,
                    name: aiName,
                    emoji: emojis[i],
                    type: 'ai',
                    ready: true,
                    bullets: 0,
                    isAlive: true,
                    currentAction: null,
                    currentTarget: null
                });
                console.log(`🧀 HOST: Created AI player ai-${i} (${aiName})`);
            }
        }
        console.log('✅ HOST: All AI players created');
        
        // NOW set gameState to playing AFTER all players are in Firebase
        await update(ref(database, `rooms/${currentRoomId}`), {
            gameState: 'playing',
            playerTypes: playerTypes,
            turnStartTime: Date.now()
        });
        console.log('✅ HOST: gameState set to playing, all players synchronized');
    } catch (error) {
        console.error('❌ Error starting game:', error);
        alert('Error starting game: ' + error.message);
    }
}

function startMultiplayerGame() {
    console.log('🎮 Starting multiplayer game...');
    // Clean up room listeners
    if (roomPlayersListener) {
        console.log('🛑 Cleaning up room players listener');
        roomPlayersListener();
    }
    if (gameStateListener) {
        console.log('🛑 Cleaning up gameState listener');
        gameStateListener();
    }

    // Fetch room settings
    const roomRef = ref(database, `rooms/${currentRoomId}`);
    get(roomRef).then((snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) {
            console.error('❌ Room data not found!');
            return;
        }
        console.log('📦 Room data fetched:', roomData);
        startBeat = roomData.timerSetting || 9;
        showBulletCount = roomData.showBullets !== undefined ? roomData.showBullets : true;
        const playerTypes = roomData.playerTypes || {}; // Load player types from room

        // Fetch players data
        const playersRef = ref(database, `rooms/${currentRoomId}/players`);
        get(playersRef).then((playersSnap) => {
            const playersData = playersSnap.val();
            if (!playersData) {
                console.error('❌ Players data not found!');
                return;
            }
            
            console.log('👥 Players data fetched:', playersData);
            console.log('⚠️ Player count:', Object.keys(playersData).length);
            
            // Build players array in consistent order based on playerTypes
            // This ensures all browsers see players in the same order
            players = [];
            const playerTypeIndices = Object.keys(playerTypes).map(Number).sort((a, b) => a - b);
            
            // Collect human and AI players separately
            const humanPlayers = [];
            const aiPlayers = {};
            
            Object.entries(playersData).forEach(([uid, pData]) => {
                if (uid.startsWith('ai-')) {
                    // Extract AI index from uid (e.g., 'ai-0' -> 0)
                    const aiIdx = parseInt(uid.substring(3));
                    aiPlayers[aiIdx] = { uid, data: pData };
                } else {
                    humanPlayers.push({ uid, data: pData });
                }
            });
            
            console.log('👥 Human players found:', humanPlayers.length);
            console.log('👥 AI players found:', Object.keys(aiPlayers).length);
            
            // Build final players array respecting playerTypes order
            let humanIndex = 0;
            playerTypeIndices.forEach(typeIdx => {
                const expectedType = playerTypes[typeIdx];
                let playerEntry;
                
                if (expectedType === 'ai') {
                    // Use AI player with matching index
                    playerEntry = aiPlayers[typeIdx];
                    if (!playerEntry) {
                        console.warn(`⚠️  Expected AI player at index ${typeIdx} but not found in Firebase`);
                        return; // Skip this slot
                    }
                } else {
                    // expectedType === 'human': use next available human player
                    if (humanIndex >= humanPlayers.length) {
                        console.warn(`⚠️  Expected human player at index ${typeIdx} but ran out of human players (have ${humanIndex}, need ${typeIdx - humanIndex + 1})`);
                        return; // Skip this slot
                    }
                    playerEntry = humanPlayers[humanIndex++];
                }
                
                if (playerEntry) {
                    players.push({
                        uid: playerEntry.uid,
                        idx: players.length,  // Assign index based on final position
                        name: playerEntry.data.name,
                        emoji: playerEntry.data.emoji,
                        type: expectedType,
                        bullets: playerEntry.data.bullets || 0,
                        isAlive: playerEntry.data.isAlive !== undefined ? playerEntry.data.isAlive : true,
                        lastAction: playerEntry.data.lastAction || null,
                        currentAction: playerEntry.data.currentAction || null,
                        currentTarget: playerEntry.data.currentTarget || null
                    });
                    console.log(`✅ Player ${players.length - 1}: ${playerEntry.data.name} (${expectedType}, uid: ${playerEntry.uid})`);
                } else {
                    console.warn(`⚠️  Skipped player slot ${typeIdx} due to missing Firebase entry`);
                }
            });
            
            // Validate we have enough players
            if (players.length !== playerTypeIndices.length) {
                console.warn(`⚠️  Player count mismatch: built ${players.length} but expected ${playerTypeIndices.length}`);
            }

            humanCount = players.filter(p => p.type === 'human').length;
            console.log('✅ Players initialized (consistent order):', players);

            document.body.classList.add('playing');
            document.getElementById('lobby-screen').classList.add('hidden');
            document.getElementById('game-ui').classList.remove('hidden');
            window.scrollTo(0, 0);
            
            renderArena();
            startTurnCycle();

            // Listen to game state updates from Firebase
            listenToGameStateUpdates();

            // Host listens to all player actions
            if (isHost) {
                console.log('🎮 HOST: Setting up player action listener');
                listenToPlayerActions();
            }
        }).catch(err => {
            console.error('❌ Error fetching players:', err);
        });
    }).catch(err => {
        console.error('❌ Error fetching room:', err);
    });
}

let lastTurnState = null; // Track previous turn state to detect resolution

function listenToGameStateUpdates() {
    // All clients (including host) listen for turn changes
    const playersRef = ref(database, `rooms/${currentRoomId}/players`);
    // NEW: Store unsubscriber for cleanup
    if (gameStateUpdatesListener) {
        console.log('🛑 Cleaning up previous gameStateUpdatesListener');
        gameStateUpdatesListener();
    }
    gameStateUpdatesListener = onValue(playersRef, (snapshot) => {
        const playersData = snapshot.val() || {};
        
        // Check if turn resolution just completed (all actions cleared)
        const allActionsNull = Object.values(playersData).every(p => {
            const alive = players.find(pl => pl.uid === p.uid)?.isAlive;
            if (!alive) return true; // Dead players don't need to submit
            return p.currentAction === null || p.currentAction === undefined;
        });

        const wasWaiting = lastTurnState === 'waiting';
        const isNowIdle = allActionsNull;
        
        // Detect transition from waiting to idle = turn resolution complete
        if (wasWaiting && isNowIdle) {
            console.log('🔄 PLAYER: Detected turn resolution complete');
            
            // Check if game has ended
            checkGameEndForMultiplayer();
            
            // If game hasn't ended, client continues to next turn
            if (!isHost) {
                hideWaitingOverlay();
                enableActionButtons();
                
                // Small delay to let animations finish before starting next turn
                setTimeout(() => {
                    const alive = players.filter(p => p.isAlive);
                    if (alive.length > 1) {
                        console.log('🔄 CLIENT: Starting next turn cycle, alive players:', alive.length);
                        startTurnCycle();
                    }
                }, 500);
            }
        }

        lastTurnState = allActionsNull ? 'idle' : 'waiting';
        
        // Update local player state with Firebase data
        players.forEach(p => {
            const fbData = playersData[p.uid];
            if (fbData) {
                // Update visible properties
                if (fbData.bullets !== undefined) p.bullets = fbData.bullets;
                if (fbData.isAlive !== undefined) p.isAlive = fbData.isAlive;
                if (fbData.lastAction !== undefined) p.lastAction = fbData.lastAction;
                if (fbData.currentAction !== undefined) p.currentAction = fbData.currentAction;
                if (fbData.currentTarget !== undefined) p.currentTarget = fbData.currentTarget;
                
                // Update UI
                const bulletUI = document.getElementById(`bullet-ui-${p.idx}`);
                if (bulletUI) bulletUI.textContent = p.bullets;

                const avatar = document.getElementById(`avatar-${p.idx}`);
                if (avatar && !p.isAlive && !avatar.classList.contains('opacity-50')) {
                    avatar.classList.add('opacity-50');
                }
            }
        });
    });
}

function listenToPlayerActions() {
    // Host will listen to all player actions
    if (!isHost) return;

    const playersRef = ref(database, `rooms/${currentRoomId}/players`);
    // NEW: Store unsubscriber for cleanup
    if (playerActionsListener) {
        console.log('🛑 Cleaning up previous playerActionsListener');
        playerActionsListener();
    }
    playerActionsListener = onValue(playersRef, (snapshot) => {
        const playersData = snapshot.val() || {};
        
        // Check if all alive players have submitted actions
        const allSubmitted = checkAllActionsSubmitted(playersData);
        if (allSubmitted) {
            // Update local player data with Firebase data
            syncPlayersFromFirebase(playersData);
        }
    });
}

function checkAllActionsSubmitted(playersData) {
    const alivePlayerUIDs = Object.entries(playersData)
        .filter(([_, pData]) => {
            const playerIdx = players.findIndex(p => p.uid === _);
            return playerIdx >= 0 && players[playerIdx].isAlive;
        })
        .map(([uid, _]) => uid);

    const allSubmitted = alivePlayerUIDs.every(uid => {
        const pData = playersData[uid];
        return pData.currentAction !== null && pData.currentAction !== undefined;
    });

    return allSubmitted && alivePlayerUIDs.length > 0;
}

function syncPlayersFromFirebase(playersData) {
    players.forEach(p => {
        const fbData = playersData[p.uid];
        if (fbData) {
            p.currentAction = fbData.currentAction;
            p.currentTarget = fbData.currentTarget;
        }
    });
}

async function hostCheckAllActionsSubmitted() {
    if (!isHost || !currentRoomId) {
        // If not host and countdown reaches 0, just wait
        return;
    }

    // Check if all players have submitted
    const playersRef = ref(database, `rooms/${currentRoomId}/players`);
    const snapshot = await get(playersRef);
    const playersData = snapshot.val() || {};

    if (checkAllActionsSubmitted(playersData)) {
        syncPlayersFromFirebase(playersData);
        await hostResolveActions();
    } else {
        // Not all players submitted, default remaining to reload
        players.forEach(p => {
            if (p.isAlive && !p.currentAction) {
                p.currentAction = 'reload';
                p.currentTarget = null;
                console.log(`⚙️  Defaulting ${p.name} to reload (no action submitted)`);
            }
        });

        await hostResolveActions();
    }
}

async function hostResolveActions() {
    gameActive = false;
    document.getElementById('game-status').textContent = "結算中...";
    
    players.forEach(p => {
        if (p.isAlive && !p.currentAction) p.currentAction = 'reload';
    });

    const incomingShots = players.map(() => []);
    players.forEach(p => {
        if (!p.isAlive) return;
        const tag = document.getElementById(`action-tag-${p.idx}`);
        if (p.currentAction === 'reload') {
            p.bullets++;
            tag.textContent = "+1 子彈";
        } else if (p.currentAction === 'shield') {
            tag.textContent = "防禦";
            document.getElementById(`shield-${p.idx}`).classList.remove('hidden');
        } else if (p.currentAction === 'shoot') {
            const targetIdx = p.currentTarget;
            // NEW: Validate target index to prevent crash
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
        }
        document.getElementById(`bullet-ui-${p.idx}`).textContent = p.bullets;
    });

    let victims = new Set();
    players.forEach((p, idx) => {
        if (!p.isAlive) return;
        const shots = incomingShots[idx];
        if (shots.length === 0) return;
        if (p.currentAction === 'shield') return;
        if (p.currentAction === 'reload') {
            victims.add(idx);
        } else if (p.currentAction === 'shoot') {
            const myTargetIdx = p.currentTarget;
            const thirdPartyShots = shots.filter(attackerIdx => attackerIdx !== myTargetIdx);
            const targetShotMe = shots.includes(myTargetIdx);
            if (thirdPartyShots.length > 0) {
                victims.add(idx);
            } else if (!targetShotMe) {
                victims.add(idx);
            }
        }
    });

    victims.forEach(vIdx => {
        players[vIdx].isAlive = false;
        const node = document.getElementById(`node-${vIdx}`);
        node.classList.add('eliminated');
        const pod = document.getElementById(`pod-${vIdx}`);
        if (pod) pod.classList.add('hidden');
        const cross = document.createElement('div');
        cross.className = 'cross-mark';
        cross.textContent = '❌';
        node.appendChild(cross);
    });

    // Prepare state update for Firebase
    const playerUpdates = {};
    players.forEach(p => {
        playerUpdates[p.uid] = {
            bullets: p.bullets,
            isAlive: p.isAlive,
            lastAction: p.currentAction,
            currentAction: null,
            currentTarget: null
        };
    });

    // Write updated state back to Firebase
    try {
        await update(ref(database, `rooms/${currentRoomId}/players`), 
            Object.keys(playerUpdates).reduce((acc, uid) => {
                Object.keys(playerUpdates[uid]).forEach(key => {
                    acc[`${uid}/${key}`] = playerUpdates[uid][key];
                });
                return acc;
            }, {})
        );

        // Increment turn counter or add turn log
        const currentTurn = await get(ref(database, `rooms/${currentRoomId}/currentTurn`));
        const turnNumber = (currentTurn.val() || 0) + 1;
        await update(ref(database, `rooms/${currentRoomId}`), {
            currentTurn: turnNumber
        });
    } catch (error) {
        console.error('Error writing game state to Firebase:', error);
    }

    await new Promise(r => setTimeout(r, 2200));
    
    players.forEach(p => {
        p.lastAction = p.currentAction;
        p.currentAction = null;
        p.currentTarget = null;
        const tag = document.getElementById(`action-tag-${p.idx}`);
        if (tag) tag.textContent = '';
        const shield = document.getElementById(`shield-${p.idx}`);
        if (shield) shield.classList.add('hidden');
        const podBtns = document.querySelectorAll(`#pod-${p.idx} .pod-btn`);
        podBtns.forEach(b => b.classList.remove('selected-highlight'));
    });

    // Hide waiting overlay and re-enable buttons for next turn
    console.log('✅ HOST: Turn resolution complete, cleaning up for next turn');
    hideWaitingOverlay();
    enableActionButtons();
    checkGameEnd();
}

function checkGameEndForMultiplayer() {
    const alive = players.filter(p => p.isAlive);
    console.log(`👥 Players alive: ${alive.length} of ${players.length}`);
    
    if (alive.length <= 1) {
        console.log('🏆 Game over! Showing victory screen');
        const screen = document.getElementById('victory-screen');
        const winEmoji = document.getElementById('winner-emoji');
        const winName = document.getElementById('winner-name');
        const winTitle = document.getElementById('winner-title');
        if (alive.length === 1) {
            winEmoji.textContent = alive[0].emoji;
            winName.textContent = alive[0].name;
            winTitle.textContent = "獲得勝利！";
        } else {
            winEmoji.textContent = "🤝";
            winName.textContent = "無人生還";
            winTitle.textContent = "平手！";
        }
        screen.classList.remove('hidden');

        // Stop listening to Firebase - clean up all listeners
        cleanupAllListeners();
    } else {
        console.log(`🔄 Game continues, ${alive.length} players alive`);
        startTurnCycle();
    }
}

function leaveRoom() {
    if (!currentRoomId || !currentUser) return;

    // Remove player from room
    remove(ref(database, `rooms/${currentRoomId}/players/${currentUser.uid}`)).then(() => {
        // Clean up ALL Firebase listeners
        cleanupAllListeners();

        currentRoomId = null;
        isHost = false;
        readyStatus = false;

        // Return to setup screen
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('room-info-panel').classList.add('hidden');
        document.getElementById('created-room-info').classList.add('hidden');
        document.getElementById('player-setup-section').classList.add('hidden');
        document.getElementById('create-room-btn').disabled = false;
        document.getElementById('join-room-input').value = '';
    });
}

// ============================================================
// LOBBY EVENT LISTENERS
// ============================================================

async function handlePlayerTypeChange(playerIdx, newType) {
    // If not in a room yet, just ignore (will be handled on game start)
    if (!currentRoomId || !isHost) return;
    
    // Check if AI player already exists
    const playersRef = ref(database, `rooms/${currentRoomId}/players`);
    const snapshot = await get(playersRef);
    const existingPlayers = snapshot.val() || {};
    
    const aiUid = `ai-${playerIdx}`;
    
    if (newType === 'ai' && !existingPlayers[aiUid]) {
        // Create AI player immediately when selected
        const nickInputs = document.querySelectorAll('.p-nick-lobby');
        const aiName = nickInputs[playerIdx]?.value || `玩家 ${playerIdx+1}`;
        
        try {
            await set(ref(database, `rooms/${currentRoomId}/players/${aiUid}`), {
                uid: aiUid,
                name: aiName,
                emoji: emojis[playerIdx],
                type: 'ai',
                ready: true,  // AI players are always ready
                bullets: 0,
                isAlive: true,
                currentAction: null,
                currentTarget: null
            });
            console.log(`✅ AI player ai-${playerIdx} created with ready: true`);
        } catch (error) {
            console.error(`❌ Error creating AI player:`, error);
        }
    } else if (newType === 'human' && existingPlayers[aiUid]) {
        // Remove AI player if switching back to human
        try {
            await remove(ref(database, `rooms/${currentRoomId}/players/${aiUid}`));
            console.log(`✅ Removed AI player ai-${playerIdx}`);
        } catch (error) {
            console.error(`❌ Error removing AI player:`, error);
        }
    }
}

function updateLobbyPlayerConfigList() {
    const count = parseInt(document.getElementById('player-count-lobby').value);
    const listDiv = document.getElementById('player-config-list-lobby');
    if (!listDiv) return; // Only runs if in lobby
    
    listDiv.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-800/50 p-3 rounded-xl border border-gray-700 mb-2';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-2xl">${emojis[i]}</span>
                <input type="text" class="nickname-input-lobby p-nick-lobby" data-idx="${i}" value="玩家 ${i+1}" maxlength="8" class="bg-gray-700 rounded text-white p-1 text-sm">
            </div>
            <select class="bg-gray-700 rounded-lg text-xs font-black px-3 py-2 p-type-lobby uppercase" data-idx="${i}">
                <option value="human" ${i===0?'selected':''}>真人</option>
                <option value="ai" ${i!==0?'selected':''}>電腦 AI</option>
            </select>
        `;
        listDiv.appendChild(div);
    }
    
    // Add change listeners to dropdowns
    const dropdowns = listDiv.querySelectorAll('.p-type-lobby');
    dropdowns.forEach(dropdown => {
        dropdown.addEventListener('change', (e) => {
            const playerIdx = parseInt(e.target.getAttribute('data-idx'));
            const newType = e.target.value;
            handlePlayerTypeChange(playerIdx, newType);
        });
    });
}

document.getElementById('player-count-lobby').addEventListener('input', async () => {
    document.getElementById('player-count-val-lobby').textContent = document.getElementById('player-count-lobby').value;
    updateLobbyPlayerConfigList();
    
    // Clean up AI players that are no longer needed when player count decreases
    if (currentRoomId && isHost) {
        const newPlayerCount = parseInt(document.getElementById('player-count-lobby').value);
        const playersRef = ref(database, `rooms/${currentRoomId}/players`);
        const snapshot = await get(playersRef);
        const playersData = snapshot.val() || {};
        
        // Remove any AI players with indices >= newPlayerCount
        for (let i = 0; i < 8; i++) {  // Max 8 players
            if (i >= newPlayerCount) {
                const aiUid = `ai-${i}`;
                if (playersData[aiUid]) {
                    try {
                        await remove(ref(database, `rooms/${currentRoomId}/players/${aiUid}`));
                        console.log(`🗑️  Removed excess AI player ai-${i}`);
                    } catch (error) {
                        console.error(`❌ Error removing AI player ai-${i}:`, error);
                    }
                }
            }
        }
    }
});

document.getElementById('timer-setting-lobby').addEventListener('input', () => {
    document.getElementById('timer-val-lobby').textContent = document.getElementById('timer-setting-lobby').value;
});

// Initialize lobby player config list on page load
updateLobbyPlayerConfigList();

document.getElementById('create-room-btn').addEventListener('click', createRoom);
document.getElementById('join-room-btn').addEventListener('click', joinRoom);
document.getElementById('ready-btn-host').addEventListener('click', markPlayerReady);
document.getElementById('ready-btn-client').addEventListener('click', markPlayerReady);
document.getElementById('start-game-btn-host').addEventListener('click', startGameAsHost);
document.getElementById('leave-room-btn').addEventListener('click', leaveRoom);

// Allow Enter key to join room
document.getElementById('join-room-input').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        joinRoom();
    }
});

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAsowaXjAhhoOnge5fjzb0UrMwvTzZfSKE",
  authDomain: "minigame-b258e.firebaseapp.com",
  databaseURL: "https://minigame-b258e-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "minigame-b258e",
  storageBucket: "minigame-b258e.firebasestorage.app",
  messagingSenderId: "1073020133596",
  appId: "1073020133596"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// Perform anonymous authentication on page load
signInAnonymously(auth)
  .then((userCredential) => {
    currentUser = userCredential.user;
    console.log('Anonymous user UID:', currentUser.uid);
    
    // Show lobby screen by default
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
  })
  .catch((error) => {
    console.error('Anonymous sign-in error:', error);
  });