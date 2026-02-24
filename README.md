# BitTrail - Platforma Containerizata pentru Auditul Serverelor Linux

BitTrail este o platforma distribuita care automatizeaza procesul de audit al securitatii pe servere Linux. In loc sa verifici manual configuratia fiecarui server, instalezi un agent care colecteaza date, ruleaza verificari si raporteaza rezultatele intr-o interfata web centralizata.

---



## Arhitectura

Platforma este compusa din trei componente principale, toate rulate prin Docker Compose:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Compose (host)                        │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  PostgreSQL   │  │   Backend    │  │      Frontend        │  │
│  │  (bittrail-db)│  │  Node.js     │  │   React + Nginx      │  │
│  │              │◄─┤  Express     │◄─┤   (proxy /api, /ws)  │  │
│  │  Port: 5432  │  │  Port: 3000  │  │   Port: 80           │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────────┘  │
│                           │ WebSocket + REST API                │
└───────────────────────────┼─────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────┐
        │  Agent   │  │  Agent   │  │  Agent   │
        │  (Go)    │  │  (Go)    │  │  (Go)    │
        │  VM #1   │  │  VM #2   │  │  VM #N   │
        └──────────┘  └──────────┘  └──────────┘
```

### Backend (Node.js + Express)

Serverul central care gestioneaza tot bussines-logic-ul:

- **API REST** pentru frontend si agenti (autentificare, servere, audituri, template-uri)
- **WebSocket** (Socket.IO) cu namespace-uri dedicate: `/ws/live` pentru metrici in timp real, `/ws/servers` pentru status, `/ws/audit` pentru progresul auditurilor
- **Prisma ORM** pentru interactiunea cu PostgreSQL
- Servire binare agent pre-compilate pe `/downloads/` (install script, update, uninstall)
- Generare si validare token-uri JWT (access + refresh)
- Middleware-uri: rate limiting, validare comenzi, autorizare pe roluri 

### Frontend (React + Vite)

Interfata web servita prin Nginx ca reverse proxy:

- Dashboard cu metrici live, activitate recenta, status servere
- Pagina de detaliu server cu tab-uri: Overview (metrici CPU/RAM/disk/retea), Istoric Audituri, Configuratie (inventar OS), Enrollment (instructiuni instalare agent)
- Vizualizare detaliu audit: progres pe controale, rezultate automate si manuale, scor conformitate
- Generare raport PDF direct din browser (jsPDF)
- Gestiune template-uri si utilizatori

### Agent (Go)

Binar compilat static, fara dependinte externe, ruleaza pe serverele Linux auditate:

- **Colectare metrici** la fiecare 10 secunde: CPU, memorie, disk, retea, load average, procese top
- **Colectare inventar** la fiecare ora: distributie OS, pachete instalate, servicii active, porturi deschise, configuratie SSH, reguli firewall, utilizatori sistem, valori sysctl
- **Executie verificari audit**: primeste comenzi de la backend, le ruleaza in sandbox (cu timeout 30s si blacklist comenzi periculoase), semneaza rezultatele si le trimite inapoi


---

## Functionalitati

### Monitorizare in Timp Real

Cand un agent este online, metricile (CPU, RAM, disk, retea) sunt trimise la fiecare 10 secunde si afisate live pe dashboard prin WebSocket. Statusul serverelor se actualizeaza automat, daca agentul nu mai trimite date, serverul apare ca `OFFLINE` dupa un timeout configurat.

### Audit Automatizat

Procesul de audit functioneaza astfel:

1. Auditorul selecteaza un server si un template din interfata
2. Backend-ul extrage controalele din template, semneaza fiecare comanda si le trimite agentului
3. Agentul executa comenzile, verifica output-ul fata de rezultatele asteptate, semneaza digital rezultatele si le raporteaza
4. Backend-ul calculeaza scorul de conformitate si notifica frontend-ul in timp real

Fiecare rezultat include metadate **Chain of Custody**: hash SHA-256 al output-ului, timestamp exact, hostname, user-ul care a executat, exit code si semnatura digitala a agentului.

### Verificari Manuale

Pe langa verificarile automate, template-urile pot include **verificari manuale** care necesita interventie umana (ex: "Exista proces documentat de generare SBOM?"). Auditorul poate marca fiecare task manual ca PASS/FAIL, adauga comentarii si atasa dovezi (upload fisier, link sau atestare).

### Rapoarte PDF

Dupa finalizarea auditului (toate verificarile automate + manuale rezolvate), se poate genera un raport PDF, continand:
- Informatii server (hostname, IP, OS)
- Scor conformitate automat si manual
- Detalii fiecare control: status, output, erori
- Timestamp si metadate Chain of Custody

### Inventar Server

Agentul colecteaza periodic un snapshot al configuratiei serverului: distributie si versiune OS, kernel, pachete instalate (dpkg/rpm), servicii active, porturi deschise, configuratie SSH, reguli firewall, utilizatori si grupuri sistem. Aceste date sunt stocate istoric si disponibile in tab-ul `Configuratie` al fiecarui server.

---


## Agentul BitTrail

Agentul este un binar Go compilat static care se instaleaza pe fiecare server Linux pe care vrei sa-l auditezi. Procesul complet are trei pasi: instalare, inrolare si pornire.

### 1. Instalare (One-Liner)

Scriptul de instalare descarca binarul, il plaseaza in `/usr/local/bin/` si optional configureaza un serviciu systemd:

```bash
curl -fsSL http://BACKEND_IP:3000/downloads/install.sh | sudo bash -s -- http://BACKEND_IP:3000
```

Scriptul detecteaza automat arhitectura (amd64 sau arm64) si intreaba daca se doreste instalare ca serviciu systemd.

### 2. Inrolare

Dupa instalare, agentul trebuie conectat la platforma. Din interfata web, mergi pe pagina serverului -> tab-ul `Enrollment` si copiaza comanda cu token-ul generat:

```bash
sudo ./bittrail-agent enroll --token TOKEN --server http://BACKEND_IP:3000
```

La inrolare se intampla urmatoarele:
- Agentul genereaza o pereche de chei RSA (privata + publica)
- Trimite un CSR (Certificate Signing Request) la backend
- Backend-ul semneaza CSR-ul cu CA-ul intern si returneaza certificatul
- Agentul salveaza configuratia in `/etc/bittrail-agent/config.yaml`
- Token-ul de inrolare este invalidat (single-use)

### 3. Pornire

```bash
# Ca serviciu systemd (recomandat)
sudo systemctl start bittrail-agent
sudo systemctl enable bittrail-agent   # pornire automata la boot

