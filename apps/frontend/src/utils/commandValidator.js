// Validare comenzi client-side (feedback instant)
// Copie simplificata a regulilor din backend — validarea reala ramane server-side

// Nivel 1: Blacklist — comenzi blocate definitiv
const DANGEROUS_COMMANDS = [
    { pattern: /\brm\s+(-[a-zA-Z]*\s+)*/, label: 'rm (stergere fisiere)' },
    { pattern: /\brmdir\b/, label: 'rmdir (stergere directoare)' },
    { pattern: /\bunlink\b/, label: 'unlink (stergere fisier)' },
    { pattern: /\bdd\s+/, label: 'dd (scriere disc bruta)' },
    { pattern: /\bmkfs\b/, label: 'mkfs (formatare disc)' },
    { pattern: /\bfdisk\b/, label: 'fdisk (partitionare disc)' },
    { pattern: /\bparted\b/, label: 'parted (partitionare disc)' },
    { pattern: /\bwipefs\b/, label: 'wipefs (stergere semnatura disc)' },
    { pattern: /\bshred\b/, label: 'shred (distrugere fisier)' },
    { pattern: /\bshutdown\b/, label: 'shutdown (oprire sistem)' },
    { pattern: /\breboot\b/, label: 'reboot (repornire sistem)' },
    { pattern: /\bpoweroff\b/, label: 'poweroff (oprire sistem)' },
    { pattern: /\bhalt\b/, label: 'halt (oprire sistem)' },
    { pattern: /\binit\s+[0-6]\b/, label: 'init (schimbare runlevel)' },
    { pattern: /\buseradd\b/, label: 'useradd (creare utilizator)' },
    { pattern: /\buserdel\b/, label: 'userdel (stergere utilizator)' },
    { pattern: /\busermod\b/, label: 'usermod (modificare utilizator)' },
    { pattern: /\bpasswd\b/, label: 'passwd (schimbare parola)' },
    { pattern: /\bgroupadd\b/, label: 'groupadd (creare grup)' },
    { pattern: /\bgroupdel\b/, label: 'groupdel (stergere grup)' },
    { pattern: /\bchmod\b/, label: 'chmod (modificare permisiuni)' },
    { pattern: /\bchown\b/, label: 'chown (modificare proprietar)' },
    { pattern: /\bchgrp\b/, label: 'chgrp (modificare grup)' },
    { pattern: /\bapt\s+(install|remove|purge|autoremove)\b/, label: 'apt install/remove' },
    { pattern: /\bapt-get\s+(install|remove|purge|autoremove)\b/, label: 'apt-get install/remove' },
    { pattern: /\byum\s+(install|remove|erase|update)\b/, label: 'yum install/remove' },
    { pattern: /\bdnf\s+(install|remove|erase|update)\b/, label: 'dnf install/remove' },
    { pattern: /\bpip3?\s+install\b/, label: 'pip install' },
    { pattern: /\bnpm\s+install\b/, label: 'npm install' },
    { pattern: /\bcurl\b.*\|\s*(ba)?sh\b/, label: 'curl | sh (executie remota)' },
    { pattern: /\bwget\b.*\|\s*(ba)?sh\b/, label: 'wget | sh (executie remota)' },
    { pattern: /\beval\s+/, label: 'eval (executie cod dinamic)' },
    { pattern: /\bexec\s+/, label: 'exec (inlocuire proces)' },
    { pattern: /\bsystemctl\s+(start|stop|restart|enable|disable|mask)\b/, label: 'systemctl modificare serviciu' },
    { pattern: /\bservice\s+\S+\s+(start|stop|restart)\b/, label: 'service start/stop/restart' },
    { pattern: /\bmodprobe\b/, label: 'modprobe (incarcare modul kernel)' },
    { pattern: /\binsmod\b/, label: 'insmod (inserare modul kernel)' },
    { pattern: /\brmmod\b/, label: 'rmmod (dezinstalare modul kernel)' },
    { pattern: /\bsysctl\s+-w\b/, label: 'sysctl -w (scriere parametri kernel)' },
    { pattern: /\biptables\s+-(F|X|D)\b/, label: 'iptables flush/delete' },
    { pattern: /\bufw\s+disable\b/, label: 'ufw disable (dezactivare firewall)' },
    { pattern: /\bcrontab\s+-(e|r)\b/, label: 'crontab -e/-r (modificare cron)' },
];

// Nivel 2: Operatori periculosi
const DANGEROUS_OPERATORS = [
    { pattern: /[^2]>(?!\/dev\/null)\s*\S/, reason: 'Redirectare output catre fisier' },
    { pattern: />>/, reason: 'Append catre fisier' },
    { pattern: /\|\s*(ba)?sh\b/, reason: 'Pipe catre shell (executie arbitrara)' },
    { pattern: /\|\s*tee\s/, reason: 'Scriere fisier prin tee' },
    { pattern: /\bcurl\s.*-[oO]\s/, reason: 'Descarcare fisier (curl -o)' },
    { pattern: /\bwget\s/, reason: 'Descarcare fisier (wget)' },
    { pattern: /\bsed\s+-i\b/, reason: 'Editare fisier in-place (sed -i)' },
    { pattern: /\bpython[23]?\s+-c\b/, reason: 'Executie cod Python inline' },
    { pattern: /\bperl\s+-e\b/, reason: 'Executie cod Perl inline' },
    { pattern: /\bsudo\b/, reason: 'Utilizare sudo (escaladare privilegii)' },
];

/**
 * Validare comanda client-side (feedback instant, nu inlocuieste backend)
 * @param {string} command
 * @returns {{ allowed: boolean, severity: string, reasons: string[] }}
 */
export function validateCommandFrontend(command) {
    if (!command || typeof command !== 'string' || command.trim() === '') {
        return { allowed: true, severity: 'OK', reasons: [] };
    }

    const cmd = command.trim();

    // Nivel 1: Blacklist
    for (const { pattern, label } of DANGEROUS_COMMANDS) {
        if (pattern.test(cmd)) {
            return {
                allowed: false,
                severity: 'BLOCKED',
                reasons: [`Comanda interzisa: ${label}`]
            };
        }
    }

    // Nivel 2: Operatori periculosi
    const reasons = [];
    for (const { pattern, reason } of DANGEROUS_OPERATORS) {
        if (pattern.test(cmd)) {
            reasons.push(reason);
        }
    }

    if (reasons.length > 0) {
        return {
            allowed: false,
            severity: 'REJECTED',
            reasons
        };
    }

    return { allowed: true, severity: 'OK', reasons: [] };
}
