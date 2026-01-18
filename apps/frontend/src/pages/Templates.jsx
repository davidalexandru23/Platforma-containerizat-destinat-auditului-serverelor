import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

function Templates() {
    const { id: urlTemplateId } = useParams();
    const navigate = useNavigate();
    const [templates, setTemplates] = useState([]);
    const [predefinedTemplates, setPredefinedTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [selectedTemplateControls, setSelectedTemplateControls] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadTemplates();
        loadPredefinedTemplates();
    }, []);

    // handle URL param pt acces direct template
    useEffect(() => {
        if (urlTemplateId && templates.length > 0) {
            // selecteaza doar daca nu e deja selectat
            if (!selectedTemplate || selectedTemplate.id !== urlTemplateId) {
                const template = templates.find(t => t.id === urlTemplateId);
                if (template) {
                    handleSelectTemplate({ ...template, source: 'saved' });
                }
            }
        }
    }, [urlTemplateId, templates]);

    const loadTemplates = async () => {
        try {
            const response = await api.get('/templates');
            setTemplates(response.data || []);
        } catch (error) {
            console.error('Error loading templates:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadPredefinedTemplates = async () => {
        try {
            const response = await api.get('/templates/predefined');
            setPredefinedTemplates(response.data || []);
        } catch (error) {
            console.error('Error loading predefined templates:', error);
        }
    };

    // lista combinata toate templateurile
    const getAllTemplates = () => {
        const saved = templates.map(t => ({ ...t, source: 'saved' }));
        const predefined = predefinedTemplates.map(pt => ({
            id: `predefined-${pt.filename}`,
            name: pt.name,
            description: pt.description,
            type: pt.type,
            controlsCount: pt.controlsCount,
            filename: pt.filename,
            source: 'predefined',
            versions: [{ isActive: true }]
        }));
        return [...saved, ...predefined];
    };

    const getFilteredTemplates = () => {
        let all = getAllTemplates();

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            all = all.filter(t =>
                t.name?.toLowerCase().includes(q) ||
                t.description?.toLowerCase().includes(q) ||
                t.type?.toLowerCase().includes(q)
            );
        }

        if (filter === 'published') return all.filter(t => t.source === 'saved' && t.versions?.some(v => v.isActive));
        if (filter === 'draft') return all.filter(t => t.source === 'saved' && !t.versions?.some(v => v.isActive));
        if (filter === 'predefined') return all.filter(t => t.source === 'predefined');
        return all;
    };

    const formatDate = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('ro-RO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const handleSelectTemplate = async (template) => {
        // Ensure source is preserved
        const templateWithSource = { ...template, source: template.source || 'saved' };
        setSelectedTemplate(templateWithSource);

        if (templateWithSource.source === 'predefined') {
            // Load controls from predefined JSON
            try {
                const response = await api.get(`/templates/predefined/${templateWithSource.filename}`);
                setSelectedTemplateControls(response.data?.controls || []);
            } catch (e) {
                console.error('Error loading predefined controls:', e);
                setSelectedTemplateControls([]);
            }
        } else {
            // Load controls from saved template
            try {
                const response = await api.get(`/templates/${templateWithSource.id}`);
                const version = response.data?.versions?.[0];
                setSelectedTemplateControls(version?.controls || []);
                // Update with full data but keep source
                setSelectedTemplate({ ...response.data, source: 'saved' });
            } catch (e) {
                console.error('Error loading template controls:', e);
                setSelectedTemplateControls([]);
            }
        }

        // Update URL only if needed to avoid triggering useEffect loop
        if (templateWithSource.source === 'saved' && urlTemplateId !== templateWithSource.id) {
            navigate(`/templates/${templateWithSource.id}`, { replace: true });
        } else if (templateWithSource.source === 'predefined' && urlTemplateId) {
            navigate('/templates', { replace: true });
        }
    };

    const handleExport = async () => {
        if (!selectedTemplate) return;
        try {
            let jsonData;
            if (selectedTemplate.source === 'predefined') {
                const response = await api.get(`/templates/predefined/${selectedTemplate.filename}`);
                jsonData = response.data;
            } else {
                const response = await api.get(`/templates/${selectedTemplate.id}/exportJson`);
                jsonData = response.data;
            }
            const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${selectedTemplate.name.replace(/\s+/g, '_')}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export error:', error);
            alert('Eroare la export');
        }
    };

    const handlePublish = async () => {
        if (!selectedTemplate || selectedTemplate.source === 'predefined') return;
        try {
            await api.put(`/templates/${selectedTemplate.id}/publish`);
            loadTemplates();
            alert('Template publicat cu succes!');
        } catch (error) {
            console.error('Publish error:', error);
            alert(error.response?.data?.message || 'Eroare la publicare');
        }
    };

    const handleDelete = async () => {
        if (!selectedTemplate || selectedTemplate.source === 'predefined') return;
        if (!confirm(`Esti sigur ca vrei sa stergi template-ul "${selectedTemplate.name}"?`)) return;
        try {
            await api.delete(`/templates/${selectedTemplate.id}`);
            setSelectedTemplate(null);
            setSelectedTemplateControls([]);
            navigate('/templates', { replace: true });
            loadTemplates();
        } catch (error) {
            console.error('Delete error:', error);
            alert(error.response?.data?.message || 'Eroare la stergere');
        }
    };

    const isPublished = (template) => {
        return template?.source === 'predefined' || template?.versions?.some(v => v.isActive);
    };

    const getControlsCount = (template) => {
        if (template?.source === 'predefined') return template.controlsCount || 0;
        const activeVersion = template?.versions?.find(v => v.isActive) || template?.versions?.[0];
        return activeVersion?._count?.controls || activeVersion?.controls?.length || 0;
    };

    const filteredTemplates = getFilteredTemplates();

    return (
        <div className="templates-page" style={{ display: 'flex', gap: '1.5rem', height: 'calc(100vh - 180px)' }}>
            {/* Left Panel - Template List */}
            <div style={{ width: '400px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Header */}
                <div>
                    <h1 className="page-title">Template-uri Audit</h1>
                    <p className="page-subtitle">Gestioneaza si versioneaza standardele de audit.</p>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
                        <span className="material-symbols-outlined">upload_file</span>
                        Import JSON
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                        <span className="material-symbols-outlined">add_circle</span>
                        Creeaza Nou
                    </button>
                </div>

                {/* Search */}
                <div className="search-box">
                    <span className="material-symbols-outlined">search</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Cauta template-uri..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: '2.5rem' }}
                    />
                </div>

                {/* Filter Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {[
                        { key: 'all', label: 'Toate' },
                        { key: 'predefined', label: 'Predefinit' },
                        { key: 'published', label: 'Publicate' },
                        { key: 'draft', label: 'Draft' }
                    ].map(f => (
                        <button
                            key={f.key}
                            className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilter(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Template List */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {loading ? (
                        <div className="empty-state" style={{ padding: '2rem' }}>
                            <div className="spinner"></div>
                        </div>
                    ) : filteredTemplates.length === 0 ? (
                        <div className="empty-state">
                            <span className="material-symbols-outlined">description</span>
                            <p>Nu exista template-uri.</p>
                        </div>
                    ) : (
                        filteredTemplates.map(template => (
                            <div
                                key={template.id}
                                onClick={() => handleSelectTemplate(template)}
                                className="card"
                                style={{
                                    cursor: 'pointer',
                                    border: selectedTemplate?.id === template.id ? '2px solid var(--primary)' : '1px solid var(--border-light)',
                                    padding: '1rem'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                    <div>
                                        <h3 style={{ fontWeight: 700, fontSize: '0.875rem' }}>{template.name}</h3>
                                        {template.source === 'saved' && (
                                            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                                                ID: {template.id?.slice(0, 8)}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                        {template.source === 'predefined' && (
                                            <span className="badge badge-info">Predefinit</span>
                                        )}
                                        {template.source === 'saved' && (
                                            <span className={`badge ${isPublished(template) ? 'badge-success' : 'badge-neutral'}`}>
                                                {isPublished(template) ? 'Publicat' : 'Draft'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                    {template.type && (
                                        <span className="badge badge-neutral" style={{ fontSize: '0.625rem' }}>{template.type}</span>
                                    )}
                                    <span className="badge badge-neutral" style={{ fontSize: '0.625rem' }}>
                                        {getControlsCount(template)} controale
                                    </span>
                                </div>
                                {template.updatedAt && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>schedule</span>
                                        {formatDate(template.updatedAt)}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Right Panel - Template Detail */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {selectedTemplate ? (
                    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Detail Header */}
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-light)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{
                                        width: '48px',
                                        height: '48px',
                                        background: selectedTemplate.source === 'predefined' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                        borderRadius: 'var(--radius-lg)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: selectedTemplate.source === 'predefined' ? 'var(--success)' : 'var(--info)'
                                    }}>
                                        <span className="material-symbols-outlined">
                                            {selectedTemplate.source === 'predefined' ? 'verified' : 'shield'}
                                        </span>
                                    </div>
                                    <div>
                                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {selectedTemplate.name}
                                            {selectedTemplate.source === 'predefined' && (
                                                <span className="badge badge-info">Predefinit</span>
                                            )}
                                            {selectedTemplate.source === 'saved' && (
                                                <span className={`badge ${isPublished(selectedTemplate) ? 'badge-success' : 'badge-neutral'}`}>
                                                    {isPublished(selectedTemplate) ? 'Publicat' : 'Draft'}
                                                </span>
                                            )}
                                        </h2>
                                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                            {selectedTemplate.description || 'Fara descriere'}
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {selectedTemplate.source === 'saved' && !isPublished(selectedTemplate) && (
                                        <button className="btn btn-primary btn-sm" onClick={handlePublish}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>publish</span>
                                            Publica
                                        </button>
                                    )}
                                    {selectedTemplate.source === 'saved' && (
                                        <button className="btn btn-secondary btn-sm" onClick={() => setShowEditModal(true)}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                                            Editeaza
                                        </button>
                                    )}
                                    <button className="btn btn-secondary btn-sm" onClick={handleExport}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                                        Export
                                    </button>
                                    {selectedTemplate.source === 'saved' && !selectedTemplate.isBuiltIn && (
                                        <button className="btn btn-secondary btn-sm" onClick={handleDelete} style={{ color: 'var(--danger)' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Metadata */}
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Standard
                                    </span>
                                    <p style={{ fontWeight: 500, marginTop: '0.25rem' }}>{selectedTemplate.type || 'Custom'}</p>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Controale
                                    </span>
                                    <p style={{ fontWeight: 500, marginTop: '0.25rem' }}>
                                        {selectedTemplateControls.length} controale
                                    </p>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Sursa / Creator
                                    </span>
                                    <p style={{ fontWeight: 500, marginTop: '0.25rem' }}>
                                        {selectedTemplate.source === 'predefined'
                                            ? 'Predefinit (BitTrail)'
                                            : selectedTemplate.creator
                                                ? `${selectedTemplate.creator.firstName || ''} ${selectedTemplate.creator.lastName || ''}`.trim() || selectedTemplate.creator.email
                                                : 'Necunoscut'
                                        }
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Controls List */}
                        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
                            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '1rem' }}>
                                Controale ({selectedTemplateControls.length})
                            </h3>
                            {selectedTemplateControls.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {selectedTemplateControls.slice(0, 20).map((control, i) => (
                                        <ControlCard key={i} control={control} />
                                    ))}
                                    {selectedTemplateControls.length > 20 && (
                                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', padding: '1rem' }}>
                                            ...si inca {selectedTemplateControls.length - 20} controale
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <span className="material-symbols-outlined">playlist_add</span>
                                    <p>Acest template nu are controale.</p>
                                    {selectedTemplate.source === 'saved' && (
                                        <button className="btn btn-primary" onClick={() => setShowEditModal(true)} style={{ marginTop: '1rem' }}>
                                            Adauga Controale
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="card empty-state" style={{ height: '100%' }}>
                        <span className="material-symbols-outlined">description</span>
                        <p>Selecteaza un template pentru a vedea detaliile.</p>
                    </div>
                )}
            </div>

            {/* Import Modal */}
            {showImportModal && (
                <ImportTemplateModal
                    predefinedTemplates={predefinedTemplates}
                    onClose={() => setShowImportModal(false)}
                    onSuccess={() => {
                        setShowImportModal(false);
                        loadTemplates();
                    }}
                />
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <CreateTemplateModal
                    predefinedTemplates={predefinedTemplates}
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => {
                        setShowCreateModal(false);
                        loadTemplates();
                    }}
                />
            )}

            {/* Edit Modal */}
            {showEditModal && selectedTemplate && (
                <EditTemplateModal
                    template={selectedTemplate}
                    controls={selectedTemplateControls}
                    predefinedTemplates={predefinedTemplates}
                    onClose={() => setShowEditModal(false)}
                    onSuccess={() => {
                        setShowEditModal(false);
                        loadTemplates();
                        handleSelectTemplate(selectedTemplate);
                    }}
                />
            )}
        </div>
    );
}

function ControlCard({ control }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            style={{
                padding: '1rem',
                background: 'var(--bg-light)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)',
                cursor: 'pointer'
            }}
            onClick={() => setExpanded(!expanded)}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.75rem',
                            color: 'var(--primary)',
                            fontWeight: 600
                        }}>
                            {control.controlId}
                        </span>
                        <span className={`badge ${control.severity === 'CRITICAL' ? 'badge-danger' :
                            control.severity === 'HIGH' ? 'badge-warning' :
                                control.severity === 'MEDIUM' ? 'badge-info' : 'badge-neutral'
                            }`} style={{ fontSize: '0.625rem' }}>
                            {control.severity}
                        </span>
                    </div>
                    <h4 style={{ fontWeight: 600, fontSize: '0.875rem' }}>{control.title}</h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {control.category}
                    </p>
                </div>
                <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)', fontSize: '20px' }}>
                    {expanded ? 'expand_less' : 'expand_more'}
                </span>
            </div>

            {expanded && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
                    {control.rationale && (
                        <div style={{ marginBottom: '0.75rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Rationale:</span>
                            <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>{control.rationale}</p>
                        </div>
                    )}
                    {control.automatedChecks?.length > 0 && (
                        <div style={{ marginBottom: '0.75rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--success)' }}>
                                {control.automatedChecks.length} Check-uri Automate
                            </span>
                            {control.automatedChecks.map((check, i) => (
                                <div key={i} style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--surface-light)', borderRadius: 'var(--radius-md)', fontSize: '0.75rem' }}>
                                    <strong>{check.checkId}:</strong> {check.title}
                                    {check.command && (
                                        <pre style={{ marginTop: '0.25rem', padding: '0.25rem', background: 'var(--bg-dark)', color: 'var(--text-light)', borderRadius: 'var(--radius-sm)', fontSize: '0.625rem', overflow: 'auto' }}>
                                            {check.command}
                                        </pre>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {control.manualChecks?.length > 0 && (
                        <div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--warning)' }}>
                                {control.manualChecks.length} Check-uri Manuale
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function CreateTemplateModal({ predefinedTemplates, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        type: 'CUSTOM'
    });
    const [selectedPredefined, setSelectedPredefined] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (selectedPredefined) {
                const contentRes = await api.get(`/templates/predefined/${selectedPredefined}`);
                const content = contentRes.data;
                if (formData.name) content.metadata.name = formData.name;
                if (formData.description) content.metadata.description = formData.description;
                await api.post('/templates/importJson', content);
            } else {
                await api.post('/templates', formData);
            }
            onSuccess();
        } catch (err) {
            setError(err.response?.data?.message || 'Eroare la creare template');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Creeaza Template</h2>
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

                        {predefinedTemplates.length > 0 && (
                            <div className="form-group">
                                <label className="form-label">Porneste de la template predefinit</label>
                                <select
                                    className="input"
                                    value={selectedPredefined}
                                    onChange={e => setSelectedPredefined(e.target.value)}
                                >
                                    <option value="">Template gol</option>
                                    {predefinedTemplates.map((pt, i) => (
                                        <option key={i} value={pt.filename}>
                                            {pt.name} ({pt.controlsCount} controale)
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {!selectedPredefined && (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Nume Template</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        required={!selectedPredefined}
                                        placeholder="ex: Audit Securitate Baza"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Descriere</label>
                                    <textarea
                                        className="input"
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Descrierea scopului acestui template..."
                                        rows={3}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Tip Standard</label>
                                    <select
                                        className="input"
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                                    >
                                        <option value="CUSTOM">Custom</option>
                                        <option value="CIS_BENCHMARK">CIS Benchmark</option>
                                        <option value="CIS_CONTROLS">CIS Controls</option>
                                    </select>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Anuleaza
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? <div className="spinner"></div> : 'Creeaza Template'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ImportTemplateModal({ predefinedTemplates, onClose, onSuccess }) {
    const [jsonContent, setJsonContent] = useState('');
    const [selectedPredefined, setSelectedPredefined] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLoadPredefined = async (filename) => {
        setSelectedPredefined(filename);
        if (filename) {
            try {
                const response = await api.get(`/templates/predefined/${filename}`);
                setJsonContent(JSON.stringify(response.data, null, 2));
            } catch (err) {
                setError('Eroare la incarcarea template-ului predefinit');
            }
        }
    };

    const handleImport = async () => {
        setLoading(true);
        setError('');

        try {
            const data = JSON.parse(jsonContent);
            await api.post('/templates/importJson', data);
            onSuccess();
        } catch (err) {
            if (err instanceof SyntaxError) {
                setError('JSON invalid');
            } else {
                setError(err.response?.data?.message || 'Eroare la import');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Import Template JSON</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {error && (
                        <div className="alert alert-error mb-md">
                            <span className="material-symbols-outlined">error</span>
                            {error}
                        </div>
                    )}

                    {predefinedTemplates.length > 0 && (
                        <div className="form-group">
                            <label className="form-label">Incarca din template predefinit</label>
                            <select
                                className="input"
                                value={selectedPredefined}
                                onChange={e => handleLoadPredefined(e.target.value)}
                            >
                                <option value="">Selecteaza template...</option>
                                {predefinedTemplates.map((pt, i) => (
                                    <option key={i} value={pt.filename}>
                                        {pt.name} ({pt.controlsCount} controale)
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Continut JSON</label>
                        <textarea
                            className="input"
                            rows={15}
                            placeholder='{"$schema": "bittrail-template@1.0", "metadata": {...}, "controls": [...] }'
                            value={jsonContent}
                            onChange={(e) => setJsonContent(e.target.value)}
                            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
                        />
                    </div>
                </div>
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onClose}>Anuleaza</button>
                    <button className="btn btn-primary" onClick={handleImport} disabled={loading || !jsonContent}>
                        {loading ? <div className="spinner"></div> : 'Importa Template'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- Modal Components ---

function AddControlModal({ show, onClose, onAdd, predefinedTemplates }) {
    if (!show) return null;

    const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'custom'
    const [selectedCatalogControl, setSelectedCatalogControl] = useState(null);
    const [catalogControls, setCatalogControls] = useState([]);
    const [loadingCatalog, setLoadingCatalog] = useState(false);

    const [customControl, setCustomControl] = useState({
        controlId: '',
        title: '',
        category: '',
        severity: 'MEDIUM',
        rationale: '',
        automatedChecks: [],
        manualChecks: []
    });

    // Catalog filtering
    const [filters, setFilters] = useState({ severity: 'ALL', standard: 'ALL', os: 'ALL' });
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch catalog controls when tab is active
    useEffect(() => {
        if (activeTab === 'catalog' && predefinedTemplates.length > 0 && catalogControls.length === 0) {
            const fetchCatalog = async () => {
                setLoadingCatalog(true);
                try {
                    const promises = predefinedTemplates.map(t =>
                        api.get(`/templates/predefined/${t.filename}`)
                            .then(res => ({ ...res.data, sourceStandard: t.name }))
                            .catch(err => null)
                    );
                    const results = await Promise.all(promises);

                    let all = [];
                    results.forEach(t => {
                        if (t && t.controls) {
                            t.controls.forEach(c => all.push({ ...c, sourceStandard: t.sourceStandard }));
                        }
                    });
                    setCatalogControls(all);
                } catch (error) {
                    console.error("Error fetching catalog:", error);
                } finally {
                    setLoadingCatalog(false);
                }
            };
            fetchCatalog();
        }
    }, [activeTab, predefinedTemplates, catalogControls.length]);

    const getFilteredControls = () => {
        return catalogControls.filter(c => {
            const matchSearch = c.title.toLowerCase().includes(searchTerm.toLowerCase()) || c.controlId.toLowerCase().includes(searchTerm.toLowerCase());
            const matchSeverity = filters.severity === 'ALL' || c.severity === filters.severity;
            const matchStandard = filters.standard === 'ALL' || c.sourceStandard.includes(filters.standard);
            return matchSearch && matchSeverity && matchStandard;
        });
    };

    const handleAddCatalog = () => {
        if (selectedCatalogControl) {
            onAdd({ ...selectedCatalogControl }); // Copy control
            onClose();
        }
    };

    const handleAddCustom = () => {
        if (!customControl.controlId || !customControl.title) {
            alert('ID si Titlu sunt obligatorii');
            return;
        }
        onAdd(customControl);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ height: '80vh', maxWidth: '900px', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Adauga Control</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div style={{ padding: '0 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
                    <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
                        <button className={`tab ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')}>Catalog (Predefinite)</button>
                        <button className={`tab ${activeTab === 'custom' ? 'active' : ''}`} onClick={() => setActiveTab('custom')}>Custom (Nou)</button>
                    </div>
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {activeTab === 'catalog' ? (
                        <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>
                            {/* Filters Sidebar */}
                            <div style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--border-light)', paddingRight: '1rem', overflowY: 'auto' }}>
                                <h4 style={{ marginBottom: '1rem' }}>Filtre</h4>
                                <div className="form-group mb-md">
                                    <label className="form-label">Severitate</label>
                                    <select className="input" value={filters.severity} onChange={e => setFilters({ ...filters, severity: e.target.value })}>
                                        <option value="ALL">Toate</option>
                                        <option value="CRITICAL">Critical</option>
                                        <option value="HIGH">High</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="LOW">Low</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Cautare</label>
                                    <input className="input" placeholder="Titlu sau ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                </div>
                            </div>

                            {/* Catalog List */}
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {loadingCatalog ? (
                                    <div className="empty-state">
                                        <div className="spinner"></div>
                                        <p>Incarc catalog...</p>
                                    </div>
                                ) : (
                                    <>
                                        {getFilteredControls().map((c, idx) => (
                                            <div
                                                key={idx}
                                                className={`card ${selectedCatalogControl === c ? 'selected-card' : ''}`}
                                                style={{
                                                    marginBottom: '0.75rem',
                                                    cursor: 'pointer',
                                                    padding: '1rem',
                                                    border: selectedCatalogControl === c ? '2px solid var(--primary)' : '1px solid var(--border-light)'
                                                }}
                                                onClick={() => setSelectedCatalogControl(c)}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                    <strong style={{ fontSize: '0.9rem' }}>{c.controlId} - {c.title}</strong>
                                                    <span className={`badge ${c.severity === 'CRITICAL' ? 'badge-danger' : c.severity === 'HIGH' ? 'badge-warning' : 'badge-info'}`}>{c.severity}</span>
                                                </div>
                                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>Sursa: {c.sourceStandard}</div>
                                            </div>
                                        ))}
                                        {getFilteredControls().length === 0 && (
                                            <div className="text-center text-muted" style={{ padding: '2rem' }}>Nu am gasit controale.</div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label className="form-label">ID Control *</label>
                                <input className="input" value={customControl.controlId} onChange={e => setCustomControl({ ...customControl, controlId: e.target.value })} placeholder="ex: 1.1" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Severitate</label>
                                <select className="input" value={customControl.severity} onChange={e => setCustomControl({ ...customControl, severity: e.target.value })}>
                                    <option value="CRITICAL">Critical</option>
                                    <option value="HIGH">High</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="LOW">Low</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Titlu *</label>
                                <input className="input" value={customControl.title} onChange={e => setCustomControl({ ...customControl, title: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Categorie</label>
                                <input className="input" value={customControl.category} onChange={e => setCustomControl({ ...customControl, category: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Rationale</label>
                                <textarea className="input" rows={3} value={customControl.rationale} onChange={e => setCustomControl({ ...customControl, rationale: e.target.value })} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onClose}>Anuleaza</button>
                    <button className="btn btn-primary" onClick={activeTab === 'catalog' ? handleAddCatalog : handleAddCustom} disabled={activeTab === 'catalog' && !selectedCatalogControl}>Adauga Control</button>
                </div>
            </div>
        </div>
    );
}

function ControlEditorModal({ control, onSave, onClose }) {
    if (!control) return null;

    const [editedControl, setEditedControl] = useState({ ...control });
    const [activeTab, setActiveTab] = useState('general');

    // Helper for nested updates
    const updateControl = (field, value) => setEditedControl(prev => ({ ...prev, [field]: value }));

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ height: '90vh', maxWidth: '1000px', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Editare Control: {editedControl.controlId}</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div style={{ padding: '0 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
                    <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
                        <button className={`tab ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General</button>
                        <button className={`tab ${activeTab === 'automated' ? 'active' : ''}`} onClick={() => setActiveTab('automated')}>Automated Checks</button>
                        <button className={`tab ${activeTab === 'manual' ? 'active' : ''}`} onClick={() => setActiveTab('manual')}>Manual Checks</button>
                    </div>
                </div>

                <div className="modal-body">
                    {activeTab === 'general' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
                            <div className="form-group">
                                <label className="form-label">ID Control</label>
                                <input className="input" value={editedControl.controlId} onChange={e => updateControl('controlId', e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Categorie</label>
                                <input className="input" value={editedControl.category} onChange={e => updateControl('category', e.target.value)} />
                            </div>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Titlu</label>
                                <input className="input" value={editedControl.title} onChange={e => updateControl('title', e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Severitate</label>
                                <select className="input" value={editedControl.severity} onChange={e => updateControl('severity', e.target.value)}>
                                    <option value="CRITICAL">Critical</option>
                                    <option value="HIGH">High</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="LOW">Low</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Rationale</label>
                                <textarea className="input" rows={6} value={editedControl.rationale || ''} onChange={e => updateControl('rationale', e.target.value)} />
                            </div>
                        </div>
                    )}

                    {activeTab === 'automated' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                                <button className="btn btn-sm btn-secondary" onClick={() => {
                                    const newCheck = {
                                        checkId: `${editedControl.controlId}.A${(editedControl.automatedChecks?.length || 0) + 1}`,
                                        title: 'New Check',
                                        command: '',
                                        expectedResult: '0',
                                        comparison: 'EQUALS',
                                        parser: 'RAW',
                                        onFailMessage: ''
                                    };
                                    updateControl('automatedChecks', [...(editedControl.automatedChecks || []), newCheck]);
                                }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Check Automat
                                </button>
                            </div>
                            {editedControl.automatedChecks?.map((check, idx) => (
                                <div key={idx} className="card mb-md" style={{ background: 'var(--bg-light)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">ID Check</label>
                                            <input className="input" value={check.checkId} onChange={e => {
                                                const updated = [...editedControl.automatedChecks];
                                                updated[idx].checkId = e.target.value;
                                                updateControl('automatedChecks', updated);
                                            }} />
                                        </div>
                                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                            <label className="form-label">Titlu</label>
                                            <input className="input" value={check.title} onChange={e => {
                                                const updated = [...editedControl.automatedChecks];
                                                updated[idx].title = e.target.value;
                                                updateControl('automatedChecks', updated);
                                            }} />
                                        </div>
                                        <div className="form-group" style={{ gridColumn: 'span 3' }}>
                                            <label className="form-label">Comanda (Shell)</label>
                                            <textarea className="input font-mono" rows={3} value={check.command} onChange={e => {
                                                const updated = [...editedControl.automatedChecks];
                                                updated[idx].command = e.target.value;
                                                updateControl('automatedChecks', updated);
                                            }} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Operator</label>
                                            <select className="input" value={check.comparison || 'EQUALS'} onChange={e => {
                                                const updated = [...editedControl.automatedChecks];
                                                updated[idx].comparison = e.target.value;
                                                updateControl('automatedChecks', updated);
                                            }}>
                                                <option value="EQUALS">Egal (String)</option>
                                                <option value="CONTAINS">Contine</option>
                                                <option value="REGEX">Regex Match</option>
                                                <option value="NUM_EQ">Egal (Numeric)</option>
                                                <option value="NUM_GE">Mai mare sau egal</option>
                                                <option value="NUM_LE">Mai mic sau egal</option>
                                                <option value="EXIT_CODE">Exit Code</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Valoare Asteptata</label>
                                            <input className="input" value={check.expectedResult} onChange={e => {
                                                const updated = [...editedControl.automatedChecks];
                                                updated[idx].expectedResult = e.target.value;
                                                updateControl('automatedChecks', updated);
                                            }} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Parser</label>
                                            <select className="input" value={check.parser || 'RAW'} onChange={e => {
                                                const updated = [...editedControl.automatedChecks];
                                                updated[idx].parser = e.target.value;
                                                updateControl('automatedChecks', updated);
                                            }}>
                                                <option value="RAW">Raw Output</option>
                                                <option value="JSON">JSON</option>
                                                <option value="INT">Integer</option>
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ gridColumn: 'span 3' }}>
                                            <label className="form-label">Mesaj Eroare (Optional)</label>
                                            <input className="input" value={check.onFailMessage || ''} placeholder="Mesaj afisat cand check-ul esueaza" onChange={e => {
                                                const updated = [...editedControl.automatedChecks];
                                                updated[idx].onFailMessage = e.target.value;
                                                updateControl('automatedChecks', updated);
                                            }} />
                                        </div>
                                        <div className="form-group" style={{ gridColumn: 'span 3', textAlign: 'right' }}>
                                            <button className="btn btn-sm btn-danger" onClick={() => {
                                                const updated = editedControl.automatedChecks.filter((_, i) => i !== idx);
                                                updateControl('automatedChecks', updated);
                                            }}>Sterge Check</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'manual' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                                <button className="btn btn-sm btn-secondary" onClick={() => {
                                    const newCheck = {
                                        checkId: `${editedControl.controlId}.M${(editedControl.manualChecks?.length || 0) + 1}`,
                                        title: 'Manual Task',
                                        instructions: '',
                                        evidenceSpec: { allowUpload: true, allowLink: true, requiresApproval: true }
                                    };
                                    updateControl('manualChecks', [...(editedControl.manualChecks || []), newCheck]);
                                }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Task Manual
                                </button>
                            </div>
                            {editedControl.manualChecks?.map((check, idx) => (
                                <div key={idx} className="card mb-md" style={{ background: 'var(--bg-light)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">ID Task</label>
                                            <input className="input" value={check.checkId} onChange={e => {
                                                const updated = [...editedControl.manualChecks];
                                                updated[idx].checkId = e.target.value;
                                                updateControl('manualChecks', updated);
                                            }} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Titlu</label>
                                            <input className="input" value={check.title} onChange={e => {
                                                const updated = [...editedControl.manualChecks];
                                                updated[idx].title = e.target.value;
                                                updateControl('manualChecks', updated);
                                            }} />
                                        </div>
                                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                            <label className="form-label">Instructiuni</label>
                                            <textarea className="input" rows={3} value={check.instructions} onChange={e => {
                                                const updated = [...editedControl.manualChecks];
                                                updated[idx].instructions = e.target.value;
                                                updateControl('manualChecks', updated);
                                            }} />
                                        </div>
                                        {/* Evidence Spec Toggles */}
                                        <div className="form-group" style={{ gridColumn: 'span 2', display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                                                <input type="checkbox" checked={check.evidenceSpec?.allowUpload} onChange={e => {
                                                    const updated = [...editedControl.manualChecks];
                                                    updated[idx].evidenceSpec = { ...updated[idx].evidenceSpec, allowUpload: e.target.checked };
                                                    updateControl('manualChecks', updated);
                                                }} />
                                                Allow Upload
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                                                <input type="checkbox" checked={check.evidenceSpec?.allowLink} onChange={e => {
                                                    const updated = [...editedControl.manualChecks];
                                                    updated[idx].evidenceSpec = { ...updated[idx].evidenceSpec, allowLink: e.target.checked };
                                                    updateControl('manualChecks', updated);
                                                }} />
                                                Allow Link
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                                                <input type="checkbox" checked={check.evidenceSpec?.requiresApproval} onChange={e => {
                                                    const updated = [...editedControl.manualChecks];
                                                    updated[idx].evidenceSpec = { ...updated[idx].evidenceSpec, requiresApproval: e.target.checked };
                                                    updateControl('manualChecks', updated);
                                                }} />
                                                Requires Approval
                                            </label>
                                        </div>
                                        <div className="form-group" style={{ gridColumn: 'span 2', textAlign: 'right', marginTop: '0.5rem' }}>
                                            <button className="btn btn-sm btn-danger" onClick={() => {
                                                const updated = editedControl.manualChecks.filter((_, i) => i !== idx);
                                                updateControl('manualChecks', updated);
                                            }}>Sterge Task</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onClose}>Anuleaza</button>
                    <button className="btn btn-primary" onClick={() => onSave(editedControl)}>Salveaza Modificari</button>
                </div>
            </div>
        </div>
    );
}

function EditTemplateModal({ template, controls, onClose, onSuccess, predefinedTemplates }) {
    const [editMode, setEditMode] = useState('ui'); // 'ui' or 'json'
    const [editableControls, setEditableControls] = useState([...controls]);
    const [jsonContent, setJsonContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // UI State
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingControlIndex, setEditingControlIndex] = useState(null); // Index of control being edited

    // Initialize JSON content when switching to JSON mode
    useEffect(() => {
        if (editMode === 'json') {
            setJsonContent(JSON.stringify(editableControls, null, 2));
        }
    }, [editMode]);

    // Sync JSON back to UI when valid
    const syncJsonToUi = () => {
        try {
            const parsed = JSON.parse(jsonContent);
            if (Array.isArray(parsed)) {
                setEditableControls(parsed);
                return true;
            }
        } catch (e) { return false; }
        return false;
    };


    const handleSave = async () => {
        setLoading(true);
        setError('');

        try {
            let controlsToSave = editableControls;

            // If in JSON mode, parse the JSON content
            if (editMode === 'json') {
                try {
                    controlsToSave = JSON.parse(jsonContent);
                    if (!Array.isArray(controlsToSave)) {
                        throw new Error('Controalele trebuie sa fie un array');
                    }
                } catch (e) {
                    setError('JSON invalid: ' + e.message);
                    setLoading(false);
                    return;
                }
            }

            await api.put(`/templates/${template.id}/controls`, { controls: controlsToSave });
            onSuccess();
        } catch (err) {
            setError(err.response?.data?.message || 'Eroare la salvare');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-xl" onClick={e => e.stopPropagation()} style={{ maxWidth: '1200px', maxHeight: '95vh' }}>
                <div className="modal-header">
                    <h2>Editeaza Controale - {template.name}</h2>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        {/* Mode Switcher */}
                        <div style={{
                            display: 'flex',
                            backgroundColor: '#fff',
                            borderRadius: '9999px',
                            padding: '4px',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                            border: '1px solid var(--border-light)'
                        }}>
                            <button
                                onClick={() => {
                                    if (editMode === 'json') syncJsonToUi();
                                    setEditMode('ui');
                                }}
                                style={{
                                    border: 'none',
                                    background: editMode === 'ui' ? '#00C853' : 'transparent',
                                    color: editMode === 'ui' ? '#fff' : 'var(--text-color)',
                                    padding: '6px 16px',
                                    borderRadius: '9999px',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s ease',
                                    boxShadow: editMode === 'ui' ? '0 2px 4px rgba(0,200,83,0.3)' : 'none'
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>view_list</span> UI
                            </button>
                            <button
                                onClick={() => setEditMode('json')}
                                style={{
                                    border: 'none',
                                    background: editMode === 'json' ? '#00C853' : 'transparent',
                                    color: editMode === 'json' ? '#fff' : 'var(--text-color)',
                                    padding: '6px 16px',
                                    borderRadius: '9999px',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s ease',
                                    boxShadow: editMode === 'json' ? '0 2px 4px rgba(0,200,83,0.3)' : 'none'
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>code</span> JSON
                            </button>
                        </div>
                        <button className="modal-close" onClick={onClose}>&times;</button>
                    </div>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'hidden' }}>
                    {error && (
                        <div className="alert alert-error">
                            <span className="material-symbols-outlined">error</span>
                            {error}
                        </div>
                    )}

                    {editMode === 'ui' ? (
                        <>
                            <div className="toolbar" style={{ justifyContent: 'flex-end', paddingBottom: '1rem' }}>
                                <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                                    <span className="material-symbols-outlined">add</span>
                                    Adauga Control
                                </button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {editableControls.length === 0 && <div className="text-center text-muted p-4">Niciun control definit. Adauga unul din catalog.</div>}
                                {editableControls.map((control, idx) => (
                                    <div key={idx} className="card p-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{control.controlId}</span>
                                                <span>{control.title}</span>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                {control.category} &bull; {control.severity} &bull; {(control.automatedChecks?.length || 0)} auto, {(control.manualChecks?.length || 0)} manual
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button className="btn btn-sm btn-secondary" onClick={() => setEditingControlIndex(idx)}>
                                                <span className="material-symbols-outlined">edit</span>
                                            </button>
                                            <button className="btn btn-sm btn-danger" onClick={() => {
                                                const updated = editableControls.filter((_, i) => i !== idx);
                                                setEditableControls(updated);
                                            }}>
                                                <span className="material-symbols-outlined">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Editeaza direct array-ul de controale in format JSON
                            </div>
                            <textarea
                                className="input"
                                value={jsonContent}
                                onChange={(e) => setJsonContent(e.target.value)}
                                style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '0.75rem',
                                    minHeight: '400px',
                                    resize: 'vertical'
                                }}
                                placeholder='[{"controlId": "1.1", "title": "...", "category": "...", "severity": "MEDIUM"}]'
                            />
                        </div>
                    )}
                </div>
                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>
                        Anuleaza
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={loading}
                    >
                        {loading ? <div className="spinner"></div> : (
                            <>
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
                                Salveaza Controale
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Nested Modals */}
            <AddControlModal
                show={showAddModal}
                onClose={() => setShowAddModal(false)}
                predefinedTemplates={predefinedTemplates}
                onAdd={(newControl) => setEditableControls([...editableControls, newControl])}
            />

            {editingControlIndex !== null && (
                <ControlEditorModal
                    control={editableControls[editingControlIndex]}
                    onClose={() => setEditingControlIndex(null)}
                    onSave={(updatedControl) => {
                        const updated = [...editableControls];
                        updated[editingControlIndex] = updatedControl;
                        setEditableControls(updated);
                        setEditingControlIndex(null);
                    }}
                />
            )}
        </div>
    );
}

export default Templates;
