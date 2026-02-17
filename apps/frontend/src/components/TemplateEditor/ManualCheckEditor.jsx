import React from 'react';

export default function ManualCheckEditor({ check, onChange }) {

    const handleChange = (field, value) => {
        onChange({ ...check, [field]: value });
    };

    const toggleEvidence = (field) => {
        const currentSpec = check.evidenceSpec || { allowUpload: true, allowLink: true, requiresApproval: false };
        const newSpec = { ...currentSpec, [field]: !currentSpec[field] };
        handleChange('evidenceSpec', newSpec);
    };

    return (
        <div className="manual-check-editor" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Titlu gestionat de parinte (Titlu si ID) */}

            <div className="form-group">
                <label className="form-label">Instructiuni pentru Auditor</label>
                <textarea
                    className="input"
                    value={check.instructions || ''}
                    onChange={e => handleChange('instructions', e.target.value)}
                    placeholder="Descrie pasii manuali pe care trebuie sa ii faca auditorul..."
                    rows={4}
                    style={{ minHeight: '100px' }}
                />
            </div>

            <div className="form-group">
                <label className="form-label">Cerinte Dovezi</label>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', padding: '0.75rem', background: 'var(--bg-light)', borderRadius: 'var(--radius-md)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={check.evidenceSpec?.allowUpload ?? true}
                            onChange={() => toggleEvidence('allowUpload')}
                        />
                        <span>Permite Incarcare Fisier</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={check.evidenceSpec?.allowLink ?? true}
                            onChange={() => toggleEvidence('allowLink')}
                        />
                        <span>Permite Link Extern</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={check.evidenceSpec?.requiresApproval ?? false}
                            onChange={() => toggleEvidence('requiresApproval')}
                        />
                        <span>Necesita Aprobare Manuala</span>
                    </label>
                </div>
            </div>
        </div>
    );
}
