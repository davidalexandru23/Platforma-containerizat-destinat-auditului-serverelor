import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api/client';
import './Dashboard.css';

function Dashboard() {
    // State-ul principal - sursa de adevar
    const [servers, setServers] = useState([]);
    const [templatesCount, setTemplatesCount] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboardData();

        // WebSocket pentru actualizari live status servere
        const token = localStorage.getItem('accessToken');
        const wsUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

        const serversSocket = io(`${wsUrl}/ws/servers`, {
            auth: { token },
            query: { token },
        });

        serversSocket.on('connect', () => {
            console.log('Dashboard: conectat la servers stream');
            serversSocket.emit('servers:subscribe');
        });

        // Ascultare actualizari status servere
        serversSocket.on('servers:status', (data) => {
            setServers(prevServers => {
                return prevServers.map(server => {
                    if (server.id === data.serverId) {
                        return {
                            ...server,
                            status: data.status,
                            riskLevel: data.riskLevel,
                            agentIdentity: {
                                ...(server.agentIdentity || {}),
                                lastSeen: data.lastSeen
                            }
                        };
                    }
                    return server;
                });
            });
        });

        return () => {
            serversSocket.disconnect();
        };
    }, []);

    const loadDashboardData = async () => {
        try {
            // Preluare servere, sabloane si audituri in paralel
            const [serversRes, templatesRes] = await Promise.all([
                api.get('/servers'),
                api.get('/templates')
            ]);

            const serversData = serversRes.data || [];
            const templatesData = templatesRes.data || [];

            setServers(serversData);
            setTemplatesCount(templatesData.length);
        } catch (error) {
            console.error('Error loading dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('ro-RO', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Calcul valori derivate
    const onlineServersCount = servers.filter(
        s => s.status === 'online' || s.status === 'ONLINE'
    ).length;

    // Luam primele 5 servere (presupunand ca API-ul le returneaza sortate, sau putem sorta aici)
    const recentServers = servers.slice(0, 5);

    return (
        <div className="dashboard-page">
            {/* Antet Pagina */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Prezentare generala a infrastructurii si starii de conformitate.</p>
                </div>
            </div>

            {/* Layout Grid */}
            <div className="dashboard-grid">
                {/* Coloana Stanga */}
                <div className="dashboard-main">
                    {/* Grila Metrici */}
                    <div className="grid grid-3" style={{ marginBottom: '2rem' }}>
                        <div className="metric-card">
                            <div className="metric-header">
                                <div>
                                    <p className="metric-label">Total Servere</p>
                                    <h3 className="metric-value">{loading ? '-' : servers.length}</h3>
                                </div>
                                <span className="material-symbols-outlined" style={{ fontSize: '32px', color: 'var(--primary)', opacity: 0.5 }}>dns</span>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-header">
                                <div>
                                    <p className="metric-label">Servere Online</p>
                                    <h3 className="metric-value">{loading ? '-' : onlineServersCount}</h3>
                                </div>
                                <span className="metric-change positive" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{
                                        width: '8px',
                                        height: '8px',
                                        backgroundColor: 'var(--success)',
                                        borderRadius: '50%',
                                        boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.2)'
                                    }}></div>
                                    Online
                                </span>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-header">
                                <div>
                                    <p className="metric-label">Template-uri Audit</p>
                                    <h3 className="metric-value">{loading ? '-' : templatesCount}</h3>
                                </div>
                                <span className="material-symbols-outlined" style={{ fontSize: '32px', color: 'var(--info)', opacity: 0.5 }}>fact_check</span>
                            </div>
                        </div>
                    </div>

                    {/* Servere Recente */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">Servere Recente</h3>
                            <Link to="/servers" className="btn btn-secondary btn-sm">
                                Vezi toate
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
                            </Link>
                        </div>

                        {loading ? (
                            <div className="empty-state" style={{ padding: '2rem' }}>
                                <div className="spinner"></div>
                            </div>
                        ) : recentServers.length === 0 ? (
                            <div className="empty-state">
                                <span className="material-symbols-outlined">dns</span>
                                <p>Nu exista servere inregistrate.</p>
                                <Link to="/servers" className="btn btn-primary">
                                    <span className="material-symbols-outlined">add</span>
                                    Adauga primul server
                                </Link>
                            </div>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '60px' }}>Status</th>
                                        <th>Server</th>
                                        <th>IP</th>
                                        <th>Ultima Activitate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentServers.map(server => (
                                        <tr key={server.id}>
                                            <td className="status-indicator-cell">
                                                <div className={`status-dot-wrapper ${server.status === 'online' || server.status === 'ONLINE' ? 'online' : 'offline'}`} title={server.status}>
                                                    <div className="dot"></div>
                                                </div>
                                            </td>
                                            <td>
                                                <Link to={`/servers/${server.id}`} className="hover-link" style={{ fontWeight: 600 }}>
                                                    {server.hostname}
                                                </Link>
                                            </td>
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                {server.ip || server.ipAddress || 'N/A'}
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                {server.agentIdentity?.lastSeen ? formatDate(server.agentIdentity.lastSeen) : (server.lastSeen ? formatDate(server.lastSeen) : 'N/A')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Actiuni Rapide */}
            <div className="grid grid-3" style={{ marginTop: '1.5rem' }}>
                <Link to="/servers" className="card" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', background: 'var(--primary-light)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>add</span>
                    </div>
                    <div>
                        <h4 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Adauga Server</h4>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Inregistreaza un server nou</p>
                    </div>
                </Link>

                <Link to="/templates" className="card" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--info)' }}>description</span>
                    </div>
                    <div>
                        <h4 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Template-uri</h4>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Gestioneaza template-urile de audit</p>
                    </div>
                </Link>

                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', opacity: 0.7 }}>
                    <div style={{ width: '48px', height: '48px', background: 'var(--bg-light)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)' }}>play_arrow</span>
                    </div>
                    <div>
                        <h4 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Ruleaza Audit</h4>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Selecteaza un server pentru a incepe</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;

