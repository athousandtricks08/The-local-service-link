/*
# Create Core Platform Schema - MicroGig Uganda

Creates all tables first, then RLS policies. Tables reference each other, so FK targets
must exist before referencing tables, and policies referencing other tables must come
after all tables exist.

## New Tables
profiles, worker_profiles, safety_wallets, tasks, task_attributes, task_assignments,
escrow_holds, payouts, chat_rooms, chat_messages (partitioned), message_receipts (partitioned),
disputes, evidence_files, efris_outbox, outbox_dlq, webhook_inbox (partitioned)

## Security
RLS on all tables, owner-scoped via auth.uid(), admin-scoped via role check.
Service role grants for background workers / API routes.
*/

-- ============ TABLES (all created before policies) ============

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','worker','admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  skills text[] NOT NULL DEFAULT '{}',
  reliability_score int NOT NULL DEFAULT 100 CHECK (reliability_score >= 0 AND reliability_score <= 100),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','provisional','verified','rejected')),
  nin text,
  nin_name text,
  id_image_path text,
  name_match_score numeric(5,2),
  completed_tasks int NOT NULL DEFAULT 0,
  top_rated_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL UNIQUE REFERENCES worker_profiles(id) ON DELETE CASCADE,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  held_amount numeric(12,2) NOT NULL DEFAULT 0,
  negative_ledger numeric(12,2) NOT NULL DEFAULT 0,
  tasks_contributed int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description text NOT NULL,
  required_skills text[] NOT NULL DEFAULT '{}',
  neighborhood text,
  district text,
  lat numeric(10,7),
  lng numeric(10,7),
  exact_address text,
  address_status text NOT NULL DEFAULT 'pending' CHECK (address_status IN ('pending','resolved','failed')),
  budget numeric(12,2) NOT NULL CHECK (budget > 0),
  platform_fee numeric(12,2) NOT NULL DEFAULT 0,
  tax_fee numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  budget_type text NOT NULL DEFAULT 'fixed' CHECK (budget_type IN ('fixed','negotiable')),
  timeframe text,
  capacity int NOT NULL DEFAULT 1 CHECK (capacity > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_payment','pending_dispatch','broadcasting','assigned','in_progress','awaiting_review','completed','disputed','expired_unfilled','cancelled')),
  version int NOT NULL DEFAULT 1,
  state_seq bigserial NOT NULL,
  dispatch_cycle int NOT NULL DEFAULT 0,
  broadcast_at timestamptz,
  assigned_at timestamptz,
  en_route_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attr_key text NOT NULL,
  attr_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, attr_key)
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pin_code char(4) NOT NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','en_route','in_progress','submitted','completed','abandoned')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  en_route_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  auto_release_at timestamptz,
  UNIQUE(task_id, pin_code),
  UNIQUE(task_id, worker_id)
);

