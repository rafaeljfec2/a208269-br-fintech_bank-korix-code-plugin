/**
 * StatusCard.test.tsx - Tests for status card component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StatusCard from './StatusCard';

describe('StatusCard', () => {
  it('should render without crashing', () => {
    render(<StatusCard type="completed" title="Test completed" />);
    expect(screen.getByText('Test completed')).toBeInTheDocument();
  });

  it('should display subtitle when provided', () => {
    render(
      <StatusCard
        type="completed"
        title="Test title"
        subtitle="Test subtitle"
      />
    );
    expect(screen.getByText('Test subtitle')).toBeInTheDocument();
  });

  it('should render action button when provided', () => {
    const mockOnClick = vi.fn();
    render(
      <StatusCard
        type="completed"
        title="Test"
        action={{ label: 'Click me', onClick: mockOnClick }}
      />
    );

    const button = screen.getByText('Click me');
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('should display completed icon for completed type', () => {
    const { container } = render(<StatusCard type="completed" title="Done" />);
    expect(container.textContent).toContain('✓');
  });

  it('should display plan icon for plan_created type', () => {
    const { container } = render(<StatusCard type="plan_created" title="Plan" />);
    expect(container.textContent).toContain('📋');
  });

  it('should display error icon for error type', () => {
    const { container } = render(<StatusCard type="error" title="Failed" />);
    expect(container.textContent).toContain('✗');
  });

  it('should apply correct styling for each type', () => {
    const { container: completedContainer } = render(
      <StatusCard type="completed" title="Test" />
    );
    expect(completedContainer.querySelector('.border-\\[var\\(--vscode-terminal-ansiGreen\\)\\]')).toBeInTheDocument();

    const { container: errorContainer } = render(
      <StatusCard type="error" title="Test" />
    );
    expect(errorContainer.querySelector('.border-\\[var\\(--vscode-terminal-ansiRed\\)\\]')).toBeInTheDocument();
  });

  it('should not render action button when not provided', () => {
    render(<StatusCard type="completed" title="Test" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
