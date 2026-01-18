import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import './ServerDetail.css';

function ServerDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [server, setServer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [copied, setCopied] = useState(false);

    // state audit
    const [audits, setAudits] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [runningAudit, setRunningAudit] = useState(false);
    const [auditError, setAuditError] = useState(null);

    useEffect(() => {
        loadServer();
        loadAudits();
        loadTemplates();
    }, [id]);

    const loadServer = async () => {
        try {
            const [serverRes, metricsRes, inventoryRes] = await Promise.all([
                api.get(`/servers/${id}`),
                api.get(`/servers/${id}/metrics/latest`),
                api.get(`/servers/${id}/inventory/latest`)
            ]);

            setServer({
                ...serverRes.data,
                metrics: metricsRes.data,
                inventory: inventoryRes.data
            });
        } catch (error) {
            console.error('Error loading server data:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadAudits = async () => {
        try {
            const response = await api.get(`/servers/${id}/audits`);
            setAudits(response.data || []);
        } catch (error) {
            console.error('Error loading audits:', error);
        }
    };

    const loadTemplates = async () => {
        try {
            const response = await api.get('/templates');
            setTemplates(response.data || []);
        } catch (error) {
            console.error('Error loading templates:', error);
        }
    };

    const handleRunAudit = async () => {
        if (!selectedTemplate) return;

        setRunningAudit(true);
        setAuditError(null);
        try {
            const response = await api.post('/audit/run', {
                serverId: id,
                templateId: selectedTemplate
            });
            setShowAuditModal(false);
            // reincarca audituri si redirect
            loadAudits();
            navigate(`/audit/${response.data.auditRun.id}`);
        } catch (error) {
            console.error('Error starting audit:', error);
            setAuditError(error.response?.data?.message || 'Eroare la pornirea auditului');
        } finally {
            setRunningAudit(false);
        }
    };

    const handleRegenerateToken = async () => {
        if (!window.confirm('Esti sigur ca vrei sa regenerezi token-ul? Cel vechi va deveni invalid.')) return;

        try {
            const response = await api.post(`/servers/${id}/enrollToken`);
            // update server local cu token nou
            setServer(prev => ({
                ...prev,
                agentIdentity: {
                    ...prev.agentIdentity,
                    enrollToken: response.data.enrollToken
                }
            }));
            alert('Token regenerat cu succes!');
        } catch (error) {
            console.error('Error regenerating token:', error);
            alert('Eroare la regenerarea token-ului.');
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const formatUptime = (seconds) => {
        if (!seconds) return 'N/A';
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${mins}m`;
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleString('ro-RO');
    };

    const getScoreColor = (score) => {
        if (score >= 90) return 'var(--success)';
        if (score >= 70) return 'var(--warning)';
        return 'var(--danger)';
    };

    if (loading) {
        return (
            <div className="server-detail-page">
                <div className="empty-state">
                    <div className="spinner"></div>
                    <p>Se incarca datele serverului...</p>
                </div>
            </div>
        );
    }

    if (!server) {
        return (
            <div className="server-detail-page">
                <div className="empty-state">
                    <span className="material-symbols-outlined">error</span>
                    <p>Serverul nu a fost gasit.</p>
                    <Link to="/servers" className="btn btn-primary">Inapoi la Servere</Link>
                </div>
            </div>
        );
    }

    const isActive = server.status === 'ONLINE' || server.status === 'online';
    const hasAgent = !!server.agentIdentity;
    const enrollToken = server.agentIdentity?.enrollToken;
    const enrollCommand = `./bittrail-agent enroll --token ${enrollToken || 'TOKEN'} --server ${window.location.origin}`;

    return (
        <div className="server-detail-page">
            {/* Breadcrumbs */}
            <nav className="breadcrumbs">
                <Link to="/">Dashboard</Link>
                <span className="separator">/</span>
                <Link to="/servers">Servere</Link>
                <span className="separator">/</span>
                <span className="current">{server.hostname}</span>
            </nav>

            {/* Server Header */}
            <div className="server-header">
                <div className="server-header-row">
                    <div>
                        <div className="server-title-group">
                            <h1>{server.hostname}</h1>
                            {isActive && (
                                <div className="live-badge">
                                    <div className="dot"></div>
                                    Live
                                </div>
                            )}
                        </div>
                        <div className="server-meta">
                            <span>
                                <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>schedule</span>
                                Uptime: {formatUptime(server.inventory?.osInfo?.uptime)}
                            </span>
                            <span className="divider"></span>
                            <span>IP: {server.ipAddress || server.ip || 'N/A'}</span>
                            <span className="divider"></span>
                            <span>AG: v{server.agentIdentity?.version || 'N/A'}</span>
                        </div>
                    </div>
                    <div className="server-actions">
                        <button
                            className="btn btn-secondary"
                            onClick={() => setActiveTab('audits')}
                        >
                            <span className="material-symbols-outlined">history</span>
                            Istoric Audituri
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowAuditModal(true)}
                        >
                            <span className="material-symbols-outlined">play_arrow</span>
                            Ruleaza Audit
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    Overview
                </button>
                <button
                    className={`tab ${activeTab === 'audits' ? 'active' : ''}`}
                    onClick={() => setActiveTab('audits')}
                >
                    Istoric Audituri
                </button>
                <button
                    className={`tab ${activeTab === 'inventory' ? 'active' : ''}`}
                    onClick={() => setActiveTab('inventory')}
                >
                    Configuratie
                </button>
                <button
                    className={`tab ${activeTab === 'enrollment' ? 'active' : ''}`}
                    onClick={() => setActiveTab('enrollment')}
                >
                    Enrollment
                </button>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
                {activeTab === 'overview' && (
                    <div className="metrics-grid">
                        {/* Metrics content same as before but ensured safety access */}
                        <div className="metric-card">
                            <div className="metric-header">
                                <div>
                                    <p className="metric-label">CPU Load</p>
                                    <h3 className="metric-value">
                                        {server.metrics?.cpuPercent?.toFixed(1) || '0'}<span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>%</span>
                                    </h3>
                                </div>
                                <span className="metric-change positive">
                                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>trending_down</span>
                                    Stabil
                                </span>
                            </div>
                            <div className="metric-chart">
                                <div className="progress" style={{ height: '100%', borderRadius: '8px' }}>
                                    <div
                                        className="progress-bar progress-bar-primary"
                                        style={{ width: `${server.metrics?.cpuPercent || 0}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-header">
                                <div>
                                    <p className="metric-label">Memorie</p>
                                    <h3 className="metric-value">
                                        {((server.metrics?.memUsedBytes || 0) / 1024 / 1024 / 1024).toFixed(1)}
                                        <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>GB</span>
                                    </h3>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        din {((server.metrics?.memTotalBytes || 0) / 1024 / 1024 / 1024).toFixed(0)}GB
                                    </p>
                                </div>
                            </div>
                            <div className="metric-chart">
                                <div className="progress" style={{ height: '100%', borderRadius: '8px' }}>
                                    <div
                                        className="progress-bar progress-bar-warning"
                                        style={{ width: `${(Number(server.metrics?.memUsedBytes || 0) / Number(server.metrics?.memTotalBytes || 1)) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-header">
                                <div>
                                    <p className="metric-label">Disk I/O</p>
                                    <h3 className="metric-value">
                                        {((server.metrics?.diskUsedBytes || 0) / 1024 / 1024 / 1024).toFixed(1)}<span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>GB</span>
                                    </h3>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Used
                                    </p>
                                </div>
                            </div>
                            <div className="metric-chart">
                                <div className="progress" style={{ height: '100%', borderRadius: '8px' }}>
                                    <div
                                        className="progress-bar progress-bar-primary"
                                        style={{ width: `${(Number(server.metrics?.diskUsedBytes || 0) / Number(server.metrics?.diskTotalBytes || 1)) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-header">
                                <div>
                                    <p className="metric-label">Network</p>
                                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                                        <div>
                                            <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>In</span>
                                            <p style={{ fontSize: '1.125rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                                                {((server.metrics?.netInBytes || 0) / 1024 / 1024).toFixed(1)}
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mb</span>
                                            </p>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Out</span>
                                            <p style={{ fontSize: '1.125rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                                                {((server.metrics?.netOutBytes || 0) / 1024 / 1024).toFixed(1)}
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mb</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'audits' && (
                    <div className="audits-section">
                        {audits.length === 0 ? (
                            <div className="empty-state">
                                <span className="material-symbols-outlined">assignment_turned_in</span>
                                <p>Nu exista audituri rulate pe acest server.</p>
                                <button className="btn btn-primary" onClick={() => setShowAuditModal(true)}>
                                    Porneste primul Audit
                                </button>
                            </div>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Status</th>
                                        <th>Template</th>
                                        <th>Data</th>
                                        <th>Scor Automat</th>
                                        <th>Scor Manual</th>
                                        <th style={{ textAlign: 'right' }}>Actiuni</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {audits.map(audit => (
                                        <tr key={audit.id}>
                                            <td>
                                                <span className={`badge badge-${audit.status === 'COMPLETED' ? 'success' : audit.status === 'RUNNING' ? 'warning' : audit.status === 'FAILED' ? 'danger' : 'neutral'}`}>
                                                    {audit.status}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 500 }}>{audit.templateVersion?.template?.name || 'Unknown Template'}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>v{audit.templateVersion?.version}</div>
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                                {formatDate(audit.createdAt)}
                                            </td>
                                            <td>
                                                {audit.automatedCompliancePercent != null ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ fontWeight: 600, color: getScoreColor(audit.automatedCompliancePercent) }}>
                                                            {audit.automatedCompliancePercent.toFixed(1)}%
                                                        </span>
                                                        <div className="progress" style={{ width: '60px', height: '4px' }}>
                                                            <div className="progress-bar" style={{ width: `${audit.automatedCompliancePercent}%`, backgroundColor: getScoreColor(audit.automatedCompliancePercent) }}></div>
                                                        </div>
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td>
                                                {audit.manualCompletionPercent != null ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ fontWeight: 600 }}>
                                                            {audit.manualCompletionPercent.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <Link to={`/audit/${audit.id}`} className="btn-icon">
                                                    <span className="material-symbols-outlined">visibility</span>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === 'inventory' && (
                    <div className="inventory-section">
                        {/* Simplified Inventory for brevity, assuming standard blocks */}
                        {server.inventory?.osInfo && (
                            <div className="inventory-card">
                                <div className="inventory-card-header">
                                    <h3>Informatii Sistem</h3>
                                </div>
                                <div className="inventory-card-body">
                                    <table>
                                        <tbody>
                                            <tr><td>Distro</td><td>{server.inventory.osInfo.platform}</td></tr>
                                            <tr><td>Version</td><td>{server.inventory.osInfo.platformVersion}</td></tr>
                                            <tr><td>Kernel</td><td>{server.inventory.osInfo.kernelVersion}</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        {!server.inventory?.osInfo && (
                            <div className="empty-state">
                                <p>Date de inventar indisponibile.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'enrollment' && (
                    <div className="enrollment-section">
                        <div className="enrollment-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3>Token Enrollment</h3>
                                <button className="btn btn-secondary btn-sm" onClick={handleRegenerateToken}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
                                    Regenereaza
                                </button>
                            </div>
                            <div className="code-block">
                                <code>{enrollToken || 'N/A'}</code>
                                <button className="copy-btn" onClick={() => copyToClipboard(enrollToken)}>
                                    <span className="material-symbols-outlined">{copied ? 'check' : 'content_copy'}</span>
                                </button>
                            </div>
                            <p className="helper-text" style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Regenerarea va invalida vechiul token. Foloseste-l doar pentru instalari noi.
                            </p>
                        </div>
                        <div className="enrollment-card">
                            <h3>Comanda</h3>
                            <div className="code-block">
                                <code>{enrollCommand}</code>
                                <button className="copy-btn" onClick={() => copyToClipboard(enrollCommand)}>
                                    <span className="material-symbols-outlined">content_copy</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Start Audit Modal */}
            {showAuditModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>Porneste un Audit Nou</h2>
                            <button className="close-btn" onClick={() => setShowAuditModal(false)}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="modal-body">
                            {(!isActive || !hasAgent) ? (
                                <div className="alert alert-danger">
                                    <span className="material-symbols-outlined">signal_wifi_off</span>
                                    <div>
                                        <strong>Agent nedetectat sau offline!</strong>
                                        <p>Nu poti rula un audit automat fara un agent conectat si online.</p>
                                        <p>Verifica tab-ul "Enrollment" pentru instructiuni de instalare.</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="form-group">
                                        <label>Selecteaza Template-ul de Audit</label>
                                        <select
                                            value={selectedTemplate}
                                            onChange={(e) => setSelectedTemplate(e.target.value)}
                                            className="input"
                                        >
                                            <option value="">-- Alege un Template --</option>
                                            {templates.map(t => (
                                                <option key={t.id} value={t.id}>{t.name} (v{t.versions?.[0]?.version || '?'})</option>
                                            ))}
                                        </select>
                                        <p className="helper-text">BitTrail va rula controalele automate definite in acest template.</p>
                                    </div>
                                    {auditError && (
                                        <div className="alert alert-danger">{auditError}</div>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-text" onClick={() => setShowAuditModal(false)}>Anuleaza</button>
                            <button
                                className="btn btn-primary"
                                disabled={!selectedTemplate || runningAudit || !isActive}
                                onClick={handleRunAudit}
                            >
                                {runningAudit ? 'Se porneste...' : 'Porneste Audit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ServerDetail;
