# Chatbot Project

A React chat interface backed by a Node/Express API. The browser never talks to an AI
provider directly — all model communication happens on the server, so provider credentials
never reach the frontend.

## Requirements

- Node.js 20.19+ or 22.12+ (the project is developed and tested on Node 25)

## Getting started

```bash
npm install
cp .env.example .env   # optional: the app runs with zero configuration
npm run dev
```

`npm run dev` starts both processes together:

| Process | URL | Notes |
| --- | --- | --- |
| Vite dev server | http://localhost:5173 | Proxies `/api/*` to the Express server |
| Express API | http://localhost:3000 | Health check at http://localhost:3000/api/health |

Run them individually with `npm run dev:client` and `npm run dev:server`.

### Enabling a real AI provider

Out of the box `AI_PROVIDER=local`, a deterministic offline provider that makes no network
calls and is explicit that it is not a language model. To use a real model, set these in
`.env` and restart the server:

```bash
AI_PROVIDER=openai
AI_PROVIDER_API_KEY=your-key-here
AI_PROVIDER_BASE_URL=https://api.openai.com/v1
AI_PROVIDER_MODEL=gpt-4o-mini
```

`AI_PROVIDER_BASE_URL` works with any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter,
a local Ollama/LM Studio server), so switching vendors is a config change, not a code
change.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the API and the Vite dev server together |
| `npm run dev:client` | Start only the Vite dev server |
| `npm run dev:server` | Start only the Express API (with `--watch`) |
| `npm run build` | Build the production frontend bundle into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint over the frontend and the server |
| `npm test` | Run the frontend and server test suites |
| `npm run test:watch` | Run tests in watch mode |

## API

### `POST /api/chat`

Request:

```json
{
  "messages": [{ "role": "user", "content": "Hello" }]
}
```

`role` must be `user` or `assistant`; `content` must be a non-empty string. Unknown fields
are stripped rather than forwarded to the provider.

Response:

```json
{
  "message": { "role": "assistant", "content": "Hello! How can I help?" }
}
```

### `GET /api/health`

Returns `{ status, uptimeSeconds, provider, timestamp }`. Deliberately exposes no
credentials.

### Errors

Every failure uses one envelope, so the client can branch on `code` rather than parsing prose:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body is invalid.",
    "details": [{ "field": "messages.0.role", "message": "role must be either \"user\" or \"assistant\"" }],
    "requestId": "9f2c1e0a-..."
  }
}
```

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body failed schema validation |
| 400 | `INVALID_JSON` | Body was not parseable JSON |
| 404 | `NOT_FOUND` | Unknown route |
| 413 | `PAYLOAD_TOO_LARGE` | Body exceeded `BODY_LIMIT` |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit hit |
| 502 | `AI_PROVIDER_*` | Provider rejected the request or returned garbage |
| 503 | `AI_PROVIDER_UNAVAILABLE` / `AI_PROVIDER_NOT_CONFIGURED` | Provider down or unconfigured |
| 504 | `AI_PROVIDER_TIMEOUT` | Provider exceeded `AI_REQUEST_TIMEOUT_MS` |
| 500 | `INTERNAL_ERROR` | Unexpected fault; details are logged, never returned |

Internal error details and stack traces are never sent to the client. Every response
carries a `requestId` (also returned as the `x-request-id` header) that matches the server
log line, so a user-reported failure can be traced directly.

## Project structure

```
├── index.html
├── vite.config.js        # Vite config, dev proxy, and Vitest config
├── eslint.config.js      # Flat config: browser rules for src/, Node rules for server/
├── .env.example          # Environment template (empty values only)
├── src/
│   ├── main.jsx
│   ├── App.jsx           # Composition root; no business logic
│   ├── App.test.jsx
│   ├── shared/api/
│   │   └── httpClient.js # fetch wrapper: timeout, JSON handling, one error shape
│   ├── features/chat/
│   │   ├── hooks/
│   │   │   └── useChatConversation.js   # Owns messages, pending and error state
│   │   └── services/
│   │       ├── chatService.js          # Only module that knows the endpoint exists
│   │       └── chatService.test.js
│   └── components/       # Presentational: ChatInput, ChatMessages, ChatMessage
└── server/
    ├── src/
    │   ├── server.js     # Process entry: listen, timeouts, graceful shutdown
    │   ├── app.js        # Express app factory (no listen) so routes are testable
    │   ├── config/       # env.js (validated config), logger.js (pino + redaction)
    │   ├── routes/       # index.js (mounts /api, /health), chat.routes.js
    │   ├── controllers/  # chat.controller.js — HTTP in, HTTP out
    │   ├── services/ai/  # chat.service.js + providers/
    │   ├── middleware/   # validate.js, rateLimit.js, errorHandler.js
    │   └── utils/        # ApiError.js, asyncHandler.js
    └── tests/            # Route and provider tests
```

## How it works

The frontend keeps its own view-model shape (`{ id, sender, message }`, where `sender` is
`user` or `robot`) and converts to the API contract (`{ role, content }`) at the service
boundary in `src/features/chat/services/chatService.js`. That keeps the backend contract
from leaking into components.

`useChatConversation` owns the conversation, the pending flag, and the error state.
`ChatInput` and `ChatMessages` are presentational: they render state and report intent.

On the server, a request flows:

```
request → pino-http → helmet → cors → express.json → rate limit
        → validate (zod) → controller → chat.service → provider adapter → upstream
        → errorHandler (single response envelope)
```

Provider selection happens once, in `services/ai/providers/index.js`. The controller never
imports a provider module, so swapping vendors does not touch the HTTP layer.

## Environment variables

See [`.env.example`](./.env.example) for the full annotated list.

Vite inlines `VITE_`-prefixed variables into the browser bundle at build time, so they must
never hold a secret. The AI key is an unprefixed variable read only by the server process.
The logger additionally redacts `authorization`, `cookie`, `apiKey`, and request bodies so a
future log statement cannot leak a credential or conversation content.

## Current status

Working: full round trip through the API, request validation, rate limiting, structured
logging, CORS, graceful shutdown, and a provider abstraction with real timeout and error
mapping.

Not implemented yet: streaming responses, message persistence across reloads, authentication
(so rate limiting is currently per-IP), file uploads, and settings. The offline `local`
provider is a development stand-in, not a model.

The phased migration plan and its rationale are in
[docs/architecture.md](./docs/architecture.md).

## License

Private project — all rights reserved.