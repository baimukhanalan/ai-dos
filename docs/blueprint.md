# AI Dos — product blueprint

## 1. Product promise

AI Dos is a multi-tenant AI reception workspace for clinics in Kazakhstan. It accepts patient requests around the clock, helps staff find a doctor and an available slot, and hands uncertain, urgent, or sensitive cases to a human. It is an operational assistant, not a diagnostic system.

## 2. Primary users

- Clinic administrator: workspace, roles, integrations, knowledge base, reporting.
- Reception operator: conversations, patient search, booking, callbacks, escalation.
- Doctor or department coordinator: schedule visibility and appointment context.
- Patient: public chat or supported channel, with explicit consent and minimal data collection.

## 3. Core journeys

1. Visitor learns what AI Dos does on the landing page and starts a clinic workspace.
2. Clinic owner registers a tenant, receives an admin role, and lands in the portal.
3. Operator finds or creates a patient, selects a doctor and books an available slot.
4. AI drafts a response and suggests the next operational action; a human remains in control.
5. Urgent, ambiguous, or policy-sensitive requests become callback tasks for staff.
6. DAMUMED traffic is routed only through an official adapter once credentials and documentation arrive.

## 4. Information architecture

- Public: landing, product explanation, security, DAMUMED readiness, login and registration.
- Portal: conversations, live voice lab, calls and operations, patients, schedule, clinic directory, knowledge, scenarios and campaigns, reports and administration.
- Server: auth, tenant-scoped DAL, booking, AI, event stream, reminder cron, MCP.
- Data: PostgreSQL with tenant keys, row-level policies, audit log and outbox.

## 5. Visual system

- Selected concept: calm editorial clinical workspace.
- Palette: warm white, forest green, charcoal, pale aqua and restrained amber/red states.
- Type: Geist Sans for controls and reading; Newsreader-like serif via Georgia fallback for display moments.
- Surfaces: 12–18 px radii, hairline borders, nearly flat shadows, generous whitespace.
- Accessibility: visible focus, keyboard operability, semantic landmarks, 4.5:1 text contrast target.

## 6. Runtime architecture

Next.js App Router modular monolith on Vercel. Server Components render tenant-safe DTOs. Route Handlers provide JSON/SSE/MCP endpoints. All secrets and database access remain in `server-only` modules. The product uses a managed PostgreSQL connection through `DATABASE_URL`.

## 7. Tenant isolation

Every business record carries `tenant_id`. Server-side authorization resolves the tenant from the signed session, never from a client-provided tenant identifier. Queries include tenant predicates. PostgreSQL RLS policies provide a second layer for deployments that use `SET LOCAL app.tenant_id` or a restricted application role.

## 8. Authentication and authorization

Passwords are hashed with bcrypt. Sessions are short, signed JWTs stored in HttpOnly, Secure, SameSite=Lax cookies. Mutations re-check the session in the DAL. Initial registrants receive `clinic_admin`; later roles are additive through `user_roles`.

## 9. Scheduling integrity

Appointments use a tenant/doctor/start partial unique index for active states. Mutations accept an idempotency key, validate time and ownership, and write an audit event. Cancellation preserves history. DAMUMED-backed scheduling will use the same adapter contract.

## 10. AI behavior

AI Dos drafts operational replies in Russian, Kazakh, or English. The system prompt prohibits diagnosis, asks for clarification when identity or intent is uncertain, minimizes personal data, and escalates urgent symptoms or unsafe requests. OpenAI requests are server-only and set storage off where supported. A deterministic safe mode keeps operational replies and emergency escalation available when external model quota is unavailable.

## 11. DAMUMED adapter

`MedicalInformationSystemAdapter` defines patient lookup, doctor/schedule lookup, booking, reschedule and cancellation. `SandboxMedicalInformationSystemAdapter` uses AI Dos PostgreSQL. `DamuMedAdapter` intentionally returns `integration_unavailable` until official API documentation, credentials, base URL and webhook verification rules are supplied; no endpoints are invented.

## 12. ChatGPT app / MCP

The public `/api/mcp` endpoint exposes narrow tools with explicit schemas and annotations: list clinic services, list doctors, find available slots, and create a callback request. Read tools are non-destructive. Callback creation is a private write tool and is idempotent. Tool outputs contain operational data only and avoid patient health records.

## 13. Reliability and operations

An outbox records notifications and integration work. A protected Vercel Cron endpoint processes reminders. Health checks distinguish application availability from configured database/AI integrations. API errors use stable codes and never return secrets.

## 14. Privacy and audit

The minimum necessary patient data is stored. High-risk identifiers have dedicated fields and are never sent to the model by default. Important reads and writes can be logged to `audit_events`. Production launch still requires the clinic's legal review, retention policy, DPA and patient-facing privacy notice.

## 15. Testing and QA

- Unit tests: validation, session helpers, adapter behavior and appointment rules.
- Integration checks: migration, auth, tenant isolation, idempotent booking and MCP descriptors.
- Browser checks: landing → registration/login → portal → patient/booking → AI response.
- Visual QA: source/implementation side-by-side at desktop and mobile, then product audit.

## 16. Known launch boundary

AI Dos is production-deployable with its live database, sandbox scheduling and AI assistant. DAMUMED remains clearly marked “Ожидает официальный API”. Telephony/WhatsApp/Telegram production delivery additionally requires provider accounts and credentials; the portal and web channel do not depend on those accounts.

## 17. Voice and telephony pipeline

The browser test uses a server-minted, single-use Gemini ephemeral credential and connects directly to Gemini Live by WebSocket. Server VAD, interruption, streaming transcription and native audio output provide the low-latency conversational path. The permanent Google API key remains server-only. A mixed local MediaRecorder captures microphone and AI output only after explicit consent. The audio stays on the operator's device; the tenant database receives session status, latency and transcript.

Production calls use a purchased E.164 number from a SIP-trunk provider. The provider routes to OpenAI SIP, OpenAI signs an incoming-call webhook, and AI Dos maps the called number to one active tenant before accepting the call. Unknown or inactive numbers are rejected. The server key and webhook secret never reach the browser.

## 18. Operational modules

- Calls, callbacks, waitlist offers, urgent requests, handoff tasks and notification delivery.
- Clinic structure: clinics, branches, departments, specialties, doctors, services, schedules, users, roles and permissions.
- Versioned scenarios and executions, campaigns and consent-filtered contacts, notification templates and outbox events.
- Administration: subscription, usage counters, feature flags, integration health and immutable audit trail.

## 19. Appointment lifecycle

Creation validates tenant-owned references, current schedule and conflicts, then persists appointment history, idempotency response, outbox event and audit event. Cancellation requires an explicit confirmation, preserves the record and emits a cancellation event. Rescheduling first validates and creates the replacement slot, atomically marks the original as cancelled, links the event through metadata and compensates the replacement if a concurrent change wins.

## 20. Delivery stages

The twelve requested stages are represented in the running modular monolith: specification, architecture, setup, clinic core, appointments, official-adapter boundary, voice AI, notifications, waitlist/callback, scenarios, campaigns, and analytics/hardening. Provider-dependent functionality stays disabled rather than simulated as production. Detailed evidence and remaining external dependencies are maintained in `docs/requirements-traceability.md`.
