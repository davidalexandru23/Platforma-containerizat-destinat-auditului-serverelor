import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GlobalSearch from './GlobalSearch';
import './Layout.css';

function Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

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
            {/* sidebar */}
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

            {/* Main Content */}
            <div className="main-content">
                {/* Top Header */}
                <header className="top-header">
                    <GlobalSearch />
                    <div className="header-actions">
                    </div>
                </header>

                {/* Page Content - renders child routes */}
                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

export default Layout;

