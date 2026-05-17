/**
 * StreamingIndicator - Blinking cursor for streaming messages
 */

import React from 'react';

export default function StreamingIndicator() {
  return (
    <span className="inline-block w-1.5 h-4 bg-[var(--vscode-button-background)] ml-0.5 animate-pulse" />
  );
}
