-- お問い合わせ履歴を永続化（メール送信失敗時の取りこぼし防止）
create table if not exists public.contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text,
  contact_email text,
  name text not null,
  email text not null,
  inquiry_type text not null,
  subject text,
  message text not null,
  source text not null default 'platform',
  origin text,
  user_agent text,
  email_sent boolean not null default false,
  email_error text,
  created_at timestamptz not null default now()
);

create index if not exists contact_inquiries_organization_id_idx
  on public.contact_inquiries (organization_id);

create index if not exists contact_inquiries_created_at_idx
  on public.contact_inquiries (created_at desc);

alter table public.contact_inquiries enable row level security;



