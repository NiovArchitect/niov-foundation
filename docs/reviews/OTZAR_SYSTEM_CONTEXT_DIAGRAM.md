# OTZAR — System Context Diagram

**Verified 2026-07-27** against live health + repo layout.

## Context (C4 L1)

```mermaid
flowchart TB
  subgraph Humans
    EMP[Employee]
    ADM[Org Admin / Founder]
    INV[Investor Demo Viewer]
  end

  subgraph Public["Public edge"]
    APP["app.otzar.ai\nControl Tower SPA\nRender otzar-app"]
    API["api.otzar.ai\nFoundation API\nRender otzar-api"]
  end

  subgraph OptionalClients
    RELAY["otzar-relay\nmessaging shell"]
    TAURI["Tauri desktop shell\n(src-tauri)"]
    FED["niov-federation-cloud"]
    AVP["niov-avp AVP² client"]
  end

  subgraph Foundation["niov-foundation"]
    FAST[Fastify TypeScript API]
    BEAM[Elixir BEAM\ncosmp_router\ndbgi_supervisor\ncollaboration_supervisor]
    PY[Python enrichment worker]
  end

  subgraph Data
    PG[(Postgres + pgvector)]
    REDIS[(Redis)]
    STORE[Object storage]
  end

  subgraph External
    LLM[LLM providers]
    GWS[Google Workspace OAuth]
    VOICE[STT/TTS providers]
  end

  EMP --> APP
  ADM --> APP
  INV --> APP
  APP -->|HTTPS JWT| API
  RELAY --> API
  TAURI --> APP
  FED --> API
  AVP --> API

  API --> FAST
  FAST --> BEAM
  FAST --> PY
  FAST --> PG
  FAST --> REDIS
  FAST --> STORE
  FAST --> LLM
  FAST --> GWS
  FAST --> VOICE
  BEAM --> PG
```

## Trust boundaries

| Boundary | Rule |
|----------|------|
| Browser → API | Bearer JWT; no JWT in localStorage |
| Tenant A ↔ Tenant B | Org-scope predicates + GOVSEC isolation tests |
| Human ↔ AI Twin | Twin authority grants; lower AI ceilings |
| Foundation ↔ CT | HTTP contracts only; CT must not invent authority |
| Otzar ↔ Relay | Relay is UX; Foundation is policy/truth |
| Otzar ↔ Caretaker | **Hard isolation** — separate products/repos |
