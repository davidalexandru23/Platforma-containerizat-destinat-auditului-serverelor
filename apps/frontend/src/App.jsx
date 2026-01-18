import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import ServerDetail from './pages/ServerDetail';
import AuditDetail from './pages/AuditDetail';
import Templates from './pages/Templates';
import Users from './pages/Users';
import Settings from './pages/Settings';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />

                    <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/servers" element={<Servers />} />
                        <Route path="/servers/:id" element={<ServerDetail />} />
                        <Route path="/audits/:id" element={<AuditDetail />} />
                        <Route path="/audit/:id" element={<AuditDetail />} />
                        <Route path="/templates" element={<Templates />} />
                        <Route path="/templates/:id" element={<Templates />} />
                        <Route path="/users" element={<Users />} />
                        <Route path="/settings" element={<Settings />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
