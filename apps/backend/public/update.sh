#!/bin/bash
# BitTrail Agent - Update Script

set -e

DOWNLOAD_URL="${1:-https://your-bittrail-server.com}"
BINARY_PATH="/usr/local/bin/bittrail-agent"

echo ""

# Verificare privilegii root
if [ "$EUID" -ne 0 ]; then
    echo "EROARE: Ruleaza ca root: sudo ./update.sh [SERVER_URL]"
    exit 1
fi

# Detectare arhitectura sistem
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    AGENT_FILE="bittrail-agent-linux-amd64"
elif [ "$ARCH" = "aarch64" ]; then
    AGENT_FILE="bittrail-agent-linux-arm64"
else
    echo "Arhitectura nesuportata: $ARCH"
    exit 1
fi

# Afisare versiune curenta
echo "[1/5] Versiune curenta:"
if [ -f "$BINARY_PATH" ]; then
    $BINARY_PATH version || echo "  (nu se poate determina)"
else
    echo "  (agent neinstalat)"
fi

# Oprire serviciu
echo "[2/5] Oprire agent..."
systemctl stop bittrail-agent 2>/dev/null || true

# Backup binar existent
echo "[3/5] Backup binar vechi..."
if [ -f "$BINARY_PATH" ]; then
    cp "$BINARY_PATH" "${BINARY_PATH}.bak"
fi

# Descarcare versiune noua
echo "[4/5] Descarcare versiune noua..."
curl -fsSL "${DOWNLOAD_URL}/downloads/${AGENT_FILE}" -o "$BINARY_PATH"
chmod +x "$BINARY_PATH"

# Repornire serviciu
echo "[5/5] Repornire agent..."
systemctl start bittrail-agent

# Afisare versiune noua
echo ""
echo "Actualizare completa!"
$BINARY_PATH version
