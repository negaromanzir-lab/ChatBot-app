import { useCallback, useEffect, useState } from 'react';

function speechText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(<[^>]+>\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_>#~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useSpeechSynthesis() {
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const available = typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance === 'function';

  const stop = useCallback(() => {
    if (available) window.speechSynthesis.cancel();
    setActiveMessageId(null);
    setIsPaused(false);
  }, [available]);

  const toggle = useCallback((messageId, content) => {
    if (!available) return;
    const synthesis = window.speechSynthesis;
    if (activeMessageId === messageId && synthesis.speaking) {
      if (synthesis.paused) {
        synthesis.resume();
        setIsPaused(false);
      } else {
        synthesis.pause();
        setIsPaused(true);
      }
      return;
    }

    synthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(speechText(content));
    utterance.onend = () => {
      setActiveMessageId(null);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setActiveMessageId(null);
      setIsPaused(false);
    };
    setActiveMessageId(messageId);
    setIsPaused(false);
    synthesis.speak(utterance);
  }, [activeMessageId, available]);

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  return { available, activeMessageId, isPaused, toggle, stop };
}

export default useSpeechSynthesis;
