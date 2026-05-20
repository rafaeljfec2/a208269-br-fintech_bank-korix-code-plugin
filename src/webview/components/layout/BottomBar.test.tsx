import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BottomBar from './BottomBar';
import { useStore } from '../../store';
import { useVSCode } from '../../hooks/useVSCode';

vi.mock('../../store', () => ({
  useStore: vi.fn(),
}));

vi.mock('../../hooks/useVSCode', () => ({
  useVSCode: vi.fn(),
}));

describe('BottomBar', () => {
  const sendMessage = vi.fn();

  const baseState = {
    mode: 'agent',
    model: 'claude-sonnet-4-6',
    isExecuting: false,
    activeQuestion: null,
    setMode: vi.fn(),
    setModel: vi.fn(),
    addMessage: vi.fn(),
    activeChatId: 'chat-1',
    createChat: vi.fn(() => 'chat-1'),
    conversations: {
      'chat-1': {
        messages: [],
      },
    },
    clearActiveQuestion: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useVSCode).mockReturnValue({ sendMessage });
    vi.mocked(useStore).mockImplementation((selector) => selector(baseState));
  });

  it('should render the active question panel in the footer', () => {
    vi.mocked(useStore).mockImplementation((selector) =>
      selector({
        ...baseState,
        activeQuestion: {
          questionId: 'question-1',
          title: 'Gênero Music',
          question: 'Qual gênero musical você mais curte ouvir enquanto programa?',
          mode: 'single',
          options: [
            {
              value: 'lofi',
              label: 'Lo-fi / Chillhop',
              description: 'Batidas relaxantes e instrumentais.',
            },
            {
              value: 'rock',
              label: 'Rock / Metal',
              description: 'Energia alta para debugging intenso.',
            },
          ],
        },
      }),
    );

    render(<BottomBar />);

    expect(screen.getByText('Gênero Music')).toBeInTheDocument();
    expect(
      screen.getByText('Qual gênero musical você mais curte ouvir enquanto programa?'),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Pergunte ao Korix...')).toBeInTheDocument();
  });

  it('should not render a question panel when no question is active', () => {
    render(<BottomBar />);

    expect(screen.queryByRole('button', { name: /Submit answers/ })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Pergunte ao Korix...')).toBeInTheDocument();
  });
});
