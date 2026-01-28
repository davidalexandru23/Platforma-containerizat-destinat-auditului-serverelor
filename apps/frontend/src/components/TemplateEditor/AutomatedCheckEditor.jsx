import React, { useState, useEffect } from 'react';
import api from '../../api/client';

export default function AutomatedCheckEditor({ check, onChange }) {
    const [servers, setServers] = useState([]);
    const [testServerId, setTestServerId] = useState('');
    const [testResult, setTestResult] = useState(null);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        loadServers();
    }, []);

    const loadServers = async () => {
        try {
            const response = await api.get('/servers');
            // Filtrare servere ONLINE pentru testare
            const online = (response.data || []).filter(s => s.status === 'ONLINE');
            setServers(online);
            if (online.length > 0) {
                setTestServerId(online[0].id);
            }
        } catch (error) {
            console.error('Failed to load servers:', error);
        }
    };

    const handleChange = (field, value) => {
        onChange({ ...check, [field]: value });
    };

    const handleRunTest = async () => {
        if (!testServerId) return;
        setTesting(true);
        setTestResult(null);

        try {
            const payload = {
                command: check.command,
                checkType: 'COMMAND',
                comparison: check.comparison || 'EQUALS',
                parser: check.parser || 'RAW',
                normalize: check.normalize || [],
                expectedResult: check.expectedResult
            };

            const response = await api.post(`/servers/${testServerId}/run-check`, payload);
            setTestResult(response.data);
        } catch (error) {
            setTestResult({
                status: 'ERROR',
                errorMessage: error.response?.data?.message || error.message || 'Error running check'
            });
        } finally {
            setTesting(false);
        }
    };

    const toggleNormalize = (rule) => {
        const current = check.normalize || [];
        if (current.includes(rule)) {
            handleChange('normalize', current.filter(r => r !== rule));
        } else {
            handleChange('normalize', [...current, rule]);
        }
    };

    return (
        <div className="automated-check-editor" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Introducere Comanda */}
            <div className="form-group">
                <label className="form-label">Comanda (Shell)</label>
                <textarea
                    className="input"
                    value={check.command || ''}
                    onChange={e => handleChange('command', e.target.value)}
                    placeholder="ex: grep 'PermitRootLogin' /etc/ssh/sshd_config"
                    rows={3}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Parser */}
                <div className="form-group">
                    <label className="form-label">Parser Output</label>
                    <select
                        className="input"
                        value={check.parser || 'RAW'}
                        onChange={e => handleChange('parser', e.target.value)}
                    >
                        <option value="RAW">Raw Output (Text)</option>
                        <option value="FIRST_LINE">Prima Linie</option>
                        <option value="JSON">JSON (Experimental)</option>
                    </select>
                </div>

                {/* Logica Comparatie */}
                <div className="form-group">
                    <label className="form-label">Logica Comparatie</label>
                    <select
                        className="input"
                        value={check.comparison || 'EQUALS'}
                        onChange={e => handleChange('comparison', e.target.value)}
                    >
                        <option value="EQUALS">Exact Match (Egal)</option>
                        <option value="CONTAINS">Contine (Contains)</option>
                        <option value="REGEX">Regular Expression</option>
                        <option value="NUM_EQ">Numeric Egal (=)</option>
                        <option value="NUM_GE">Numeric Mai Mare sau Egal (&gt;=)</option>
                        <option value="NUM_LE">Numeric Mai Mic sau Egal (&lt;=)</option>
                    </select>
                </div>
            </div>

            {/* Rezultat Asteptat */}
            <div className="form-group">
                <label className="form-label">Valoare Asteptata</label>
                <input
                    type="text"
                    className="input"
                    value={check.expectedResult || ''}
                    onChange={e => handleChange('expectedResult', e.target.value)}
                    placeholder={check.comparison === 'REGEX' ? '^PermitRootLogin no$' : 'no'}
                    style={{ fontFamily: 'var(--font-mono)' }}
                />
            </div>

            {/* Optiuni Normalizare */}
            <div className="form-group">
                <label className="form-label">Normalizare (Pre-procesare)</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                        <input
                            type="checkbox"
                            checked={(check.normalize || []).includes('TRIM')}
                            onChange={() => toggleNormalize('TRIM')}
                        />
                        Trim Whitespace
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                        <input
                            type="checkbox"
                            checked={(check.normalize || []).includes('LOWER')}
                            onChange={() => toggleNormalize('LOWER')}
                        />
                        Lowercase
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                        <input
                            type="checkbox"
                            checked={(check.normalize || []).includes('SQUASH_WS')}
                            onChange={() => toggleNormalize('SQUASH_WS')}
                        />
                        Squash Spaces
                    </label>
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Mesaj la Eroare (Optional)</label>
                <input
                    type="text"
                    className="input"
                    value={check.onFailMessage || ''}
                    onChange={e => handleChange('onFailMessage', e.target.value)}
                    placeholder="ex: SSH Root Login must be disabled"
                />
            </div>

            {/* Sectiune Testare */}
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-light)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>science</span>
                    Test Check (Dry Run)
                </h4>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <select
                        className="input"
                        style={{ flex: 1 }}
                        value={testServerId}
                        onChange={e => setTestServerId(e.target.value)}
                        disabled={testing || servers.length === 0}
                    >
                        {servers.length === 0 && <option value="">Niciun server online</option>}
                        {servers.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.hostname})</option>
                        ))}
                    </select>
                    <button
                        className="btn btn-secondary"
                        onClick={handleRunTest}
                        disabled={testing || !testServerId || !check.command}
                    >
                        {testing ? <div className="spinner" style={{ width: 14, height: 14 }}></div> : 'Ruleaza'}
                    </button>
                </div>

                {testResult && (
                    <div style={{
                        padding: '0.75rem',
                        background: testResult.status === 'PASS' ? 'rgba(16, 185, 129, 0.1)' : testResult.status === 'FAIL' ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface-light)',
                        border: `1px solid ${testResult.status === 'PASS' ? 'var(--success)' : testResult.status === 'FAIL' ? 'var(--danger)' : 'var(--border-light)'}`,
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.875rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontWeight: 600 }}>
                            <span style={{ color: testResult.status === 'PASS' ? 'var(--success)' : testResult.status === 'FAIL' ? 'var(--danger)' : 'var(--text-main)' }}>
                                Status: {testResult.status}
                            </span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {testResult.output || testResult.errorMessage || 'No output'}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
