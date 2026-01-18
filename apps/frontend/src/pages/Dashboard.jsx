import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

function Dashboard() {
    const [stats, setStats] = useState({
        totalServers: 0,
        onlineServers: 0,
        totalTemplates: 0,
        pendingAudits: 0
    });
    const [recentServers, setRecentServers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            const [serversRes, templatesRes] = await Promise.all([
                api.get('/servers'),
                api.get('/templates')
            ]);

            const servers = serversRes.data || [];
            const templates = templatesRes.data || [];

            setStats({
                totalServers: servers.length,
                onlineServers: servers.filter(s => s.status === 'online').length,
                totalTemplates: templates.length,
                pendingAudits: 0
            });

            setRecentServers(servers.slice(0, 5));
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

    return (
        <div className="dashboard-page">
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Prezentare generala a infrastructurii si starii de conformitate.</p>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-4" style={{ marginBottom: '2rem' }}>
                <div className="metric-card">
                    <div className="metric-header">
                        <div>
                            <p className="metric-label">Total Servere</p>
                            <h3 className="metric-value">{loading ? '-' : stats.totalServers}</h3>
                        </div>
                        <span className="material-symbols-outlined" style={{ fontSize: '32px', color: 'var(--primary)', opacity: 0.5 }}>dns</span>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-header">
                        <div>
                            <p className="metric-label">Servere Online</p>
                            <h3 className="metric-value">{loading ? '-' : stats.onlineServers}</h3>
                        </div>
                        <span className="metric-change positive">
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>trending_up</span>
                            Active
                        </span>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-header">
                        <div>
                            <p className="metric-label">Template-uri Audit</p>
                            <h3 className="metric-value">{loading ? '-' : stats.totalTemplates}</h3>
                        </div>
                        <span className="material-symbols-outlined" style={{ fontSize: '32px', color: 'var(--info)', opacity: 0.5 }}>fact_check</span>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-header">
                        <div>
                            <p className="metric-label">Audituri Pending</p>
                            <h3 className="metric-value">{loading ? '-' : stats.pendingAudits}</h3>
                        </div>
                        <span className="material-symbols-outlined" style={{ fontSize: '32px', color: 'var(--warning)', opacity: 0.5 }}>schedule</span>
                    </div>
                </div>
            </div>

            {/* Recent Servers */}
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
                                <th>Status</th>
                                <th>Server</th>
                                <th>IP</th>
                                <th>Ultima Activitate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentServers.map(server => (
                                <tr key={server.id}>
                                    <td>
                                        <div className={`status-dot-wrapper ${server.status === 'online' ? 'online' : 'offline'}`}>
                                            <div className="dot"></div>
                                        </div>
                                    </td>
                                    <td>
                                        <Link to={`/servers/${server.id}`} style={{ fontWeight: 600 }}>
                                            {server.hostname}
                                        </Link>
                                    </td>
                                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {server.ip || 'N/A'}
                                    </td>
                                    <td style={{ color: 'var(--text-muted)' }}>
                                        {formatDate(server.lastSeen)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Quick Actions */}
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
