import React, { ErrorInfo, ReactNode, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Camera, Settings, ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { db } from './firebase';
import { ref, onValue } from 'firebase/database';

import Home from './pages/Home';
import Folder from './pages/Folder';
import SettingsPage from './pages/Settings';
import { cn } from './lib/utils';
import { ToastContainer } from './components/Toast';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  private handleGlobalError = (event: ErrorEvent) => {
    console.error("Global Error Caught:", event.error || event.message);
    this.setState({
      hasError: true,
      error: event.error || new Error(event.message),
      errorInfo: null
    });
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    console.error("Unhandled Rejection Caught:", event.reason);
    this.setState({
      hasError: true,
      error: event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      errorInfo: null
    });
  };

  componentDidMount() {
    window.addEventListener('error', this.handleGlobalError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught runtime error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-950 p-6 text-center text-zinc-200">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl text-left flex flex-col max-h-[90vh]">
            <h1 className="mb-2 text-2xl font-bold text-red-400">Oops! Something went wrong.</h1>
            <p className="mb-6 text-sm text-zinc-400 leading-relaxed">
              We're sorry, but the application encountered an unexpected error. 
              This can sometimes happen after an update or due to corrupted local data. 
              Please click the button below to reset and reload the app.
            </p>
            
            <div className="mb-6 flex-1 rounded-lg bg-black/50 p-4 text-xs font-mono text-red-300 overflow-y-auto border border-red-900/30">
              <div className="font-semibold mb-2 text-red-200">{this.state.error?.toString()}</div>
              {this.state.error?.stack && <div className="mt-2 opacity-80 whitespace-pre-wrap">{this.state.error.stack}</div>}
              {this.state.errorInfo?.componentStack && <div className="mt-2 opacity-80 whitespace-pre-wrap">{this.state.errorInfo.componentStack}</div>}
            </div>

            <div className="pt-2 border-t border-zinc-800 mt-auto">
              <button
                onClick={() => {
                  // Clear corrupted local states
                  localStorage.clear();
                  sessionStorage.clear();
                  // Force a hard reload
                  window.location.reload();
                }}
                className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-700 hover:shadow-lg active:scale-[0.98]"
              >
                Try Again / Reset App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function NavigationHeader() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const connectedRef = ref(db, '.info/connected');
    const unsubscribe = onValue(connectedRef, (snap) => {
      setIsConnected(snap.val() === true);
    });
    return () => unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 shadow-sm">
      <div className="flex items-center gap-3">
        {!isHome && (
          <Link to="/" className="mr-1 rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
            <ArrowLeft size={20} />
          </Link>
        )}
        <Link to="/" className="flex items-center gap-2 text-zinc-100 font-semibold text-lg tracking-tight">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white">
            <Camera size={18} />
          </div>
          Nano Snap
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <div 
          className="flex items-center justify-center rounded-full p-2 text-zinc-400 transition-colors"
          title={isConnected ? "Connected to Firebase" : "Disconnected from Firebase"}
        >
          {isConnected ? <Wifi size={18} className="text-emerald-500" /> : <WifiOff size={18} className="text-red-500" />}
        </div>
        <Link
          to="/settings"
          className={cn(
            "rounded-full p-2 transition-colors",
            location.pathname === '/settings' ? "bg-zinc-800 text-indigo-400" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          )}
        >
          <Settings size={22} />
        </Link>
      </div>
    </header>
  );
}

import { setupSyncListener } from './lib/syncManager';

export function AppContent() {
  useEffect(() => {
    setupSyncListener(db);

    const checkEruda = () => {
      try {
        const isEnabled = localStorage.getItem('erudaEnabled') === 'true';
        // @ts-ignore
        if (isEnabled && window.eruda) {
          // @ts-ignore
          if (!window.eruda._isInit) {
            // @ts-ignore
            window.eruda.init({ tool: ['console', 'elements', 'info'] });
          }
        } else {
          // @ts-ignore
          if (window.eruda && window.eruda._isInit) {
            // @ts-ignore
            window.eruda.destroy();
          }
        }
      } catch (e) {
        console.error('Failed to access localStorage or Eruda:', e);
      }
    };

    // Check initially
    checkEruda();
    
    // Listen for toggle events from Settings
    window.addEventListener('eruda-toggle', checkEruda);

    return () => {
      window.removeEventListener('eruda-toggle', checkEruda);
    };
  }, []);

  return (
    <HashRouter>
      <div className="min-h-screen bg-zinc-950 text-zinc-200 antialiased selection:bg-indigo-500/30">
        <NavigationHeader />

        <main className="mx-auto max-w-2xl px-4 py-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/folder/:id" element={<Folder />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <ToastContainer />
      </div>
    </HashRouter>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
