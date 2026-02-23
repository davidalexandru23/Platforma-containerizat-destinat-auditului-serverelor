// Serviciu validare comenzi custom din template-uri
// Previne executia de comenzi distructive pe serverele auditate

import { log } from '../lib/logger.js';

// Nivel 1: Blacklist - comenzi blocate definitiv, nimeni nu le poate aproba
const DANGEROUS_COMMANDS = [
    // Stergere fisiere/directoare
    { pattern: /\brm\s+(-[a-zA-Z]*\s+)*/, label: 'rm (stergere fisiere)' },
    { pattern: /\brmdir\b/, label: 'rmdir (stergere directoare)' },
    { pattern: /\bunlink\b/, label: 'unlink (stergere fisier)' },

    // Formatare/Scriere disc
    { pattern: /\bdd\s+/, label: 'dd (scriere disc bruta)' },
    { pattern: /\bmkfs\b/, label: 'mkfs (formatare disc)' },
    { pattern: /\bfdisk\b/, label: 'fdisk (partitionare disc)' },
    { pattern: /\bparted\b/, label: 'parted (partitionare disc)' },
    { pattern: /\bwipefs\b/, label: 'wipefs (stergere semnatura disc)' },
    { pattern: /\bshred\b/, label: 'shred (distrugere fisier)' },

    // Oprire/Repornire sistem
    // Oprire/Repornire sistem (sa nu faca match pe reboot-required sau shutdown-hook)
    { pattern: /(?<!-)\bshutdown\b(?!-)/, label: 'shutdown (oprire sistem)' },
    { pattern: /(?<!-)\breboot\b(?!-)/, label: 'reboot (repornire sistem)' },
    { pattern: /(?<!-)\bpoweroff\b(?!-)/, label: 'poweroff (oprire sistem)' },
    { pattern: /(?<!-)\bhalt\b(?!-)/, label: 'halt (oprire sistem)' },
    { pattern: /(?<!-)\binit\s+[0-6]\b/, label: 'init (schimbare runlevel)' },

    // Modificare utilizatori/grupuri
    { pattern: /\buseradd\b/, label: 'useradd (creare utilizator)' },
    { pattern: /\buserdel\b/, label: 'userdel (stergere utilizator)' },
    { pattern: /\busermod\b/, label: 'usermod (modificare utilizator)' },
    { pattern: /(?<!\/)\bpasswd\b/, label: 'passwd (schimbare parola)' },
    { pattern: /\bgroupadd\b/, label: 'groupadd (creare grup)' },
    { pattern: /\bgroupdel\b/, label: 'groupdel (stergere grup)' },

    // Modificare permisiuni
    { pattern: /\bchmod\b/, label: 'chmod (modificare permisiuni)' },
    { pattern: /\bchown\b/, label: 'chown (modificare proprietar)' },
    { pattern: /\bchgrp\b/, label: 'chgrp (modificare grup)' },

    // Gestiune pachete - install/remove/purge
    { pattern: /\bapt\s+(install|remove|purge|autoremove)\b/, label: 'apt install/remove' },
    { pattern: /\bapt-get\s+(install|remove|purge|autoremove)\b/, label: 'apt-get install/remove' },
    { pattern: /\byum\s+(install|remove|erase|update)\b/, label: 'yum install/remove' },
    { pattern: /\bdnf\s+(install|remove|erase|update)\b/, label: 'dnf install/remove' },
    { pattern: /\bpip3?\s+install\b/, label: 'pip install' },
    { pattern: /\bnpm\s+install\b/, label: 'npm install' },

    // Descarcare + executie (pipe catre shell)
    { pattern: /\bcurl\b.*\|\s*(ba)?sh\b/, label: 'curl | sh (executie remota)' },
    { pattern: /\bwget\b.*\|\s*(ba)?sh\b/, label: 'wget | sh (executie remota)' },

    // Comenzi periculoase generice
    { pattern: /:\(\)\s*\{.*\|.*&\s*\}\s*;?\s*:/, label: 'fork bomb' },
    { pattern: /\beval\s+/, label: 'eval (executie cod dinamic)' },
    { pattern: /\bexec\s+/, label: 'exec (inlocuire proces)' },

    // Servicii - start/stop/restart/enable/disable
    { pattern: /\bsystemctl\s+(start|stop|restart|enable|disable|mask)\b/, label: 'systemctl modificare serviciu' },
    { pattern: /\bservice\s+\S+\s+(start|stop|restart)\b/, label: 'service start/stop/restart' },

    // Kernel
    { pattern: /\bmodprobe\b/, label: 'modprobe (incarcare modul kernel)' },
    { pattern: /\binsmod\b/, label: 'insmod (inserare modul kernel)' },
    { pattern: /\brmmod\b/, label: 'rmmod (dezinstalare modul kernel)' },
    { pattern: /\bsysctl\s+-w\b/, label: 'sysctl -w (scriere parametri kernel)' },

    // Network distructiv
    { pattern: /\biptables\s+-(F|X|D)\b/, label: 'iptables flush/delete' },
    { pattern: /\bufw\s+disable\b/, label: 'ufw disable (dezactivare firewall)' },

    // Cron modificare
    { pattern: /\bcrontab\s+-(e|r)\b/, label: 'crontab -e/-r (modificare cron)' },
];

