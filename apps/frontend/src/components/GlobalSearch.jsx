import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import './GlobalSearch.css';

function GlobalSearch() {
    const { user } = useAuth();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState({ servers: [], templates: [], pages: [] });
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    // Static pages for search
    const staticPages = [
        { name: 'Dashboard', path: '/', icon: 'dashboard', keywords: ['dashboard', 'acasa', 'home', 'principal'] },
        { name: 'Servere', path: '/servers', icon: 'dns', keywords: ['servere', 'servers', 'noduri', 'masini'] },
        { name: 'Template-uri Audit', path: '/templates', icon: 'fact_check', keywords: ['template', 'audit', 'cis', 'benchmark', 'controls'] },
        { name: 'Setari', path: '/settings', icon: 'settings', keywords: ['setari', 'settings', 'configurare', 'cont'] },
        { name: 'Utilizatori', path: '/users', icon: 'group', keywords: ['utilizatori', 'users', 'conturi', 'admin'], adminOnly: true },
    ];

    // ... (rest of code)



    // Debounced search
    useEffect(() => {
        if (!query.trim()) {
            setResults({ servers: [], templates: [], pages: [] });
            setIsOpen(false);
            return;
        }

        const timer = setTimeout(() => {
            performSearch(query);
        }, 200);

        return () => clearTimeout(timer);
    }, [query]);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
                inputRef.current && !inputRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const performSearch = async (searchQuery) => {
        const q = searchQuery.toLowerCase();
        setLoading(true);

        try {
            // Search static pages
            const matchedPages = staticPages.filter(page => {
                if (page.adminOnly && user?.role !== 'ADMIN') return false;
                return page.name.toLowerCase().includes(q) ||
                    page.keywords.some(kw => kw.includes(q));
            });

            // Search servers from API
            let matchedServers = [];
            try {
                const serversRes = await api.get('/servers');
                const servers = serversRes.data || [];
                matchedServers = servers.filter(s =>
                    s.hostname?.toLowerCase().includes(q) ||
                    s.ip?.toLowerCase().includes(q) ||
                    s.name?.toLowerCase().includes(q)
                ).slice(0, 5);
            } catch (e) {
                console.log('Could not search servers');
            }

            // Search templates from API
            let matchedTemplates = [];
            try {
                const templatesRes = await api.get('/templates');
                const templates = templatesRes.data || [];
                matchedTemplates = templates.filter(t =>
                    t.name?.toLowerCase().includes(q) ||
                    t.description?.toLowerCase().includes(q)
                ).slice(0, 5);
            } catch (e) {
                console.log('Could not search templates');
            }

            setResults({
                servers: matchedServers,
                templates: matchedTemplates,
                pages: matchedPages
            });
            setIsOpen(true);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (type, item) => {
        setQuery('');
        setIsOpen(false);

        switch (type) {
            case 'page':
                navigate(item.path);
                break;
            case 'server':
                navigate(`/servers/${item.id}`);
                break;
            case 'template':
                navigate(`/templates/${item.id}`);
                break;
        }
    };

    const hasResults = results.servers.length > 0 || results.templates.length > 0 || results.pages.length > 0;

    return (
        <div className="global-search">
            <div className="search-box" ref={inputRef}>
                <span className="material-symbols-outlined">search</span>
                <input
                    type="text"
                    className="search-input"
                    placeholder="Cauta servere, template-uri, pagini..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => query.trim() && hasResults && setIsOpen(true)}
                />
                {loading && <div className="search-spinner"></div>}
            </div>

            {isOpen && (
                <div className="search-dropdown" ref={dropdownRef}>
                    {!hasResults && query.trim() && (
                        <div className="search-empty">
                            <span className="material-symbols-outlined">search_off</span>
                            <p>Nu am gasit rezultate pentru "{query}"</p>
                        </div>
                    )}

                    {results.pages.length > 0 && (
                        <div className="search-section">
                            <div className="search-section-title">Pagini</div>
                            {results.pages.map((page, i) => (
                                <div
                                    key={i}
                                    className="search-result-item"
                                    onClick={() => handleSelect('page', page)}
                                >
                                    <span className="material-symbols-outlined">{page.icon}</span>
                                    <span>{page.name}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {results.servers.length > 0 && (
                        <div className="search-section">
                            <div className="search-section-title">Servere</div>
                            {results.servers.map((server, i) => (
                                <div
                                    key={i}
                                    className="search-result-item"
                                    onClick={() => handleSelect('server', server)}
                                >
                                    <span className="material-symbols-outlined">dns</span>
                                    <div className="search-result-info">
                                        <span className="search-result-name">{server.hostname}</span>
                                        <span className="search-result-meta">{server.ip || 'N/A'}</span>
                                    </div>
                                    <span className={`status-indicator ${server.status === 'online' ? 'online' : 'offline'}`}></span>
                                </div>
                            ))}
                        </div>
                    )}

                    {results.templates.length > 0 && (
                        <div className="search-section">
                            <div className="search-section-title">Template-uri</div>
                            {results.templates.map((template, i) => (
                                <div
                                    key={i}
                                    className="search-result-item"
                                    onClick={() => handleSelect('template', template)}
                                >
                                    <span className="material-symbols-outlined">fact_check</span>
                                    <div className="search-result-info">
                                        <span className="search-result-name">{template.name}</span>
                                        <span className="search-result-meta">{template.type}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default GlobalSearch;
