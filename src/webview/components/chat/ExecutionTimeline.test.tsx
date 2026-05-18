/**
 * ExecutionTimeline.test.tsx - Tests for execution timeline component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExecutionTimeline from './ExecutionTimeline';
import type { ToolExecution } from './ToolExecutionItem';

describe('ExecutionTimeline', () => {
  const mockTools: ToolExecution[] = [
    {
      id: '1',
      name: 'Read',
      description: 'Read file',
      status: 'success',
      duration: 1000,
      timestamp: Date.now(),
    },
    {
      id: '2',
      name: 'Edit',
      description: 'Edit file',
      status: 'success',
      duration: 2000,
      timestamp: Date.now(),
    },
  ];

  it('should render without crashing', () => {
    const mockOnToggle = vi.fn();
    render(<ExecutionTimeline tools={mockTools} isExpanded={false} onToggle={mockOnToggle} />);
    expect(screen.getByText('Execução')).toBeInTheDocument();
  });

  it('should display tool count', () => {
    const mockOnToggle = vi.fn();
    render(<ExecutionTimeline tools={mockTools} isExpanded={false} onToggle={mockOnToggle} />);
    expect(screen.getByText('2 ferramentas')).toBeInTheDocument();
  });

  it('should display singular form when only 1 tool', () => {
    const mockOnToggle = vi.fn();
    render(<ExecutionTimeline tools={[mockTools[0]]} isExpanded={false} onToggle={mockOnToggle} />);
    expect(screen.getByText('1 ferramenta')).toBeInTheDocument();
  });

  it('should calculate and display total duration', () => {
    const mockOnToggle = vi.fn();
    render(<ExecutionTimeline tools={mockTools} isExpanded={false} onToggle={mockOnToggle} />);
    // 1000ms + 2000ms = 3000ms = 3.0s
    expect(screen.getByText('3.0s total')).toBeInTheDocument();
  });

  it('should not display duration when total is 0', () => {
    const mockOnToggle = vi.fn();
    const toolsWithZeroDuration: ToolExecution[] = [
      { ...mockTools[0], duration: 0 },
    ];
    render(
      <ExecutionTimeline
        tools={toolsWithZeroDuration}
        isExpanded={false}
        onToggle={mockOnToggle}
      />
    );
    expect(screen.queryByText(/s total/)).not.toBeInTheDocument();
  });

  it('should call onToggle when header is clicked', () => {
    const mockOnToggle = vi.fn();
    render(<ExecutionTimeline tools={mockTools} isExpanded={false} onToggle={mockOnToggle} />);

    const header = screen.getByText('Execução').closest('div');
    fireEvent.click(header!);

    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });

  it('should show expand arrow (▶) when collapsed', () => {
    const mockOnToggle = vi.fn();
    const { container } = render(
      <ExecutionTimeline tools={mockTools} isExpanded={false} onToggle={mockOnToggle} />
    );
    expect(container.textContent).toContain('▶');
  });

  it('should show collapse arrow (▼) when expanded', () => {
    const mockOnToggle = vi.fn();
    const { container } = render(
      <ExecutionTimeline tools={mockTools} isExpanded={true} onToggle={mockOnToggle} />
    );
    expect(container.textContent).toContain('▼');
  });

  it('should render tool items when expanded', () => {
    const mockOnToggle = vi.fn();
    render(<ExecutionTimeline tools={mockTools} isExpanded={true} onToggle={mockOnToggle} />);

    expect(screen.getByText('Read file')).toBeInTheDocument();
    expect(screen.getByText('Edit file')).toBeInTheDocument();
  });

  it('should not render tool items when collapsed', () => {
    const mockOnToggle = vi.fn();
    render(<ExecutionTimeline tools={mockTools} isExpanded={false} onToggle={mockOnToggle} />);

    expect(screen.queryByText('Read file')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit file')).not.toBeInTheDocument();
  });
});
