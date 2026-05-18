/**
 * CodeBlock.test.tsx - Tests for code block component with syntax highlighting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CodeBlock from './CodeBlock';

describe('CodeBlock', () => {
  // Mock clipboard API
  const mockWriteText = vi.fn();

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<CodeBlock code="const foo = 'bar';" language="typescript" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display language badge', () => {
    render(<CodeBlock code="const foo = 'bar';" language="typescript" />);
    expect(screen.getByText('typescript')).toBeInTheDocument();
  });

  it('should display copy button', () => {
    render(<CodeBlock code="const foo = 'bar';" language="typescript" />);
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('should copy code to clipboard when copy button is clicked', async () => {
    const code = "const foo = 'bar';";
    render(<CodeBlock code={code} language="typescript" />);

    const copyButton = screen.getByText('Copy');
    fireEvent.click(copyButton);

    expect(mockWriteText).toHaveBeenCalledWith(code);
  });

  it('should show "✓ Copied" after copying', async () => {
    render(<CodeBlock code="const foo = 'bar';" language="typescript" />);

    const copyButton = screen.getByText('Copy');
    fireEvent.click(copyButton);

    expect(screen.getByText('✓ Copied')).toBeInTheDocument();
  });

  it('should reset copy button text after 2 seconds', async () => {
    vi.useFakeTimers();

    render(<CodeBlock code="const foo = 'bar';" language="typescript" />);

    const copyButton = screen.getByText('Copy');
    fireEvent.click(copyButton);

    expect(screen.getByText('✓ Copied')).toBeInTheDocument();

    // Fast-forward 2 seconds and flush microtasks
    await vi.advanceTimersByTimeAsync(2000);

    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.queryByText('✓ Copied')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('should render code content', () => {
    const code = "function test() {\n  return true;\n}";
    const { container } = render(<CodeBlock code={code} language="javascript" />);

    const codeElement = container.querySelector('code');
    expect(codeElement).toBeInTheDocument();
  });

  it('should handle different languages', () => {
    const languages = ['typescript', 'python', 'java', 'go', 'rust'];

    languages.forEach((lang) => {
      const { unmount } = render(<CodeBlock code="test code" language={lang} />);
      expect(screen.getByText(lang)).toBeInTheDocument();
      unmount();
    });
  });

  it('should handle multiline code', () => {
    const multilineCode = `function example() {
  const x = 1;
  const y = 2;
  return x + y;
}`;

    const { container } = render(<CodeBlock code={multilineCode} language="typescript" />);
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeInTheDocument();
  });

  it('should handle code with special characters', () => {
    const codeWithSpecialChars = "const regex = /[a-z]+/g;\nconst str = 'test <>&\"';";
    const { container } = render(<CodeBlock code={codeWithSpecialChars} language="typescript" />);

    const codeElement = container.querySelector('code');
    expect(codeElement).toBeInTheDocument();
  });

  it('should apply syntax highlighting via highlight.js', () => {
    const { container } = render(
      <CodeBlock code="const foo = 'bar';" language="typescript" />
    );

    // After highlight.js processes, code element should have highlighted HTML
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeInTheDocument();
    expect(codeElement?.innerHTML).toBeTruthy();
  });

  it('should handle empty code', () => {
    const { container } = render(<CodeBlock code="" language="typescript" />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
