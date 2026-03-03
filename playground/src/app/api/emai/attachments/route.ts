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
      case 'parse': {
        const email = await emai.emails.get(params.emailId);
        const attachment = email.attachments.find((a) => a.id === params.attachmentId);
        if (!attachment) {
          return NextResponse.json(
            { success: false, error: 'Attachment not found' },
            { status: 404 },
          );
        }
        const content = await emai.attachments.getContent(params.emailId, params.attachmentId);
        data = await emai.attachments.parse(
          { ...attachment, content },
          params.options,
        );
        break;
      }
      case 'toText': {
        const email = await emai.emails.get(params.emailId);
        const attachment = email.attachments.find((a) => a.id === params.attachmentId);
        if (!attachment) {
          return NextResponse.json(
            { success: false, error: 'Attachment not found' },
            { status: 404 },
          );
        }
        const content = await emai.attachments.getContent(params.emailId, params.attachmentId);
        data = { text: await emai.attachments.toText({ ...attachment, content }, params.options) };
        break;
      }
      case 'listFromEmail': {
        const email = await emai.emails.get(params.emailId);
        data = email.attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
        }));
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
