/**
 * Sidebar webview provider for Korix Code
 */

import * as vscode from "vscode";
import type { Mode } from "../../core/types";

export class KorixSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "korix.chatView";
  private view?: vscode.WebviewView;
  private _currentMode: Mode = "ask";

  constructor(private readonly extensionUri: vscode.Uri) {
    this._currentMode = "ask";
  }

  getCurrentMode(): Mode {
    return this._currentMode;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case "sendMessage":
          this.handleUserMessage(data.message);
          break;
        case "changeMode":
          this.handleModeChange(data.mode);
          break;
      }
    });
  }

  public setMode(mode: Mode): void {
    this._currentMode = mode;
    this.view?.webview.postMessage({ type: "modeChanged", mode });
  }

  public addMessage(
    role: "user" | "assistant" | "system",
    content: string,
  ): void {
    this.view?.webview.postMessage({
      type: "addMessage",
      message: { role, content, timestamp: Date.now() },
    });
  }

  public streamChunk(content: string): void {
    this.view?.webview.postMessage({ type: "streamChunk", content });
  }

  public clearMessages(): void {
    this.view?.webview.postMessage({ type: "clearMessages" });
  }

  private handleUserMessage(message: string): void {
    // Emit event to extension
    vscode.commands.executeCommand("korix.handleUserMessage", message);
  }

  private handleModeChange(mode: Mode): void {
    vscode.commands.executeCommand("korix.changeMode", mode);
  }

  private getHtmlForWebview(_webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Korix Code</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 10px;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    #header {
      padding: 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 10px;
    }

    #mode-selector {
      display: flex;
      gap: 5px;
      margin-bottom: 10px;
    }

    .mode-btn {
      flex: 1;
      padding: 8px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .mode-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .mode-btn:hover {
      opacity: 0.8;
    }

    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .message {
      padding: 10px;
      border-radius: 6px;
      max-width: 90%;
      word-wrap: break-word;
    }

    .message.user {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .message.assistant {
      align-self: flex-start;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
    }

    .message.system {
      align-self: center;
      background: var(--vscode-inputOption-activeBackground);
      font-size: 11px;
      opacity: 0.8;
    }

    #input-container {
      padding: 10px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 8px;
    }

    #message-input {
      flex: 1;
      padding: 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-family: inherit;
      resize: none;
    }

    #send-btn {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    }

    #send-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    #send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div id="header">
    <div id="mode-selector">
      <button class="mode-btn active" data-mode="ask">🔍 Ask</button>
      <button class="mode-btn" data-mode="plan">📋 Plan</button>
      <button class="mode-btn" data-mode="agent">⚙️ Agent</button>
    </div>
  </div>

  <div id="messages"></div>

  <div id="input-container">
    <textarea id="message-input" placeholder="Type your message..." rows="3"></textarea>
    <button id="send-btn">Send</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const messagesDiv = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const modeButtons = document.querySelectorAll('.mode-btn');

    let currentMode = 'ask';
    let isStreaming = false;
    let streamingMessageDiv = null;

    // Mode switching
    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = mode;
        vscode.postMessage({ type: 'changeMode', mode });
      });
    });

    // Send message
    function sendMessage() {
      const message = messageInput.value.trim();
      if (!message) return;

      addMessage('user', message);
      vscode.postMessage({ type: 'sendMessage', message });
      messageInput.value = '';
      sendBtn.disabled = true;
    }

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Add message to UI
    function addMessage(role, content) {
      const messageDiv = document.createElement('div');
      messageDiv.className = \`message \${role}\`;
      messageDiv.textContent = content;
      messagesDiv.appendChild(messageDiv);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;

      if (role === 'assistant') {
        streamingMessageDiv = messageDiv;
      }
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'addMessage':
          addMessage(message.message.role, message.message.content);
          sendBtn.disabled = false;
          break;

        case 'streamChunk':
          if (streamingMessageDiv) {
            streamingMessageDiv.textContent += message.content;
          } else {
            addMessage('assistant', message.content);
          }
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
          break;

        case 'clearMessages':
          messagesDiv.innerHTML = '';
          sendBtn.disabled = false;
          break;

        case 'modeChanged':
          currentMode = message.mode;
          modeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === message.mode);
          });
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
