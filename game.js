// Firebase imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const emojis = ["🕵️", "🕶️", "💼", "🧨", "🚔", "🔫", "🎯", "🥷"];
let players = [];
let currentBeat = 9;
let startBeat = 9;
let gameActive = false;
let showBulletCount = true;
let humanCount = 0;
let turnTimer = null;

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
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('game-ui').classList.add('hidden');
    document.getElementById('victory-screen').classList.add('hidden');
    document.getElementById('exit-to-menu').classList.add('hidden');
    const arena = document.getElementById('game-arena');
    arena.querySelectorAll('.player-node, .control-pod').forEach(n => n.remove());
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

        if (p.type === 'human') {
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
    const aliveHumans = players.filter(p => p.isAlive && p.type === 'human');
    if (aliveHumans.length === 0) {
        document.getElementById('exit-to-menu').classList.remove('hidden');
    }
    gameActive = true;
    currentBeat = startBeat;
    runCountdown();
}

function runCountdown() {
    if (!gameActive) return;
    const display = document.getElementById('beat-counter');
    const status = document.getElementById('game-status');
    display.textContent = currentBeat;
    
    display.animate([
        { transform: 'scale(1.3)', opacity: 1 },
        { transform: 'scale(1)', opacity: 1 }
    ], { duration: 250 });

    if (currentBeat === 0) {
        resolveActions();
        return;
    }

    if (currentBeat === Math.floor(startBeat / 2)) {
        players.forEach(p => { if (p.isAlive && p.type === 'ai') runAI(p); });
        status.textContent = "最後衝刺！";
    } else if (currentBeat === startBeat) {
        status.textContent = "請選擇行動...";
    }

    currentBeat--;
    turnTimer = setTimeout(runCountdown, 1000);
}

function handleInput(pIdx, action) {
    if (currentBeat < 0 || !gameActive) return;
    const p = players[pIdx];
    if (!p.isAlive) return;
    if (action === 'shield' && p.lastAction === 'shield') return;
    if (action === 'shoot' && p.bullets <= 0) return;
    if (action === 'shoot') {
        openTargetModal(pIdx);
    } else {
        p.currentAction = action;
        p.currentTarget = null;
        updateButtonUI(pIdx);
    }
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
    checkGameEnd();
}

function checkGameEnd() {
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

// Expose functions to global window for HTML onclick attributes
window.resetToMenu = resetToMenu;
window.handleInput = handleInput;
window.closeTargetModal = closeTargetModal;

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
    console.log('Anonymous user UID:', userCredential.user.uid);
  })
  .catch((error) => {
    console.error('Anonymous sign-in error:', error);
  });