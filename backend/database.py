"""
============================================================================
Virtual Chemical Storage Room - Dual Database Engine (MySQL XAMPP & SQLite)
Primary: MySQL Database (XAMPP on localhost:3306)
Fallback: Embedded SQLite (chem_storage.db)
Features:
- Auto-detects and connects to MySQL on XAMPP (127.0.0.1:3306)
- Auto-creates `chem_storage` database if missing
- Universal parameter binding (`?` translated to `%s` on MySQL)
- Row wrapper supporting both key indexing `row['col']` and index `row[0]`
- Safe fallback to SQLite if MySQL is offline
============================================================================
"""
import os
import sys
import time
import datetime
import hashlib
import sqlite3

# Try importing PyMySQL for XAMPP MySQL connectivity
try:
    import pymysql
    import pymysql.cursors
    HAS_PYMYSQL = True
except ImportError:
    HAS_PYMYSQL = False

# MySQL Configuration for XAMPP
MYSQL_CONFIG = {
    'host': os.environ.get('MYSQL_HOST', '127.0.0.1'),
    'port': int(os.environ.get('MYSQL_PORT', 3306)),
    'user': os.environ.get('MYSQL_USER', 'root'),
    'password': os.environ.get('MYSQL_PASSWORD', ''),
    'database': os.environ.get('MYSQL_DATABASE', 'chem_storage'),
    'charset': 'utf8mb4',
    'connect_timeout': 3
}

SQLITE_PATH = os.path.join(os.path.dirname(__file__), 'chem_storage.db')

CURRENT_ENGINE = 'UNKNOWN'

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def check_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed


# ============================================================================
# MySQL DB-API 2.0 Compatibility Wrappers
# ============================================================================

class MySQLRow(dict):
    """Provides dictionary and integer index access like sqlite3.Row"""
    def __init__(self, dict_data):
        super().__init__(dict_data)
        self._keys = list(dict_data.keys())
        self._values = list(dict_data.values())

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)

    def keys(self):
        return self._keys


class MySQLCursorWrapper:
    def __init__(self, raw_cursor):
        self._cur = raw_cursor

    def execute(self, query, params=None):
        # Translate '?' placeholder to MySQL '%s'
        if params is not None:
            mysql_query = query.replace('?', '%s')
            return self._cur.execute(mysql_query, params)
        return self._cur.execute(query)

    def executemany(self, query, seq_of_params):
        mysql_query = query.replace('?', '%s')
        return self._cur.executemany(mysql_query, seq_of_params)

    def fetchone(self):
        row = self._cur.fetchone()
        return MySQLRow(row) if row else None

    def fetchall(self):
        rows = self._cur.fetchall()
        return [MySQLRow(r) for r in rows]

    @property
    def lastrowid(self):
        return self._cur.lastrowid

    def close(self):
        self._cur.close()


class MySQLConnectionWrapper:
    def __init__(self, raw_conn):
        self._conn = raw_conn

    def cursor(self):
        return MySQLCursorWrapper(self._conn.cursor(pymysql.cursors.DictCursor))

    def execute(self, query, params=None):
        cur = self.cursor()
        cur.execute(query, params)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


# ============================================================================
# Database Connection Factory
# ============================================================================

def test_mysql_available():
    if not HAS_PYMYSQL:
        return False
    try:
        conn = pymysql.connect(
            host=MYSQL_CONFIG['host'],
            port=MYSQL_CONFIG['port'],
            user=MYSQL_CONFIG['user'],
            password=MYSQL_CONFIG['password'],
            connect_timeout=MYSQL_CONFIG['connect_timeout']
        )
        conn.close()
        return True
    except Exception:
        return False


