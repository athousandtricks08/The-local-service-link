import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cron job: Worker Ghosting Post-Claim Timeout
 *
 * - Finds task_assignments with status='assigned' (no "En Route" or chat)
 *   older than 45 minutes
 * - Atomically unassigns the worker (assignment status → 'abandoned')
 * - Penalizes reliability score by -10 (atomic row-level arithmetic)
 * - Re-broadcasts the task to secondary worker pool
 *
 * All time checks use clock_timestamp() (database server time).
 */
export async function POST() {
  const supabase = createServiceClient();
  const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

  try {
    const { data: unassigned, error } = await supabase.rpc('handle_ghosting_timeout');
    if (error) {
      console.error('ghosting-timeout error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: noStore },
      );
    }

    return NextResponse.json(
      { unassigned: unassigned ?? 0 },
      { status: 200, headers: noStore },
    );
  } catch (err) {
    console.error('ghosting-timeout cron error:', err);
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500, headers: noStore },
    );
  }
}
