import { Toast, ToastType } from '../components/Toast';

type ToastCallback = (toast: Toast) => void;

let toastCallback: ToastCallback | null = null;

export const registerToastCallback = (callback: ToastCallback) => {
  toastCallback = callback;
};

export const showToast = (message: string, type: ToastType = 'info', duration?: number) => {
  if (!toastCallback) {
    // Fallback to console if toast system not initialized
    console.log(`[${type.toUpperCase()}] ${message}`);
    return;
  }

  const toast: Toast = {
    id: `toast-${Date.now()}-${Math.random()}`,
    message,
    type,
    duration,
  };

  toastCallback(toast);
};

export const toast = {
  success: (message: string, duration?: number) => showToast(message, 'success', duration),
  error: (message: string, duration?: number) => showToast(message, 'error', duration),
  warning: (message: string, duration?: number) => showToast(message, 'warning', duration),
  info: (message: string, duration?: number) => showToast(message, 'info', duration),
};
