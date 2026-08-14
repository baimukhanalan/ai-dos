import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal/auth";
import { apiError } from "@/lib/errors";
import { recordUsage } from "@/lib/billing/usage";
import { voiceSessionResultSchema } from "@/lib/validation/voice";
import { summarizeVoiceTranscript } from "@/lib/voice/summary";

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = voiceSessionResultSchema.parse(await request.json());
    const sql = db();
    const result = summarizeVoiceTranscript(input.transcript);
    const rows = (await sql`
      WITH previous AS (
        SELECT id, ended_at
        FROM voice_sessions
        WHERE id = ${input.sessionId}
          AND tenant_id = ${user.tenantId}
          AND user_id = ${user.id}
      ), updated AS (
        UPDATE voice_sessions s
        SET status = ${input.status},
            detected_language = ${input.detectedLanguage || null},
            transcript = ${JSON.stringify(input.transcript)}::jsonb,
            latency_ms = ${input.latencyMs ?? null},
            error_code = ${input.errorCode || null},
            summary = ${result.summary},
            next_action = ${result.nextAction},
            ended_at = CASE
              WHEN ${input.status} IN ('completed', 'failed')
              THEN COALESCE(s.ended_at, now())
              ELSE s.ended_at
            END
        FROM previous p
        WHERE s.id = p.id
        RETURNING s.id, s.status, s.latency_ms, s.started_at, s.ended_at
      )
      SELECT u.id, u.status, u.latency_ms, u.started_at, u.ended_at,
        p.ended_at AS previous_ended_at
      FROM updated u JOIN previous p ON p.id = u.id
    `) as Array<{
      id: string;
      status: string;
      latency_ms: number | null;
      started_at: string;
      ended_at: string | null;
      previous_ended_at: string | null;
    }>;

    const session = rows[0];
    // Минуты списываются один раз — когда сессия только что получила ended_at.
    if (session?.ended_at && !session.previous_ended_at) {
      const seconds =
        (new Date(session.ended_at).getTime() -
          new Date(session.started_at).getTime()) /
        1000;
      await recordUsage(
        sql,
        user.tenantId,
        "voice_minutes",
        Math.max(0, Math.ceil(seconds / 60)),
      );
    }

    return NextResponse.json({
      session: session
        ? {
            id: session.id,
            status: session.status,
            latency_ms: session.latency_ms,
          }
        : null,
    });
  } catch (error) {
    return apiError(error);
  }
}
