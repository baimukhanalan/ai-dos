import type { Metadata } from "next";
import { ConversationWorkspace } from "@/components/portal/conversation-workspace";
import { getPortalOverview } from "@/lib/dal/portal";
import { requirePageUser } from "@/lib/dal/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Разговоры" };
export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const user = await requirePageUser();
  if (user.role === "doctor") redirect("/portal/doctor");
  const data = await getPortalOverview();
  return (
    <ConversationWorkspace
      conversations={data.conversations}
      messages={data.messages}
      appointments={data.appointments}
      doctors={data.doctors}
      timezone={data.user.timezone}
    />
  );
}
