-- MyDTU Slot Monitor Database Schema
-- Cloudflare D1 (SQLite)

-- ============================================
-- Table: users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT,
    password_hash TEXT NOT NULL,
    email_verified INTEGER DEFAULT 0,
    telegram_chat_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_chat_id);

-- ============================================
-- Table: watch_items
-- ============================================
CREATE TABLE IF NOT EXISTS watch_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    class_url TEXT NOT NULL,
    class_id TEXT,
    semester_id TEXT,
    timespan TEXT,
    class_name TEXT,
    class_code TEXT,
    registration_code TEXT,
    schedule TEXT,
    is_active INTEGER DEFAULT 1,
    notify_telegram INTEGER DEFAULT 1,
    notify_email INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_watch_items_user ON watch_items(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_items_active ON watch_items(is_active);

-- ============================================
-- Table: watch_state
-- ============================================
CREATE TABLE IF NOT EXISTS watch_state (
    watch_item_id INTEGER PRIMARY KEY,
    last_remaining INTEGER DEFAULT 0,
    last_checked_at TEXT,
    last_event_type TEXT,
    last_event_at TEXT,
    last_error TEXT,
    consecutive_errors INTEGER DEFAULT 0,
    FOREIGN KEY (watch_item_id) REFERENCES watch_items(id) ON DELETE CASCADE
);

-- ============================================
-- Table: notification_log
-- ============================================
CREATE TABLE IF NOT EXISTS notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    watch_item_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    channel TEXT NOT NULL,
    remaining INTEGER NOT NULL,
    sent_at TEXT DEFAULT (datetime('now')),
    status TEXT NOT NULL,
    error_message TEXT,
    FOREIGN KEY (watch_item_id) REFERENCES watch_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_log_watch ON notification_log(watch_item_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent ON notification_log(sent_at);

-- ============================================
-- Table: telegram_link_codes
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_link_codes (
    code TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_codes_user ON telegram_link_codes(user_id);

-- ============================================
-- Table: sessions (for JWT refresh tokens)
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ============================================
-- Table: email_verification_codes
-- ============================================
CREATE TABLE IF NOT EXISTS email_verification_codes (
    code TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_codes_user ON email_verification_codes(user_id);
