import ChatInput from './components/ChatInput.jsx';
import ChatMessages from './components/ChatMessages.jsx';
import { useChatConversation } from './features/chat/hooks/useChatConversation.js';
import './App.css';

/**
 * Composition root only: wires the conversation hook to the chat components.
 *
 * State, error handling, and the API call all live in `useChatConversation`, so
 * this component has no knowledge of the backend.
 */
function App() {
  const { messages, isPending, error, sendMessage, clearError } = useChatConversation();

  return (
    <div className="app-container">
      <ChatMessages chatMessages={messages} />
      <ChatInput
        onSend={sendMessage}
        isPending={isPending}
        error={error}
        onDismissError={clearError}
      />
    </div>
  );
}

export default App;