'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Wrench,
  LogOut,
  Loader2,
  Users,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Shield,
} from 'lucide-react';

type TaskRow = {
  id: string;
  description: string;
  budget: number;
  status: string;
  neighborhood: string | null;
  created_at: string;
  customer_id: string;
};

type WorkerRow = {
  id: string;
  user_id: string;
  verification_status: string;
  reliability_score: number;
  completed_tasks: number;
  skills: string[];
  profiles: { full_name: string; phone: string } | null;
};

type DisputeRow = {
  id: string;
  task_id: string;
  reason: string;
  status: string;
  step: number;
  created_at: string;
  raised_by: string;
};

export default function AdminDashboard() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const supabase = getClient();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push('/');
    if (!loading && user && profile && profile.role !== 'admin') {
      if (profile.role === 'customer') router.push('/dashboard');
      else router.push('/tasks');
    }
  }, [loading, user, profile, router]);

  useEffect(() => {
    if (!user || profile?.role !== 'admin') return;
    let active = true;
    (async () => {
      const [tRes, wRes, dRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, description, budget, status, neighborhood, created_at, customer_id')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('worker_profiles')
          .select('id, user_id, verification_status, reliability_score, completed_tasks, skills, profiles:profiles!inner(full_name, phone)')
          .order('created_at', { ascending: false }),
        supabase
          .from('disputes')
          .select('id, task_id, reason, status, step, created_at, raised_by')
          .order('created_at', { ascending: false }),
      ]);

      if (active) {
        if (tRes.data) setTasks(tRes.data);
        if (wRes.data) setWorkers(wRes.data as unknown as WorkerRow[]);
        if (dRes.data) setDisputes(dRes.data);
        setLoadingData(false);
      }
    })();
  }, [user, profile, supabase]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeTasks = tasks.filter((t) => ['broadcasting', 'assigned', 'in_progress', 'awaiting_review'].includes(t.status));
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const pendingWorkers = workers.filter((w) => w.verification_status === 'unverified' || w.verification_status === 'provisional');
  const openDisputes = disputes.filter((d) => d.status !== 'resolved' && d.status !== 'auto_closed');

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold">The Local Service Link</span>
            <Badge variant="secondary" className="ml-1">Admin</Badge>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => signOut().then(() => router.push('/'))}
          >
            <LogOut className="mr-1.5 h-4 w-4" /> Sign Out
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Admin Dashboard</h1>

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Briefcase} label="Active Tasks" value={activeTasks.length} color="primary" />
          <StatCard icon={CheckCircle2} label="Completed" value={completedTasks.length} color="success" />
          <StatCard icon={Users} label="Pending Workers" value={pendingWorkers.length} color="warning" />
          <StatCard icon={AlertTriangle} label="Open Disputes" value={openDisputes.length} color="destructive" />
        </div>

        {loadingData ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="tasks" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="workers">Worker Verification</TabsTrigger>
              <TabsTrigger value="disputes">Disputes</TabsTrigger>
            </TabsList>

            <TabsContent value="tasks">
              <Card>
                <CardHeader>
                  <CardTitle>Task Lifecycle</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Budget</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="max-w-xs truncate">{t.description}</TableCell>
                          <TableCell>{t.budget.toLocaleString()} UGX</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{t.status.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                          <TableCell>{t.neighborhood || '—'}</TableCell>
                          <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="workers">
              <Card>
                <CardHeader>
                  <CardTitle>Worker Verification Queue</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Verification</TableHead>
                        <TableHead>Reliability</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>Skills</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workers.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell>{w.profiles?.full_name || '—'}</TableCell>
                          <TableCell>{w.profiles?.phone || '—'}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                w.verification_status === 'verified' ? 'success' :
                                w.verification_status === 'provisional' ? 'warning' :
                                w.verification_status === 'rejected' ? 'destructive' : 'secondary'
                              }
                            >
                              {w.verification_status}
                            </Badge>
                          </TableCell>
                          <TableCell>{w.reliability_score}/100</TableCell>
                          <TableCell>{w.completed_tasks}</TableCell>
                          <TableCell className="max-w-xs">
                            <div className="flex flex-wrap gap-1">
                              {w.skills.length > 0
                                ? w.skills.map((s) => (
                                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                                  ))
                                : '—'}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="disputes">
              <Card>
                <CardHeader>
                  <CardTitle>Dispute Resolution Queue</CardTitle>
                </CardHeader>
                <CardContent>
                  {disputes.length === 0 ? (
                    <p className="py-8 text-center text-muted-foreground">No disputes.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reason</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Step</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {disputes.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="max-w-xs truncate">{d.reason}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  d.status === 'resolved' || d.status === 'auto_closed' ? 'success' :
                                  d.status === 'admin_review' ? 'destructive' : 'warning'
                                }
                              >
                                {d.status.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Step {d.step}/5
                              </span>
                            </TableCell>
                            <TableCell>{new Date(d.created_at).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4" />
          Admin actions are logged. Service role isolation protects all webhook processing.
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: 'primary' | 'success' | 'warning' | 'destructive';
}) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}