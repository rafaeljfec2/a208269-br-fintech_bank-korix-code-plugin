/**
 * MarkdownErrorBoundary - Error boundary for ReactMarkdown
 *
 * Catches rendering errors and falls back to HTML renderer.
 */

import React from 'react';
import MarkdownFallback from './MarkdownFallback';

interface Props {
  readonly children: React.ReactNode;
  readonly content: string;
  readonly className?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class MarkdownErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[MarkdownErrorBoundary] ReactMarkdown crashed:', error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      console.warn('[MarkdownErrorBoundary] Falling back to HTML renderer');
      return (
        <MarkdownFallback
          content={this.props.content}
          className={this.props.className}
        />
      );
    }

    return this.props.children;
  }
}
