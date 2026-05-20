/**
 * MarkdownContent - Renders markdown with syntax highlighting
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import { clsx } from 'clsx';
import CodeBlock from './CodeBlock';
import { InfoBlock } from '../shared/InfoBlock';
import { postProcessMarkdown } from '../../utils/markdownPostProcessor';
import { MarkdownErrorBoundary } from './MarkdownErrorBoundary';

interface MarkdownContentProps {
  readonly content: string;
  readonly isStreaming?: boolean;
}

function MarkdownContent({ content, isStreaming = false }: MarkdownContentProps) {
  // Null/undefined guard
  if (!content || typeof content !== 'string') {
    console.warn('[MarkdownContent] Invalid content:', typeof content);
    return <div className="text-red-500">Invalid markdown content</div>;
  }

  // CRITICAL OPTIMIZATION: Render plain text during streaming, markdown when done
  // This prevents ReactMarkdown from re-processing the entire content on every token
  if (isStreaming) {
    return (
      <div className="whitespace-pre-wrap text-[var(--vscode-foreground)] text-sm leading-relaxed font-mono">
        {content}
        <span className="inline-block w-2 h-4 bg-[var(--vscode-foreground)] animate-pulse ml-1" />
      </div>
    );
  }

  // Post-process markdown for professional formatting with error handling
  // Only run when NOT streaming (finalized content)
  const processedContent = React.useMemo(() => {
    try {
      return postProcessMarkdown(content, {
        addStrategicEmojis: true,
        convertToTables: true,
        enhanceStructure: true,
      });
    } catch (error) {
      console.error('[MarkdownContent] Post-processor error:', error);
      return content; // Fallback to raw content
    }
  }, [content]);
  const markdownContent = clsx(
    'prose prose-sm max-w-none',
    // Headings
    'prose-headings:text-[var(--vscode-foreground)]',
    'prose-headings:font-semibold prose-headings:mb-3 prose-headings:mt-6',
    'prose-h1:text-xl prose-h2:text-lg prose-h3:text-base',
    // Paragraphs & text
    'prose-p:text-[var(--vscode-foreground)] prose-p:my-3 prose-p:leading-relaxed',
    'prose-strong:text-[var(--vscode-foreground)] prose-strong:font-semibold',
    'prose-em:text-[var(--vscode-foreground)]',
    // Links
    'prose-a:text-[var(--vscode-textLink-foreground)]',
    'prose-a:no-underline hover:prose-a:underline',
    // Lists
    'prose-ul:my-3 prose-ul:space-y-1',
    'prose-ol:my-3 prose-ol:space-y-1',
    'prose-li:text-[var(--vscode-foreground)] prose-li:my-1',
    // Tables
    'prose-table:w-full prose-table:my-4 prose-table:border-collapse',
    'prose-thead:border-b prose-thead:border-[var(--vscode-panel-border)]',
    'prose-th:text-[var(--vscode-foreground)] prose-th:font-semibold prose-th:text-left prose-th:py-2 prose-th:px-3',
    'prose-td:text-[var(--vscode-foreground)] prose-td:py-2 prose-td:px-3 prose-td:border-t prose-td:border-[var(--vscode-panel-border)]',
    'prose-tr:border-b prose-tr:border-[var(--vscode-panel-border)]',
    // Code
    'prose-code:text-[var(--vscode-textPreformat-foreground)]',
    'prose-code:bg-[var(--vscode-input-background)]',
    'prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm',
    'prose-pre:bg-transparent prose-pre:p-0', // Code blocks usam CodeBlock.tsx
  );

  return (
    <div className={markdownContent}>
      <MarkdownErrorBoundary content={processedContent} className={markdownContent}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkDirective]}
          components={{
            // Custom renderer para code blocks
            code(props) {
              const { inline, className, children, ...rest } = props as {
                inline?: boolean;
                className?: string;
                children?: React.ReactNode;
              };
              const match = /language-(\w+)/.exec(className || '');
              const language = match ? match[1] : '';
              const code = nodeToText(children).replace(/\n$/, '');

              return !inline && language ? (
                <CodeBlock code={code} language={language} />
              ) : (
                <code className={className} {...rest}>
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
            // Directive containers (:::note, :::warning, etc.)
            containerDirective(props) {
              const { name, children } = props as {
                name?: string;
                children?: React.ReactNode;
              };

              const typeMap: Record<string, 'note' | 'warning' | 'error' | 'success' | 'tip' | 'important'> = {
                note: 'note',
                warning: 'warning',
                error: 'error',
                success: 'success',
                tip: 'tip',
                important: 'important',
              };

              const type = name ? typeMap[name.toLowerCase()] ?? 'note' : 'note';

              return <InfoBlock type={type}>{children}</InfoBlock>;
            },
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </MarkdownErrorBoundary>
    </div>
  );
}

// Otimização: Re-render apenas quando content mudar
export default React.memo(MarkdownContent);

function nodeToText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(nodeToText).join('');
  }

  if (React.isValidElement<{ readonly children?: React.ReactNode }>(node)) {
    return nodeToText(node.props.children);
  }

  return '';
}
