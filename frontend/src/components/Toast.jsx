import { h, createContext } from 'preact';
import { useState, useContext, useCallback } from 'preact/hooks';

const ToastContext = createContext();

let toastId = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info', duration = 5000) => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, message, type }]);

        if (duration > 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, duration);
        }

        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast, removeToast }}>
            {children}
            <ToastContainer toasts={toasts} onClose={removeToast} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
}

function ToastContainer({ toasts, onClose }) {
    if (toasts.length === 0) return null;

    return (
        <div class="toast-container">
            {toasts.map(toast => (
                <div key={toast.id} class={`toast toast-${toast.type}`}>
                    <span class="toast-message">{toast.message}</span>
                    <button class="toast-close" onClick={() => onClose(toast.id)}>×</button>
                </div>
            ))}
        </div>
    );
}
