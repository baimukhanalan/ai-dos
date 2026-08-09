# AI Dos design QA

## Comparison target

- Source visual truth: `design/landing-concept.png`, `design/login-concept.png`, `design/portal-concept.png`
- Rendered implementation: local Next.js app at `http://localhost:3001`; production checkpoint at `https://ai-dos-sage.vercel.app`
- Viewport: 1440 × 1000 desktop; 390 × 844 mobile smoke check
- State: unauthenticated landing and login; authenticated production portal with seeded clinic, live appointments, and clean initial conversation state

## Evidence

- Full-view landing, pass 3: `.artifacts/design-qa/landing-pass3-comparison.png`
- Focused landing hero, pass 3: `.artifacts/design-qa/landing-hero-focus-pass3.png`
- Full-view login, pass 3: `.artifacts/design-qa/login-pass3-comparison.png`
- Focused login form, pass 3: `.artifacts/design-qa/login-form-focus-pass3.png`
- Browser-rendered production screens: `.artifacts/audit/01-landing-desktop.png`, `.artifacts/audit/02-login-desktop.png`
- Mobile browser evidence: `.artifacts/browser/landing-mobile-viewport.png`
- Production portal at 1440 × 1000: `.artifacts/design-qa/portal-production-1440x1000.png`
- Portal source/production comparison: `.artifacts/design-qa/portal-final-comparison.png`

## Required fidelity surfaces

- Fonts and typography: editorial serif and sans-serif hierarchy now match the source closely; the landing title holds the intended three-line wrap and login title stays on one desktop line.
- Spacing and layout rhythm: hero copy, actions, clinical panel, login form, and right-side workflow rail preserve the source grid and density. Residual differences are limited to P3-level content-height drift.
- Colors and visual tokens: warm clinical background, forest green, pale aqua, low-contrast borders, and muted copy map consistently to the source.
- Image quality and asset fidelity: the target is interface-led and contains no photographic assets. Visible symbols use the Phosphor icon family; no placeholder emoji or handcrafted SVG substitutes are used.
- Copy and content: app copy is coherent in RU/KZ/EN context, names the DAMUMED API boundary honestly, and avoids diagnostic claims.

## Findings

- [P3] The source login includes remember-password, recovery, and Google controls that are intentionally omitted until their real authentication providers exist. The implementation keeps only functional password login and clinic registration.
- [P3] The implementation uses shorter sandbox conversation copy than the concept. It preserves the same hierarchy while avoiding fictional clinic-specific claims.
- [P3] The production portal presents confirmed upcoming appointments in the right rail instead of making them look like selectable open slots; open time is selected in the functional schedule flow.

## Comparison history

### Pass 1 — blocked

- [P2] Landing title wrapped to four lines and dominated the left column.
- [P2] Login title wrapped to two lines and changed the source composition.
- Fix: reduced desktop editorial scale and removed the desktop-only country badge that shifted the hero.
- Evidence: `.artifacts/design-qa/landing-comparison.png`, `.artifacts/design-qa/login-comparison.png`.

### Pass 2 — blocked

- [P2] Landing content and clinical panel still sat too low relative to the source.
- [P2] Login title still wrapped because the final cap was too large.
- Fix: aligned the hero grid to its top edge, increased clinical panel depth, reduced the login title cap, and enlarged the login workflow rail.
- Evidence: `.artifacts/design-qa/landing-pass2-comparison.png`, `.artifacts/design-qa/login-pass2-comparison.png`.

### Pass 3 — unauthenticated surfaces passed

- Earlier P2 findings are resolved in the side-by-side and focused evidence.
- No actionable P0/P1/P2 differences remain on landing or login.
- Portal remained pending until the production database was available.

### Pass 4 — authenticated portal passed

- Vercel Neon is connected and both schema migrations are applied.
- The selected portal concept and the production portal were captured at 1440 × 1000 and evaluated together.
- Header navigation, editorial hierarchy, live conversation, AI action rail, patient summary, confirmed appointments, clinical palette, radii, spacing, and icon language preserve the source composition.
- The production state uses live tenant-scoped data and intentionally shorter sandbox history. No actionable P0/P1/P2 visual differences remain.
- A fresh production Browser tab reports no console errors after the hydration and async form-reset fixes.

## Primary interactions and console checks

- Landing navigation and primary CTAs resolve to expected routes.
- Login and registration forms expose labeled controls, visible password toggle, required-field semantics, pending state, and server error region.
- Desktop and mobile layouts were rendered in the in-app browser.
- Registration, logout/login, patient creation, slot retrieval, appointment creation, knowledge publishing, Safe Mode chat, emergency escalation, reports, and settings were exercised against production.
- No application console errors were observed on the accepted final production portal capture.

## Final result

final result: passed
