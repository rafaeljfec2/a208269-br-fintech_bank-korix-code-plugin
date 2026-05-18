/**
 * MarkdownContent.test.tsx - Tests for markdown content renderer
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkdownContent from './MarkdownContent';

describe('MarkdownContent', () => {
  it('should render plain text', () => {
    render(<MarkdownContent content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('should render headings', () => {
    const content = `# Heading 1

## Heading 2`;
    render(<MarkdownContent content={content} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Heading 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Heading 2' })).toBeInTheDocument();
  });

  it('should render bold text', () => {
    const { container } = render(<MarkdownContent content="**bold text**" />);
    const strong = container.querySelector('strong');
    expect(strong).toBeInTheDocument();
    expect(strong?.textContent).toBe('bold text');
  });

  it('should render italic text', () => {
    const { container } = render(<MarkdownContent content="*italic text*" />);
    const em = container.querySelector('em');
    expect(em).toBeInTheDocument();
    expect(em?.textContent).toBe('italic text');
  });

  it('should render unordered lists', () => {
    const content = `
- Item 1
- Item 2
- Item 3
    `;
    render(<MarkdownContent content={content} />);

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(3);
    expect(listItems[0].textContent).toBe('Item 1');
    expect(listItems[1].textContent).toBe('Item 2');
    expect(listItems[2].textContent).toBe('Item 3');
  });

  it('should render ordered lists', () => {
    const content = `
1. First
2. Second
3. Third
    `;
    render(<MarkdownContent content={content} />);

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(3);
    expect(listItems[0].textContent).toBe('First');
  });

  it('should render links with target="_blank"', () => {
    render(<MarkdownContent content="[GitHub](https://github.com)" />);

    const link = screen.getByRole('link', { name: 'GitHub' }) as HTMLAnchorElement;
    expect(link).toBeInTheDocument();
    expect(link.href).toBe('https://github.com/');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('should render inline code', () => {
    const { container } = render(<MarkdownContent content="Use `const` instead of `var`" />);

    const codeElements = container.querySelectorAll('code');
    expect(codeElements.length).toBeGreaterThanOrEqual(2);
  });

  it('should render code blocks with language', () => {
    const content = `
\`\`\`typescript
const foo = 'bar';
\`\`\`
    `;
    render(<MarkdownContent content={content} />);

    // CodeBlock component should be rendered (will test interaction separately)
    expect(screen.getByText('typescript')).toBeInTheDocument();
  });

  it('should render strikethrough text (GFM)', () => {
    const { container } = render(<MarkdownContent content="~~strikethrough~~" />);
    const del = container.querySelector('del');
    expect(del).toBeInTheDocument();
    expect(del?.textContent).toBe('strikethrough');
  });

  it('should render tables (GFM)', () => {
    const content = `
| Column 1 | Column 2 |
|----------|----------|
| Value 1  | Value 2  |
    `;
    const { container } = render(<MarkdownContent content={content} />);

    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();

    const cells = container.querySelectorAll('td');
    expect(cells.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle empty content gracefully', () => {
    const { container } = render(<MarkdownContent content="" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle multiline content', () => {
    const content = `
First paragraph

Second paragraph

Third paragraph
    `;
    const { container } = render(<MarkdownContent content={content} />);

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBeGreaterThanOrEqual(3);
  });
});
