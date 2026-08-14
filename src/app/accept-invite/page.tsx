import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { readSession } from "@/lib/session";

export const metadata: Metadata = { title: "Приглашение в клинику" };

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await readSession()) redirect("/portal");
  const { token } = await searchParams;
  return (
    <AuthShell>
      {token ? (
        <AcceptInviteForm token={token} />
      ) : (
        <p className="text-lg text-muted-foreground">
          В ссылке отсутствует токен приглашения.
        </p>
      )}
    </AuthShell>
  );
}
