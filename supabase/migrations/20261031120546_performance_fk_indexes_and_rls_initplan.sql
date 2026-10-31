/*
# Performance: FK indexes + auth.uid() init plan optimization
*/

-- =====================================================
-- 1. Index unindexed foreign keys
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON public.chat_messages (room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON public.chat_messages (sender_id);

CREATE INDEX IF NOT EXISTS idx_disputes_raised_by ON public.disputes (raised_by);

CREATE INDEX IF NOT EXISTS idx_efris_outbox_task_id ON public.efris_outbox (task_id);

CREATE INDEX IF NOT EXISTS idx_escrow_holds_assignment_id ON public.escrow_holds (assignment_id);
CREATE INDEX IF NOT EXISTS idx_escrow_holds_customer_id ON public.escrow_holds (customer_id);
CREATE INDEX IF NOT EXISTS idx_escrow_holds_worker_id ON public.escrow_holds (worker_id);

CREATE INDEX IF NOT EXISTS idx_evidence_files_uploaded_by ON public.evidence_files (uploaded_by);

CREATE INDEX IF NOT EXISTS idx_message_receipts_room_id ON public.message_receipts (room_id);
CREATE INDEX IF NOT EXISTS idx_message_receipts_reader_id ON public.message_receipts (reader_id);

CREATE INDEX IF NOT EXISTS idx_payouts_worker_id ON public.payouts (worker_id);

-- =====================================================
-- 2. Wrap auth.uid() in (select ...) for init plan optimization
--    This makes Postgres evaluate auth.uid() once per query instead
--    of re-evaluating it for every row scanned.
-- =====================================================

-- profiles
DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (((select auth.uid()) = id) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

-- worker_profiles
DROP POLICY IF EXISTS "worker_profiles_select_self_or_admin" ON public.worker_profiles;
CREATE POLICY "worker_profiles_select_self_or_admin" ON public.worker_profiles
  FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

DROP POLICY IF EXISTS "worker_profiles_insert_self" ON public.worker_profiles;
CREATE POLICY "worker_profiles_insert_self" ON public.worker_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "worker_profiles_update_self" ON public.worker_profiles;
CREATE POLICY "worker_profiles_update_self" ON public.worker_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- safety_wallets
DROP POLICY IF EXISTS "safety_wallets_select_self_or_admin" ON public.safety_wallets;
CREATE POLICY "safety_wallets_select_self_or_admin" ON public.safety_wallets
  FOR SELECT TO authenticated
  USING ((worker_id IN (SELECT worker_profiles.id FROM worker_profiles WHERE worker_profiles.user_id = (select auth.uid()))) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

-- tasks
DROP POLICY IF EXISTS "tasks_select_owner_or_worker_or_admin" ON public.tasks;
CREATE POLICY "tasks_select_owner_or_worker_or_admin" ON public.tasks
  FOR SELECT TO authenticated
  USING ((customer_id = (select auth.uid())) OR (id IN (SELECT task_assignments.task_id FROM task_assignments WHERE task_assignments.worker_id = (select auth.uid()))) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

DROP POLICY IF EXISTS "tasks_insert_self" ON public.tasks;
CREATE POLICY "tasks_insert_self" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = (select auth.uid()));

DROP POLICY IF EXISTS "tasks_update_self_or_admin" ON public.tasks;
CREATE POLICY "tasks_update_self_or_admin" ON public.tasks
  FOR UPDATE TO authenticated
  USING ((customer_id = (select auth.uid())) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')))
  WITH CHECK ((customer_id = (select auth.uid())) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

DROP POLICY IF EXISTS "tasks_delete_self" ON public.tasks;
CREATE POLICY "tasks_delete_self" ON public.tasks
  FOR DELETE TO authenticated
  USING (customer_id = (select auth.uid()));

-- task_attributes
DROP POLICY IF EXISTS "task_attributes_select_via_task" ON public.task_attributes;
CREATE POLICY "task_attributes_select_via_task" ON public.task_attributes
  FOR SELECT TO authenticated
  USING ((EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_attributes.task_id AND (t.customer_id = (select auth.uid()) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'))))) OR (EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = task_attributes.task_id AND ta.worker_id = (select auth.uid()))));

DROP POLICY IF EXISTS "task_attributes_insert_via_task" ON public.task_attributes;
CREATE POLICY "task_attributes_insert_via_task" ON public.task_attributes
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_attributes.task_id AND t.customer_id = (select auth.uid())));

DROP POLICY IF EXISTS "task_attributes_update_via_task" ON public.task_attributes;
CREATE POLICY "task_attributes_update_via_task" ON public.task_attributes
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_attributes.task_id AND t.customer_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_attributes.task_id AND t.customer_id = (select auth.uid())));

DROP POLICY IF EXISTS "task_attributes_delete_via_task" ON public.task_attributes;
CREATE POLICY "task_attributes_delete_via_task" ON public.task_attributes
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_attributes.task_id AND t.customer_id = (select auth.uid())));

-- task_assignments
DROP POLICY IF EXISTS "task_assignments_select_parties" ON public.task_assignments;
CREATE POLICY "task_assignments_select_parties" ON public.task_assignments
  FOR SELECT TO authenticated
  USING ((worker_id = (select auth.uid())) OR (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_assignments.task_id AND t.customer_id = (select auth.uid()))) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

DROP POLICY IF EXISTS "task_assignments_insert_self_worker" ON public.task_assignments;
CREATE POLICY "task_assignments_insert_self_worker" ON public.task_assignments
  FOR INSERT TO authenticated
  WITH CHECK (worker_id = (select auth.uid()));

DROP POLICY IF EXISTS "task_assignments_update_parties" ON public.task_assignments;
CREATE POLICY "task_assignments_update_parties" ON public.task_assignments
  FOR UPDATE TO authenticated
  USING ((worker_id = (select auth.uid())) OR (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_assignments.task_id AND t.customer_id = (select auth.uid()))) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')))
  WITH CHECK ((worker_id = (select auth.uid())) OR (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_assignments.task_id AND t.customer_id = (select auth.uid()))) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

-- disputes
DROP POLICY IF EXISTS "disputes_insert_parties" ON public.disputes;
CREATE POLICY "disputes_insert_parties" ON public.disputes
  FOR INSERT TO authenticated
  WITH CHECK (raised_by = (select auth.uid()));

DROP POLICY IF EXISTS "disputes_select_parties" ON public.disputes;
CREATE POLICY "disputes_select_parties" ON public.disputes
  FOR SELECT TO authenticated
  USING ((raised_by = (select auth.uid())) OR (EXISTS (SELECT 1 FROM tasks t WHERE t.id = disputes.task_id AND t.customer_id = (select auth.uid()))) OR (EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = disputes.task_id AND ta.worker_id = (select auth.uid()))) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

DROP POLICY IF EXISTS "disputes_update_admin" ON public.disputes;
CREATE POLICY "disputes_update_admin" ON public.disputes
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));

