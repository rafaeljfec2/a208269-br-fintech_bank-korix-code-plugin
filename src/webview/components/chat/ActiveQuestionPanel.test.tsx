import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActiveQuestionPanel from './ActiveQuestionPanel';
import { useStore } from '../../store';
import { useVSCode } from '../../hooks/useVSCode';

vi.mock('../../store', () => ({
  useStore: vi.fn(),
}));

vi.mock('../../hooks/useVSCode', () => ({
  useVSCode: vi.fn(),
}));

describe('ActiveQuestionPanel', () => {
  const sendMessage = vi.fn();
  const clearActiveQuestion = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useVSCode).mockReturnValue({ sendMessage });
    vi.mocked(useStore).mockImplementation((selector) =>
      selector({
        activeQuestion: {
          questionId: 'question-1',
          title: 'Permission',
          question: 'Allow Korix to execute FileChunks?',
          mode: 'single',
          options: [
            {
              value: 'once',
              label: 'Approve once',
              description: 'Allow this execution only.',
            },
            {
              value: 'reject',
              label: 'Reject',
              description: 'Block this execution and continue safely.',
            },
          ],
          timeoutMs: 60000,
          defaultAnswer: 'reject',
        },
        clearActiveQuestion,
      }),
    );
  });

  it('should render the permission form as one in-chat panel', () => {
    render(<ActiveQuestionPanel />);

    expect(screen.getByText('Permission')).toBeInTheDocument();
    expect(screen.getByText('Allow Korix to execute FileChunks?')).toBeInTheDocument();
    expect(screen.getByText('Approve once')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
  });

  it('should submit the selected answer and clear the panel', () => {
    render(<ActiveQuestionPanel />);

    fireEvent.click(screen.getByLabelText(/Approve once/));
    fireEvent.click(screen.getByRole('button', { name: /Submit answers/ }));

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'answer_question',
      payload: {
        questionId: 'question-1',
        answers: ['once'],
      },
    });
    expect(clearActiveQuestion).toHaveBeenCalled();
  });
});
