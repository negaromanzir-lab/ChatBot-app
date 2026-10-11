import config from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';

const PROVIDER_IMAGE_MIME_TYPES = Object.freeze({
  local: [],
  openai: ['image/jpeg', 'image/png', 'image/webp'],
  gemini: ['image/jpeg', 'image/png', 'image/webp'],
  claude: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  'openai-compatible': [],
});

const definitions = [
  {
    id: 'local-offline',
    label: 'Local offline',
    provider: 'local',
    model: null,
    supportsVision: false,
    imageMimeTypes: PROVIDER_IMAGE_MIME_TYPES.local,
    available: () => true,
  },
  {
    id: 'openai-default',
    label: 'GPT (OpenAI)',
    provider: 'openai',
    model: config.ai.providers.openai.model,
    apiKey: config.ai.providers.openai.apiKey,
    supportsVision: config.ai.providers.openai.supportsVision,
    imageMimeTypes: config.ai.providers.openai.supportsVision
      ? PROVIDER_IMAGE_MIME_TYPES.openai
      : [],
    available: () => Boolean(config.ai.providers.openai.apiKey),
  },
  {
    id: 'gemini-default',
    label: 'Gemini',
    provider: 'gemini',
    model: config.ai.providers.gemini.model,
    apiKey: config.ai.providers.gemini.apiKey,
    supportsVision: config.ai.providers.gemini.supportsVision,
    imageMimeTypes: config.ai.providers.gemini.supportsVision
      ? PROVIDER_IMAGE_MIME_TYPES.gemini
      : [],
    available: () => Boolean(config.ai.providers.gemini.apiKey),
  },
  {
    id: 'claude-default',
    label: 'Claude',
    provider: 'claude',
    model: config.ai.providers.claude.model,
    apiKey: config.ai.providers.claude.apiKey,
    supportsVision: config.ai.providers.claude.supportsVision,
    imageMimeTypes: config.ai.providers.claude.supportsVision
      ? PROVIDER_IMAGE_MIME_TYPES.claude
      : [],
    available: () => Boolean(config.ai.providers.claude.apiKey),
  },
  {
    id: 'openai-compatible-default',
    label: 'OpenAI-compatible',
    provider: 'openai-compatible',
    model: config.ai.providers.openaiCompatible.model,
    apiKey: config.ai.providers.openaiCompatible.apiKey,
    baseUrl: config.ai.providers.openaiCompatible.baseUrl,
    supportsVision: config.ai.providers.openaiCompatible.supportsVision,
    imageMimeTypes: config.ai.providers.openaiCompatible.supportsVision
      ? PROVIDER_IMAGE_MIME_TYPES['openai-compatible']
      : [],
    available: () => Boolean(config.ai.providers.openaiCompatible.apiKey),
  },
];

const legacyDefaultIds = {
  local: 'local-offline',
  openai: 'openai-default',
  'openai-direct': 'openai-default',
  'openai-compatible': 'openai-compatible-default',
};

export function listAvailableModels() {
  const available = definitions.filter((model) => model.available());
  const preferredId = config.ai.defaultModel ?? legacyDefaultIds[config.ai.provider];
  const defaultModelId = available.some(({ id }) => id === preferredId)
    ? preferredId
    : null;

  return {
    defaultModelId,
    models: available.map(({ id, label, provider, supportsVision, imageMimeTypes }) => ({
      id,
      label,
      provider,
      supportsVision,
      imageMimeTypes,
    })),
  };
}

export function resolveModel(modelId) {
  const model = definitions.find((candidate) => candidate.id === modelId);
  if (!model || !model.available()) {
    throw ApiError.badRequest(
      'AI_MODEL_UNAVAILABLE',
      'The selected AI model is not available.',
    );
  }
  return { ...model };
}

export function resolveDefaultModel() {
  const { defaultModelId } = listAvailableModels();
  if (!defaultModelId) {
    throw ApiError.serviceUnavailable(
      'AI_MODEL_UNAVAILABLE',
      'No AI model is configured on the server.',
    );
  }
  return resolveModel(defaultModelId);
}
