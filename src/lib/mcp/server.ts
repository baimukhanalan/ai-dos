import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createCallbackForTenant,
  findAvailableSlots,
  listPublicDoctors,
  listPublicServices,
  resolvePublicTenant,
} from "@/lib/dal/operations";
import { callbackSchema } from "@/lib/validation/operations";

const WIDGET_URI = "ui://widget/ai-dos-v1.html";

function widgetHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}
    *{box-sizing:border-box}body{margin:0;padding:12px;background:transparent;color:#17382d}
    .card{border:1px solid rgba(23,56,45,.14);border-radius:16px;background:#fbfaf5;padding:16px;box-shadow:0 8px 24px rgba(23,56,45,.06)}
    .brand{display:flex;align-items:center;gap:8px;font-weight:750}.dot{width:9px;height:9px;border-radius:99px;background:#167a57}
    h2{margin:18px 0 6px;font-family:Georgia,serif;font-size:21px;font-weight:500}.muted{color:#63736d;font-size:13px;line-height:1.45}
    .items{display:grid;gap:8px;margin-top:12px}.item{padding:11px 12px;border-radius:12px;background:#edf7f2;border:1px solid #d8ebe2;font-size:13px;line-height:1.4}
    .pill{display:inline-flex;margin-top:12px;border-radius:99px;padding:5px 9px;background:#dff2e8;color:#126445;font-size:12px;font-weight:650}
    @media(prefers-color-scheme:dark){body{color:#e8f3ed}.card{background:#17231f;border-color:#31433d}.muted{color:#9db0a8}.item{background:#20332c;border-color:#344b42}.pill{background:#244a3b;color:#c7f3df}}
  </style>
</head>
<body>
  <main class="card" aria-live="polite">
    <div class="brand"><span class="dot"></span>AI Dos</div>
    <h2 id="title">Помощник регистратуры</h2>
    <div id="status" class="muted">Результат появится здесь.</div>
    <div id="items" class="items"></div>
  </main>
  <script>
    const render=(payload)=>{
      const data=payload?.structuredContent||payload||{};
      const values=data.services||data.doctors||data.slots||[];
      document.getElementById('title').textContent=data.title||data.message||'AI Dos';
      document.getElementById('status').textContent=data.clinic?('Клиника: '+data.clinic):(data.status==='new'?'Регистратура получила заявку.':'Официальная интеграция DAMUMED ожидает API.');
      const items=document.getElementById('items');
      items.replaceChildren();
      values.slice(0,8).forEach((item)=>{
        const row=document.createElement('div');
        row.className='item';
        row.textContent=Object.values(item).filter(Boolean).slice(0,4).join(' · ');
        items.appendChild(row);
      });
      if(data.status==='new'){
        const pill=document.createElement('span');
        pill.className='pill';
        pill.textContent='Заявка принята';
        items.replaceChildren(pill);
      }
    };
    window.addEventListener('message',(event)=>{
      if(event.data?.method==='ui/notifications/tool-result') render(event.data.params);
    });
    if(window.openai?.toolOutput) render({structuredContent:window.openai.toolOutput});
  </script>
</body>
</html>`;
}

function toolMeta(invoking: string, invoked: string) {
  return {
    "openai/outputTemplate": WIDGET_URI,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
    "openai/widgetAccessible": true,
    "ui/resourceUri": WIDGET_URI,
  };
}

function textResult(structuredContent: Record<string, unknown>) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(structuredContent),
      },
    ],
    structuredContent,
  };
}

export function createAiDosMcpServer() {
  const server = new McpServer(
    { name: "AI Dos", version: "1.0.0" },
    {
      capabilities: { tools: {}, resources: {} },
      instructions:
        "AI Dos помогает подобрать услуги, врача и свободное время. Не используйте инструменты для диагностики. Создание callback-заявки всегда требует явного номера телефона пользователя.",
    },
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  server.registerResource(
    "AI Dos clinic card",
    WIDGET_URI,
    {
      title: "AI Dos — регистратура",
      description:
        "Компактная карточка услуг, врачей, слотов и callback-заявки.",
      mimeType: "text/html;profile=mcp-app",
      _meta: {
        "openai/widgetDescription":
          "Показывает данные регистратуры AI Dos без медицинской диагностики.",
        "openai/widgetPrefersBorder": true,
        "ui.prefersBorder": true,
        "ui.csp": {
          connectDomains: [],
          resourceDomains: [],
        },
        ...(appUrl?.startsWith("https://") ? { "ui.domain": appUrl } : {}),
      },
    },
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: "text/html;profile=mcp-app",
          text: widgetHtml(),
          _meta: {
            "openai/widgetDescription":
              "Показывает данные регистратуры AI Dos без медицинской диагностики.",
            "openai/widgetPrefersBorder": true,
            "ui.prefersBorder": true,
            "ui.csp": {
              connectDomains: [],
              resourceDomains: [],
            },
            ...(appUrl?.startsWith("https://") ? { "ui.domain": appUrl } : {}),
          },
        },
      ],
    }),
  );

  server.registerTool(
    "list_clinic_services",
    {
      title: "Услуги клиники",
      description:
        "Use this when a patient asks what consultations or clinic services are available, including duration and price when published.",
      inputSchema: {},
      outputSchema: {
        title: z.string(),
        clinic: z.string(),
        services: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().nullable(),
            durationMinutes: z.number(),
            priceKzt: z.number().nullable(),
          }),
        ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: toolMeta("Проверяю услуги…", "Услуги найдены"),
    },
    async () => {
      const tenant = await resolvePublicTenant();
      const rows = (await listPublicServices(tenant.id)) as Array<{
        id: string;
        name: string;
        description: string | null;
        duration_minutes: number;
        price_kzt: number | null;
      }>;
      return textResult({
        title: "Услуги клиники",
        clinic: tenant.name,
        services: rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          durationMinutes: row.duration_minutes,
          priceKzt: row.price_kzt,
        })),
      });
    },
  );

  server.registerTool(
    "list_doctors",
    {
      title: "Врачи клиники",
      description:
        "Use this when a patient wants to choose a doctor or asks which specialist can receive them; optionally filter by specialty name.",
      inputSchema: {
        specialty: z.string().trim().min(2).max(80).optional(),
      },
      outputSchema: {
        title: z.string(),
        clinic: z.string(),
        doctors: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            specialty: z.string().nullable(),
            branch: z.string().nullable(),
            languages: z.array(z.string()),
          }),
        ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: toolMeta("Ищу врачей…", "Врачи найдены"),
    },
    async ({ specialty }) => {
      const tenant = await resolvePublicTenant();
      const rows = (await listPublicDoctors(tenant.id, specialty)) as Array<{
        id: string;
        display_name: string;
        specialty: string | null;
        branch: string | null;
        languages: string[];
      }>;
      return textResult({
        title: specialty ? `Врачи: ${specialty}` : "Врачи клиники",
        clinic: tenant.name,
        doctors: rows.map((row) => ({
          id: row.id,
          name: row.display_name,
          specialty: row.specialty,
          branch: row.branch,
          languages: row.languages,
        })),
      });
    },
  );

  server.registerTool(
    "find_available_slots",
    {
      title: "Свободное время",
      description:
        "Use this when a patient has selected a doctor and wants concrete available appointment times; call list_doctors first to obtain doctorId.",
      inputSchema: {
        doctorId: z
          .string()
          .uuid()
          .describe("Doctor ID returned by list_doctors"),
        days: z.number().int().min(1).max(14).default(7),
      },
      outputSchema: {
        title: z.string(),
        clinic: z.string(),
        slots: z.array(
          z.object({
            startsAt: z.string(),
            durationMinutes: z.number(),
          }),
        ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: toolMeta("Проверяю расписание…", "Свободное время найдено"),
    },
    async ({ doctorId, days }) => {
      const tenant = await resolvePublicTenant();
      const slots = await findAvailableSlots(tenant.id, doctorId, days);
      return textResult({
        title: "Свободное время",
        clinic: tenant.name,
        slots,
      });
    },
  );

  server.registerTool(
    "create_callback_request",
    {
      title: "Заказать звонок",
      description:
        "Use this when the patient explicitly asks clinic staff to call them back or when a sensitive or uncertain case requires human follow-up. Confirm the phone number before calling.",
      inputSchema: {
        name: callbackSchema.shape.name,
        phone: callbackSchema.shape.phone,
        reason: callbackSchema.shape.reason,
        preferredTime: callbackSchema.shape.preferredTime,
        priority: callbackSchema.shape.priority,
        idempotencyKey: callbackSchema.shape.idempotencyKey.describe(
          "Stable unique key for this user-confirmed callback request",
        ),
      },
      outputSchema: {
        title: z.string(),
        clinic: z.string(),
        id: z.string(),
        status: z.literal("new"),
        message: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: toolMeta("Передаю заявку…", "Заявка принята"),
    },
    async (input) => {
      const tenant = await resolvePublicTenant();
      const data = callbackSchema.parse(input);
      const callback = await createCallbackForTenant(tenant.id, data);
      return textResult({
        title: "Обратный звонок",
        clinic: tenant.name,
        ...callback,
      });
    },
  );

  return server;
}
