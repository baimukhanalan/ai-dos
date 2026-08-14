import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { hash, compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { readSession } from "@/lib/session";
import type { LoginInput, RegisterInput } from "@/lib/validation/auth";

const DUMMY_PASSWORD_HASH =
  "$2b$12$A1ZnnVkq2t3Y4SXEh.gHauKneokG9atdTQT7vdOqlPDsRj5UQSejW";

export type AuthenticatedUser = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  timezone: string;
  fullName: string;
  email: string;
  role: string;
};

export type PlatformAdmin = {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  role: "super_admin";
};

function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);

  return slug || "clinic";
}

function dateParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value || 0);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

function localDateAt(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const shown = dateParts(new Date(utcGuess), timezone);
  const shownAsUtc = Date.UTC(
    shown.year,
    shown.month - 1,
    shown.day,
    shown.hour,
    shown.minute,
    shown.second,
  );
  return new Date(utcGuess - (shownAsUtc - utcGuess));
}

function nextBusinessDayAt(hour: number, minute: number) {
  const timezone = "Asia/Almaty";
  const today = dateParts(new Date(), timezone);
  const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day));
  do {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  } while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);

  return localDateAt(
    cursor.getUTCFullYear(),
    cursor.getUTCMonth() + 1,
    cursor.getUTCDate(),
    hour,
    minute,
    timezone,
  );
}

