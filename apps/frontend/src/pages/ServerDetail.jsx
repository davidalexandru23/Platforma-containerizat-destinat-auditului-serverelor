import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api/client';
import './ServerDetail.css';
import ShareServerModal from '../components/ShareServerModal';
import ContainersTab from '../components/ContainersTab';

function ServerDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [server, setServer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [copied, setCopied] = useState(false);

    // Stare audit
    const [audits, setAudits] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [runningAudit, setRunningAudit] = useState(false);
    const [auditError, setAuditError] = useState(null);

    // Stare versiune agent
    const [latestAgentVersion, setLatestAgentVersion] = useState(null);

    // Stare metrici detaliate live (SNMP)
    const [detailedMetrics, setDetailedMetrics] = useState(null);
    const [lastMetricsUpdate, setLastMetricsUpdate] = useState(null);

    useEffect(() => {
        loadServer();
        loadAudits();
        loadTemplates();
        loadLatestAgentVersion();

        // Metrici Live WebSocket
        const token = localStorage.getItem('accessToken');
        const wsUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

        // Socket pentru metrici live
        const liveSocket = io(`${wsUrl}/ws/live`, {
            auth: { token },
            query: { token },
        });

        liveSocket.on('connect', () => {
            console.log('Conectat la live metrics stream');
            liveSocket.emit('subscribe', { serverId: id });
        });

        liveSocket.emit('server:subscribe', { serverId: id });

        liveSocket.on('server:metrics', (data) => {
            setServer(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    metrics: { ...(prev.metrics || {}), ...data }
                };
            });
            setLastMetricsUpdate(new Date());
        });

        // Metrici detaliate live (via SNMP trap)
        liveSocket.on('server:metrics:detailed', (data) => {
            setDetailedMetrics(data);
            setLastMetricsUpdate(new Date());
        });

        liveSocket.on('server:heartbeat', (data) => {
            setServer(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    status: 'ONLINE',
                    agentIdentity: {
                        ...(prev.agentIdentity || {}),
                        version: data.agentVersion,
                        lastSeen: data.lastSeen
                    }
                };
            });
        });

        // Socket pentru status server (detectare offline)
        const serversSocket = io(`${wsUrl}/ws/servers`, {
            auth: { token },
            query: { token },
        });

        serversSocket.on('connect', () => {
            console.log('Conectat la servers status stream');
            serversSocket.emit('servers:subscribe');
        });

        // Ascultare schimbari status server
        serversSocket.on('servers:status', (data) => {
            if (data.serverId === id) {
                setServer(prev => {
                    if (!prev) return prev;
                    return { ...prev, status: data.status };
                });
            }
        });

        // Socket pentru status audit
        const auditSocket = io(`${wsUrl}/ws/audit`, {
            auth: { token },
            query: { token },
        });

        auditSocket.on('connect', () => {
            console.log('Conectat la audit status stream');
        });

        // Ascultare status audit
        auditSocket.on('audit:status', (data) => {
            if (data.serverId === id) {
                // Reincarcare audituri la schimbarea statusului
                loadAudits();
            }
        });

        return () => {
            liveSocket.disconnect();
            serversSocket.disconnect();
            auditSocket.disconnect();
        };

    }, [id]);

    const loadServer = async () => {
        try {
            // Preluare date server
            const [serverRes, metricsRes, inventoryRes, tokenRes] = await Promise.all([
                api.get(`/servers/${id}`),
                api.get(`/servers/${id}/metrics/latest`),
                api.get(`/servers/${id}/inventory/latest`),
                api.get(`/servers/${id}/enrollToken`).catch(() => ({ data: { enrollToken: null } }))
            ]);

            setServer({
                ...serverRes.data,
                metrics: metricsRes.data,
                inventory: inventoryRes.data,
                // Adaugare token enrollment
                agentIdentity: {
                    ...serverRes.data.agentIdentity,
                    enrollToken: tokenRes.data.enrollToken
                }
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

    const loadLatestAgentVersion = async () => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/downloads/agent-version.json`);
            if (response.ok) {
                const data = await response.json();
                setLatestAgentVersion(data.version);
            }
        } catch (error) {
            console.error('Error loading agent version:', error);
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
            // Reincarcare audituri si redirectionare
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
            // Actualizare server local cu token nou
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
        return new Date(date).toLocaleString('ro-RO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const calculateTotalScore = (audit) => {
        const autoCount = audit._count?.checkResults || 0;
        const manualCount = audit._count?.manualTaskResults || 0;
        const totalChecks = autoCount + manualCount;

        if (totalChecks === 0) return 0;

        const autoScore = audit.automatedCompliancePercent || 0;
        const manualScore = audit.manualCompletionPercent || 0;

        const weightedScore = ((autoScore * autoCount) + (manualScore * manualCount)) / totalChecks;
        return weightedScore;
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
    // Logica URL Backend
    // Localhost in browser -> localhost
    // IP in browser -> IP backend
    const currentHostname = window.location.hostname;
    const backendPort = '3000'; // Port implicit backend

    let apiUrl = import.meta.env.VITE_API_URL;

    // Fortare IP daca e setat localhost dar accesam via IP
    if (apiUrl && apiUrl.includes('localhost') && currentHostname !== 'localhost') {
        apiUrl = `${window.location.protocol}//${currentHostname}:${backendPort}`;
    } else if (!apiUrl) {
        // Fallback standard
        apiUrl = `${window.location.protocol}//${currentHostname}:${backendPort}`;
    }

    // Asigurare protocol pentru comenzi shell
    let safeApiUrl = apiUrl.startsWith('http') ? apiUrl : `http:${apiUrl.startsWith('//') ? '' : '//'}${apiUrl}`;

    // Eliminare sufix /api
    safeApiUrl = safeApiUrl.replace(/\/api$/, '');

    const enrollCommand = `sudo ./bittrail-agent enroll --token ${enrollToken || 'TOKEN'} --server ${safeApiUrl}`;

    // Versiune agent si comparatie
    const installedVersion = server.agentIdentity?.version;
    const needsUpdate = latestAgentVersion && installedVersion && latestAgentVersion !== installedVersion;
    const updateCommand = `sudo systemctl stop bittrail-agent
curl -fsSL ${safeApiUrl}/downloads/bittrail-agent -o /tmp/bittrail-agent
chmod +x /tmp/bittrail-agent
sudo mv /tmp/bittrail-agent /usr/local/bin/bittrail-agent
sudo systemctl start bittrail-agent
bittrail-agent version`;

    return (
        <div className="server-detail-page">
            {/* Navigare */}
            <nav className="breadcrumbs">
                <Link to="/">Dashboard</Link>
                <span className="separator">/</span>
                <Link to="/servers">Servere</Link>
                <span className="separator">/</span>
                <span className="current">{server.hostname}</span>
            </nav>

            {/* Antet Server */}
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
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowShareModal(true)}
                        >
                            <span className="material-symbols-outlined">group_add</span>
                            Gestionare Acces
                        </button>
                    </div>
                </div>
            </div>

            {/* Tab-uri */}
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
                    className={`tab ${activeTab === 'containers' ? 'active' : ''}`}
                    onClick={() => setActiveTab('containers')}
                >
                    Containere
                </button>
                <button
                    className={`tab ${activeTab === 'enrollment' ? 'active' : ''}`}
                    onClick={() => setActiveTab('enrollment')}
                >
                    Enrollment
                </button>
            </div>

            {/* Continut Tab */}
            <div className="tab-content">
                {activeTab === 'overview' && (
                    <>
                        {/* Mesaj server offline */}
                        {!isActive && (
                            <div className="card" style={{
                                padding: '2rem',
                                textAlign: 'center',
                                background: 'var(--bg-light)',
                                marginBottom: '1.5rem'
                            }}>
                                <span className="material-symbols-outlined" style={{
                                    fontSize: '48px',
                                    color: 'var(--danger)',
                                    marginBottom: '1rem',
                                    display: 'block'
                                }}>
                                    cloud_off
                                </span>
                                <h3 style={{ marginBottom: '0.5rem' }}>Server Offline</h3>
                                <p style={{ color: 'var(--text-muted)' }}>
                                    Agentul nu mai trimite metrici. Verifica conexiunea sau reporneste agentul.
                                </p>
                            </div>
                        )}

                        {/* Indicator live + timestamp ultima actualizare */}
                        {isActive && (
                            <div className="live-metrics-header">
                                <div className="live-indicator">
                                    <div className="live-pulse"></div>
                                    <span>Metrici Live</span>
                                    {detailedMetrics?.source === 'snmp' && (
                                        <span className="badge badge-neutral" style={{ fontSize: '0.65rem', marginLeft: '0.5rem' }}>SNMP</span>
                                    )}
                                </div>
                                {lastMetricsUpdate && (
                                    <span className="last-update">
                                        Ultima actualizare: {lastMetricsUpdate.toLocaleTimeString('ro-RO')}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Dashboard metrici detaliate */}
                        {isActive && (
                            <>
                                {/* Rand 1: CPU + Memorie + Load Average */}
                                <div className="metrics-grid-detailed">
                                    {/* CPU Section */}
                                    <div className="metric-card-detailed">
                                        <div className="metric-card-title">
                                            <span className="material-symbols-outlined">memory</span>
                                            CPU
                                        </div>
                                        <div className="cpu-main">
                                            <div className="cpu-gauge">
                                                <svg viewBox="0 0 120 120" className="gauge-svg">
                                                    <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="8" />
                                                    <circle cx="60" cy="60" r="54" fill="none" stroke="var(--primary)" strokeWidth="8"
                                                        strokeDasharray={`${(server.metrics?.cpuPercent || server.metrics?.cpu || 0) / 100 * 339.3} 339.3`}
                                                        strokeLinecap="round"
                                                        transform="rotate(-90 60 60)"
                                                        className="gauge-progress"
                                                    />
                                                    <text x="60" y="55" textAnchor="middle" className="gauge-text">
                                                        {(server.metrics?.cpuPercent || server.metrics?.cpu || 0).toFixed(1)}%
                                                    </text>
                                                    <text x="60" y="72" textAnchor="middle" className="gauge-label">
                                                        {detailedMetrics?.cpuCount || '-'} cores
                                                    </text>
                                                </svg>
                                            </div>
                                            {/* Per-core bars */}
                                            {detailedMetrics?.cpuPerCore && detailedMetrics.cpuPerCore.length > 0 && (
                                                <div className="cpu-cores">
                                                    {detailedMetrics.cpuPerCore.map((core, idx) => (
                                                        <div key={idx} className="core-bar-row">
                                                            <span className="core-label">C{idx}</span>
                                                            <div className="core-bar-track">
                                                                <div className="core-bar-fill" style={{
                                                                    width: `${core}%`,
                                                                    backgroundColor: core > 90 ? 'var(--danger)' : core > 70 ? 'var(--warning)' : 'var(--primary)'
                                                                }}></div>
                                                            </div>
                                                            <span className="core-value">{core.toFixed(0)}%</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Memorie Section */}
                                    <div className="metric-card-detailed">
                                        <div className="metric-card-title">
                                            <span className="material-symbols-outlined">storage</span>
                                            Memorie
                                        </div>
                                        <div className="mem-main">
                                            <div className="mem-stats">
                                                <div className="mem-stat-row">
                                                    <span className="mem-stat-label">Folosita</span>
                                                    <span className="mem-stat-value">
                                                        {((server.metrics?.mem?.used || server.metrics?.memUsedBytes || 0) / 1024 / 1024 / 1024).toFixed(2)} GB
                                                    </span>
                                                </div>
                                                <div className="mem-stat-row">
                                                    <span className="mem-stat-label">Total</span>
                                                    <span className="mem-stat-value">
                                                        {((server.metrics?.mem?.total || server.metrics?.memTotalBytes || 1) / 1024 / 1024 / 1024).toFixed(2)} GB
                                                    </span>
                                                </div>
                                                {detailedMetrics?.mem && (
                                                    <>
                                                        <div className="mem-stat-row">
                                                            <span className="mem-stat-label">Disponibila</span>
                                                            <span className="mem-stat-value">{(detailedMetrics.mem.available / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                                                        </div>
                                                        <div className="mem-stat-row">
                                                            <span className="mem-stat-label">Cache</span>
                                                            <span className="mem-stat-value">{(detailedMetrics.mem.cached / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                                                        </div>
                                                        <div className="mem-stat-row">
                                                            <span className="mem-stat-label">Buffers</span>
                                                            <span className="mem-stat-value">{(detailedMetrics.mem.buffers / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            <div className="mem-bar-container">
                                                <div className="mem-bar-label">RAM</div>
                                                <div className="progress" style={{ height: '12px', borderRadius: '6px' }}>
                                                    <div className="progress-bar progress-bar-warning" style={{
                                                        width: `${(Number(server.metrics?.mem?.used || server.metrics?.memUsedBytes || 0) / Number(server.metrics?.mem?.total || server.metrics?.memTotalBytes || 1)) * 100}%`,
                                                        transition: 'width 0.5s ease'
                                                    }}></div>
                                                </div>
                                                <span className="mem-bar-pct">
                                                    {((Number(server.metrics?.mem?.used || server.metrics?.memUsedBytes || 0) / Number(server.metrics?.mem?.total || server.metrics?.memTotalBytes || 1)) * 100).toFixed(1)}%
                                                </span>
                                            </div>
                                            {/* Swap */}
                                            {detailedMetrics?.swap && detailedMetrics.swap.total > 0 && (
                                                <div className="mem-bar-container">
                                                    <div className="mem-bar-label">Swap</div>
                                                    <div className="progress" style={{ height: '8px', borderRadius: '4px' }}>
                                                        <div className="progress-bar progress-bar-danger" style={{
                                                            width: `${detailedMetrics.swap.percent}%`,
                                                            transition: 'width 0.5s ease'
                                                        }}></div>
                                                    </div>
                                                    <span className="mem-bar-pct">
                                                        {(detailedMetrics.swap.used / 1024 / 1024).toFixed(0)} MB
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Load Average */}
                                    <div className="metric-card-detailed metric-card-compact">
                                        <div className="metric-card-title">
                                            <span className="material-symbols-outlined">speed</span>
                                            Load Average
                                        </div>
                                        <div className="load-avg-grid">
                                            <div className="load-avg-item">
                                                <span className="load-avg-period">1 min</span>
                                                <span className="load-avg-value">{(server.metrics?.load?.avg1 || server.metrics?.loadAvg1 || 0).toFixed(2)}</span>
                                            </div>
                                            <div className="load-avg-item">
                                                <span className="load-avg-period">5 min</span>
                                                <span className="load-avg-value">{(server.metrics?.load?.avg5 || server.metrics?.loadAvg5 || 0).toFixed(2)}</span>
                                            </div>
                                            <div className="load-avg-item">
                                                <span className="load-avg-period">15 min</span>
                                                <span className="load-avg-value">{(server.metrics?.load?.avg15 || server.metrics?.loadAvg15 || 0).toFixed(2)}</span>
                                            </div>
                                        </div>

                                        {/* Network summary */}
                                        <div className="metric-card-title" style={{ marginTop: '1.5rem' }}>
                                            <span className="material-symbols-outlined">lan</span>
                                            Retea (Total)
                                        </div>
                                        <div className="net-summary">
                                            <div className="net-summary-item">
                                                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--success)' }}>arrow_downward</span>
                                                <span className="net-direction">In</span>
                                                <span className="net-value">
                                                    {((server.metrics?.net?.in || server.metrics?.netInBytes || 0) / 1024 / 1024).toFixed(1)} MB
                                                </span>
                                            </div>
                                            <div className="net-summary-item">
                                                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--primary)' }}>arrow_upward</span>
                                                <span className="net-direction">Out</span>
                                                <span className="net-value">
                                                    {((server.metrics?.net?.out || server.metrics?.netOutBytes || 0) / 1024 / 1024).toFixed(1)} MB
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Rand 2: Disc + Network per-interfata */}
                                <div className="metrics-grid-wide">
                                    {/* Disc per-partitie */}
                                    <div className="metric-card-detailed">
                                        <div className="metric-card-title">
                                            <span className="material-symbols-outlined">hard_drive</span>
                                            Disc
                                        </div>
                                        {detailedMetrics?.disks && detailedMetrics.disks.length > 0 ? (
                                            <table className="metrics-table">
                                                <thead>
                                                    <tr>
                                                        <th>Mount</th>
                                                        <th>Tip FS</th>
                                                        <th>Folosit</th>
                                                        <th>Total</th>
                                                        <th style={{ width: '120px' }}>Utilizare</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detailedMetrics.disks.map((disk, idx) => {
                                                        const pct = disk.totalBytes > 0 ? (disk.usedBytes / disk.totalBytes) * 100 : 0;
                                                        return (
                                                            <tr key={idx}>
                                                                <td><code>{disk.mountPoint}</code></td>
                                                                <td>{disk.fsType}</td>
                                                                <td>{(disk.usedBytes / 1024 / 1024 / 1024).toFixed(1)} GB</td>
                                                                <td>{(disk.totalBytes / 1024 / 1024 / 1024).toFixed(1)} GB</td>
                                                                <td>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <div className="progress" style={{ flex: 1, height: '6px' }}>
                                                                            <div className="progress-bar" style={{
                                                                                width: `${pct}%`,
                                                                                backgroundColor: pct > 90 ? 'var(--danger)' : pct > 80 ? 'var(--warning)' : 'var(--primary)',
                                                                                transition: 'width 0.5s ease'
                                                                            }}></div>
                                                                        </div>
                                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, minWidth: '35px' }}>{pct.toFixed(0)}%</span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        ) : (
                                            /* Fallback disc simplu */
                                            <div className="mem-bar-container" style={{ marginTop: '1rem' }}>
                                                <div className="mem-bar-label">/</div>
                                                <div className="progress" style={{ height: '12px', borderRadius: '6px' }}>
                                                    <div className="progress-bar progress-bar-primary" style={{
                                                        width: `${(Number(server.metrics?.disk?.used || server.metrics?.diskUsedBytes || 0) / Number(server.metrics?.disk?.total || server.metrics?.diskTotalBytes || 1)) * 100}%`
                                                    }}></div>
                                                </div>
                                                <span className="mem-bar-pct">
                                                    {((server.metrics?.disk?.used || server.metrics?.diskUsedBytes || 0) / 1024 / 1024 / 1024).toFixed(1)} /
                                                    {((server.metrics?.disk?.total || server.metrics?.diskTotalBytes || 1) / 1024 / 1024 / 1024).toFixed(0)} GB
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Network per-interfata */}
                                    {detailedMetrics?.netInterfaces && detailedMetrics.netInterfaces.length > 0 && (
                                        <div className="metric-card-detailed">
                                            <div className="metric-card-title">
                                                <span className="material-symbols-outlined">wifi</span>
                                                Interfete Retea
                                            </div>
                                            <table className="metrics-table">
                                                <thead>
                                                    <tr>
                                                        <th>Interfata</th>
                                                        <th>RX (Bytes)</th>
                                                        <th>TX (Bytes)</th>
                                                        <th>Pachete In</th>
                                                        <th>Pachete Out</th>
                                                        <th>Erori</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detailedMetrics.netInterfaces.map((iface, idx) => (
                                                        <tr key={idx}>
                                                            <td><code>{iface.name}</code></td>
                                                            <td>{(iface.bytesRecv / 1024 / 1024).toFixed(1)} MB</td>
                                                            <td>{(iface.bytesSent / 1024 / 1024).toFixed(1)} MB</td>
                                                            <td>{iface.packetsIn?.toLocaleString()}</td>
                                                            <td>{iface.packetsOut?.toLocaleString()}</td>
                                                            <td>
                                                                <span style={{ color: iface.errors > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                                                                    {iface.errors || 0}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {/* Rand 3: Top procese */}
                                {detailedMetrics?.topProcesses && detailedMetrics.topProcesses.length > 0 && (
                                    <div className="metric-card-detailed full-width">
                                        <div className="metric-card-title">
                                            <span className="material-symbols-outlined">monitoring</span>
                                            Top Procese
                                        </div>
                                        <table className="metrics-table processes-table">
                                            <thead>
                                                <tr>
                                                    <th>PID</th>
                                                    <th>Nume</th>
                                                    <th>CPU %</th>
                                                    <th>Memorie</th>
                                                    <th>Comanda</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detailedMetrics.topProcesses.map((proc, idx) => (
                                                    <tr key={idx} className={idx < 3 ? 'proc-highlight' : ''}>
                                                        <td className="proc-pid">{proc.pid}</td>
                                                        <td><strong>{proc.name}</strong></td>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <div className="progress" style={{ width: '50px', height: '4px' }}>
                                                                    <div className="progress-bar" style={{
                                                                        width: `${Math.min(proc.cpu, 100)}%`,
                                                                        backgroundColor: proc.cpu > 50 ? 'var(--danger)' : 'var(--primary)',
                                                                        transition: 'width 0.3s ease'
                                                                    }}></div>
                                                                </div>
                                                                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                                                                    {proc.cpu.toFixed(1)}%
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                                                            {proc.memMB.toFixed(1)} MB
                                                        </td>
                                                        <td className="proc-command">
                                                            <code>{proc.command}</code>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Fallback: top procese lista simpla (daca nu avem detaliate) */}
                                {!detailedMetrics?.topProcesses && server.metrics?.topProcs && (
                                    <div className="metric-card-detailed full-width">
                                        <div className="metric-card-title">
                                            <span className="material-symbols-outlined">monitoring</span>
                                            Top Procese (basic)
                                        </div>
                                        <div className="tag-cloud" style={{ padding: '1rem' }}>
                                            {server.metrics.topProcs.map((proc, idx) => (
                                                <span key={idx} className="badge badge-neutral">{proc}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </>
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
                                        <th>Scor Total</th>
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
                                                {(() => {
                                                    const totalScore = calculateTotalScore(audit);
                                                    return (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span style={{ fontWeight: 700, color: getScoreColor(totalScore) }}>
                                                                {totalScore.toFixed(1)}%
                                                            </span>
                                                            <div className="progress" style={{ width: '60px', height: '6px' }}>
                                                                <div className="progress-bar" style={{ width: `${totalScore}%`, backgroundColor: getScoreColor(totalScore) }}></div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
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
                        {/* Inventar simplificat */}
                        <div className="inventory-dashboard">
                            {/* Informatii Sistem */}
                            {server.inventory?.osInfo && (
                                <div className="inventory-card">
                                    <div className="inventory-card-header">
                                        <h3><span className="material-symbols-outlined">computer</span> Informatii Sistem</h3>
                                    </div>
                                    <div className="inventory-card-body">
                                        <table className="inventory-table">
                                            <tbody>
                                                <tr><td>Distro</td><td>{server.inventory.osInfo.platform}</td></tr>
                                                <tr><td>Version</td><td>{server.inventory.osInfo.platformVersion}</td></tr>
                                                <tr><td>Kernel</td><td>{server.inventory.osInfo.kernelVersion}</td></tr>
                                                <tr><td>Machine</td><td>{server.inventory.osInfo.kernelArch}</td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Users */}
                            {server.inventory?.users && server.inventory.users.length > 0 && (
                                <div className="inventory-card">
                                    <div className="inventory-card-header">
                                        <h3><span className="material-symbols-outlined">group</span> Utilizatori ({server.inventory.users.length})</h3>
                                    </div>
                                    <div className="inventory-card-body scrollable-list">
                                        <div className="tag-cloud">
                                            {server.inventory.users.map((user, idx) => (
                                                <span key={idx} className="badge badge-neutral">{user}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Ports */}
                            {server.inventory?.ports && server.inventory.ports.length > 0 && (
                                <div className="inventory-card">
                                    <div className="inventory-card-header">
                                        <h3><span className="material-symbols-outlined">wifi</span> Porturi Deschise ({server.inventory.ports.length})</h3>
                                    </div>
                                    <div className="inventory-card-body scrollable-list">
                                        <table className="inventory-table compact">
                                            <thead>
                                                <tr><th>Port</th><th>Adresa</th><th>Tip</th></tr>
                                            </thead>
                                            <tbody>
                                                {server.inventory.ports.map((port, idx) => (
                                                    <tr key={idx}>
                                                        <td><strong>{port.port}</strong></td>
                                                        <td>{port.address || '*'}</td>
                                                        <td>{port.type?.toUpperCase()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Services */}
                            {server.inventory?.services && server.inventory.services.length > 0 && (
                                <div className="inventory-card">
                                    <div className="inventory-card-header">
                                        <h3><span className="material-symbols-outlined">settings_applications</span> Servicii Active ({server.inventory.services.length})</h3>
                                    </div>
                                    <div className="inventory-card-body scrollable-list">
                                        <div className="tag-cloud">
                                            {server.inventory.services.map((svc, idx) => (
                                                <span key={idx} className="badge badge-success" style={{ margin: '2px' }}>{svc}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Packages */}
                            {server.inventory?.packages && server.inventory.packages.length > 0 && (
                                <div className="inventory-card full-width">
                                    <div className="inventory-card-header">
                                        <h3><span className="material-symbols-outlined">inventory_2</span> Pachete Instalate ({server.inventory.packages.length})</h3>
                                    </div>
                                    <div className="inventory-card-body scrollable-list" style={{ maxHeight: '300px' }}>
                                        <div className="tag-cloud">
                                            {server.inventory.packages.map((pkg, idx) => (
                                                <span key={idx} className="badge badge-neutral" style={{ margin: '2px', fontSize: '0.75rem' }}>{pkg}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        {!server.inventory?.osInfo && (
                            <div className="empty-state">
                                <p>Date de inventar indisponibile.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'containers' && (
                    <ContainersTab serverId={id} templates={templates} />
                )}

                {activeTab === 'enrollment' && (
                    <div className="enrollment-section">

                        {/* Token Inrolare */}
                        <div className="enrollment-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3>1. Token Enrollment</h3>
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
                        </div>

                        {/* Instalare Noua */}
                        <div className="enrollment-card">
                            <h3>2. Instalare Rapida (One-Liner)</h3>
                            <p className="helper-text" style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Descarca si instaleaza agentul automat. Scriptul va intreba daca doresti instalare ca serviciu.
                            </p>
                            <div className="code-block">
                                <code>{`curl -fsSL ${safeApiUrl}/downloads/install.sh | sudo bash -s -- ${safeApiUrl}`}</code>
                                <button className="copy-btn" onClick={() => copyToClipboard(`curl -fsSL ${safeApiUrl}/downloads/install.sh | sudo bash -s -- ${safeApiUrl}`)}>
                                    <span className="material-symbols-outlined">content_copy</span>
                                </button>
                            </div>
                        </div>

                        {/* Inrolare */}
                        <div className="enrollment-card">
                            <h3>3. Inrolare Agent</h3>
                            <p className="helper-text" style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Conecteaza agentul instalat la acest server:
                            </p>
                            <div className="code-block">
                                <code>{enrollCommand}</code>
                                <button className="copy-btn" onClick={() => copyToClipboard(enrollCommand)}>
                                    <span className="material-symbols-outlined">content_copy</span>
                                </button>
                            </div>
                        </div>

                        {/* Update */}
                        {hasAgent && (
                            <div className="enrollment-card">
                                <h3>Actualizare Agent</h3>
                                <p className="helper-text" style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Actualizeaza la ultima versiune pastrand configuratia:
                                </p>
                                <div className="code-block">
                                    <code>{`curl -fsSL ${safeApiUrl}/downloads/update.sh | sudo bash -s -- ${safeApiUrl}`}</code>
                                    <button className="copy-btn" onClick={() => copyToClipboard(`curl -fsSL ${safeApiUrl}/downloads/update.sh | sudo bash -s -- ${safeApiUrl}`)}>
                                        <span className="material-symbols-outlined">content_copy</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Uninstall */}
                        <div className="enrollment-card" style={{ borderColor: 'var(--border)' }}>
                            <h3>Dezinstalare</h3>
                            <p className="helper-text" style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Sterge serviciul si fisierele agentului:
                            </p>
                            <div className="code-block">
                                <code>{`curl -fsSL ${safeApiUrl}/downloads/uninstall.sh | sudo bash`}</code>
                                <button className="copy-btn" onClick={() => copyToClipboard(`curl -fsSL ${safeApiUrl}/downloads/uninstall.sh | sudo bash`)}>
                                    <span className="material-symbols-outlined">content_copy</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modala Pornire Audit */}
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

            {/* Modala Partajare */}
            {showShareModal && (
                <ShareServerModal
                    serverId={id}
                    onClose={() => setShowShareModal(false)}
                />
            )}
        </div>
    );
}

export default ServerDetail;
