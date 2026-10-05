import { fireEvent, render, screen } from '@testing-library/react';
import { Chatbot } from 'supersimpledev';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('supersimpledev', () => ({
  Chatbot: {
    getResponse: vi.fn(),
  },
}));

describe('App', () => {
  beforeEach(() => {
    vi.mocked(Chatbot.getResponse).mockReturnValue('A local test reply');
  });

  it('renders the seeded conversation', () => {
    render(<App />);

    expect(screen.getByText('hello chatbot')).toBeInTheDocument();
    expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
    expect(screen.getByText('Today is September 27')).toBeInTheDocument();
  });

  it('appends a user message and the local chatbot response', () => {
    render(<App />);

    const input = screen.getByPlaceholderText('Send a message to Chatbot');
    fireEvent.change(input, { target: { value: 'How are you?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(Chatbot.getResponse).toHaveBeenCalledWith('How are you?');
    expect(screen.getByText('How are you?')).toBeInTheDocument();
    expect(screen.getByText('A local test reply')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });
});
