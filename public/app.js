/* ═══════════════════════════════════════════════════════════════
   FocusFlow — Client Application
   ═══════════════════════════════════════════════════════════════ */

// ── Socket Connection ────────────────────────────────────────────
const socket = io();

// ── DOM Elements ─────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const lobbyScreen = $('#lobby-screen');
const roomScreen = $('#room-screen');
const userName = $('#user-name-input');
const roomCodeInput = $('#room-code-input');
const createRoomBtn = $('#create-room-btn');
const joinRoomBtn = $('#join-room-btn');
const lobbyError = $('#lobby-error');

const roomIdDisplay = $('#room-id-display');
const copyRoomIdBtn = $('#copy-room-id');
const memberCount = $('#member-count');
const leaveRoomBtn = $('#leave-room-btn');
const settingsToggle = $('#settings-toggle-btn');
const settingsPanel = $('#settings-panel');
const settingsCloseBtn = $('#settings-close-btn');
const saveSettingsBtn = $('#save-settings-btn');

const phaseLabel = $('#phase-label');
const sessionDots = $('#session-dots');
const timerMinutes = $('#timer-minutes');
const timerSeconds = $('#timer-seconds');
const timerColon = $('.timer-colon');
const timerProgress = $('#timer-ring-progress');
const startPauseBtn = $('#start-pause-btn');
const resetBtn = $('#reset-btn');
const skipBtn = $('#skip-btn');
const playIcon = $('#play-icon');
const pauseIcon = $('#pause-icon');

const membersList = $('#members-list');
const chatMessages = $('#chat-messages');
const chatInput = $('#chat-input');
const chatSendBtn = $('#chat-send-btn');
const toast = $('#toast');

// Settings inputs
const settingWork = $('#setting-work');
const settingBreak = $('#setting-break');
const settingLongBreak = $('#setting-long-break');
const settingSessions = $('#setting-sessions');

// Auth DOM
const authWidget = $('#auth-widget');
const authLoggedOut = $('#auth-logged-out');
const authLoggedIn = $('#auth-logged-in');
const authUsername = $('#auth-username');
const authFocusTime = $('#auth-focus-time');
const authPomodoros = $('#auth-pomodoros');
const logoutBtn = $('#logout-btn');
const adminPanelBtn = $('#admin-panel-btn');
const authModal = $('#auth-modal');
const showLoginBtn = $('#show-login-btn');
const showRegisterBtn = $('#show-register-btn');
const authCloseBtn = $('#auth-close-btn');
const authForm = $('#auth-form');
const authModalTitle = $('#auth-modal-title');
const authUsernameInput = $('#auth-username-input');
const authPasswordInput = $('#auth-password-input');
const authSubmitBtn = $('#auth-submit-btn');
const authError = $('#auth-error');
const authSwitchText = $('#auth-switch-text');
const authSwitchBtn = $('#auth-switch-btn');

// ── State ────────────────────────────────────────────────────────
let currentRoom = null;
let myName = '';
let currentUser = null;
let authMode = 'login';

const CIRCUMFERENCE = 2 * Math.PI * 124; // r=124 matches SVG

// ── Session Persistence (localStorage) ────────────────────────────
function saveSession(roomId, name) {
    localStorage.setItem('focusflow_session', JSON.stringify({ roomId, name, ts: Date.now() }));
}
function clearSession() {
    localStorage.removeItem('focusflow_session');
}
function getSavedSession() {
    try {
        const data = JSON.parse(localStorage.getItem('focusflow_session'));
        if (data && data.roomId && data.name) {
            // Expire after 24 hours
            if (Date.now() - data.ts < 24 * 60 * 60 * 1000) return data;
        }
    } catch (e) { }
    return null;
}

