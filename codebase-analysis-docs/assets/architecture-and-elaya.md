# Supplemental Diagrams — Architecture, Layering & Elaya

> Companion assets to [`../CODEBASE_KNOWLEDGE.md`](../CODEBASE_KNOWLEDGE.md) §3, §4, §13.

## Layered Request/Data Flow

```mermaid
flowchart TB
    subgraph client[Browser]
      UI[Client components 'use client']
    end
    subgraph vercel[Vercel · Next.js 16]
      PROXY[proxy.ts session refresh]
      RSC[RSC pages thin orchestrators]
      ACT[Server Actions Zod→requireProfile]
      SVC[Services lib/services]
    end
    subgraph external[Backends]
      PG[(Supabase Postgres + RLS)]
      RDS[(Upstash Redis cache-aside)]
      TD[Trigger.dev v4 · SLA + reminders + revival cron]
      GS[Gupshup v1]
      AN[Anthropic API]
      DG[Deepgram · voice transcription]
      WP[Web Push · VAPID]
    end

    UI -- navigate --> PROXY --> RSC
    RSC -- read --> SVC
    UI -- mutate --> ACT
    ACT --> SVC
    SVC --> PG
    SVC -- read-through --> RDS
    ACT -- invalidate --> RDS
    ACT -- revalidatePath --> RSC
    ACT -- after() awaited --> GS
    ACT -- transcribe --> DG
    ACT -- dispatchPush (in createNotification) --> WP
    TD -- callback --> ACT
    PG -- Realtime --> UI
    AN -- SSE --> UI
```

## Elaya Turn — Confirmation Gate

```mermaid
flowchart TD
    START[user message] --> ROUTE{channel}
    ROUTE -- in_app SSE --> BRAIN[runElayaTurn]
    ROUTE -- whatsapp staff --> BRAIN
    BRAIN --> RESOLVE{pending proposal?}
    RESOLVE -- yes --> CLASS[classifyConfirmation human msg only]
    CLASS -- affirmative --> EXEC[executeProposedAction<br/>re-check access + before-snapshot]
    CLASS -- other/negative --> DISMISS[markActionResolved dismissed]
    RESOLVE -- no --> LOOP
    EXEC --> LOOP[tool-calling loop max 5]
    DISMISS --> LOOP
    LOOP --> COMPLETE[adapter.complete provider-neutral]
    COMPLETE --> TOOLS{tool_use?}
    TOOLS -- read tool --> READ[executeTool → service → maskPii]
    TOOLS -- low-risk write --> CORE[core mutation inline → executed row]
    TOOLS -- state-change --> PROPOSE[insert proposed row → await confirmation]
    READ --> COMPLETE
    CORE --> COMPLETE
    PROPOSE --> DONE[turn ends]
    TOOLS -- no --> DONE
```

**Security invariants:** identity always principal-derived (never model output); every tool result passes `maskPii()`; the confirmation verdict is computed from the human message only (prompt-injection defence); state-changes execute only in the resolver pre-step, never in the proposal turn.

## Provider-Neutral LLM Stack

```mermaid
flowchart LR
    BRAIN[brain.ts] --> REG[registry.ts resolve per turn]
    REG --> DB[(llm_providers config row)]
    REG --> ADP[adapter]
    ADP --> ANTH[adapters/anthropic.ts<br/>ONLY @anthropic-ai/sdk import]
    ADP -. future .-> GEM[adapters/gemini.ts]
    ADP -. future .-> OAI[adapters/openai.ts]
    ANTH --> CONTRACT[provider.ts complete contract]
    BRAIN --> CONTRACT
```

A model/provider switch is a DB edit (`llm_providers` row), read per turn — no deploy.
