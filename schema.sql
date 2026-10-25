-- نفّذ هذا الملف مرة واحدة داخل SQL Editor في Supabase.
create table if not exists public.trade_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    trade_date date not null,
    symbol text not null check (char_length(symbol) between 1 and 24),
    side text not null check (side in ('buy', 'sell')),
    pnl numeric(14, 2) not null check (pnl between -999999999999.99 and 999999999999.99),
    notes text not null default '' check (char_length(notes) <= 2000),
    created_at timestamptz not null default now()
);
create index if not exists trade_entries_user_date_idx on public.trade_entries (user_id, trade_date desc);
alter table public.trade_entries enable row level security;
revoke all on table public.trade_entries from anon, authenticated;
grant select, insert, update, delete on public.trade_entries to authenticated;

drop policy if exists "Entries: read own" on public.trade_entries;
create policy "Entries: read own" on public.trade_entries for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Entries: insert own" on public.trade_entries;
create policy "Entries: insert own" on public.trade_entries for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Entries: update own" on public.trade_entries;
create policy "Entries: update own" on public.trade_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Entries: delete own" on public.trade_entries;
create policy "Entries: delete own" on public.trade_entries for delete to authenticated using ((select auth.uid()) = user_id);
