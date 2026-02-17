import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || '';

export function useWebSocket(namespace, room, roomKey) {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        const newSocket = io(`${WS_URL}${namespace}`, {
            query: { token },
            transports: ['websocket'],
        });

        newSocket.on('connect', () => {
            setConnected(true);
            if (room) {
                newSocket.emit('subscribe', { [roomKey]: room });
            }
        });

        newSocket.on('disconnect', () => {
            setConnected(false);
        });

        newSocket.on('metrics', (data) => {
            setLastMessage({ type: 'metrics', data });
        });

        newSocket.on('status', (data) => {
            setLastMessage({ type: 'status', data });
        });

        newSocket.on('progress', (data) => {
            setLastMessage({ type: 'progress', data });
        });

        newSocket.on('checkResult', (data) => {
            setLastMessage({ type: 'checkResult', data });
        });

        setSocket(newSocket);

        return () => {
            if (room) {
                newSocket.emit('unsubscribe', { [roomKey]: room });
            }
            newSocket.disconnect();
        };
    }, [namespace, room, roomKey]);

    const subscribe = useCallback((newRoom) => {
        if (socket && connected) {
            socket.emit('subscribe', { [roomKey]: newRoom });
        }
    }, [socket, connected, roomKey]);

    const unsubscribe = useCallback((oldRoom) => {
        if (socket && connected) {
            socket.emit('unsubscribe', { [roomKey]: oldRoom });
        }
    }, [socket, connected, roomKey]);

    return { socket, connected, lastMessage, subscribe, unsubscribe };
}

// Hook pentru metrici live
export function useLiveMetrics(serverId) {
    return useWebSocket('/ws/live', serverId, 'serverId');
}

// Hook pentru progres audit
export function useAuditProgress(auditRunId) {
    return useWebSocket('/ws/audit', auditRunId, 'auditRunId');
}
