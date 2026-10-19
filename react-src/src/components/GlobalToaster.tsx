import { useEffect, useState } from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';
import { notify } from '../services/notificationService';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
}

let toastIdCounter = 0;

export const GlobalToaster = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = notify.subscribe((notification) => {
      const newToast: ToastMessage = {
        id: `toast-${++toastIdCounter}`,
        ...notification
      };

      setToasts((prev) => [...prev, newToast]);
    });

    return () => unsubscribe();
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const getVariant = (type: string) => {
    if (type === 'error') return 'danger';
    if (type === 'success') return 'success';
    if (type === 'warning') return 'warning';
    return 'primary';
  };

  return (
    <ToastContainer position="top-end" className="p-3" style={{ position: 'fixed', zIndex: 9999 }}>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          onClose={() => removeToast(toast.id)}
          delay={5000}
          autohide={toast.type !== 'warning'} // Warnings stay until closed by the user
          bg="white"
        >
          <Toast.Header className={`text-${getVariant(toast.type)}`}>
            <strong className="me-auto">{toast.title}</strong>
            <small>now</small>
          </Toast.Header>
          <Toast.Body style={{ whiteSpace: 'pre-line' }}>{toast.message}</Toast.Body>
        </Toast>
      ))}
    </ToastContainer>
  );
};