'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AuthModal } from '@/components/auth-modal';
import { useAuth } from '@/lib/auth-context';
import {
  Wrench,
  Smartphone,
  ShieldCheck,
  MapPin,
  MessageSquare,
  Clock,
  Wallet,
  Users,
  CheckCircle2,
  ArrowRight,
  Menu,
  X,
} from 'lucide-react';

export default function Home() {
  const [authOpen, setAuthOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, profile, signOut } = useAuth();
  const router = useRouter();

  const goToDashboard = () => {
    if (profile?.role === 'admin') router.push('/admin');
    else if (profile?.role === 'worker') router.push('/tasks');
    else router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">The Local Service Link</span>
            <Badge variant="secondary" className="ml-1 text-xs">Uganda</Badge>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            {user ? (
              <>
                <span className="text-sm text-muted-foreground">
                  {profile?.full_name || user.email}
                </span>
                <Button size="sm" onClick={goToDashboard}>
                  Dashboard
                </Button>
                <Button size="sm" variant="ghost" onClick={signOut}>
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setAuthOpen(true)}>
                  Sign In
                </Button>
                <Button size="sm" onClick={() => setAuthOpen(true)}>
                  Get Started
                </Button>
              </>
            )}
          </div>

          <button
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-border/40 px-4 py-3 md:hidden">
            {user ? (
              <div className="flex flex-col gap-2">
                <Button size="sm" onClick={goToDashboard}>Dashboard</Button>
                <Button size="sm" variant="ghost" onClick={signOut}>Sign Out</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAuthOpen(true)}>Sign In</Button>
                <Button size="sm" onClick={() => setAuthOpen(true)}>Get Started</Button>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="animate-fade-in-up">
              <Badge variant="secondary" className="mb-4 gap-1">
                <MapPin className="h-3 w-3" /> Powered by Mobile Money
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Local skilled workers,<br />
                <span className="text-primary">one tap away.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg text-muted-foreground">
                Post a task, get matched with a verified youth worker near you, and pay
                safely through mobile money escrow. No phone numbers shared, no off-platform leakage.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={() => setAuthOpen(true)} className="gap-2">
                  Post a Task <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => setAuthOpen(true)}>
                  Find Work
                </Button>
              </div>
              <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  Escrow Protected
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  Verified Workers
                </div>
                <div className="flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4 text-accent" />
                  WhatsApp &amp; USSD
                </div>
              </div>
            </div>

            <div className="relative animate-fade-in-up [animation-delay:150ms]">
              <div className="relative overflow-hidden rounded-2xl shadow-2xl">
                <img
                  src="https://images.pexels.com/photos/19982408/pexels-photo-19982408.jpeg?auto=compress&cs=tinysrgb&w=940"
                  alt="Construction worker in Uganda"
                  className="h-[400px] w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/40 to-transparent" />
              </div>
              <Card className="absolute -bottom-6 -left-4 w-64 shadow-xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15">
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Task Completed</p>
                      <p className="text-xs text-muted-foreground">Escrow released to worker</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">How It Works</h2>
          <p className="mt-3 text-muted-foreground">
            A hybrid platform built for Uganda — works on WhatsApp, USSD, and the web.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: MessageSquare,
              title: 'Post via WhatsApp or Web',
              desc: 'Describe your task, set a budget, and pick a neighborhood. Address stays hidden until a worker is assigned.',
            },
            {
              icon: Users,
              title: 'Instant Worker Matching',
              desc: 'Verified youth workers nearby get notified. First to claim gets the job — atomic, race-condition free.',
            },
            {
              icon: Wallet,
              title: 'Mobile Money Escrow',
              desc: 'Funds locked safely in licensed PSP trustee accounts. Released only when work is confirmed.',
            },
            {
              icon: ShieldCheck,
              title: 'PIN-Verified Completion',
              desc: 'Customer gives a 4-digit PIN to the worker. Enter it via web, WhatsApp, or USSD to release payment.',
            },
            {
              icon: Clock,
              title: '4-Hour Auto-Release',
              desc: 'If a customer is unreachable, escrow auto-releases after 4 hours with dispute pre-checks.',
            },
            {
              icon: Smartphone,
              title: 'Works Without Data',
              desc: 'Workers can submit completion via USSD (*284*44*TaskID*PIN#) when out of mobile data bundles.',
            },
          ].map((f, i) => (
            <Card
              key={i}
              className="animate-fade-in-up border-border/60 transition-shadow hover:shadow-lg [animation-delay:${i * 80}ms]"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <CardContent className="p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <f.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-8 py-16 text-center text-primary-foreground">
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/80" />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to get started?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-primary-foreground/80">
              Join hundreds of customers and workers building trust through safe, escrow-protected micro-gigs.
            </p>
            <Button
              size="lg"
              variant="secondary"
              className="mt-8"
              onClick={() => setAuthOpen(true)}
            >
              Create Free Account
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <p>The Local Service Link — Connecting communities through safe, local service.</p>
        </div>
      </footer>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}