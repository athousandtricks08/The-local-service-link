/*
# Security Hardening: RLS on partitions, search_path, SECURITY DEFINER exposure, outbox_dlq
*/

-- =====================================================
-- 1. Enable RLS on all partition child tables
-- =====================================================
-- Per-partition RLS must be enabled individually; the parent's RLS
-- does not cascade. We also revoke all grants on partitions so that
-- access flows exclusively through the parent table + its policies.

ALTER TABLE public.chat_messages_2026_10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages_2026_11 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages_2026_12 ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.message_receipts_2026_10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts_2026_11 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts_2026_12 ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.webhook_inbox_2026_10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_inbox_2026_11 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_inbox_2026_12 ENABLE ROW LEVEL SECURITY;

-- Revoke direct grants on partition children (access goes through parent)
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.chat_messages_2026_10 FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.chat_messages_2026_11 FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.chat_messages_2026_12 FROM anon, authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.message_receipts_2026_10 FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.message_receipts_2026_11 FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.message_receipts_2026_12 FROM anon, authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.webhook_inbox_2026_10 FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.webhook_inbox_2026_11 FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.webhook_inbox_2026_12 FROM anon, authenticated;

-- =====================================================
-- 2. Fix mutable search_path on all SECURITY DEFINER functions
-- =====================================================
-- Each function is recreated with an explicit search_path = public
-- to prevent search_path hijacking attacks.

-- trigger_set_updated_at
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

-- claim_task
CREATE OR REPLACE FUNCTION public.claim_task(
  p_task_id uuid,
  p_worker_id uuid,
  p_pin char(4)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_assignment task_assignments%ROWTYPE;
  v_capacity int;
  v_current_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_task_id::text));

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'task_not_found');
  END IF;

  IF v_task.status != 'broadcasting' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_available');
  END IF;

  SELECT count(*) INTO v_current_count
  FROM task_assignments
  WHERE task_id = p_task_id AND status NOT IN ('abandoned', 'completed');

  IF v_current_count >= v_task.capacity THEN
    RETURN jsonb_build_object('success', false, 'reason', 'capacity_full');
  END IF;

  SELECT * INTO v_assignment
  FROM task_assignments
  WHERE task_id = p_task_id AND worker_id = p_worker_id AND pin_code = p_pin
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_pin');
  END IF;

  UPDATE task_assignments
  SET status = 'assigned', assigned_at = clock_timestamp()
  WHERE id = v_assignment.id;

  v_capacity := v_task.capacity;
  IF v_current_count + 1 >= v_capacity THEN
    UPDATE tasks
    SET status = 'assigned', assigned_at = clock_timestamp(),
        state_seq = state_seq + 1, updated_at = clock_timestamp()
    WHERE id = p_task_id;
  ELSE
    UPDATE tasks
    SET state_seq = state_seq + 1, updated_at = clock_timestamp()
    WHERE id = p_task_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'assignment_id', v_assignment.id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_task(uuid, uuid, char) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_task(uuid, uuid, char) TO authenticated, service_role;

-- generate_pin
CREATE OR REPLACE FUNCTION public.generate_pin(
  p_task_id uuid,
  p_worker_id uuid
)
RETURNS char(4)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin char(4);
  v_seed text;
  v_hash text;
  v_task tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_seed := p_task_id::text || p_worker_id::text || v_task.state_seq::text || v_task.version::text;
  v_hash := encode(digest(v_seed, 'sha256'), 'hex');
  v_pin := substring(v_hash from 1 for 4);

  INSERT INTO task_assignments (task_id, worker_id, pin_code, status)
  VALUES (p_task_id, p_worker_id, v_pin, 'pending_claim')
  ON CONFLICT (task_id, worker_id) WHERE pin_code IS NOT NULL
  DO UPDATE SET pin_code = EXCLUDED.pin_code, status = 'pending_claim';

  RETURN v_pin;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_pin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_pin(uuid, uuid) TO authenticated, service_role;

