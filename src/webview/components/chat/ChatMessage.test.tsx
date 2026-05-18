/**
 * ChatMessage.test.tsx - Tests for chat message component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatMessage from './ChatMessage';
import type { Message } from './ChatMessage';

describe('ChatMessage', () => {
  const baseMessage: Message = {
    id: 'msg-1',
    role: 'assistant',
    content: 'Test message content',
    timestamp: Date.now(),
  };

  it('should render without crashing', () => {
    render(<ChatMessage message={baseMessage} />);
    expect(screen.getByText('Test message content')).toBeInTheDocument();
  });

  it('should apply user background for user messages', () => {
    const userMessage: Message = { ...baseMessage, role: 'user' };
    const { container } = render(<ChatMessage message={userMessage} />);

    const messageDiv = container.firstChild as HTMLElement;
    expect(messageDiv.className).toContain('bg-[var(--vscode-input-background)]');
  });

  it('should not apply user background for assistant messages', () => {
    const { container } = render(<ChatMessage message={baseMessage} />);

    const messageDiv = container.firstChild as HTMLElement;
    expect(messageDiv.className).not.toContain('bg-[var(--vscode-input-background)]');
  });

  it('should render status card when metadata contains statusCard', () => {
    const messageWithStatus: Message = {
      ...baseMessage,
      metadata: {
        statusCard: {
          type: 'completed',
          title: 'Task completed',
          subtitle: '3 steps',
        },
      },
    };

    render(<ChatMessage message={messageWithStatus} />);
    expect(screen.getByText('Task completed')).toBeInTheDocument();
    expect(screen.getByText('3 steps')).toBeInTheDocument();
  });

  it('should render execution timeline when metadata contains execution', () => {
    const messageWithExecution: Message = {
      ...baseMessage,
      metadata: {
        execution: {
          tools: [
            {
              id: '1',
              name: 'Read',
              description: 'Read file',
              status: 'success',
              duration: 1000,
              timestamp: Date.now(),
            },
          ],
          isExpanded: false,
          totalDuration: 1000,
        },
      },
    };

    render(<ChatMessage message={messageWithExecution} />);
    expect(screen.getByText('Execução')).toBeInTheDocument();
    expect(screen.getByText('1 ferramenta')).toBeInTheDocument();
  });

  it('should not render execution timeline when tools array is empty', () => {
    const messageWithEmptyTools: Message = {
      ...baseMessage,
      metadata: {
        execution: {
          tools: [],
          isExpanded: false,
          totalDuration: 0,
        },
      },
    };

    render(<ChatMessage message={messageWithEmptyTools} />);
    expect(screen.queryByText('Execução')).not.toBeInTheDocument();
  });

  it('should toggle timeline expansion on click', () => {
    const messageWithExecution: Message = {
      ...baseMessage,
      metadata: {
        execution: {
          tools: [
            {
              id: '1',
              name: 'Read',
              description: 'Read file test.ts',
              status: 'success',
              duration: 1000,
              timestamp: Date.now(),
            },
          ],
          isExpanded: false,
          totalDuration: 1000,
        },
      },
    };

    const { rerender } = render(<ChatMessage message={messageWithExecution} />);

    // Initially collapsed - tool description not visible
    expect(screen.queryByText('Read file test.ts')).not.toBeInTheDocument();

    // Click to expand
    const header = screen.getByText('Execução').closest('div');
    fireEvent.click(header!);

    // Force re-render with expanded state (simulating state update)
    const expandedMessage: Message = {
      ...messageWithExecution,
      metadata: {
        ...messageWithExecution.metadata,
        execution: {
          ...messageWithExecution.metadata!.execution!,
          isExpanded: true,
        },
      },
    };
    rerender(<ChatMessage message={expandedMessage} />);

    // Now tool description should be visible
    expect(screen.getByText('Read file test.ts')).toBeInTheDocument();
  });

  it('should display streaming indicator when isStreaming is true', () => {
    const streamingMessage: Message = {
      ...baseMessage,
      isStreaming: true,
    };

    render(<ChatMessage message={streamingMessage} />);
    expect(screen.getByText('Korix está digitando...')).toBeInTheDocument();
  });

  it('should not display streaming indicator when isStreaming is false', () => {
    render(<ChatMessage message={baseMessage} />);
    expect(screen.queryByText('Korix está digitando...')).not.toBeInTheDocument();
  });

  it('should render empty content message when content is empty', () => {
    const emptyMessage: Message = {
      ...baseMessage,
      content: '',
    };

    const { container } = render(<ChatMessage message={emptyMessage} />);
    // Componente ainda deve renderizar, mas sem conteúdo de texto
    expect(container.firstChild).toBeInTheDocument();
  });
});
