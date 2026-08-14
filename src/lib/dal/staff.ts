import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { requireRoles, type AuthenticatedUser } from "@/lib/dal/auth";
import { AppError } from "@/lib/errors";
import type {
  AcceptStaffInvitationInput,
  StaffInvitationInput,
} from "@/lib/validation/staff";

const invitationScope = "staff.invitation.create";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createStaffInvitation(
  input: StaffInvitationInput,
  origin: string,
) {
  const user = await requireRoles(["clinic_admin"]);
  const sql = db();
  const stored = (await sql`
    SELECT response_body FROM idempotency_keys
    WHERE tenant_id = ${user.tenantId} AND scope = ${invitationScope}
      AND key = ${input.idempotencyKey} AND expires_at > now()
  `) as Array<{ response_body: Record<string, unknown> | null }>;
  if (stored[0]?.response_body) return stored[0].response_body;

  const existing = (await sql`
    SELECT
      EXISTS(SELECT 1 FROM users WHERE lower(email) = lower(${input.email})) AS user_exists,
      ${input.doctorId || null}::uuid IS NULL OR EXISTS(
        SELECT 1 FROM doctors d
        WHERE d.id = ${input.doctorId || null}::uuid
          AND d.tenant_id = ${user.tenantId} AND d.active = true
      ) AS doctor_exists,
      ${input.doctorId || null}::uuid IS NOT NULL AND EXISTS(
        SELECT 1 FROM doctor_user_links l
        WHERE l.tenant_id = ${user.tenantId}
          AND l.doctor_id = ${input.doctorId || null}::uuid
      ) AS doctor_linked
  `) as Array<{
    user_exists: boolean;
    doctor_exists: boolean;
    doctor_linked: boolean;
  }>;
  if (existing[0]?.user_exists) {
    throw new AppError("staff_email_exists", 409, "Этот email уже используется.");
  }
  if (!existing[0]?.doctor_exists) {
    throw new AppError("doctor_not_found", 404, "Профиль врача не найден.");
  }
  if (existing[0]?.doctor_linked) {
    throw new AppError(
      "doctor_already_linked",
      409,
      "У этого врача уже есть учётная запись.",
    );
  }

  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const inviteUrl = `${origin.replace(/\/$/, "")}/accept-invite?token=${encodeURIComponent(token)}`;
  const response = {
    id,
    email: input.email,
    role: input.role,
    inviteUrl,
    expiresAt,
  };

  await sql.transaction([
    sql`
      UPDATE staff_invitations SET revoked_at = now()
      WHERE tenant_id = ${user.tenantId} AND lower(email) = lower(${input.email})
        AND accepted_at IS NULL AND revoked_at IS NULL
    `,
    sql`
      INSERT INTO staff_invitations (
        id, tenant_id, email, full_name, role_code, doctor_id,
        token_hash, expires_at, invited_by
      ) VALUES (
        ${id}, ${user.tenantId}, ${input.email}, ${input.fullName}, ${input.role},
        ${input.doctorId || null}, ${tokenHash(token)}, ${expiresAt}, ${user.id}
      )
    `,
    sql`
      INSERT INTO idempotency_keys (
        tenant_id, key, scope, response_status, response_body
      ) VALUES (
        ${user.tenantId}, ${input.idempotencyKey}, ${invitationScope}, 201,
        ${JSON.stringify(response)}::jsonb
      )
    `,
    sql`
      INSERT INTO audit_events (
        tenant_id, actor_user_id, action, resource_type, resource_id, metadata
      ) VALUES (
        ${user.tenantId}, ${user.id}, 'staff.invited', 'staff_invitation', ${id},
        ${JSON.stringify({ email: input.email, role: input.role, doctorId: input.doctorId || null })}::jsonb
      )
    `,
  ]);
  return response;
}

export async function acceptStaffInvitation(
  input: AcceptStaffInvitationInput,
): Promise<AuthenticatedUser> {
  const sql = db();
  const rows = (await sql`
    SELECT i.id, i.tenant_id, i.email, i.full_name, i.role_code, i.doctor_id,
      t.name AS tenant_name, t.slug AS tenant_slug, t.timezone, r.id AS role_id
    FROM staff_invitations i
    JOIN tenants t ON t.id = i.tenant_id AND t.status = 'active'
    JOIN roles r ON r.tenant_id = i.tenant_id AND r.code = i.role_code
    WHERE i.token_hash = ${tokenHash(input.token)}
      AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
    LIMIT 1
  `) as Array<{
    id: string;
    tenant_id: string;
    email: string;
    full_name: string;
    role_code: string;
    doctor_id: string | null;
    tenant_name: string;
    tenant_slug: string;
    timezone: string;
    role_id: string;
  }>;
  const invitation = rows[0];
  if (!invitation) {
    throw new AppError(
      "invitation_invalid",
      410,
      "Ссылка недействительна или срок её действия истёк.",
    );
  }

  const userId = randomUUID();
  const passwordHash = await hash(input.password, 12);
  try {
    await sql.transaction([
      sql`
        UPDATE staff_invitations SET accepted_at = now()
        WHERE id = ${invitation.id} AND accepted_at IS NULL
          AND revoked_at IS NULL AND expires_at > now()
      `,
      sql`
        INSERT INTO users (id, tenant_id, email, password_hash, full_name)
        VALUES (
          ${userId}, ${invitation.tenant_id}, ${invitation.email},
          ${passwordHash}, ${invitation.full_name}
        )
      `,
      sql`
        INSERT INTO user_roles (tenant_id, user_id, role_id)
        VALUES (${invitation.tenant_id}, ${userId}, ${invitation.role_id})
      `,
      ...(invitation.role_code === "doctor" && invitation.doctor_id
        ? [
            sql`
              INSERT INTO doctor_user_links (tenant_id, user_id, doctor_id)
              VALUES (${invitation.tenant_id}, ${userId}, ${invitation.doctor_id})
            `,
          ]
        : []),
      sql`
        INSERT INTO audit_events (
          tenant_id, actor_user_id, action, resource_type, resource_id, metadata
        ) VALUES (
          ${invitation.tenant_id}, ${userId}, 'staff.invitation.accepted',
          'user', ${userId},
          ${JSON.stringify({ invitationId: invitation.id, role: invitation.role_code })}::jsonb
        )
      `,
    ]);
  } catch (error) {
    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") {
      throw new AppError(
        "invitation_conflict",
        409,
        "Приглашение уже использовано или учётная запись существует.",
      );
    }
    throw error;
  }

  return {
    id: userId,
    tenantId: invitation.tenant_id,
    tenantName: invitation.tenant_name,
    tenantSlug: invitation.tenant_slug,
    timezone: invitation.timezone,
    fullName: invitation.full_name,
    email: invitation.email,
    role: invitation.role_code,
  };
}