// ── URL Routing ───────────────────────────────────────────────
function getRoomIdFromURL() {
    const path = window.location.pathname.replace(/^\//, '').replace(/\/$/, '');
    // Only return if it looks like a room ID (alphanumeric, not 'api' etc.)
    if (path && /^[A-Za-z0-9]{4,8}$/.test(path)) return path.toUpperCase();
    return null;
}
function navigateToRoom(roomId) {
    history.pushState({ roomId }, '', '/' + roomId);
}
function navigateToLobby() {
    history.pushState({}, '', '/');
}
function checkSettingsHash() {
    if (window.location.hash === '#settings') {
        settingsPanel.classList.remove('hidden');
    }
}

// ── Particle Background ─────────────────────────────────────────
(function initParticles() {
    const canvas = $('#particles-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    const PARTICLE_COUNT = 60;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 2 + 0.5,
            dx: (Math.random() - 0.5) * 0.3,
            dy: (Math.random() - 0.5) * 0.3,
            opacity: Math.random() * 0.3 + 0.05
        });
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(167, 139, 250, ${p.opacity})`;
            ctx.fill();
            p.x += p.dx;
            p.y += p.dy;
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;
        });

        // Draw subtle connections
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(167, 139, 250, ${0.04 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }

        requestAnimationFrame(draw);
    }
    draw();
})();

// ── Sound System (Web Audio API) ─────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function ensureAudioCtx() {
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, duration, type = 'sine', volume = 0.15) {
    ensureAudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playWorkComplete() {
    // Triumphant chord
    playTone(523.25, 0.4, 'sine', 0.12);   // C5
    setTimeout(() => playTone(659.25, 0.4, 'sine', 0.12), 100); // E5
    setTimeout(() => playTone(783.99, 0.6, 'sine', 0.12), 200); // G5
    setTimeout(() => playTone(1046.5, 0.8, 'sine', 0.15), 350); // C6
}

function playBreakComplete() {
    // Gentle rising tones
    playTone(440, 0.3, 'sine', 0.1);
    setTimeout(() => playTone(554.37, 0.3, 'sine', 0.1), 150);
    setTimeout(() => playTone(659.25, 0.5, 'sine', 0.12), 300);
}

function playClick() {
    playTone(800, 0.06, 'sine', 0.05);
}

function playJoin() {
    playTone(600, 0.15, 'sine', 0.08);
    setTimeout(() => playTone(800, 0.15, 'sine', 0.08), 100);
}

function playLeave() {
    playTone(800, 0.15, 'sine', 0.08);
    setTimeout(() => playTone(600, 0.15, 'sine', 0.08), 100);
}

// ── Helpers ──────────────────────────────────────────────────────
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return { minutes: String(m).padStart(2, '0'), seconds: String(s).padStart(2, '0') };
}

function showToast(message, duration = 3000) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, duration);
}

function switchScreen(from, to) {
    from.classList.remove('active');
    to.classList.add('active');
}

const AVATAR_COLORS = [
    '#a78bfa', '#6d28d9', '#34d399', '#059669',
    '#60a5fa', '#2563eb', '#f87171', '#f59e0b',
    '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'
];
function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── UI Updates ───────────────────────────────────────────────────
function updateTimerDisplay(timeRemaining, totalTime, phase, timerState) {
    const { minutes, seconds } = formatTime(timeRemaining);
    timerMinutes.textContent = minutes;
    timerSeconds.textContent = seconds;

    // Update progress ring
    const progress = 1 - (timeRemaining / totalTime);
    const offset = CIRCUMFERENCE * (1 - progress);
    timerProgress.style.strokeDasharray = CIRCUMFERENCE;
    timerProgress.style.strokeDashoffset = offset;

    // Phase colors
    timerProgress.classList.remove('break', 'long-break');
    phaseLabel.classList.remove('break', 'long-break');
    if (phase === 'break') {
        timerProgress.classList.add('break');
        phaseLabel.classList.add('break');
        phaseLabel.textContent = 'Перерыв';
    } else if (phase === 'longBreak') {
        timerProgress.classList.add('long-break');
        phaseLabel.classList.add('long-break');
        phaseLabel.textContent = 'Длинный перерыв';
    } else {
        phaseLabel.textContent = 'Фокус';
    }

    // Colon animation
    timerColon.classList.remove('paused', 'idle');
    if (timerState === 'paused') timerColon.classList.add('paused');
    else if (timerState === 'idle') timerColon.classList.add('idle');

    // Play/Pause icon
    if (timerState === 'running') {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
        startPauseBtn.title = 'Пауза';
    } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        startPauseBtn.title = 'Старт';
    }

    // Update document title
    document.title = `${minutes}:${seconds} — FocusFlow`;
}

function getTotalTime(phase, settings) {
    if (phase === 'work') return settings.workDuration;
    if (phase === 'break') return settings.breakDuration;
    return settings.longBreakDuration;
}

function updateSessionDots(completedSessions, total, phase) {
    sessionDots.innerHTML = '';
    for (let i = 0; i < total; i++) {
        const dot = document.createElement('div');
        dot.className = 'session-dot';
        if (i < completedSessions) {
            dot.classList.add('completed');
        } else if (i === completedSessions && phase === 'work') {
            dot.classList.add('active');
        }
        sessionDots.appendChild(dot);
    }
}

function updateMembersList(members) {
    membersList.innerHTML = '';
    const isAdminView = currentUser && currentUser.username === 'admin';
    members.forEach(m => {
        const li = document.createElement('li');
        li.className = 'member-item';
        const color = getAvatarColor(m.name);

        const mIsAdmin = m.userId === 1 || m.name === 'admin'; // We assume admin is username 'admin'

        let buttonsHTML = '';
        if (currentRoom && currentRoom.screenSharer && currentRoom.screenSharer.socketId === m.socketId && m.socketId !== socket.id) {
            buttonsHTML += `<button class="btn-icon btn-tiny watch-stream-btn" style="margin-left: auto; color: var(--accent-green);" title="Смотреть трансляцию" onclick="requestScreenShare('${m.socketId}', '${escapeHtml(m.name)}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>`;
        }

        if (isAdminView && m.socketId !== socket.id) {
            buttonsHTML += `<button class="btn-icon btn-tiny" style="margin-left: ${buttonsHTML ? '4px' : 'auto'}; color: var(--danger);" title="Выгнать" onclick="kickMember('${m.socketId}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
             </button>`;
        }

        li.innerHTML = `
      <div class="member-avatar" style="background:${color}">${m.name[0].toUpperCase()}</div>
      <span class="member-name">${escapeHtml(m.name)} ${mIsAdmin ? '👑' : ''}</span>
      ${buttonsHTML}
    `;
        membersList.appendChild(li);
    });
}

window.kickMember = function (tgtSocketId) {
    if (confirm('Вы уверены, что хотите выгнать этого пользователя?')) {
        socket.emit('kick-member', tgtSocketId);
    }
}

window.requestScreenShare = function (sharerId, name) {
    showScreenViewer(name);
    socket.emit('screen-offer', {
        targetSocketId: sharerId,
        offer: null
    });
};

