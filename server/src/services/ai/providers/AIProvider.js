/**
 * Provider contract shared by server-side AI adapters.
 *
 * @typedef {{ type: 'text', text: string } | { type: 'image', mediaType: string, data: string }} AIContentPart
 * @typedef {{ role: 'user' | 'assistant', content: string | AIContentPart[] }} AIMessage
 * Every vendor adapter receives the vendor model name and credentials from the
 * server-side model registry. The browser-facing model ID is resolved before
 * an adapter is called and is never a provider credential or vendor model name.
 *
 * @typedef {Object} AIProvider
 * @property {string} name
 * @property {(messages: AIMessage[], options?: { systemInstruction?: string, signal?: AbortSignal }) => Promise<{ role: 'assistant', content: string }>} generateResponse
 * @property {(messages: AIMessage[], options?: { systemInstruction?: string, signal?: AbortSignal }) => AsyncIterable<string>} streamResponse
 */

export {};
