import { eventBus } from '@/lib/event-bus';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      const unsubscribe = eventBus.subscribe((payload) => {
        try {
          const data = `data: ${JSON.stringify(payload)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          // stream closed
        }
      });

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
