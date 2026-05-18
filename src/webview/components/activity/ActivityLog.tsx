/**
 * Activity Log - Registro completo de toda movimentação do plugin
 * Organizad por contextos expansíveis (iterações, execuções de tools, etc)
 */

import React from "react";
import { useStore } from "../../store";
import { motion, AnimatePresence } from "framer-motion";

export default function ActivityLog() {
  const contexts = useStore((state) => state.contexts);
  const toggleContext = useStore((state) => state.toggleContext);

  if (contexts.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-[var(--vscode-descriptionForeground)]">
        Nenhuma atividade registrada ainda
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {contexts.map((context) => (
        <div
          key={context.id}
          className="border border-[var(--vscode-panel-border)] rounded overflow-hidden bg-[var(--vscode-input-background)]"
        >
          {/* Context Header - Expansível */}
          <button
            onClick={() => toggleContext(context.id)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
          >
            <div className="flex items-center gap-2">
              {/* Chevron Icon */}
              <svg
                className={`w-4 h-4 transition-transform ${context.isExpanded ? "rotate-90" : ""}`}
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-sm font-medium text-[var(--vscode-foreground)]">
                {context.name}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-[var(--vscode-descriptionForeground)]">
              <span>{context.items.length} eventos</span>
              {context.endTime && (
                <span className="tabular-nums">
                  {((context.endTime - context.startTime) / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          </button>

          {/* Context Items - Colapsável */}
          <AnimatePresence>
            {context.isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-[var(--vscode-panel-border)]"
              >
                <div className="p-2 space-y-1">
                  {context.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-[var(--vscode-list-hoverBackground)] rounded"
                    >
                      {/* Status Icon */}
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          item.status === "success"
                            ? "bg-[var(--vscode-terminal-ansiGreen)]"
                            : item.status === "error"
                              ? "bg-[var(--vscode-terminal-ansiRed)]"
                              : "bg-[var(--vscode-terminal-ansiYellow)] animate-pulse"
                        }`}
                      />

                      {/* Description */}
                      <span className="flex-1 truncate text-[var(--vscode-foreground)]">
                        {item.description}
                      </span>

                      {/* Category Badge */}
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]">
                        {item.category}
                      </span>

                      {/* Duration */}
                      {item.duration !== undefined && item.duration > 0 && (
                        <span className="text-[var(--vscode-descriptionForeground)] tabular-nums">
                          {(item.duration / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
