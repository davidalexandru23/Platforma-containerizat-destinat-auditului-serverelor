import { useState, useEffect } from 'react';
import api from '../api/client';
import './ShareServerModal.css';

function ShareServerModal({ serverId, onClose }) {
    const [users, setUsers] = useState([]);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState('');
    const [capabilities, setCapabilities] = useState(['VIEW']);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadData();
    }, [serverId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [usersRes, permsRes] = await Promise.all([
                api.get('/users'),
                api.get(`/servers/${serverId}/permissions`)
            ]);
            setUsers(usersRes.data || []);
            setPermissions(permsRes.data || []);
        } catch (err) {
            console.error('Eroare la incarcarea datelor:', err);
            setError('Nu am putut incarca informatiile.');
        } finally {
            setLoading(false);
        }
    };

    const handleGrant = async () => {
        if (!selectedUser) return;
        try {
            await api.post(`/servers/${serverId}/permissions`, {
                userId: selectedUser,
                capabilities: capabilities,
                expiresAt: null
            });
            // Reincarcare lista
            const permsRes = await api.get(`/servers/${serverId}/permissions`);
            setPermissions(permsRes.data || []);
            setSelectedUser('');
            setCapabilities(['VIEW']);
        } catch (err) {
            console.error('Eroare la acordarea permisiunii:', err);
            setError(err.response?.data?.message || 'Eroare la salvare.');
        }
    };

    const handleRevoke = async (userId) => {
        if (!confirm('Esti sigur ca vrei sa revoci accesul?')) return;
        try {
            await api.delete(`/servers/${serverId}/permissions/${userId}`);
            setPermissions(permissions.filter(p => p.userId !== userId));
        } catch (err) {
            console.error('Eroare la revocare:', err);
            setError('Nu am putut revoca accesul.');
        }
    };

    const getSelectedUserRole = () => {
        const user = users.find(u => u.id === selectedUser);
        return user?.role?.name?.toUpperCase();
    };

    const isViewer = getSelectedUserRole() === 'VIEWER';

    const toggleCapability = (cap) => {
        if (cap === 'VIEW') return; // Nu permitem debifarea

        // Restrictionare stricta pentru VIEWER
        if (isViewer) {
            // Un Viewer poate avea DOAR 'VIEW'
            return;
        }

        setCapabilities(prev => {
            let newCaps = [...prev];

            if (newCaps.includes(cap)) {
                // Debifare
                newCaps = newCaps.filter(c => c !== cap);

                // Daca debifam AUDIT, debifam si MANAGE
                if (cap === 'AUDIT' && newCaps.includes('MANAGE')) {
                    newCaps = newCaps.filter(c => c !== 'MANAGE');
                }
            } else {
                // Bifare
                newCaps.push(cap);

                // Ierarhie: MANAGE implica AUDIT si VIEW
                if (cap === 'MANAGE') {
                    if (!newCaps.includes('AUDIT')) newCaps.push('AUDIT');
                    if (!newCaps.includes('VIEW')) newCaps.push('VIEW');
                }

                // Ierarhie: AUDIT implica VIEW
                if (cap === 'AUDIT') {
                    if (!newCaps.includes('VIEW')) newCaps.push('VIEW');
                }
            }
            return newCaps;
        });
    };

    if (loading) return <div className="modal-overlay"><div className="spinner"></div></div>;

    // Filtrare utilizatori care deja au acces (pentru dropdown)
    const existingUserIds = permissions.map(p => p.userId);
    const availableUsers = users.filter(u => !existingUserIds.includes(u.id) && u.role.name !== 'ADMIN');

    // Nu mai este nevoie de const isViewer aici, este definit sus

    return (
        <div className="modal-overlay">
            <div className="modal share-modal">
                <div className="modal-header">
                    <h2>Partajeaza Server</h2>
                    <button className="close-btn" onClick={onClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="modal-body">
                    {error && <div className="alert alert-danger">{error}</div>}

                    <div className="share-form">
                        <h3>Adauga Utilizator</h3>
                        <div className="form-group">
                            <select
                                value={selectedUser}
                                onChange={(e) => {
                                    setSelectedUser(e.target.value);
                                    setCapabilities(['VIEW']); // Resetam la default cand schimbam userul
                                }}
                                className="input"
                            >
                                <option value="">-- Selecteaza Utilizator --</option>
                                {availableUsers.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.firstName} {u.lastName} ({u.email}) - {u.role.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="capabilities-group">
                            <label>Permisiuni:</label>

                            {/* Permisiune Implicit si Disabled */}
                            <label className="checkbox-label disabled-check">
                                <input
                                    type="checkbox"
                                    checked={true}
                                    disabled
                                />
                                <div>
                                    <span style={{ fontWeight: 500 }}>Vizualizare</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Acces implicit pentru a vedea detaliile</span>
                                </div>
                            </label>

                            <label className={`checkbox-label ${isViewer ? 'disabled-check' : ''}`} title={isViewer ? "Utilizatorii Viewer nu pot primi drepturi de audit" : ""}>
                                <input
                                    type="checkbox"
                                    checked={capabilities.includes('AUDIT')}
                                    onChange={() => toggleCapability('AUDIT')}
                                    disabled={isViewer}
                                />
                                Rulare Audit
                            </label>
                            <label className={`checkbox-label ${isViewer ? 'disabled-check' : ''}`} title={isViewer ? "Utilizatorii Viewer nu pot primi drepturi de gestionare" : ""}>
                                <input
                                    type="checkbox"
                                    checked={capabilities.includes('MANAGE')}
                                    onChange={() => toggleCapability('MANAGE')}
                                    disabled={isViewer}
                                />
                                Gestionare
                            </label>
                        </div>

                        <button
                            className="btn btn-primary"
                            disabled={!selectedUser}
                            onClick={handleGrant}
                        >
                            Acorda Acces
                        </button>
                    </div>

                    <div className="permissions-list">
                        <h3>Utilizatori cu Acces</h3>
                        {permissions.length === 0 ? (
                            <p className="text-muted">Niciun alt utilizator nu are acces specific (in afara de Admini).</p>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Utilizator</th>
                                        <th>Permisiuni</th>
                                        <th>Actiuni</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {permissions.map(p => (
                                        <tr key={p.id}>
                                            <td>
                                                <div>{p.user.firstName} {p.user.lastName}</div>
                                                <div className="text-muted small">{p.user.email}</div>
                                            </td>
                                            <td>
                                                {p.capabilities.join(', ')}
                                            </td>
                                            <td>
                                                <button
                                                    className="btn-icon danger"
                                                    onClick={() => handleRevoke(p.userId)}
                                                    title="Revoca Acces"
                                                >
                                                    <span className="material-symbols-outlined">delete</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ShareServerModal;
