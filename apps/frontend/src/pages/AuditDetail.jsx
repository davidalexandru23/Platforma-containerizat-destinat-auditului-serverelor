import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { auditApi } from '../api/audit';
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
    }, [id]);

    const loadAudit = async () => {
        try {
            setLoading(true);
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

            // header
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

            // score cards
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

            // header tabel
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

                // background alternativ
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

            // footer
            y = doc.internal.pageSize.getHeight() - 15;
            doc.setFontSize(8);
            doc.setTextColor(156, 163, 175); // #9ca3af
            doc.text(`Generat de BitTrail - ${new Date().toLocaleString('ro-RO')}`, pageWidth / 2, y, { align: 'center' });

            // download
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

    return (
        <div className="audit-detail-page" ref={reportRef}>
            {/* Breadcrumbs */}
            <nav className="breadcrumbs">
                <Link to="/">Dashboard</Link>
                <span className="separator">/</span>
                <Link to={`/servers/${audit.server?.id}`}>{audit.server?.hostname || 'Server'}</Link>
                <span className="separator">/</span>
                <span className="current">Audit #{id.slice(0, 8)}</span>
            </nav>

            {/* Header */}
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
                <div className="audit-header-actions">
                    <button className="btn btn-primary" onClick={handleExportPDF}>
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
                    {/* Score Cards */}
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

                    {/* Summary Banner */}
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

                    {/* Tabs */}
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

                    {/* Results List */}
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
                                    <div key={task.id} className="check-result-card">
                                        <div className="check-result-header">
                                            <div className="check-result-info">
                                                <span className="check-id">{task.manualCheck?.control?.controlId || 'MANUAL'}</span>
                                                <h4>{task.manualCheck?.title || 'Task Manual'}</h4>
                                            </div>
                                            <span className={`badge ${task.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}`}>
                                                {task.status}
                                            </span>
                                        </div>
                                        {task.reviewNotes && <p className="check-notes">{task.reviewNotes}</p>}
                                    </div>
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
