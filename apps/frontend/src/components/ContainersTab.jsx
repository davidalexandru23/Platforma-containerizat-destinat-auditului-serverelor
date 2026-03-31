import { useState, useEffect } from 'react';
import {
    getContainers,
    refreshContainers,
    getContainerAuditHistory,
    runContainerAudit
} from '../api/containers';
import './ContainersTab.css';

export default function ContainersTab({ serverId, templates }) {
    const [containers, setContainers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const [selectedContainer, setSelectedContainer] = useState(null);
    const [containerAudits, setContainerAudits] = useState([]);
    const [loadingAudits, setLoadingAudits] = useState(false);

    // Modal state for running audit
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [auditContainer, setAuditContainer] = useState(null);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [runningAudit, setRunningAudit] = useState(false);
    const [auditError, setAuditError] = useState(null);

    // Filter state
    const [filter, setFilter] = useState('ALL');
    const [runtime, setRuntime] = useState('ALL');
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadContainers();
    }, [serverId]);

    const loadContainers = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await getContainers(serverId, {
                filter: filter !== 'ALL' ? filter : undefined,
                runtime: runtime !== 'ALL' ? runtime : undefined,
                search: search || undefined
            });
            setContainers(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Eroare la incarcarea containerelor');
        } finally {
            setLoading(false);
        }
    };

    // Reload when filters change
    useEffect(() => {
        // Debounce search slightly
        const timer = setTimeout(() => {
            loadContainers();
        }, 300);
        return () => clearTimeout(timer);
    }, [filter, runtime, search]);

    const handleRefresh = async () => {
        try {
            setRefreshing(true);
            await refreshContainers(serverId);
            // Polling for updates since the refresh is asynchronous (agent sends it later)
            setTimeout(loadContainers, 2000);
            setTimeout(loadContainers, 5000);
        } catch (err) {
            console.error('Refresh error', err);
        } finally {
            setTimeout(() => setRefreshing(false), 2000);
        }
    };

    const handleSelectContainer = async (container) => {
        if (selectedContainer?.id === container.id) {
            setSelectedContainer(null);
            return;
        }
        setSelectedContainer(container);
        
        try {
            setLoadingAudits(true);
            const res = await getContainerAuditHistory(serverId, container.id);
            setContainerAudits(res.data);
        } catch (err) {
            console.error('Failed to load container audits', err);
        } finally {
            setLoadingAudits(false);
        }
    };

    const openAuditModal = (container, e) => {
        e.stopPropagation();
        setAuditContainer(container);
        setShowAuditModal(true);
        setSelectedTemplate('');
        setAuditError(null);
    };

    const handleRunAudit = async () => {
        if (!selectedTemplate) return;

        try {
            setRunningAudit(true);
            setAuditError(null);
            
            await runContainerAudit({
                serverId,
                templateId: selectedTemplate,
                targetType: 'CONTAINER',
                targetContainerId: auditContainer.id,
                targetRuntime: auditContainer.runtime,
                targetContainerNativeId: auditContainer.nativeId
            });

            setShowAuditModal(false);
            
            // Reload audits if the same container was selected
            if (selectedContainer && selectedContainer.id === auditContainer.id) {
                const res = await getContainerAuditHistory(serverId, auditContainer.id);
                setContainerAudits(res.data);
            }
        } catch (err) {
            setAuditError(err.response?.data?.error || 'Eroare la pornirea auditului');
        } finally {
            setRunningAudit(false);
        }
    };

    const filterTemplates = () => {
        return templates.filter(t => t.type === 'CONTAINER_SECURITY');
    };

    const StatusBadge = ({ state }) => {
        if (!state) return null;
        const s = state.toUpperCase();
        if (s.includes('RUNNING') || s.includes('UP')) {
            return <span className="service-status active"><span className="dot"></span>{state}</span>;
        }
        if (s.includes('EXITED') || s.includes('STOP')) {
            return <span className="service-status stopped"><span className="dot"></span>{state}</span>;
        }
        return <span className="service-status disabled"><span className="dot"></span>{state}</span>;
    };

    const shortenId = (id) => id ? id.substring(0, 12) : '';

    return (
        <div className="containers-tab">
            <div className="containers-header">
                <div>
                    <h2>Containere Descoperite</h2>
                    <p className="text-muted">Gestioneaza si auditeaza containerele Docker si Podman de pe acest server.</p>
                </div>
                <button
                    className="btn btn-secondary"
                    onClick={handleRefresh}
                    disabled={refreshing}
                >
                    <span className={`material-symbols-outlined ${refreshing ? 'spinning' : ''}`}>sync</span>
                    {refreshing ? 'Se redescopera...' : 'Scanare Now'}
                </button>
            </div>

            <div className="containers-filters">
                <input
                    type="text"
                    placeholder="Cauta dupa nume, imagine sau ID..."
                    className="search-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                
                <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="ALL">Toate Starile</option>
                    <option value="RUNNING">Doar Running</option>
                    <option value="STOPPED">Doar Stopped</option>
                </select>

                <select className="filter-select" value={runtime} onChange={(e) => setRuntime(e.target.value)}>
                    <option value="ALL">Toate Runtimes</option>
                    <option value="docker">Docker</option>
                    <option value="podman">Podman</option>
                </select>
            </div>

            {error && (
                <div className="alert-danger">
                    <span className="material-symbols-outlined">error</span>
                    <p>{error}</p>
                </div>
            )}

            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Se incarca containerele...</p>
                </div>
            ) : containers.length === 0 ? (
                <div className="empty-state">
                    <span className="material-symbols-outlined empty-icon">view_in_ar</span>
                    <h3>Niciun container gasit</h3>
                    <p>Nu am detectat containere care sa corespunda filtrelor tale.</p>
                    <button className="btn btn-secondary mt-4" onClick={handleRefresh}>
                        <span className="material-symbols-outlined">search</span>
                        Incearca scanare noua
                    </button>
                </div>
            ) : (
                <div className="containers-list">
                    {containers.map((container) => (
                        <div key={container.id} className="container-wrapper">
                            <div 
                                className={`container-card ${selectedContainer?.id === container.id ? 'selected' : ''}`}
                                onClick={() => handleSelectContainer(container)}
                            >
                                <div className="container-info">
                                    <div className="container-title-row">
                                        <div className="container-icon-box">
                                            <span className="material-symbols-outlined">view_in_ar</span>
                                        </div>
                                        <div>
                                            <h4 className="container-name">{container.name}</h4>
                                            <div className="container-meta">
                                                <span className="container-runtime">{container.runtime}</span>
                                                <span className="divider"></span>
                                                <span className="container-id">ID: {shortenId(container.nativeId)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="container-details">
                                        <div className="detail-item">
                                            <span className="label">Imagine:</span>
                                            <span className="value code-text">{container.image}{container.imageTag ? `:${container.imageTag}` : ''}</span>
                                        </div>
                                        <div className="detail-item">
                                            <span className="label">Privilegiat:</span>
                                            <span className={`value ${container.privileged ? 'text-danger fw-bold' : ''}`}>
                                                {container.privileged ? 'DA' : 'Nu'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="container-actions">
                                    <StatusBadge state={container.status} />
                                    <button 
                                        className="btn btn-primary btn-sm"
                                        onClick={(e) => openAuditModal(container, e)}
                                    >
                                        <span className="material-symbols-outlined">security</span>
                                        Auditeaza
                                    </button>
                                </div>
                            </div>
                            
                            {/* Detailed View / Audit History */}
                            {selectedContainer?.id === container.id && (
                                <div className="container-expanded">
                                    <div className="expanded-section">
                                        <h4>Istoric Audituri ({containerAudits.length})</h4>
                                        {loadingAudits ? (
                                            <div className="small-spinner"></div>
                                        ) : containerAudits.length > 0 ? (
                                            <table className="audit-history-table">
                                                <thead>
                                                    <tr>
                                                        <th>Template</th>
                                                        <th>Status</th>
                                                        <th>Scor</th>
                                                        <th>Data</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {containerAudits.map((audit) => (
                                                        <tr key={audit.id}>
                                                            <td>{audit.templateVersion?.template?.name}</td>
                                                            <td>{audit.overallStatus}</td>
                                                            <td className="score-cell">
                                                                <div className="score-bar-bg">
                                                                    <div 
                                                                        className={`score-bar-fill ${audit.automatedCompliancePercent > 80 ? 'good' : audit.automatedCompliancePercent > 50 ? 'warning' : 'danger'}`} 
                                                                        style={{width: `${audit.automatedCompliancePercent || 0}%`}}
                                                                    ></div>
                                                                </div>
                                                                <span>{audit.automatedCompliancePercent || 0}%</span>
                                                            </td>
                                                            <td>{new Date(audit.createdAt).toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <p className="text-muted">Niciun audit efectuat inca.</p>
                                        )}
                                    </div>
                                    <div className="expanded-section">
                                        <h4>Detalii Tehnice</h4>
                                        <div className="tech-details-grid">
                                            <div className="tech-item"><span className="label">Ruleaza ca Root:</span> {container.runningAsRoot ? 'Da' : 'Nu'}</div>
                                            <div className="tech-item"><span className="label">Read-only RootFs:</span> {container.readOnlyRootfs ? 'Da' : 'Nu'}</div>
                                            <div className="tech-item"><span className="label">Porturi:</span> {container.ports?.length || 0} expuse</div>
                                            <div className="tech-item"><span className="label">Mount-uri:</span> {container.mounts?.length || 0} configurate</div>
                                            <div className="tech-item"><span className="label">Variabile ENV:</span> {container.envVarCount || 0}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Run Audit Modal */}
            {showAuditModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>Audit Container: {auditContainer?.name}</h2>
                            <button className="close-btn" onClick={() => setShowAuditModal(false)}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="modal-body">
                            {auditError && (
                                <div className="alert-danger mb-4">
                                    <span className="material-symbols-outlined">error</span>
                                    <p>{auditError}</p>
                                </div>
                            )}
                            <p className="mb-4 text-muted">Alege un template de securitate pentru containere pentru a evalua {shortenId(auditContainer?.nativeId)}.</p>
                            
                            <div className="form-group">
                                <label>Template de securitate</label>
                                <select 
                                    className="filter-select w-100 mt-2"
                                    value={selectedTemplate}
                                    onChange={(e) => setSelectedTemplate(e.target.value)}
                                    disabled={runningAudit}
                                >
                                    <option value="">-- Selecteaza un template --</option>
                                    {filterTemplates().map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button 
                                className="btn-text" 
                                onClick={() => setShowAuditModal(false)}
                                disabled={runningAudit}
                            >
                                Anuleaza
                            </button>
                            <button 
                                className="btn btn-primary"
                                onClick={handleRunAudit}
                                disabled={!selectedTemplate || runningAudit}
                            >
                                {runningAudit ? (
                                    <>
                                        <span className="material-symbols-outlined spinning">sync</span>
                                        Se porneste...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined">play_arrow</span>
                                        Porneste Audit
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
