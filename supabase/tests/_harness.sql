create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
-- the scheduler's originals, minimal shape
create table profiles (id uuid primary key references auth.users(id), role text, full_name text);
create table clients (id bigserial primary key, name text);
create table sessions (id bigserial primary key, client_id bigint);
create table staff (id bigserial primary key, role text);
