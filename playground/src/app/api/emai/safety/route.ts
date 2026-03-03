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
      case 'scan': {
        const email = await emai.emails.get(params.emailId);
        data = emai.safety.scan(email);
        break;
      }
      case 'scanText': {
        // Use checkBeforeSend to scan arbitrary text via SendEmailOptions
        data = await emai.safety.checkBeforeSend({
          to: params.to || 'test@example.com',
          subject: params.subject || 'Test',
          text: params.text,
        });
        break;
      }
      case 'checkBeforeSend': {
        data = await emai.safety.checkBeforeSend({
          to: params.to,
          subject: params.subject,
          text: params.text,
        });
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
