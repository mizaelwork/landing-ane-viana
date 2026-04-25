-- ============================================================
-- Setup do Supabase para o Dashboard Unificado da Ane Viana
-- Rodar no SQL Editor do Supabase: https://supabase.com/dashboard/project/bakypfaugnsxkvkjasta/sql
-- ============================================================

-- 1) Tabela de eventos do pixel
create table if not exists public.pixel_events (
  id          bigserial primary key,
  event       text not null,
  path        text,
  referrer    text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists pixel_events_created_at_idx on public.pixel_events (created_at desc);
create index if not exists pixel_events_event_idx       on public.pixel_events (event);
create index if not exists pixel_events_path_idx        on public.pixel_events (path);

alter table public.pixel_events enable row level security;

-- Anon pode INSERIR (coleta pública pelo tracker.js no browser)
drop policy if exists "anon insert pixel_events" on public.pixel_events;
create policy "anon insert pixel_events"
  on public.pixel_events
  for insert
  to anon
  with check (true);

-- Anon pode LER (dashboard estático no browser usa anon key)
-- Se preferir restringir, troque pra `to authenticated` e proteja o dashboard com Basic Auth no nginx
drop policy if exists "anon select pixel_events" on public.pixel_events;
create policy "anon select pixel_events"
  on public.pixel_events
  for select
  to anon
  using (true);

-- ============================================================
-- 2) Liberar SELECT para o anon nas tabelas que o n8n já popula
--    (assim o dashboard consegue ler leads/messages/etc.)
-- ============================================================

-- Caso as tabelas ainda nao tenham RLS habilitada, habilita
alter table if exists public.leads              enable row level security;
alter table if exists public.conversations      enable row level security;
alter table if exists public.messages           enable row level security;
alter table if exists public.events             enable row level security;
alter table if exists public.checkout_sessions  enable row level security;

-- Policies de SELECT para anon
drop policy if exists "anon read leads" on public.leads;
create policy "anon read leads" on public.leads for select to anon using (true);

drop policy if exists "anon read conversations" on public.conversations;
create policy "anon read conversations" on public.conversations for select to anon using (true);

drop policy if exists "anon read messages" on public.messages;
create policy "anon read messages" on public.messages for select to anon using (true);

drop policy if exists "anon read events" on public.events;
create policy "anon read events" on public.events for select to anon using (true);

drop policy if exists "anon read checkout_sessions" on public.checkout_sessions;
create policy "anon read checkout_sessions" on public.checkout_sessions for select to anon using (true);

-- O n8n usa service_role (bypassa RLS), entao continua escrevendo normal.

-- ============================================================
-- Pronto. Confirme que funcionou rodando no SQL Editor:
-- select count(*) from public.leads;
-- select count(*) from public.pixel_events;
-- ============================================================
