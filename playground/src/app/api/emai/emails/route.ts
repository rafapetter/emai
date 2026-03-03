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
      case 'list':
        data = await emai.emails.list(params.options);
        break;
      case 'get':
        data = await emai.emails.get(params.id);
        break;
      case 'send':
        data = await emai.emails.send(params.options);
        break;
      case 'reply':
        data = await emai.emails.reply(params.emailId, params.options);
        break;
      case 'forward':
        data = await emai.emails.forward(params.emailId, params.options);
        break;
      case 'markAsRead':
        await emai.emails.markAsRead(params.emailId);
        data = { ok: true };
        break;
      case 'markAsUnread':
        await emai.emails.markAsUnread(params.emailId);
        data = { ok: true };
        break;
      case 'star':
        await emai.emails.star(params.emailId);
        data = { ok: true };
        break;
      case 'unstar':
        await emai.emails.unstar(params.emailId);
        data = { ok: true };
        break;
      case 'archive':
        await emai.emails.archive(params.emailId);
        data = { ok: true };
        break;
      case 'delete':
        await emai.emails.delete(params.emailId);
        data = { ok: true };
        break;
      case 'moveToFolder':
        await emai.emails.moveToFolder(params.emailId, params.folder);
        data = { ok: true };
        break;
      case 'createDraft':
        data = await emai.emails.createDraft(params.options);
        break;
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
