import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import GlobalSearch from './GlobalSearch';
import ToastNotifications from './ToastNotifications';
import './Layout.css';

function Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [toasts, setToasts] = useState([]);

    // === Logica Notificari WebSocket ===
    useEffect(() => {
        if (!user) return;

        const token = localStorage.getItem('accessToken');
        const wsUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

        const socket = io(`${wsUrl}/ws/notifications`, {
            auth: { token },
            query: { token }, // rezerva
        });

        socket.on('connect', () => {
            console.log('Connected to notification stream');
        });

        socket.on('notify', (data) => {
            const newToast = {
                id: data.id || Date.now().toString(),
                type: mapNotificationType(data.type),
                title: data.title,
                message: data.body,
                link: data.link
            };
            addToast(newToast);
        });

        return () => {
            socket.disconnect();
        };
    }, [user]);

    const addToast = (toast) => {
        setToasts(prev => [toast, ...prev]);
        // Stergere automata dupa 5s
        setTimeout(() => {
            removeToast(toast.id);
        }, 5000);
    };

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const mapNotificationType = (serverType) => {
        if (serverType?.includes('success') || serverType?.includes('approved') || serverType?.includes('online') || serverType?.includes('completed')) return 'success';
        if (serverType?.includes('error') || serverType?.includes('fail') || serverType?.includes('rejected') || serverType?.includes('offline') || serverType?.includes('critical')) return 'error';
        if (serverType?.includes('warning')) return 'warning';
        return 'info';
    };

    // === Logica Autentificare ===
    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const getInitials = (user) => {
        if (!user) return 'U';
        const first = user.firstName?.[0] || '';
        const last = user.lastName?.[0] || '';
        return (first + last).toUpperCase() || 'U';
    };

    const getFullName = (user) => {
        if (!user) return 'Utilizator';
        const parts = [user.firstName, user.lastName].filter(Boolean);
        return parts.length > 0 ? parts.join(' ') : user.email || 'Utilizator';
    };

    const getRoleLabel = (role) => {
        const labels = {
            admin: 'Administrator',
            auditor: 'Auditor',
            viewer: 'Viewer'
        };
        return labels[role] || role;
    };

    return (
        <div className="app-layout">
            <ToastNotifications notifications={toasts} onDismiss={removeToast} />

            {/* bara laterala */}
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">
                        <span className="material-symbols-outlined">hub</span>
                    </div>
                    <h2>BitTrail</h2>
                </div>

                <nav className="sidebar-nav">
                    <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="material-symbols-outlined">dashboard</span>
                        <span>Dashboard</span>
                    </NavLink>

                    <NavLink to="/servers" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="material-symbols-outlined">dns</span>
                        <span>Servere</span>
                    </NavLink>

                    <NavLink to="/templates" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="material-symbols-outlined">fact_check</span>
                        <span>Template-uri Audit</span>
                    </NavLink>

                    <div className="nav-divider"></div>

                    {user?.role === 'ADMIN' && (
                        <NavLink to="/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                            <span className="material-symbols-outlined">group</span>
                            <span>Utilizatori</span>
                        </NavLink>
                    )}

                    <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="material-symbols-outlined">settings</span>
                        <span>Setari</span>
                    </NavLink>
                </nav>

                <div className="sidebar-user">
                    <div className="user-profile" onClick={handleLogout} title="Click pentru deconectare">
                        <div className="user-avatar">
                            {getInitials(user)}
                        </div>
                        <div className="user-info">
                            <div className="user-name">{getFullName(user)}</div>
                            <div className="user-role">{getRoleLabel(user?.role)}</div>
                        </div>
                        <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)', fontSize: '20px' }}>
                            logout
                        </span>
                    </div>
                </div>
            </aside>

            {/* Continut Principal */}
            <div className="main-content">
                {/* Antet Superior */}
                <header className="top-header">
                    <GlobalSearch />
                    <div className="header-actions">
                    </div>
                </header>

                {/* Continut Pagina - randeaza rutele copil */}
                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

export default Layout;


