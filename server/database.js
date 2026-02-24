const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'focusflow.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            total_focus_time INTEGER DEFAULT 0,
            pomodoros_completed INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, async (err) => {
        if (!err) {
            // Seed admin user
            const admin = await dbAsync.get('SELECT * FROM users WHERE username = ?', ['admin']);
            if (!admin) {
                const hash = await bcrypt.hash('4254', 10);
                await dbAsync.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['admin', hash]);
                console.log('✅ Admin user created (admin:4254)');
            }
        }
    });
});

// Helper functions wrapper (Promises)
const dbAsync = {
    get: (sql, params = []) => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    }),
    run: (sql, params = []) => new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            err ? reject(err) : resolve(this);
        });
    }),
    all: (sql, params = []) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    })
};

async function createUser(username, password) {
    const hash = await bcrypt.hash(password, 10);
    try {
        await dbAsync.run(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, hash]
        );
        return { success: true };
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return { success: false, error: 'Пользователь с таким именем уже существует' };
        }
        return { success: false, error: 'Ошибка сервера' };
    }
}

async function verifyUser(username, password) {
    const user = await dbAsync.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return { success: false, error: 'Неверное имя пользователя или пароль' };

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return { success: false, error: 'Неверное имя пользователя или пароль' };

    return { success: true, user: { id: user.id, username: user.username, total_focus_time: user.total_focus_time, pomodoros_completed: user.pomodoros_completed } };
}

async function getUserById(id) {
    const user = await dbAsync.get('SELECT id, username, total_focus_time, pomodoros_completed FROM users WHERE id = ?', [id]);
    return user;
}

async function addFocusTime(userId, minutes) {
    await dbAsync.run(
        'UPDATE users SET total_focus_time = total_focus_time + ?, pomodoros_completed = pomodoros_completed + 1 WHERE id = ?',
        [minutes, userId]
    );
}

async function getAllUsers() {
    return await dbAsync.all('SELECT id, username, total_focus_time, pomodoros_completed, created_at FROM users ORDER BY created_at DESC');
}

async function getTotalStats() {
    return await dbAsync.get('SELECT COUNT(*) as totalUsers, SUM(total_focus_time) as totalFocusTime, SUM(pomodoros_completed) as totalPomodoros FROM users');
}

module.exports = {
    createUser,
    verifyUser,
    getUserById,
    addFocusTime,
    getAllUsers,
    getTotalStats
};
