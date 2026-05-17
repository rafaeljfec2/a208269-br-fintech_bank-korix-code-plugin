/**
 * CodeBlock - Syntax highlighted code block with copy functionality
 */

import React, { useState } from 'react';
import hljs from 'highlight.js';
import { clsx } from 'clsx';

interface CodeBlockProps {
  readonly code: string;
  readonly language: string;
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Highlight código
  const highlighted = hljs.highlight(code, { language }).value;

  // Classes
  const codeBlock = clsx(
    'relative rounded-md overflow-hidden my-3',
    'border border-[var(--vscode-input-border)]',
    'bg-[var(--vscode-input-background)]'
  );

  const codeHeader = clsx(
    'flex items-center justify-between px-3 py-2',
    'border-b border-[var(--vscode-panel-border)]',
    'bg-[var(--vscode-input-background)]'
  );

  const languageBadge = 'text-xs opacity-60 font-mono';

  const copyButton = clsx(
    'px-2 py-1 text-xs rounded',
    'hover:bg-[var(--vscode-list-hoverBackground)]',
    'transition-colors cursor-pointer'
  );

  return (
    <div className={codeBlock}>
      {/* Header */}
      <div className={codeHeader}>
        <span className={languageBadge}>{language}</span>
        <button className={copyButton} onClick={handleCopy} type="button">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* Code */}
      <pre className="p-4 overflow-x-auto">
        <code
          className={`language-${language}`}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}
