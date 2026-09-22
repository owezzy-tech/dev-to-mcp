# DEV.to Publishing Dashboard

An Angular standalone dashboard for the DEV.to Agent Publishing Platform. It
calls the versioned REST API (`/v1`) and never holds the DEV.to API key —
credentials stay server-side (FR-061).

## Develop

```bash
npm install
npm start          # ng serve, proxying /v1 to the backend
```

## Build

```bash
npm run build      # outputs to dist/dashboard/browser
```

The backend serves `dist/dashboard/browser` automatically when it is present.

## Test

```bash
npm run test       # Vitest component tests (jsdom)
npm run test:ci    # single run for CI
```

## WebMCP

WebMCP support is feature-detected at runtime. When the browser does not expose
the API, the dashboard shows setup guidance and remains fully usable (FR-064).
When present, tools are registered and each invocation keeps the structured
result returned to the agent in sync with the visible action log (FR-063).

## Accessibility

The dashboard targets WCAG 2.2 AA: labelled controls, visible focus, and
`aria-live` regions for dynamic status and the action log.
