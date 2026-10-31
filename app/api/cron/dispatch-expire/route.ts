import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cron job: Dispatch Expiration & Re-broadcast
 *
 * - Finds broadcasting tasks older than 4 hours
 * - Atomically increments dispatch_cycle (up to 3 cycles = 12 hours max)
 * - If cycle < 3, re-broadcasts to secondary worker pool (stays broadcasting)
 * - If cycle >= 3, transitions to expired_unfilled
 *
 * Uses atomic conditional UPDATE to eliminate race conditions.
 * All time checks use clock_timestamp() (database server time).
 */
export async function POST() {
  const supabase = createServiceClient();
  const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

  try {
    // Expire tasks broadcasting for 4+ hours, cycle < 3 → re-broadcast
    const { data: rebroadcast, error: rbError } = await supabase.rpc('expire_and_rebroadcast');
    if (rbError) {
      console.error('dispatch-expire rebroadcast error:', rbError);
    }

    // Expire tasks at cycle 3, still broadcasting 4+ hours → expired_unfilled
    const { data: expired, error: expError } = await supabase.rpc('expire_unfilled_tasks');
    if (expError) {
      console.error('dispatch-expire expire error:', expError);
    }

    return NextResponse.json(
      { rebroadcast: rebroadcast ?? 0, expired: expired ?? 0 },
      { status: 200, headers: noStore },
    );
  } catch (err) {
    console.error('dispatch-expire cron error:', err);
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500, headers: noStore },
    );
  }
}