function addChatMessage(name, text, isSystem = false) {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    if (isSystem) {
        div.innerHTML = `<span class="chat-msg-system">${escapeHtml(text)}</span>`;
    } else {
        div.innerHTML = `<span class="chat-msg-name">${escapeHtml(name)}:</span><span class="chat-msg-text">${escapeHtml(text)}</span>`;
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function updateRoomUI(room) {
    roomIdDisplay.textContent = room.id;
    memberCount.textContent = room.memberCount;
    updateMembersList(room.members);
    updateSessionDots(room.completedSessions, room.settings.sessionsBeforeLongBreak, room.phase);
    const total = getTotalTime(room.phase, room.settings);
    updateTimerDisplay(room.timeRemaining, total, room.phase, room.timerState);

    // Update settings inputs
    settingWork.value = room.settings.workDuration / 60;
    settingBreak.value = room.settings.breakDuration / 60;
    settingLongBreak.value = room.settings.longBreakDuration / 60;
    settingSessions.value = room.settings.sessionsBeforeLongBreak;

    // Update voice members if available
    if (room.voiceMembers) {
        updateVoiceMembersList(room.voiceMembers);
    }

    // Update screen share if currently active
    if (room.screenSharer && room.screenSharer.socketId !== socket.id) {
        if (typeof currentSharerSocketId !== 'undefined' && currentSharerSocketId !== room.screenSharer.socketId) {
            showScreenViewer(room.screenSharer.name);
            socket.emit('screen-offer', {
                targetSocketId: room.screenSharer.socketId,
                offer: null
            });
        }
    } else if (!room.screenSharer && typeof closeScreenViewer === 'function') {
        closeScreenViewer();
    }
}

// ── Authentication ───────────────────────────────────────────────
function updateAuthUI() {
    if (currentUser) {
        authLoggedOut.classList.add('hidden');
        authLoggedIn.classList.remove('hidden');
        authUsername.textContent = currentUser.username;
        authFocusTime.textContent = currentUser.total_focus_time || 0;
        authPomodoros.textContent = currentUser.pomodoros_completed || 0;
        // Auto fill name if not set
        if (!userName.value) userName.value = currentUser.username;

        // Admin features
        if (currentUser.username === 'admin') {
            if (adminPanelBtn) {
                adminPanelBtn.classList.remove('hidden');
                adminPanelBtn.style.display = 'inline-flex';
            }
        } else {
            if (adminPanelBtn) {
                adminPanelBtn.classList.add('hidden');
                adminPanelBtn.style.display = 'none';
            }
        }
    } else {
        authLoggedOut.classList.remove('hidden');
        authLoggedIn.classList.add('hidden');
        authFocusTime.textContent = '0';
        authPomodoros.textContent = '0';
        if (adminPanelBtn) {
            adminPanelBtn.classList.add('hidden');
            adminPanelBtn.style.display = 'none';
        }
    }
    // Update members list to show admin controls if already in room
    if (currentRoom && currentRoom.members) {
        updateMembersList(currentRoom.members);
    }
}

async function fetchUser() {
    try {
        const res = await fetch('/api/me');
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            updateAuthUI();
        }
    } catch (e) { }
}

function openAuthModal(mode) {
    authMode = mode;
    authModalTitle.textContent = mode === 'login' ? 'Вход' : 'Регистрация';
    authSubmitBtn.textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
    authSwitchText.textContent = mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?';
    authSwitchBtn.textContent = mode === 'login' ? 'Зарегистрироваться' : 'Войти';
    authError.textContent = '';
    authUsernameInput.value = '';
    authPasswordInput.value = '';
    authModal.classList.remove('hidden');
}

if (showLoginBtn) showLoginBtn.addEventListener('click', () => openAuthModal('login'));
if (showRegisterBtn) showRegisterBtn.addEventListener('click', () => openAuthModal('register'));
if (authCloseBtn) authCloseBtn.addEventListener('click', () => authModal.classList.add('hidden'));
if (authModal) authModal.addEventListener('click', (e) => {
    if (e.target === authModal) authModal.classList.add('hidden');
});

if (authSwitchBtn) authSwitchBtn.addEventListener('click', () => {
    openAuthModal(authMode === 'login' ? 'register' : 'login');
});

if (authForm) authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value.trim();
    if (!username || !password) return;

    authError.textContent = '';
    const url = authMode === 'login' ? '/api/login' : '/api/register';

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            authModal.classList.add('hidden');
            if (authMode === 'register') {
                showToast('Регистрация успешна! Теперь вы можете войти.');
                openAuthModal('login');
            } else {
                currentUser = data.user;
                updateAuthUI();
                showToast(`Добро пожаловать, ${currentUser.username}!`);
            }
        } else {
            authError.textContent = data.error || 'Ошибка';
        }
    } catch (err) {
        authError.textContent = 'Ошибка сети';
    }
});

if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    try {
        await fetch('/api/logout', { method: 'POST' });
        currentUser = null;
        updateAuthUI();
        showToast('Вы вышли из аккаунта');
    } catch (e) { }
});

