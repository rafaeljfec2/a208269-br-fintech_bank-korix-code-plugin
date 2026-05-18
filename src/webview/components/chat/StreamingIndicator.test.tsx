/**
 * StreamingIndicator.test.tsx - Tests for streaming indicator component
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StreamingIndicator from './StreamingIndicator';

describe('StreamingIndicator', () => {
  it('should render without crashing', () => {
    render(<StreamingIndicator />);
    expect(screen.getByText('Korix está digitando...')).toBeInTheDocument();
  });

  it('should display spinner animation', () => {
    const { container } = render(<StreamingIndicator />);
    const spinner = container.querySelector('svg.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should have prominent styling', () => {
    const { container } = render(<StreamingIndicator />);
    const wrapper = container.firstChild as HTMLElement;

    // Verificar classes de destaque
    expect(wrapper.className).toContain('flex');
    expect(wrapper.className).toContain('items-center');
    expect(wrapper.className).toContain('gap-3');
  });

  it('should have pulsing text animation', () => {
    render(<StreamingIndicator />);
    const text = screen.getByText('Korix está digitando...');
    expect(text.className).toContain('animate-pulse');
  });
});
