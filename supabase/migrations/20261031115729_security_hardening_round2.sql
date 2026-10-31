/*
# Security Hardening Round 2: trigger function + partition child policies
*/

-- trigger_set_updated_at is an internal trigger function.
-- It must NEVER be callable via REST API by any role.
REVOKE EXECUTE ON FUNCTION public.trigger_set_updated_at() FROM PUBLIC, anon, authenticated;

-- For partition children: add deny-by-default policies.
-- All direct grants are already revoked, so no role can access these
-- tables directly. These policies exist solely to satisfy the linter
-- and provide defense-in-depth: even if a grant is accidentally added,
-- these policies block all direct access. Real access flows through the
-- parent table's policies.

-- chat_messages partitions
CREATE POLICY "chat_messages_partition_deny_all_select"
  ON public.chat_messages_2026_10 FOR SELECT
  TO anon, authenticated USING (false);
CREATE POLICY "chat_messages_partition_deny_all_insert"
  ON public.chat_messages_2026_10 FOR INSERT
  TO anon, authenticated WITH CHECK (false);
CREATE POLICY "chat_messages_partition_deny_all_update"
  ON public.chat_messages_2026_10 FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "chat_messages_partition_deny_all_delete"
  ON public.chat_messages_2026_10 FOR DELETE
  TO anon, authenticated USING (false);

CREATE POLICY "chat_messages_partition_deny_all_select"
  ON public.chat_messages_2026_11 FOR SELECT
  TO anon, authenticated USING (false);
CREATE POLICY "chat_messages_partition_deny_all_insert"
  ON public.chat_messages_2026_11 FOR INSERT
  TO anon, authenticated WITH CHECK (false);
CREATE POLICY "chat_messages_partition_deny_all_update"
  ON public.chat_messages_2026_11 FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "chat_messages_partition_deny_all_delete"
  ON public.chat_messages_2026_11 FOR DELETE
  TO anon, authenticated USING (false);

CREATE POLICY "chat_messages_partition_deny_all_select"
  ON public.chat_messages_2026_12 FOR SELECT
  TO anon, authenticated USING (false);
CREATE POLICY "chat_messages_partition_deny_all_insert"
  ON public.chat_messages_2026_12 FOR INSERT
  TO anon, authenticated WITH CHECK (false);
CREATE POLICY "chat_messages_partition_deny_all_update"
  ON public.chat_messages_2026_12 FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "chat_messages_partition_deny_all_delete"
  ON public.chat_messages_2026_12 FOR DELETE
  TO anon, authenticated USING (false);

-- message_receipts partitions
CREATE POLICY "message_receipts_partition_deny_all_select"
  ON public.message_receipts_2026_10 FOR SELECT
  TO anon, authenticated USING (false);
CREATE POLICY "message_receipts_partition_deny_all_insert"
  ON public.message_receipts_2026_10 FOR INSERT
  TO anon, authenticated WITH CHECK (false);
CREATE POLICY "message_receipts_partition_deny_all_update"
  ON public.message_receipts_2026_10 FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "message_receipts_partition_deny_all_delete"
  ON public.message_receipts_2026_10 FOR DELETE
  TO anon, authenticated USING (false);

CREATE POLICY "message_receipts_partition_deny_all_select"
  ON public.message_receipts_2026_11 FOR SELECT
  TO anon, authenticated USING (false);
CREATE POLICY "message_receipts_partition_deny_all_insert"
  ON public.message_receipts_2026_11 FOR INSERT
  TO anon, authenticated WITH CHECK (false);
CREATE POLICY "message_receipts_partition_deny_all_update"
  ON public.message_receipts_2026_11 FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "message_receipts_partition_deny_all_delete"
  ON public.message_receipts_2026_11 FOR DELETE
  TO anon, authenticated USING (false);

CREATE POLICY "message_receipts_partition_deny_all_select"
  ON public.message_receipts_2026_12 FOR SELECT
  TO anon, authenticated USING (false);
CREATE POLICY "message_receipts_partition_deny_all_insert"
  ON public.message_receipts_2026_12 FOR INSERT
  TO anon, authenticated WITH CHECK (false);
CREATE POLICY "message_receipts_partition_deny_all_update"
  ON public.message_receipts_2026_12 FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "message_receipts_partition_deny_all_delete"
  ON public.message_receipts_2026_12 FOR DELETE
  TO anon, authenticated USING (false);

-- webhook_inbox partitions
CREATE POLICY "webhook_inbox_partition_deny_all_select"
  ON public.webhook_inbox_2026_10 FOR SELECT
  TO anon, authenticated USING (false);
CREATE POLICY "webhook_inbox_partition_deny_all_insert"
  ON public.webhook_inbox_2026_10 FOR INSERT
  TO anon, authenticated WITH CHECK (false);
CREATE POLICY "webhook_inbox_partition_deny_all_update"
  ON public.webhook_inbox_2026_10 FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "webhook_inbox_partition_deny_all_delete"
  ON public.webhook_inbox_2026_10 FOR DELETE
  TO anon, authenticated USING (false);

CREATE POLICY "webhook_inbox_partition_deny_all_select"
  ON public.webhook_inbox_2026_11 FOR SELECT
  TO anon, authenticated USING (false);
CREATE POLICY "webhook_inbox_partition_deny_all_insert"
  ON public.webhook_inbox_2026_11 FOR INSERT
  TO anon, authenticated WITH CHECK (false);
CREATE POLICY "webhook_inbox_partition_deny_all_update"
  ON public.webhook_inbox_2026_11 FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "webhook_inbox_partition_deny_all_delete"
  ON public.webhook_inbox_2026_11 FOR DELETE
  TO anon, authenticated USING (false);

CREATE POLICY "webhook_inbox_partition_deny_all_select"
  ON public.webhook_inbox_2026_12 FOR SELECT
  TO anon, authenticated USING (false);
CREATE POLICY "webhook_inbox_partition_deny_all_insert"
  ON public.webhook_inbox_2026_12 FOR INSERT
  TO anon, authenticated WITH CHECK (false);
CREATE POLICY "webhook_inbox_partition_deny_all_update"
  ON public.webhook_inbox_2026_12 FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "webhook_inbox_partition_deny_all_delete"
  ON public.webhook_inbox_2026_12 FOR DELETE
  TO anon, authenticated USING (false);
