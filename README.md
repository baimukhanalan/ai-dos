<div align="center">

# AI Dos

### The AI receptionist for clinics — answers every call 24/7 in Russian, Kazakh & English

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)

[![Live Demo](https://img.shields.io/badge/Live_Demo-ai--dos--sage.vercel.app-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://ai-dos-sage.vercel.app)

</div>

## 📖 About

**AI Dos** is an AI-powered registry and receptionist for clinics in Kazakhstan. It pairs a public marketing landing page with a secure staff portal and a patient-facing assistant, so a clinic can answer calls and chats around the clock, book and reschedule appointments, and keep operations moving — without a human picking up every call.

Every clinic is isolated by tenant in a live PostgreSQL database, with role-based staff accounts, HttpOnly session auth, double-booking protection, and an action audit trail. The assistant speaks **Russian, Kazakh, and English**, confirms the patient before touching any booking, and falls back to a safe local runtime when no external LLM is available.

## ✨ Features

- 🎙️ **24/7 voice answering** — inbound calls over OpenAI Realtime SIP: a verified webhook, a per-clinic number, a call log, and safe rejection of unknown numbers.
- 🌐 **Multilingual, by default** — Russian / Kazakh / English across the patient chat, voice sessions, and notification templates, with automatic language detection.
- ☎️ **SIP telephony & voice lab** — a Gemini Live voice lab with barge-in (server VAD), latency measurement, local recording, and WebM export; audio never leaves the browser.
- 📅 **Patient scheduling** — patients, doctors, services, and schedules in PostgreSQL; view, cancel, and reschedule future visits through one confirmable flow shared by web chat, voice, and MCP.
- 🤖 **AI assistant** — OpenAI-backed chat at `/assistant` that never exposes the API key to the browser, plus MCP tools for services, doctors, open slots, and callbacks.
- 🛎️ **Operations center** — calls, callbacks, waitlist, urgent requests, tasks, and notifications; waitlist and no-show workers reassign freed slots and turn missed visits into staff tasks.
- 📨 **Notification delivery** — a retry/backoff queue with RU/KK/EN templates over SMS, WhatsApp, email, Telegram, or portal, with an honest `blocked` status until a channel is wired up.
- 📊 **Reports & analytics** — plan limits versus actual usage (bookings, notifications, voice minutes, assistant replies) and clinic reporting in the portal.
- 🎨 **White-label & billing** — per-clinic name, colors, logo, and contacts applied across the portal and patient messages.
- 🔌 **MCP integration** — a public Model Context Protocol endpoint exposing clinic tools to compatible AI clients.
- 🏥 **MIS bridge** — a safe sandbox adapter by default, with DAMUMED and approved remote-gateway modes for syncing bookings to an external medical information system.

## 📸 Screenshots

<!-- TODO: Add screenshots or a GIF of the landing page, patient assistant, and staff portal here. -->

## 🛠️ Tech Stack

| Layer | Technologies |
| --- | --- |
| **Framework** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4, Radix UI / shadcn, Lucide & Phosphor icons |
| **AI & Voice** | OpenAI (AI SDK + Realtime SIP), Google Gemini Live, Model Context Protocol SDK |
| **Database** | PostgreSQL (Neon serverless driver), SQL migrations |
| **Auth & Validation** | jose (JWT sessions), bcryptjs, Zod, React Hook Form |
| **Background jobs** | Vercel Cron workers (waitlist, no-show, reminders, outbox) |
| **Tooling** | Vitest, ESLint, Testing Library, deployed on Vercel |

## 🚀 Getting Started

### Prerequisites

- **Node.js 20+**
- A **PostgreSQL** database (e.g. [Neon](https://neon.tech/))
- An **OpenAI** API key (optional — the app runs in a safe local mode without one)

### Installation

```bash
git clone https://github.com/<your-username>/ai-dos.git
cd ai-dos
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Environment variables

Fill in `.env.local` (see `.env.example` for the full list). The essentials:

```dotenv
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
SESSION_SECRET=replace-with-at-least-32-random-characters
OPENAI_API_KEY=sk-replace-me
GEMINI_API_KEY=replace-with-google-ai-studio-key
OPENAI_MODEL=gpt-5.6
OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini
PUBLIC_APP_URL=http://localhost:3000
AI_RUNTIME=safe        # "safe" = built-in responses; switch to "openai" once quota is available
MIS_ADAPTER=sandbox    # sandbox | damumed | remote
CRON_SECRET=replace-with-a-long-random-secret
```

Keep all secrets in `.env.local` and your Vercel environment — never commit them.

### Useful commands

```bash
npm run dev          # start the dev server
npm run build        # production build
npm run db:migrate   # apply SQL migrations
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest
```

## 📁 Project Structure

```
src/
├── app/            # App Router: landing, /assistant, /portal, /platform, API routes
│   └── api/        # auth, booking, chat, realtime, telephony, mcp, reports, cron, …
├── components/     # UI, marketing, portal, platform & AI elements
├── lib/            # AI, booking, scheduling, notifications, billing, MCP, data access
└── types/          # shared TypeScript types
db/migrations/      # ordered SQL migrations
workers/            # background worker logic
tests/              # Vitest suites
```

## 🗺️ Roadmap

- [x] Secure multi-tenant portal with role-based access
- [x] Multilingual patient assistant (RU / KK / EN)
- [x] OpenAI Realtime SIP inbound calls & Gemini Live voice lab
- [x] Waitlist, no-show, reminder & notification workers
- [x] MCP endpoint and white-label branding
- [ ] Live DAMUMED API integration (pending official credentials)
- [ ] Additional notification providers out of the box
- [ ] Sub-daily cron on Vercel Pro / external scheduler guidance

## 📄 License

Released under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Built with Next.js & OpenAI — <a href="https://ai-dos-sage.vercel.app">try the live demo</a></sub>
</div>
