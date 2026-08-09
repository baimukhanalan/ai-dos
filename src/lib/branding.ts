import "server-only";

import type { CSSProperties } from "react";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { brandingSchema, type BrandingInput } from "@/lib/validation/billing";

export const brandingSettingsKey = "branding";

export type Branding = BrandingInput;

export const defaultBranding: Branding = {
  displayName: null,
  primaryColor: null,
  accentColor: null,
  logoUrl: null,
  supportPhone: null,
  supportEmail: null,
  locale: "ru",
};

/**
 * Настройки бренда приходят из БД и попадают в разметку портала, поэтому
 * повреждённое или устаревшее значение молча заменяется дефолтом, а не ломает
 * страницу.
 */
export function parseBranding(value: unknown): Branding {
  const parsed = brandingSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : defaultBranding;
}

export async function getTenantBranding(
  sql: NeonQueryFunction<false, false>,
  tenantId: string,
): Promise<Branding> {
  const rows = (await sql`
    SELECT value FROM tenant_settings
    WHERE tenant_id = ${tenantId} AND key = ${brandingSettingsKey}
    LIMIT 1
  `) as Array<{ value: unknown }>;
  return parseBranding(rows[0]?.value);
}

/** CSS-переменные портала переопределяются только валидированным hex. */
export function brandingStyle(branding: Branding): CSSProperties {
  const style: Record<`--${string}`, string> = {};
  if (branding.primaryColor) {
    style["--primary"] = branding.primaryColor;
    style["--sidebar-primary"] = branding.primaryColor;
    style["--ring"] = branding.primaryColor;
  }
  if (branding.accentColor) {
    style["--accent"] = branding.accentColor;
    style["--secondary"] = branding.accentColor;
  }
  return style;
}
