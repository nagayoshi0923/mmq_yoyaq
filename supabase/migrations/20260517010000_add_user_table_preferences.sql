create table public.user_table_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  table_key text not null,
  column_order text[] not null default '{}',
  column_visibility jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, table_key)
);

alter table public.user_table_preferences enable row level security;

create policy "Users can manage own table preferences"
  on public.user_table_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