// Nivel 2: Operatori periculosi - detectie comportament suspect
const DANGEROUS_OPERATORS = [
    { pattern: /(?<![2&])\s>\s*(?!\/dev\/null)(?![0-9])\S/, reason: 'Redirectare output catre fisier' },
    { pattern: />>/, reason: 'Append catre fisier' },
    { pattern: /(?:\s\|\s*(?:ba)?sh\b|\|\s+(?:ba)?sh\b)/, reason: 'Pipe catre shell (executie arbitrara)' },
    { pattern: /\|\s*tee\s/, reason: 'Scriere fisier prin tee' },
    { pattern: /\bcurl\s.*-[oO]\s/, reason: 'Descarcare fisier (curl -o)' },
    { pattern: /(?<!command -v\s+)\bwget\s/, reason: 'Descarcare fisier (wget)' },
    { pattern: /\bsed\s+-i\b/, reason: 'Editare fisier in-place (sed -i)' },
    { pattern: /\bpython[23]?\s+-c\b/, reason: 'Executie cod Python inline' },
    { pattern: /\bperl\s+-e\b/, reason: 'Executie cod Perl inline' },
    // { pattern: /\bsudo\b/, reason: 'Utilizare sudo (escaladare privilegii)' },
];

/**
 * Valideaza o singura comanda
 * @param {string} command - comanda de validat
 * @returns {{ allowed: boolean, severity: string, reasons: string[] }}
 */
export function validateCommand(command) {
    if (!command || typeof command !== 'string' || command.trim() === '') {
        return { allowed: true, severity: 'OK', reasons: [] };
    }

    const cmd = command.trim();

    // Nivel 1: Blacklist - blocare definitiva
    for (const { pattern, label } of DANGEROUS_COMMANDS) {
        if (pattern.test(cmd)) {
            log.warn(`[COMMAND_VALIDATOR] Comanda BLOCATA: "${cmd}" - motiv: ${label}`);
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
        log.warn(`[COMMAND_VALIDATOR] Comanda RESPINSA: "${cmd}" - motive: ${reasons.join(', ')}`);
        return {
            allowed: false,
            severity: 'REJECTED',
            reasons
        };
    }

    return { allowed: true, severity: 'OK', reasons: [] };
}

/**
 * Valideaza toate comenzile din array-ul de controale
 * @param {Array} controls - array de controale cu automatedChecks
 * @returns {{ valid: boolean, errors: Array }}
 */
export function validateAllCommands(controls) {
    const errors = [];

    if (!Array.isArray(controls)) {
        return { valid: true, errors: [] };
    }

    controls.forEach((control, i) => {
        const controlId = control.controlId || `controls[${i}]`;

        if (Array.isArray(control.automatedChecks)) {
            control.automatedChecks.forEach((check, j) => {
                // Validare camp command
                if (check.command) {
                    const result = validateCommand(check.command);
                    if (!result.allowed) {
                        errors.push({
                            controlId,
                            checkId: check.checkId || `check[${j}]`,
                            command: check.command,
                            severity: result.severity,
                            reasons: result.reasons
                        });
                    }
                }

                // Validare camp script
                if (check.script) {
                    const result = validateCommand(check.script);
                    if (!result.allowed) {
                        errors.push({
                            controlId,
                            checkId: check.checkId || `check[${j}]`,
                            command: check.script,
                            field: 'script',
                            severity: result.severity,
                            reasons: result.reasons
                        });
                    }
                }
            });
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
}
