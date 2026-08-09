# AI Dos — combined product audit

## Audit scope

- Product: AI Dos landing, clinic sign-in, and authenticated registrar portal.
- User goal: understand the product, create or enter a clinic workspace, and complete routine registrar work with live tenant-scoped data.
- Accessibility target: clear structure, labeled forms, keyboard-reachable primary actions, readable status communication, and responsive reflow.

## Evidence

1. Landing: `.artifacts/audit/01-landing-desktop.png`
2. Sign-in: `.artifacts/audit/02-login-desktop.png`
3. Portal: `.artifacts/design-qa/portal-production-1440x1000.png`
4. Portal/source comparison: `.artifacts/design-qa/portal-final-comparison.png`
5. Mobile landing: `.artifacts/audit/03-landing-mobile.png`

The authenticated portal was also re-verified after the production-hardening deploy through fresh Browser DOM and console checks. The Browser screenshot service timed out during the final textual hardening pass, so the accepted portal image predates the last copy/data-consistency changes; layout and visual tokens were unchanged.

## Flow steps

1. **Landing — healthy.** The purpose, Kazakhstan clinic context, multilingual promise, sandbox demonstration, and official DAMUMED API boundary are visible before the first action. Primary and secondary calls to action are distinct.
2. **Sign-in or clinic creation — healthy.** Labels, password visibility, pending state, consent on registration, and server error region are present. The form keeps the user in one focused task.
3. **Conversation workspace — healthy.** Live transcript, AI action rail, patient summary, confirmed appointments, and AI draft surface are separated. Internal AI draft messages no longer appear as patient speech after reload.
4. **Patients and scheduling — healthy.** Patient creation, tenant-scoped list refresh, live slot lookup, idempotent appointment creation, overlap rejection, and persisted confirmation were exercised against Neon.
5. **Knowledge, reports, and settings — healthy.** Published clinic guidance persists, reports count all patients in clinic local time, and settings accurately distinguish connected PostgreSQL, Safe Mode, sandbox web channel, and pending official integrations.
6. **ChatGPT/MCP surface — healthy.** Services, doctors, available slots, and idempotent callback tools return structured output from the configured public clinic; the callback write remains private to the clinic workspace.

## Strengths

- Strong editorial hierarchy and calm medical palette create trust without imitating a diagnostic product.
- Navigation, form labels, status text, and confirmations make the main workflow easy to scan.
- Safety boundaries are explicit: no diagnosis, emergency escalation to 112/103, and no fictional DAMUMED integration.
- Confirmed records, free slots, and report values are driven by the live database rather than visual mock state.
- Chart values are printed as text, so the report does not rely on color alone.

## UX risks

- **P3 — Sandbox call controls.** “Подключиться” and “Передать оператору” demonstrate state locally until telephony credentials exist. Keep the sandbox badge visible and replace the local toggle with provider status once a real channel is connected.
- **P3 — Appointment context density.** The right rail shows confirmed appointments while free time is selected in “Расписание.” The copy now explains the distinction, but a direct “Открыть расписание” action could reduce one navigation step later.
- **P3 — Empty and first-run states.** Registration seeds realistic data for evaluation. A future live onboarding mode should make the switch from sandbox to real clinic data explicit.

## Accessibility risks

- Muted helper copy and pale borders look readable in the captures, but exact contrast still needs automated measurement against WCAG thresholds.
- Keyboard tab order, visible focus across the horizontally scrollable portal navigation, screen-reader announcements for streamed AI output, and 200% zoom were not fully verified from screenshots.
- The mobile landing was captured, but the authenticated portal needs a dedicated small-screen keyboard and reflow pass before claiming mobile accessibility coverage.

## Recommendations

1. When telephony credentials arrive, replace sandbox toggles with real connection state, permission handling, and failure recovery.
2. Add a direct schedule link beside confirmed appointments if operator testing shows repeated back-and-forth navigation.
3. Run automated contrast and axe checks, followed by keyboard and screen-reader verification, before a regulated production launch.
4. Keep DAMUMED disabled until official documentation, credentials, consent scope, and clinic acceptance tests are available.

## Verdict

The evaluated MVP is healthy for a live pilot: the core registrar journey works, production data is tenant-scoped, safety boundaries are visible, and no actionable P0/P1/P2 visual issue remains after the final fixes. External telephony, messaging, and DAMUMED remain explicit integration dependencies rather than simulated features.
