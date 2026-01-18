import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import './Login.css';

function Settings() {
    const { user, logout } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const handleLogout = async () => {
        await logout();
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'Parolele noi nu se potrivesc' });
            return;
        }

        if (newPassword.length < 8) {
            setMessage({ type: 'error', text: 'Parola noua trebuie sa aiba minim 8 caractere' });
            return;
        }

        setLoading(true);
        try {
            await api.post('/users/me/password', { currentPassword, newPassword });
            setMessage({ type: 'success', text: 'Parola a fost schimbata cu succes!' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            setMessage({
                type: 'error',
                text: err.response?.data?.message || 'Eroare la schimbarea parolei'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="settings-page" style={{ padding: '2rem' }}>
            <div className="page-header">
                <h1 className="page-title">Setari</h1>
                <p className="page-subtitle">
                    Gestioneaza profilul si preferintele contului tau.
                </p>
            </div>

            {/* Profil Utilizator */}
            <div className="card" style={{
                background: 'var(--surface-color)',
                borderRadius: '12px',
                padding: '1.5rem',
                marginTop: '1.5rem',
                border: '1px solid var(--border-color)'
            }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                    <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>person</span>
                    Profil Utilizator
                </h3>

                <div style={{ display: 'grid', gap: '1rem' }}>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                            type="email"
                            className="input"
                            value={user?.email || ''}
                            disabled
                            style={{ opacity: 0.7 }}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Nume</label>
                        <input
                            type="text"
                            className="input"
                            value={`${user?.firstName || ''} ${user?.lastName || ''}`}
                            disabled
                            style={{ opacity: 0.7 }}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Rol</label>
                        <input
                            type="text"
                            className="input"
                            value={user?.role || 'VIEWER'}
                            disabled
                            style={{ opacity: 0.7 }}
                        />
                    </div>
                </div>
            </div>

            {/* Schimbare Parola */}
            <div className="card" style={{
                background: 'var(--surface-color)',
                borderRadius: '12px',
                padding: '1.5rem',
                marginTop: '1.5rem',
                border: '1px solid var(--border-color)'
            }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                    <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>lock</span>
                    Schimba Parola
                </h3>

                {message.text && (
                    <div className={`alert alert-${message.type === 'success' ? 'success' : 'error'}`} style={{ marginBottom: '1rem' }}>
                        <span className="material-symbols-outlined">
                            {message.type === 'success' ? 'check_circle' : 'error'}
                        </span>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handlePasswordChange}>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="form-label">Parola curenta</label>
                            <input
                                type="password"
                                className="input"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="Introdu parola curenta"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Parola noua</label>
                            <input
                                type="password"
                                className="input"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Minim 8 caractere"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Confirma parola noua</label>
                            <input
                                type="password"
                                className="input"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Repeta parola noua"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ marginTop: '1rem' }}
                    >
                        {loading ? <div className="spinner"></div> : (
                            <>
                                <span className="material-symbols-outlined">save</span>
                                Salveaza Parola
                            </>
                        )}
                    </button>
                </form>
            </div>

            {/* Sesiune */}
            <div className="card" style={{
                background: 'var(--surface-color)',
                borderRadius: '12px',
                padding: '1.5rem',
                marginTop: '1.5rem',
                border: '1px solid var(--border-color)'
            }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                    <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>logout</span>
                    Sesiune
                </h3>

                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Deconecteaza-te de la contul tau BitTrail.
                </p>

                <button
                    className="btn btn-secondary"
                    onClick={handleLogout}
                    style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                    }}
                >
                    <span className="material-symbols-outlined">logout</span>
                    Deconectare
                </button>
            </div>

            {user?.role === 'ADMIN' && (
                <div className="card" style={{
                    background: 'var(--surface-color)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    marginTop: '1.5rem',
                    border: '1px solid var(--border-color)'
                }}>
                    <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                        <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>admin_panel_settings</span>
                        Administratie
                    </h3>

                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        Ai acces complet la toate functionalitatile platformei.
                    </p>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <span className="badge badge-success">
                            <span className="status-dot"></span>
                            ADMIN
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Settings;
