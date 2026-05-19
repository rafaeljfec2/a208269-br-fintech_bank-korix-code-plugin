import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
    render(<ThinkingContainer items={items} />);

    expect(screen.getByText('Analyzed request')).toBeInTheDocument();
    expect(screen.queryByText('answer task, low risk')).not.toBeInTheDocument();
  });

  it('should expand when clicked', () => {
    render(<ThinkingContainer items={items} />);

    fireEvent.click(screen.getByText('Analyzed request'));

    expect(screen.getByText(/answer task, low risk/)).toBeInTheDocument();
  });
});
