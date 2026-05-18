/**
 * BottomBar - Input area (Axiom style)
 * Input first, then icon controls with dropdowns
 */

import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { useVSCode } from '../../hooks/useVSCode';
import Dropdown from '../shared/Dropdown';
import QuestionCard from '../chat/QuestionCard';

type OpenDropdown = 'model' | 'mode' | 'workspace' | 'approval' | null;
type ApprovalMode = 'strict' | 'writes' | 'auto';

export default function BottomBar() {
  const [input, setInput] = useState('');
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);
  const [workspaceOnly, setWorkspaceOnly] = useState(false);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('writes');
  const [modelSearch, setModelSearch] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mode = useStore((state) => state.mode);
  const model = useStore((state) => state.model);
  const isExecuting = useStore((state) => state.isExecuting);
  const activeQuestion = useStore((state) => state.activeQuestion);
  const setMode = useStore((state) => state.setMode);
  const setModel = useStore((state) => state.setModel);
  const addMessage = useStore((state) => state.addMessage);
  const activeChatId = useStore((state) => state.activeChatId);
  const createChat = useStore((state) => state.createChat);
  const conversations = useStore((state) => state.conversations);
  const clearActiveQuestion = useStore((state) => state.clearActiveQuestion);
  const { sendMessage } = useVSCode();

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';

    // Set new height based on content, respecting min/max
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 60), 200);
    textarea.style.height = `${newHeight}px`;
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isExecuting) return;

    const messageContent = input.trim();

    // 1. Garantir que há uma conversa ativa
    let chatId = activeChatId;
    if (!chatId) {
      chatId = createChat('Nova conversa');
    }

    // 2. Pegar mensagens ANTES de adicionar (histórico sem a nova mensagem)
    const chat = conversations[chatId];
    const previousMessages = (chat?.messages ?? []).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Debug
    console.log('[BottomBar] Sending message:', {
      newMessage: messageContent,
      previousCount: previousMessages.length,
      lastPreviousRole: previousMessages[previousMessages.length - 1]?.role,
    });

    // 3. Adicionar mensagem do usuário ao store IMEDIATAMENTE (UI feedback)
    addMessage(chatId, {
      role: 'user',
      content: messageContent,
    });

    // 4. Enviar para o backend com histórico (runtime processing)
    sendMessage({
      type: 'send_message',
      payload: {
        content: messageContent,
        messages: previousMessages,
      },
    });

    // 5. Limpar input
    setInput('');

    // Reset textarea height after send e focar de volta
    if (textareaRef.current) {
      textareaRef.current.style.height = '60px';
      // Focar de volta no input para facilitar continuação da conversa
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // LiteLLM models - expandir conforme necessário
  const models = [
    { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', group: 'ANTHROPIC' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', group: 'ANTHROPIC' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', group: 'ANTHROPIC' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', group: 'ANTHROPIC' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', group: 'ANTHROPIC' },
    { id: 'gpt-4o', name: 'GPT-4o', group: 'OPENAI' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', group: 'OPENAI' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', group: 'OPENAI' },
  ];

  const filteredModels = models.filter((m) =>
    m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const currentModel = models.find((m) => m.id === model);

  // Render QuestionCard if there's an active question
  if (activeQuestion) {
    return (
      <div className="flex-shrink-0 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] px-3 py-2">
        <QuestionCard
          questionId={activeQuestion.questionId}
          title={activeQuestion.title}
          question={activeQuestion.question}
          mode={activeQuestion.mode}
          options={activeQuestion.options}
          timeoutMs={activeQuestion.timeoutMs}
          onSubmit={(answers) => {
            console.log("[BottomBar] QuestionCard onSubmit:", answers);

            // Send answer to extension
            sendMessage({
              type: "answer_question",
              payload: {
                questionId: activeQuestion.questionId,
                answers,
              },
            });

            // Clear question from footer
            clearActiveQuestion();

            // Add user response message
            const chatId = activeChatId ?? createChat("Nova conversa");
            const answerText = answers.join(", ");
            addMessage(chatId, {
              role: "user",
              content: `✓ Resposta: ${answerText}`,
            });
          }}
          onTimeout={() => {
            console.log("[BottomBar] QuestionCard onTimeout");

            // Send default answer
            const defaultAnswers = Array.isArray(activeQuestion.defaultAnswer)
              ? activeQuestion.defaultAnswer
              : activeQuestion.defaultAnswer
              ? [activeQuestion.defaultAnswer]
              : [activeQuestion.options[0]?.value ?? ""];

            sendMessage({
              type: "answer_question",
              payload: {
                questionId: activeQuestion.questionId,
                answers: defaultAnswers,
              },
            });

            // Clear question from footer
            clearActiveQuestion();

            // Add timeout message
            const chatId = activeChatId ?? createChat("Nova conversa");
            addMessage(chatId, {
              role: "user",
              content: `⏱ Timeout - Resposta padrão: ${defaultAnswers.join(", ")}`,
            });
          }}
          onCancel={() => {
            console.log("[BottomBar] QuestionCard onCancel");
            clearActiveQuestion();
          }}
        />
      </div>
    );
  }

  // Render normal input area
  return (
    <div className="flex-shrink-0 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] px-3 py-2">
      {/* Input Area - Primeiro */}
      <div className="mb-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte ao Korix..."
          className="w-full px-3 py-2 bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)] rounded resize-none focus:outline-none focus:border-[var(--vscode-focusBorder)] text-sm"
          rows={2}
          disabled={isExecuting}
          style={{ minHeight: '60px', maxHeight: '200px', overflow: 'auto' }}
        />
      </div>

      {/* Controls Bar - Minimalista como Claude Code */}
      <div className="flex items-center gap-1 relative">
        {/* Model Selector */}
        <div className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'model' ? null : 'model')}
            className="p-1.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100 transition-opacity"
            disabled={isExecuting}
            title={currentModel?.name ?? 'Select model'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a6.5 6.5 0 0 1 6.5 6.5c0 1.5-.5 2.9-1.3 4L15 13.3l-.7.7-1.8-1.8c-1.1.8-2.5 1.3-4 1.3A6.5 6.5 0 0 1 8 1zm0 1a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/>
            </svg>
          </button>

          <Dropdown isOpen={openDropdown === 'model'} onClose={() => setOpenDropdown(null)}>
            <div className="px-2 py-1.5">
              <input
                type="text"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Buscar modelo..."
                className="w-full px-2 py-1 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded-sm text-xs focus:outline-none focus:border-[var(--vscode-focusBorder)]"
              />
            </div>

            <div className="max-h-80 overflow-y-auto">
              {['ANTHROPIC', 'OPENAI'].map((group) => {
                const groupModels = filteredModels.filter((m) => m.group === group);
                if (groupModels.length === 0) return null;

                return (
                  <div key={group}>
                    <div className="px-2 py-1 text-[10px] opacity-40 font-medium uppercase tracking-wider">{group}</div>
                    {groupModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setModel(m.id);
                          setOpenDropdown(null);
                          setModelSearch('');
                        }}
                        className="w-full flex items-center justify-between px-2 py-1 hover:bg-[var(--vscode-list-hoverBackground)] text-xs text-left"
                      >
                        <span className={model === m.id ? 'font-medium' : ''}>{m.name}</span>
                        {model === m.id && (
                          <span className="text-[var(--vscode-list-activeSelectionForeground)] text-xs">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </Dropdown>
        </div>

        {/* Agent/Mode Selector */}
        <div className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'mode' ? null : 'mode')}
            className="p-1.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100 transition-opacity"
            disabled={isExecuting}
            title={mode.charAt(0).toUpperCase() + mode.slice(1)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.5 1a1.5 1.5 0 0 0-1 2.62V6H6a2 2 0 0 0-2 2v1.38a1.5 1.5 0 1 0 1 0V8a1 1 0 0 1 1-1h1.5v2.38a1.5 1.5 0 1 0 1 0V7H10a1 1 0 0 1 1 1v1.38a1.5 1.5 0 1 0 1 0V8a2 2 0 0 0-2-2H8.5V3.62A1.5 1.5 0 0 0 8.5 1z"/>
            </svg>
          </button>

          <Dropdown isOpen={openDropdown === 'mode'} onClose={() => setOpenDropdown(null)}>
            {(['agent', 'plan', 'ask'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  sendMessage({ type: 'change_mode', payload: { mode: m } });
                  setOpenDropdown(null);
                }}
                className="w-full flex items-center gap-2 px-2 py-1 hover:bg-[var(--vscode-list-hoverBackground)] text-xs text-left"
              >
                <span className={mode === m ? 'opacity-100' : 'opacity-50'} style={{ fontSize: '14px' }}>
                  {m === 'agent' ? '🤖' : m === 'plan' ? '📋' : '💬'}
                </span>
                <span className={`flex-1 ${mode === m ? 'font-medium' : ''}`}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </span>
                {mode === m && (
                  <span className="text-[var(--vscode-list-activeSelectionForeground)] text-xs">✓</span>
                )}
              </button>
            ))}
          </Dropdown>
        </div>

        {/* Workspace Toggle */}
        <div className="relative">
          <button
            onClick={() => setWorkspaceOnly(!workspaceOnly)}
            className={`p-1.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-opacity ${
              workspaceOnly ? 'opacity-100' : 'opacity-60'
            } hover:opacity-100`}
            disabled={isExecuting}
            title={workspaceOnly ? 'Workspace only' : 'All files'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.5 1h11a.5.5 0 0 1 .5.5V5h-1V2H3v11h3v1H2.5a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z"/>
              <path d="M7.5 7h7a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5zm.5 1v6h6V8H8z"/>
            </svg>
          </button>
        </div>

        {/* Auto-approve Selector */}
        <div className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'approval' ? null : 'approval')}
            className={`p-1.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-opacity ${
              approvalMode === 'auto' ? 'text-orange-500 opacity-100' : 'opacity-60'
            } hover:opacity-100`}
            disabled={isExecuting}
            title={
              approvalMode === 'auto'
                ? 'Auto approve'
                : approvalMode === 'strict'
                ? 'Confirm all writes (strict)'
                : 'Confirm writes'
            }
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
            </svg>
          </button>

          <Dropdown isOpen={openDropdown === 'approval'} onClose={() => setOpenDropdown(null)}>
            <button
              onClick={() => {
                setApprovalMode('strict');
                setOpenDropdown(null);
              }}
              className="w-full px-2 py-1.5 hover:bg-[var(--vscode-list-hoverBackground)] text-left"
            >
              <div className="text-xs flex items-center justify-between mb-0.5">
                <span className={approvalMode === 'strict' ? 'font-medium' : ''}>
                  Confirmar Escritas (estrito)
                </span>
                {approvalMode === 'strict' && <span className="text-[var(--vscode-list-activeSelectionForeground)] text-xs">✓</span>}
              </div>
              <div className="text-[10px] opacity-50 leading-snug">
                Confirmar toda operação de escrita
              </div>
            </button>

            <button
              onClick={() => {
                setApprovalMode('writes');
                setOpenDropdown(null);
              }}
              className="w-full px-2 py-1.5 hover:bg-[var(--vscode-list-hoverBackground)] text-left"
            >
              <div className="text-xs flex items-center justify-between mb-0.5">
                <span className={approvalMode === 'writes' ? 'font-medium' : ''}>
                  Confirmar Escritas
                </span>
                {approvalMode === 'writes' && <span className="text-[var(--vscode-list-activeSelectionForeground)] text-xs">✓</span>}
              </div>
              <div className="text-[10px] opacity-50 leading-snug">
                Apenas escritas requerem aprovação (recomendado)
              </div>
            </button>

            <button
              onClick={() => {
                setApprovalMode('auto');
                setOpenDropdown(null);
              }}
              className="w-full px-2 py-1.5 hover:bg-[var(--vscode-list-hoverBackground)] text-left"
            >
              <div className="text-xs flex items-center justify-between mb-0.5">
                <span className={approvalMode === 'auto' ? 'font-medium' : ''}>
                  Auto Aprovar
                </span>
                {approvalMode === 'auto' && <span className="text-[var(--vscode-list-activeSelectionForeground)] text-xs">✓</span>}
              </div>
              <div className="text-[10px] opacity-50 leading-snug">
                Executar todas as tools sem perguntar
              </div>
            </button>
          </Dropdown>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Context Usage - Circular Progress */}
        <button
          className="p-1.5 hover:bg-[var(--vscode-list-hoverBackground)] rounded opacity-60 hover:opacity-100 relative"
          title="Context: 15.2K / 200K tokens (7.6%)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" className="transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.2"
            />
            {/* Progress circle */}
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray={`${2 * Math.PI * 6}`}
              strokeDashoffset={`${2 * Math.PI * 6 * (1 - 0.076)}`}
              strokeLinecap="round"
              opacity="0.8"
            />
          </svg>
        </button>

        {/* @ Mention */}
        <button
          className="p-1.5 hover:bg-[var(--vscode-list-hoverBackground)] rounded opacity-60 hover:opacity-100"
          title="Mention (@)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 0 0-7 7c0 3.86 3.14 7 7 7h3.5a.5.5 0 0 0 0-1H8a6 6 0 1 1 6-6v.5a1.5 1.5 0 1 1-3 0V8a4 4 0 1 0-1.5 3.11c.42.46.98.75 1.61.86A2.5 2.5 0 0 0 16 9.5V8a7 7 0 0 0-7-7zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
          </svg>
        </button>

        {/* + Attach */}
        <button
          className="p-1.5 hover:bg-[var(--vscode-list-hoverBackground)] rounded opacity-60 hover:opacity-100"
          title="Attach (+)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z" />
          </svg>
        </button>

        {/* Send Arrow */}
        <button
          onClick={handleSend}
          disabled={!input.trim() || isExecuting}
          className="p-1.5 bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-30 disabled:cursor-not-allowed rounded"
          title="Send (Enter)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14.5 8l-10 6V2l10 6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
