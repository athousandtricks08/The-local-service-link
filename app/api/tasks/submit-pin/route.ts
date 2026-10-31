import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Submit a completion PIN to mark a task as awaiting review.
 * Uses service_role to call the SECURITY DEFINER function submit_completion_pin().
 * Validates caller identity.
 */
export async function POST(req: NextRequest) {
  const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

  try {
    const body = await req.json();
    const { task_id, worker_id, pin } = body;

    if (!task_id || !worker_id || !pin) {
      return NextResponse.json({ error: 'missing_params' }, { status: 400, headers: noStore });
    }

    // Verify the caller's JWT matches the worker_id
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
    }

    const supabase = createServiceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !userData.user || userData.user.id !== worker_id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    }

    const { data, error } = await supabase.rpc('submit_completion_pin', {
      p_task_id: task_id,
      p_worker_id: worker_id,
      p_pin: pin,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
    }

    return NextResponse.json(data, { status: 200, headers: noStore });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStore });
  }
}
