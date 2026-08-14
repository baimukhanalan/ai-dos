import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCampaignOptOutStatus(token: string) {
  if (token.length < 32 || token.length > 200) return { valid: false };
  const sql = db();
  const rows = await sql`
    SELECT c.name
    FROM campaign_opt_out_tokens t
    JOIN campaigns c ON c.id = t.campaign_id AND c.tenant_id = t.tenant_id
    WHERE t.token_hash = ${tokenHash(token)} AND t.used_at IS NULL AND t.expires_at > now()
    LIMIT 1
  `;
  return rows[0] ? { valid: true, campaignName: String(rows[0].name) } : { valid: false };
}

export async function withdrawCampaignConsent(token: string) {
  if (token.length < 32 || token.length > 200) throw new AppError("opt_out_invalid", 400, "Ссылка отказа недействительна или уже использована.");
  const sql = db();
  const result = await sql`
    WITH used_token AS (
      UPDATE campaign_opt_out_tokens SET used_at = now()
      WHERE token_hash = ${tokenHash(token)} AND used_at IS NULL AND expires_at > now()
      RETURNING tenant_id, campaign_id, patient_id
    ), withdrawn AS (
      INSERT INTO patient_consents (id, tenant_id, patient_id, purpose, status, source)
      SELECT ${randomUUID()}, tenant_id, patient_id, 'marketing_campaign', 'withdrawn', 'campaign_opt_out'
      FROM used_token RETURNING patient_id
    ), cancelled_notification AS (
      UPDATE notifications n SET status = 'cancelled'
      FROM campaign_contacts cc, used_token t
      WHERE cc.campaign_id = t.campaign_id AND cc.patient_id = t.patient_id AND cc.tenant_id = t.tenant_id
        AND cc.notification_id = n.id AND n.status IN ('queued', 'failed', 'blocked')
      RETURNING n.id
    ), opted_out_contact AS (
      UPDATE campaign_contacts cc SET status = 'opted_out', updated_at = now()
      FROM used_token t
      WHERE cc.campaign_id = t.campaign_id AND cc.patient_id = t.patient_id AND cc.tenant_id = t.tenant_id
        AND cc.status IN ('queued', 'blocked', 'failed')
      RETURNING cc.id
    )
    INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
    SELECT tenant_id, null, 'campaign.opted_out', 'patient', patient_id,
      jsonb_build_object('campaignId', campaign_id) FROM used_token
    RETURNING id
  `;
  if (!result[0]) throw new AppError("opt_out_invalid", 400, "Ссылка отказа недействительна или уже использована.");
  return { withdrawn: true as const };
}
