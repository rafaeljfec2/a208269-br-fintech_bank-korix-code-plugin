import React from 'react';
import { logger } from "./utils/logger";
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

logger.log('[Korix Webview] Script loaded');
logger.log('[Korix Webview] React version:', React.version);

const root = document.getElementById('root');
if (root) {
  logger.log('[Korix Webview] Root element found, mounting React...');
  try {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
    logger.log('[Korix Webview] React mounted successfully!');
  } catch (error) {
    logger.error('[Korix Webview] Failed to mount React:', error);
    root.innerHTML = `
      <div style="padding: 20px; color: red; font-family: monospace;">
        <h3>❌ Erro ao carregar Korix Code</h3>
        <pre>${error}</pre>
      </div>
    `;
  }
} else {
  logger.error('[Korix Webview] Root element not found!');
  document.body.innerHTML = `
    <div style="padding: 20px; color: red; font-family: monospace;">
      <h3>❌ Elemento #root não encontrado</h3>
    </div>
  `;
}
