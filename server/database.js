const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

// Используем путь в папке /app/data/ если запущены в Docker/K8s
const isProduction = process.env.NODE_ENV === 'production';
const dbPath = isProduction 
    ? path.join('/app', 'data', 'focusflow.db') 
    : path.join(__dirname, '..', 'focusflow.db');

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
    `);
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

module.exports = {
    createUser,
    verifyUser,
    getUserById,
    addFocusTime
};
