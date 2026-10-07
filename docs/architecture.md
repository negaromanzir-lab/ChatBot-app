# Architecture and migration plan

## Status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Architecture and repository preparation | Complete |
| 1 | Core chat interaction (form submit, a11y, pending/error states) | Complete |
| 2 | Separate UI from chat orchestration | Complete |
| 3 | Backend/API foundation (Express, validation, CORS, rate limits, logging) | Complete |
| 4 | Provider abstraction, timeout/error mapping, and SSE streaming | Complete |
| 5 | PostgreSQL persistence and email/session authentication | In progress |
| 6 | File uploads | Not started |
| 7 | Settings and model controls | Not started |
| 8 | Production hardening | Not started |

Uploads and durable user settings remain deliberately absent. Conversations are
backed by PostgreSQL and scoped to authenticated accounts. Phase 5 implementation
and automated checks are present, but its live PostgreSQL checkpoint remains
unverified because no local PostgreSQL server or Docker executable is available.

## Current baseline

The application as it stands after Phases 0–4:

- `src/main.jsx` mounts `App` inside React Strict Mode.
- `src/App.jsx` is a composition root only: it calls `useChatConversation` and
  wires the result into the chat components.
- `src/features/chat/hooks/useChatConversation.js` owns the message list, the
  pending flag, and the error state, and cancels in-flight work on unmount.
- `src/features/chat/services/chatService.js` is the only frontend module that
  knows the chat endpoint exists, and maps between the UI view model
  (`sender`/`message`) and the API contract (`role`/`content`).
- `src/shared/api/httpClient.js` wraps `fetch` with a timeout and a single error
  shape.
- `src/components/ChatInput.jsx` and `ChatMessages.jsx` are presentational.
- `server/` provides the Express API described below. `supersimpledev` has been
  removed from the project entirely.

There is no authentication, persistence, or file storage yet, and the default
provider is an offline deterministic stand-in rather than a real model.

## Architecture decisions

1. **Evolve this application in place.** Keep the existing Vite app at the
   repository root and introduce `server/` only when backend work begins. Avoid
   an early monorepo/workspace conversion.
2. **Organize by product feature.** Chat, conversations, authentication,
   uploads, and settings should own their UI and client services; reusable
   presentation and transport helpers belong in `shared/`.
3. **Separate presentation from orchestration.** Components render state and
   report user actions. Feature hooks/services own conversation behavior and
   call a replaceable chat service.
4. **Keep AI access server-side.** Provider credentials must never be placed in
   Vite-exposed variables or browser code. A provider-neutral server contract
   should isolate vendor adapters and report provider errors explicitly.
5. **Keep domain logic independent of storage.** Backend routes validate and
   authenticate requests, services coordinate behavior, and repositories
   encapsulate database access.
6. **Use PostgreSQL as the production database target.** Add migrations and
   repositories when persistence is implemented; this decision does not require
   introducing the database in Phase 0.
7. **Store file bytes outside the relational database.** Keep ownership and
   metadata in the database and private file contents in controlled object
   storage. The storage provider remains a later deployment decision.
8. **Preserve a working checkpoint at every phase.** Keep local chatbot mode
   available while migrating, then make any remaining local mode explicit.
   Do not silently mask backend/provider failures with fake successful replies.
9. **Defer product/deployment choices until required.** Authentication vendor,
   AI vendor/model, object-storage provider, streaming transport, hosting, and
   retention policy require a concrete deployment/product decision and are not
   selected or implemented here.

## Target repository layout

The following is a destination to grow into gradually; Phase 0 creates no
feature or backend directories prematurely.

```text
src/
  app/
    App.jsx
    providers/
    routes/
  features/
    auth/
      components/
      services/
    chat/
      components/
      hooks/
      model/
      services/
    conversations/
      components/
      services/
    uploads/
      components/
      services/
    settings/
      components/
      services/
  shared/
    api/
    ui/
    utils/
  assets/
  styles/

server/
  src/
    app.js
    server.js
    config/
    middleware/
    routes/
    modules/
      auth/
      conversations/
      messages/
      uploads/
      settings/
    ai/
      providers/
      contracts/
    db/
      migrations/
      repositories/
    services/
  tests/
```

### Backend responsibilities

- **Routes and middleware:** versioned HTTP endpoints, request validation,
  authentication, authorization, rate limits, and security controls.
- **Domain modules:** user-owned conversation/message workflows, settings, and
  upload metadata.
- **AI provider layer:** one stable generation/streaming contract with separate
  provider adapters and server-only credentials.
- **Database layer:** migrations and repositories for users, conversations,
  messages, and preferences.
- **Upload layer:** server-validated uploads stored privately outside the
  database, with authorized access and metadata in the database.

## Incremental phases and runnable checkpoints

1. **Phase 0 — Architecture and repository preparation (this phase):** record
   the target boundaries and migration decisions; establish focused frontend
   regression tests. Preserve current behavior and dependencies.
