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

-- Lock the table down: RLS is on and no policies are defined, so only
-- requests using the service_role key (used server-side in api/sessions.js)
-- can read or write. The anon/public key gets nothing.
alter table call_sessions enable row level security;

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
