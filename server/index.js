const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'focusflow-super-secret-key';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API: check if room exists (for auto-rejoin)
app.get('/api/room/:roomId', (req, res) => {
    const room = rooms.get(req.params.roomId.toUpperCase());
    if (room) {
        res.json({ exists: true, memberCount: room.members.size });
    } else {
        res.json({ exists: false });
    }
});

// Middleware for auth verification
function authenticateToken(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Необходима авторизация' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Токен недействителен' });
        req.user = user;
        next();
    });
}

// Auth API
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || username.length < 3 || password.length < 3) {
        return res.status(400).json({ success: false, error: 'Слишком короткое имя или пароль (мин. 3 символа)' });
    }
    const result = await db.createUser(username, password);
    res.json(result);
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const result = await db.verifyUser(username, password);
    if (result.success) {
        const token = jwt.sign({ id: result.user.id, username: result.user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.json({ success: true, user: result.user });
    } else {
        res.status(401).json(result);
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

app.get('/api/me', authenticateToken, async (req, res) => {
    const user = await db.getUserById(req.user.id);
    if (user) {
        res.json({ success: true, user });
    } else {
        res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }
});

// SPA: serve index.html for all non-file routes (/:roomId, etc.)
app.get('/:roomId', (req, res, next) => {
    if (req.params.roomId.includes('.')) return next();
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Room & Timer State ──────────────────────────────────────────────
const rooms = new Map();

const DEFAULTS = {
    workDuration: 25 * 60,   // 25 min
    breakDuration: 5 * 60,   // 5 min
    longBreakDuration: 15 * 60, // 15 min
    sessionsBeforeLongBreak: 4
};

function createRoom(roomId, settings = {}) {
    return {
        id: roomId,
        members: new Map(),          // socketId → { name, joinedAt }
        voiceMembers: new Map(),     // socketId → { name, muted, deafened }
        screenSharer: null,          // socketId of current screen sharer (only 1)
        timerState: 'idle',          // idle | running | paused
        phase: 'work',               // work | break | longBreak
        timeRemaining: settings.workDuration || DEFAULTS.workDuration,
        completedSessions: 0,
        settings: {
            workDuration: settings.workDuration || DEFAULTS.workDuration,
            breakDuration: settings.breakDuration || DEFAULTS.breakDuration,
            longBreakDuration: settings.longBreakDuration || DEFAULTS.longBreakDuration,
            sessionsBeforeLongBreak: settings.sessionsBeforeLongBreak || DEFAULTS.sessionsBeforeLongBreak
        },
        intervalId: null,
        createdAt: Date.now()
    };
}

function getRoomPayload(room) {
    const sharerMember = room.screenSharer ? room.members.get(room.screenSharer) : null;
    return {
        id: room.id,
        members: Array.from(room.members.entries()).map(([id, m]) => ({ socketId: id, ...m })),
        memberCount: room.members.size,
        timerState: room.timerState,
        phase: room.phase,
        timeRemaining: room.timeRemaining,
        completedSessions: room.completedSessions,
        settings: room.settings,
        voiceMembers: Array.from(room.voiceMembers.entries()).map(([id, m]) => ({ socketId: id, ...m })),
        screenSharer: room.screenSharer ? { socketId: room.screenSharer, name: sharerMember?.name || 'Unknown' } : null
    };
}

function tick(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.timerState !== 'running') return;

    room.timeRemaining--;

    if (room.timeRemaining <= 0) {
        clearInterval(room.intervalId);
        room.intervalId = null;
        room.timerState = 'idle';

        if (room.phase === 'work') {
            room.completedSessions++;

            // Save focus time to DB for authenticated users
            const focusMinutes = Math.round(room.settings.workDuration / 60);
            Array.from(room.members.values()).forEach(m => {
                if (m.userId) {
                    db.addFocusTime(m.userId, focusMinutes).catch(err => console.error('DB Error:', err));
                }
            });

            // Decide next break type
            if (room.completedSessions % room.settings.sessionsBeforeLongBreak === 0) {
                room.phase = 'longBreak';
                room.timeRemaining = room.settings.longBreakDuration;
            } else {
                room.phase = 'break';
                room.timeRemaining = room.settings.breakDuration;
            }
        } else {
            // After any break → go to work
            room.phase = 'work';
            room.timeRemaining = room.settings.workDuration;
        }

        io.to(roomId).emit('phase-complete', getRoomPayload(room));
    }

    io.to(roomId).emit('timer-update', {
        timeRemaining: room.timeRemaining,
        timerState: room.timerState,
        phase: room.phase,
        completedSessions: room.completedSessions
    });
}

// ── Socket.io Events ────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`⚡ Connected: ${socket.id}`);
    let currentRoom = null;

    // Create a new room
    socket.on('create-room', ({ name, userId, settings }, callback) => {
        const roomId = uuidv4().slice(0, 8).toUpperCase();
        const room = createRoom(roomId, settings);
        room.members.set(socket.id, { name, userId, joinedAt: Date.now() });
        rooms.set(roomId, room);
        socket.join(roomId);
        currentRoom = roomId;
        console.log(`🏠 Room created: ${roomId} by ${name}`);
        callback({ success: true, room: getRoomPayload(room) });
    });

    // Join an existing room
    socket.on('join-room', ({ roomId, name, userId }, callback) => {
        const id = roomId.toUpperCase();
        const room = rooms.get(id);
        if (!room) {
            return callback({ success: false, error: 'Комната не найдена' });
        }
        room.members.set(socket.id, { name, userId, joinedAt: Date.now() });
        socket.join(id);
        currentRoom = id;
        console.log(`👋 ${name} joined room ${id}`);

        // Notify existing members
        socket.to(id).emit('member-joined', {
            name,
            memberCount: room.members.size,
            members: Array.from(room.members.entries()).map(([sid, m]) => ({ socketId: sid, ...m })),
            voiceMembers: Array.from(room.voiceMembers.entries()).map(([sid, m]) => ({ socketId: sid, ...m }))
        });

        callback({ success: true, room: getRoomPayload(room) });
    });

    // Start the timer
    socket.on('start-timer', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room || room.timerState === 'running') return;

        room.timerState = 'running';
        room.intervalId = setInterval(() => tick(currentRoom), 1000);

        io.to(currentRoom).emit('timer-started', getRoomPayload(room));
        console.log(`▶️  Timer started in room ${currentRoom}`);
    });

    // Pause the timer
    socket.on('pause-timer', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room || room.timerState !== 'running') return;

        room.timerState = 'paused';
        clearInterval(room.intervalId);
        room.intervalId = null;

        io.to(currentRoom).emit('timer-paused', getRoomPayload(room));
        console.log(`⏸️  Timer paused in room ${currentRoom}`);
    });

    // Reset the timer
    socket.on('reset-timer', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;

        clearInterval(room.intervalId);
        room.intervalId = null;
        room.timerState = 'idle';
        room.phase = 'work';
        room.timeRemaining = room.settings.workDuration;
        room.completedSessions = 0;

        io.to(currentRoom).emit('timer-reset', getRoomPayload(room));
        console.log(`🔄 Timer reset in room ${currentRoom}`);
    });

    // Skip to next phase
    socket.on('skip-phase', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;

        clearInterval(room.intervalId);
        room.intervalId = null;
        room.timerState = 'idle';

        if (room.phase === 'work') {
            room.completedSessions++;
            if (room.completedSessions % room.settings.sessionsBeforeLongBreak === 0) {
                room.phase = 'longBreak';
                room.timeRemaining = room.settings.longBreakDuration;
            } else {
                room.phase = 'break';
                room.timeRemaining = room.settings.breakDuration;
            }
        } else {
            room.phase = 'work';
            room.timeRemaining = room.settings.workDuration;
        }

        io.to(currentRoom).emit('phase-complete', getRoomPayload(room));
        console.log(`⏭️  Phase skipped in room ${currentRoom}`);
    });

    // Update settings
    socket.on('update-settings', (settings) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room || room.timerState === 'running') return;

        room.settings = { ...room.settings, ...settings };
        // Reset time if idle
        if (room.timerState === 'idle') {
            if (room.phase === 'work') room.timeRemaining = room.settings.workDuration;
            else if (room.phase === 'break') room.timeRemaining = room.settings.breakDuration;
            else room.timeRemaining = room.settings.longBreakDuration;
        }

        io.to(currentRoom).emit('settings-updated', getRoomPayload(room));
    });

    // Send chat message
    socket.on('chat-message', (message) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;
        const member = room.members.get(socket.id);
        if (!member) return;

        io.to(currentRoom).emit('chat-message', {
            name: member.name,
            message,
            timestamp: Date.now()
        });
    });

    // ── Voice Chat (WebRTC Signaling) ──────────────────────────────────

    // Join voice channel
    socket.on('voice-join', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;
        const member = room.members.get(socket.id);
        if (!member) return;

        room.voiceMembers.set(socket.id, { name: member.name, muted: false, deafened: false });
        console.log(`🎙️  ${member.name} joined voice in room ${currentRoom}`);

        // Tell everyone about updated voice members
        io.to(currentRoom).emit('voice-state-update', {
            voiceMembers: Array.from(room.voiceMembers.entries()).map(([id, m]) => ({ socketId: id, ...m }))
        });

        // Tell existing voice users to connect to the new peer
        socket.to(currentRoom).emit('voice-user-joined', {
            socketId: socket.id,
            name: member.name
        });
    });

    // Leave voice channel
    socket.on('voice-leave', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;

        const member = room.voiceMembers.get(socket.id);
        room.voiceMembers.delete(socket.id);
        console.log(`🔇 ${member?.name || 'Unknown'} left voice in room ${currentRoom}`);

        io.to(currentRoom).emit('voice-state-update', {
            voiceMembers: Array.from(room.voiceMembers.entries()).map(([id, m]) => ({ socketId: id, ...m }))
        });

        socket.to(currentRoom).emit('voice-user-left', {
            socketId: socket.id
        });
    });

    // Toggle mute/deafen
    socket.on('voice-toggle-mute', ({ muted }) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;
        const vm = room.voiceMembers.get(socket.id);
        if (!vm) return;
        vm.muted = muted;

        io.to(currentRoom).emit('voice-state-update', {
            voiceMembers: Array.from(room.voiceMembers.entries()).map(([id, m]) => ({ socketId: id, ...m }))
        });
    });

    socket.on('voice-toggle-deafen', ({ deafened }) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;
        const vm = room.voiceMembers.get(socket.id);
        if (!vm) return;
        vm.deafened = deafened;
        if (deafened) vm.muted = true; // deafen implies mute

        io.to(currentRoom).emit('voice-state-update', {
            voiceMembers: Array.from(room.voiceMembers.entries()).map(([id, m]) => ({ socketId: id, ...m }))
        });
    });

    // WebRTC signaling: relay offer
    socket.on('webrtc-offer', ({ targetSocketId, offer }) => {
        io.to(targetSocketId).emit('webrtc-offer', {
            fromSocketId: socket.id,
            offer
        });
    });

    // WebRTC signaling: relay answer
    socket.on('webrtc-answer', ({ targetSocketId, answer }) => {
        io.to(targetSocketId).emit('webrtc-answer', {
            fromSocketId: socket.id,
            answer
        });
    });

    // WebRTC signaling: relay ICE candidate
    socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
        io.to(targetSocketId).emit('webrtc-ice-candidate', {
            fromSocketId: socket.id,
            candidate
        });
    });

    // ── Screen Share Signaling ────────────────────────────────────────

    socket.on('screen-share-start', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;
        if (room.screenSharer && room.screenSharer !== socket.id) {
            return; // Someone else is already sharing
        }
        const member = room.members.get(socket.id);
        room.screenSharer = socket.id;
        console.log(`🖥️  ${member?.name} started screen share in room ${currentRoom}`);

        io.to(currentRoom).emit('screen-share-started', {
            socketId: socket.id,
            name: member?.name || 'Unknown'
        });
    });

    socket.on('screen-share-stop', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;
        if (room.screenSharer !== socket.id) return;

        const member = room.members.get(socket.id);
        room.screenSharer = null;
        console.log(`🖥️  ${member?.name} stopped screen share in room ${currentRoom}`);

        io.to(currentRoom).emit('screen-share-stopped', {
            socketId: socket.id
        });
    });

    // Screen share WebRTC signaling (separate from voice)
    socket.on('screen-offer', ({ targetSocketId, offer }) => {
        io.to(targetSocketId).emit('screen-offer', {
            fromSocketId: socket.id,
            offer
        });
    });

    socket.on('screen-answer', ({ targetSocketId, answer }) => {
        io.to(targetSocketId).emit('screen-answer', {
            fromSocketId: socket.id,
            answer
        });
    });

    socket.on('screen-ice-candidate', ({ targetSocketId, candidate }) => {
        io.to(targetSocketId).emit('screen-ice-candidate', {
            fromSocketId: socket.id,
            candidate
        });
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`🔌 Disconnected: ${socket.id}`);
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;

        const member = room.members.get(socket.id);
        const wasInVoice = room.voiceMembers.has(socket.id);
        const wasSharing = room.screenSharer === socket.id;
        room.members.delete(socket.id);
        room.voiceMembers.delete(socket.id);
        if (wasSharing) room.screenSharer = null;

        if (room.members.size === 0) {
            clearInterval(room.intervalId);
            rooms.delete(currentRoom);
            console.log(`🗑️  Room ${currentRoom} deleted (empty)`);
        } else {
            socket.to(currentRoom).emit('member-left', {
                name: member?.name || 'Unknown',
                memberCount: room.members.size,
                members: Array.from(room.members.entries()).map(([sid, m]) => ({ socketId: sid, ...m }))
            });

            if (wasInVoice) {
                socket.to(currentRoom).emit('voice-user-left', { socketId: socket.id });
                io.to(currentRoom).emit('voice-state-update', {
                    voiceMembers: Array.from(room.voiceMembers.entries()).map(([id, m]) => ({ socketId: id, ...m }))
                });
            }

            if (wasSharing) {
                io.to(currentRoom).emit('screen-share-stopped', { socketId: socket.id });
            }
        }
    });
});

// ── Start Server ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 FocusFlow server running on http://localhost:${PORT}\n`);
});
