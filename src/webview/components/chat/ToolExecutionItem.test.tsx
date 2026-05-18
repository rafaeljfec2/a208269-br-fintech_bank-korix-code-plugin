/**
 * ToolExecutionItem.test.tsx - Tests for tool execution item component
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ToolExecutionItem from './ToolExecutionItem';
import type { ToolExecution } from './ToolExecutionItem';

describe('ToolExecutionItem', () => {
  const baseTool: ToolExecution = {
    id: 'test-tool-1',
    name: 'Read',
    description: 'Read file test.ts',
    status: 'success',
    duration: 2100,
    timestamp: Date.now(),
  };

  it('should render without crashing', () => {
    render(<ToolExecutionItem tool={baseTool} />);
    expect(screen.getByText('Read file test.ts')).toBeInTheDocument();
  });

  it('should display tool name badge', () => {
    render(<ToolExecutionItem tool={baseTool} />);
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('should format duration correctly', () => {
    render(<ToolExecutionItem tool={baseTool} />);
    expect(screen.getByText('2.1s')).toBeInTheDocument();
  });

  it('should display success icon for successful tool', () => {
    const { container } = render(<ToolExecutionItem tool={baseTool} />);
    expect(container.textContent).toContain('✓');
  });

  it('should display error icon for failed tool', () => {
    const errorTool: ToolExecution = { ...baseTool, status: 'error' };
    const { container } = render(<ToolExecutionItem tool={errorTool} />);
    expect(container.textContent).toContain('✗');
  });

  it('should display spinner for pending tool', () => {
    const pendingTool: ToolExecution = { ...baseTool, status: 'pending', duration: 0 };
    const { container } = render(<ToolExecutionItem tool={pendingTool} />);

    const spinner = container.querySelector('svg.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should apply pulse animation to pending status icon', () => {
    const pendingTool: ToolExecution = { ...baseTool, status: 'pending', duration: 0 };
    const { container } = render(<ToolExecutionItem tool={pendingTool} />);

    const statusIcon = container.querySelector('.animate-pulse');
    expect(statusIcon).toBeInTheDocument();
  });

  it('should not display duration when duration is 0', () => {
    const toolWithZeroDuration: ToolExecution = { ...baseTool, duration: 0 };
    render(<ToolExecutionItem tool={toolWithZeroDuration} />);
    expect(screen.queryByText(/^\d+\.\ds$/)).not.toBeInTheDocument();
  });

  it('should display description correctly', () => {
    const toolWithLongDesc: ToolExecution = {
      ...baseTool,
      description: 'Read configuration file from workspace',
    };
    render(<ToolExecutionItem tool={toolWithLongDesc} />);
    expect(screen.getByText('Read configuration file from workspace')).toBeInTheDocument();
  });
});