2. **Phase 1 — Core chat interaction:** add semantic form submission,
   validation, accessible labels/roles, responsive layout, and explicit pending
   and error states. Keep the local chatbot as the response source.
3. **Phase 2 — Separate UI and chat orchestration:** move conversation state
   and send behavior out of the composer; define message/status and chat-service
   contracts; adapt `supersimpledev` behind the local service.
4. **Phase 3 — Backend/API foundation:** add Express, validated configuration,
   health endpoint, versioned API boundary, and a Vite development proxy.
   Preserve local mode as an explicit option while the API integration is built.
5. **Phase 4 — Provider abstraction and streaming:** add the server-side
   provider contract and selected adapter, then streaming, cancellation,
   timeouts, and explicit failure handling. Do not add provider secrets to the
   frontend.
6. **Phase 5 — Persistence and authentication:** add PostgreSQL migrations and
   repositories, authentication, per-resource ownership checks, conversation
   history, and reload-resilient messages.
7. **Phase 6 — File uploads:** add server-side type/size validation, private
   object storage, ownership-aware download access, and composer upload UX.
8. **Phase 7 — Settings and model controls:** persist user preferences and
   expose only server-validated supported model choices.
9. **Phase 8 — Production hardening:** add integration coverage, rate limits
   and quotas, security headers, operational logging/error reporting,
   deployment checks, and backup/restore procedures.

For every phase, run the relevant tests plus `npm run build` and `npm run lint`.
Backend phases should add corresponding server tests and health/integration
checks. A phase is complete only when its checkpoint is runnable and failures
are surfaced rather than silently replaced by success-shaped defaults.

## Phase 0 validation

### What Phase 0 delivered

Phase 0 changed no application behavior. `src/App.jsx`, the three components,
their CSS, and the `supersimpledev` call path are untouched, and the seeded
transcript still renders exactly as before. The additions are a test harness, an
environment-variable contract, and this document.

- **Test harness.** Vitest runs in a `jsdom` environment with
  `src/test/setup.js` as the setup file. `src/App.test.jsx` covers the seeded
  transcript and the send flow, asserting the user's text, the local chatbot
  reply, and that the composer is cleared. `supersimpledev` is mocked, so the
  suite needs no network access and no credentials.

- **Explicit unmount between tests.** `src/test/setup.js` calls Testing
  Library's `cleanup` in `afterEach`. This is required rather than optional:
  Testing Library only auto-registers cleanup when a *global* `afterEach`
  exists (Vitest `globals: true`), and this project imports `describe`/`it`
  explicitly. Without the explicit hook every `render()` leaks into the next
  test, and queries such as `getByPlaceholderText` fail with "found multiple
  elements." Treat `globals: false` plus a manual `cleanup` as the intended
  setup — flipping `globals` on would silently change the contract.

- **Real assertions.** `@testing-library/jest-dom` provides presence and value
  matchers (`toBeInTheDocument`, `toHaveValue`). Do not fall back to
  `toBeTruthy()`, which passes for any truthy value and cannot detect an
  element rendering the wrong content.

- **Environment contract.** `.env.example` is a committed template with empty
  values only, documenting the `VITE_*` public/server-only split. `.env` and
  `.env.*` are git-ignored (with `.env.example` re-included). No real AI
  provider key exists anywhere in the repository, and none may be added to a
  `VITE_*` variable, since those are inlined into the shipped browser bundle.

### Running the checks

From the repository root:

```bash
npm install
npm test
npm run build
npm run lint
```

All four must pass for a phase to be considered complete. `npm test` and
`npm run build` both execute the component tree, so a regression in the chat
flow fails either one.

## Phases 1–4: what was built

### Phase 1 — Core chat interaction

`ChatInput` is now a `<form>` with a visually-hidden `<label>`, `htmlFor`, and
`type="submit"`, so Enter sends and the input has an accessible name. The send
button is disabled while the draft is empty or a reply is in flight, which
prevents duplicate submissions structurally rather than by convention. Errors
render in a `role="alert"` banner that clears when the user starts typing.

### Phase 2 — UI separated from orchestration

Conversation state, the pending flag, the error, and cancellation moved into
`useChatConversation`. Components render state and report intent. The AI call is
a parameter of the hook (`service`), so tests drive the flow without a network or
module mocking. The UI view model (`sender: 'robot'`) is translated to the API
contract (`role: 'assistant'`) inside `chatService.js` only.

### Phase 3 — Backend foundation

`server/` implements the layered structure in the layout above:
`server.js` (lifecycle) → `app.js` (middleware composition, no `listen`) →
`routes/` → `controllers/` → `services/ai/` → `providers/`.

- `config/env.js` parses `process.env` once through a zod schema and exits with
  actionable messages on invalid input. Nothing else reads `process.env`.
- `middleware/errorHandler.js` produces one response envelope. `ApiError`
  instances return their message and code; anything else returns a generic
  message, so stack traces and internal paths never reach the client.
- `middleware/validate.js` replaces `req.body` with the *parsed* value, so
  downstream code only ever sees schema-valid data and unknown keys are stripped.
