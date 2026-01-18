import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

function Register() {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'viewer'
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { register } = useAuth();
    const navigate = useNavigate();

    const roles = [
        { value: 'admin', label: 'Administrator', description: 'Acces complet la toate functiile' },
        { value: 'auditor', label: 'Auditor', description: 'Poate rula audituri si vizualiza rezultate' },
        { value: 'viewer', label: 'Viewer', description: 'Poate vizualiza rapoarte si dashboard' }
    ];

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('Parolele nu se potrivesc');
            return;
        }

        if (formData.password.length < 8) {
            setError('Parola trebuie sa aiba minim 8 caractere');
            return;
        }

        setLoading(true);
        try {
            // Split name into firstName and lastName
            const nameParts = formData.name.trim().split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';

            await register({
                firstName,
                lastName,
                email: formData.email,
                password: formData.password,
                role: formData.role.toUpperCase()
            });
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Eroare la inregistrare');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card" style={{ maxWidth: '480px' }}>
                <div className="login-accent"></div>

                <div className="login-content">
                    <div className="login-logo">
                        <div className="login-logo-icon">
                            <span className="material-symbols-outlined">dataset</span>
                        </div>
                        <h1>BitTrail</h1>
                    </div>

                    <div className="login-header">
                        <h2>Creeaza cont nou</h2>
                        <p>Completeaza datele pentru a te inregistra.</p>
                    </div>

                    {error && (
                        <div className="alert alert-error">
                            <span className="material-symbols-outlined">error</span>
                            {error}
                        </div>
                    )}

                    <form className="login-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">Nume complet</label>
                            <input
                                type="text"
                                name="name"
                                className="input"
                                placeholder="Ion Popescu"
                                value={formData.name}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Adresa Email</label>
                            <input
                                type="email"
                                name="email"
                                className="input"
                                placeholder="user@bittrail.io"
                                value={formData.email}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Rol in platforma</label>
                            <select
                                name="role"
                                className="input"
                                value={formData.role}
                                onChange={handleChange}
                                style={{ cursor: 'pointer' }}
                            >
                                {roles.map(role => (
                                    <option key={role.value} value={role.value}>
                                        {role.label} - {role.description}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Parola</label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    className="input"
                                    placeholder="Minim 8 caractere"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    <span className="material-symbols-outlined">
                                        {showPassword ? 'visibility' : 'visibility_off'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Confirma parola</label>
                            <input
                                type="password"
                                name="confirmPassword"
                                className="input"
                                placeholder="Repeta parola"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <button type="submit" className="login-submit" disabled={loading}>
                            {loading ? (
                                <div className="spinner"></div>
                            ) : (
                                <>
                                    <span>Creeaza cont</span>
                                    <span className="material-symbols-outlined">person_add</span>
                                </>
                            )}
                        </button>

                        <div className="login-register">
                            Ai deja cont?
                            <Link to="/login">Autentifica-te</Link>
                        </div>
                    </form>
                </div>

            </div>
        </div>
    );
}

export default Register;