// ── Lobby Events ─────────────────────────────────────────────────
createRoomBtn.addEventListener('click', () => {
    const name = userName.value.trim();
    if (!name) {
        lobbyError.textContent = 'Пожалуйста, введите ваше имя';
        userName.focus();
        return;
    }
    lobbyError.textContent = '';
    myName = name;
    playClick();

    socket.emit('create-room', { name, userId: currentUser?.id }, (res) => {
        if (res.success) {
            currentRoom = res.room;
            updateRoomUI(res.room);
            switchScreen(lobbyScreen, roomScreen);
            addChatMessage('', `${name} создал(а) комнату`, true);
            showToast(`Комната ${res.room.id} создана!`);
            saveSession(res.room.id, name);
            navigateToRoom(res.room.id);
        } else {
            lobbyError.textContent = res.error || 'Ошибка при создании комнаты';
        }
    });
});

joinRoomBtn.addEventListener('click', () => {
    const name = userName.value.trim();
    const code = roomCodeInput.value.trim();
    if (!name) {
        lobbyError.textContent = 'Пожалуйста, введите ваше имя';
        userName.focus();
        return;
    }
    if (!code) {
        lobbyError.textContent = 'Пожалуйста, введите код комнаты';
        roomCodeInput.focus();
        return;
    }
    lobbyError.textContent = '';
    myName = name;
    playClick();

    socket.emit('join-room', { roomId: code, name, userId: currentUser?.id }, (res) => {
        if (res.success) {
            currentRoom = res.room;
            updateRoomUI(res.room);
            switchScreen(lobbyScreen, roomScreen);
            addChatMessage('', `${name} присоединился(ась)`, true);
            showToast(`Вы присоединились к комнате ${res.room.id}`);
            saveSession(res.room.id, name);
            navigateToRoom(res.room.id);
            checkSettingsHash();
        } else {
            lobbyError.textContent = res.error || 'Комната не найдена';
        }
    });
});

// Enter key for room code
roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoomBtn.click();
});
userName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (roomCodeInput.value.trim()) joinRoomBtn.click();
        else createRoomBtn.click();
    }
});

// ── Room Controls ────────────────────────────────────────────────
startPauseBtn.addEventListener('click', () => {
    if (!currentRoom) return;
    playClick();
    if (currentRoom.timerState === 'running') {
        socket.emit('pause-timer');
    } else {
        socket.emit('start-timer');
    }
});

resetBtn.addEventListener('click', () => {
    if (!currentRoom) return;
    playClick();
    socket.emit('reset-timer');
});

skipBtn.addEventListener('click', () => {
    if (!currentRoom) return;
    playClick();
    socket.emit('skip-phase');
});

leaveRoomBtn.addEventListener('click', () => {
    if (inVoice) leaveVoice();
    if (isSharing) stopScreenShare();
    clearSession();
    navigateToLobby();
    location.reload();
});

// Copy room ID
copyRoomIdBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(roomIdDisplay.textContent).then(() => {
        showToast('Код комнаты скопирован!');
    });
});

// ── Settings ─────────────────────────────────────────────────────
settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
    if (currentRoom) {
        history.replaceState({}, '', '/' + currentRoom.id + '#settings');
    }
});
settingsCloseBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
    if (currentRoom) {
        history.replaceState({}, '', '/' + currentRoom.id);
    }
});
settingsPanel.addEventListener('click', (e) => {
    if (e.target === settingsPanel) settingsPanel.classList.add('hidden');
});

saveSettingsBtn.addEventListener('click', () => {
    const settings = {
        workDuration: Math.max(1, Math.min(120, parseInt(settingWork.value) || 25)) * 60,
        breakDuration: Math.max(1, Math.min(30, parseInt(settingBreak.value) || 5)) * 60,
        longBreakDuration: Math.max(1, Math.min(60, parseInt(settingLongBreak.value) || 15)) * 60,
        sessionsBeforeLongBreak: Math.max(1, Math.min(10, parseInt(settingSessions.value) || 4))
    };
    socket.emit('update-settings', settings);
    settingsPanel.classList.add('hidden');
    showToast('Настройки обновлены');
    playClick();
});

// ── Chat ─────────────────────────────────────────────────────────
chatSendBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
});

function sendChat() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    socket.emit('chat-message', msg);
    chatInput.value = '';
}

// ── Socket Events ────────────────────────────────────────────────
socket.on('timer-update', (data) => {
    if (!currentRoom) return;
    currentRoom.timeRemaining = data.timeRemaining;
    currentRoom.timerState = data.timerState;
    currentRoom.phase = data.phase;
    currentRoom.completedSessions = data.completedSessions;
    const total = getTotalTime(data.phase, currentRoom.settings);
    updateTimerDisplay(data.timeRemaining, total, data.phase, data.timerState);
    updateSessionDots(data.completedSessions, currentRoom.settings.sessionsBeforeLongBreak, data.phase);
});

socket.on('timer-started', (room) => {
    currentRoom = room;
    updateRoomUI(room);
    addChatMessage('', 'Таймер запущен ▶', true);
});

socket.on('timer-paused', (room) => {
    currentRoom = room;
    updateRoomUI(room);
    addChatMessage('', 'Таймер на паузе ⏸', true);
});

socket.on('timer-reset', (room) => {
    currentRoom = room;
    updateRoomUI(room);
    addChatMessage('', 'Таймер сброшен 🔄', true);
});