CREATE TABLE IF NOT EXISTS escrow_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES task_assignments(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'locked' CHECK (status IN ('locked','released','refunded','partial_refund','split')),
  gateway_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE TABLE IF NOT EXISTS payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  phone text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'payout_pending' CHECK (status IN ('payout_pending','payout_processing','payout_success','payout_failed')),
  retry_count int NOT NULL DEFAULT 0,
  linked_key text,
  gateway_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','photo','video','audio','system','pin_request','flag')),
  media_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS message_receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  reader_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receipt_type text NOT NULL CHECK (receipt_type IN ('delivered','read')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','evidence_phase','admin_review','resolved','auto_closed')),
  step int NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 5),
  resolution text,
  refund_amount numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid REFERENCES disputes(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_type text NOT NULL,
  mime_type text,
  geofence_lat numeric(10,7),
  geofence_lng numeric(10,7),
  geofence_accuracy numeric(8,2),
  client_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS efris_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  retry_count int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL,
  task_id uuid,
  payload jsonb NOT NULL,
  failure_reason text,
  failed_attempts int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_inbox (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('whatsapp','ussd','payments','other')),
  payload jsonb NOT NULL,
  signature text,
  signature_timestamp timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','processed','failed')),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_tasks_customer ON tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_broadcast ON tasks(status, broadcast_at) WHERE status = 'broadcasting';
CREATE INDEX IF NOT EXISTS idx_tasks_skills ON tasks USING gin(required_skills);
CREATE INDEX IF NOT EXISTS idx_task_attributes_task ON task_attributes(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_worker ON task_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_escrow_task ON escrow_holds(task_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_task ON payouts(task_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_task ON chat_rooms(task_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_customer ON chat_rooms(customer_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_worker ON chat_rooms(worker_id);
CREATE INDEX IF NOT EXISTS idx_disputes_task ON disputes(task_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_evidence_dispute ON evidence_files(dispute_id);
CREATE INDEX IF NOT EXISTS idx_evidence_task ON evidence_files(task_id);
CREATE INDEX IF NOT EXISTS idx_efris_status ON efris_outbox(status, next_attempt_at);

-- ============ PARTITIONS (Oct/Nov/Dec 2026) ============
DO $$
DECLARE
  m_start timestamptz;
  m_label text;
BEGIN
  FOR i IN 0..2 LOOP
    m_start := to_timestamp('2026-10-01', 'YYYY-MM-DD') + (i || ' month')::interval;
    m_label := to_char(m_start, 'YYYY_MM');
    EXECUTE format('CREATE TABLE IF NOT EXISTS chat_messages_%s PARTITION OF chat_messages FOR VALUES FROM (%L) TO (%L)', m_label, m_start, m_start + interval '1 month');
    EXECUTE format('CREATE TABLE IF NOT EXISTS message_receipts_%s PARTITION OF message_receipts FOR VALUES FROM (%L) TO (%L)', m_label, m_start, m_start + interval '1 month');
    EXECUTE format('CREATE TABLE IF NOT EXISTS webhook_inbox_%s PARTITION OF webhook_inbox FOR VALUES FROM (%L) TO (%L)', m_label, m_start, m_start + interval '1 month');
  END LOOP;
END $$;

-- ============ RLS ENABLE ============
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE efris_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_dlq ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_inbox ENABLE ROW LEVEL SECURITY;

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON worker_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON worker_profiles TO service_role;
GRANT SELECT ON safety_wallets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON safety_wallets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON task_attributes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON task_attributes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON task_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON task_assignments TO service_role;
GRANT SELECT ON escrow_holds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON escrow_holds TO service_role;
GRANT SELECT ON payouts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payouts TO service_role;
GRANT SELECT, INSERT, UPDATE ON chat_rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_rooms TO service_role;
GRANT SELECT, INSERT ON chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_messages TO service_role;
GRANT SELECT, INSERT ON message_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON message_receipts TO service_role;
GRANT SELECT, INSERT, UPDATE ON disputes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON disputes TO service_role;
GRANT SELECT, INSERT ON evidence_files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON evidence_files TO service_role;
GRANT INSERT ON efris_outbox TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON efris_outbox TO service_role;
GRANT SELECT ON outbox_dlq TO service_role;
GRANT INSERT ON webhook_inbox TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_inbox TO service_role;

-- ============ POLICIES ============

-- profiles
DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON profiles;
CREATE POLICY "profiles_select_self_or_admin" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "profiles_insert_self" ON profiles;
CREATE POLICY "profiles_insert_self" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
CREATE POLICY "profiles_update_self" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- worker_profiles
DROP POLICY IF EXISTS "worker_profiles_select_self_or_admin" ON worker_profiles;
CREATE POLICY "worker_profiles_select_self_or_admin" ON worker_profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "worker_profiles_insert_self" ON worker_profiles;
CREATE POLICY "worker_profiles_insert_self" ON worker_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "worker_profiles_update_self" ON worker_profiles;
CREATE POLICY "worker_profiles_update_self" ON worker_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- safety_wallets
DROP POLICY IF EXISTS "safety_wallets_select_self_or_admin" ON safety_wallets;
CREATE POLICY "safety_wallets_select_self_or_admin" ON safety_wallets FOR SELECT TO authenticated USING (worker_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- tasks
DROP POLICY IF EXISTS "tasks_select_owner_or_worker_or_admin" ON tasks;
CREATE POLICY "tasks_select_owner_or_worker_or_admin" ON tasks FOR SELECT TO authenticated USING (customer_id = auth.uid() OR id IN (SELECT task_id FROM task_assignments WHERE worker_id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "tasks_insert_self" ON tasks;
CREATE POLICY "tasks_insert_self" ON tasks FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
DROP POLICY IF EXISTS "tasks_update_self_or_admin" ON tasks;
CREATE POLICY "tasks_update_self_or_admin" ON tasks FOR UPDATE TO authenticated USING (customer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) WITH CHECK (customer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "tasks_delete_self" ON tasks;
CREATE POLICY "tasks_delete_self" ON tasks FOR DELETE TO authenticated USING (customer_id = auth.uid());

-- task_attributes
DROP POLICY IF EXISTS "task_attributes_select_via_task" ON task_attributes;
CREATE POLICY "task_attributes_select_via_task" ON task_attributes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND (t.customer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))) OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = task_id AND ta.worker_id = auth.uid()));
DROP POLICY IF EXISTS "task_attributes_insert_via_task" ON task_attributes;
CREATE POLICY "task_attributes_insert_via_task" ON task_attributes FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND t.customer_id = auth.uid()));
DROP POLICY IF EXISTS "task_attributes_update_via_task" ON task_attributes;
CREATE POLICY "task_attributes_update_via_task" ON task_attributes FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND t.customer_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND t.customer_id = auth.uid()));
DROP POLICY IF EXISTS "task_attributes_delete_via_task" ON task_attributes;
CREATE POLICY "task_attributes_delete_via_task" ON task_attributes FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND t.customer_id = auth.uid()));

-- task_assignments
DROP POLICY IF EXISTS "task_assignments_select_parties" ON task_assignments;
CREATE POLICY "task_assignments_select_parties" ON task_assignments FOR SELECT TO authenticated USING (worker_id = auth.uid() OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND t.customer_id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "task_assignments_insert_self_worker" ON task_assignments;
CREATE POLICY "task_assignments_insert_self_worker" ON task_assignments FOR INSERT TO authenticated WITH CHECK (worker_id = auth.uid());
DROP POLICY IF EXISTS "task_assignments_update_parties" ON task_assignments;
CREATE POLICY "task_assignments_update_parties" ON task_assignments FOR UPDATE TO authenticated USING (worker_id = auth.uid() OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND t.customer_id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) WITH CHECK (worker_id = auth.uid() OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND t.customer_id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- escrow_holds
DROP POLICY IF EXISTS "escrow_select_parties" ON escrow_holds;
CREATE POLICY "escrow_select_parties" ON escrow_holds FOR SELECT TO authenticated USING (customer_id = auth.uid() OR worker_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- payouts
DROP POLICY IF EXISTS "payouts_select_self_or_admin" ON payouts;
CREATE POLICY "payouts_select_self_or_admin" ON payouts FOR SELECT TO authenticated USING (worker_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- chat_rooms
DROP POLICY IF EXISTS "chat_rooms_select_parties" ON chat_rooms;
CREATE POLICY "chat_rooms_select_parties" ON chat_rooms FOR SELECT TO authenticated USING (customer_id = auth.uid() OR worker_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "chat_rooms_insert_parties" ON chat_rooms;
CREATE POLICY "chat_rooms_insert_parties" ON chat_rooms FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid() OR worker_id = auth.uid());
DROP POLICY IF EXISTS "chat_rooms_update_parties" ON chat_rooms;
CREATE POLICY "chat_rooms_update_parties" ON chat_rooms FOR UPDATE TO authenticated USING (customer_id = auth.uid() OR worker_id = auth.uid()) WITH CHECK (customer_id = auth.uid() OR worker_id = auth.uid());

-- chat_messages
DROP POLICY IF EXISTS "chat_messages_select_room_member" ON chat_messages;
CREATE POLICY "chat_messages_select_room_member" ON chat_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM chat_rooms cr WHERE cr.id = room_id AND (cr.customer_id = auth.uid() OR cr.worker_id = auth.uid())) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "chat_messages_insert_room_member" ON chat_messages;
CREATE POLICY "chat_messages_insert_room_member" ON chat_messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM chat_rooms cr WHERE cr.id = room_id AND (cr.customer_id = auth.uid() OR cr.worker_id = auth.uid())));

-- message_receipts
DROP POLICY IF EXISTS "message_receipts_select_room_member" ON message_receipts;
CREATE POLICY "message_receipts_select_room_member" ON message_receipts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM chat_rooms cr WHERE cr.id = room_id AND (cr.customer_id = auth.uid() OR cr.worker_id = auth.uid())));
DROP POLICY IF EXISTS "message_receipts_insert_room_member" ON message_receipts;
CREATE POLICY "message_receipts_insert_room_member" ON message_receipts FOR INSERT TO authenticated WITH CHECK (reader_id = auth.uid() AND EXISTS (SELECT 1 FROM chat_rooms cr WHERE cr.id = room_id AND (cr.customer_id = auth.uid() OR cr.worker_id = auth.uid())));

-- disputes
DROP POLICY IF EXISTS "disputes_select_parties" ON disputes;
CREATE POLICY "disputes_select_parties" ON disputes FOR SELECT TO authenticated USING (raised_by = auth.uid() OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND t.customer_id = auth.uid()) OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = task_id AND ta.worker_id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "disputes_insert_parties" ON disputes;
CREATE POLICY "disputes_insert_parties" ON disputes FOR INSERT TO authenticated WITH CHECK (raised_by = auth.uid());
DROP POLICY IF EXISTS "disputes_update_admin" ON disputes;
CREATE POLICY "disputes_update_admin" ON disputes FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- evidence_files
DROP POLICY IF EXISTS "evidence_select_parties" ON evidence_files;
CREATE POLICY "evidence_select_parties" ON evidence_files FOR SELECT TO authenticated USING (uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND t.customer_id = auth.uid()) OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = task_id AND ta.worker_id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "evidence_insert_parties" ON evidence_files;
CREATE POLICY "evidence_insert_parties" ON evidence_files FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

-- efris_outbox
DROP POLICY IF EXISTS "efris_insert_self" ON efris_outbox;
CREATE POLICY "efris_insert_self" ON efris_outbox FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND t.customer_id = auth.uid()));

