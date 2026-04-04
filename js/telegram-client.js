/**
 * Telegram Client - Polling direct depuis le navigateur
 * Remplace la logique polling de server.py pour le mode autonome
 */
'use strict';

class TelegramClient {
    constructor(token, onPositionUpdate) {
        this.token = token;
        this.onPositionUpdate = onPositionUpdate;
        this.offset = 0;
        this.api = `https://api.telegram.org/bot${token}`;
        this.isRunning = false;
        this.knownUsers = new Map();
        this.pollInterval = null;
    }

    getAvatar(i) {
        return ["🏍️", "🏍️", "🚗", "🚙", "🚐"][i % 5];
    }

    getColor(i) {
        return ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"][i % 5];
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("[Telegram] Démarrage du polling client...");
        
        // Nettoyage webhook par sécurité
        try {
            await fetch(`${this.api}/deleteWebhook`);
        } catch (e) {
            console.warn("[Telegram] Erreur deleteWebhook:", e);
        }

        this.poll();
    }

    stop() {
        this.isRunning = false;
        if (this.pollInterval) clearTimeout(this.pollInterval);
    }

    async poll() {
        if (!this.isRunning) return;

        try {
            const params = new URLSearchParams({
                offset: this.offset,
                timeout: 30
            });

            const response = await fetch(`${this.api}/getUpdates?${params.toString()}`);
            const data = await response.json();

            if (data.ok && data.result) {
                if (data.result.length > 0) {
                     console.log(`[Telegram] Polling OK, ${data.result.length} messages reçus. offset=${this.offset}`);
                }
                for (const update of data.result) {
                    this.offset = update.update_id + 1;
                    const msg = update.message || update.edited_message;
                    
                    if (msg && msg.location) {
                        const user = msg.from || {};
                        const uid = user.id.toString();
                        const first = user.first_name || "Pilote";
                        const last = user.last_name || "";
                        const name = `${first} ${last}`.trim();

                        if (!this.knownUsers.has(uid)) {
                            this.knownUsers.set(uid, this.knownUsers.size);
                        }
                        const idx = this.knownUsers.get(uid);

                        const participant = {
                            id: `tg_${uid}`,
                            name: name,
                            lat: msg.location.latitude,
                            lng: msg.location.longitude,
                            color: this.getColor(idx),
                            avatar: this.getAvatar(idx),
                            source: "telegram",
                            lastUpdate: Date.now()
                        };

                        console.log(`[Telegram] Position reçue: ${name}`, participant.lat, participant.lng);
                        if(typeof window.showToast === 'function' && !this.knownUsers.has(uid+"_notified")) {
                            window.showToast(`Nouvelle position reçue depuis Telegram : ${name}`, 'success');
                            this.knownUsers.set(uid+"_notified", true);
                        }
                        this.onPositionUpdate(participant);
                    }
                }
            }
        } catch (e) {
            console.error("[Telegram] Erreur polling:", e);
        }

        // Prochain poll
        if (this.isRunning) {
            this.pollInterval = setTimeout(() => this.poll(), 1000);
        }
    }
}

window.TelegramClient = TelegramClient;
