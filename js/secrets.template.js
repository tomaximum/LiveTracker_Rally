/**
 * LiveTrack Rally - Secrets Template
 * This file is used by GitHub Actions to inject sensitive parameters.
 */
const SECRETS = {
    TELEGRAM_ADMIN_TOKEN: "${TELEGRAM_ADMIN_BOT_TOKEN}",
    TELEGRAM_ADMIN_CHAT_ID: "${TELEGRAM_ADMIN_CHAT_ID}",
    GDRIVE_WEBHOOK_URL: "${GDRIVE_WEBHOOK_URL}"
};
