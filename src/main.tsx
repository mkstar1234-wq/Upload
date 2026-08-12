import React, { Component, ErrorInfo, ReactNode } from 'react';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      },
      (err) => {
        console.log('ServiceWorker registration failed: ', err);
      }
    );
  });
}

class GlobalErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Global Error Caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#333', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ padding: '20px', background: '#ffcccc', color: '#cc0000', border: '2px solid #cc0000', borderRadius: '8px', maxWidth: '600px', width: '100%' }}>
            <h1 style={{ marginTop: 0, fontSize: '24px' }}>Application Error</h1>
            <p><strong>Message:</strong> {this.state.error?.message}</p>
            <pre style={{ overflowX: 'auto', background: '#fff', padding: '10px', fontSize: '12px', marginTop: '10px' }}>
              {this.state.error?.stack}
            </pre>
            <button 
              onClick={() => { localStorage.clear(); sessionStorage.clear(); window.location.reload(); }}
              style={{ marginTop: '20px', padding: '10px 20px', background: '#cc0000', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Clear Data & Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
);
