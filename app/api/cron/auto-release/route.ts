import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cron job: 4-Hour Auto-Release Safety Net
 *
 * - Finds task_assignments with status='submitted' older than 4 hours
 * - Checks for absence of open disputes via NOT EXISTS subquery
 * - Uses pg_try_advisory_xact_lock to prevent race with late disputes
 * - Releases escrow to worker automatically
 *
 * All time checks use clock_timestamp() (database server time).
 */
export async function POST() {
  const supabase = createServiceClient();
  const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

  try {
    const { data: released, error } = await supabase.rpc('auto_release_escrow');
    if (error) {
      console.error('auto-release error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: noStore },
      );
    }

    return NextResponse.json(
      { auto_released: released ?? 0 },
      { status: 200, headers: noStore },
    );
  } catch (err) {
    console.error('auto-release cron error:', err);
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500, headers: noStore },
    );
  }
}
