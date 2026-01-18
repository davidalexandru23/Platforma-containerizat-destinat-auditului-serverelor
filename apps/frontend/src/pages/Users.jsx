import { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

function Users() {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [usersRes, rolesRes] = await Promise.all([
                api.get('/users'),
                api.get('/users/roles')
            ]);
            setUsers(usersRes.data || []);
            setRoles(rolesRes.data || []);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (userId, newRoleId) => {
        try {
            await api.patch(`/users/${userId}/role`, { roleId: newRoleId });
            // Update local state - ensuring we update the role object with the new one found in roles list
            const newRole = roles.find(r => r.id === newRoleId);
            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
        } catch (error) {
            console.error('Error updating role:', error);
        }
    };

    const handleDelete = async (userId) => {
        if (!confirm('Esti sigur ca vrei sa stergi acest utilizator?')) return;

        try {
            await api.delete(`/users/${userId}`);
            setUsers(users.filter(u => u.id !== userId));
        } catch (error) {
            console.error('Error deleting user:', error);
        }
    };

    const getRoleBadge = (roleName) => {
        // Safe check if role is object or string
        const name = (typeof roleName === 'object' ? roleName?.name : roleName) || '';
        const roleLower = name.toLowerCase();

        const classes = {
            admin: 'badge-danger',
            auditor: 'badge-warning',
            viewer: 'badge-info'
        };
        const labels = {
            admin: 'Administrator',
            auditor: 'Auditor',
            viewer: 'Viewer'
        };
        return (
            <span className={`badge ${classes[roleLower] || 'badge-neutral'}`}>
                {labels[roleLower] || name}
            </span>
        );
    };

    const formatDate = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('ro-RO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    return (
        <div className="users-page">
            {/* Page Header */}
            <div className="page-header">
                <div className="page-header-row">
                    <div>
                        <h1 className="page-title">Utilizatori & Roluri</h1>
                        <p className="page-subtitle">Gestioneaza accesul utilizatorilor si permisiunile RBAC.</p>
                    </div>
                </div>
            </div>

            {/* Role Legend */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="badge badge-danger">Administrator</span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Acces complet</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="badge badge-warning">Auditor</span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Ruleaza audituri, vizualizeaza rezultate</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="badge badge-info">Viewer</span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Doar vizualizare rapoarte</span>
                    </div>
                </div>
            </div>

            {/* Users Table */}
            <div className="table-container">
                {loading ? (
                    <div className="empty-state" style={{ padding: '3rem' }}>
                        <div className="spinner"></div>
                        <p>Se incarca utilizatorii...</p>
                    </div>
                ) : users.length === 0 ? (
                    <div className="empty-state">
                        <span className="material-symbols-outlined">group</span>
                        <p>Nu exista utilizatori inregistrati.</p>
                    </div>
                ) : (
                    <>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Utilizator</th>
                                    <th>Email</th>
                                    <th>Rol</th>
                                    <th>Inregistrat</th>

                                    <th style={{ width: '100px', textAlign: 'right' }}>Actiuni</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div className="user-avatar">
                                                    {user.firstName?.charAt(0) || user.email?.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <span style={{ fontWeight: 600 }}>{user.firstName} {user.lastName}</span>
                                                    {user.id === currentUser?.id && (
                                                        <span className="badge badge-neutral" style={{ marginLeft: '0.5rem', fontSize: '0.625rem' }}>
                                                            Tu
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                            {user.email}
                                        </td>
                                        <td>
                                            {user.id === currentUser?.id ? (
                                                getRoleBadge(user.role?.name)
                                            ) : (
                                                <select
                                                    value={user.role?.id}
                                                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                    className="input"
                                                    style={{
                                                        width: 'auto',
                                                        padding: '0.375rem 0.75rem',
                                                        fontSize: '0.75rem'
                                                    }}
                                                >
                                                    {roles.map(role => (
                                                        <option key={role.id} value={role.id}>
                                                            {role.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                            {formatDate(user.createdAt)}
                                        </td>

                                        <td>
                                            <div className="table-actions" style={{ opacity: 1 }}>
                                                {user.id !== currentUser?.id && (
                                                    <button
                                                        className="action-btn danger"
                                                        title="Sterge"
                                                        onClick={() => handleDelete(user.id)}
                                                    >
                                                        <span className="material-symbols-outlined">delete</span>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="pagination">
                            <span className="pagination-info">
                                Total: {users.length} utilizatori
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default Users;
