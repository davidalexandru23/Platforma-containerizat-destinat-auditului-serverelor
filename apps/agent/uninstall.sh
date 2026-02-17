#!/bin/bash
# BitTrail Agent - Uninstall Script

if [ "$EUID" -ne 0 ]; then
    echo "EROARE: Ruleaza ca root: sudo ./uninstall.sh"
    exit 1
fi

echo "Dezinstalare BitTrail Agent..."

# 1. Oprire si dezactivare serviciu
if systemctl is-active --quiet bittrail-agent; then
    echo "  Oprire serviciu..."
    systemctl stop bittrail-agent
fi

if systemctl is-enabled --quiet bittrail-agent; then
    echo "  Dezactivare serviciu..."
    systemctl disable bittrail-agent
fi

# 2. Stergere fisiere
echo "  Stergere fisiere..."
rm -f /usr/local/bin/bittrail-agent
rm -f /etc/systemd/system/bittrail-agent.service
rm -rf /etc/bittrail-agent

# 3. Reload systemd
systemctl daemon-reload

echo ""
echo "Dezinstalare completa!"
