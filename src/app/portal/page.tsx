import type { Metadata } from "next";
import { ConversationWorkspace } from "@/components/portal/conversation-workspace";
import { getPortalOverview } from "@/lib/dal/portal";

export const metadata: Metadata = { title: "Разговоры" };
export const dynamic = "force-dynamic";

export default async function PortalPage() {
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
