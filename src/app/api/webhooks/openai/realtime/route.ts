import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { db } from "@/lib/db";
import { publicAppUrl, realtimeSessionConfig } from "@/lib/voice/config";

export const runtime = "nodejs";

type SipHeader = { name: string; value: string };
type RealtimeWebhookEvent = {
  id: string;
  type: string;
  data: {
    call_id?: string;
    sip_headers?: SipHeader[];
  };
};

function sipHeader(headers: SipHeader[] | undefined, name: string) {
  return headers?.find(
    (header) => header.name.toLowerCase() === name.toLowerCase(),
  )?.value;
}

function phoneFromSipUri(value?: string) {
  if (!value) return null;
  const match = value.match(/(?:sip:)?(\+[1-9]\d{7,14})@/);
  return match?.[1] || null;
}

async function rejectCall(callId: string, statusCode = 603) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return;
  await fetch(`https://api.openai.com/v1/realtime/calls/${callId}/reject`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status_code: statusCode }),
    signal: AbortSignal.timeout(10_000),
  });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  const webhookSecret = process.env.OPENAI_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    return Response.json(
      { ok: false, error: "telephony_not_configured" },
      { status: 503 },
    );
  }

  const body = await request.text();
  let event: RealtimeWebhookEvent;
  try {
    const client = new OpenAI({ apiKey, webhookSecret });
    event = (await client.webhooks.unwrap(
      body,
      request.headers,
      webhookSecret,
    )) as unknown as RealtimeWebhookEvent;
  } catch (error) {
    if (error instanceof OpenAI.InvalidWebhookSignatureError) {
      return new Response("Invalid signature", { status: 400 });
    }
    console.error("OpenAI realtime webhook verification failed", error);
    return new Response("Webhook verification failed", { status: 400 });
  }

  if (event.type !== "realtime.call.incoming" || !event.data.call_id) {
    return Response.json({ ok: true, ignored: true });
  }

  const callId = event.data.call_id;
  const toNumber = phoneFromSipUri(
    sipHeader(event.data.sip_headers, "To"),
  );
  const fromNumber = phoneFromSipUri(
    sipHeader(event.data.sip_headers, "From"),
  );
  if (!toNumber) {
    await rejectCall(callId, 404);
    return Response.json({ ok: true, rejected: "number_not_resolved" });
  }

  const sql = db();
  const numberRows = (await sql`
    SELECT p.id, p.tenant_id, p.voice, p.greeting, p.languages,
      t.name AS tenant_name
    FROM phone_numbers p
    JOIN tenants t ON t.id = p.tenant_id
    WHERE p.e164 = ${toNumber}
      AND p.status = 'active'
      AND t.status = 'active'
    LIMIT 1
  `) as Array<{
    id: string;
    tenant_id: string;
    voice: "marin" | "cedar" | "coral" | "sage" | "shimmer";
    greeting: string | null;
    languages: string[];
    tenant_name: string;
  }>;
  const number = numberRows[0];
  if (!number) {
    await rejectCall(callId, 404);
    return Response.json({ ok: true, rejected: "number_not_active" });
  }

  const duplicate = await sql`
    SELECT id FROM webhook_events
    WHERE id = ${event.id} AND tenant_id = ${number.tenant_id}
    LIMIT 1
  `;
  if (duplicate[0]) {
    return Response.json({ ok: true, duplicate: true });
  }

  const internalCallId = randomUUID();
  await sql.transaction([
    sql`
      INSERT INTO webhook_events (
        id, tenant_id, provider, event_type, payload, status
      ) VALUES (
        ${event.id}, ${number.tenant_id}, 'openai', ${event.type},
        ${JSON.stringify(event)}::jsonb, 'received'
      )
    `,
    sql`
      INSERT INTO calls (
        id, tenant_id, phone_number_id, external_call_id, direction,
        from_number, to_number, status, metadata
      ) VALUES (
        ${internalCallId}, ${number.tenant_id}, ${number.id}, ${callId},
        'inbound', ${fromNumber}, ${toNumber}, 'ringing',
        ${JSON.stringify({ webhookEventId: event.id })}::jsonb
      )
    `,
  ]);

  const baseUrl = publicAppUrl(new URL(request.url).origin);
  const session = realtimeSessionConfig({
    clinicName: number.tenant_name,
    language: "auto",
    voice: number.voice,
    model: "gpt-realtime-2.1-mini",
    speed: 1,
    greeting: number.greeting,
    mcpUrl: `${baseUrl}/api/mcp`,
  });
  const accepted = await fetch(
    `https://api.openai.com/v1/realtime/calls/${callId}/accept`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(session),
      signal: AbortSignal.timeout(12_000),
    },
  );

  if (!accepted.ok) {
    await sql.transaction([
      sql`
        UPDATE calls SET status = 'failed', ended_at = now(),
          metadata = metadata || ${JSON.stringify({ acceptStatus: accepted.status })}::jsonb
        WHERE id = ${internalCallId} AND tenant_id = ${number.tenant_id}
      `,
      sql`
        UPDATE webhook_events SET status = 'failed', processed_at = now(),
          error_code = 'call_accept_failed'
        WHERE id = ${event.id} AND tenant_id = ${number.tenant_id}
      `,
    ]);
    return Response.json(
      { ok: false, error: "call_accept_failed" },
      { status: 502 },
    );
  }

  await sql.transaction([
    sql`
      UPDATE calls SET status = 'active', answered_at = now()
      WHERE id = ${internalCallId} AND tenant_id = ${number.tenant_id}
    `,
    sql`
      UPDATE webhook_events SET status = 'processed', processed_at = now()
      WHERE id = ${event.id} AND tenant_id = ${number.tenant_id}
    `,
    sql`
      INSERT INTO audit_events (
        tenant_id, action, resource_type, resource_id, metadata
      ) VALUES (
        ${number.tenant_id}, 'call.accepted', 'call', ${internalCallId},
        ${JSON.stringify({ provider: "openai_sip", toNumber })}::jsonb
      )
    `,
  ]);

  return Response.json({ ok: true });
}
