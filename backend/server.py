"""
============================================================================
Virtual Chemical Storage Room - Master HTTP REST API & Database Server
Built using Python Standard Library (http.server & sqlite3)
Supports full IPv4/IPv6 localhost binding on Windows with zero dropouts.
============================================================================
"""
import os
import sys
import json
import sqlite3
import datetime
import csv
import io
import secrets
from http.server import HTTPServer, SimpleHTTPRequestHandler
from database import get_db, init_db, hash_password, check_password

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
init_db()

class ChemStorageAPIHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def _send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        url = self.path.split('?')[0]

        # REST API Routes
        if url == '/api/sensors':
            conn = get_db()
            rows = conn.execute('SELECT * FROM sensors').fetchall()
            conn.close()
            return this_or_json(self, [dict(r) for r in rows])

        elif url == '/api/thresholds':
            conn = get_db()
            row = conn.execute('SELECT * FROM thresholds WHERE id = 1').fetchone()
            conn.close()
            return this_or_json(self, dict(row) if row else {})

        elif url == '/api/telemetry':
            conn = get_db()
            rows = conn.execute('SELECT * FROM telemetry ORDER BY id DESC LIMIT 100').fetchall()
            conn.close()
            return this_or_json(self, [dict(r) for r in rows])

        elif url == '/api/incidents':
            conn = get_db()
            rows = conn.execute('SELECT * FROM incidents ORDER BY id DESC LIMIT 10').fetchall()
            conn.close()
            return this_or_json(self, [dict(r) for r in rows])

        elif url == '/api/occupancy':
            conn = get_db()
            row = conn.execute('SELECT * FROM occupancy WHERE id = 1').fetchone()
            conn.close()
            return this_or_json(self, dict(row) if row else {})

        elif url == '/api/auth/users':
            conn = get_db()
            rows = conn.execute('SELECT id, username, role, full_name, badge_id FROM users').fetchall()
            conn.close()
            return this_or_json(self, [dict(r) for r in rows])

        elif url == '/api/export/csv':
            conn = get_db()
            telemetry_rows = conn.execute('SELECT * FROM telemetry ORDER BY id ASC').fetchall()
            threshold = conn.execute('SELECT * FROM thresholds WHERE id = 1').fetchone()
            conn.close()

            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                'Timestamp', 'Sensor_ID', 'Temperature', 'Rate_degC_per_min',
                'Status', 'Min_Threshold', 'Max_Threshold',
                'Door_State', 'Window_State', 'Cooling_State', 'Vent_State'
            ])

            min_safe = threshold['min_safe'] if threshold else 18.0
            max_safe = threshold['max_safe'] if threshold else 25.0

            for r in telemetry_rows:
                writer.writerow([
                    r['timestamp'], r['sensor_id'], r['temperature'], r['rate'],
                    r['status'], min_safe, max_safe,
                    r['door_state'], r['window_state'], r['cooling_state'], r['vent_state']
                ])

            csv_bytes = output.getvalue().encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv')
            self.send_header('Content-Disposition', f'attachment; filename=ChemStorage_Backend_Telemetry_{datetime.date.today()}.csv')
            self.send_header('Content-Length', str(len(csv_bytes)))
            self.end_headers()
            self.wfile.write(csv_bytes)
            return

        # Default static file serving from frontend/
        super().do_GET()

    def do_POST(self):
        url = self.path.split('?')[0]
        content_length = int(self.headers.get('Content-Length', 0))
        body_data = {}
        if content_length > 0:
            raw_body = self.rfile.read(content_length).decode('utf-8')
            try:
                body_data = json.loads(raw_body)
            except Exception:
                pass

        now_str = datetime.datetime.now().strftime("%H:%M:%S")

        # Authentication Routes
        if url == '/api/auth/login':
            username = body_data.get('username', '').strip()
            password = body_data.get('password', '')
            if not username or not password:
                return this_or_json(self, {'status': 'error', 'message': 'Username and password are required'}, status=400)
            
            conn = get_db()
            user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
            if not user or not check_password(password, user['password_hash']):
                conn.close()
                return this_or_json(self, {'status': 'error', 'message': 'Invalid username or password'}, status=401)
            
            token = secrets.token_hex(20)
            conn.execute('INSERT INTO events (type, timestamp, message) VALUES (?, ?, ?)',
                         ('AUTH_LOGIN', now_str, f"User {user['full_name']} ({user['role']} - {user['badge_id']}) logged in"))
            conn.commit()
            conn.close()
            
            user_data = {
                'id': user['id'],
                'username': user['username'],
                'role': user['role'],
                'full_name': user['full_name'],
                'badge_id': user['badge_id']
            }
            return this_or_json(self, {'status': 'success', 'token': token, 'user': user_data})

        elif url == '/api/auth/register':
            username = body_data.get('username', '').strip()
            password = body_data.get('password', '')
            role = body_data.get('role', 'Plant Operator').strip()
            full_name = body_data.get('full_name', username).strip()
            badge_id = body_data.get('badge_id', 'OPS-' + secrets.token_hex(2).upper()).strip()
            
            if not username or not password:
                return this_or_json(self, {'status': 'error', 'message': 'Username and password are required'}, status=400)
            if len(password) < 4:
                return this_or_json(self, {'status': 'error', 'message': 'Password must be at least 4 characters'}, status=400)
                
            conn = get_db()
            existing = conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
            if existing:
                conn.close()
                return this_or_json(self, {'status': 'error', 'message': f'Username "{username}" is already registered'}, status=409)
            
            pwd_hash = hash_password(password)
            created_at = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO users (username, password_hash, role, full_name, badge_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (username, pwd_hash, role, full_name, badge_id, created_at))
            new_id = cursor.lastrowid
            
            conn.execute('INSERT INTO events (type, timestamp, message) VALUES (?, ?, ?)',
                         ('AUTH_REGISTER', now_str, f"New operator registered: {full_name} ({role})"))
            conn.commit()
            conn.close()
            
            token = secrets.token_hex(20)
            user_data = {
                'id': new_id,
                'username': username,
                'role': role,
                'full_name': full_name,
                'badge_id': badge_id
            }
            return this_or_json(self, {'status': 'success', 'token': token, 'user': user_data}, status=201)

        elif url == '/api/auth/logout':
            username = body_data.get('username', 'Anonymous')
            conn = get_db()
            conn.execute('INSERT INTO events (type, timestamp, message) VALUES (?, ?, ?)',
                         ('AUTH_LOGOUT', now_str, f"User {username} logged out"))
            conn.commit()
            conn.close()
            return this_or_json(self, {'status': 'success'})

        elif url == '/api/telemetry':
            telemetry_list = body_data.get('readings', [])
            door_state = body_data.get('door_state', 'CLOSED')
            window_state = body_data.get('window_state', 'CLOSED')
            cooling_state = body_data.get('cooling_state', 'RUNNING')
            vent_state = body_data.get('vent_state', 'ON')

            conn = get_db()
            for r in telemetry_list:
                conn.execute('''
                    INSERT INTO telemetry (sensor_id, timestamp, temperature, rate, status, door_state, window_state, cooling_state, vent_state)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (r.get('sensor_id'), now_str, float(r.get('temperature', 25.0)), float(r.get('rate', 0.0)),
                      r.get('status', 'normal'), door_state, window_state, cooling_state, vent_state))
                conn.execute('UPDATE sensors SET status = ? WHERE id = ?', (r.get('status', 'normal'), r.get('sensor_id')))
            conn.commit()
            conn.close()
            return this_or_json(self, {'status': 'success', 'count': len(telemetry_list)})

        elif url.startswith('/api/events/'):
            event_type = url.replace('/api/events/', '')
            message = body_data.get('message', f"Event {event_type} triggered")
            conn = get_db()
            conn.execute('INSERT INTO events (type, timestamp, message) VALUES (?, ?, ?)', (event_type, now_str, message))
            conn.commit()
            conn.close()
            return this_or_json(self, {'status': 'success', 'event_type': event_type})

        elif url == '/api/incidents/trigger':
            incident_type = body_data.get('type', 'CRITICAL_TEMPERATURE')
            severity = body_data.get('severity', 'CRITICAL')
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO incidents (incident_type, severity, started_at, response_status, acknowledged_by)
                VALUES (?, ?, ?, 'ACTIVE', 'Unacknowledged')
            ''', (incident_type, severity, now_str))
            incident_id = cursor.lastrowid
            conn.execute('INSERT INTO alerts (severity, message, timestamp) VALUES (?, ?, ?)',
                         (severity, f"🔴 CRITICAL INCIDENT #{incident_id}: {incident_type} triggered", now_str))
            conn.commit()
            conn.close()
            return this_or_json(self, {'status': 'success', 'incident_id': incident_id})

        elif url.startswith('/api/incidents/') and url.endswith('/action'):
            parts = url.split('/')
            incident_id = int(parts[3])
            action = body_data.get('action')
            conn = get_db()
            if action == 'evacuate':
                conn.execute('UPDATE incidents SET evacuation_alarm = 1 WHERE id = ?', (incident_id,))
            elif action == 'restrict':
                conn.execute('UPDATE incidents SET access_restricted = 1 WHERE id = ?', (incident_id,))
            elif action == 'reset':
                conn.execute('UPDATE incidents SET response_status = "CLOSED", ended_at = ? WHERE id = ?', (now_str, incident_id))
            conn.commit()
            conn.close()
            return this_or_json(self, {'status': 'success', 'action': action})

        elif url == '/api/occupancy':
            occupied = 1 if body_data.get('occupied') else 0
            count = int(body_data.get('count', 1 if occupied else 0))
            conn = get_db()
            conn.execute('UPDATE occupancy SET occupied = ?, count = ?, last_updated = ? WHERE id = 1', (occupied, count, now_str))
            conn.commit()
            conn.close()
            return this_or_json(self, {'status': 'success', 'occupied': occupied})

        return this_or_json(self, {'error': 'Not found'}, status=404)

    def do_PUT(self):
        url = self.path.split('?')[0]
        content_length = int(self.headers.get('Content-Length', 0))
        body_data = {}
        if content_length > 0:
            raw_body = self.rfile.read(content_length).decode('utf-8')
            try:
                body_data = json.loads(raw_body)
            except Exception:
                pass

        if url == '/api/thresholds':
            min_safe = float(body_data.get('min_safe', 18.0))
            max_safe = float(body_data.get('max_safe', 25.0))
            critical_high = float(body_data.get('critical_high', 30.0))
            critical_low = float(body_data.get('critical_low', 15.0))
            conn = get_db()
            conn.execute('''
                UPDATE thresholds 
                SET min_safe = ?, max_safe = ?, critical_high = ?, critical_low = ?
                WHERE id = 1
            ''', (min_safe, max_safe, critical_high, critical_low))
            conn.commit()
            conn.close()
            return this_or_json(self, {'status': 'success', 'min_safe': min_safe, 'max_safe': max_safe})

        elif url.startswith('/api/sensors/') and url.endswith('/fault'):
            sensor_id = url.split('/')[3]
            health = body_data.get('health', 'ONLINE')
            conn = get_db()
            conn.execute('UPDATE sensors SET health = ? WHERE id = ?', (health, sensor_id))
            conn.commit()
            conn.close()
            return this_or_json(self, {'status': 'success', 'sensor_id': sensor_id, 'health': health})

        return this_or_json(self, {'error': 'Not found'}, status=404)

def this_or_json(handler, data, status=200):
    handler._send_json(data, status)

def run_server(port=8000):
    server_address = ('', port)
    httpd = HTTPServer(server_address, ChemStorageAPIHandler)
    print(f"=========================================================================")
    print(f"Standard Python Master REST & Database Server running on http://localhost:{port}/")
    print(f"=========================================================================")
    httpd.serve_forever()

if __name__ == '__main__':
    run_server(8000)