socket.on('phase-complete', (room) => {
    const prevPhase = currentRoom ? currentRoom.phase : 'work';
    currentRoom = room;
    updateRoomUI(room);

    if (room.phase === 'work') {
        // Break just ended → starting work
        playBreakComplete();
        addChatMessage('', 'Перерыв окончен — время фокуса! 🎯', true);
        showToast('Время фокуса! 🎯');
    } else {
        // Work just ended → starting break
        playWorkComplete();
        const breakType = room.phase === 'longBreak' ? 'Длинный перерыв' : 'Перерыв';
        addChatMessage('', `Сессия завершена — ${breakType}! ☕`, true);
        showToast(`${breakType}! ☕`);
    }
});

socket.on('member-joined', (data) => {
    if (!currentRoom) return;
    currentRoom.memberCount = data.memberCount;
    currentRoom.members = data.members;
    memberCount.textContent = data.memberCount;
    updateMembersList(data.members);
    addChatMessage('', `${data.name} присоединился(ась)`, true);
    playJoin();
});

socket.on('member-left', (data) => {
    if (!currentRoom) return;
    currentRoom.memberCount = data.memberCount;
    currentRoom.members = data.members;
    memberCount.textContent = data.memberCount;
    updateMembersList(data.members);
    addChatMessage('', `${data.name} покинул(а) комнату`, true);
    playLeave();
});

socket.on('chat-message', (data) => {
    addChatMessage(data.name, data.message);
});

socket.on('settings-updated', (room) => {
    currentRoom = room;
    updateRoomUI(room);
    addChatMessage('', 'Настройки обновлены ⚙️', true);
});

socket.on('kicked', () => {
    alert('Вы были выгнаны из комнаты администратором.');
    leaveRoomBtn.click();
});

// ── Keyboard Shortcuts ───────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (!currentRoom) return;
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT') return;

    if (e.code === 'Space') {
        e.preventDefault();
        startPauseBtn.click();
    } else if (e.code === 'KeyR') {
        resetBtn.click();
    } else if (e.code === 'KeyS') {
        skipBtn.click();
    } else if (e.code === 'KeyM' && inVoice) {
        voiceMuteBtn.click();
    } else if (e.code === 'KeyD' && inVoice) {
        voiceDeafenBtn.click();
    }
});

// ── Initialize audio context on first interaction ────────────────
document.addEventListener('click', () => ensureAudioCtx(), { once: true });

// ══════════════════════════════════════════════════════════════════
// ══      VOICE CHAT (WebRTC)                                    ══
// ══════════════════════════════════════════════════════════════════

const voiceJoinBtn = $('#voice-join-btn');
const voiceLeaveBtn = $('#voice-leave-btn');
const voiceMuteBtn = $('#voice-mute-btn');
const voiceDeafenBtn = $('#voice-deafen-btn');
const voiceActionBtns = $('#voice-action-btns');
const voiceMembersList = $('#voice-members-list');

// Voice state
let inVoice = false;
let isMuted = false;
let isDeafened = false;
let localStream = null;
const peerConnections = new Map(); // socketId → RTCPeerConnection
const remoteAudios = new Map();   // socketId → HTMLAudioElement
let voiceAnalyserInterval = null;

// ICE servers config
const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ── Voice UI Rendering ───────────────────────────────────────────
function updateVoiceMembersList(voiceMembers) {
    voiceMembersList.innerHTML = '';
    if (!voiceMembers || voiceMembers.length === 0) {
        voiceMembersList.innerHTML = '<li style="color:var(--text-muted);font-size:12px;text-align:center;padding:8px 0;">Никого нет в голосовом канале</li>';
        return;
    }
    voiceMembers.forEach(vm => {
        const li = document.createElement('li');
        li.className = 'voice-member-item';
        li.dataset.socketId = vm.socketId;
        const color = getAvatarColor(vm.name);
        const muteIcon = vm.muted ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .76-.12 1.49-.34 2.18"/></svg>' : '';
        const deafIcon = vm.deafened ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M3 18v-6a9 9 0 0114.3-7.28"/><path d="M21 12.28V18"/></svg>' : '';

        li.innerHTML = `
          <div class="voice-member-avatar" style="background:${color}" id="voice-avatar-${vm.socketId}">${vm.name[0].toUpperCase()}</div>
          <span class="voice-member-name">${escapeHtml(vm.name)}</span>
          <span class="voice-member-icons">${muteIcon}${deafIcon}</span>
        `;
        voiceMembersList.appendChild(li);
    });
}

function updateVoiceButtonState() {
    if (inVoice) {
        voiceJoinBtn.classList.add('hidden');
        voiceLeaveBtn.classList.remove('hidden');
        voiceActionBtns.classList.remove('hidden');
    } else {
        voiceJoinBtn.classList.remove('hidden');
        voiceLeaveBtn.classList.add('hidden');
        voiceActionBtns.classList.add('hidden');
    }

    // Mute button state
    const micOn = voiceMuteBtn.querySelector('.icon-mic-on');
    const micOff = voiceMuteBtn.querySelector('.icon-mic-off');
    if (isMuted) {
        micOn.classList.add('hidden');
        micOff.classList.remove('hidden');
        voiceMuteBtn.classList.add('active');
    } else {
        micOn.classList.remove('hidden');
        micOff.classList.add('hidden');
        voiceMuteBtn.classList.remove('active');
    }

    // Deafen button state
    const hpOn = voiceDeafenBtn.querySelector('.icon-headphones-on');
    const hpOff = voiceDeafenBtn.querySelector('.icon-headphones-off');
    if (isDeafened) {
        hpOn.classList.add('hidden');
        hpOff.classList.remove('hidden');
        voiceDeafenBtn.classList.add('active');
    } else {
        hpOn.classList.remove('hidden');
        hpOff.classList.add('hidden');
        voiceDeafenBtn.classList.remove('active');
    }
}