- `middleware/rateLimit.js` limits per IP and advertises draft-7 `RateLimit`
  headers. It remains the baseline for authentication and chat; per-account
  quotas and usage budgets are deferred to production hardening.
- `config/logger.js` uses pino with `redact` covering `authorization`, `cookie`,
  `apiKey`, and request bodies, so conversation content and credentials stay out
  of log sinks by construction.
- `server.js` sets `requestTimeout`, `headersTimeout`, and `keepAliveTimeout`,
  and handles `SIGTERM`/`SIGINT` with a forced-exit backstop.
- `vite.config.js` proxies `/api` to Express so development stays
  same-origin. The target is read with `loadEnv(mode, cwd, '')` under the name
  `API_PROXY_TARGET` — deliberately *not* `VITE_`-prefixed, because it is read by
  Node during config resolution, not by the browser.

### Phase 4 — Provider abstraction and streaming

`services/ai/providers/index.js` resolves one adapter from `AI_PROVIDER`. The
controller never imports a provider module.

- `AIProvider.js` documents the shared `generateResponse()` and
  `streamResponse()` contract. `chat.service.js` owns orchestration and calls
  the provider; HTTP controllers do not import provider modules.
- `openai.provider.js` is the direct OpenAI adapter. It reads `OPENAI_API_KEY`
  and `OPENAI_MODEL` from server configuration, applies a server-owned system
  instruction, supports one-shot and SSE-streamed provider responses, and maps
  upstream failures to stable API errors.
- `openaiCompatible.provider.js` reuses the OpenAI wire protocol for compatible
  endpoints, configured separately with `AI_PROVIDER_API_KEY`,
  `AI_PROVIDER_BASE_URL`, and `AI_PROVIDER_MODEL`.
- `local.provider.js` implements the same provider methods as an offline,
  deterministic stand-in. It is selected explicitly, never as a silent
  fallback, and states plainly that no model is configured.
- A misconfigured real provider surfaces as an error instead of being masked by
  a fabricated success.

The key is resolved in server configuration and is used only in the provider's
`Authorization` header. It is not included in API responses or error logs.
`OPENAI_API_KEY` must not use the `VITE_` prefix.

`POST /api/chat` accepts an optional `stream: true` flag. The legacy JSON response
is retained when the flag is omitted; the React chat service opts into SSE. The
provider contract yields text deltas independently of vendor framing, and the
controller translates those into `delta`, `done`, and `error` SSE events. This
keeps the client and HTTP layer independent of OpenAI-specific stream events, so
future Gemini or Claude adapters can implement the same async-iterable contract.
The request abort signal flows from browser fetch through Express into the
provider, and the frontend uses one stable message ID to update the partial reply
and replace it with the final message rather than adding a duplicate.

### Verification performed

- `npm test` — frontend behavior and progressive rendering, SSE service and
  route tests, plus provider request/response, streaming, and error tests.
- `npm run lint` — clean.
- `npm run build` — succeeds; Vite reports the existing large-chunk advisory.
- Browser round trip through the Vite proxy with both processes running: real
  `POST /api/chat` requests, correct rendering, cleared composer, Enter-to-send,
  0 console errors.
- Real provider path against a mock upstream: conversation forwarded intact,
  bearer token attached server-side.

### Phase 5 — PostgreSQL persistence and authentication (implementation in progress)

- PostgreSQL migrations create users, sessions, conversations, and messages with
  ownership foreign keys, cascade deletion, constraints, and query indexes.
- Email/password authentication uses bcrypt hashes and HTTP-only,
  PostgreSQL-backed sessions. State-changing browser requests enforce allowed
  origins; authentication and conversation APIs are rate-limited/authenticated.
- Conversation routes scope every operation to the session user. The chat
  generation endpoint also requires a session to prevent anonymous use of the
  configured AI provider.
- The React sidebar loads, opens, renames, and deletes saved conversations.
  User messages are stored before generation; the completed assistant response
  is persisted once after streaming. Existing local history is imported after
  sign-in and retained until import completion.
- Automated auth, repository, service, routes, and UI tests cover the API and
  ownership boundaries. The latest run passed 81 tests, lint, and production
  build. A real PostgreSQL migration/session/browser round trip is still required
  before Phase 5 can be marked complete.

### Known limitations

- PostgreSQL, a configured `DATABASE_URL`, and a random `SESSION_SECRET` are
  required to start the API. Use the development Compose database locally.
- Rate limiting is still per IP; authenticated per-account quotas remain for
  production hardening.
- The default provider is offline and says so. Direct OpenAI replies require
  `AI_PROVIDER=openai` and `OPENAI_API_KEY` on the server.
- Session cookies are HTTP-only and SameSite=Lax; state-changing browser
  requests also enforce the configured Origin allowlist.
- If browser-history import is interrupted after some server-side writes, retrying
  can duplicate the conversations already imported. Add server-side import
  idempotency before relying on this flow for valuable or large histories.
