import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { Database } from './types';

export async function createServerClient() {
  const cookieStore = cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const token = cookieStore.get('sb-access-token')?.value;

  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  const client = createSupabaseClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  if (token) {
    await client.auth.setSession({
      access_token: token,
      refresh_token: token,
    });
  }

  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createServiceClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
