import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyChatWelcome from './EmptyChatWelcome';

describe('EmptyChatWelcome', () => {
  it('should render welcome message', () => {
    render(<EmptyChatWelcome />);
    expect(screen.getByText('Korix Code')).toBeDefined();
  });

  it('should render subtitle', () => {
    render(<EmptyChatWelcome />);
    expect(
      screen.getByText('AI-native coding assistant powered by Axiom Agents')
    ).toBeDefined();
  });

  it('should render suggestion cards', () => {
    render(<EmptyChatWelcome />);
    expect(screen.getByText('Corrigir um bug')).toBeDefined();
    expect(screen.getByText('Adicionar funcionalidade')).toBeDefined();
    expect(screen.getByText('Revisar código')).toBeDefined();
    expect(screen.getByText('Criar testes')).toBeDefined();
  });

  it('should render footer hint', () => {
    render(<EmptyChatWelcome />);
    expect(screen.getByText('Digite sua pergunta abaixo para começar')).toBeDefined();
  });

  it('should render suggestion card with icon, title, and description', () => {
    render(<EmptyChatWelcome />);

    const bugCard = screen.getByText('Corrigir um bug').closest('div');
    expect(bugCard).toBeDefined();
    expect(screen.getByText('Analise e corrija problemas no código')).toBeDefined();
  });
});
