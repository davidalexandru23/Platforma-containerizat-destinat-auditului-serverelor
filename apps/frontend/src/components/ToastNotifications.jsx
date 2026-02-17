import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './ToastNotifications.css';

/**
 * @typedef {Object} Toast
 * @property {string} id
 * @property {string} type - 'success', 'error', 'info', 'warning'
 * @property {string} title
 * @property {string} message
 * @property {string} [link]
 */

function ToastNotifications({ notifications, onDismiss }) {
    return (
        <div className="toast-container">
            {notifications.map(toast => (
                <div key={toast.id} className={`toast toast-${toast.type} slide-in`}>
                    <div className="toast-icon">
                        {toast.type === 'success' && <span className="material-symbols-outlined">check_circle</span>}
                        {toast.type === 'error' && <span className="material-symbols-outlined">error</span>}
                        {toast.type === 'info' && <span className="material-symbols-outlined">info</span>}
                        {toast.type === 'warning' && <span className="material-symbols-outlined">warning</span>}
                    </div>
                    <div className="toast-content">
                        <div className="toast-title">{toast.title}</div>
                        <div className="toast-message">{toast.message}</div>
                        {toast.link && (
                            <Link to={toast.link} className="toast-link">Vezi detalii &rarr;</Link>
                        )}
                    </div>
                    <button className="toast-close" onClick={() => onDismiss(toast.id)}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                    <div className="toast-progress"></div>
                </div>
            ))}
        </div>
    );
}

export default ToastNotifications;
