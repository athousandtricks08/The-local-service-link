import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Generate a deterministic 4-digit PIN for a worker claiming a task.
 * Uses service_role to call the SECURITY DEFINER function generate_pin().
 * Validates that the caller is the authenticated user matching p_worker_id.
 */
export async function POST(req: NextRequest) {
  const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

  try {
    const body = await req.json();
    const { task_id, worker_id } = body;

    if (!task_id || !worker_id) {
      return NextResponse.json({ error: 'missing_params' }, { status: 400, headers: noStore });
    }

    // Verify the caller's JWT matches the worker_id they're claiming for
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
    }

    const supabase = createServiceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !userData.user || userData.user.id !== worker_id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    }

    const { data, error } = await supabase.rpc('generate_pin', {
      p_task_id: task_id,
      p_worker_id: worker_id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
    }

    return NextResponse.json({ pin: data }, { status: 200, headers: noStore });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStore });
  }
}