export async function registerTenant(input: RegisterInput) {
  const sql = db();
  const tenantId = randomUUID();
  const clinicId = randomUUID();
  const branchId = randomUUID();
  const roleId = randomUUID();
  const operatorRoleId = randomUUID();
  const doctorRoleId = randomUUID();
  const userId = randomUUID();
  const specialtyId = randomUUID();
  const specialtyTwoId = randomUUID();
  const doctorId = randomUUID();
  const doctorTwoId = randomUUID();
  const serviceId = randomUUID();
  const serviceTwoId = randomUUID();
  const patientId = randomUUID();
  const conversationId = randomUUID();
  const appointmentId = randomUUID();
  const slug = `${slugify(input.clinicName)}-${tenantId.slice(0, 6)}`;
  const passwordHash = await hash(input.password, 12);
  const appointmentStart = nextBusinessDayAt(10, 30);
  const appointmentEnd = new Date(appointmentStart.getTime() + 30 * 60_000);

  try {
    await sql.transaction([
      sql`INSERT INTO tenants (id, name, slug) VALUES (${tenantId}, ${input.clinicName}, ${slug})`,
      sql`INSERT INTO clinics (id, tenant_id, name, email) VALUES (${clinicId}, ${tenantId}, ${input.clinicName}, ${input.email})`,
      sql`INSERT INTO branches (id, tenant_id, clinic_id, name, address) VALUES (${branchId}, ${tenantId}, ${clinicId}, 'Главный филиал', 'Укажите адрес в настройках')`,
      sql`INSERT INTO roles (id, tenant_id, code, name, system) VALUES (${roleId}, ${tenantId}, 'clinic_admin', 'Администратор клиники', true), (${operatorRoleId}, ${tenantId}, 'operator', 'Регистратор', true), (${doctorRoleId}, ${tenantId}, 'doctor', 'Врач', true)`,
      sql`INSERT INTO role_permissions (role_id, permission_id) SELECT ${operatorRoleId}, id FROM permissions WHERE code = ANY(ARRAY['patients.read','patients.write','schedule.read','appointments.write','conversations.read','conversations.write']::text[])`,
      sql`INSERT INTO role_permissions (role_id, permission_id) SELECT ${doctorRoleId}, id FROM permissions WHERE code = ANY(ARRAY['schedule.read','appointments.write']::text[])`,
      sql`INSERT INTO users (id, tenant_id, email, password_hash, full_name) VALUES (${userId}, ${tenantId}, ${input.email}, ${passwordHash}, ${input.fullName})`,
      sql`INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES (${tenantId}, ${userId}, ${roleId})`,
      sql`INSERT INTO specialties (id, tenant_id, name, code) VALUES (${specialtyId}, ${tenantId}, 'Терапия', 'therapy'), (${specialtyTwoId}, ${tenantId}, 'Кардиология', 'cardiology')`,
      sql`INSERT INTO doctors (id, tenant_id, branch_id, specialty_id, full_name, display_name, languages, room) VALUES (${doctorId}, ${tenantId}, ${branchId}, ${specialtyId}, 'Ольга Викторовна Белова', 'Ольга Белова', ARRAY['ru','kk']::text[], '204'), (${doctorTwoId}, ${tenantId}, ${branchId}, ${specialtyTwoId}, 'Асель Ерлановна Садыкова', 'Асель Садыкова', ARRAY['kk','ru','en']::text[], '312')`,
      sql`INSERT INTO services (id, tenant_id, specialty_id, name, description, duration_minutes, price_kzt) VALUES (${serviceId}, ${tenantId}, ${specialtyId}, 'Первичный приём терапевта', 'Консультация и план дальнейших действий', 30, 12000), (${serviceTwoId}, ${tenantId}, ${specialtyTwoId}, 'Консультация кардиолога', 'Первичная консультация специалиста', 40, 18000)`,
      sql`INSERT INTO schedule_rules (tenant_id, doctor_id, weekday, starts_at, ends_at, slot_minutes) SELECT ${tenantId}, ${doctorId}, day, '09:00'::time, '18:00'::time, 30 FROM generate_series(1,5) day`,
      sql`INSERT INTO schedule_rules (tenant_id, doctor_id, weekday, starts_at, ends_at, slot_minutes) SELECT ${tenantId}, ${doctorTwoId}, day, '10:00'::time, '17:00'::time, 40 FROM generate_series(1,5) day`,
      sql`INSERT INTO patients (id, tenant_id, full_name, phone, birth_date, preferred_language, notes) VALUES (${patientId}, ${tenantId}, 'Айдана Ахметова · sandbox', '+7 700 000 00 00', '1992-04-18', 'ru', 'Демонстрационная запись — замените реальными данными после настройки.')`,
      sql`INSERT INTO conversations (id, tenant_id, patient_id, channel, status, language, subject) VALUES (${conversationId}, ${tenantId}, ${patientId}, 'phone', 'open', 'ru', 'Запись к терапевту · sandbox')`,
      sql`INSERT INTO messages (tenant_id, conversation_id, sender_type, content) VALUES (${tenantId}, ${conversationId}, 'patient', 'Здравствуйте, хочу записаться к терапевту на ближайшее время.'), (${tenantId}, ${conversationId}, 'assistant', 'Здравствуйте! Подберу свободное время. Подскажите, утро или вторая половина дня удобнее?'), (${tenantId}, ${conversationId}, 'patient', 'Лучше после 10:00.')`,
      sql`INSERT INTO appointments (id, tenant_id, patient_id, doctor_id, service_id, branch_id, starts_at, ends_at, status, source, reason, created_by) VALUES (${appointmentId}, ${tenantId}, ${patientId}, ${doctorId}, ${serviceId}, ${branchId}, ${appointmentStart.toISOString()}, ${appointmentEnd.toISOString()}, 'confirmed', 'portal', 'Демонстрационная запись', ${userId})`,
      sql`INSERT INTO appointment_history (tenant_id, appointment_id, to_status, changed_by, reason) VALUES (${tenantId}, ${appointmentId}, 'confirmed', ${userId}, 'Стартовый sandbox-сценарий')`,
      sql`INSERT INTO integrations (tenant_id, provider, mode, status, config) VALUES (${tenantId}, 'damumed', 'disabled', 'pending', ${JSON.stringify({ reason: "official_api_pending" })}::jsonb), (${tenantId}, 'web_chat', 'sandbox', 'connected', '{}'::jsonb)`,
      sql`INSERT INTO subscriptions (tenant_id, plan, status, current_period_end) VALUES (${tenantId}, 'pilot', 'trial', now() + interval '30 days')`,
      sql`INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES (${tenantId}, ${userId}, 'tenant.created', 'tenant', ${tenantId}, ${JSON.stringify({ source: "self_registration", sandboxSeeded: true })}::jsonb)`,
    ]);
  } catch (error) {
    const databaseError = error as { code?: string; message?: string };
    if (
      databaseError.code === "23505" ||
      databaseError.message?.includes("users_email_lower_unique")
    ) {
      throw new AppError(
        "email_already_registered",
        409,
        "Этот email уже зарегистрирован.",
      );
    }
    throw error;
  }

  return {
    id: userId,
    tenantId,
    tenantName: input.clinicName,
    tenantSlug: slug,
    timezone: "Asia/Almaty",
    fullName: input.fullName,
    email: input.email,
    role: "clinic_admin",
  } satisfies AuthenticatedUser;
}

