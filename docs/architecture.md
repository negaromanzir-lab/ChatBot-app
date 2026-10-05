# Architecture and migration plan

## Purpose and current baseline

This document describes the intended incremental evolution of the existing React 19
and Vite application. It is an architecture target, not a claim that the planned
backend or product features already exist.

The current application remains the runnable baseline:

- `src/main.jsx` mounts `App` inside React Strict Mode.
- `src/App.jsx` owns an in-memory array of seeded user and robot messages.
- `src/components/ChatInput.jsx` owns composer state and calls
  `supersimpledev` directly to generate a reply.
- `src/components/ChatMessages.jsx` renders the message list and scrolls it to
  the newest message.
- `src/components/ChatMessage.jsx` renders a sender-specific bubble and avatar.
- Styling lives alongside the app and components in CSS files.

There is no API server, authentication, persistence, file storage, or real AI
provider integration yet. The `supersimpledev` dependency and current chat flow
are intentionally retained during preparation and migration.

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

All four must pass for Phase 0 to be considered complete. `npm test` and
`npm run build` both execute the component tree, so a regression in the chat
flow fails either one.
