import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './ActivityFeed.css';

function ActivityFeed() {
    const [activities, setActivities] = useState([]);
    const scrollRef = useRef(null);

    useEffect(() => {
        // Incarcare initiala (ar putea fi din API daca am avea istoric)
        // setActivities([
        //     { id: 1, actor: 'System', action: 'INIT', entity: 'Server', timestamp: new Date() }
        // ]);

        const token = localStorage.getItem('accessToken');
        const wsUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

        const socket = io(`${wsUrl}/ws/activity`, {
            auth: { token },
            query: { token },
        });

        socket.on('connect', () => {
            console.log('Connected to activity stream');
        });

        socket.on('activity:event', (data) => {
            const newActivity = {
                id: Date.now() + Math.random(),
                ...data
            };
            setActivities(prev => [newActivity, ...prev].slice(0, 50)); // Pastreaza ultimele 50
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const formatTime = (isoString) => {
        if (!isoString) return '';
        return new Date(isoString).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const getIcon = (action) => {
        if (action.includes('ONLINE')) return 'check_circle';
        if (action.includes('OFFLINE')) return 'error';
        if (action.includes('CREATE') || action.includes('UPLOAD')) return 'add_circle';
        if (action.includes('UPDATE') || action.includes('EDIT')) return 'edit';
        if (action.includes('DELETE')) return 'delete';
        if (action.includes('LOGIN')) return 'login';
        if (action.includes('AUDIT')) return 'fact_check';
        return 'info';
    };

    const getIconClass = (action) => {
        if (action.includes('ONLINE') || action.includes('SUCCESS') || action.includes('PASS')) return 'success';
        if (action.includes('OFFLINE') || action.includes('FAIL') || action.includes('ERROR')) return 'danger';
        if (action.includes('WARNING')) return 'warning';
        return '';
    };

    return (
        <div className="activity-feed card">
            <div className="card-header">
                <h3 className="card-title">Activitate Recenta</h3>
                <span className="live-indicator">
                    <span className="dot"></span>
                    Live
                </span>
            </div>
            <div className="activity-list" ref={scrollRef}>
                {activities.length === 0 ? (
                    <div className="empty-state-small">
                        <p>Nicio activitate recenta</p>
                    </div>
                ) : (
                    activities.map(activity => (
                        <div key={activity.id} className="activity-item slide-in">
                            <div className={`activity-icon ${getIconClass(activity.action)}`}>
                                <span className="material-symbols-outlined">
                                    {getIcon(activity.action)}
                                </span>
                            </div>
                            <div className="activity-content">
                                <p className="activity-text">
                                    <span className="actor">{activity.actor}</span>
                                    <span className="action">{activity.action.replace('_', ' ').toLowerCase()}</span>
                                    <span className="entity">{activity.entity}</span>
                                    {activity.entityId && <span className="entity-id">#{activity.entityId.substring(0, 4)}</span>}
                                </p>
                                <span className="activity-time">{formatTime(activity.timestamp)}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default ActivityFeed;
