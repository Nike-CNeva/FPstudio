
import React, { useEffect } from 'react';
import { ToastMessage } from '../../types';

export const ToastContainer: React.FC<{ toasts: ToastMessage[], removeToast: (id: string) => void }> = ({ toasts, removeToast }) => {
    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none">
            {toasts.map(toast => (
                <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
            ))}
        </div>
    );
};

const Toast: React.FC<{ toast: ToastMessage, onClose: () => void }> = ({ toast, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bg = toast.type === 'success' ? 'bg-green-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600';

    return (
        <div className={`${bg} text-white px-4 py-3 rounded shadow-lg flex items-center min-w-[200px] pointer-events-auto animate-fade-in-up`}>
            <span className="flex-1 text-sm font-medium">{toast.message}</span>
            <button onClick={onClose} className="ml-4 text-white hover:text-gray-200">&times;</button>
        </div>
    );
};