// ── Voice Activity Detection ──────────────────────────────────────
function startVoiceActivityDetection() {
    if (!localStream || !audioCtx) return;

    const source = audioCtx.createMediaStreamSource(localStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let speaking = false;

    voiceAnalyserInterval = setInterval(() => {
        if (isMuted) {
            if (speaking) {
                speaking = false;
                const avatar = document.getElementById(`voice-avatar-${socket.id}`);
                if (avatar) avatar.classList.remove('speaking');
            }
            return;
        }

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;

        const wasSpeaking = speaking;
        speaking = avg > 15; // threshold

        if (speaking !== wasSpeaking) {
            const avatar = document.getElementById(`voice-avatar-${socket.id}`);
            if (avatar) {
                if (speaking) avatar.classList.add('speaking');
                else avatar.classList.remove('speaking');
            }
        }
    }, 100);
}

function stopVoiceActivityDetection() {
    if (voiceAnalyserInterval) {
        clearInterval(voiceAnalyserInterval);
        voiceAnalyserInterval = null;
    }
}

// ── WebRTC Peer Connection Management ─────────────────────────────
function createPeerConnection(remoteSocketId, isInitiator) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.set(remoteSocketId, pc);

    // Add local tracks to the connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
        let audio = remoteAudios.get(remoteSocketId);
        if (!audio) {
            audio = new Audio();
            audio.autoplay = true;
            remoteAudios.set(remoteSocketId, audio);
        }
        audio.srcObject = event.streams[0];
        audio.muted = isDeafened;

        // Remote voice activity detection
        setupRemoteVoiceDetection(remoteSocketId, event.streams[0]);
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc-ice-candidate', {
                targetSocketId: remoteSocketId,
                candidate: event.candidate
            });
        }
    };

    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            cleanupPeer(remoteSocketId);
        }
    };

    // If initiator, create and send offer
    if (isInitiator) {
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                socket.emit('webrtc-offer', {
                    targetSocketId: remoteSocketId,
                    offer: pc.localDescription
                });
            })
            .catch(err => console.error('Offer error:', err));
    }

    return pc;
}

function setupRemoteVoiceDetection(remoteSocketId, stream) {
    ensureAudioCtx();
    try {
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let speaking = false;

        const interval = setInterval(() => {
            if (!peerConnections.has(remoteSocketId)) {
                clearInterval(interval);
                return;
            }
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;

            const wasSpeaking = speaking;
            speaking = avg > 15;

            if (speaking !== wasSpeaking) {
                const avatar = document.getElementById(`voice-avatar-${remoteSocketId}`);
                if (avatar) {
                    if (speaking) avatar.classList.add('speaking');
                    else avatar.classList.remove('speaking');
                }
            }
        }, 100);
    } catch (e) {
        // Ignore analyser errors for remote streams
    }
}

function cleanupPeer(remoteSocketId) {
    const pc = peerConnections.get(remoteSocketId);
    if (pc) {
        pc.close();
        peerConnections.delete(remoteSocketId);
    }
    const audio = remoteAudios.get(remoteSocketId);
    if (audio) {
        audio.srcObject = null;
        remoteAudios.delete(remoteSocketId);
    }
}

function cleanupAllPeers() {
    peerConnections.forEach((pc, id) => {
        pc.close();
    });
    peerConnections.clear();
    remoteAudios.forEach((audio) => {
        audio.srcObject = null;
    });
    remoteAudios.clear();
}

// ── Join Voice ────────────────────────────────────────────────────
voiceJoinBtn.addEventListener('click', async () => {
    try {
        ensureAudioCtx();
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        inVoice = true;
        isMuted = false;
        isDeafened = false;
        updateVoiceButtonState();

        socket.emit('voice-join');

        startVoiceActivityDetection();

        addChatMessage('', `${myName} подключился(ась) к голосовому каналу 🎙️`, true);
        showToast('Подключено к голосовому каналу');
        playJoin();
    } catch (err) {
        console.error('Mic access error:', err);
        showToast('Не удалось получить доступ к микрофону');
    }
});

// ── Leave Voice ───────────────────────────────────────────────────
voiceLeaveBtn.addEventListener('click', () => {
    leaveVoice();
});

function leaveVoice() {
    if (!inVoice) return;

    stopVoiceActivityDetection();
    cleanupAllPeers();

    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }

    inVoice = false;
    isMuted = false;
    isDeafened = false;
    updateVoiceButtonState();

    socket.emit('voice-leave');
    addChatMessage('', `${myName} отключился(ась) от голосового канала`, true);
    playLeave();
}

// ── Mute/Deafen ──────────────────────────────────────────────────
voiceMuteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    if (localStream) {
        localStream.getAudioTracks().forEach(t => {
            t.enabled = !isMuted;
        });
    }
    socket.emit('voice-toggle-mute', { muted: isMuted });
    updateVoiceButtonState();
    playClick();
});

