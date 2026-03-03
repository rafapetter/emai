import { NextRequest, NextResponse } from 'next/server';
import { readConfig, writeConfig, PlaygroundConfigSchema } from '@/lib/config-store';

export async function GET() {
  try {
    const config = readConfig();
    return NextResponse.json({ success: true, data: config });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const config = PlaygroundConfigSchema.parse(body);
    writeConfig(config);
    return NextResponse.json({ success: true, data: config });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