-- webhook_inbox
DROP POLICY IF EXISTS "webhook_inbox_insert_anon" ON webhook_inbox;
CREATE POLICY "webhook_inbox_insert_anon" ON webhook_inbox FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS set_updated_at_profiles ON profiles;
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_worker_profiles ON worker_profiles;
CREATE TRIGGER set_updated_at_worker_profiles BEFORE UPDATE ON worker_profiles FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_tasks ON tasks;
CREATE TRIGGER set_updated_at_tasks BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_payouts ON payouts;
CREATE TRIGGER set_updated_at_payouts BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_disputes ON disputes;
CREATE TRIGGER set_updated_at_disputes BEFORE UPDATE ON disputes FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_efris ON efris_outbox;
CREATE TRIGGER set_updated_at_efris BEFORE UPDATE ON efris_outbox FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============ FUNCTIONS ============
-- claim_task: atomic claim with advisory lock + version check
CREATE OR REPLACE FUNCTION claim_task(p_task_id uuid, p_worker_id uuid, p_pin char(4))
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task tasks%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_task_id::text));
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;
  IF v_task.status NOT IN ('broadcasting','pending_dispatch') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_available', 'state_seq', v_task.state_seq);
  END IF;
  IF (SELECT count(*) FROM task_assignments WHERE task_id = p_task_id AND status IN ('assigned','en_route','in_progress')) >= v_task.capacity THEN
    RETURN jsonb_build_object('success', false, 'reason', 'full', 'state_seq', v_task.state_seq);
  END IF;
  UPDATE tasks
  SET status = 'assigned', version = version + 1, state_seq = state_seq + 1, assigned_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE id = p_task_id AND version = v_task.version AND status IN ('broadcasting','pending_dispatch');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'version_mismatch', 'state_seq', v_task.state_seq);
  END IF;
  INSERT INTO task_assignments (task_id, worker_id, pin_code, status) VALUES (p_task_id, p_worker_id, p_pin, 'assigned');
  RETURN jsonb_build_object('success', true, 'state_seq', v_task.state_seq + 1);