def get_db():
    global CURRENT_ENGINE
    if HAS_PYMYSQL:
        try:
            raw_conn = pymysql.connect(
                host=MYSQL_CONFIG['host'],
                port=MYSQL_CONFIG['port'],
                user=MYSQL_CONFIG['user'],
                password=MYSQL_CONFIG['password'],
                database=MYSQL_CONFIG['database'],
                charset=MYSQL_CONFIG['charset'],
                connect_timeout=MYSQL_CONFIG['connect_timeout'],
                autocommit=False
            )
            CURRENT_ENGINE = 'MYSQL'
            return MySQLConnectionWrapper(raw_conn)
        except Exception:
            pass

    # Fallback to SQLite
    CURRENT_ENGINE = 'SQLITE'
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_db_info():
    global CURRENT_ENGINE
    return {
        'engine': 'MySQL (XAMPP)' if CURRENT_ENGINE == 'MYSQL' else 'SQLite (Embedded)',
        'active_driver': 'pymysql' if CURRENT_ENGINE == 'MYSQL' else 'sqlite3',
        'host': MYSQL_CONFIG['host'] if CURRENT_ENGINE == 'MYSQL' else 'localhost',
        'port': MYSQL_CONFIG['port'] if CURRENT_ENGINE == 'MYSQL' else 'N/A',
        'database': MYSQL_CONFIG['database'] if CURRENT_ENGINE == 'MYSQL' else SQLITE_PATH,
        'status': 'CONNECTED'
    }


# ============================================================================
# Schema Initialization & Seeding
# ============================================================================

