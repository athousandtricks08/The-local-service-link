'use client';

import { getClient } from '@/lib/supabase/client';

type MessageHandler = (messages: unknown[]) => void;

/**
 * Resilient realtime manager for chat messages.
 *
 * - Uses Supabase Realtime WebSocket as primary transport
 * - Falls back to HTTP long-polling (10-second heartbeat) on disconnect
 * - Silently refreshes JWT 5 minutes before expiration to prevent drops
 * - Tracks last received timestamp for long-polling delta sync
 * - Deduplicates messages by ID so WebSocket and polling never produce doubles
 */
export class RealtimeManager {
  private roomId: string;
  private onMessages: MessageHandler;
  private channel: ReturnType<ReturnType<typeof getClient>['channel']> | null = null;
  private polling: boolean = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastTimestamp: string | null = null;
  private jwtRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private seenIds = new Set<string>();

  constructor(roomId: string, onMessages: MessageHandler) {
    this.roomId = roomId;
    this.onMessages = onMessages;
  }

  async start() {
    this.active = true;
    this.setupJwtRefresh();
    await this.connectWebSocket();
  }

  private setupJwtRefresh() {
    const supabase = getClient();
    this.jwtRefreshTimer = setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const expiresAt = data.session.expires_at ?? 0;
      const now = Math.floor(Date.now() / 1000);
      const fiveMin = 300;
      if (expiresAt - now < fiveMin) {
        await supabase.auth.refreshSession();
      }
    }, 60000);
  }

  private async connectWebSocket() {
    const supabase = getClient();
    this.channel = supabase
      .channel(`chat:${this.roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${this.roomId}`,
        },
        (payload: { new: { id: string; created_at: string } }) => {
          this.lastTimestamp = payload.new.created_at;
          this.deliver([payload.new]);
        },
      )
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.startPollingFallback();
        } else if (status === 'SUBSCRIBED') {
          this.stopPollingFallback();
        }
      });
  }

  private startPollingFallback() {
    if (this.polling) return;
    this.polling = true;
    this.pollTimer = setInterval(() => this.poll(), 10000);
  }

  private stopPollingFallback() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.polling = false;
  }

  private async poll() {
    if (!this.active) return;
    const supabase = getClient();
    let query = supabase
      .from('chat_messages')
      .select('id, sender_id, body, message_type, created_at')
      .eq('room_id', this.roomId)
      .order('created_at', { ascending: true })
      .limit(50);

    if (this.lastTimestamp) {
      query = query.gt('created_at', this.lastTimestamp);
    }

    const { data } = await query;
    if (data && data.length > 0) {
      this.lastTimestamp = data[data.length - 1].created_at;
      this.deliver(data);
    }
  }

  private deliver(messages: Record<string, unknown>[]) {
    const fresh = messages.filter((m) => {
      const id = m.id as string;
      if (this.seenIds.has(id)) return false;
      this.seenIds.add(id);
      return true;
    });
    if (fresh.length > 0) {
      this.onMessages(fresh);
    }
  }

  async stop() {
    this.active = false;
    this.stopPollingFallback();
    if (this.jwtRefreshTimer) {
      clearInterval(this.jwtRefreshTimer);
      this.jwtRefreshTimer = null;
    }
    const supabase = getClient();
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.seenIds.clear();
  }
}