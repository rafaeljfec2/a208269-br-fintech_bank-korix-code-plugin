/**
 * MarkdownContent - Renders markdown with syntax highlighting
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { clsx } from 'clsx';
import CodeBlock from './CodeBlock';

interface MarkdownContentProps {
  readonly content: string;
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  const markdownContent = clsx(
    'prose prose-sm max-w-none',
    'prose-headings:text-[var(--vscode-foreground)]',
    'prose-p:text-[var(--vscode-foreground)]',
    'prose-a:text-[var(--vscode-textLink-foreground)]',
    'prose-a:no-underline hover:prose-a:underline',
    'prose-code:text-[var(--vscode-textPreformat-foreground)]',
    'prose-code:bg-[var(--vscode-input-background)]',
    'prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
    'prose-pre:bg-transparent prose-pre:p-0', // Code blocks usam CodeBlock.tsx
    'prose-li:text-[var(--vscode-foreground)]',
    'prose-strong:text-[var(--vscode-foreground)]',
    'prose-em:text-[var(--vscode-foreground)]'
  );

  return (
    <ReactMarkdown
      className={markdownContent}
      remarkPlugins={[remarkGfm]} // GitHub Flavored Markdown (tables, strikethrough, task lists)
      rehypePlugins={[rehypeHighlight]} // Syntax highlighting
      components={{
        // Custom renderer para code blocks
        code({ inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';
          const code = String(children).replace(/\n$/, '');

          return !inline && language ? (
            <CodeBlock code={code} language={language} />
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        // Links abrem em nova aba
        a({ children, href, ...props }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
