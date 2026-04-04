/**
 * LiveTrack V2 - Onboarding Wizard & UI Navigation
 */
'use strict';

window.Wizard = {
    currentStep: 1,
    totalSteps: 3,

    init() {
        console.log('[Wizard] Initializing v2...');
        this.setupEventListeners();
        this.checkConfiguration();
        this.setupTabs();
    },

    setupEventListeners() {
        // Navigation
        document.getElementById('btn-wiz-next').addEventListener('click', () => this.nextStep());
        document.getElementById('btn-wiz-prev').addEventListener('click', () => this.prevStep());
        document.getElementById('btn-wiz-test').addEventListener('click', () => this.testConnection());
    },

    setupTabs() {
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;
                this.switchTab(target);
            });
        });
    },

    switchTab(tabId) {
        // Buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Content
        document.querySelectorAll('.tab-content').forEach(tc => {
            tc.classList.remove('active');
        });
        const target = document.getElementById(tabId);
        if (target) target.classList.add('active');

        // Toggle Right Panel (Map vs Dashboard)
        const mapContainer = document.getElementById('map-container');
        const dashContainer = document.getElementById('dashboard-container');
        if (mapContainer && dashContainer) {
            if (tabId === 'tab-results') {
                mapContainer.style.display = 'none';
                dashContainer.style.display = 'flex';
                if(window.rrState && window.rrState.map && window.rrState.map.map) {
                    setTimeout(() => window.rrState.map.map.invalidateSize(), 50);
                }
            } else {
                mapContainer.style.display = 'flex';
                dashContainer.style.display = 'none';
                if(window.mapCore) {
                    setTimeout(() => window.mapCore.invalidateSize(), 50);
                }
            }
        }

        console.log(`[UI] Switched to tab: ${tabId}`);
    },

    checkConfiguration() {
        const raw = localStorage.getItem('livetrack_settings');
        const settings = raw ? JSON.parse(raw) : {};
        const token = settings.telegramToken;

        if (!token || token.trim() === '') {
            this.show();
        } else {
            this.hideOverlayOnly();
        }
    },

    show() {
        console.log('[Wizard] Adding active class to overlay');
        const overlay = document.getElementById('wizard-overlay');
        if (overlay) {
            overlay.classList.add('active');
            overlay.style.display = 'flex'; // Force display
        } else {
            console.error('[Wizard] #wizard-overlay NOT FOUND in DOM!');
        }
    },

    hideOverlayOnly() {
        const overlay = document.getElementById('wizard-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.style.display = 'none';
        }
    },

    hide() {
        document.getElementById('wizard-overlay').classList.remove('active');
        showToast('Configuration terminée ! Bienvenue.');
    },

    nextStep() {
        if (this.currentStep < this.totalSteps) {
            this.goToStep(this.currentStep + 1);
        } else {
            this.finish();
        }
    },

    prevStep() {
        if (this.currentStep > 1) {
            this.goToStep(this.currentStep - 1);
        }
    },

    goToStep(step) {
        // UI steps
        document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
        document.querySelector(`.wizard-step[data-step="${step}"]`).classList.add('active');

        // Dots
        const dots = document.getElementById('wizard-dots').children;
        for (let i = 0; i < dots.length; i++) {
            dots[i].style.background = (i + 1 <= step) ? 'var(--accent)' : 'var(--border-bright)';
        }

        // Buttons
        const btnPrev = document.getElementById('btn-wiz-prev');
        const btnNext = document.getElementById('btn-wiz-next');
        
        btnPrev.style.visibility = (step === 1) ? 'hidden' : 'visible';
        btnNext.textContent = (step === this.totalSteps) ? 'Terminer' : 'Suivant';

        this.currentStep = step;
    },

    async testConnection() {
        const token = document.getElementById('wiz-token').value.trim();
        const statusEl = document.getElementById('wiz-test-status');

        if (!token) {
            this.showTestStatus('Veuillez entrer un Token', 'error');
            return;
        }

        this.showTestStatus('Interrogation de Telegram (@getMe)...', 'info');

        try {
            const url = `https://api.telegram.org/bot${token}/getMe`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.ok) {
                const botName = data.result.first_name;
                const botUser = data.result.username;
                this.showTestStatus(`✅ Connecté en tant que ${botName} (@${botUser})`, 'success');
                // Save token immediately, chatId will be set during actual interaction
                this.saveSettings(token, null);
            } else {
                this.showTestStatus(`❌ Erreur: ${data.description}`, 'error');
            }
        } catch (err) {
            this.showTestStatus('❌ Erreur réseau ou Token invalide', 'error');
        }
    },

    showTestStatus(msg, type) {
        const el = document.getElementById('wiz-test-status');
        el.style.display = 'block';
        el.textContent = msg;
        el.style.background = type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 
                              type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)';
        el.style.color = type === 'success' ? 'var(--green)' : 
                         type === 'error' ? 'var(--red)' : 'var(--blue)';
    },

    saveSettings(token, chatId) {
        // We read existing settings to avoid overwriting everything
        let settings = {
            telegramToken: token,
            telegramChatId: chatId || ''
        };

        const existing = localStorage.getItem('livetrack_settings');
        if (existing) {
            settings = { ...JSON.parse(existing), ...settings };
        }

        localStorage.setItem('livetrack_settings', JSON.stringify(settings));
        
        // Sync with app state if it's already loaded
        if (window.state && window.state.settings) {
            window.state.settings.telegramToken = token;
            window.state.settings.telegramChatId = settings.telegramChatId;
        }
    },
    finish() {
        const token = document.getElementById('wiz-token').value.trim();
        if (!token) {
            this.goToStep(2);
            return;
        }
        this.hide();
        // Force refresh to apply settings if needed, or just let app.js handle it
        location.reload(); 
    },

    // Used by the main settings modal (app.js)
    async testSettingsModal() {
        console.log('[Wizard] testSettingsModal() triggered');
        const token = document.getElementById('s-token').value.trim();
        const statusEl = document.getElementById('settings-test-status');

        if (!token) {
            this.showStatus(statusEl, 'Token manquant', 'error');
            return;
        }

        this.showStatus(statusEl, 'Vérification...', 'info');

        try {
            const url = `https://api.telegram.org/bot${token}/getMe`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.ok) {
                const botName = data.result.first_name;
                const botUser = data.result.username;
                this.showStatus(statusEl, `✅ OK : ${botName} (@${botUser})`, 'success');
            } else {
                this.showStatus(statusEl, `❌ Erreur: ${data.description}`, 'error');
            }
        } catch (err) {
            this.showStatus(statusEl, '❌ Token invalide ou erreur réseau', 'error');
        }
    },

    showStatus(el, msg, type) {
        if (!el) return;
        el.style.display = 'block';
        el.textContent = msg;
        el.style.background = type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 
                              type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)';
        el.style.color = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
    }
};

// Start Onboarding
document.addEventListener('DOMContentLoaded', () => {
    if (window.Wizard) window.Wizard.init();
});
