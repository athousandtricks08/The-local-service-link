'use client';

import { useEffect, useState, useRef, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getClient } from '@/lib/supabase/client';
import { RealtimeManager } from '@/lib/realtime/realtime-manager';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Wrench,
  LogOut,
  Send,
  ArrowLeft,
  Loader2,
  Shield,
  KeyRound,
  Camera,
} from 'lucide-react';

type ChatMessage = {
  id: string;
  sender_id: string;
  body: string | null;
  message_type: string;
  created_at: string;
};

type ChatRoom = {
  id: string;
  task_id: string;
  customer_id: string;
  worker_id: string | null;
};

export default function ChatPage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const params = useParams();
  const taskId = params.taskId as string;
  const supabase = getClient();
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinRequesting, setPinRequesting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [loading, user, router]);

  // Load or create chat room
  useEffect(() => {
    if (!user || !taskId) return;
    let active = true;
    (async () => {
      // Find existing room
      const { data: existing } = await supabase
        .from('chat_rooms')
        .select('id, task_id, customer_id, worker_id')
        .eq('task_id', taskId)
        .maybeSingle();

      if (existing && active) {
        setRoom(existing);
        setLoadingRoom(false);
        return;
      }

      // Create room if user is the customer or assigned worker
      if (!active) return;
      const { data: task } = await supabase
        .from('tasks')
        .select('customer_id')
        .eq('id', taskId)
        .maybeSingle();

      if (!task || !active) {
        setLoadingRoom(false);
        return;
      }

      const workerId = user.id === task.customer_id ? null : user.id;
      const { data: newRoom } = await supabase
        .from('chat_rooms')
        .insert({ task_id: taskId, customer_id: task.customer_id, worker_id: workerId })
        .select('id, task_id, customer_id, worker_id')
        .single();

      if (newRoom && active) {
        setRoom(newRoom);
        setLoadingRoom(false);
      }
    })();
  }, [user, taskId, supabase]);

  // Load initial messages + start resilient realtime manager
  useEffect(() => {
    if (!room) return;
    let active = true;
    let manager: RealtimeManager | null = null;

    (async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('id, sender_id, body, message_type, created_at')
        .eq('room_id', room.id)
        .order('created_at', { ascending: true })
        .limit(100);
      if (active && data) setMessages(data);

      if (!active) return;
      manager = new RealtimeManager(room.id, (newMsgs) => {
        setMessages((prev) => [...prev, ...(newMsgs as ChatMessage[])]);
      });
      await manager.start();
    })();

    return () => {
      active = false;
      if (manager) manager.stop();
    };
  }, [room, supabase]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !room || !user) return;
    setSending(true);
    setInput('');

    const { error } = await supabase.from('chat_messages').insert({
      room_id: room.id,
      sender_id: user.id,
      body: input.trim(),
      message_type: 'text',
    });

    setSending(false);
    if (error) setError(error.message);
  };

  const handlePinRequest = async () => {
    if (!room || !user) return;
    setPinRequesting(true);
    const { error } = await supabase.from('chat_messages').insert({
      room_id: room.id,
      sender_id: user.id,
      body: 'PIN requested — photo proof submitted. Please provide the 4-digit PIN.',
      message_type: 'pin_request',
    });
    setPinRequesting(false);
    if (error) setError(error.message);
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gradient-to-b from-primary/5 to-background">
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button size="icon" variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wrench className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Task Chat</p>
                <p className="text-xs text-muted-foreground">Masked &amp; private</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Shield className="h-3 w-3" /> No phone numbers shared
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => signOut().then(() => router.push('/'))}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {loadingRoom ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !room ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Could not open chat for this task.
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden px-4 py-4">
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-border/40 bg-card p-4"
          >
            {messages.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No messages yet. Say hello and coordinate the task.
              </p>
            )}
            {messages.map((msg) => {
              const isMine = msg.sender_id === user.id;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                      msg.message_type === 'system'
                        ? 'bg-muted text-muted-foreground'
                        : msg.message_type === 'pin_request'
                        ? 'bg-warning/15 text-warning-foreground border border-warning/30'
                        : isMine
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {msg.body}
                    <span className="mt-1 block text-[10px] opacity-60">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <p className="mt-2 text-sm text-destructive">{error}</p>
          )}

          {/* Worker actions */}
          {profile?.role === 'worker' && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handlePinRequest}
                disabled={pinRequesting}
                className="gap-1.5"
              >
                <Camera className="h-4 w-4" />
                {pinRequesting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Request PIN / Flag Scope
              </Button>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSend} className="mt-3 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={sending}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={sending || !input.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}