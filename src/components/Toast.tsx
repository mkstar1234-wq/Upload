import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

export type ToastType = 'success' | 'error' | 'info';

interface ToastEvent {
  message: string;
  type: ToastType;
  id: string;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  useEffect(() => {
    const handleToast = (e: CustomEvent<ToastEvent>) => {
      setToasts(prev => [...prev, e.detail]);
      
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== e.detail.id));
      }, 3000);
    };

    window.addEventListener('app-toast', handleToast as EventListener);
    return () => window.removeEventListener('app-toast', handleToast as EventListener);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="fixed bottom-4 right-4 z-[999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div 
          key={toast.id}
          className="pointer-events-auto flex w-[300px] items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md transition-all animate-in slide-in-from-right-4 fade-in-10"
        >
          {toast.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />}
          {toast.type === 'error' && <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />}
          {toast.type === 'info' && <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />}
          
          <div className="flex-1 text-sm text-zinc-200">
            {toast.message}
          </div>
          
          <button 
            onClick={() => removeToast(toast.id)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export const showToast = (message: string, type: ToastType = 'info') => {
  const event = new CustomEvent('app-toast', {
    detail: { message, type, id: Math.random().toString(36).substring(2, 9) }
  });
  window.dispatchEvent(event);
};
