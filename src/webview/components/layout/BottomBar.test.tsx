import { fireEvent, render, screen } from '@testing-library/react';
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
    availableModels: [],
    provider: 'litellm',
    isProviderReady: true,
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

  it('should show the current mode label in the mode selector', () => {
    render(<BottomBar />);

    expect(screen.getByRole('button', { name: /Agent/i })).toBeInTheDocument();
  });

  it('should show current labels for model, workspace, and approval selectors', () => {
    render(<BottomBar />);

    expect(screen.getByRole('button', { name: /Claude Sonnet 4\.6/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All files/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmar Escritas/i })).toBeInTheDocument();
  });

  it('should persist selected LiteLLM model to the extension settings', () => {
    render(<BottomBar />);

    fireEvent.click(screen.getByRole('button', { name: /Claude Sonnet 4\.6/i }));
    fireEvent.click(screen.getByText('GPT-5.5'));

    expect(baseState.setModel).toHaveBeenCalledWith('openai/gpt-5.5');
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'save_settings',
      payload: {
        provider: 'litellm',
        model: 'openai/gpt-5.5',
      },
    });
  });

  it('should render LiteLLM models loaded from the extension', () => {
    vi.mocked(useStore).mockImplementation((selector) =>
      selector({
        ...baseState,
        model: 'openai/gpt-5.3-codex',
        availableModels: ['openai/gpt-5.3-codex'],
      }),
    );

    render(<BottomBar />);

    expect(screen.getByRole('button', { name: /gpt-5\.3-codex/i })).toBeInTheDocument();
  });

  it('should group Vertex AI Gemini models as Gemini options', () => {
    vi.mocked(useStore).mockImplementation((selector) =>
      selector({
        ...baseState,
        model: 'vertex_ai/gemini-2.5-pro',
        availableModels: ['vertex_ai/gemini-2.5-pro'],
      }),
    );

    render(<BottomBar />);

    fireEvent.click(screen.getByRole('button', { name: /gemini-2\.5-pro/i }));

    expect(screen.getByText('GEMINI')).toBeInTheDocument();
  });

  it('should include the selected mode when sending a chat message', () => {
    render(<BottomBar />);

    fireEvent.change(screen.getByPlaceholderText('Pergunte ao Korix...'), {
      target: { value: 'olhe tres arquivos do projeto' },
    });
    fireEvent.click(screen.getByTitle('Send (Enter)'));

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'send_message',
      payload: {
        content: 'olhe tres arquivos do projeto',
        mode: 'agent',
        provider: 'litellm',
        model: 'claude-sonnet-4-6',
        messages: [],
      },
    });
  });

  it('should wait for provider settings before sending a chat message', () => {
    vi.mocked(useStore).mockImplementation((selector) =>
      selector({
        ...baseState,
        isProviderReady: false,
      }),
    );

    render(<BottomBar />);

    const input = screen.getByPlaceholderText('Carregando configuração...');
    fireEvent.change(input, {
      target: { value: 'olhe tres arquivos do projeto' },
    });
    fireEvent.click(screen.getByTitle('Send (Enter)'));

    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'send_message' }),
    );
  });
});
