import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const COOKIE_NAME = "ai_dos_patient_session";
const SESSION_SECONDS = 60 * 60 * 6;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type PatientWebSession = {
  id: string;
  conversationId: string;
  patientId: string | null;
  verified: boolean;
  requestCount: number;
};

export async function getOrCreatePatientWebSession(
  tenantId: string,
  locale: "ru" | "kk" | "en",
) {
  const sql = db();
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    const rows = (await sql`
      UPDATE patient_web_sessions
      SET last_seen_at = now(), request_count = request_count + 1,
          locale = ${locale}
      WHERE tenant_id = ${tenantId} AND token_hash = ${tokenHash(token)}
        AND expires_at > now() AND request_count < 80
      RETURNING id, conversation_id, patient_id, verified_at, request_count
    `) as Array<{
      id: string;
      conversation_id: string;
      patient_id: string | null;
      verified_at: string | null;
      request_count: number;
    }>;
    if (rows[0]) {
      return {
        id: rows[0].id,
        conversationId: rows[0].conversation_id,
        patientId: rows[0].patient_id,
        verified: Boolean(rows[0].verified_at),
        requestCount: rows[0].request_count,
      } satisfies PatientWebSession;
    }
  }

  const nextToken = randomBytes(32).toString("base64url");
  const conversationId = randomUUID();
  const sessionId = randomUUID();
  await sql.transaction([
    sql`
      INSERT INTO conversations (id, tenant_id, channel, language, subject)
      VALUES (${conversationId}, ${tenantId}, 'web', ${locale}, 'Чат пациента на сайте')
    `,
    sql`
      INSERT INTO patient_web_sessions (
        id, tenant_id, conversation_id, token_hash, locale, request_count
      ) VALUES (
        ${sessionId}, ${tenantId}, ${conversationId}, ${tokenHash(nextToken)},
        ${locale}, 1
      )
    `,
  ]);
  store.set(COOKIE_NAME, nextToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
    priority: "high",
  });
  return {
    id: sessionId,
    conversationId,
    patientId: null,
    verified: false,
    requestCount: 1,
  } satisfies PatientWebSession;
}

export async function bindVerifiedPatient(
  tenantId: string,
  sessionId: string,
  patientId: string,
) {
  const sql = db();
  await sql.transaction([
    sql`
      UPDATE patient_web_sessions
      SET patient_id = ${patientId}, verified_at = now(), last_seen_at = now()
      WHERE id = ${sessionId} AND tenant_id = ${tenantId} AND expires_at > now()
    `,
    sql`
      UPDATE conversations c SET patient_id = ${patientId}
      FROM patient_web_sessions s
      WHERE s.id = ${sessionId} AND s.tenant_id = ${tenantId}
        AND c.id = s.conversation_id AND c.tenant_id = s.tenant_id
    `,
  ]);
}
