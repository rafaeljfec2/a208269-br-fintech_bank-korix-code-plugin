/**
 * Korix Webview Provider - React-based UI
 * Replaces vanilla HTML sidebar with production-grade React app
 */

import * as vscode from 'vscode';
import { MessageHandler } from './messageHandler';
import type { Container } from '../../di/container';
import type { WebviewToExtensionMessage } from '../../shared/protocol';

export class KorixWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'korix.chatView';

  private _view?: vscode.WebviewView;
  private _messageHandler?: MessageHandler;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _container: Container,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void | Thenable<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Create message handler
    this._messageHandler = new MessageHandler(webviewView.webview, this._container);

    // Send initial state
    this._messageHandler.sendInitialState();

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
      this._messageHandler?.handleMessage(message).catch((error) => {
        console.error('Failed to handle webview message:', error);
      });
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'),
    );

    // Generate nonce for CSP
    const nonce = getNonce();

    // More permissive CSP for React + debugging
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link href="${styleUri.toString()}" rel="stylesheet">
  <title>Korix Code</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    #root {
      width: 100vw;
      height: 100vh;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    console.log('Webview loading...');
    console.log('Script URI:', '${scriptUri.toString()}');
    console.log('Style URI:', '${styleUri.toString()}');
  </script>
  <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
  <script nonce="${nonce}">
    window.addEventListener('error', (e) => {
      console.error('Webview error:', e.error);
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
