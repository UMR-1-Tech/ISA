-- ISA Call Auditor — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor → New Query

create extension if not exists pgcrypto;

create table if not exists call_sessions (
    id                     uuid primary key default gen_random_uuid(),
    agent_name             text not null,
    mode                   text,
    difficulty             text,
    qualification_score    int not null default 0,
    script_score           int not null default 0,
    completed_data_points  jsonb not null default '[]'::jsonb,
    transcript             jsonb not null default '[]'::jsonb,
    infractions            jsonb not null default '[]'::jsonb,
    started_at             timestamptz,
    ended_at               timestamptz,
    duration_seconds       int,
    created_at             timestamptz not null default now()
);

create index if not exists idx_call_sessions_created_at on call_sessions (created_at desc);
create index if not exists idx_call_sessions_agent_name on call_sessions (agent_name);

-- Lock the table down: RLS is on. We allow the public anon key to INSERT
-- and SELECT (needed since the frontend now talks to Supabase directly),
-- but there are no UPDATE/DELETE policies, so nobody can alter or erase
-- past sessions through the public key.
alter table call_sessions enable row level security;

drop policy if exists "Allow anon insert" on call_sessions;
create policy "Allow anon insert" on call_sessions
    for insert to anon
    with check (true);

drop policy if exists "Allow anon select" on call_sessions;
create policy "Allow anon select" on call_sessions
    for select to anon
    using (true);

-- Per-agent leaderboard, aggregated on the fly from call_sessions.
create or replace view agent_leaderboard as
select
    agent_name,
    count(*)                                        as total_calls,
    round(avg(qualification_score)::numeric, 1)      as avg_qualification,
    round(avg(script_score)::numeric, 1)             as avg_script,
    max(qualification_score)                         as best_qualification,
    coalesce(sum(jsonb_array_length(infractions)), 0) as total_infractions,
    max(created_at)                                  as last_call_at
from call_sessions
group by agent_name
order by avg_qualification desc, avg_script desc;

-- Without this, the view runs with the permissions of whoever created it
-- (bypassing RLS) instead of the actual querying role. security_invoker
-- makes it respect the anon-select policy above, same as the base table.
alter view agent_leaderboard set (security_invoker = true);