export async function enforceRegistrationRateLimit(source: string) {
  const sql = db();
  const identifier = `register:${createHash("sha256").update(source).digest("hex")}`;
  const rows = (await sql`
    INSERT INTO auth_rate_limits (
      identifier, attempts, window_started_at, blocked_until, updated_at
    ) VALUES (${identifier}, 1, now(), null, now())
    ON CONFLICT (identifier) DO UPDATE SET
      attempts = CASE
        WHEN auth_rate_limits.window_started_at < now() - interval '1 hour' THEN 1
        ELSE auth_rate_limits.attempts + 1
      END,
      window_started_at = CASE
        WHEN auth_rate_limits.window_started_at < now() - interval '1 hour' THEN now()
        ELSE auth_rate_limits.window_started_at
      END,
      blocked_until = CASE
        WHEN auth_rate_limits.blocked_until > now() THEN auth_rate_limits.blocked_until
        WHEN auth_rate_limits.window_started_at < now() - interval '1 hour' THEN null
        WHEN auth_rate_limits.attempts + 1 > 5 THEN now() + interval '1 hour'
        ELSE null
      END,
      updated_at = now()
    RETURNING blocked_until
  `) as Array<{ blocked_until: Date | string | null }>;

  if (rows[0]?.blocked_until) {
    throw new AppError(
      "registration_rate_limited",
      429,
      "Слишком много регистраций. Повторите через час.",
    );
  }
}

export async function authenticate(input: LoginInput) {
  const sql = db();
  const identifier = `login:${createHash("sha256")
    .update(input.email.toLowerCase())
    .digest("hex")}`;
  const rateLimit = (await sql`
    SELECT blocked_until
    FROM auth_rate_limits
    WHERE identifier = ${identifier}
      AND blocked_until > now()
    LIMIT 1
  `) as Array<{ blocked_until: Date | string }>;
  if (rateLimit[0]) {
    throw new AppError(
      "too_many_login_attempts",
      429,
      "Слишком много попыток. Повторите через 15 минут.",
    );
  }

  const rows = (await sql`
    SELECT
      u.id,
      u.tenant_id,
      u.email,
      u.password_hash,
      u.full_name,
      t.name AS tenant_name,
      t.slug AS tenant_slug,
      t.timezone,
      COALESCE(r.code, 'operator') AS role
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id AND t.status = 'active'
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE lower(u.email) = lower(${input.email}) AND u.status = 'active'
    ORDER BY CASE WHEN r.code = 'clinic_admin' THEN 0 ELSE 1 END
    LIMIT 1
  `) as Array<{
    id: string;
    tenant_id: string;
    email: string;
    password_hash: string;
    full_name: string;
    tenant_name: string;
    tenant_slug: string;
    timezone: string;
    role: string;
  }>;

  const user = rows[0];
  const passwordMatches = await compare(
    input.password,
    user?.password_hash || DUMMY_PASSWORD_HASH,
  );
  if (!user || !passwordMatches) {
    await sql`
      INSERT INTO auth_rate_limits (
        identifier, attempts, window_started_at, blocked_until, updated_at
      ) VALUES (${identifier}, 1, now(), null, now())
      ON CONFLICT (identifier) DO UPDATE SET
        attempts = CASE
          WHEN auth_rate_limits.window_started_at < now() - interval '15 minutes' THEN 1
          ELSE auth_rate_limits.attempts + 1
        END,
        window_started_at = CASE
          WHEN auth_rate_limits.window_started_at < now() - interval '15 minutes' THEN now()
          ELSE auth_rate_limits.window_started_at
        END,
        blocked_until = CASE
          WHEN (
            CASE
              WHEN auth_rate_limits.window_started_at < now() - interval '15 minutes' THEN 1
              ELSE auth_rate_limits.attempts + 1
            END
          ) >= 8 THEN now() + interval '15 minutes'
          ELSE null
        END,
        updated_at = now()
    `;
    throw new AppError(
      "invalid_credentials",
      401,
      "Неверный email или пароль.",
    );
  }

  await sql.transaction([
    sql`DELETE FROM auth_rate_limits WHERE identifier = ${identifier}`,
    sql`UPDATE users SET last_login_at = now() WHERE id = ${user.id} AND tenant_id = ${user.tenant_id}`,
    sql`INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id) VALUES (${user.tenant_id}, ${user.id}, 'auth.login', 'user', ${user.id})`,
  ]);

  return {
    id: user.id,
    tenantId: user.tenant_id,
    tenantName: user.tenant_name,
    tenantSlug: user.tenant_slug,
    timezone: user.timezone,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
  } satisfies AuthenticatedUser;
}

