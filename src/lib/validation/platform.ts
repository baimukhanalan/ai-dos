import { z } from "zod";

export const platformTenantStatusSchema = z.object({
  status: z.enum(["active", "suspended", "archived"]),
});

export type PlatformTenantStatusInput = z.infer<
  typeof platformTenantStatusSchema
>;
