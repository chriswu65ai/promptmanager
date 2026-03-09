-- Starter content bootstrap for the currently authenticated user.
--
-- Idempotent behavior:
-- - Reuses the first workspace for auth.uid() if one already exists.
-- - Creates missing starter folders/files only when absent by (workspace_id, path).
-- - Safe to rerun; existing records are not duplicated.
select public.initialize_starter_workspace();
