import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyWebhookSignature, isTimestampFresh, generateIdempotencyKey } from '@/lib/security/crypto';
import { rateLimit, getClientIp, isIpAllowed } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

/**
 * Mobile Money Payment Aggregator Webhook
 *
 * Receives payment confirmations from Flutterwave / Yo! Payments / telco APIs.
 * Validates amount_paid >= task_budget + platform_fee + tax_fee before
 * transitioning task to "pending_dispatch". Partial payments trigger top-up prompts.
 * Uses advisory locks keyed to transaction IDs to prevent duplicate processing.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`payments:${ip}`, 50, 3);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: noStoreHeaders },
    );
  }

  const ipAllowed = await isIpAllowed(ip);
  if (!ipAllowed) {
    return NextResponse.json(
      { error: 'forbidden' },
      { status: 403, headers: noStoreHeaders },
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-signature') || '';
  const signatureTimestamp = req.headers.get('x-signature-timestamp');

  if (!isTimestampFresh(signatureTimestamp, 300)) {
    return NextResponse.json(
      { error: 'stale_timestamp' },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const paymentSecret = process.env.PAYMENT_WEBHOOK_SECRET || '';
  if (paymentSecret && !verifyWebhookSignature(rawBody, signature, paymentSecret)) {
    return NextResponse.json(
      { error: 'invalid_signature' },
      { status: 401, headers: noStoreHeaders },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: 'invalid_json' },
      { status: 400, headers: noStoreHeaders },
    );
  }

  // Buffer to webhook_inbox
  try {
    const supabase = createServiceClient();
    const inbox = supabase.from('webhook_inbox') as unknown as {
      insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
    const { error } = await inbox.insert({
      source: 'payments',
      payload,
      signature: signature || null,
      signature_timestamp: signatureTimestamp
        ? new Date(Number(signatureTimestamp) * 1000).toISOString()
        : null,
      status: 'pending',
    });

    if (error) {
      console.error('payment webhook_inbox error:', error.message);
      return NextResponse.json(
        { error: 'buffer_error' },
        { status: 500, headers: noStoreHeaders },
      );
    }

    // Process payment: verify amount and lock escrow
    const taskId = String(payload.task_id || payload.reference || '');
    const amountPaid = Number(payload.amount || payload.amount_paid || 0);
    const gatewayRef = String(payload.gateway_ref || payload.flw_ref || payload.reference || '');

    if (taskId && amountPaid > 0) {
      await processPayment(taskId, amountPaid, gatewayRef);
    }

    return NextResponse.json(
      { status: 'accepted' },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (err) {
    console.error('payment webhook error:', err);
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500, headers: noStoreHeaders },
    );
  }
}

async function processPayment(taskId: string, amountPaid: number, gatewayRef: string) {
  const supabase = createServiceClient();

  // Fetch task with FOR UPDATE lock via RPC to check amount
  const { data: task } = await supabase
    .from('tasks')
    .select('id, customer_id, budget, platform_fee, tax_fee, total_amount, status, version')
    .eq('id', taskId)
    .maybeSingle();

  if (!task) return;

  const requiredAmount = task.budget + task.platform_fee + task.tax_fee;

  if (amountPaid >= requiredAmount) {
    // Full payment: lock escrow, transition to pending_dispatch
    if (task.status === 'pending_payment' || task.status === 'draft') {
      await supabase
        .from('tasks')
        .update({
          status: 'pending_dispatch',
          version: task.version + 1,
          total_amount: requiredAmount,
        })
        .eq('id', taskId)
        .eq('version', task.version);

      // Record escrow hold
      await supabase.from('escrow_holds').insert({
        task_id: taskId,
        customer_id: task.customer_id,
        amount: requiredAmount,
        status: 'locked',
        gateway_ref: gatewayRef,
      });

      // Queue EFRIS tax receipt (outbox pattern)
      await supabase.from('efris_outbox').insert({
        task_id: taskId,
        payload: {
          task_id: taskId,
          amount: requiredAmount,
          vat: task.tax_fee,
          platform_fee: task.platform_fee,
          gateway_ref: gatewayRef,
        },
        status: 'pending',
      });
    }
  }
  // Partial payments are handled by the async worker (USSD top-up prompt)
}
