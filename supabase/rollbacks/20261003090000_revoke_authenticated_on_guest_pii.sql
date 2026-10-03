-- rollback: 外す前と同じ権限に戻す（anon には元から無い）
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON TABLE public.private_group_members_pii TO authenticated;
