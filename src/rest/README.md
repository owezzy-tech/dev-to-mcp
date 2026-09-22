# REST boundary

`rest` adapts the shared application core to versioned JSON endpoints under
`/v1`. It owns routing, session authentication, and safe error translation —
never business policy or credentials.

- `compose.ts` — the composition root: wires config, adapters, providers, and
  repositories into the shared use cases. Providers degrade to null
  implementations when their credentials are absent, so the server runs with
  any subset configured.
- `auth.ts` — session-to-author resolution. Privileged routes require a valid
  dashboard session; the DEV.to API key never leaves the server (FR-061).
- `routes.ts` — the `/v1` router. Every route delegates to the same handlers
  the MCP adapter uses.
- `errors.ts` — maps the safe error taxonomy onto HTTP status codes without
  leaking internal detail.

MCP and REST are peers over one application core; neither owns business rules.
