/**
 * Error Boundary - Catches errors in component tree
 * Displays user-friendly error message with retry option
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly hasError: boolean;
  readonly error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[Korix Webview] Component Error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '20px',
            color: 'var(--vscode-errorForeground)',
            fontFamily: 'var(--vscode-font-family)',
          }}
        >
          <h3 style={{ marginBottom: '10px' }}>⚠️ Erro na Interface</h3>
          <pre
            style={{
              padding: '10px',
              background: 'var(--vscode-input-background)',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '4px',
              fontSize: '12px',
              overflow: 'auto',
              maxHeight: '200px',
            }}
          >
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Tentar Novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