export async function authenticatePlatform(
  input: LoginInput,
  context: { ipHash?: string | null; requestId?: string | null } = {},
) {
  const sql = db();
  const emailHash = createHash("sha256")
    .update(input.email.toLowerCase())
    .digest("hex");
  const identifier = `platform-login:${emailHash}`;
  const rateLimit = (await sql`
    SELECT blocked_until FROM auth_rate_limits
    WHERE identifier = ${identifier} AND blocked_until > now()
    LIMIT 1
  `) as Array<{ blocked_until: Date | string }>;
  if (rateLimit[0]) {
    throw new AppError(
      "too_many_login_attempts",
      429,
      "Слишком много попыток. Повторите через 15 минут.",
    );
  }

  const rows = (await sql`
    SELECT u.id, u.tenant_id, u.email, u.password_hash, u.full_name
    FROM platform_admins pa
    JOIN users u ON u.id = pa.user_id AND u.status = 'active'
    JOIN tenants t ON t.id = u.tenant_id AND t.status = 'active'
    WHERE lower(u.email) = lower(${input.email}) AND pa.active = true
    LIMIT 1
  `) as Array<{
    id: string;
    tenant_id: string;
    email: string;
    password_hash: string;
    full_name: string;
  }>;
  const admin = rows[0];
  const passwordMatches = await compare(
    input.password,
    admin?.password_hash || DUMMY_PASSWORD_HASH,
  );

  if (!admin || !passwordMatches) {
    await sql.transaction([
      sql`
        INSERT INTO auth_rate_limits (
          identifier, attempts, window_started_at, blocked_until, updated_at
        ) VALUES (${identifier}, 1, now(), null, now())
        ON CONFLICT (identifier) DO UPDATE SET
          attempts = CASE
            WHEN auth_rate_limits.window_started_at < now() - interval '15 minutes' THEN 1
            ELSE auth_rate_limits.attempts + 1
          END,
          window_started_at = CASE
            WHEN auth_rate_limits.window_started_at < now() - interval '15 minutes' THEN now()
            ELSE auth_rate_limits.window_started_at
          END,
          blocked_until = CASE
            WHEN auth_rate_limits.attempts + 1 >= 6 THEN now() + interval '15 minutes'
            ELSE null
          END,
          updated_at = now()
      `,
      sql`
        INSERT INTO platform_audit_events (
          action, resource_type, resource_id, result, ip_hash, request_id
        ) VALUES (
          'platform.auth.login', 'platform_admin', ${emailHash}, 'failed',
          ${context.ipHash || null}, ${context.requestId || null}
        )
      `,
    ]);
    throw new AppError(
      "invalid_credentials",
      401,
      "Неверный email или пароль.",
    );
  }

  await sql.transaction([
    sql`DELETE FROM auth_rate_limits WHERE identifier = ${identifier}`,
    sql`UPDATE users SET last_login_at = now() WHERE id = ${admin.id}`,
    sql`
      INSERT INTO platform_audit_events (
        actor_user_id, action, resource_type, resource_id, ip_hash, request_id
      ) VALUES (
        ${admin.id}, 'platform.auth.login', 'platform_admin', ${admin.id},
        ${context.ipHash || null}, ${context.requestId || null}
      )
    `,
  ]);

  return {
    id: admin.id,
    tenantId: admin.tenant_id,
    fullName: admin.full_name,
    email: admin.email,
    role: "super_admin",
  } satisfies PlatformAdmin;
}

