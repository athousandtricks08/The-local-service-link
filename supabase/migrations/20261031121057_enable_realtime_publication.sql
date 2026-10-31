/*
# Enable Realtime publication for chat and messaging tables
# Without this, Supabase Realtime WebSocket delivers zero events
# even though the frontend subscribes to postgres_changes.
*/

-- Add tables to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_receipts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_inbox;

-- Also add task_assignments so workers see status changes (assigned -> submitted) live
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_assignments;

-- Also add tasks so dashboard updates when task status changes (broadcasting -> assigned etc)
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
