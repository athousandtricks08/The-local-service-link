'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getClient } from '@/lib/supabase/client';

type Profile = {
  id: string;
  phone: string;
  full_name: string;
  role: 'customer' | 'worker' | 'admin';
  status: 'active' | 'suspended' | 'banned';
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone: string,
    role: 'customer' | 'worker',
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, newSession: Session | null) => {
      (async () => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (!newSession) {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let active = true;
    (async () => {
      const { data }: { data: Profile | null } = await supabase
        .select('id, phone, full_name, role, status')
        .eq('id', user.id)
        .maybeSingle();
      if (active && data) setProfile(data);
    })();
    return () => {
      active = false;
    };
  }, [user, supabase]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    phone: string,
    role: 'customer' | 'worker',
  ) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Sign-up failed.' };

    // Insert profile
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      phone,
      full_name: fullName,
      role,
    });
    if (profileError) return { error: profileError.message };

    // If worker, create worker_profile + safety_wallet
    if (role === 'worker') {
      const { data: wp } = await supabase
        .from('worker_profiles')
        .insert({ user_id: data.user.id, skills: [] })
        .select('id')
        .single();
      if (wp) {
        await supabase.from('safety_wallets').insert({ worker_id: wp.id });
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}