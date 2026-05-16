# Korix Code

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Korix Code** é uma extensão VSCode production-grade que funciona como um AI-native coding runtime agentic. Um assistente de código inteligente, rápido e controlável, totalmente integrado ao VSCode.

## 🎯 Objetivo

Criar um sistema operacional agentic dentro do VSCode, inspirado em Cursor, Claude Code, Roo Code e Continue.dev, porém:

- ✨ **Mais leve**: runtime próprio sem Electron separado
- ⚡ **Mais rápido**: esbuild, streaming incremental, lazy loading
- 🧩 **Mais modular**: arquitetura em camadas bem definidas
- 🎛️ **Mais controlável**: harness de segurança, approval flow granular
- 🔧 **Nativo ao VSCode**: tudo roda no Extension Host

## 🚀 Features

### 3 Modos Principais

- **🔍 ASK Mode**: Chat contextual read-only, foco em explicações e análises
- **📋 PLAN Mode**: Decomposição de tarefas, planejamento arquitetural, análise de impacto
- **⚙️ AGENT Mode**: Execução iterativa com tool calling, edição de arquivos, terminal execution

### Características

- **Provider Abstraction**: Suporte para múltiplos LLM providers (Anthropic, OpenAI, Ollama, OpenRouter)
- **Agent Runtime**: Loop agentic com checkpoints e error recovery
- **Tool Harness**: Camada de segurança para todas as interações
- **Context Engine**: Ranking inteligente de contexto (workspace graph, imports, git state)
- **Patch Engine**: Aplicação confiável de edições de código
- **Terminal System**: Integração com node-pty para execução segura
- **Approval Flow**: Modal interativo para ações destrutivas
- **Telemetria**: Logs estruturados e métricas de performance

## 📦 Installation

### From VSIX
```bash
code --install-extension korix-code-*.vsix
```

### From Source
```bash
npm install
npm run compile
```

## 🎮 Usage

### Atalhos de Teclado

- `Ctrl+Shift+A` (macOS: `Cmd+Shift+A`): Ativar Ask Mode
- `Ctrl+Shift+K` (macOS: `Cmd+Shift+K`): Ativar Agent Mode
- `Ctrl+Shift+C` (macOS: `Cmd+Shift+C`): Cancelar execução

### Comandos

- `Korix: Ask Mode` - Ativar modo de análise read-only
- `Korix: Plan Mode` - Ativar modo de planejamento
- `Korix: Agent Mode` - Ativar modo de execução completo
- `Korix: Open Sidebar` - Abrir sidebar principal
- `Korix: Cancel Execution` - Cancelar execução atual
- `Korix: Clear History` - Limpar histórico

## ⚙️ Configuration

```json
{
  "korix.provider": "anthropic",
  "korix.anthropic.model": "claude-sonnet-4-6",
  "korix.maxIterations": 25,
  "korix.contextTokenBudget": 180000,
  "korix.approvalFlow.enabled": true
}
```

## 🏗️ Architecture

```
src/
├─ core/              # Runtime e tipos base
├─ providers/         # Abstração de LLM providers
├─ harness/           # Security e tool registry
├─ tools/             # Filesystem, git, terminal, workspace
├─ modes/             # ASK, PLAN, AGENT modes
├─ context/           # Indexing, ranking, retrieval
├─ patch/             # Patch engine
├─ terminal/          # PTY integration
├─ ui/                # Sidebar, timeline, approvals
├─ memory/            # Session management
└─ telemetry/         # Logging e metrics
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Watch mode (development)
npm run watch

# Build production
npm run compile

# Run tests
npm test

# Package extension
npm run package

# Lint
npm run lint

# Format
npm run format
```

## 📋 Roadmap

- [x] **Fase 1**: Foundation & Scaffold ✅
- [ ] **Fase 2**: Provider Layer
- [ ] **Fase 3**: Tool Harness & Security
- [ ] **Fase 4**: Agent Runtime
- [ ] **Fase 5**: Modes Implementation
- [ ] **Fase 6**: Context Engine
- [ ] **Fase 7**: Terminal System
- [ ] **Fase 8**: Patch Engine
- [ ] **Fase 9**: UI Components
- [ ] **Fase 10**: Production Hardening

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🔗 Links

- [Documentation](https://github.com/korix/korix-code/docs)
- [Issues](https://github.com/korix/korix-code/issues)
- [Changelog](CHANGELOG.md)

---

**Built with ❤️ by the Korix team**
