# BitTrail

Platforma containerizata pentru auditul serverelor

BitTrail este aplicatia dezvoltata ca suport practic pentru lucrarea de licenta „Platforma containerizata pentru auditul serverelor", realizata in cadrul Facultatii de Cibernetica, Statistica si Informatica Economica, ASE Bucuresti.

Proiectul urmareste automatizarea procesului de audit al securitatii pentru servere Linux, folosind verificari bazate pe standardele CIS Benchmarks si CIS Controls (deocamdata). Solutia este construita pe o arhitectura distribuita de tip backend-agent si este rulata in containere Docker.

Platforma include un backend API, o interfata web si un agent de monitorizare care ruleaza pe serverele auditate. Rezultatele verificarilor sunt centralizate, procesate si afisate intr-o aplicatie web.

## Functionalitati implementate in prezent

- autentificare utilizatori si gestionare sesiuni
- inregistrare si administrare servere monitorizate
- agent de audit functional pentru servere Linux
- executie verificari de securitate automate
- colectare metrici de sistem (CPU, memorie, disk)
- utilizare template-uri de audit bazate pe CIS Benchmarks
- vizualizare rezultate audit in interfata web
- export rapoarte in format PDF
- comunicare in timp real prin WebSocket
- rulare containerizata cu Docker Compose