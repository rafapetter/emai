import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEmaiInstance } from '@/lib/emai-instance';

function buildZodSchema(fields: Array<{ name: string; type: string; optional?: boolean }>): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    let ztype: z.ZodTypeAny;
    switch (field.type) {
      case 'number': ztype = z.number(); break;
      case 'boolean': ztype = z.boolean(); break;
      case 'array': ztype = z.array(z.string()); break;
      default: ztype = z.string(); break;
    }
    shape[field.name] = field.optional ? ztype.optional() : ztype;
  }
  return z.object(shape);
}

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
      case 'classify': {
        const email = await emai.emails.get(params.emailId);
        data = await emai.ai.classify(email);
        break;
      }
      case 'classifyBatch': {
        const { items } = await emai.emails.list({ limit: params.limit ?? 5 });
        const classifications = await emai.ai.classifyBatch(items);
        // Include email metadata so frontend can show which email each result belongs to
        data = classifications.map((c, i) => ({
          email: {
            id: items[i].id,
            subject: items[i].subject,
            from: items[i].from,
            to: items[i].to,
            date: items[i].date,
            body: items[i].body,
            attachments: items[i].attachments?.map((a) => ({ filename: a.filename, size: a.size, contentType: a.contentType })),
            labels: items[i].labels,
            isRead: items[i].isRead,
            isStarred: items[i].isStarred,
          },
          ...JSON.parse(JSON.stringify(c)) as object,
        }));
        break;
      }
      case 'summarize': {
        const email = await emai.emails.get(params.emailId);
        const summaryResult = await emai.ai.summarize(email);
        data = {
          ...JSON.parse(JSON.stringify(summaryResult)) as object,
          email: {
            id: email.id,
            subject: email.subject,
            from: email.from,
            to: email.to,
            date: email.date,
            body: email.body,
            attachments: email.attachments?.map((a) => ({ filename: a.filename, size: a.size, contentType: a.contentType })),
            labels: email.labels,
            isRead: email.isRead,
            isStarred: email.isStarred,
          },
        };
        break;
      }
      case 'summarizeThread': {
        const thread = await emai.threads.get(params.threadId);
        data = await emai.ai.summarizeThread(thread);
        break;
      }
      case 'compose': {
        data = await emai.ai.compose(params.options);
        break;
      }
      case 'reply': {
        const email = await emai.emails.get(params.emailId);
        data = await emai.ai.reply(email, params.options);
        break;
      }
      case 'rewriteInTone': {
        data = { text: await emai.ai.rewriteInTone(params.text, params.tone) };
        break;
      }
      case 'improveWriting': {
        data = { text: await emai.ai.improveWriting(params.text) };
        break;
      }
      case 'extract': {
        const email = await emai.emails.get(params.emailId);
        const schema = buildZodSchema(params.fields);
        data = await emai.ai.extract(email, schema);
        break;
      }
      case 'extractComprehensive': {
        const email = await emai.emails.get(params.emailId);

        // 1. Raw email metadata (always available, no AI needed)
        const rawData: Record<string, unknown> = {
          subject: email.subject,
          from: email.from,
          to: email.to,
          cc: email.cc,
          date: email.date,
          labels: email.labels,
          isRead: email.isRead,
          isStarred: email.isStarred,
          snippet: email.snippet,
          bodyLength: (email.body?.text?.length ?? 0) + (email.body?.html?.length ?? 0),
        };

        // 2. AI-extracted semantic data (may fail — that's OK)
        let aiExtraction: Record<string, unknown> = {};
        if (params.fields?.length) {
          try {
            const schema = buildZodSchema(params.fields);
            const result = await emai.ai.extract(email, schema);
            aiExtraction = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
          } catch (err) {
            aiExtraction = {
              _aiExtractionError: err instanceof Error ? err.message : 'AI extraction failed',
            };
          }
        }

        // 3. Parse all attachments with deep content extraction
        const parsedAttachments: Array<Record<string, unknown>> = [];
        for (const att of email.attachments) {
          try {
            const content = await emai.attachments.getContent(params.emailId, att.id);
            const parsed = await emai.attachments.parse(
              { ...att, content },
              { depth: 'deep', extractTables: true, extractImages: true },
            );
            const serialized = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
            parsedAttachments.push({
              ...serialized,
              filename: att.filename,
              contentType: att.contentType,
              size: att.size,
            });
          } catch (err) {
            parsedAttachments.push({
              filename: att.filename,
              contentType: att.contentType,
              size: att.size,
              error: err instanceof Error ? err.message : 'Failed to parse',
            });
          }
        }

        data = {
          emailData: rawData,
          aiAnalysis: aiExtraction,
          attachmentCount: email.attachments.length,
          attachments: parsedAttachments,
        };
        break;
      }
      case 'prioritize': {
        const email = await emai.emails.get(params.emailId);
        data = await emai.ai.prioritize(email, params.context);
        break;
      }
      case 'prioritizeBatch': {
        const { items } = await emai.emails.list({ limit: params.limit ?? 5 });
        const results = await emai.ai.prioritizeBatch(items, params.context);
        // SDK returns Array<{ email, priority }> — include full email metadata for frontend
        data = Array.isArray(results)
          ? results.map((r: Record<string, unknown>, i: number) => {
              const priority = r.priority && typeof r.priority === 'object'
                ? r.priority as Record<string, unknown> : r;
              const sdkEmail = r.email as Record<string, unknown> | undefined;
              // Use SDK email ref or fall back to items list
              const emailItem = sdkEmail ? items.find((item) => item.id === sdkEmail.id) : items[i];
              return {
                email: emailItem
                  ? {
                      id: emailItem.id,
                      subject: emailItem.subject,
                      from: emailItem.from,
                      to: emailItem.to,
                      date: emailItem.date,
                      body: emailItem.body,
                      attachments: emailItem.attachments?.map((a) => ({ filename: a.filename, size: a.size, contentType: a.contentType })),
                      labels: emailItem.labels,
                      isRead: emailItem.isRead,
                      isStarred: emailItem.isStarred,
                    }
                  : undefined,
                ...(priority as object),
              };
            })
          : results;
        break;
      }
      case 'detectActions': {
        const email = await emai.emails.get(params.emailId);
        const actionsResult = await emai.ai.detectActions(email);
        data = {
          ...JSON.parse(JSON.stringify(actionsResult)) as object,
          email: {
            id: email.id,
            subject: email.subject,
            from: email.from,
            to: email.to,
            date: email.date,
            body: email.body,
            attachments: email.attachments?.map((a) => ({ filename: a.filename, size: a.size, contentType: a.contentType })),
            labels: email.labels,
            isRead: email.isRead,
            isStarred: email.isStarred,
          },
        };
        break;
      }
      case 'detectActionsInThread': {
        const thread = await emai.threads.get(params.threadId);
        data = await emai.ai.detectActionsInThread(thread);
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
