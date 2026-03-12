#!/usr/bin/env python3
"""
LiveTrack Rally — Serveur local autonome
Démarre un serveur HTTP + WebSocket sur localhost:3000
Gère les positions reçues et les diffuse à tous les clients connectés
"""
import asyncio
import json
import os
import sys
import threading
import time
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# ─── WebSocket simple (sans dépendance externe) ──────────────────────────────
import socket
import hashlib
import base64
import struct
import sqlite3

DB_FILE = str(Path(__file__).parent / "livetiming.db")

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS known_gpx
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, data TEXT)''')
    conn.commit()
    conn.close()

init_db()

state = {
    "participants": {},  # type: dict
    "ws_clients": set(), # type: set
    "gpx_points": [],    # type: list
}
state_lock = threading.Lock()

# ─── Mini WebSocket Server ────────────────────────────────────────────────────
WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

def ws_handshake(conn, key):
    accept = base64.b64encode(
        hashlib.sha1((key + WS_MAGIC).encode()).digest()
    ).decode()
    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n"
        "\r\n"
    )
    conn.sendall(response.encode())

def ws_decode(data):
    if len(data) < 2:
        return None
    b1, b2 = data[0], data[1]
    opcode = b1 & 0x0F
    masked = (b2 & 0x80) != 0
    length = b2 & 0x7F
    idx = 2
    if length == 126:
        length = struct.unpack(">H", data[idx:idx+2])[0]; idx += 2
    elif length == 127:
        length = struct.unpack(">Q", data[idx:idx+8])[0]; idx += 8
    mask = data[idx:idx+4] if masked else None
    idx += 4 if masked else 0
    payload = bytearray(data[idx:idx+length])
    if masked and mask:
        for i in range(len(payload)):
            payload[i] ^= mask[i % 4]
    return opcode, bytes(payload)

def ws_encode(message):
    payload = message.encode('utf-8')
    length = len(payload)
    header = bytearray()
    header.append(0x81)  # FIN + text frame
    if length <= 125:
        header.append(length)
    elif length <= 65535:
        header.append(126)
        header += struct.pack(">H", length)
    else:
        header.append(127)
        header += struct.pack(">Q", length)
    return bytes(header) + payload

def broadcast(msg):
    data = ws_encode(json.dumps(msg))
    dead = set()
    with state_lock:
        clients = list(state["ws_clients"])
    for conn in clients:
        try:
            conn.sendall(data)
        except:
            dead.add(conn)
    with state_lock:
        clients = state.get("ws_clients")
        if isinstance(clients, set):
            state["ws_clients"] = clients - dead
        elif isinstance(clients, list):
            state["ws_clients"] = [c for c in clients if c not in dead]

def handle_ws_client(conn):
    with state_lock:
        clients = state.get("ws_clients")
        print(f"[WS] Client connecté ({conn.getpeername() if hasattr(conn, 'getpeername') else 'inconnu'})")
        if isinstance(clients, set):
            clients.add(conn)
        elif isinstance(clients, list):
            if conn not in clients:
                clients.append(conn)
        # Send current state
        participants = state.get("participants")
        parts_list = []
        if isinstance(participants, dict):
            parts_list = list(participants.values())
        initial = {
            "type": "init",
            "participants": parts_list
        }
    try:
        conn.sendall(ws_encode(json.dumps(initial)))
        buf = b""
        conn.settimeout(60)
        while True:
            chunk = conn.recv(4096)
            if not chunk:
                break
            buf += chunk
            result = ws_decode(buf)
            if result:
                opcode, payload = result
                buf = b""
                if opcode == 8:  # close
                    break
                if opcode == 1:  # text
                    try:
                        msg = json.loads(payload.decode())
                        handle_ws_message(msg)
                    except:
                        pass
    except:
        pass
    finally:
        with state_lock:
            clients = state["ws_clients"]
            if isinstance(clients, set):
                clients.discard(conn)
            elif isinstance(clients, list):
                if conn in clients:
                    clients.remove(conn)
        conn.close()

def handle_ws_message(msg):
    """Handle position update messages from clients or Telegram relay"""
    t = msg.get("type")
    print(f"[WS] [{os.getpid()}] Message type: {t}")
    if t == "position":
        p = msg.get("participant", {})
        pid = p.get("id")
        if pid:
            now_ms = int(time.time() * 1000)
            with state_lock:
                participants = state["participants"]
                if not isinstance(participants, dict):
                    participants = {}
                    state["participants"] = participants
                
                existing = participants.get(pid, {})
                # Detect movement
                moved = (existing.get("lat") != p.get("lat") or
                         existing.get("lng") != p.get("lng"))
                p["connectedAt"] = existing.get("connectedAt", now_ms)
                participants[pid] = {**existing, **p}
                print(f"[WS] Participant mis à jour : {pid}. Total : {len(state['participants'])}")
            broadcast({"type": "position", "participant": participants[pid]})
    elif t == "add_participant":
        p = msg.get("participant", {})
        pid = p.get("id")
        if pid:
            now = int(time.time() * 1000)
            p["connectedAt"] = now
            p["lastMoved"] = now
            with state_lock:
                participants = state["participants"]
                if not isinstance(participants, dict):
                    participants = {}
                    state["participants"] = participants
                participants[pid] = p
            broadcast({"type": "participant_added", "participant": p})
    elif t == "remove_participant":
        pid = msg.get("id")
        if pid:
            with state_lock:
                participants = state.get("participants")
                if isinstance(participants, dict):
                    participants.pop(pid, None)
            broadcast({"type": "participant_removed", "id": pid})

# ─── HTTP Server ──────────────────────────────────────────────────────────────
class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).parent), **kwargs)

    def log_message(self, format, *args):
        pass  # Silencieux

    def do_GET(self):
        print(f"[HTTP] GET {self.path}")
        # WebSocket upgrade
        if self.headers.get("Upgrade", "").lower() == "websocket":
            print(f"[WS] Tentative upgrade pour {self.path}")
            key = self.headers.get("Sec-WebSocket-Key", "")
            ws_handshake(self.connection, key)
            handle_ws_client(self.connection)
            return
        # REST API
        if self.path == "/api/participants":
            print(f"[API] [{os.getpid()}] GET /api/participants")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with state_lock:
                participants = state.get("participants")
                data = []
                if isinstance(participants, dict):
                    data = list(participants.values())
            self.wfile.write(json.dumps(data).encode())
            return
        if self.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with state_lock:
                resp = {
                    "participants": len(state["participants"]),
                    "ws_clients": len(state["ws_clients"])
                }
            self.wfile.write(json.dumps(resp).encode())
            return
        if self.path == "/api/token":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            token = os.environ.get("TELEGRAM_TOKEN", "").strip()
            if not token:
                token_file = Path(__file__).parent / "telegram_token.txt"
                if token_file.exists():
                    token = token_file.read_text().strip()
            
            import re
            match = re.search(r"([0-9]+:[a-zA-Z0-9_-]+)", token)
            clean_token = match.group(1) if match else ""
            
            self.wfile.write(json.dumps({"token": clean_token}).encode())
            return
        if self.path == '/api/gpx':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute('SELECT id, name FROM known_gpx')
            gpx_list = [{'id': r[0], 'name': r[1]} for r in c.fetchall()]
            conn.close()
            self.wfile.write(json.dumps(gpx_list).encode())
            return
        if self.path.startswith('/api/gpx/'):
            try:
                gpx_id = int(self.path.split('/')[-1])
                conn = sqlite3.connect(DB_FILE)
                c = conn.cursor()
                c.execute('SELECT name, data FROM known_gpx WHERE id=?', (gpx_id,))
                row = c.fetchone()
                conn.close()
                if row:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({'id': gpx_id, 'name': row[0], 'data': row[1]}).encode())
                else:
                    self.send_response(404); self.end_headers()
            except ValueError:
                self.send_response(400); self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/position":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                msg = json.loads(body)
                handle_ws_message({"type": "position", "participant": msg})
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(str(e).encode())
            return
        if self.path == '/api/gpx':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                msg = json.loads(body)
                name = msg.get('name')
                data = msg.get('data')
                if name and data:
                    conn = sqlite3.connect(DB_FILE)
                    c = conn.cursor()
                    c.execute('INSERT INTO known_gpx (name, data) VALUES (?, ?)', (name, data))
                    new_id = c.lastrowid
                    conn.commit()
                    conn.close()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({'id': new_id, 'name': name}).encode())
                else:
                    self.send_response(400); self.end_headers()
            except Exception as e:
                self.send_response(400); self.end_headers()
                self.wfile.write(str(e).encode())
            return
    def do_DELETE(self):
        if self.path.startswith('/api/gpx/'):
            try:
                gpx_id = int(self.path.split('/')[-1])
                conn = sqlite3.connect(DB_FILE)
                c = conn.cursor()
                c.execute('DELETE FROM known_gpx WHERE id=?', (gpx_id,))
                conn.commit()
                conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
            except Exception as e:
                self.send_response(400); self.end_headers()
                self.wfile.write(str(e).encode())
            return
        if self.path.startswith('/api/participants/'):
            try:
                pid = self.path.split('/')[-1]
                with state_lock:
                    ps = state['participants']
                    # Use a safe way to remove from dict
                    if isinstance(ps, dict) and pid in ps:
                        ps.pop(pid, None)
                        data_to_send = list(ps.values())
                        broadcast({'type': 'init', 'participants': data_to_send})
                        self.send_response(200); self.send_header('Access-Control-Allow-Origin', '*'); self.end_headers()
                        self.wfile.write(b'{"ok":true}')
                    else:
                        self.send_response(404); self.end_headers()
            except Exception as e:
                self.send_response(400); self.send_header('Access-Control-Allow-Origin', '*'); self.end_headers(); self.wfile.write(str(e).encode())
            return
        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

# ─── Telegram Polling (optionnel) ─────────────────────────────────────────────
def telegram_polling(token):
    """Poll Telegram for Live Location updates without external libraries"""
    import urllib.request
    import urllib.parse

    offset = 0
    api = f"https://api.telegram.org/bot{token}"

    print(f"[Telegram] Bot actif — partage 'Live Location' avec votre bot")

    def get_tg_avatar(i):
        return ["🏍️", "🏍️", "🚗", "🚙", "🚐"][i % 5]
    def get_tg_color(i):
        return ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"][i % 5]
    known_users = {} # type: dict
    
    last_poll_log = time.time()

    while True:
        try:
            params = {
                "offset": offset,
                "timeout": 25,
                "allowed_updates": json.dumps(["message", "edited_message"])
            }
            url = f"{api}/getUpdates?{urllib.parse.urlencode(params)}"
            # print(f"[Telegram] Polling {url}") # Omit token for security
            with urllib.request.urlopen(url, timeout=30) as resp:
                raw_data = resp.read()
                data = json.loads(raw_data)
                if data.get("result"):
                    print(f"[Telegram] Raw response (partial): {raw_data[:200]}")
                
                if time.time() - last_poll_log > 60:
                    print(f"[Telegram] [{os.getpid()}] Polling... (dernier offset: {offset})")
                    last_poll_log = time.time()
                # print(f"[Telegram] Raw response: {raw_data[:100]}")

            if not data.get("ok"):
                print(f"[Telegram] Erreur API : {data.get('description', 'Inconnue')}")
                time.sleep(5)
                continue

            for update in data.get("result", []):
                offset = update["update_id"] + 1
                msg = update.get("message") or update.get("edited_message")
                if not msg:
                    print(f"[Telegram] Update {update['update_id']} sans message/edited_message")
                    continue
                
                print(f"[Telegram] Update {update['update_id']} reçu (type: {'message' if update.get('message') else 'edited_message'})")
                loc = msg.get("location")
                if not loc:
                    # Log if it's a text message or something else
                    txt = msg.get("text", "non-text")
                    print(f"[Telegram] Message sans location : {txt}")
                    continue
                user = msg.get("from", {})
                uid = str(user.get("id", "unknown"))
                first = user.get("first_name", "Pilote")
                last  = user.get("last_name", "")
                name  = f"{first} {last}".strip()

                if uid not in known_users:
                    idx = len(known_users) 
                    known_users[uid] = idx
                idx = known_users.get(uid, 0)

                participant = {
                    "id": f"tg_{uid}",
                    "name": name,
                    "lat": loc["latitude"],
                    "lng": loc["longitude"],
                    "color": get_tg_color(idx),
                    "avatar": get_tg_avatar(idx),
                    "source": "telegram"
                }
                print(f"[Telegram] Position : {name} ({uid}) -> {loc['latitude']}, {loc['longitude']}")
                handle_ws_message({"type": "position", "participant": participant})

        except Exception as e:
            print(f"[Telegram] Erreur polling : {e}")
            time.sleep(5)

# ─── Main ─────────────────────────────────────────────────────────────────────
PORT = 3000

def main():
    print("=" * 55)
    print("  🏁  LiveTrack Rally — Serveur local")
    print("=" * 55)

    # Start HTTP server (threaded to allow multiple WS clients)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), AppHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f"  ✅  Serveur démarré sur http://127.0.0.1:{PORT}")

    # Check for Telegram token
    token = os.environ.get("TELEGRAM_TOKEN", "").strip()
    if not token:
        # Try to read from token.txt
        token_file = Path(__file__).parent / "telegram_token.txt"
        if token_file.exists():
            token = token_file.read_text().strip()
            
    import re
    match = re.search(r"([0-9]+:[a-zA-Z0-9_-]+)", token)
    token = match.group(1) if match else ""

    if token:
        tg = threading.Thread(target=telegram_polling, args=(token,), daemon=True)
        tg.start()
        print("  ✅  Bot Telegram actif")
    else:
        print("  ℹ️   Bot Telegram non configuré (optionnel)")
        print("       → Créez telegram_token.txt avec votre token")

    # Open browser
    print(f"\n  🌐  Ouverture dans le navigateur...")
    time.sleep(1)
    webbrowser.open(f"http://127.0.0.1:{PORT}")

    print("\n  ⚠️   NE PAS FERMER CETTE FENÊTRE pendant l'utilisation")
    print("  Press Ctrl+C pour arrêter\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n  Arrêt du serveur. Au revoir !")
        server.shutdown()

if __name__ == "__main__":
    main()
