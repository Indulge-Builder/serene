# Lib CLAUDE.md — stub. Update as patterns are established.

## Constants registry

| File | Purpose |
| ---- | ------- |
| `constants/roles.ts` | `USER_ROLES`, `ROLE_LABELS` |
| `constants/domains.ts` | `APP_DOMAINS`, `DOMAIN_LABELS` |
| `constants/lead-statuses.ts` | `LeadStatus` enums + badge config |
| `constants/call-outcomes.ts` | `CallOutcome` enums + labels |
| `constants/task-types.ts` | `TaskType` enums |
| `constants/campaign-domain-map.ts` | prefix → domain mapping |
| `constants/lead-columns.ts` | Column registry for the leads table — `LEAD_COLUMNS`, `LEAD_COLUMN_MAP`, `DEFAULT_COLUMN_ORDER`, `isValidLeadColumnId`. IDs are stable localStorage keys — never rename after shipping. |
