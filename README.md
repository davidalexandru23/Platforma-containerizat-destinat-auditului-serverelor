# BitTrail - Platforma de Audit Securitate

Acesta este proiectul meu pentru lucrarea de licenta, o platforma distribuita pentru auditarea automata a securitatii serverelor Linux.

## Despre Proiect

BitTrail automatizeaza procesul de verificare a conformitatii serverelor (momentan bazat pe CIS Benchmarks). In loc sa faci verificari manuale pe fiecare server, instalezi un agent usor (`bittrail-agent`) care comunica cu serverul central.

## Arhitectura Sistemului

Solutia este impartita in 3 componente principale, toate containerizate:

1.  **Backend (Node.js/Express)**: "Creierul" aplicatiei. Gestioneaza baza de date (PostgreSQL), API-urile REST, si comunicarea in timp real (WebSockets) cu frontend-ul.
2.  **Frontend (React/Vite)**: Interfata de administrare pentru utilizatori. De aici se pot vizualiza serverele, porni audituri si genera rapoarte PDF.
3.  **Agent (Go)**: Un binar compilat static care ruleaza pe serverele tinta. Acesta primeste comenzi de la backend, ruleaza verificarile locale (verifica pachete, configuratii, porturi) si trimite rezultatele inapoi.

## Functionalitati Principale

*   Monitorizare in timp real (CPU, RAM, Disk)
*   Sistem de audit flexibil folosind Template-uri JSON
*   Agent scris in Go pentru performanta si portabilitate (nu necesita dependinte pe host)
*   Rapoarte detaliate PDF
*   Sistem de notificari live
*   Deployment usor cu Docker Compose

---

## Standarde de Securitate

BitTrail foloseste template-uri de audit bazate pe standarde internationale certificate:

### CIS Controls v8

