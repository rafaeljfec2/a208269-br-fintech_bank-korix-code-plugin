/**
 * EmptyChatWelcome - Welcome message shown in empty active chats
 */

import React from 'react';
import { motion } from 'framer-motion';
import trIcon from '../../assets/tr-icon.svg';

export default function EmptyChatWelcome() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex items-center justify-center h-full"
    >
      <div className="text-center max-w-2xl px-6">
        {/* Logo and Title */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <img
            src={trIcon}
            alt="TR Logo"
            width="40"
            height="40"
            className="flex-shrink-0 opacity-80"
          />
          <h1 className="text-3xl font-light tracking-wide text-white">
            Korix Code
          </h1>
        </div>

        {/* Subtitle */}
        <p className="text-base opacity-70 leading-relaxed text-white mb-8">
          AI-native coding assistant powered by Axiom Agents
        </p>

        {/* Quick Actions / Suggestions */}
        <div className="space-y-3 text-left">
          <div className="text-xs opacity-50 text-white uppercase tracking-wider mb-4">
            Como posso ajudar?
          </div>

          <div className="grid gap-3">
            <SuggestionCard
              icon="🐛"
              title="Corrigir um bug"
              description="Analise e corrija problemas no código"
            />
            <SuggestionCard
              icon="✨"
              title="Adicionar funcionalidade"
              description="Implemente novos recursos seguindo padrões do projeto"
            />
            <SuggestionCard
              icon="📝"
              title="Revisar código"
              description="Revise código para qualidade e boas práticas"
            />
            <SuggestionCard
              icon="🧪"
              title="Criar testes"
              description="Gere testes unitários e de integração"
            />
          </div>
        </div>

        {/* Footer hint */}
        <p className="text-xs opacity-40 mt-8 text-white">
          Digite sua pergunta abaixo para começar
        </p>
      </div>
    </motion.div>
  );
}

interface SuggestionCardProps {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
}

function SuggestionCard({ icon, title, description }: SuggestionCardProps) {
  return (
    <div className="bg-[var(--vscode-input-background)] rounded-lg p-4 border border-[var(--vscode-input-border)] hover:border-[var(--vscode-focusBorder)] transition-colors">
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{icon}</span>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-white mb-1">{title}</h3>
          <p className="text-xs opacity-60 text-white">{description}</p>
        </div>
      </div>
    </div>
  );
}
