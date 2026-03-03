import { NextRequest, NextResponse } from 'next/server';
import { getEmaiInstance } from '@/lib/emai-instance';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const emai = getEmaiInstance();
    if (!emai) {
      return NextResponse.json(
        { success: false, error: 'Not connected. Visit /config first.' },
        { status: 400 },
      );
    }

    const { action, ...params } = body;
    let data: unknown;

    switch (action) {
      case 'get':
        data = await emai.threads.get(params.threadId);
        break;
      case 'detect': {
        const { items } = await emai.emails.list({ limit: params.limit ?? 50 });
        data = emai.threads.detect(items);
        break;
      }
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
