/**
 * Provider contract shared by server-side AI adapters.
 *
 * @typedef {{ role: 'user' | 'assistant', content: string }} AIMessage
 * @typedef {Object} AIProvider
 * @property {string} name
 * @property {(messages: AIMessage[], options?: { systemInstruction?: string, signal?: AbortSignal }) => Promise<{ role: 'assistant', content: string }>} generateResponse
 * @property {(messages: AIMessage[], options?: { systemInstruction?: string, signal?: AbortSignal }) => AsyncIterable<string>} streamResponse
 */

export {};
