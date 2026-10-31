import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyWebhookSignature, isTimestampFresh } from '@/lib/security/crypto';
import { rateLimit, getClientIp, isIpAllowed } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const noStoreHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };

  // 1. Rate-limit: token-bucket to prevent telco callback storms
  const ip = getClientIp(req);
  const rl = rateLimit(`whatsapp:${ip}`, 40, 2);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: noStoreHeaders },
    );
  }

  // 2. IP allowlisting (dual-verification part 1)
  const ipAllowed = await isIpAllowed(ip);
  if (!ipAllowed) {
    return NextResponse.json(
      { error: 'forbidden' },
      { status: 403, headers: noStoreHeaders },
    );
  }

  // 3. Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get('x-signature') || '';
  const signatureTimestamp = req.headers.get('x-signature-timestamp');

  // 4. Timestamp freshness (5-minute replay window, evaluated against server time)
  if (!isTimestampFresh(signatureTimestamp, 300)) {
    return NextResponse.json(
      { error: 'stale_timestamp' },
      { status: 401, headers: noStoreHeaders },
    );
  }

  // 5. Signature verification (dual-verification part 2)
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET || '';
  if (webhookSecret && !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json(
      { error: 'invalid_signature' },
      { status: 401, headers: noStoreHeaders },
    );
  }

  // 6. Parse payload
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: 'invalid_json' },
      { status: 400, headers: noStoreHeaders },
    );
  }

  // 7. Write to async webhook_inbox buffer and return 200 OK immediately
  //    (avoids Vercel serverless timeout)
  try {
    const supabase = createServiceClient();
    const inbox = supabase.from('webhook_inbox') as unknown as {
      insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
    const { error } = await inbox.insert({
      source: 'whatsapp',
      payload,
      signature: signature || null,
      signature_timestamp: signatureTimestamp
        ? new Date(Number(signatureTimestamp) * 1000).toISOString()
        : null,
      status: 'pending',
    });

    if (error) {
      console.error('webhook_inbox insert error:', error.message);
      return NextResponse.json(
        { error: 'buffer_error' },
        { status: 500, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      { status: 'accepted' },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (err) {
    console.error('whatsapp webhook error:', err);
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500, headers: noStoreHeaders },
    );
  }
}

export async function GET(req: NextRequest) {
  // WhatsApp webhook verification (Meta-style hub.challenge)
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}
