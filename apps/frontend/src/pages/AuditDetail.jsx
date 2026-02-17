import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { auditApi } from '../api/audit';
import { io } from 'socket.io-client';
import './AuditDetail.css';

function AuditDetail() {
    const { id } = useParams();
    const [audit, setAudit] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('automated');
    const [expandedCheck, setExpandedCheck] = useState(null);
    const reportRef = useRef(null);

    useEffect(() => {
        loadAudit();

        // configurare socket io
        const token = localStorage.getItem('token');
        const socket = io(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/ws/audit`, {
            transports: ['websocket'],
            query: { token: token }
        });

        socket.on('connect', () => {
            console.log('Connected to audit websocket');
            socket.emit('subscribe', { auditRunId: id });
        });

        socket.on('checkResult', (data) => {
            // actualizare in timp real
            console.log('New result:', data);
        });

        socket.on('progress', (data) => {
            if (data.status === 'COMPLETED' || data.status === 'FAILED') {
                console.log('Audit finished, reloading...', data.status);
                loadAudit();
            }
        });

        // fallback: ascultare schimbare status
        socket.on('statusChange', (data) => {
            if (data.status === 'COMPLETED') {
                loadAudit();
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [id]);

    // fallback polling: verificare la 2 secunde
    useEffect(() => {
        let interval;
        if (audit && (audit.status === 'RUNNING' || audit.status === 'PENDING')) {
            interval = setInterval(() => {
                // actualizare silentioasa (fundal)
                auditApi.getById(id).then(data => {
                    if (data.status !== audit.status) {
                        setAudit(data);
                    }
                    if (data.status === 'COMPLETED' || data.status === 'FAILED') {
                        clearInterval(interval);
                    }
                }).catch(console.error);
            }, 2000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [audit, id]);

    const loadAudit = async () => {
        try {
            // nu activam loading la actualizari fundal
            if (!audit) setLoading(true);

            const data = await auditApi.getById(id);
            setAudit(data);
        } catch (err) {
            setError('Eroare la incarcarea detaliilor auditului');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleExportPDF = async () => {
        if (!audit) return;

        try {
            const { jsPDF } = await import('jspdf');

            const totalAutomated = audit.checkResults?.length || 0;
            const totalManual = audit.manualTaskResults?.length || 0;
            const totalChecks = totalAutomated + totalManual;

            const passAutomated = audit.checkResults?.filter(r => r?.status === 'PASS').length || 0;
            const passManual = audit.manualTaskResults?.filter(r => r?.status === 'COMPLETED').length || 0;
            const passCount = passAutomated + passManual;
            const totalPassed = passCount;

            const failAutomated = audit.checkResults?.filter(r => r?.status === 'FAIL').length || 0;
            const failManual = audit.manualTaskResults?.filter(r => r?.status === 'REJECTED').length || 0;
            const failCount = failAutomated + failManual;

            const errorCount = audit.checkResults?.filter(r => r?.status === 'ERROR').length || 0;

            const score = totalChecks > 0 ? ((totalPassed / totalChecks) * 100).toFixed(1) : 0;

            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            let y = 20;

            // antet
            doc.setFontSize(20);
            doc.setTextColor(14, 116, 144); // #0e7490
            doc.text('Raport Audit de Securitate', pageWidth / 2, y, { align: 'center' });
            y += 10;

            doc.setFontSize(11);
            doc.setTextColor(107, 114, 128); // #6b7280
            doc.text(`${audit.templateVersion?.template?.name || 'Template'} v${audit.templateVersion?.version || '1.0'}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            doc.text(`Server: ${audit.server?.hostname || 'N/A'} | IP: ${audit.server?.ipAddress || 'N/A'}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            doc.text(`Data: ${new Date(audit.createdAt).toLocaleString('ro-RO')}`, pageWidth / 2, y, { align: 'center' });
            y += 15;

            // carduri scor
            const cardWidth = 45;
            const cardStartX = (pageWidth - cardWidth * 4 - 15) / 2;

            const drawScoreCard = (x, label, value, color) => {
                doc.setDrawColor(229, 231, 235);
                doc.setLineWidth(0.5);
                doc.roundedRect(x, y, cardWidth, 25, 3, 3);

                doc.setFontSize(8);
                doc.setTextColor(107, 114, 128);
                doc.text(label, x + cardWidth / 2, y + 8, { align: 'center' });

                doc.setFontSize(18);
                doc.setTextColor(...color);
                doc.text(String(value), x + cardWidth / 2, y + 20, { align: 'center' });
            };

            drawScoreCard(cardStartX, 'SCOR', `${score}%`, score >= 80 ? [16, 185, 129] : score >= 50 ? [245, 158, 11] : [239, 68, 68]);
            drawScoreCard(cardStartX + cardWidth + 5, 'PASS', String(passCount), [16, 185, 129]);
            drawScoreCard(cardStartX + (cardWidth + 5) * 2, 'FAIL', String(failCount), [239, 68, 68]);
            drawScoreCard(cardStartX + (cardWidth + 5) * 3, 'ERORI', String(errorCount), [245, 158, 11]);
            y += 35;

            // titlu sectiune
            doc.setFontSize(12);
            doc.setTextColor(55, 65, 81); // #374151
            doc.text(`Detalii Verificari (${totalChecks} total)`, 15, y);
            y += 8;

            // Configurare coloane - Latime totala disponibila aprox 180 (210 - 15 - 15)
            const colWidths = {
                id: 20,
                check: 80,
                status: 25,
                output: 55
            };
            const colX = {
                id: 15,
                check: 35,
                status: 115,
                output: 140
            };

            // antet tabel
            doc.setFillColor(243, 244, 246); // #f3f4f6
            doc.rect(15, y, pageWidth - 30, 8, 'F');
            doc.setFontSize(9);
            doc.setTextColor(55, 65, 81);
            doc.text('ID', colX.id + 2, y + 5.5);
            doc.text('Verificare', colX.check + 2, y + 5.5);
            doc.text('Status', colX.status + 2, y + 5.5);
            doc.text('Output', colX.output + 2, y + 5.5);
            y += 10;

            // randuri tabel
            doc.setFontSize(8);

            const drawTableContent = (items, isManual = false) => {
                items.forEach((r, i) => {
                    // Pregatire date
                    let idText, titleText, statusText, outputText, notesText;
                    let statusColor = [107, 114, 128]; // Default gray

                    if (!isManual) {
                        // Automated Check
                        idText = (r.automatedCheck?.control?.controlId || r.automatedCheck?.checkId || '-').substring(0, 8);
                        titleText = r.automatedCheck?.title || 'N/A';
                        statusText = r.status || '-';
                        outputText = r.errorMessage || r.output || '-';

                        if (r.status === 'PASS') statusColor = [16, 185, 129];
                        else if (r.status === 'FAIL') statusColor = [239, 68, 68];
                        else statusColor = [245, 158, 11];

                    } else {
                        // Manual Task
                        idText = (r.manualCheck?.control?.controlId || r.manualCheck?.checkId || '-').substring(0, 10);
                        titleText = r.manualCheck?.title || 'Task Manual';
                        statusText = r.status === 'COMPLETED' ? 'PASSED' : r.status === 'REJECTED' ? 'FAILED' : r.status;
                        notesText = r.reviewNotes || '-';
                        outputText = notesText; // Refolosim logica de output pt comentarii

                        if (r.status === 'COMPLETED') statusColor = [16, 185, 129];
                        else if (r.status === 'REJECTED') statusColor = [239, 68, 68];
                        else statusColor = [245, 158, 11];
                    }

                    // Calcul inaltimi dinamice
                    const idLines = doc.splitTextToSize(idText, colWidths.id - 2);
                    const titleLines = doc.splitTextToSize(titleText, colWidths.check - 4);
                    const statusLines = doc.splitTextToSize(statusText, colWidths.status - 2);
                    const outputLines = doc.splitTextToSize(outputText, colWidths.output - 2);

                    const maxLines = Math.max(idLines.length, titleLines.length, statusLines.length, outputLines.length);
                    const lineHeight = 4; // Inaltime per linie text
                    const padding = 4; // Spatiere sus/jos
                    const rowHeight = (maxLines * lineHeight) + padding;

                    // Verificare Page Break
                    if (y + rowHeight > 280) {
                        doc.addPage();
                        y = 20;
                        // Re-desenare header tabel (optional, dar util)
                        if (isManual) {
                            doc.setFontSize(12);
                            doc.setTextColor(55, 65, 81);
                            doc.text(`Task-uri Manuale (continuare)`, 15, y);
                            y += 8;
                        }

                        doc.setFillColor(243, 244, 246);
                        doc.rect(15, y, pageWidth - 30, 8, 'F');
                        doc.setFontSize(9);
                        doc.setTextColor(55, 65, 81);
                        doc.text('ID', colX.id + 2, y + 5.5);
                        doc.text(isManual ? 'Task' : 'Verificare', colX.check + 2, y + 5.5);
                        doc.text('Status', colX.status + 2, y + 5.5);
                        doc.text(isManual ? 'Comentarii' : 'Output', colX.output + 2, y + 5.5);
                        y += 10;
                        doc.setFontSize(8);
                    }

                    // Fundal alternativ
                    if (i % 2 === 0) {
                        doc.setFillColor(249, 250, 251);
                        doc.rect(15, y, pageWidth - 30, rowHeight, 'F');
                    }

                    // Desenare text
                    doc.setTextColor(107, 114, 128);
                    doc.text(idLines, colX.id + 2, y + 4);

                    doc.setTextColor(31, 41, 55);
                    doc.text(titleLines, colX.check + 2, y + 4);

                    doc.setTextColor(...statusColor);
                    doc.text(statusLines, colX.status + 2, y + 4);

                    doc.setTextColor(107, 114, 128);
                    doc.text(outputLines, colX.output + 2, y + 4);

                    // Linie delimitare (optional)
                    // doc.setDrawColor(229, 231, 235);
                    // doc.line(15, y + rowHeight, pageWidth - 15, y + rowHeight);

                    y += rowHeight;
                });
            };

            if (audit.checkResults?.length > 0) {
                drawTableContent(audit.checkResults, false);
            }

            // Sectiune task-uri manuale
            const manualTasks = audit.manualTaskResults || [];
            if (manualTasks.length > 0) {
                // Verificare daca este necesara o pagina noua pentru titlu
                if (y > 250) {
                    doc.addPage();
                    y = 20;
                } else {
                    y += 10;
                }

                doc.setFontSize(12);
                doc.setTextColor(55, 65, 81);
                doc.text(`Task-uri Manuale (${manualTasks.length} total)`, 15, y);
                y += 8;

                // antet tabel manual
                doc.setFillColor(243, 244, 246);
                doc.rect(15, y, pageWidth - 30, 8, 'F');
                doc.setFontSize(9);
                doc.setTextColor(55, 65, 81);
                doc.text('ID', colX.id + 2, y + 5.5);
                doc.text('Task', colX.check + 2, y + 5.5);
                doc.text('Status', colX.status + 2, y + 5.5);
                doc.text('Comentarii', colX.output + 2, y + 5.5);
                y += 10;

                // randuri task-uri manuale folosind functia comuna
                doc.setFontSize(8);
                drawTableContent(manualTasks, true);
            }

            // subsol
            y = doc.internal.pageSize.getHeight() - 15;
            doc.setFontSize(8);
            doc.setTextColor(156, 163, 175); // #9ca3af
            doc.text(`Generat de BitTrail - ${new Date().toLocaleString('ro-RO')}`, pageWidth / 2, y, { align: 'center' });

            // descarcare
            const fileName = `Audit_${audit.server?.hostname || 'report'}_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);
        } catch (err) {
            console.error('PDF export failed:', err);
            alert('Eroare la generarea PDF-ului: ' + err.message);
        }
    };

    const getScoreClass = (score) => {
        if (score >= 80) return 'pass';
        if (score >= 50) return 'warn';
        return 'fail';
    };

    const getScoreColor = (score) => {
        if (score >= 80) return 'var(--success)';
        if (score >= 50) return 'var(--warning)';
        return 'var(--danger)';
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleString('ro-RO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="audit-detail-page">
                <div className="empty-state">
                    <div className="spinner"></div>
                    <p>Se incarca datele auditului...</p>
                </div>
            </div>
        );
    }

    if (error || !audit) {
        return (
            <div className="audit-detail-page">
                <div className="alert alert-danger">{error || 'Auditul nu a fost gasit'}</div>
                <Link to="/servers" className="btn btn-secondary" style={{ marginTop: '1rem' }}>Inapoi la Servere</Link>
            </div>
        );
    }

    const isRunning = audit.status === 'RUNNING' || audit.status === 'PENDING';
    const totalAutomated = audit.checkResults?.length || 0;
    const totalManual = audit.manualTaskResults?.length || 0;
    const totalChecks = totalAutomated + totalManual;

    // Contoare
    const passAutomated = audit.checkResults?.filter(r => r?.status === 'PASS')?.length || 0;
    const passManual = audit.manualTaskResults?.filter(r => r?.status === 'COMPLETED')?.length || 0;
    const totalPassed = passAutomated + passManual;

    const failAutomated = audit.checkResults?.filter(r => r?.status === 'FAIL')?.length || 0;
    const failManual = audit.manualTaskResults?.filter(r => r?.status === 'REJECTED')?.length || 0;
    const totalFailed = failAutomated + failManual;

    const errorCount = audit.checkResults?.filter(r => r?.status === 'ERROR')?.length || 0;

    // Calcul scor combinat
    const combinedScore = totalChecks > 0 ? (totalPassed / totalChecks) * 100 : 0;

    // Alias-uri pentru afisare progres sarcini manuale
    const completedManual = passManual;
    const allManualCompleted = totalManual > 0 && completedManual === totalManual;

    return (
        <div className="audit-detail-page" ref={reportRef}>
            {/* Navigare */}
            <nav className="breadcrumbs">
                <Link to="/">Dashboard</Link>
                <span className="separator">/</span>
                <Link to={`/servers/${audit.server?.id}`}>{audit.server?.hostname || 'Server'}</Link>
                <span className="separator">/</span>
                <span className="current">Audit #{id.slice(0, 8)}</span>
            </nav>

            {/* Antet */}
            <div className="audit-header">
                <div className="audit-header-info">
                    <h1>
                        Rezultate Audit
                        <span className={`badge ${audit.status === 'COMPLETED' ? 'badge-success' : audit.status === 'RUNNING' ? 'badge-warning' : 'badge-neutral'}`}>
                            {audit.status}
                        </span>
                    </h1>
                    <div className="audit-meta">
                        <span><strong>Template:</strong> {audit.templateVersion?.template?.name || 'N/A'} v{audit.templateVersion?.version}</span>
                        <span className="divider">•</span>
                        <span><strong>Server:</strong> {audit.server?.hostname}</span>
                        <span className="divider">•</span>
                        <span><strong>Data:</strong> {formatDate(audit.createdAt)}</span>
                    </div>
                </div>
                <div className="audit-header-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {/* Indicator progres task-uri manuale */}
                    {totalManual > 0 && !isRunning && (
                        <div style={{
                            padding: '0.5rem 1rem',
                            background: allManualCompleted ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: allManualCompleted ? 'var(--success)' : 'var(--warning)' }}>
                                {allManualCompleted ? 'task_alt' : 'pending_actions'}
                            </span>
                            <span>
                                Task-uri: <strong>{completedManual}/{totalManual}</strong>
                                {allManualCompleted && <span style={{ color: 'var(--success)', marginLeft: '0.5rem' }}>✓ Complet</span>}
                            </span>
                        </div>
                    )}
                    <button
                        className="btn btn-primary"
                        onClick={handleExportPDF}
                        disabled={isRunning}
                        title={isRunning ? "Finalizati auditul pentru a exporta" : "Exporta raport PDF"}
                        style={isRunning ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                    >
                        <span className="material-symbols-outlined">picture_as_pdf</span>
                        Export PDF
                    </button>
                </div>
            </div>

            {isRunning ? (
                <div className="running-state">
                    <div className="running-spinner"></div>
                    <h2>Audit in desfasurare</h2>
                    <p>Agentul ruleaza verificarile de securitate. Acest proces poate dura cateva minute.</p>
                    <div className="progress-bar-container">
                        <div className="progress-bar-animated"></div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Carduri Scor */}
                    <div className="score-grid">
                        <div className="score-card">
                            <div className="score-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                                <span className="material-symbols-outlined">verified</span>
                            </div>
                            <div className="score-content">
                                <span className="score-label">Scor Conformitate</span>
                                <span className="score-value" style={{ color: getScoreColor(combinedScore) }}>
                                    {combinedScore.toFixed(1)}%
                                </span>
                                <div className="score-bar">
                                    <div className="score-bar-fill" style={{ width: `${combinedScore}%`, background: getScoreColor(combinedScore) }}></div>
                                </div>
                            </div>
                        </div>

                        <div className="score-card">
                            <div className="score-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                                <span className="material-symbols-outlined">check_circle</span>
                            </div>
                            <div className="score-content">
                                <span className="score-label">Verificari Trecute</span>
                                <span className="score-value" style={{ color: 'var(--success)' }}>{totalPassed}</span>
                                <span className="score-desc">din {totalChecks} verificari</span>
                            </div>
                        </div>

                        <div className="score-card">
                            <div className="score-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>
                                <span className="material-symbols-outlined">cancel</span>
                            </div>
                            <div className="score-content">
                                <span className="score-label">Verificari Esuate</span>
                                <span className="score-value" style={{ color: 'var(--danger)' }}>{totalFailed}</span>
                                <span className="score-desc">necesita atentie</span>
                            </div>
                        </div>

                        <div className="score-card">
                            <div className="score-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' }}>
                                <span className="material-symbols-outlined">error</span>
                            </div>
                            <div className="score-content">
                                <span className="score-label">Erori Executie</span>
                                <span className="score-value" style={{ color: 'var(--warning)' }}>{errorCount}</span>
                                <span className="score-desc">de verificat</span>
                            </div>
                        </div>
                    </div>

                    {/* Banner Sumar */}
                    <div className={`summary-banner ${combinedScore >= 80 ? 'success' : combinedScore >= 50 ? 'warning' : 'danger'}`}>
                        <span className="material-symbols-outlined">
                            {combinedScore >= 80 ? 'shield_with_heart' : combinedScore >= 50 ? 'gpp_maybe' : 'gpp_bad'}
                        </span>
                        <div>
                            <strong>
                                {combinedScore >= 80
                                    ? 'Buna conformitate cu standardele de securitate!'
                                    : combinedScore >= 50
                                        ? 'Conformitate partiala - se recomanda actiuni corective'
                                        : 'Atentie! Nivel scazut de conformitate - actiuni urgente necesare'}
                            </strong>
                            <p>
                                {totalPassed} din {totalChecks} verificari au trecut.
                                {totalFailed > 0 && ` ${totalFailed} verificari necesita remediere.`}
                            </p>
                        </div>
                    </div>

                    {/* Tab-uri */}
                    <div className="audit-tabs">
                        <button className={`tab ${activeTab === 'automated' ? 'active' : ''}`} onClick={() => setActiveTab('automated')}>
                            <span className="material-symbols-outlined">computer</span>
                            Verificari Automate ({totalAutomated})
                        </button>
                        <button className={`tab ${activeTab === 'failed' ? 'active' : ''}`} onClick={() => setActiveTab('failed')}>
                            <span className="material-symbols-outlined">warning</span>
                            Doar Esuate ({totalFailed})
                        </button>
                        <button className={`tab ${activeTab === 'manual' ? 'active' : ''}`} onClick={() => setActiveTab('manual')}>
                            <span className="material-symbols-outlined">person</span>
                            Task-uri Manuale ({totalManual})
                        </button>
                    </div>

                    {/* Lista Rezultate */}
                    <div className="results-container">
                        {activeTab === 'automated' && audit.checkResults?.map((result, idx) => (
                            <CheckResultCard key={result.id} result={result} expanded={expandedCheck === idx} onToggle={() => setExpandedCheck(expandedCheck === idx ? null : idx)} />
                        ))}

                        {activeTab === 'failed' && (
                            <>
                                {audit.checkResults?.filter(r => r?.status === 'FAIL')?.map((result, idx) => (
                                    <CheckResultCard key={result?.id || idx} result={result} expanded={expandedCheck === `fail-${idx}`} onToggle={() => setExpandedCheck(expandedCheck === `fail-${idx}` ? null : `fail-${idx}`)} />
                                ))}
                                {audit.manualTaskResults?.filter(t => t?.status === 'REJECTED')?.map((task, idx) => (
                                    <ManualTaskCard
                                        key={task?.id || idx}
                                        task={task}
                                        auditRunId={audit.id}
                                        onUpdate={loadAudit}
                                    />
                                ))}
                            </>
                        )}

                        {activeTab === 'manual' && (
                            audit.manualTaskResults?.length > 0 ? (
                                audit.manualTaskResults.map((task) => (
                                    <ManualTaskCard
                                        key={task.id}
                                        task={task}
                                        auditRunId={audit.id}
                                        onUpdate={loadAudit}
                                    />
                                ))
                            ) : (
                                <div className="empty-state-small">
                                    <span className="material-symbols-outlined">assignment</span>
                                    <p>Nu exista task-uri manuale pentru acest audit.</p>
                                </div>
                            )
                        )}

                        {activeTab === 'failed' && totalFailed === 0 && (
                            <div className="empty-state-small success">
                                <span className="material-symbols-outlined">celebration</span>
                                <p>Excelent! Toate verificarile au trecut.</p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function ManualTaskCard({ task, auditRunId, onUpdate }) {
    if (!task) return null;

    const [expanded, setExpanded] = useState(false);
    const [notes, setNotes] = useState(task.reviewNotes || '');
    const [saving, setSaving] = useState(false);

    const manualCheck = task.manualCheck || {};
    const control = manualCheck.control || {};
    const evidenceSpec = manualCheck.evidenceSpec || {};

    const handleMark = async (approved) => {
        setSaving(true);
        try {
            await auditApi.approveTask(auditRunId, task.id, approved, notes);
            onUpdate(); // refresh audit data
        } catch (err) {
            console.error('Failed to update task:', err);
            alert('Eroare la actualizarea task-ului');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!confirm('Esti sigur ca vrei sa schimbi rezultatul? Statusul va fi resetat la PENDING.')) return;
        setSaving(true);
        try {
            await auditApi.resetTask(auditRunId, task.id);
            onUpdate();
        } catch (err) {
            console.error('Failed to reset task:', err);
            alert('Eroare la resetarea task-ului');
        } finally {
            setSaving(false);
        }
    };

    const statusClass = task.status === 'COMPLETED' ? 'pass' :
        task.status === 'REJECTED' ? 'fail' :
            task.status === 'IN_PROGRESS' ? 'warn' : '';

    const getStatusLabel = () => {
        switch (task.status) {
            case 'COMPLETED': return 'PASSED';
            case 'REJECTED': return 'FAILED';
            case 'IN_PROGRESS': return 'IN REVIEW';
            case 'NOT_APPLICABLE': return 'N/A';
            default: return 'PENDING';
        }
    };

    return (
        <div className={`check-result-card ${statusClass}`}>
            <div className="check-result-header" onClick={() => setExpanded(!expanded)}>
                <div className="check-result-info">
                    <span className="check-id">{control.controlId || manualCheck.checkId || 'MANUAL'}</span>
                    <h4>{manualCheck.title || 'Task Manual'}</h4>
                    <span className="check-category">{control.category || ''}</span>
                </div>
                <div className="check-result-status">
                    <span className={`badge badge-${statusClass || 'warning'}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                            {task.status === 'COMPLETED' ? 'check' : task.status === 'REJECTED' ? 'close' : 'pending'}
                        </span>
                        {getStatusLabel()}
                    </span>
                    <span className="expand-icon material-symbols-outlined">
                        {expanded ? 'expand_less' : 'expand_more'}
                    </span>
                </div>
            </div>

            {expanded && (
                <div className="check-result-details">
                    {/* Instructiuni */}
                    {manualCheck.instructions && (
                        <div className="detail-row">
                            <span className="detail-label">Instructiuni:</span>
                            <span className="detail-value">{manualCheck.instructions}</span>
                        </div>
                    )}

                    {/* Specificatii Dovezi */}
                    {(evidenceSpec.allowUpload || evidenceSpec.allowLink || evidenceSpec.allowAttestation) && (
                        <div className="detail-row">
                            <span className="detail-label">Dovada acceptata:</span>
                            <span className="detail-value" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {evidenceSpec.allowUpload && <span className="badge badge-neutral">Upload fisier</span>}
                                {evidenceSpec.allowLink && <span className="badge badge-neutral">Link extern</span>}
                                {evidenceSpec.allowAttestation && <span className="badge badge-neutral">Atestare</span>}
                            </span>
                        </div>
                    )}

                    {/* Dovezi Existente */}
                    {task.evidence?.length > 0 && (
                        <div className="detail-row">
                            <span className="detail-label">Dovezi incarcate:</span>
                            <span className="detail-value">{task.evidence.length} fisier(e)</span>
                        </div>
                    )}

                    {/* Intrare Note */}
                    <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                        <span className="detail-label" style={{ marginBottom: '0.5rem' }}>Comentarii auditor:</span>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Adauga comentarii despre aceasta verificare..."
                            disabled={task.status === 'COMPLETED' || task.status === 'REJECTED'}
                            style={{
                                width: '100%',
                                minHeight: '80px',
                                padding: '0.75rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                fontFamily: 'inherit',
                                fontSize: '0.875rem',
                                resize: 'vertical',
                                background: task.status === 'COMPLETED' || task.status === 'REJECTED' ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                            }}
                        />
                    </div>

                    {/* Butoane Actiune (daca nu este marcat) */}
                    {task.status !== 'COMPLETED' && task.status !== 'REJECTED' && (
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                            <button
                                className="btn"
                                onClick={(e) => { e.stopPropagation(); handleMark(false); }}
                                disabled={saving}
                                style={{
                                    background: 'var(--danger)',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                                {saving ? 'Se salveaza...' : 'Marcheaza FAILED'}
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={(e) => { e.stopPropagation(); handleMark(true); }}
                                disabled={saving}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check</span>
                                {saving ? 'Se salveaza...' : 'Marcheaza PASSED'}
                            </button>
                        </div>
                    )}

                    {/* Info revizuire si resetare */}
                    {(task.status === 'COMPLETED' || task.status === 'REJECTED') && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                            {task.reviewedAt && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '14px', marginRight: '0.25rem' }}>schedule</span>
                                    Marcat la {new Date(task.reviewedAt).toLocaleString('ro-RO')}
                                </div>
                            )}
                            <button
                                className="btn"
                                onClick={(e) => { e.stopPropagation(); handleReset(); }}
                                disabled={saving}
                                style={{
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontSize: '0.8rem',
                                    padding: '0.5rem 1rem',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>refresh</span>
                                Schimba rezultat
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function CheckResultCard({ result, expanded, onToggle }) {
    if (!result) return null;

    const automatedCheck = result.automatedCheck || {};
    const control = automatedCheck.control || {};

    const statusClass = result.status === 'PASS' ? 'pass' : result.status === 'FAIL' ? 'fail' : 'error';

    return (
        <div className={`check-result-card ${statusClass}`} onClick={onToggle}>
            <div className="check-result-header">
                <div className="check-result-info">
                    <span className="check-id">{control.controlId || automatedCheck.checkId || '?'}</span>
                    <h4>{automatedCheck.title || 'Verificare'}</h4>
                    <span className="check-category">{control.category || ''}</span>
                </div>
                <div className="check-result-status">
                    <span className={`badge badge-${statusClass}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                            {result.status === 'PASS' ? 'check' : result.status === 'FAIL' ? 'close' : 'warning'}
                        </span>
                        {result.status}
                    </span>
                    <span className="expand-icon material-symbols-outlined">
                        {expanded ? 'expand_less' : 'expand_more'}
                    </span>
                </div>
            </div>

            {expanded && (
                <div className="check-result-details">
                    {automatedCheck.description && (
                        <div className="detail-row">
                            <span className="detail-label">Descriere:</span>
                            <span className="detail-value">{automatedCheck.description}</span>
                        </div>
                    )}
                    {automatedCheck.command && (
                        <div className="detail-row">
                            <span className="detail-label">Comanda:</span>
                            <code className="detail-code">{automatedCheck.command}</code>
                        </div>
                    )}
                    {automatedCheck.expectedResult && (
                        <div className="detail-row">
                            <span className="detail-label">Rezultat Asteptat:</span>
                            <code className="detail-code">{automatedCheck.expectedResult}</code>
                        </div>
                    )}
                    {result.output && (
                        <div className="detail-row">
                            <span className="detail-label">Output Agent:</span>
                            <pre className="detail-output">{result.output}</pre>
                        </div>
                    )}
                    {result.errorMessage && (
                        <div className="detail-row error">
                            <span className="detail-label">Eroare:</span>
                            <pre className="detail-output error">{result.errorMessage}</pre>
                        </div>
                    )}
                    {automatedCheck.onFailMessage && result.status === 'FAIL' && (
                        <div className="detail-row recommendation">
                            <span className="detail-label">Recomandare:</span>
                            <span className="detail-value">{automatedCheck.onFailMessage}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default AuditDetail;
