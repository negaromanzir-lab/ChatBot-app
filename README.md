# Chatbot Project

A React chat interface backed by a Node/Express API. The browser never talks to an AI
provider directly — all model communication happens on the server, so provider credentials
never reach the frontend.

## Requirements

- Node.js 20.19+ or 22.12+ (the project is developed and tested on Node 25)

## Getting started

```bash
npm install
cp .env.example .env
docker compose up -d db
npm run db:migrate
npm run dev
```

Add Clerk's publishable and secret keys from your Clerk Dashboard to `.env`.
PostgreSQL is required for account and conversation storage.
Configure email sign-up with email verification in Clerk; the backend only creates
or links accounts from Clerk-verified primary email addresses.

Enable model choices by adding one or more server-only keys to `.env`:
`OPENAI_API_KEY`, `GEMINI_API_KEY`, and/or `ANTHROPIC_API_KEY`. The Settings
dialog lists only configured models. The browser receives safe model IDs and
labels; the backend resolves each ID to its provider, vendor model, and key.

`npm run dev` starts both processes together:

| Process | URL | Notes |
| --- | --- | --- |
| Vite dev server | http://localhost:5173 | Proxies `/api/*` to the Express server |
| Express API | http://localhost:3000 | Health check at http://localhost:3000/api/health |

Run them individually with `npm run dev:client` and `npm run dev:server`.

### Accounts and saved conversations

Sign-up, sign-in, profile, and sign-out are provided by Clerk. The browser sends its
Clerk session token as a bearer token; the Express API verifies it using Clerk's
server SDK. The backend derives account identity only from the verified token and
synchronizes a local user row using Clerk's verified primary email. A matching
legacy email account is linked to the Clerk ID, preserving its conversations.
Conversation APIs and `POST /api/chat` require authentication and scope all access
to that local user. User IDs supplied in request bodies are ignored. Existing local
browser history is imported once after sign-in and cleared only after a successful import.

The migrations create `users`, `conversations`, and `messages`, with cascade foreign
keys, constraints, and indexes for conversation history and ordered message lookup.
The Clerk migration adds a unique Clerk user ID and removes the obsolete session table.
AI provider keys remain server environment variables and are never stored in the database.

Set `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY`
from your Clerk Dashboard in `.env`. The `VITE_` key is public; never expose the
server-only `CLERK_SECRET_KEY` to the frontend.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/models` | List enabled safe model IDs for the signed-in user |
| `POST` | `/api/files` | Upload one file with a `conversationId` multipart field |
| `POST` | `/api/conversations` | Create a conversation |
| `GET` | `/api/conversations` | List the signed-in user's conversations |
| `GET` | `/api/conversations/:id` | Open a conversation and its messages |
| `PATCH` | `/api/conversations/:id` | Rename a conversation |
| `DELETE` | `/api/conversations/:id` | Delete a conversation and its messages |
| `POST` | `/api/conversations/:id/messages` | Append a user or assistant message |
| `GET` | `/api/conversations/:id/uploads` | List conversation file metadata |
| `POST` | `/api/conversations/:id/uploads` | Upload one multipart `file` |
| `GET` | `/api/conversations/:id/uploads/:uploadId` | Download an authorized file |
| `DELETE` | `/api/conversations/:id/uploads/:uploadId` | Delete an authorized file |

The first user message generates a useful title; the sidebar also supports renaming.

### Conversation files

Authenticated users can upload PDF, DOCX, UTF-8 text, Markdown, CSV, PNG, JPEG,
and WebP files to a conversation. The server enforces the configured per-file
limit (10 MiB by default), validates the extension and MIME type plus file
signatures or text encoding, generates an opaque storage key, and saves bytes
under private `UPLOAD_STORAGE_DIR` (default `.private-uploads/`, excluded from
Git and not served as static assets). PostgreSQL stores metadata and extracted
text, associated with the conversation owned by the authenticated account.

PDF text is extracted with PDF.js; DOCX text is extracted with Mammoth; UTF-8
text, Markdown, and CSV are decoded directly. Image bytes stay private and are
sent only server-to-provider when the selected model advertises vision support.
The provider adapters translate the same normalized text/image input to their
own APIs. The upload path never executes uploaded files. Files are still
available to download; removing a conversation also removes its private files.
Extraction is stored separately from metadata and provider request formatting,
leaving room for later chunking, embeddings, and RAG retrieval.

### Enabling a real AI provider

Out of the box `AI_PROVIDER=local`, a deterministic offline provider that makes no network
calls and is explicit that it is not a language model. To use a real model, set these in
`.env` and restart the server:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-4o-mini
```

To add Gemini or Claude, set `GEMINI_API_KEY` / `GEMINI_MODEL` or
`ANTHROPIC_API_KEY` / `CLAUDE_MODEL`. API keys and vendor model names are read
by Node only and must never use a `VITE_` prefix. `AI_DEFAULT_MODEL` can name a
safe registry ID such as `openai-default`; it must be enabled with a server key.
For an OpenAI-compatible endpoint, configure `AI_PROVIDER=openai-compatible`,
`AI_PROVIDER_API_KEY`, `AI_PROVIDER_BASE_URL`, and `AI_PROVIDER_MODEL`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the API and the Vite dev server together |
| `npm run dev:client` | Start only the Vite dev server |
| `npm run dev:server` | Start only the Express API (with `--watch`) |
| `npm run db:migrate` | Apply pending PostgreSQL schema migrations |
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
  "conversationId": "conversation-uuid",
  "fileIds": ["file-uuid"],
  "messages": [{ "role": "user", "content": "Hello" }],
  "model": "openai-default",
  "stream": true
}
```

`model` is optional and, when supplied, must be an ID returned by authenticated
`GET /api/models`. The server rejects unknown or disabled IDs rather than
falling back to another provider. If omitted, the configured available default
is used.

`conversationId` and `fileIds` are optional for text-only turns. To ask about
attachments, send the active conversation ID and the IDs returned by `POST
/api/files`. The server looks up every file through that authenticated user's
conversation. Text is added as untrusted document context; image attachments
require a vision-capable selected model.

`role` must be `user` or `assistant`; `content` must be a non-empty string. Unknown fields
are stripped rather than forwarded to the provider. `stream` is optional and defaults to
`false` for compatibility with JSON clients. The React app requests `stream: true` and
receives Server-Sent Events:

```text
data: {"type":"delta","content":"Hello"}

data: {"type":"done","message":{"role":"assistant","content":"Hello there"}}
```

Provider failures after streaming begins use a final `error` event with a safe error code
and message. If the connection ends before `done`, the frontend marks the reply interrupted
and offers retry. The Stop Generating control aborts the browser request, which cancels the
server's provider stream.

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

Not implemented yet: file uploads and durable user settings. The offline `local` provider
is a development stand-in, not a model.

The phased migration plan and its rationale are in
[docs/architecture.md](./docs/architecture.md).

## License

Private project — all rights reserved.