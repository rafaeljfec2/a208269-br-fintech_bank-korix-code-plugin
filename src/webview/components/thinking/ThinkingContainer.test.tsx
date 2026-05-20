import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ThinkingContainer from './ThinkingContainer';
import type { ThinkingTimelineItem } from '../../store/slices/chatSlice';

describe('ThinkingContainer', () => {
  const items: ThinkingTimelineItem[] = [
    {
      id: '1',
      stage: 'analyzing_request',
      title: 'Analyzing request',
      summary: 'answer task, low risk',
      status: 'success',
      timestamp: 1,
    },
  ];

  it('should render collapsed by default', () => {
    render(<ThinkingContainer items={items} active={true} />);

    expect(screen.getByText('thinking ...')).toBeInTheDocument();
    expect(screen.queryByText('Analyzing request')).not.toBeInTheDocument();
    expect(screen.queryByText('answer task, low risk')).not.toBeInTheDocument();
  });

  it('should expand when clicked', () => {
    render(<ThinkingContainer items={items} active={true} />);

    fireEvent.click(screen.getByRole('button', { name: /thinking/ }));

    expect(screen.getByText('Analyzing request')).toBeInTheDocument();
    expect(screen.getByText(/answer task, low risk/)).toBeInTheDocument();
  });

  it('should animate the thinking dots', () => {
    vi.useFakeTimers();

    try {
      render(<ThinkingContainer items={items} active={true} />);

      expect(screen.getByText('thinking ...')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(420);
      });

      expect(screen.getByText('thinking .')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(420);
      });

      expect(screen.getByText('thinking ..')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should render completed thinking without loading dots', () => {
    render(<ThinkingContainer items={items} />);

    expect(screen.getByText('thought')).toBeInTheDocument();
    expect(screen.queryByText(/thinking/)).not.toBeInTheDocument();
  });

  it('should give the collapsed label enough line height for descenders', () => {
    render(<ThinkingContainer items={items} />);

    const button = screen.getByRole('button', { name: /thought/ });

    expect(button).toHaveClass('min-h-[18px]');
    expect(button).toHaveClass('leading-[1.4]');
    expect(button).not.toHaveClass('leading-none');
  });

  it('should hide noisy runtime internals from completed thinking', () => {
    render(
      <ThinkingContainer
        defaultExpanded={true}
        items={[
          ...items,
          {
            id: '2',
            stage: 'executing_loop',
            title: 'Running supervised agent loop',
            summary: 'Executing provider and tool loop under runtime guards.',
            status: 'pending',
            timestamp: 2,
          },
          {
            id: '3',
            stage: 'iteration_start',
            title: 'Iteration 0 started',
            summary: 'Agent loop started an execution step.',
            status: 'pending',
            timestamp: 3,
          },
          {
            id: '4',
            stage: 'validating_response',
            title: 'Validating answer',
            summary: 'Response validated against runtime evidence.',
            status: 'success',
            timestamp: 4,
          },
          {
            id: '5',
            stage: 'response_validation',
            title: 'Answer validated',
            summary: 'Response validated against available runtime evidence.',
            status: 'success',
            timestamp: 5,
          },
          {
            id: '6',
            stage: 'done',
            title: 'Provider turn completed',
            summary: 'Final response stream is ready to commit.',
            status: 'success',
            timestamp: 6,
          },
          {
            id: '7',
            stage: 'execution_complete',
            title: 'Execution completed',
            summary: '1 iteration(s), 0 tool call(s), 15 token(s).',
            status: 'success',
            timestamp: 7,
          },
          {
            id: '8',
            stage: 'execution_graph_update',
            title: 'Execution graph updated',
            summary: '3 nodes, 1 edges.',
            status: 'success',
            timestamp: 8,
          },
        ]}
      />,
    );

    expect(screen.getByText('Analyzed request')).toBeInTheDocument();
    expect(screen.getByText('Validated answer')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();

    expect(screen.queryByText(/answer task, low risk/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Running supervised agent loop/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Iteration 0 started/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Provider turn completed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Execution graph updated/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Validating answer/)).not.toBeInTheDocument();
  });
});