voiceDeafenBtn.addEventListener('click', () => {
    isDeafened = !isDeafened;
    if (isDeafened) {
        isMuted = true;
        if (localStream) {
            localStream.getAudioTracks().forEach(t => { t.enabled = false; });
        }
    } else {
        isMuted = false;
        if (localStream) {
            localStream.getAudioTracks().forEach(t => { t.enabled = true; });
        }
    }

    // Mute/unmute all remote audio
    remoteAudios.forEach(audio => {
        audio.muted = isDeafened;
    });

    socket.emit('voice-toggle-deafen', { deafened: isDeafened });
    socket.emit('voice-toggle-mute', { muted: isMuted });
    updateVoiceButtonState();
    playClick();
});

// ── WebRTC Signaling Socket Events ───────────────────────────────

// Another user joined the voice channel → create offer to them
socket.on('voice-user-joined', ({ socketId: remoteId, name }) => {
    if (!inVoice) return;
    createPeerConnection(remoteId, true);
});

// Another user left the voice channel → cleanup their peer
socket.on('voice-user-left', ({ socketId: remoteId }) => {
    cleanupPeer(remoteId);
});

// Received an offer → create answer
socket.on('webrtc-offer', async ({ fromSocketId, offer }) => {
    if (!inVoice) return;

    const pc = createPeerConnection(fromSocketId, false);
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', {
            targetSocketId: fromSocketId,
            answer: pc.localDescription
        });
    } catch (err) {
        console.error('Answer error:', err);
    }
});

// Received an answer
socket.on('webrtc-answer', async ({ fromSocketId, answer }) => {
    const pc = peerConnections.get(fromSocketId);
    if (!pc) return;
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error('setRemoteDescription error:', err);
    }
});

// Received an ICE candidate
socket.on('webrtc-ice-candidate', async ({ fromSocketId, candidate }) => {
    const pc = peerConnections.get(fromSocketId);
    if (!pc) return;
    try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        console.error('addIceCandidate error:', err);
    }
});

// Voice state update → re-render voice members list
socket.on('voice-state-update', (data) => {
    updateVoiceMembersList(data.voiceMembers);
    if (currentRoom) {
        currentRoom.voiceMembers = data.voiceMembers;
    }
});

// Initialize voice members on first load
function initVoiceUI() {
    updateVoiceMembersList([]);
    updateVoiceButtonState();
}
initVoiceUI();

// ══════════════════════════════════════════════════════════════════
// ══      SCREEN SHARE                                           ══
// ══════════════════════════════════════════════════════════════════

const screenShareBtn = $('#screen-share-btn');
const screenShareIcon = $('#screen-share-icon');
const screenShareStopIcon = $('#screen-share-stop-icon');
const screenShareViewer = $('#screen-share-viewer');
const screenShareVideo = $('#screen-share-video');
const screenShareName = $('#screen-share-name');
const screenShareClose = $('#screen-share-close');

// Screen share state
let isSharing = false;
let screenStream = null;
const screenPeerConnections = new Map(); // socketId → RTCPeerConnection (for sending screen)
let screenViewerPC = null; // RTCPeerConnection for receiving screen (viewer side)
let currentSharerSocketId = null;

// ── Start/Stop Screen Share Button ───────────────────────────────
screenShareBtn.addEventListener('click', async () => {
    if (isSharing) {
        stopScreenShare();
    } else {
        await startScreenShare();
    }
});

async function startScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: false
        });

        isSharing = true;
        screenShareBtn.classList.add('sharing');
        screenShareIcon.classList.add('hidden');
        screenShareStopIcon.classList.remove('hidden');

        // Auto-stop when user ends share via browser UI
        screenStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };

        // Tell server we're sharing
        socket.emit('screen-share-start');

        addChatMessage('', `${myName} начал(а) демонстрацию экрана 🖥️`, true);
        showToast('Демонстрация экрана запущена');
        playClick();

    } catch (err) {
        console.error('Screen share error:', err);
        if (err.name !== 'NotAllowedError') {
            showToast('Не удалось запустить демонстрацию экрана');
        }
    }
}

function stopScreenShare() {
    if (!isSharing) return;

    // Stop all screen tracks
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
    }

    // Close all screen peer connections
    screenPeerConnections.forEach((pc) => pc.close());
    screenPeerConnections.clear();

    isSharing = false;
    screenShareBtn.classList.remove('sharing');
    screenShareIcon.classList.remove('hidden');
    screenShareStopIcon.classList.add('hidden');

    socket.emit('screen-share-stop');

    addChatMessage('', `${myName} завершил(а) демонстрацию экрана`, true);
    playClick();
}

// ── Create peer connection for sending screen to a viewer ────────
function createScreenSenderPC(viewerSocketId) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    screenPeerConnections.set(viewerSocketId, pc);

    if (screenStream) {
        screenStream.getTracks().forEach(track => {
            pc.addTrack(track, screenStream);
        });
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('screen-ice-candidate', {
                targetSocketId: viewerSocketId,
                candidate: event.candidate
            });
        }
    };

    pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
            socket.emit('screen-offer', {
                targetSocketId: viewerSocketId,
                offer: pc.localDescription
            });
        })
        .catch(err => console.error('Screen offer error:', err));

    return pc;
}

// ── Create peer connection for receiving screen (viewer side) ────
function createScreenViewerPC(sharerSocketId) {
    if (screenViewerPC) {
        screenViewerPC.close();
    }
    const pc = new RTCPeerConnection(RTC_CONFIG);
    screenViewerPC = pc;
    currentSharerSocketId = sharerSocketId;

    pc.ontrack = (event) => {
        screenShareVideo.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('screen-ice-candidate', {
                targetSocketId: sharerSocketId,
                candidate: event.candidate
            });
        }
    };

    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            closeScreenViewer();
        }
    };

    return pc;
}

