/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/webview/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'vscode-background': 'var(--vscode-editor-background)',
        'vscode-foreground': 'var(--vscode-editor-foreground)',
        'vscode-border': 'var(--vscode-panel-border)',
        'vscode-input-bg': 'var(--vscode-input-background)',
        'vscode-input-fg': 'var(--vscode-input-foreground)',
        'vscode-button-bg': 'var(--vscode-button-background)',
        'vscode-button-fg': 'var(--vscode-button-foreground)',
        'vscode-button-hover': 'var(--vscode-button-hoverBackground)',
        'vscode-list-hover': 'var(--vscode-list-hoverBackground)',
        'vscode-list-active': 'var(--vscode-list-activeSelectionBackground)',
      },
    },
  },
  plugins: [],
};
