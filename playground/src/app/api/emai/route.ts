import { NextRequest, NextResponse } from 'next/server';
import {
  getEmaiInstance,
  isEmaiConnected,
  initializeEmai,
  destroyEmai,
} from '@/lib/emai-instance';
import { eventBus } from '@/lib/event-bus';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string;

    switch (action) {
      case 'status': {
        return NextResponse.json({
          success: true,
          data: {
            connected: isEmaiConnected(),
            hasInstance: getEmaiInstance() !== null,
          },
        });
      }
      case 'connect': {
        await initializeEmai();
        return NextResponse.json({
          success: true,
          data: { connected: true },
        });
      }
      case 'disconnect': {
        await destroyEmai();
        return NextResponse.json({
          success: true,
          data: { connected: false },
        });
      }
      case 'emitEvent': {
        eventBus.emit({
          event: body.eventType as string,
          data: body.data,
          timestamp: Date.now(),
        });
        return NextResponse.json({ success: true, data: { emitted: true } });
      }
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
    return NextResponse.json(
      { success: false, error: message, cause },
      { status: 500 },
    );
  }
}