[CIS Controls](https://www.cisecurity.org/controls) este un framework de 18 controale prioritizate, dezvoltat de Center for Internet Security:

- **Implementation Group 1 (IG1)**: Controale esentiale pentru orice organizatie ("Basic Cyber Hygiene")
- **Implementation Group 2 (IG2)**: Controale intermediare pentru organizatii cu resurse IT dedicate
- **Implementation Group 3 (IG3)**: Controale avansate pentru organizatii cu date foarte sensibile

Template disponibil: `CIS Controls v8 Implementation Group 1` - 25 controale cu 40+ verificari automate.

### CIS Benchmarks

[CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks) sunt ghiduri tehnice detaliate pentru configurarea securizata a sistemelor:

- **Level 1**: Recomandari de baza care nu afecteaza functionalitatea
- **Level 2**: Recomandari pentru medii cu securitate ridicata

Template disponibil: `CIS Ubuntu 22.04 LTS Level 1 Server` - 50+ verificari automate pentru:
- Filesystem (cramfs, squashfs, partitionare)
- Process Hardening (ASLR, core dumps)
- AppArmor/MAC
- Servicii (xinetd, avahi, CUPS, NTP)
- Network (forwarding, ICMP, SYN cookies, firewall)
- Logging (auditd, rsyslog)
- SSH (8 verificari: root login, empty passwords, etc.)
- Parole si conturi

### ISO/IEC 27001:2022 & 27002:2022

[ISO 27001](https://www.iso.org/isoiec-27001-information-security.html) este standardul international pentru Sistemele de Management al Securitatii Informatiei (ISMS).

[ISO 27002:2022](https://www.iso.org/standard/75652.html) contine 93 controale in 4 categorii:
- Controale Organizationale (37)
- Controale Persoane (8)
- Controale Fizice (14)
- **Controale Tehnologice (34)** - cele mai potrivite pentru automatizare

Template disponibil: `ISO 27002:2022 Technical Controls` - 17 controale din Anexa A Categoria 8 cu verificari pentru:
- A.8.2 Drepturi de acces privilegiat
- A.8.5 Autentificare securizata
- A.8.6 Management capacitate (disk, memorie, CPU)
- A.8.8 Management vulnerabilitati
- A.8.15 Logging
- A.8.20 Securitate retele

### OpenSCAP / SCAP

[SCAP (Security Content Automation Protocol)](https://www.open-scap.org/) este un standard NIST pentru automatizarea verificarilor de securitate. BitTrail implementeaza concepte similare prin:
- Verificari automatizate bazate pe comenzi shell
- Comparatii flexibile (EQUALS, LESS_THAN, GREATER_THAN, CONTAINS)
- Export/import template-uri JSON

---

## Agent BitTrail


Agentul este un binar Go compilat static care ruleaza pe serverele Linux pe care doresti sa le auditezi.

### Instalare Agent

**Pasul 1: Adauga serverul in interfata web**

Din interfata BitTrail, mergi la `Servere > Adauga Server`. Vei primi un token de enrollment.

**Pasul 2: Descarca agentul pe server**

Detecteaza arhitectura serverului tau:

```bash
uname -m
# x86_64 = Intel/AMD (foloseste bittrail-agent-linux-amd64)
# aarch64 = ARM64/Raspberry Pi (foloseste bittrail-agent-linux-arm64)
```

**Pentru x86_64 (Intel/AMD):**

```bash
curl -fsSL http://YOUR-BITTRAIL-SERVER:3000/downloads/bittrail-agent-linux-amd64 -o bittrail-agent
curl -fsSL http://YOUR-BITTRAIL-SERVER:3000/downloads/install.sh -o install.sh
chmod +x bittrail-agent install.sh
```

**Pentru ARM64 (Raspberry Pi, Oracle Cloud, etc):**

```bash
curl -fsSL http://YOUR-BITTRAIL-SERVER:3000/downloads/bittrail-agent-linux-arm64 -o bittrail-agent
curl -fsSL http://YOUR-BITTRAIL-SERVER:3000/downloads/install.sh -o install.sh
chmod +x bittrail-agent install.sh
```

**Pasul 3: Instaleaza**

```bash
sudo ./install.sh
```

**Pasul 4: Inroleaza agentul**

```bash
sudo ./bittrail-agent enroll --server http://YOUR-BITTRAIL-SERVER:3000 --token TOKEN_DIN_INTERFATA
```

**Pasul 5: Porneste serviciul**

```bash
sudo systemctl enable bittrail-agent
sudo systemctl start bittrail-agent
```

### Verificare Status

```bash
# Status serviciu
sudo systemctl status bittrail-agent

# Loguri live
sudo journalctl -u bittrail-agent -f

# Versiune agent
bittrail-agent version
```

### Comenzi Agent

| Comanda | Descriere |
|---------|-----------|
| `bittrail-agent enroll --server URL --token TOKEN` | Inroleaza agentul cu backend-ul |
| `bittrail-agent run` | Porneste agentul (folosit de systemd) |
| `bittrail-agent status` | Afiseaza configuratia curenta |
| `bittrail-agent version` | Afiseaza versiunea agentului |
| `bittrail-agent test` | Testeaza colectarea de metrici |

---

## Update Agent

Cand este disponibila o versiune noua a agentului, in interfata web (tab Enrollment) vei vedea un avertisment cu versiunea instalata vs disponibila.

### Update Manual

```bash
# 1. Opreste agentul
sudo systemctl stop bittrail-agent

# 2. Descarca noua versiune (alege varianta corecta pentru arhitectura ta)

# Pentru x86_64 (Intel/AMD):
curl -fsSL http://YOUR-BITTRAIL-SERVER:3000/downloads/bittrail-agent-linux-amd64 -o /tmp/bittrail-agent

# Pentru ARM64 (Raspberry Pi, Oracle Cloud):
curl -fsSL http://YOUR-BITTRAIL-SERVER:3000/downloads/bittrail-agent-linux-arm64 -o /tmp/bittrail-agent

# 3. Inlocuieste binarul
chmod +x /tmp/bittrail-agent
sudo mv /tmp/bittrail-agent /usr/local/bin/bittrail-agent

# 4. Reporneste agentul
sudo systemctl start bittrail-agent

# 5. Verifica versiunea
bittrail-agent version
```

### Update cu Script

```bash
curl -fsSL https://YOUR-BITTRAIL-SERVER/downloads/update.sh -o update.sh
chmod +x update.sh
sudo ./update.sh https://YOUR-BITTRAIL-SERVER
```

### Arhitecturi Suportate

| Arhitectura | Fisier |
|-------------|--------|
| x86_64 (Intel/AMD) | `bittrail-agent-linux-amd64` |
| ARM64 (Raspberry Pi, etc) | `bittrail-agent-linux-arm64` |

---

## Pentru Dezvoltatori

### Compilare Agent

```bash
cd apps/agent

# Build pentru Linux x86_64 (default)
make build

# Build pentru toate arhitecturile
make build-all

# Build + Publish in backend (pt download)
make publish-all
```

### Versionare

Versiunea agentului este generata automat din data curenta (format: `YYYY.MM.DD`).

Dupa `make publish-all`, fisierele sunt copiate in `apps/backend/public/`:
- `bittrail-agent-linux-amd64`
- `bittrail-agent-linux-arm64`
- `install.sh`
- `update.sh`
- `agent-version.json`

### Structura Proiect

```
apps/
├── agent/          # Agent Go
│   ├── cmd/        # Entry point
│   ├── internal/   # Logica interna
│   ├── Makefile    # Build/publish
│   ├── install.sh  # Script instalare
│   └── update.sh   # Script update
├── backend/        # API Node.js
│   ├── public/     # Fisiere downloadabile
│   └── src/        # Cod sursa
└── frontend/       # UI React
```