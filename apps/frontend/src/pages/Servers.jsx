import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import './Servers.css';

function Servers() {
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);

    const [riskSort, setRiskSort] = useState('none'); // none, asc, desc
    const [filter, setFilter] = useState('all');
    const [showAddModal, setShowAddModal] = useState(false);
    const [enrollmentToken, setEnrollmentToken] = useState(null);

    useEffect(() => {
        loadServers();
    }, []);

    const loadServers = async () => {
        setLoading(true);
        try {
            const response = await api.get('/servers');
            setServers(response.data || []);
        } catch (error) {
            console.error('Error loading servers:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Esti sigur ca vrei sa stergi acest server?')) return;
        try {
            await api.delete(`/servers/${id}`);
            loadServers();
        } catch (error) {
            console.error('Error deleting server:', error);
            alert('Eroare la stergere server');
        }
    };

    const handleSortRisk = () => {
        const nextSort = {
            'none': 'desc', // Start with critical first (high risk)
            'desc': 'asc',
            'asc': 'none'
        };
        setRiskSort(nextSort[riskSort]);
    };

    const getRiskValue = (risk) => {
        const values = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
        return values[risk] || 0;
    };

    const getFilteredAndSortedServers = () => {
        let result = servers;

        // 1. Status Filter
        if (filter === 'online') {
            result = result.filter(s => s.status === 'online' || s.status === 'ONLINE');
        } else if (filter === 'offline') {
            result = result.filter(s => s.status !== 'online' && s.status !== 'ONLINE');
        }



        // 3. Risk Sort
        if (riskSort !== 'none') {
            result = [...result].sort((a, b) => {
                const valA = getRiskValue(a.riskLevel);
                const valB = getRiskValue(b.riskLevel);
                return riskSort === 'asc' ? valA - valB : valB - valA;
            });
        }

        return result;
    };

    const onlineCount = servers.filter(s => s.status === 'online' || s.status === 'ONLINE').length;
    const offlineCount = servers.length - onlineCount;
    const filteredServers = getFilteredAndSortedServers();

    const formatLastSeen = (date) => {
        if (!date) return 'Niciodata';
        const now = new Date();
        const seen = new Date(date);
        const diffMs = now - seen;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Acum';
        if (diffMins < 60) return `${diffMins} min`;
        if (diffHours < 24) return `${diffHours} ore`;
        return `${diffDays} zile`;
    };

    const getRiskBadge = (server) => {
        const risk = server.riskLevel || 'low';
        // ... (rest of badge logic)
        const classes = {
            critical: 'badge badge-danger',
            high: 'badge badge-warning',
            medium: 'badge badge-info',
            low: 'badge badge-success'
        };
        const labels = {
            critical: 'Critical',
            high: 'High',
            medium: 'Medium',
            low: 'Low'
        };
        return (
            <span className={classes[risk] || classes.low}>
                <span className="status-dot"></span>
                {labels[risk] || 'Low'}
            </span>
        );
    };

    return (
        <div className="servers-page">
            {/* Page Header */}
            <div className="page-header">
                <div className="page-header-row">
                    <div>
                        <h1 className="page-title">Management Servere</h1>
                        <p className="page-subtitle">
                            Administreaza nodurile de infrastructura, verifica status-ul si ruleaza audituri de conformitate.
                        </p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                        <span className="material-symbols-outlined">add</span>
                        Adauga Server
                    </button>
                </div>
            </div>

            {/* Filters Toolbar */}
            <div className="filters-toolbar">
                <div className="segmented-control">
                    <button
                        className={`segment-btn ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        Toate
                    </button>
                    <button
                        className={`segment-btn ${filter === 'online' ? 'active' : ''}`}
                        onClick={() => setFilter('online')}
                    >
                        Online
                        <span className="segment-count primary">{onlineCount}</span>
                    </button>
                    <button
                        className={`segment-btn ${filter === 'offline' ? 'active' : ''}`}
                        onClick={() => setFilter('offline')}
                    >
                        Offline
                        <span className="segment-count neutral">{offlineCount}</span>
                    </button>
                </div>

                <div className="filter-buttons">
                    <button
                        className={`filter-btn ${riskSort !== 'none' ? 'active' : ''}`}
                        onClick={handleSortRisk}
                    >
                        <span className="material-symbols-outlined">shield</span>
                        Nivel Risc
                        {riskSort === 'none' && <span className="material-symbols-outlined">unfold_more</span>}
                        {riskSort === 'asc' && <span className="material-symbols-outlined">arrow_upward</span>}
                        {riskSort === 'desc' && <span className="material-symbols-outlined">arrow_downward</span>}
                    </button>
                </div>
            </div>

            {/* Servers Table */}
            <div className="table-container">
                {loading ? (
                    <div className="empty-state">
                        <div className="spinner"></div>
                        <p>Se incarca serverele...</p>
                    </div>
                ) : filteredServers.length === 0 ? (
                    <div className="empty-state">
                        <span className="material-symbols-outlined">dns</span>
                        <p>
                            Nu exista servere inregistrate.
                        </p>
                        {(
                            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                                <span className="material-symbols-outlined">add</span>
                                Adauga primul server
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '64px' }}>Status</th>
                                    <th>Server Info</th>
                                    <th>Tag-uri</th>
                                    <th>Ultima Activitate</th>
                                    <th>Nivel Risc</th>
                                    <th style={{ width: '120px', textAlign: 'right' }}>Actiuni</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredServers.map(server => (
                                    <tr key={server.id}>
                                        <td className="status-indicator-cell">
                                            <div className={`status-dot-wrapper ${server.status === 'online' || server.status === 'ONLINE' ? 'online' : 'offline'}`}>
                                                <div className="dot"></div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="server-info">
                                                <span className="server-name">{server.hostname}</span>
                                                <span className="server-ip">{server.ip || server.ipAddress || 'N/A'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="tags-list">
                                                {server.tags?.map((tag, i) => (
                                                    <span key={i} className={`tag ${tag.toLowerCase()}`}>{tag}</span>
                                                )) || <span className="tag">Server</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`last-seen ${!server.agentIdentity?.lastSeen ? 'stale' : ''}`}>
                                                {formatLastSeen(server.agentIdentity?.lastSeen)}
                                            </span>
                                        </td>
                                        <td>
                                            {getRiskBadge(server)}
                                        </td>
                                        <td>
                                            <div className="table-actions" style={{ opacity: 1 }}>
                                                <Link to={`/servers/${server.id}`} className="action-btn" title="Detalii">
                                                    <span className="material-symbols-outlined">visibility</span>
                                                </Link>
                                                <button
                                                    className="action-btn danger"
                                                    title="Sterge"
                                                    onClick={() => handleDelete(server.id)}
                                                >
                                                    <span className="material-symbols-outlined">delete</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Pagination */}
                        <div className="pagination">
                            <span className="pagination-info">
                                Afisare 1-{filteredServers.length} din {filteredServers.length} servere
                            </span>
                        </div>
                    </>
                )}
            </div>

            {/* Add Server Modal */}
            {showAddModal && (
                <AddServerModal
                    onClose={() => setShowAddModal(false)}
                    onSuccess={(token) => {
                        setEnrollmentToken(token);
                        setShowAddModal(false);
                        loadServers();
                    }}
                />
            )}

            {/* Token Display Modal */}
            {enrollmentToken && (
                <div className="modal-overlay" onClick={() => setEnrollmentToken(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Server Adaugat cu Succes</h2>
                            <button className="modal-close" onClick={() => setEnrollmentToken(null)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <div className="alert alert-success mb-md">
                                <span className="material-symbols-outlined">check_circle</span>
                                Serverul a fost creat. Foloseste token-ul de mai jos pentru a conecta agentul.
                            </div>

                            <div className="form-group">
                                <label className="form-label">Enrollment Token</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        type="text"
                                        className="input"
                                        value={enrollmentToken}
                                        readOnly
                                        style={{ fontFamily: 'monospace', fontWeight: 'bold' }}
                                    />
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => navigator.clipboard.writeText(enrollmentToken)}
                                        title="Copiaza"
                                    >
                                        <span className="material-symbols-outlined">content_copy</span>
                                    </button>
                                </div>
                                <p className="text-muted mt-sm" style={{ fontSize: '0.8rem' }}>
                                    Pastreaza acest token in siguranta. El este necesar pentru autentificarea agentului.
                                </p>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-primary" onClick={() => setEnrollmentToken(null)}>
                                Am inteles
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Add Server Modal Component
function AddServerModal({ onClose, onSuccess }) {
    const [hostname, setHostname] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await api.post('/servers', { name: hostname, hostname });
            // Assuming the backend returns the full server object including enrollmentToken
            // or we might need to fetch it separately if it's not in the response.
            // Based on typical implementation, create returns the created object.
            // Let's check if the response has the token directly or inside the server object.
            const token = res.data.enrollmentToken || 'TOKEN-NOT-RETURNED-CHECK-BACKEND';
            onSuccess(token);
        } catch (err) {
            setError(err.response?.data?.message || 'Eroare la adaugare server');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Adauga Server Nou</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {error && (
                            <div className="alert alert-error mb-md">
                                <span className="material-symbols-outlined">error</span>
                                {error}
                            </div>
                        )}
                        <div className="form-group">
                            <label className="form-label">Hostname</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="ex: prod-db-01"
                                value={hostname}
                                onChange={(e) => setHostname(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                        <p className="text-muted mt-md" style={{ fontSize: '0.875rem' }}>
                            Dupa creare vei primi un token de enrollment pentru a conecta agentul.
                        </p>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Anuleaza
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? <div className="spinner"></div> : 'Adauga Server'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default Servers;
