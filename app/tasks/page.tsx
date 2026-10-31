'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Wrench,
  LogOut,
  MapPin,
  Wallet,
  Clock,
  CheckCircle2,
  Loader2,
  Search,
  ShieldCheck,
} from 'lucide-react';

type TaskRow = {
  id: string;
  description: string;
  budget: number;
  status: string;
  neighborhood: string | null;
  district: string | null;
  required_skills: string[];
  capacity: number;
  created_at: string;
};

type Assignment = {
  id: string;
  task_id: string;
  status: string;
  pin_code: string;
  tasks: { description: string; budget: number; neighborhood: string | null } | null;
};

type WorkerProfile = {
  id: string;
  verification_status: string;
  reliability_score: number;
  completed_tasks: number;
  skills: string[];
};

export default function WorkerTasks() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const supabase = getClient();
  const [availableTasks, setAvailableTasks] = useState<TaskRow[]>([]);
  const [myAssignments, setMyAssignments] = useState<Assignment[]>([]);
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<{ taskId: string; success: boolean; reason: string } | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!loading && !user) router.push('/');
    if (!loading && user && profile?.role === 'customer') router.push('/dashboard');
    if (!loading && user && profile?.role === 'admin') router.push('/admin');
  }, [loading, user, profile, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const [tasksRes, assignRes, wpRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, description, budget, status, neighborhood, district, required_skills, capacity, created_at')
          .eq('status', 'broadcasting')
          .order('created_at', { ascending: false }),
        supabase
          .from('task_assignments')
          .select('id, task_id, status, pin_code, tasks:description(description, budget, neighborhood)')
          .eq('worker_id', user.id)
          .order('assigned_at', { ascending: false }),
        supabase
          .from('worker_profiles')
          .select('id, verification_status, reliability_score, completed_tasks, skills')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (active) {
        if (tasksRes.data) setAvailableTasks(tasksRes.data);
        if (assignRes.data) setMyAssignments(assignRes.data as unknown as Assignment[]);
        if (wpRes.data) setWorkerProfile(wpRes.data);
        setLoadingData(false);
      }
    })();
  }, [user, supabase]);

  const handleClaim = async (taskId: string) => {
    if (!user) return;
    setClaiming(taskId);
    setClaimResult(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setClaiming(null);
      setClaimResult({ taskId, success: false, reason: 'Not authenticated' });
      return;
    }

    const pinRes = await fetch('/api/tasks/generate-pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ task_id: taskId, worker_id: user.id }),
    });
    const pinJson = await pinRes.json();
    if (!pinRes.ok || !pinJson.pin) {
      setClaiming(null);
      setClaimResult({ taskId, success: false, reason: pinJson.error || 'Could not generate PIN' });
      return;
    }

    const claimRes = await fetch('/api/tasks/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ task_id: taskId, worker_id: user.id, pin: pinJson.pin }),
    });
    const claimJson = await claimRes.json();

    setClaiming(null);

    if (!claimRes.ok) {
      setClaimResult({ taskId, success: false, reason: claimJson.error || 'Claim failed' });
      return;
    }

    const result = claimJson as { success: boolean; reason?: string };
    if (result?.success) {
      setClaimResult({ taskId, success: true, reason: 'Task claimed!' });
      const { data: refreshed } = await supabase
        .from('tasks')
        .select('id, description, budget, status, neighborhood, district, required_skills, capacity, created_at')
        .eq('status', 'broadcasting')
        .order('created_at', { ascending: false });
      if (refreshed) setAvailableTasks(refreshed);

      const { data: assignData } = await supabase
        .from('task_assignments')
        .select('id, task_id, status, pin_code, tasks:description(description, budget, neighborhood)')
        .eq('worker_id', user.id)
        .order('assigned_at', { ascending: false });
      if (assignData) setMyAssignments(assignData as unknown as Assignment[]);
    } else {
      setClaimResult({ taskId, success: false, reason: result?.reason || 'Task no longer available' });
    }
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const filteredTasks = availableTasks.filter(
    (t) =>
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.required_skills.some((s) => s.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold">The Local Service Link</span>
            <Badge variant="secondary" className="ml-1">Worker</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {profile?.full_name}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => signOut().then(() => router.push('/'))}
            >
              <LogOut className="mr-1.5 h-4 w-4" /> Sign Out
            </Button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Worker status card */}
        {workerProfile && (
          <Card className="mb-6">
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Verification</p>
                  <Badge
                    variant={
                      workerProfile.verification_status === 'verified' ? 'success' :
                      workerProfile.verification_status === 'provisional' ? 'warning' :
                      'secondary'
                    }
                  >
                    {workerProfile.verification_status}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reliability Score</p>
                <p className="font-semibold">{workerProfile.reliability_score}/100</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tasks Completed</p>
                <p className="font-semibold">{workerProfile.completed_tasks}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Available Tasks</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Claim tasks near you. First to claim gets the job.
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-48 pl-9 sm:w-64"
            />
          </div>
        </div>

        {claimResult && (
          <div
            className={`mb-4 rounded-lg p-3 text-sm ${
              claimResult.success
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {claimResult.success ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> {claimResult.reason}
              </span>
            ) : (
              claimResult.reason
            )}
          </div>
        )}

        {loadingData ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-muted-foreground">No tasks available right now.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                New tasks are broadcast regularly — check back soon.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredTasks.map((task) => (
              <Card key={task.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{task.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Wallet className="h-3.5 w-3.5" /> {task.budget.toLocaleString()} UGX
                        </span>
                        {task.neighborhood && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> {task.neighborhood}
                          </span>
                        )}
                        {task.capacity > 1 && (
                          <Badge variant="outline" className="text-xs">{task.capacity} spots</Badge>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {new Date(task.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {task.required_skills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {task.required_skills.map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleClaim(task.id)}
                      disabled={claiming === task.id}
                    >
                      {claiming === task.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Claim'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* My Assignments */}
        {myAssignments.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-4 text-xl font-bold">My Assignments</h2>
            <div className="grid gap-4">
              {myAssignments.map((a) => (
                <Card key={a.id}>
                  <CardContent className="flex items-center justify-between p-5">
                    <div>
                      <p className="text-sm font-medium">
                        {a.tasks?.description || 'Task'}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <Badge variant="secondary">{a.status.replace(/_/g, ' ')}</Badge>
                        <span className="flex items-center gap-1">
                          <Wallet className="h-3 w-3" /> {a.tasks?.budget?.toLocaleString()} UGX
                        </span>
                        {a.pin_code && (
                          <span className="font-mono">PIN: {a.pin_code}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/chat/${a.task_id}`)}
                    >
                      Open Chat
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}