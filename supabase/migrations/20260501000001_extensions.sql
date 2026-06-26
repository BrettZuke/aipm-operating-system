-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- Enums used across the schema
do $$ begin
  create type membership_status as enum ('pending','active','suspended','removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_role as enum ('owner','admin','member','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type client_status as enum ('lead','active','paused','churned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('todo','in_progress','blocked','done','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('low','medium','high','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_kind as enum ('payment','refund','chargeback','adjustment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campaign_status as enum ('draft','active','paused','completed','archived');
exception when duplicate_object then null; end $$;