def init_db():
    global CURRENT_ENGINE

    # Check if MySQL is available and prepare database
    if HAS_PYMYSQL and test_mysql_available():
        print(f"[DB] Initializing MySQL database '{MYSQL_CONFIG['database']}' on XAMPP ({MYSQL_CONFIG['host']}:{MYSQL_CONFIG['port']})...")
        try:
            # 1. Create database if it doesn't exist
            server_conn = pymysql.connect(
                host=MYSQL_CONFIG['host'],
                port=MYSQL_CONFIG['port'],
                user=MYSQL_CONFIG['user'],
                password=MYSQL_CONFIG['password'],
                connect_timeout=MYSQL_CONFIG['connect_timeout']
            )
            with server_conn.cursor() as cur:
                cur.execute(f"CREATE DATABASE IF NOT EXISTS `{MYSQL_CONFIG['database']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            server_conn.close()

            # 2. Connect to chem_storage database and create tables
            conn = get_db()
            cursor = conn.cursor()

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sensors (
                    id VARCHAR(32) PRIMARY KEY,
                    name VARCHAR(128),
                    zone VARCHAR(64),
                    location VARCHAR(128),
                    status VARCHAR(32) DEFAULT 'normal',
                    health VARCHAR(32) DEFAULT 'ONLINE'
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS telemetry (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    sensor_id VARCHAR(32),
                    timestamp VARCHAR(32),
                    temperature DOUBLE,
                    rate DOUBLE,
                    status VARCHAR(32),
                    door_state VARCHAR(32),
                    window_state VARCHAR(32),
                    cooling_state VARCHAR(32),
                    vent_state VARCHAR(32)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS thresholds (
                    id INT PRIMARY KEY DEFAULT 1,
                    min_safe DOUBLE DEFAULT 18.0,
                    max_safe DOUBLE DEFAULT 25.0,
                    critical_high DOUBLE DEFAULT 30.0,
                    critical_low DOUBLE DEFAULT 15.0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS events (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    type VARCHAR(64),
                    timestamp VARCHAR(32),
                    duration INT DEFAULT 0,
                    status VARCHAR(32),
                    message TEXT
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS alerts (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    severity VARCHAR(32),
                    sensor_id VARCHAR(32),
                    message TEXT,
                    timestamp VARCHAR(32),
                    acknowledged INT DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS incidents (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    incident_type VARCHAR(64),
                    severity VARCHAR(32),
                    started_at VARCHAR(32),
                    ended_at VARCHAR(32),
                    response_status VARCHAR(32) DEFAULT 'ACTIVE',
                    acknowledged_by VARCHAR(64) DEFAULT 'Unacknowledged',
                    evacuation_alarm INT DEFAULT 0,
                    access_restricted INT DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS occupancy (
                    id INT PRIMARY KEY DEFAULT 1,
                    occupied INT DEFAULT 0,
                    count INT DEFAULT 0,
                    last_updated VARCHAR(64)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(64) UNIQUE NOT NULL,
                    password_hash VARCHAR(256) NOT NULL,
                    role VARCHAR(64) NOT NULL DEFAULT 'Operator',
                    full_name VARCHAR(128),
                    badge_id VARCHAR(64),
                    created_at VARCHAR(64)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')

            # Seed Default Thresholds
            cursor.execute('SELECT COUNT(*) FROM thresholds')
            if cursor.fetchone()[0] == 0:
                cursor.execute('INSERT INTO thresholds (id, min_safe, max_safe, critical_high, critical_low) VALUES (1, 18.0, 25.0, 30.0, 15.0)')

            # Seed Default Occupancy
            cursor.execute('SELECT COUNT(*) FROM occupancy')
            if cursor.fetchone()[0] == 0:
                cursor.execute('INSERT INTO occupancy (id, occupied, count, last_updated) VALUES (1, 0, 0, %s)', (datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),))

            # Seed Default Sensors
            cursor.execute('SELECT COUNT(*) FROM sensors')
            if cursor.fetchone()[0] == 0:
                default_sensors = [
                    ('S1', 'Entrance Sensor',  'Zone A', 'Near Main Door', 'normal', 'ONLINE'),
                    ('S2', 'Central Sensor',   'Zone B', 'Centre of Room', 'normal', 'ONLINE'),
                    ('S3', 'HVAC Chiller',     'Zone C', 'Near Cooling Unit', 'normal', 'ONLINE'),
                    ('S4', 'Rack Sensor',      'Zone A', 'Near Storage Rack', 'normal', 'ONLINE'),
                    ('S5', 'Window Sensor',    'Zone B', 'Near Window 1', 'normal', 'ONLINE'),
                    ('S6', 'Vent Sensor',      'Zone C', 'Near Vent Unit', 'normal', 'ONLINE'),
                    ('S7', 'Rear Sensor',      'Zone D', 'Rear Storage Bay', 'normal', 'ONLINE')
                ]
                cursor.executemany('INSERT INTO sensors (id, name, zone, location, status, health) VALUES (?, ?, ?, ?, ?, ?)', default_sensors)

            # Seed Default Users
            cursor.execute('SELECT COUNT(*) FROM users')
            if cursor.fetchone()[0] == 0:
                now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                default_users = [
                    ('admin', hash_password('admin123'), 'Safety Officer', 'Dr. Sarah Mitchell', 'SEC-001', now_str),
                    ('operator', hash_password('operator123'), 'Plant Operator', 'John Davis', 'OPS-104', now_str),
                    ('auditor', hash_password('auditor123'), 'Safety Auditor', 'Elen Vance', 'AUD-088', now_str)
                ]
                cursor.executemany('INSERT INTO users (username, password_hash, role, full_name, badge_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', default_users)

            conn.commit()
            conn.close()
            CURRENT_ENGINE = 'MYSQL'
            print(f"[DB] SUCCESS: MySQL database 'chem_storage' (XAMPP) initialized with 8 tables!")
            return
        except Exception as e:
            print(f"[DB] WARNING: Failed to initialize MySQL ({e}), falling back to SQLite...")

    # Fallback initialization in SQLite
    CURRENT_ENGINE = 'SQLITE'
    print(f"[DB] Initializing embedded SQLite database at {SQLITE_PATH}...")
    conn = sqlite3.connect(SQLITE_PATH)
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sensors (
            id TEXT PRIMARY KEY,
            name TEXT,
            zone TEXT,
            location TEXT,
            status TEXT DEFAULT 'normal',
            health TEXT DEFAULT 'ONLINE'
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_id TEXT,
            timestamp TEXT,
            temperature REAL,
            rate REAL,
            status TEXT,
            door_state TEXT,
            window_state TEXT,
            cooling_state TEXT,
            vent_state TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS thresholds (
            id INTEGER PRIMARY KEY DEFAULT 1,
            min_safe REAL DEFAULT 18.0,
            max_safe REAL DEFAULT 25.0,
            critical_high REAL DEFAULT 30.0,
            critical_low REAL DEFAULT 15.0
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            timestamp TEXT,
            duration INTEGER DEFAULT 0,
            status TEXT,
            message TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            severity TEXT,
            sensor_id TEXT,
            message TEXT,
            timestamp TEXT,
            acknowledged INTEGER DEFAULT 0
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_type TEXT,
            severity TEXT,
            started_at TEXT,
            ended_at TEXT,
            response_status TEXT DEFAULT 'ACTIVE',
            acknowledged_by TEXT DEFAULT 'Unacknowledged',
            evacuation_alarm INTEGER DEFAULT 0,
            access_restricted INTEGER DEFAULT 0
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS occupancy (
            id INTEGER PRIMARY KEY DEFAULT 1,
            occupied INTEGER DEFAULT 0,
            count INTEGER DEFAULT 0,
            last_updated TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Operator',
            full_name TEXT,
            badge_id TEXT,
            created_at TEXT
        )
    ''')

    cursor.execute('SELECT COUNT(*) FROM thresholds')
    if cursor.fetchone()[0] == 0:
        cursor.execute('INSERT INTO thresholds (id, min_safe, max_safe, critical_high, critical_low) VALUES (1, 18.0, 25.0, 30.0, 15.0)')

    cursor.execute('SELECT COUNT(*) FROM occupancy')
    if cursor.fetchone()[0] == 0:
        cursor.execute('INSERT INTO occupancy (id, occupied, count, last_updated) VALUES (1, 0, 0, datetime("now"))')

    cursor.execute('SELECT COUNT(*) FROM sensors')
    if cursor.fetchone()[0] == 0:
        default_sensors = [
            ('S1', 'Entrance Sensor',  'Zone A', 'Near Main Door', 'normal', 'ONLINE'),
            ('S2', 'Central Sensor',   'Zone B', 'Centre of Room', 'normal', 'ONLINE'),
            ('S3', 'HVAC Chiller',     'Zone C', 'Near Cooling Unit', 'normal', 'ONLINE'),
            ('S4', 'Rack Sensor',      'Zone A', 'Near Storage Rack', 'normal', 'ONLINE'),
            ('S5', 'Window Sensor',    'Zone B', 'Near Window 1', 'normal', 'ONLINE'),
            ('S6', 'Vent Sensor',      'Zone C', 'Near Vent Unit', 'normal', 'ONLINE'),
            ('S7', 'Rear Sensor',      'Zone D', 'Rear Storage Bay', 'normal', 'ONLINE')
        ]
        cursor.executemany('INSERT INTO sensors (id, name, zone, location, status, health) VALUES (?, ?, ?, ?, ?, ?)', default_sensors)

    cursor.execute('SELECT COUNT(*) FROM users')
    if cursor.fetchone()[0] == 0:
        now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        default_users = [
            ('admin', hash_password('admin123'), 'Safety Officer', 'Dr. Sarah Mitchell', 'SEC-001', now_str),
            ('operator', hash_password('operator123'), 'Plant Operator', 'John Davis', 'OPS-104', now_str),
            ('auditor', hash_password('auditor123'), 'Safety Auditor', 'Elen Vance', 'AUD-088', now_str)
        ]
        cursor.executemany('INSERT INTO users (username, password_hash, role, full_name, badge_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', default_users)

    conn.commit()
    conn.close()
    print("[DB] SQLite database initialized successfully.")

if __name__ == '__main__':
    init_db()
    info = get_db_info()
    print(f"Active Database: {info['engine']} -> {info['database']} (Status: {info['status']})")
