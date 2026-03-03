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
      case 'semantic':
        data = await emai.search.semantic(params.query, params.options);
        break;
      case 'fullText':
        data = await emai.search.fullText(params.query, params.options);
        break;
      case 'hybrid':
        data = await emai.search.hybrid(params.query, params.options);
        break;
      case 'index': {
        const { items } = await emai.emails.list({ limit: params.limit ?? 20 });
        try {
          await emai.search.index(items);
          data = { indexed: items.length, method: 'semantic' };
        } catch {
          // Embedding generation failed (no embeddingModel configured).
          // The SDK's index() populates full-text index before attempting vectors,
          // so full-text search still works.
          data = {
            indexed: items.length,
            method: 'fullText',
            note: 'Using full-text search (no embedding model configured).',
          };
        }
        break;
      }
      case 'getIndexedCount':
        data = { count: await emai.search.getIndexedCount() };
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