-- escrow_holds
DROP POLICY IF EXISTS "escrow_select_parties" ON public.escrow_holds;
CREATE POLICY "escrow_select_parties" ON public.escrow_holds
  FOR SELECT TO authenticated
  USING ((customer_id = (select auth.uid())) OR (worker_id = (select auth.uid())) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

-- payouts
DROP POLICY IF EXISTS "payouts_select_self_or_admin" ON public.payouts;
CREATE POLICY "payouts_select_self_or_admin" ON public.payouts
  FOR SELECT TO authenticated
  USING ((worker_id = (select auth.uid())) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

-- chat_rooms
DROP POLICY IF EXISTS "chat_rooms_select_parties" ON public.chat_rooms;
CREATE POLICY "chat_rooms_select_parties" ON public.chat_rooms
  FOR SELECT TO authenticated
  USING ((customer_id = (select auth.uid())) OR (worker_id = (select auth.uid())) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

DROP POLICY IF EXISTS "chat_rooms_insert_parties" ON public.chat_rooms;
CREATE POLICY "chat_rooms_insert_parties" ON public.chat_rooms
  FOR INSERT TO authenticated
  WITH CHECK ((customer_id = (select auth.uid())) OR (worker_id = (select auth.uid())));

DROP POLICY IF EXISTS "chat_rooms_update_parties" ON public.chat_rooms;
CREATE POLICY "chat_rooms_update_parties" ON public.chat_rooms
  FOR UPDATE TO authenticated
  USING ((customer_id = (select auth.uid())) OR (worker_id = (select auth.uid())))
  WITH CHECK ((customer_id = (select auth.uid())) OR (worker_id = (select auth.uid())));

-- chat_messages
DROP POLICY IF EXISTS "chat_messages_select_room_member" ON public.chat_messages;
CREATE POLICY "chat_messages_select_room_member" ON public.chat_messages
  FOR SELECT TO authenticated
  USING ((EXISTS (SELECT 1 FROM chat_rooms cr WHERE cr.id = chat_messages.room_id AND (cr.customer_id = (select auth.uid()) OR cr.worker_id = (select auth.uid())))) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

DROP POLICY IF EXISTS "chat_messages_insert_room_member" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_room_member" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK ((sender_id = (select auth.uid())) AND (EXISTS (SELECT 1 FROM chat_rooms cr WHERE cr.id = chat_messages.room_id AND (cr.customer_id = (select auth.uid()) OR cr.worker_id = (select auth.uid())))));

-- message_receipts
DROP POLICY IF EXISTS "message_receipts_select_room_member" ON public.message_receipts;
CREATE POLICY "message_receipts_select_room_member" ON public.message_receipts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_rooms cr WHERE cr.id = message_receipts.room_id AND (cr.customer_id = (select auth.uid()) OR cr.worker_id = (select auth.uid()))));

DROP POLICY IF EXISTS "message_receipts_insert_room_member" ON public.message_receipts;
CREATE POLICY "message_receipts_insert_room_member" ON public.message_receipts
  FOR INSERT TO authenticated
  WITH CHECK ((reader_id = (select auth.uid())) AND (EXISTS (SELECT 1 FROM chat_rooms cr WHERE cr.id = message_receipts.room_id AND (cr.customer_id = (select auth.uid()) OR cr.worker_id = (select auth.uid())))));

-- evidence_files
DROP POLICY IF EXISTS "evidence_select_parties" ON public.evidence_files;
CREATE POLICY "evidence_select_parties" ON public.evidence_files
  FOR SELECT TO authenticated
  USING ((uploaded_by = (select auth.uid())) OR (EXISTS (SELECT 1 FROM tasks t WHERE t.id = evidence_files.task_id AND t.customer_id = (select auth.uid()))) OR (EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = evidence_files.task_id AND ta.worker_id = (select auth.uid()))) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')));

DROP POLICY IF EXISTS "evidence_insert_parties" ON public.evidence_files;
CREATE POLICY "evidence_insert_parties" ON public.evidence_files
  FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = (select auth.uid()));

-- efris_outbox
DROP POLICY IF EXISTS "efris_insert_self" ON public.efris_outbox;
CREATE POLICY "efris_insert_self" ON public.efris_outbox
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM tasks t WHERE t.id = efris_outbox.task_id AND t.customer_id = (select auth.uid())));

-- outbox_dlq
DROP POLICY IF EXISTS "outbox_dlq_select_admin" ON public.outbox_dlq;
CREATE POLICY "outbox_dlq_select_admin" ON public.outbox_dlq
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));
