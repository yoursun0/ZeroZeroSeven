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
let firebaseRoomListener = null;
let roomPlayersListener = null;
let gameStateListener = null;

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
                // In multiplayer, submit AI action to Firebase
                if (currentRoomId && p.uid) {
                    submitActionToFirebase(p.idx, p.currentAction, p.currentTarget);
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
            submitActionToFirebase(pIdx, action, null);
        }
    }
}

async function submitActionToFirebase(pIdx, action, target) {
    if (!currentRoomId || !currentUser) return;

    const player = players[pIdx];
    console.log(`📤 CLIENT: Submitting action for ${player.name}: ${action}${target ? ' -> ' + players[target].name : ''}`);
    try {
        await update(ref(database, `rooms/${currentRoomId}/players/${currentUser.uid}`), {
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
    if (humanCount > 1) return;
    document.querySelectorAll(`#pod-${pIdx} .pod-btn`).forEach(b => b.classList.remove('selected-highlight'));
    const p = players[pIdx];
    if (p.currentAction) {
        const btn = document.getElementById(`btn-${pIdx}-${p.currentAction}`);
        if (btn) btn.classList.add('selected-highlight');
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
                    submitActionToFirebase(shooterIdx, 'shoot', p.idx);
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
            p.bullets--;
            const targetIdx = p.currentTarget;
            incomingShots[targetIdx].push(p.idx);
            const targetName = players[targetIdx].name;
            tag.textContent = `🎯 -> ${targetName}`;
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
        const playerCount = playersSnap.exists() ? Object.keys(playersSnap.val()).length : 0;

        if (playerCount >= roomData.playerCount) {
            showJoinError('房間已滿');
            console.error('❌ Room is full');
            return;
        }

        currentRoomId = roomId;
        isHost = false;
        readyStatus = false;

        const playerIndex = playerCount;
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
    } else {
        document.getElementById('player-setup-section').classList.add('hidden');
    }

    document.getElementById('room-info-panel').classList.remove('hidden');
    document.getElementById('current-room-id').textContent = currentRoomId;
}

function listenToRoomUpdates() {
    const roomRef = ref(database, `rooms/${currentRoomId}/players`);
    roomPlayersListener = onValue(roomRef, (snapshot) => {
        updatePlayersList(snapshot.val() || {});
    });

    // Listen to entire room object for gameState changes (more reliable)
    const fullRoomRef = ref(database, `rooms/${currentRoomId}`);
    gameStateListener = onValue(fullRoomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (roomData && roomData.gameState === 'playing') {
            console.log('🎮 Client: gameState changed to playing! Starting game...');
            startMultiplayerGame();
        } else if (roomData) {
            console.log('📦 Client: Current gameState:', roomData.gameState);
        }
    });
}

function updatePlayersList(playersData) {
    const playerList = document.getElementById('room-players-list');
    playerList.innerHTML = '';
    document.getElementById('player-count-joined').textContent = Object.keys(playersData).length;

    Object.entries(playersData).forEach(([uid, playerData]) => {
        const isCurrentUser = uid === currentUser.uid;
        const playerBadge = document.createElement('div');
        playerBadge.className = `flex items-center gap-2 bg-gray-800 p-3 rounded-lg border-2 ${playerData.ready ? 'border-green-500' : 'border-gray-600'}`;
        playerBadge.innerHTML = `
            <span class="text-2xl">${playerData.emoji}</span>
            <div class="flex-1">
                <p class="font-bold text-white text-sm">${playerData.name}${isCurrentUser ? ' (你)' : ''}</p>
                <p class="text-[10px] ${playerData.ready ? 'text-green-400' : 'text-gray-400'}">${playerData.ready ? '準備就緒 ✓' : '未準備'}</p>
            </div>
        `;
        playerList.appendChild(playerBadge);
    });

    // Check if all players are ready and update host button visibility
    if (isHost) {
        const allReady = Object.values(playersData).every(p => p.ready);
        const readyCount = Object.values(playersData).filter(p => p.ready).length;
        const totalCount = Object.keys(playersData).length;
        const minPlayers = parseInt(document.getElementById('player-count-lobby').value);
        
        const startBtn = document.getElementById('start-game-btn-host');
        if (totalCount >= minPlayers && allReady) {
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

async function startGameAsHost() {    if (!isHost || !currentRoomId) return;

    try {
        console.log('🎮 HOST: Starting game, setting gameState to playing...');
        
        // Collect player type configs from lobby UI
        const typeInputs = document.querySelectorAll('.p-type-lobby');
        const playerTypes = {};
        typeInputs.forEach((input, idx) => {
            playerTypes[idx] = input.value; // 'human' or 'ai'
        });
        
        // Update game state in Firebase along with player types
        await update(ref(database, `rooms/${currentRoomId}`), {
            gameState: 'playing',
            playerTypes: playerTypes,
            turnStartTime: Date.now()
        });
        
        // Create Firebase entries for AI players
        const playersRef = ref(database, `rooms/${currentRoomId}/players`);
        const playersSnapshot = await get(playersRef);
        const existingPlayers = playersSnapshot.val() || {};
        const playerCount = parseInt(document.getElementById('player-count-lobby').value);
        
        for (let i = 0; i < playerCount; i++) {
            if (playerTypes[i] === 'ai' && !existingPlayers[`ai-${i}`]) {
                // Create AI player entry
                await set(ref(database, `rooms/${currentRoomId}/players/ai-${i}`), {
                    uid: `ai-${i}`,
                    name: document.querySelectorAll('.p-nick-lobby')[i]?.value || `玩家 ${i+1}`,
                    emoji: emojis[i],
                    type: 'ai',
                    ready: true,
                    bullets: 0,
                    isAlive: true,
                    currentAction: null,
                    currentTarget: null
                });
                console.log(`🧀 HOST: Created AI player ai-${i}`);
            }
        }
        
        console.log('✅ HOST: gameState updated to playing with player types:', playerTypes);
        
        // Also fetch and confirm it was written
        const verify = await get(ref(database, `rooms/${currentRoomId}/gameState`));
        console.log('✅ HOST: Verified gameState in DB:', verify.val());
    } catch (error) {
        console.error('❌ Error starting game:', error);
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
        startBeat = roomData.timerSetting;
        showBulletCount = roomData.showBullets;

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
            
            // Initialize players array from Firebase data
            players = Object.entries(playersData).map(([ uid, pData], index) => ({
                uid: uid,
                idx: index,
                name: pData.name,
                emoji: pData.emoji,
                type: playerTypes[index] || pData.type || 'human', // Load type from room playerTypes
                bullets: pData.bullets || 0,
                isAlive: pData.isAlive !== undefined ? pData.isAlive : true,
                lastAction: pData.lastAction || null,
                currentAction: pData.currentAction || null,
                currentTarget: pData.currentTarget || null
            }));

            humanCount = players.filter(p => p.type === 'human').length;
            console.log('✅ Players initialized:', players);

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
    onValue(playersRef, (snapshot) => {
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
    onValue(playersRef, (snapshot) => {
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
        // Not all players submitted, default to reload for those who didn't
        let allDefauleted = true;
        Object.entries(playersData).forEach(([uid, pData]) => {
            if ((pData.currentAction === null || pData.currentAction === undefined) &&
                players.find(p => p.uid === uid && p.isAlive)) {
                // Default to reload
                allDefauleted = false;
            }
        });

        // Default remaining players to reload
        players.forEach(p => {
            if (p.isAlive && (!p.currentAction )) {
                p.currentAction = 'reload';
                p.currentTarget = null;
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
            p.bullets--;
            const targetIdx = p.currentTarget;
            incomingShots[targetIdx].push(p.idx);
            const targetName = players[targetIdx].name;
            tag.textContent = `🎯 -> ${targetName}`;
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

        // Stop listening to Firebase
        if (gameStateListener) gameStateListener();
    } else {
        console.log(`🔄 Game continues, ${alive.length} players alive`);
        startTurnCycle();
    }
}

function leaveRoom() {
    if (!currentRoomId || !currentUser) return;

    // Remove player from room
    remove(ref(database, `rooms/${currentRoomId}/players/${currentUser.uid}`)).then(() => {
        // Clean up listeners
        if (roomPlayersListener) roomPlayersListener();
        if (gameStateListener) gameStateListener();

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
}

document.getElementById('player-count-lobby').addEventListener('input', () => {
    document.getElementById('player-count-val-lobby').textContent = document.getElementById('player-count-lobby').value;
    updateLobbyPlayerConfigList();
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