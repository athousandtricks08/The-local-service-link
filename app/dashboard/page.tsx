'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  Wrench,
  LogOut,
  MapPin,
  Wallet,
  Clock,
  ArrowRight,
  Loader2,
} from 'lucide-react';

type TaskRow = {
  id: string;
  description: string;
  budget: number;
  status: string;
  neighborhood: string | null;
  district: string | null;
  capacity: number;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'secondary',
  pending_payment: 'warning',
  pending_dispatch: 'warning',
  broadcasting: 'accent',
  assigned: 'primary',
  in_progress: 'primary',
  awaiting_review: 'warning',
  completed: 'success',
  disputed: 'destructive',
  expired_unfilled: 'secondary',
  cancelled: 'secondary',
};

export default function CustomerDashboard() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const supabase = getClient();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [postOpen, setPostOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/');
    if (!loading && user && profile?.role === 'worker') router.push('/tasks');
    if (!loading && user && profile?.role === 'admin') router.push('/admin');
  }, [loading, user, profile, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('tasks')
        .select(
          'id, description, budget, status, neighborhood, district, capacity, created_at',
        )
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });
      if (active && data) setTasks(data);
      setLoadingTasks(false);
    })();
  }, [user, supabase]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold">The Local Service Link</span>
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
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Tasks</h1>
            <p className="mt-1 text-muted-foreground">
              Post tasks, track progress, and manage payments.
            </p>
          </div>
          <Button onClick={() => setPostOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Post Task
          </Button>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
          <TabsContent value="all">
            <TaskList tasks={tasks} loading={loadingTasks} />
          </TabsContent>
          <TabsContent value="active">
            <TaskList
              tasks={tasks.filter((t) =>
                ['pending_payment', 'pending_dispatch', 'broadcasting', 'assigned', 'in_progress', 'awaiting_review'].includes(t.status),
              )}
              loading={loadingTasks}
            />
          </TabsContent>
          <TabsContent value="completed">
            <TaskList
              tasks={tasks.filter((t) =>
                ['completed', 'cancelled', 'expired_unfilled', 'disputed'].includes(t.status),
              )}
              loading={loadingTasks}
            />
          </TabsContent>
        </Tabs>
      </div>

      <PostTaskDialog open={postOpen} onOpenChange={setPostOpen} onCreated={() => {
        if (user) {
          supabase
            .from('tasks')
            .select('id, description, budget, status, neighborhood, district, capacity, created_at')
            .eq('customer_id', user.id)
            .order('created_at', { ascending: false })
            .then(({ data }: { data: TaskRow[] | null }) => data && setTasks(data));
        }
      }} />
    </div>
  );
}

function TaskList({ tasks, loading }: { tasks: TaskRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (tasks.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">No tasks yet.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-4">
      {tasks.map((task) => (
        <Card key={task.id} className="transition-shadow hover:shadow-md">
          <CardContent className="flex items-start justify-between p-5">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_COLORS[task.status] as 'default' | 'secondary' | 'destructive' | 'warning' | 'success' | 'primary' | 'accent' || 'secondary'}>
                  {task.status.replace(/_/g, ' ')}
                </Badge>
                {task.capacity > 1 && (
                  <Badge variant="outline" className="gap-1">
                    <Wallet className="h-3 w-3" /> {task.capacity} workers
                  </Badge>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-sm">{task.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5" /> {task.budget.toLocaleString()} UGX
                </span>
                {task.neighborhood && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {task.neighborhood}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {new Date(task.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PostTaskDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const supabase = getClient();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [district, setDistrict] = useState('');
  const [budget, setBudget] = useState('');
  const [capacity, setCapacity] = useState('1');
  const [timeframe, setTimeframe] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSubmitting(true);

    const budgetNum = Number(budget);
    if (!budgetNum || budgetNum <= 0) {
      setError('Enter a valid budget in UGX');
      setSubmitting(false);
      return;
    }

    const platformFee = Math.round(budgetNum * 0.1);
    const taxFee = Math.round(platformFee * 0.18);
    const total = budgetNum + platformFee + taxFee;

    const skillsArr = skills
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const { error: insertError } = await supabase.from('tasks').insert({
      customer_id: user.id,
      description,
      required_skills: skillsArr,
      neighborhood: neighborhood || null,
      district: district || null,
      budget: budgetNum,
      platform_fee: platformFee,
      tax_fee: taxFee,
      total_amount: total,
      budget_type: 'fixed',
      capacity: Number(capacity) || 1,
      timeframe: timeframe || null,
      status: 'pending_payment',
    });

    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setDescription('');
    setSkills('');
    setNeighborhood('');
    setDistrict('');
    setBudget('');
    setCapacity('1');
    setTimeframe('');
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Post a New Task</DialogTitle>
          <DialogDescription>
            Describe what you need done. Your exact address stays hidden until a worker is assigned.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="desc">Task Description</Label>
            <Textarea
              id="desc"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Fix a leaking kitchen sink and replace the tap"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="skills">Skills (comma-separated)</Label>
              <Input
                id="skills"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="plumbing, repair"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget">Budget (UGX)</Label>
              <Input
                id="budget"
                type="number"
                required
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="50000"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nbrhd">Neighborhood</Label>
              <Input
                id="nbrhd"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Ntinda"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dist">District</Label>
              <Input
                id="dist"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="Kampala"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cap">Workers Needed</Label>
              <Input
                id="cap"
                type="number"
                min="1"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Timeframe</Label>
              <Input
                id="time"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                placeholder="Within 2 days"
              />
            </div>
          </div>
          {budget && Number(budget) > 0 && (
            <div className="rounded-lg bg-muted p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Task budget</span>
                <span>{Number(budget).toLocaleString()} UGX</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform fee (10%)</span>
                <span>{Math.round(Number(budget) * 0.1).toLocaleString()} UGX</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT (18% on fee)</span>
                <span>{Math.round(Number(budget) * 0.1 * 0.18).toLocaleString()} UGX</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
                <span>Total to pay</span>
                <span>
                  {(Number(budget) + Math.round(Number(budget) * 0.1) + Math.round(Number(budget) * 0.1 * 0.18)).toLocaleString()} UGX
                </span>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Post Task
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}