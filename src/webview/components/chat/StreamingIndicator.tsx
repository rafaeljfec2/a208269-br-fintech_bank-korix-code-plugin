/**
 * StreamingIndicator - Spinner + text for streaming messages
 */

import React from 'react';

export default function StreamingIndicator() {
  return (
    <div className="flex items-center gap-3 mt-3 px-2 py-1.5 rounded-md bg-[var(--vscode-input-background)]/50">
      <svg className="w-4 h-4 animate-spin text-blue-500" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="text-sm font-medium animate-pulse text-[var(--vscode-foreground)]">
        Korix está digitando...
      </span>
    </div>
  );
}
