import { requireUser } from "@/lib/dal/auth";
import { apiError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 35;

export async function GET() {
  try {
    const user = await requireUser();
    const encoder = new TextEncoder();
    let count = 0;

    const stream = new ReadableStream({
      start(controller) {
        const send = () => {
          count += 1;
          controller.enqueue(
            encoder.encode(
              `event: heartbeat\ndata: ${JSON.stringify({
                tenantId: user.tenantId,
                at: new Date().toISOString(),
              })}\n\n`,
            ),
          );
          if (count >= 6) {
            clearInterval(interval);
            controller.close();
          }
        };

        send();
        const interval = setInterval(send, 5_000);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
