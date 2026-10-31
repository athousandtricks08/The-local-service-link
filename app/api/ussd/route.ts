import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp, isIpAllowed } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

/**
 * USSD Gateway webhook (Africa's Talking callback).
 *
 * Supports two modes:
 * 1. Direct-execution payload: *284*44*TASK_ID*PIN#
 *    - Single HTTP request, bypasses 30-second menu timeout
 * 2. Standard menu navigation: session-based
 *
 * Both modes write to webhook_inbox for async processing.
 * USSD session drops trigger "END Session reset." to prevent session cache locks.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`ussd:${ip}`, 30, 2);
  if (!rl.allowed) {
    return new NextResponse('END Rate limited.', {
      status: 429,
      headers: noStoreHeaders,
    });
  }

  const ipAllowed = await isIpAllowed(ip);
  if (!ipAllowed) {
    return new NextResponse('END Forbidden.', {
      status: 403,
      headers: noStoreHeaders,
    });
  }

  let payload: Record<string, unknown>;
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      payload = await req.json();
    } catch {
      return new NextResponse('END Invalid request.', {
        status: 400,
        headers: noStoreHeaders,
      });
    }
  } else {
    const formData = await req.formData();
    payload = Object.fromEntries(formData.entries());
  }

  const text = String(payload.text || payload.INPUT || '');
  const sessionId = String(payload.sessionId || payload.sessionId || '');
  const phoneNumber = String(payload.phoneNumber || payload.MSISDN || '');

  // Direct-execution USSD: *284*44*TASK_ID*PIN#
  // Pattern: *284*44*TASK_ID*PIN#
  const directMatch = text.match(/^\*284\*44\*(\d+)\*(\d{4})#$/);
  if (directMatch) {
    const taskId = directMatch[1];
    const pin = directMatch[2];

    try {
      const supabase = createServiceClient();
      const inbox = supabase.from('webhook_inbox') as unknown as {
        insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
      await inbox.insert({
        source: 'ussd',
        payload: {
          mode: 'direct_completion',
          task_id: taskId,
          pin_code: pin,
          phone: phoneNumber,
          session_id: sessionId,
          created_at: new Date().toISOString(),
        },
        status: 'pending',
      });
    } catch (err) {
      console.error('ussd direct webhook error:', err);
    }

    return new NextResponse('END Completion submitted.', {
      status: 200,
      headers: noStoreHeaders,
    });
  }

  // Session-based: detect session drop / timeout
  const isSessionDrop = text === '' || text.toUpperCase().includes('TIMEOUT');
  if (isSessionDrop) {
    return new NextResponse('END Session reset.', {
      status: 200,
      headers: noStoreHeaders,
    });
  }

  // Standard menu navigation: buffer for async processing
  try {
    const supabase = createServiceClient();
    const inbox = supabase.from('webhook_inbox') as unknown as {
      insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
    await inbox.insert({
      source: 'ussd',
      payload: {
        mode: 'menu',
        text,
        session_id: sessionId,
        phone: phoneNumber,
        service_code: payload.serviceCode || payload.SERVICE_CODE || '',
        operator: payload.operator || payload.OPCO || '',
        created_at: new Date().toISOString(),
      },
      status: 'pending',
    });
  } catch (err) {
    console.error('ussd menu webhook error:', err);
    return new NextResponse('END Service unavailable.', {
      status: 500,
      headers: noStoreHeaders,
    });
  }

  // Respond with initial menu
  const menu = 'CON The Local Service Link\n1. Find tasks\n2. My tasks\n3. Submit completion PIN\n4. Check balance';
  return new NextResponse(menu, {
    status: 200,
    headers: noStoreHeaders,
  });
}
