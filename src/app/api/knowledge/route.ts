import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireRoles } from "@/lib/dal/auth";
import { db } from "@/lib/db";
import { apiError } from "@/lib/errors";

const schema = z.object({
  title: z.string().trim().min(3).max(180),
  content: z.string().trim().min(10).max(20000),
  locale: z.enum(["ru", "kk", "en"]).default("ru"),
});
const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

export async function POST(request: Request) {
  try {
    const user = await requireRoles(["clinic_admin"]);
    const input = schema.parse(await request.json());
    const sql = db();
    const articleId = randomUUID();
    const versionId = randomUUID();
    const slug = `${slugify(input.title) || "article"}-${articleId.slice(0, 6)}`;
    await sql.transaction([
      sql`INSERT INTO knowledge_articles (id, tenant_id, title, slug, status, created_by) VALUES (${articleId}, ${user.tenantId}, ${input.title}, ${slug}, 'published', ${user.id})`,
      sql`INSERT INTO knowledge_article_versions (id, tenant_id, article_id, version, content, locale, created_by) VALUES (${versionId}, ${user.tenantId}, ${articleId}, 1, ${input.content}, ${input.locale}, ${user.id})`,
      sql`INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id) VALUES (${user.tenantId}, ${user.id}, 'knowledge.published', 'knowledge_article', ${articleId})`,
    ]);
    return Response.json(
      {
        ok: true,
        data: { id: articleId, title: input.title, slug, status: "published" },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