function showScreenViewer(name) {
    screenShareName.textContent = `${name} — демонстрация экрана`;
    screenShareViewer.classList.remove('hidden');
}

function closeScreenViewer() {
    screenShareViewer.classList.add('hidden');
    screenShareVideo.srcObject = null;
    if (screenViewerPC) {
        screenViewerPC.close();
        screenViewerPC = null;
    }
    currentSharerSocketId = null;
}

screenShareClose.addEventListener('click', () => {
    closeScreenViewer();
});

// ── Screen Share Socket Events ───────────────────────────────────

// Someone started sharing → if it's not us, we request the stream
socket.on('screen-share-started', ({ socketId: sharerId, name }) => {
    if (currentRoom) {
        currentRoom.screenSharer = { socketId: sharerId, name };
        // Members might be an array or map in currentRoom depending on where it's called
        // updateRoomUI sends array. Here we can invoke updateRoomUI to refresh list
        updateRoomUI(currentRoom);
    }
    if (sharerId === socket.id) {
        // We are the sharer, no need to view our own screen
        return;
    }
    showScreenViewer(name);
    // The sharer will send us an offer when they see we joined
    // We need to tell the sharer we want the stream
    socket.emit('screen-offer', {
        targetSocketId: sharerId,
        offer: null // Signal: "please send me an offer"
    });
});

socket.on('screen-share-stopped', ({ socketId: sharerId }) => {
    if (currentRoom) {
        currentRoom.screenSharer = null;
        updateRoomUI(currentRoom);
    }
    if (sharerId === socket.id) return;
    closeScreenViewer();
    addChatMessage('', 'Демонстрация экрана завершена', true);
});

// Sharer receives request / offer
socket.on('screen-offer', async ({ fromSocketId, offer }) => {
    if (isSharing) {
        // We are the sharer — someone wants our screen
        if (!offer) {
            // They just want us to send them an offer
            createScreenSenderPC(fromSocketId);
            return;
        }
        // They sent us an offer (shouldn't normally happen for screen share), ignore
        return;
    }

    // We are a viewer receiving an offer from the sharer
    const pc = createScreenViewerPC(fromSocketId);
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('screen-answer', {
            targetSocketId: fromSocketId,
            answer: pc.localDescription
        });
    } catch (err) {
        console.error('Screen answer error:', err);
    }
});

socket.on('screen-answer', async ({ fromSocketId, answer }) => {
    const pc = screenPeerConnections.get(fromSocketId);
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
            console.error('Screen setRemoteDescription error:', err);
        }
    }
});

socket.on('screen-ice-candidate', async ({ fromSocketId, candidate }) => {
    // Determine which PC this belongs to
    let pc = screenPeerConnections.get(fromSocketId);
    if (!pc && screenViewerPC && currentSharerSocketId === fromSocketId) {
        pc = screenViewerPC;
    }
    if (pc) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error('Screen addIceCandidate error:', err);
        }
    }
});

// When a new member joins and we are sharing, send them the screen
socket.on('member-joined', function screenShareOnJoin(data) {
    // This is an additional handler — the existing one handles members list
    // We don't need to do anything here as the new member will request the stream
});
// ── Auto-Rejoin on Page Load ─────────────────────────────────────
(async function autoRejoin() {
    await fetchUser(); // Always fetch user first

    const urlRoomId = getRoomIdFromURL();
    const saved = getSavedSession();

    // Priority: URL > saved session
    const roomId = urlRoomId || saved?.roomId;
    const name = saved?.name || currentUser?.username;

    if (!roomId) return; // No room to rejoin, stay on lobby

    if (!name) {
        // We have a room ID from URL but no saved name
        // Pre-fill the room code and show lobby
        roomCodeInput.value = roomId;
        return;
    }

    // Try to rejoin
    myName = name;
    userName.value = name;

    // Check if room still exists
    fetch(`/api/room/${roomId}`)
        .then(r => r.json())
        .then(data => {
            if (data.exists) {
                // Room exists, rejoin
                socket.emit('join-room', { roomId, name }, (res) => {
                    if (res.success) {
                        currentRoom = res.room;
                        updateRoomUI(res.room);
                        switchScreen(lobbyScreen, roomScreen);
                        addChatMessage('', `${name} вернулся(ась) в комнату`, true);
                        saveSession(res.room.id, name);
                        if (window.location.pathname !== '/' + res.room.id) {
                            navigateToRoom(res.room.id);
                        }
                        checkSettingsHash();
                    } else {
                        // Room found by API but join failed
                        clearSession();
                        navigateToLobby();
                    }
                });
            } else {
                // Room no longer exists
                clearSession();
                if (urlRoomId) {
                    lobbyError.textContent = 'Комната больше не существует';
                    navigateToLobby();
                }
            }
        })
        .catch(() => {
            // Network error, just show lobby
            clearSession();
        });
})();

// Handle browser back/forward
window.addEventListener('popstate', () => {
    const roomId = getRoomIdFromURL();
    if (!roomId && currentRoom) {
        // Navigated back to lobby
        clearSession();
        location.reload();
    }
});

// ── Cleanup (don't clear session on refresh!) ────────────────────
window.addEventListener('beforeunload', () => {
    // Don't clear session — this allows rejoin on refresh
    // Session is only cleared on explicit "Leave Room"
});

