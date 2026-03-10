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
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

# ─── WebSocket simple (sans dépendance externe) ──────────────────────────────
import socket
import hashlib
import base64
import struct

# État partagé
state = {
    "participants": {},          # id → {id, name, lat, lng, color, avatar, ts, lastMoved}
    "ws_clients": set(),
    "gpx_points": [],
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
    if masked:
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
        state["ws_clients"] -= dead

def handle_ws_client(conn):
    with state_lock:
        state["ws_clients"].add(conn)
        # Send current state
        initial = {
            "type": "init",
            "participants": list(state["participants"].values())
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
            state["ws_clients"].discard(conn)
        conn.close()

def handle_ws_message(msg):
    """Handle position update messages from clients or Telegram relay"""
    t = msg.get("type")
    if t == "position":
        p = msg.get("participant", {})
        pid = p.get("id")
        if pid:
            now = int(time.time() * 1000)
            with state_lock:
                existing = state["participants"].get(pid, {})
                # Detect movement
                moved = (existing.get("lat") != p.get("lat") or
                         existing.get("lng") != p.get("lng"))
                p["ts"] = now
                p["lastMoved"] = now if moved else existing.get("lastMoved", now)
                p["connectedAt"] = existing.get("connectedAt", now)
                state["participants"][pid] = {**existing, **p}
            broadcast({"type": "position", "participant": state["participants"][pid]})
    elif t == "add_participant":
        p = msg.get("participant", {})
        pid = p.get("id")
        if pid:
            now = int(time.time() * 1000)
            p["connectedAt"] = now
            p["lastMoved"] = now
            with state_lock:
                state["participants"][pid] = p
            broadcast({"type": "participant_added", "participant": p})
    elif t == "remove_participant":
        pid = msg.get("id")
        if pid:
            with state_lock:
                state["participants"].pop(pid, None)
            broadcast({"type": "participant_removed", "id": pid})

# ─── HTTP Server ──────────────────────────────────────────────────────────────
class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).parent), **kwargs)

    def log_message(self, fmt, *args):
        pass  # Silencieux

    def do_GET(self):
        # WebSocket upgrade
        if self.headers.get("Upgrade", "").lower() == "websocket":
            key = self.headers.get("Sec-WebSocket-Key", "")
            ws_handshake(self.connection, key)
            handle_ws_client(self.connection)
            return
        # REST API
        if self.path == "/api/participants":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with state_lock:
                data = list(state["participants"].values())
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
        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
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

    AVATARS = ["🏍️", "🏍️", "🚗", "🚙", "🚐"]
    COLORS  = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"]
    known_users = {}  # user_id → idx

    while True:
        try:
            url = f"{api}/getUpdates?offset={offset}&timeout=25&allowed_updates=[\"message\",\"edited_message\"]"
            with urllib.request.urlopen(url, timeout=30) as resp:
                data = json.loads(resp.read())

            if not data.get("ok"):
                time.sleep(5)
                continue

            for update in data.get("result", []):
                offset = update["update_id"] + 1
                msg = update.get("message") or update.get("edited_message")
                if not msg:
                    continue
                loc = msg.get("location")
                if not loc:
                    continue
                user = msg.get("from", {})
                uid = str(user.get("id", "unknown"))
                first = user.get("first_name", "Pilote")
                last  = user.get("last_name", "")
                name  = f"{first} {last}".strip()

                if uid not in known_users:
                    idx = len(known_users) % len(COLORS)
                    known_users[uid] = idx
                idx = known_users[uid]

                participant = {
                    "id": f"tg_{uid}",
                    "name": name,
                    "lat": loc["latitude"],
                    "lng": loc["longitude"],
                    "color": COLORS[idx],
                    "avatar": AVATARS[idx],
                    "source": "telegram"
                }
                handle_ws_message({"type": "position", "participant": participant})

        except Exception as e:
            time.sleep(5)

# ─── Main ─────────────────────────────────────────────────────────────────────
PORT = 3000

def main():
    print("=" * 55)
    print("  🏁  LiveTrack Rally — Serveur local")
    print("=" * 55)

    # Start HTTP server
    server = HTTPServer(("127.0.0.1", PORT), AppHandler)
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
