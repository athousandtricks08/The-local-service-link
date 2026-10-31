/*
# Revoke authenticated EXECUTE on SECURITY DEFINER functions
# Frontend now calls these via Next.js API routes that use service_role.
*/
REVOKE EXECUTE ON FUNCTION public.claim_task(uuid, uuid, char) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_task(uuid, uuid, char) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_pin(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_pin(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.submit_completion_pin(uuid, uuid, char) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_completion_pin(uuid, uuid, char) TO service_role;