export async function requireUser() {
  const session = await readSession();
  if (!session) throw new AppError("unauthorized", 401, "Войдите в портал.");
  if (session.scope === "platform") {
    throw new AppError("unauthorized", 401, "Используйте портал платформы.");
  }

  const sql = db();
  const rows = (await sql`
    SELECT u.id, u.tenant_id, u.full_name, u.email, t.name AS tenant_name,
      t.slug AS tenant_slug, t.timezone, COALESCE(r.code, 'operator') AS role
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id AND t.status = 'active'
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE u.id = ${session.userId} AND u.tenant_id = ${session.tenantId} AND u.status = 'active'
    ORDER BY CASE WHEN r.code = 'clinic_admin' THEN 0 ELSE 1 END
    LIMIT 1
  `) as Array<{
    id: string;
    tenant_id: string;
    full_name: string;
    email: string;
    tenant_name: string;
    tenant_slug: string;
    timezone: string;
    role: string;
  }>;

  const user = rows[0];
  if (!user) throw new AppError("unauthorized", 401, "Сессия недействительна.");

  return {
    id: user.id,
    tenantId: user.tenant_id,
    tenantName: user.tenant_name,
    tenantSlug: user.tenant_slug,
    timezone: user.timezone,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
  } satisfies AuthenticatedUser;
}

export async function requirePlatformAdmin() {
  const session = await readSession();
  if (!session || session.scope !== "platform" || session.role !== "super_admin") {
    throw new AppError("unauthorized", 401, "Войдите в управление платформой.");
  }
  const sql = db();
  const rows = (await sql`
    SELECT u.id, u.tenant_id, u.full_name, u.email
    FROM platform_admins pa
    JOIN users u ON u.id = pa.user_id AND u.status = 'active'
    JOIN tenants t ON t.id = u.tenant_id AND t.status = 'active'
    WHERE pa.user_id = ${session.userId} AND pa.active = true
    LIMIT 1
  `) as Array<{
    id: string;
    tenant_id: string;
    full_name: string;
    email: string;
  }>;
  const admin = rows[0];
  if (!admin) {
    throw new AppError("unauthorized", 401, "Сессия платформы недействительна.");
  }
  return {
    id: admin.id,
    tenantId: admin.tenant_id,
    fullName: admin.full_name,
    email: admin.email,
    role: "super_admin",
  } satisfies PlatformAdmin;
}

export async function requirePlatformPage() {
  try {
    return await requirePlatformAdmin();
  } catch {
    redirect("/platform/login");
  }
}

export async function requireRoles(allowed: string[]) {
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
    throw new AppError(
      "forbidden",
      403,
      "Недостаточно прав для этого действия.",
    );
  }
  return user;
}

export async function requirePageUser() {
  try {
    return await requireUser();
  } catch {
    redirect("/login");
  }
}

export async function requirePageRoles(allowed: string[]) {
  const user = await requirePageUser();
  if (!allowed.includes(user.role)) {
    redirect(user.role === "doctor" ? "/portal/doctor" : "/portal");
  }
  return user;
}
