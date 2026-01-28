#!/bin/bash
# BitTrail Agent - Update Script

set -e

DOWNLOAD_URL="${1:-https://your-bittrail-server.com}"
BINARY_PATH="/usr/local/bin/bittrail-agent"

echo "Agent Update"
echo ""

# Verifica root
if [ "$EUID" -ne 0 ]; then
    echo "EROARE: Ruleaza ca root: sudo ./update.sh [SERVER_URL]"
    exit 1
fi

# Detecteaza arhitectura
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    AGENT_FILE="bittrail-agent-linux-amd64"
elif [ "$ARCH" = "aarch64" ]; then
    AGENT_FILE="bittrail-agent-linux-arm64"
else
    echo "Arhitectura nesuportata: $ARCH"
    exit 1
fi

# Afiseaza versiunea curenta
echo "[1/5] Versiune curenta:"
if [ -f "$BINARY_PATH" ]; then
    $BINARY_PATH version || echo "  (nu se poate determina)"
else
    echo "  (agent neinstalat)"
fi

# Opreste serviciul
echo "[2/5] Oprire agent..."
systemctl stop bittrail-agent 2>/dev/null || true

# Backup vechiul binar
echo "[3/5] Backup binar vechi..."
if [ -f "$BINARY_PATH" ]; then
    cp "$BINARY_PATH" "${BINARY_PATH}.bak"
fi

# Descarca noua versiune
echo "[4/5] Descarcare versiune noua..."
curl -fsSL "${DOWNLOAD_URL}/downloads/${AGENT_FILE}" -o "$BINARY_PATH"
chmod +x "$BINARY_PATH"

# Reporneste serviciul
echo "[5/5] Repornire agent..."
systemctl start bittrail-agent

# Afiseaza versiunea noua
echo ""
echo "Update complet!"
$BINARY_PATH version