-- expire_and_rebroadcast
CREATE OR REPLACE FUNCTION public.expire_and_rebroadcast()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH updated AS (
    UPDATE tasks
    SET dispatch_cycle = dispatch_cycle + 1,
        broadcast_at = clock_timestamp(),
        state_seq = state_seq + 1,
        updated_at = clock_timestamp()
    WHERE status = 'broadcasting'
      AND broadcast_at < clock_timestamp() - interval '4 hours'
      AND dispatch_cycle < 3
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.expire_and_rebroadcast() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_and_rebroadcast() TO service_role;

-- expire_unfilled_tasks
CREATE OR REPLACE FUNCTION public.expire_unfilled_tasks()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH updated AS (
    UPDATE tasks
    SET status = 'expired_unfilled',
        state_seq = state_seq + 1,
        updated_at = clock_timestamp()
    WHERE status = 'broadcasting'
      AND broadcast_at < clock_timestamp() - interval '4 hours'
      AND dispatch_cycle >= 3
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.expire_unfilled_tasks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unfilled_tasks() TO service_role;

-- auto_release_escrow
CREATE OR REPLACE FUNCTION public.auto_release_escrow()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_assignment uuid;
  v_task uuid;
  v_worker uuid;
BEGIN
  v_count := 0;
  FOR v_assignment, v_task, v_worker IN
    SELECT a.id, a.task_id, a.worker_id
    FROM task_assignments a
    WHERE a.status = 'submitted'
      AND a.submitted_at < clock_timestamp() - interval '4 hours'
      AND NOT EXISTS (
        SELECT 1 FROM disputes d
        WHERE d.task_id = a.task_id
          AND d.status IN ('open', 'evidence_phase', 'admin_review')
      )
  LOOP
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtext(v_task::text));
      IF EXISTS (
        SELECT 1 FROM disputes d
        WHERE d.task_id = v_task
          AND d.status IN ('open', 'evidence_phase', 'admin_review')
      ) THEN
        CONTINUE;
      END IF;
      UPDATE escrow_holds
      SET status = 'released', released_at = clock_timestamp()
      WHERE task_id = v_task
        AND (assignment_id = v_assignment OR assignment_id IS NULL)
        AND status = 'locked';
      UPDATE task_assignments
      SET status = 'completed', completed_at = clock_timestamp(), auto_release_at = clock_timestamp()
      WHERE id = v_assignment;
      IF NOT EXISTS (
        SELECT 1 FROM task_assignments
        WHERE task_id = v_task AND status NOT IN ('completed', 'abandoned')
      ) THEN
        UPDATE tasks
        SET status = 'completed', completed_at = clock_timestamp(),
            state_seq = state_seq + 1, updated_at = clock_timestamp()
        WHERE id = v_task AND status != 'completed';
      END IF;
      v_count := v_count + 1;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.auto_release_escrow() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_release_escrow() TO service_role;

-- handle_ghosting_timeout
CREATE OR REPLACE FUNCTION public.handle_ghosting_timeout()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_assignment uuid;
  v_task uuid;
  v_worker uuid;
BEGIN
  v_count := 0;
  FOR v_assignment, v_task, v_worker IN
    SELECT a.id, a.task_id, a.worker_id
    FROM task_assignments a
    WHERE a.status = 'assigned'
      AND a.assigned_at < clock_timestamp() - interval '45 minutes'
      AND a.en_route_at IS NULL
  LOOP
    BEGIN
      UPDATE task_assignments SET status = 'abandoned'
      WHERE id = v_assignment AND status = 'assigned';
      IF NOT FOUND THEN CONTINUE; END IF;
      UPDATE worker_profiles
      SET reliability_score = GREATEST(0, reliability_score - 10),
          updated_at = clock_timestamp()
      WHERE user_id = v_worker AND reliability_score > 0;
      IF NOT EXISTS (
        SELECT 1 FROM task_assignments
        WHERE task_id = v_task AND status IN ('assigned', 'en_route', 'in_progress')
      ) THEN
        UPDATE tasks
        SET status = 'broadcasting',
            dispatch_cycle = dispatch_cycle + 1,
            broadcast_at = clock_timestamp(),
            assigned_at = NULL,
            state_seq = state_seq + 1,
            updated_at = clock_timestamp()
        WHERE id = v_task AND status = 'assigned';
      END IF;
      v_count := v_count + 1;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_ghosting_timeout() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_ghosting_timeout() TO service_role;

-- submit_completion_pin
CREATE OR REPLACE FUNCTION public.submit_completion_pin(
  p_task_id uuid,
  p_worker_id uuid,
  p_pin char(4)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment task_assignments%ROWTYPE;
  v_task tasks%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_task_id::text));
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'task_not_found');
  END IF;
  SELECT * INTO v_assignment
  FROM task_assignments
  WHERE task_id = p_task_id AND worker_id = p_worker_id AND pin_code = p_pin
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_pin');
  END IF;
  IF v_assignment.status NOT IN ('in_progress', 'en_route', 'assigned') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_completed',
      'assignment_status', v_assignment.status);
  END IF;
  UPDATE task_assignments
  SET status = 'submitted', submitted_at = clock_timestamp(),
      auto_release_at = clock_timestamp() + interval '4 hours'
  WHERE id = v_assignment.id;
  UPDATE tasks
  SET status = 'awaiting_review',
      state_seq = state_seq + 1,
      updated_at = clock_timestamp()
  WHERE id = p_task_id AND status NOT IN ('completed', 'awaiting_review');
  RETURN jsonb_build_object('success', true, 'assignment_id', v_assignment.id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_completion_pin(uuid, uuid, char) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_completion_pin(uuid, uuid, char) TO authenticated, service_role;

-- =====================================================
-- 3. Add missing outbox_dlq policies (admin-only read)
-- =====================================================
-- outbox_dlq stores failed EFRIS/outbox messages. Only admins should
-- read them; inserts/updates happen via service_role (cron workers).

CREATE POLICY "outbox_dlq_select_admin"
  ON public.outbox_dlq
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
