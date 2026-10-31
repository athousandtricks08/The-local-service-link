/*
# Add Cron Worker Functions + PIN Submission

Adds stored procedures for cron jobs and PIN-based completion.
All use clock_timestamp() for server-time evaluation.
All are SECURITY DEFINER, executable by service_role only.
*/

-- expire_and_rebroadcast: increment cycle, re-broadcast tasks 4+ hours old
CREATE OR REPLACE FUNCTION expire_and_rebroadcast()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
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
REVOKE EXECUTE ON FUNCTION expire_and_rebroadcast() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_and_rebroadcast() TO service_role;

-- expire_unfilled_tasks: tasks at cycle 3, still broadcasting 4+ hours
CREATE OR REPLACE FUNCTION expire_unfilled_tasks()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
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
REVOKE EXECUTE ON FUNCTION expire_unfilled_tasks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_unfilled_tasks() TO service_role;

-- auto_release_escrow: release escrow for submitted assignments 4+ hours old, no open disputes
CREATE OR REPLACE FUNCTION auto_release_escrow()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
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
        WHERE task_id = v_task
          AND status NOT IN ('completed', 'abandoned')
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
REVOKE EXECUTE ON FUNCTION auto_release_escrow() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auto_release_escrow() TO service_role;

-- handle_ghosting_timeout: unassign workers who haven't responded in 45 min
CREATE OR REPLACE FUNCTION handle_ghosting_timeout()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
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
      UPDATE task_assignments
      SET status = 'abandoned'
      WHERE id = v_assignment AND status = 'assigned';

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      UPDATE worker_profiles
      SET reliability_score = GREATEST(0, reliability_score - 10),
          updated_at = clock_timestamp()
      WHERE user_id = v_worker
        AND reliability_score > 0;

      IF NOT EXISTS (
        SELECT 1 FROM task_assignments
        WHERE task_id = v_task
          AND status IN ('assigned', 'en_route', 'in_progress')
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
REVOKE EXECUTE ON FUNCTION handle_ghosting_timeout() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION handle_ghosting_timeout() TO service_role;

-- submit_completion_pin: verify PIN and transition to awaiting_review
CREATE OR REPLACE FUNCTION submit_completion_pin(
  p_task_id uuid,
  p_worker_id uuid,
  p_pin char(4)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
  WHERE task_id = p_task_id
    AND worker_id = p_worker_id
    AND pin_code = p_pin
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
REVOKE EXECUTE ON FUNCTION submit_completion_pin(uuid, uuid, char) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_completion_pin(uuid, uuid, char) TO authenticated, service_role;
