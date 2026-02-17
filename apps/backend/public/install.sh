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
if [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "aarch64" ]; then
    echo "ATENTIE: Arhitectura detectata: $ARCH. Scriptul este testat pe x86_64 si aarch64."
    read -p "Continui oricum? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Verificare prerequisites
for cmd in curl sudo; do
    if ! command -v $cmd &> /dev/null; then
        echo "EROARE: $cmd nu este instalat."
        exit 1
    fi
done

# Setare URL backend (daca nu e setat din argumente, incearca sa il deduca sau cere input)
# In mod normal, acest script este rulat cu curl http://.../install.sh | bash
# Daca este rulat direct, putem lua URL-ul.
# Pentru simplitate, presupunem ca scriptul si binarul sunt in acelasi loc SAU userul ruleaza comanda compusa.

echo "[1/4] Verificare si Descarcare Binar..."
    # Detectare arhitectura pentru download
    DL_ARCH=""
    if [ "$ARCH" = "x86_64" ]; then
        DL_ARCH="bittrail-agent-linux-amd64"
    elif [ "$ARCH" = "aarch64" ]; then
        DL_ARCH="bittrail-agent-linux-arm64"
    else
        echo "Arhitectura necunoscuta pentru download automat: $ARCH"
        exit 1
    fi

    # Preluare URL din primul argument pozitional
    SERVER_URL="${1:-$SERVER_URL}"

    # Setare URL backend implicit daca nu este furnizat
    if [ -z "$SERVER_URL" ]; then
        # Default fallback (dar ar trebui sa fie furnizat in argumente)
        echo "EROARE: URL-ul backend-ului nu a fost furnizat."
        echo "Utilizare: curl ... | sudo bash -s -- http://BACKEND_IP:3000"
        exit 1
    fi
    
    # Clean URL
    SERVER_URL=${SERVER_URL%/}
    
    echo "  Descarc $DL_ARCH de la $SERVER_URL (overwrite)..."
    curl -fsSL "$SERVER_URL/downloads/$DL_ARCH" -o "$BINARY_NAME"
    if [ $? -ne 0 ]; then
        echo "EROARE la descarcare. Verifica URL-ul."
        exit 1
    fi

echo "[2/4] Instalare..."
chmod +x "$BINARY_NAME"
cp "$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"

echo "[3/4] Configurare..."
mkdir -p "$CONFIG_DIR"
mkdir -p "$CONFIG_DIR/certs"
chmod 755 "$CONFIG_DIR"

# Prompt interactiv - Service sau Standalone?
echo ""
echo "Cum vrei sa ruleze agentul?"
echo "  1) Ca serviciu systemd (Recomandat - porneste automat)"
echo "  2) Standalone (Doar il rulez manual)"

if [ -t 0 ]; then
    read -p "Alege (1/2) [1]: " CHOICE
else
    echo -n "Alege (1/2) [1]: "
    read CHOICE < /dev/tty
fi
CHOICE=${CHOICE:-1}

if [ "$CHOICE" = "1" ]; then
    echo "[4/4] Configurare Systemd..."
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=BitTrail Agent
After=network-online.target

[Service]
ExecStart=$INSTALL_DIR/$BINARY_NAME run
Restart=always
User=root
Group=root
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable bittrail-agent
    echo "  Serviciu instalat si activat."
    echo ""
    echo "Pentru a porni acum, ruleaza: systemctl start bittrail-agent"
else
    echo "[4/4] Skip Systemd."
    echo ""
    echo "Agentul este instalat in $INSTALL_DIR/$BINARY_NAME"
fi

echo ""
echo "Instalare Completa!"
echo "Nu uita sa inrolezi agentul daca nu ai facut-o deja:"
echo "  sudo $BINARY_NAME enroll --server URL --token TOKEN"
echo ""

