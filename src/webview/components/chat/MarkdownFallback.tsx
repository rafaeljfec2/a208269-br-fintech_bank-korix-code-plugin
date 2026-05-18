/**
 * MarkdownFallback - Fallback renderer using marked + DOMPurify
 *
 * Used when ReactMarkdown fails or as alternative rendering path.
 * Renders markdown to HTML directly with sanitization for security.
 */

import React from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

interface MarkdownFallbackProps {
  readonly content: string;
  readonly className?: string;
}

export default function MarkdownFallback({
  content,
  className,
}: MarkdownFallbackProps) {
  const html = React.useMemo(() => {
    try {
      // Configure marked for GitHub Flavored Markdown
      marked.setOptions({
        gfm: true,
        breaks: true,
      });

      const rawHtml = marked.parse(content) as string;

      // Sanitize HTML to prevent XSS
      return DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'p',
          'a',
          'ul',
          'ol',
          'li',
          'code',
          'pre',
          'strong',
          'em',
          'table',
          'thead',
          'tbody',
          'tr',
          'th',
          'td',
          'br',
          'hr',
          'blockquote',
          'del',
        ],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
      });
    } catch (error) {
      console.error('[MarkdownFallback] Parse error:', error);
      return `<pre>${DOMPurify.sanitize(content)}</pre>`;
    }
  }, [content]);

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
