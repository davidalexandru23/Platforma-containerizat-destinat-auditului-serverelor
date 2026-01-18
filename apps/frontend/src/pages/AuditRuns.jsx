import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { auditApi } from '../api/audit';
import './AuditRuns.css';

function AuditRuns() {
    const [audits, setAudits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadAudits();
    }, []);

    const loadAudits = async () => {
        try {
            setLoading(true);
            const data = await auditApi.getAll();
            setAudits(data);
        } catch (err) {
            setError('Eroare la incarcarea auditurilor');
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            PENDING: { class: 'badge-warning', label: 'Pending' },
            RUNNING: { class: 'badge-info', label: 'Running' },
            COMPLETED: { class: 'badge-success', label: 'Completed' },
            FAILED: { class: 'badge-error', label: 'Failed' },
            CANCELLED: { class: 'badge-neutral', label: 'Cancelled' },
        };
        const { class: cls, label } = statusMap[status] || statusMap.PENDING;
        return <span className={`badge ${cls}`}>{label}</span>;
    };

    const getComplianceBadge = (status) => {
        if (!status) return null;
        const statusMap = {
            COMPLIANT: { class: 'badge-success', label: 'Compliant' },
            PARTIALLY_COMPLIANT: { class: 'badge-warning', label: 'Partial' },
            NON_COMPLIANT: { class: 'badge-error', label: 'Non-Compliant' },
        };
        const { class: cls, label } = statusMap[status] || { class: 'badge-neutral', label: status };
        return <span className={`badge ${cls}`}>{label}</span>;
    };

    if (loading) {
        return (
            <div className="page flex items-center justify-center">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Audituri</h1>
                    <p className="page-subtitle">Istoric audituri de securitate</p>
                </div>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {audits.length === 0 ? (
                <div className="empty-state">
                    <p>Nu exista audituri. Porneste un audit din pagina unui server.</p>
                </div>
            ) : (
                <div className="audits-table-wrapper">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Server</th>
                                <th>Template</th>
                                <th>Status</th>
                                <th>Conformitate</th>
                                <th>Automated</th>
                                <th>Manual</th>
                                <th>Data</th>
                                <th>Actiuni</th>
                            </tr>
                        </thead>
                        <tbody>
                            {audits.map((audit) => (
                                <tr key={audit.id}>
                                    <td>
                                        <Link to={`/servers/${audit.server.id}`} className="link">
                                            {audit.server.name}
                                        </Link>
                                        <div className="text-muted text-sm">{audit.server.hostname}</div>
                                    </td>
                                    <td>
                                        {audit.templateVersion?.template?.name}
                                        <div className="text-muted text-sm">
                                            v{audit.templateVersion?.version}
                                        </div>
                                    </td>
                                    <td>{getStatusBadge(audit.status)}</td>
                                    <td>{getComplianceBadge(audit.overallStatus)}</td>
                                    <td>
                                        {audit.automatedCompliancePercent !== null
                                            ? `${audit.automatedCompliancePercent.toFixed(0)}%`
                                            : '-'
                                        }
                                    </td>
                                    <td>
                                        {audit.manualCompletionPercent !== null
                                            ? `${audit.manualCompletionPercent.toFixed(0)}%`
                                            : '-'
                                        }
                                    </td>
                                    <td>
                                        {new Date(audit.createdAt).toLocaleDateString('ro-RO')}
                                        <div className="text-muted text-sm">
                                            {new Date(audit.createdAt).toLocaleTimeString('ro-RO')}
                                        </div>
                                    </td>
                                    <td>
                                        <Link to={`/audits/${audit.id}`} className="btn btn-sm btn-secondary">
                                            Detalii
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default AuditRuns;