# Sau in mod interactiv (util pentru debug)
sudo bittrail-agent run
```

### Comenzi CLI

| Comanda | Descriere |
|---------|-----------|
| `enroll --server URL --token TOKEN` | Inrolare agent pe platforma |
| `run` | Pornire in mod daemon (foreground) |
| `status` | Afisare configuratie curenta si stare |
| `test` | Rulare colectori o data si afisare rezultate (dry-run) |
| `version` | Afisare versiune agent |
| `help` | Ajutor pentru orice comanda |

Toate comenzile (cu exceptia `version` si `help`) necesita `sudo` deoarece config-ul se afla in `/etc/bittrail-agent/`.

### Gestionare Serviciu

```bash
sudo systemctl start bittrail-agent     # Pornire
sudo systemctl stop bittrail-agent      # Oprire
sudo systemctl restart bittrail-agent   # Restart
sudo systemctl status bittrail-agent    # Status
sudo journalctl -u bittrail-agent -f    # Loguri live
```

### Actualizare Agent

Din interfata web, tab-ul Enrollment, copiaza comanda de update care descarca cel mai recent binar de pe backend:

```bash
curl -fsSL http://BACKEND_IP:3000/downloads/update.sh | sudo bash -s -- http://BACKEND_IP:3000
```

### Dezinstalare

```bash
curl -fsSL http://BACKEND_IP:3000/downloads/uninstall.sh | sudo bash
```

---

## Sabloane de Audit Predefinite

Platforma vine cu 4 sabloane predefinite, fiecare acoperind un standard sau framework diferit. Sabloanele contin doua tipuri de verificari:

- **Automate**: comenzi bash executate de agent pe server, cu rezultat comparat automat (PASS/FAIL/WARN)
- **Manuale**: verificari care necesita interventie umana si dovezi (documente, link-uri, atestatii)

### MITRE ATT&CK — Linux Server Defensive Coverage

**Fisier**: `mitre_attack_linux_defense.json` | **Tip**: MITRE

Evalueaza acoperirea defensiva a serverului fata de tacticile si tehnicile din framework-ul MITRE ATT&CK. Controalele sunt organizate dupa ID-urile ATT&CK (ex: TA0001-T1078 "Valid Accounts").

**Zone acoperite** (22 controale):
- **Initial Access**: monitorizare autentificari (SSH/sudo), protectie brute-force (fail2ban/faillock), inventar servicii expuse
- **Persistence**: inventar cron jobs, systemd timers, unit files custom
- **Privilege Escalation**: fisiere SUID/SGID, reguli NOPASSWD in sudoers
- **Defense Evasion**: verificare logging activ (journald/rsyslog/auditd), detectie oprire servicii de securitate
- **Credential Access**: permisiuni fisiere shadow, reguli audit pentru acces la credentiale
- **Lateral Movement**: hardening SSH (root login, password auth, pubkey)
- **Command & Control**: conexiuni outbound, tool-uri download (curl/wget), fisiere suspecte in /tmp
- **Telemetry Baseline**: NTP sincronizat, file integrity (hash-uri fisiere critice), retentie loguri

### NIS2 Baseline — Directiva UE

**Fisier**: `nis2_baseline_server.json` | **Tip**: NIS2

Implementeaza cerintele de baza ale Directivei NIS2 (Network and Information Security) a Uniunii Europene, adaptate la nivel de server.

**Zone acoperite**:
- Igiena cibernetica de baza (actualizari, parole, firewall)
- Management vulnerabilitati si postura de patching
- Securitate acces si autentificare
- Configurare retea si servicii expuse
- Logging si auditare

### NIST SP 800-53 Moderate

**Fisier**: `nist_800_53_moderate_server.json` | **Tip**: NIST

Controale bazate pe publicatia NIST SP 800-53, adaptate pentru nivel moderat de risc, concentrate pe verificari tehnice la nivel de server.

**Zone acoperite**:
- Control acces (AC): conturi privilegiate, politici parola, SSH hardening
- Audit si Responsabilitate (AU): logging, retentie, integritate loguri
- Protectie Sistem si Comunicatii (SC): firewall, TLS, configuratie retea
- Integritate Sistem si Informatii (SI): actualizari, antivirus/EDR, integritate fisiere

### Supply Chain & SBOM Readiness (SLSA-lite)

**Fisier**: `supply_chain_sbom_lite.json` | **Tip**: SUPPLY_CHAIN

Verificari orientate pe securitatea lantului de aprovizionare software, inspirate din framework-ul SLSA (Supply-chain Levels for Software Artifacts).

**Zone acoperite** (6 controale):
- **SBOM-lite**: inventar OS si pachete, detectie package manager
- **Repository Integrity**: verificare surse oficiale, TLS pe repo-uri, GPG check activ, keyrings
- **Patching & Updates**: numar update-uri pending, unattended upgrades, detectie reboot necesar
- **Container Supply Chain**: inventar Docker, detectie tag `:latest`, digest pinning, registries non-standard
- **Git Hygiene**: checkouts pe server, chei private expuse
- **Hardening minim**: SSH (password auth, root login), firewall activ

### Template-uri Custom

Pe langa sabloanele predefinite, utilizatorii cu rol ADMIN sau AUDITOR pot crea template-uri proprii in format JSON, urmand structura `bittrail-template@1.0`.

---

## Securitate

### PKI (Public Key Infrastructure)

Platforma implementeaza o infrastructura de chei publice interna:

- La pornire, backend-ul genereaza un **CA (Certificate Authority)** auto-semnat
- La inrolarea fiecarui agent, acesta genereaza o pereche RSA 2048-bit, trimite un CSR backend-ului, iar CA-ul intern semneaza certificatul
- Fiecare comanda de audit trimisa de backend este **semnata digital** cu cheia privata a CA-ului
- Agentul **verifica semnatura** comenzii inainte de executie — comenzile nesemnate sau cu semnatura invalida sunt refuzate
- Rezultatele auditului sunt **semnate digital** de agent cu cheia lui privata, iar backend-ul verifica semnatura la receptie

### Protectie Comenzi pe Agent

Agentul are un dublu sistem de protectie:

1. **Validare pe backend** (`commandValidator.service.js`): inainte de a trimite o comanda agentului, backend-ul o verifica contra unei liste de pattern-uri periculoase (rm -rf, dd, mkfs, shutdown, etc.)
2. **Blacklist pe agent** (`audit.go`): ultima linie de aparare — chiar daca o comanda trece de backend, agentul o refuza daca se potriveste cu un pattern blocant

Comenzile blocate includ: `rm -rf /`, `dd`, `mkfs`, `shutdown`, `reboot`, `poweroff`, `useradd`, `userdel`, `passwd`, `systemctl start/stop/restart`, `iptables -F/-X/-D`, `eval`, `exec`.

### Autentificare si Autorizare

- **JWT** (JSON Web Tokens) cu access token (scurt) + refresh token (lung)
- **RBAC** (Role-Based Access Control) cu 3 roluri: ADMIN, AUDITOR, VIEWER
- **Permisiuni granulare** per server per utilizator
- **Rate limiting** pe autentificare (10 req/min) si pe API agent (60 req/min)
- Parole hash-uite cu **bcrypt**
- Token-uri de inrolare single-use cu expirare 24 ore

### Chain of Custody

Fiecare rezultat de audit contine metadate pentru trasabilitate completa:
- Hash SHA-256 al output-ului (orice modificare pe drum se detecteaza)
- Timestamp exact al executiei pe agent
- Hostname si user-ul care a executat comanda
- Exit code al procesului
- Semnatura digitala RSA a agentului
- Flag de verificare semnatura (`verified`)

### Redactare Secrete

Inainte de a trimite rezultatele, agentul trece output-ul prin functia `RedactSecrets()` care mascheaza automat pattern-uri de parole, token-uri si chei private din output.

---

## Structura Bazei de Date

Schema PostgreSQL (gestionata prin Prisma) include urmatoarele entitati principale:

| Entitate | Descriere |
|----------|-----------|
| `User` | Utilizatori cu email, parola hash-uita si roluri |
| `Role` | Roluri (ADMIN, AUDITOR, VIEWER) cu capabilitati |
| `Server` | Servere inregistrate (hostname, IP, status) |
| `AgentIdentity` | Identitatea agentului (token, certificat, versiune) |
| `Template` | Sabloane de audit (predefinite sau custom) |
| `TemplateVersion` | Versiuni ale sabloanelor (versionare) |
| `Control` | Controale individuale dintr-un sablon |
| `AutomatedCheck` | Verificari automate (comanda, rezultat asteptat, comparatie) |
| `ManualCheck` | Verificari manuale (instructiuni, specificatii dovezi) |
| `AuditRun` | Executii audit (status, scor, server, template) |
| `CheckResult` | Rezultate verificari automate (output, hash, semnatura) |
| `ManualTaskResult` | Rezultate verificari manuale (status, dovezi) |
| `InventorySnapshot` | Snapshot-uri inventar server (OS, pachete, servicii) |
| `MetricSample` | Esantioane metrici (CPU, RAM, disk, retea) |
| `AuditLog` | Jurnal general de actiuni (CRUD, login, audit) |

---

## Bibliografie

### Standarde si Framework-uri de Securitate

1. **MITRE ATT&CK for Enterprise** — Framework de tactici si tehnici ale adversarilor. [https://attack.mitre.org/](https://attack.mitre.org/)
2. **NIST SP 800-53 Rev. 5** — Security and Privacy Controls for Information Systems and Organizations. [https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final](https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final)
3. **Directiva NIS2 (EU 2022/2555)** — Measures for a high common level of cybersecurity across the Union. [https://eur-lex.europa.eu/eli/dir/2022/2555/oj](https://eur-lex.europa.eu/eli/dir/2022/2555/oj)
4. **SLSA (Supply-chain Levels for Software Artifacts)** — Framework pentru integritatea supply chain. [https://slsa.dev/](https://slsa.dev/)

### Tehnologii Backend

5. **Node.js** — Runtime JavaScript server-side bazat pe V8. [https://nodejs.org/](https://nodejs.org/)
6. **Express.js** — Framework web minimalist pentru Node.js. [https://expressjs.com/](https://expressjs.com/)
7. **Prisma** — ORM type-safe pentru Node.js si TypeScript. [https://www.prisma.io/](https://www.prisma.io/)
8. **PostgreSQL** — Sistem de gestiune relational open-source. [https://www.postgresql.org/](https://www.postgresql.org/)
9. **Socket.IO** — Librarie pentru comunicare bidirectionala real-time. [https://socket.io/](https://socket.io/)
10. **JSON Web Tokens (RFC 7519)** — Standard pentru token-uri de autentificare. [https://datatracker.ietf.org/doc/html/rfc7519](https://datatracker.ietf.org/doc/html/rfc7519)
11. **bcrypt** — Functie de hash pentru parole, bazata pe Blowfish. [https://en.wikipedia.org/wiki/Bcrypt](https://en.wikipedia.org/wiki/Bcrypt)
12. **Passport.js** — Middleware de autentificare pentru Node.js. [https://www.passportjs.org/](https://www.passportjs.org/)

### Tehnologii Frontend

13. **React 18** — Librarie JavaScript pentru construirea interfetelor utilizator. [https://react.dev/](https://react.dev/)
14. **Vite** — Build tool si dev server rapid. [https://vitejs.dev/](https://vitejs.dev/)
15. **jsPDF** — Generare documente PDF din JavaScript pe client. [https://github.com/parallax/jsPDF](https://github.com/parallax/jsPDF)
16. **Material Symbols** — Set de iconite Google Fonts. [https://fonts.google.com/icons](https://fonts.google.com/icons)

### Tehnologii Agent

17. **Go (Golang)** — Limbaj de programare compilat, performant, dezvoltat de Google. [https://go.dev/](https://go.dev/)
18. **Cobra** — Framework pentru aplicatii CLI in Go. [https://github.com/spf13/cobra](https://github.com/spf13/cobra)
19. **gopsutil** — Librarie Go cross-platform pentru metrici de sistem. [https://github.com/shirou/gopsutil](https://github.com/shirou/gopsutil)
20. **crypto/x509, crypto/rsa** — Pachete standard Go pentru operatii criptografice (generare chei, semnare, verificare). [https://pkg.go.dev/crypto](https://pkg.go.dev/crypto)

### Infrastructura

21. **Docker** — Platforma de containerizare. [https://www.docker.com/](https://www.docker.com/)
22. **Docker Compose** — Tool pentru definirea si rularea aplicatiilor multi-container. [https://docs.docker.com/compose/](https://docs.docker.com/compose/)
23. **Nginx** — Server web si reverse proxy. [https://nginx.org/](https://nginx.org/)

---

Toate componentele externe sunt utilizate conform licentelor lor (MIT, Apache 2.0, BSD).