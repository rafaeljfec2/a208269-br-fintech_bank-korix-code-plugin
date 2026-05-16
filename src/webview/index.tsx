import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

console.log('[Korix Webview] Script loaded');
console.log('[Korix Webview] React version:', React.version);

const root = document.getElementById('root');
if (root) {
  console.log('[Korix Webview] Root element found, mounting React...');
  try {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
    console.log('[Korix Webview] React mounted successfully!');
  } catch (error) {
    console.error('[Korix Webview] Failed to mount React:', error);
    root.innerHTML = `
      <div style="padding: 20px; color: red; font-family: monospace;">
        <h3>❌ Erro ao carregar Korix Code</h3>
        <pre>${error}</pre>
      </div>
    `;
  }
} else {
  console.error('[Korix Webview] Root element not found!');
  document.body.innerHTML = `
    <div style="padding: 20px; color: red; font-family: monospace;">
      <h3>❌ Elemento #root não encontrado</h3>
    </div>
  `;
}
