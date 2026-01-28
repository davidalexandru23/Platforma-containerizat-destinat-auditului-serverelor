#!/bin/bash
# BitTrail Agent - Script instalare pe server Linux
# Copiaza acest script si binarul pe server, apoi ruleaza: sudo ./install.sh

set -e

BINARY_NAME="bittrail-agent"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/bittrail-agent"
SERVICE_FILE="/etc/systemd/system/bittrail-agent.service"

echo ""

# Verificare privilegii root
if [ "$EUID" -ne 0 ]; then
    echo "EROARE: Ruleaza ca root: sudo ./install.sh"
    exit 1
fi

# Verificare arhitectura sistem
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ]; then
    echo "ATENTIE: Acest script este pentru x86_64, detectat: $ARCH"
    read -p "Continui oricum? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "[1/4] Verificare binar..."
if [ ! -f "$BINARY_NAME" ]; then
    echo "EROARE: Nu gasesc $BINARY_NAME in directorul curent"
    echo "Asigura-te ca ai copiat binarul compilat aici"
    exit 1
fi

echo "[2/4] Instalare binar..."
cp "$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
chmod +x "$INSTALL_DIR/$BINARY_NAME"
echo "  Instalat: $INSTALL_DIR/$BINARY_NAME"

echo "[3/4] Creare director configurare..."
mkdir -p "$CONFIG_DIR"
chmod 755 "$CONFIG_DIR"
echo "  Creat: $CONFIG_DIR"

echo "[4/4] Creare fisier serviciu systemd..."
cat > "$SERVICE_FILE" << 'EOF'
[Unit]
Description=BitTrail Agent - Server Monitoring and Audit
Documentation=https://github.com/bittrail/agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/bittrail-agent run
Restart=always
RestartSec=10

# Logare
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bittrail-agent

# Permisiuni - agentul necesita acces complet la sistem
# Nerespunzator restrictionare
User=root
Group=root

# Variabile mediu
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "  Creat: $SERVICE_FILE"

echo ""
echo "Instalare completa!"
echo ""
echo "PASUL URMATOR - Inroleaza agentul:"
echo ""
echo "  sudo $BINARY_NAME enroll --server https://BITTRAIL_SERVER_URL --token TOKEN_DIN_INTERFATA_WEB"
echo ""
echo "Apoi porneste serviciul:"
echo ""
echo "  sudo systemctl enable bittrail-agent"
echo "  sudo systemctl start bittrail-agent"
echo ""
echo "Verifica status:"
echo ""
echo "  sudo systemctl status bittrail-agent"
echo "  sudo journalctl -u bittrail-agent -f"

