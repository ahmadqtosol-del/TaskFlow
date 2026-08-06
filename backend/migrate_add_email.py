import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "tasks.db")

def add_email_column():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if email column exists
    cursor.execute("PRAGMA table_info(users)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'email' not in columns:
        try:
            # First, add the column without UNIQUE constraint
            cursor.execute('ALTER TABLE users ADD COLUMN email TEXT')
            print('✅ Email column added successfully!')
            
            # Update existing users with default emails
            cursor.execute("UPDATE users SET email = LOWER(REPLACE(name, ' ', '.')) || '@example.com' WHERE email IS NULL")
            print('✅ Updated existing users with default emails')
            
            # Now make it UNIQUE (SQLite requires this to be done carefully)
            # Since SQLite doesn't support ALTER TABLE ADD UNIQUE directly,
            # we'll create a new table and copy data
            print('ℹ️ Creating new table with UNIQUE constraint...')
            
            # Create new table with UNIQUE constraint
            cursor.execute('''
                CREATE TABLE users_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    initials TEXT NOT NULL,
                    color TEXT DEFAULT '#6366F1',
                    department TEXT,
                    emoji TEXT,
                    email TEXT UNIQUE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Copy data from old table to new table
            cursor.execute('''
                INSERT INTO users_new (id, name, initials, color, department, emoji, email, created_at)
                SELECT id, name, initials, color, department, emoji, email, created_at FROM users
            ''')
            
            # Drop old table
            cursor.execute('DROP TABLE users')
            
            # Rename new table to users
            cursor.execute('ALTER TABLE users_new RENAME TO users')
            
            print('✅ UNIQUE constraint added successfully!')
            
        except sqlite3.OperationalError as e:
            print(f'❌ Error: {e}')
    else:
        print('ℹ️ Email column already exists')
    
    conn.commit()
    conn.close()
    print('✅ Database migration complete!')

if __name__ == "__main__":
    add_email_column()