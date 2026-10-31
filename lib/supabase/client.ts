'use client';

import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createBrowserClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let singleton: any = null;

export function getClient() {
  if (!singleton) singleton = createBrowserClient();
  return singleton;
}