END;
$$;
REVOKE EXECUTE ON FUNCTION claim_task(uuid, uuid, char) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_task(uuid, uuid, char) TO authenticated, service_role;

-- generate_pin: deterministic HMAC-SHA256 PIN with uniqueness fallback
CREATE OR REPLACE FUNCTION generate_pin(p_task_id uuid, p_worker_id uuid)
RETURNS char(4)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pin char(4);
  v_hash text;
  v_salt text := coalesce(current_setting('app.pin_salt', true), 'microgig-default-salt');
  v_modifier int := 0;
BEGIN
  LOOP
    v_hash := encode(hmac(p_worker_id::text || p_task_id::text || v_salt || v_modifier::text, 'sha256'), 'hex');
    v_pin := lpad((('x' || left(v_hash, 16))::bit(64)::bigint % 10000)::text, 4, '0');
    IF NOT EXISTS (SELECT 1 FROM task_assignments WHERE task_id = p_task_id AND pin_code = v_pin) THEN
      RETURN v_pin;
    END IF;
    v_modifier := v_modifier + 1;
    IF v_modifier > 9999 THEN
      v_pin := lpad(floor(random() * 10000)::int::text, 4, '0');
      RETURN v_pin;
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION generate_pin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_pin(uuid, uuid) TO authenticated, service_role;
