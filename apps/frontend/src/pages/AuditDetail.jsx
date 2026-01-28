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

        // Configurare Socket IO
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
            // Optional: actualizare in timp real, momentan doar jurnalizare
            console.log('New result:', data);
            // S-ar putea declansa actualizare partiala aici daca este necesar
        });

        socket.on('progress', (data) => {
            if (data.status === 'COMPLETED' || data.status === 'FAILED') {
                console.log('Audit finished, reloading...', data.status);
                loadAudit();
            }
        });

        // Plan de rezerva: ascultare eveniment schimbare status daca backend-ul il trimite
        socket.on('statusChange', (data) => {
            if (data.status === 'COMPLETED') {
                loadAudit();
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [id]);

    // Fallback polling: daca ruleaza, verificare la fiecare 2 secunde
    useEffect(() => {
        let interval;
        if (audit && (audit.status === 'RUNNING' || audit.status === 'PENDING')) {
            interval = setInterval(() => {
                // Actualizare silentioasa (fundal)
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
            // Nu setam loading pe true la actualizari in fundal pentru a evita palpairea UI
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

            const passCount = audit.checkResults?.filter(r => r.status === 'PASS').length || 0;
            const failCount = audit.checkResults?.filter(r => r.status === 'FAIL').length || 0;
            const errorCount = audit.checkResults?.filter(r => r.status === 'ERROR').length || 0;
            const totalChecks = audit.checkResults?.length || 0;
            const score = audit.automatedCompliancePercent?.toFixed(1) || 0;

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

            // antet tabel
            doc.setFillColor(243, 244, 246); // #f3f4f6
            doc.rect(15, y, pageWidth - 30, 8, 'F');
            doc.setFontSize(9);
            doc.setTextColor(55, 65, 81);
            doc.text('ID', 17, y + 5.5);
            doc.text('Verificare', 45, y + 5.5);
            doc.text('Status', 130, y + 5.5);
            doc.text('Output', 155, y + 5.5);
            y += 10;

            // randuri tabel
            doc.setFontSize(8);
            audit.checkResults?.forEach((r, i) => {
                if (y > 270) {
                    doc.addPage();
                    y = 20;
                }

                const rowHeight = 7;

                // fundal alternativ
                if (i % 2 === 0) {
                    doc.setFillColor(249, 250, 251);
                    doc.rect(15, y - 4, pageWidth - 30, rowHeight, 'F');
                }

                doc.setTextColor(107, 114, 128);
                const checkId = r.automatedCheck?.control?.controlId || r.automatedCheck?.checkId || '-';
                doc.text(checkId.substring(0, 8), 17, y);

                doc.setTextColor(31, 41, 55);
                const title = r.automatedCheck?.title || 'N/A';
                doc.text(title.substring(0, 45), 45, y);

                // status cu culoare
                if (r.status === 'PASS') doc.setTextColor(16, 185, 129);
                else if (r.status === 'FAIL') doc.setTextColor(239, 68, 68);
                else doc.setTextColor(245, 158, 11);
                doc.text(r.status || '-', 130, y);

                doc.setTextColor(107, 114, 128);
                const output = (r.errorMessage || r.output || '-').substring(0, 35);
                doc.text(output, 155, y);

                y += rowHeight;
            });

            // Sectiune task-uri manuale
            const manualTasks = audit.manualTaskResults || [];
            if (manualTasks.length > 0) {
                // Verificare daca este necesara o pagina noua
                if (y > 230) {
                    doc.addPage();
                    y = 20;
                }

                y += 10;
                doc.setFontSize(12);
                doc.setTextColor(55, 65, 81);
                doc.text(`Task-uri Manuale (${manualTasks.length} total)`, 15, y);
                y += 8;

                // antet tabel manual
                doc.setFillColor(243, 244, 246);
                doc.rect(15, y, pageWidth - 30, 8, 'F');
                doc.setFontSize(9);
                doc.setTextColor(55, 65, 81);
                doc.text('ID', 17, y + 5.5);
                doc.text('Task', 40, y + 5.5);
                doc.text('Status', 120, y + 5.5);
                doc.text('Comentarii', 145, y + 5.5);
                y += 10;

                // randuri task-uri manuale
                doc.setFontSize(8);
                manualTasks.forEach((task, i) => {
                    if (y > 270) {
                        doc.addPage();
                        y = 20;
                    }

                    const rowHeight = 7;

                    if (i % 2 === 0) {
                        doc.setFillColor(249, 250, 251);
                        doc.rect(15, y - 4, pageWidth - 30, rowHeight, 'F');
                    }

                    doc.setTextColor(107, 114, 128);
                    const checkId = task.manualCheck?.control?.controlId || task.manualCheck?.checkId || '-';
                    doc.text(checkId.substring(0, 10), 17, y);

                    doc.setTextColor(31, 41, 55);
                    const title = task.manualCheck?.title || 'Task Manual';
                    doc.text(title.substring(0, 40), 40, y);

                    // status cu culoare
                    const status = task.status === 'COMPLETED' ? 'PASSED' :
                        task.status === 'REJECTED' ? 'FAILED' : task.status;
                    if (task.status === 'COMPLETED') doc.setTextColor(16, 185, 129);
                    else if (task.status === 'REJECTED') doc.setTextColor(239, 68, 68);
                    else doc.setTextColor(245, 158, 11);
                    doc.text(status, 120, y);

                    doc.setTextColor(107, 114, 128);
                    const notes = (task.reviewNotes || '-').substring(0, 30);
                    doc.text(notes, 145, y);

                    y += rowHeight;
                });
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
    const passCount = audit.checkResults?.filter(r => r.status === 'PASS').length || 0;
    const failCount = audit.checkResults?.filter(r => r.status === 'FAIL').length || 0;
    const errorCount = audit.checkResults?.filter(r => r.status === 'ERROR').length || 0;
    const totalChecks = audit.checkResults?.length || 0;

    // Contoare task-uri manuale
    const manualTasks = audit.manualTaskResults || [];
    const totalManual = manualTasks.length;
    const completedManual = manualTasks.filter(t => t.status === 'COMPLETED' || t.status === 'REJECTED').length;
    const pendingManual = totalManual - completedManual;
    const allManualCompleted = totalManual > 0 && pendingManual === 0;
    const manualPassCount = manualTasks.filter(t => t.status === 'COMPLETED').length;
    const manualFailCount = manualTasks.filter(t => t.status === 'REJECTED').length;

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
                                <span className="score-value" style={{ color: getScoreColor(audit.automatedCompliancePercent) }}>
                                    {audit.automatedCompliancePercent?.toFixed(1) || 0}%
                                </span>
                                <div className="score-bar">
                                    <div className="score-bar-fill" style={{ width: `${audit.automatedCompliancePercent || 0}%`, background: getScoreColor(audit.automatedCompliancePercent) }}></div>
                                </div>
                            </div>
                        </div>

                        <div className="score-card">
                            <div className="score-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                                <span className="material-symbols-outlined">check_circle</span>
                            </div>
                            <div className="score-content">
                                <span className="score-label">Verificari Trecute</span>
                                <span className="score-value" style={{ color: 'var(--success)' }}>{passCount}</span>
                                <span className="score-desc">din {totalChecks} verificari</span>
                            </div>
                        </div>

                        <div className="score-card">
                            <div className="score-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>
                                <span className="material-symbols-outlined">cancel</span>
                            </div>
                            <div className="score-content">
                                <span className="score-label">Verificari Esuate</span>
                                <span className="score-value" style={{ color: 'var(--danger)' }}>{failCount}</span>
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
                    <div className={`summary-banner ${audit.automatedCompliancePercent >= 80 ? 'success' : audit.automatedCompliancePercent >= 50 ? 'warning' : 'danger'}`}>
                        <span className="material-symbols-outlined">
                            {audit.automatedCompliancePercent >= 80 ? 'shield_with_heart' : audit.automatedCompliancePercent >= 50 ? 'gpp_maybe' : 'gpp_bad'}
                        </span>
                        <div>
                            <strong>
                                {audit.automatedCompliancePercent >= 80
                                    ? 'Buna conformitate cu standardele de securitate!'
                                    : audit.automatedCompliancePercent >= 50
                                        ? 'Conformitate partiala - se recomanda actiuni corective'
                                        : 'Atentie! Nivel scazut de conformitate - actiuni urgente necesare'}
                            </strong>
                            <p>
                                {passCount} din {totalChecks} verificari au trecut.
                                {failCount > 0 && ` ${failCount} verificari necesita remediere.`}
                            </p>
                        </div>
                    </div>

                    {/* Tab-uri */}
                    <div className="audit-tabs">
                        <button className={`tab ${activeTab === 'automated' ? 'active' : ''}`} onClick={() => setActiveTab('automated')}>
                            <span className="material-symbols-outlined">computer</span>
                            Verificari Automate ({totalChecks})
                        </button>
                        <button className={`tab ${activeTab === 'failed' ? 'active' : ''}`} onClick={() => setActiveTab('failed')}>
                            <span className="material-symbols-outlined">warning</span>
                            Doar Esuate ({failCount})
                        </button>
                        <button className={`tab ${activeTab === 'manual' ? 'active' : ''}`} onClick={() => setActiveTab('manual')}>
                            <span className="material-symbols-outlined">person</span>
                            Task-uri Manuale ({audit.manualTaskResults?.length || 0})
                        </button>
                    </div>

                    {/* Lista Rezultate */}
                    <div className="results-container">
                        {activeTab === 'automated' && audit.checkResults?.map((result, idx) => (
                            <CheckResultCard key={result.id} result={result} expanded={expandedCheck === idx} onToggle={() => setExpandedCheck(expandedCheck === idx ? null : idx)} />
                        ))}

                        {activeTab === 'failed' && audit.checkResults?.filter(r => r.status === 'FAIL').map((result, idx) => (
                            <CheckResultCard key={result.id} result={result} expanded={expandedCheck === `fail-${idx}`} onToggle={() => setExpandedCheck(expandedCheck === `fail-${idx}` ? null : `fail-${idx}`)} />
                        ))}

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

                        {activeTab === 'failed' && failCount === 0 && (
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
    const [expanded, setExpanded] = useState(false);
    const [notes, setNotes] = useState(task.reviewNotes || '');
    const [saving, setSaving] = useState(false);

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
                    <span className="check-id">{task.manualCheck?.control?.controlId || task.manualCheck?.checkId || 'MANUAL'}</span>
                    <h4>{task.manualCheck?.title || 'Task Manual'}</h4>
                    <span className="check-category">{task.manualCheck?.control?.category || ''}</span>
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
                    {task.manualCheck?.instructions && (
                        <div className="detail-row">
                            <span className="detail-label">Instructiuni:</span>
                            <span className="detail-value">{task.manualCheck.instructions}</span>
                        </div>
                    )}

                    {/* Specificatii Dovezi */}
                    {task.manualCheck?.evidenceSpec && (
                        <div className="detail-row">
                            <span className="detail-label">Dovada acceptata:</span>
                            <span className="detail-value" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {task.manualCheck.evidenceSpec.allowUpload && <span className="badge badge-neutral">Upload fisier</span>}
                                {task.manualCheck.evidenceSpec.allowLink && <span className="badge badge-neutral">Link extern</span>}
                                {task.manualCheck.evidenceSpec.allowAttestation && <span className="badge badge-neutral">Atestare</span>}
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

                    {/* Butoane Actiune - afisare doar daca nu este deja marcat */}
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

                    {/* Afisare info revizuire si buton schimbare daca este deja marcat */}
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
    const statusClass = result.status === 'PASS' ? 'pass' : result.status === 'FAIL' ? 'fail' : 'error';

    return (
        <div className={`check-result-card ${statusClass}`} onClick={onToggle}>
            <div className="check-result-header">
                <div className="check-result-info">
                    <span className="check-id">{result.automatedCheck?.control?.controlId || result.automatedCheck?.checkId || '?'}</span>
                    <h4>{result.automatedCheck?.title || 'Verificare'}</h4>
                    <span className="check-category">{result.automatedCheck?.control?.category || ''}</span>
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
                    {result.automatedCheck?.description && (
                        <div className="detail-row">
                            <span className="detail-label">Descriere:</span>
                            <span className="detail-value">{result.automatedCheck.description}</span>
                        </div>
                    )}
                    {result.automatedCheck?.command && (
                        <div className="detail-row">
                            <span className="detail-label">Comanda:</span>
                            <code className="detail-code">{result.automatedCheck.command}</code>
                        </div>
                    )}
                    {result.automatedCheck?.expectedResult && (
                        <div className="detail-row">
                            <span className="detail-label">Rezultat Asteptat:</span>
                            <code className="detail-code">{result.automatedCheck.expectedResult}</code>
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
                    {result.automatedCheck?.onFailMessage && result.status === 'FAIL' && (
                        <div className="detail-row recommendation">
                            <span className="detail-label">Recomandare:</span>
                            <span className="detail-value">{result.automatedCheck.onFailMessage}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default AuditDetail;

