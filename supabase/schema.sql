-- APNA SOCIAL: run once in Supabase Dashboard > SQL Editor.
-- Creates profiles, posts, reactions, comments, follows and reports with RLS.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
 full_name text not null,
 gotra text default '',
 bio text default '',
 role text not null default 'customer' check (role in ('customer','admin')),
 created_at timestamptz not null default now()
);
create table if not exists public.posts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 content text not null check (length(trim(content)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create table if not exists public.likes_dislikes (
 post_id uuid not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 type text not null check(type in ('like','dislike')),
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create table if not exists public.comments (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 comment_text text not null check(length(trim(comment_text)) between 1 and 1000),
 created_at timestamptz not null default now()
);
create table if not exists public.follows (
 follower_id uuid not null references public.profiles(id) on delete cascade,
 following_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(follower_id,following_id),
 check(follower_id <> following_id)
);
create table if not exists public.reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references public.profiles(id) on delete cascade,
 post_id uuid references public.posts(id) on delete set null,
 reason text not null check(length(trim(reason)) between 3 and 500),
 status text not null default 'open' check(status in ('open','reviewed','actioned')),
 created_at timestamptz not null default now()
);

-- New auth users get a customer profile. Role is never accepted from signup metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare uname text;
begin
 uname := lower(coalesce(new.raw_user_meta_data->>'username','user_'||substr(new.id::text,1,8)));
 insert into public.profiles(id,username,full_name,gotra)
 values(new.id,uname,coalesce(new.raw_user_meta_data->>'full_name','New User'),coalesce(new.raw_user_meta_data->>'gotra',''));
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Prevent users changing their own role or username through normal profile edits.
create or replace function public.protect_profile_fields()
returns trigger language plpgsql set search_path=public
as $$
begin
 if auth.uid() is not null then
   if new.role is distinct from old.role then raise exception 'Role changes are not allowed'; end if;
   if new.username is distinct from old.username then raise exception 'Username changes are disabled'; end if;
   if new.id is distinct from old.id then raise exception 'Profile ID cannot change'; end if;
 end if;
 return new;
end; $$;
drop trigger if exists protect_profile_fields_trigger on public.profiles;
create trigger protect_profile_fields_trigger before update on public.profiles
for each row execute procedure public.protect_profile_fields();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes_dislikes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.reports enable row level security;

-- Profiles are public; email is never stored in this table.
create policy "profiles readable by everyone" on public.profiles for select using (true);
create policy "user can update own profile" on public.profiles for update using (auth.uid()=id) with check(auth.uid()=id);

create policy "posts readable by everyone" on public.posts for select using(true);
create policy "users create own posts" on public.posts for insert with check(auth.uid()=user_id);
create policy "owners or admins delete posts" on public.posts for delete using (
 auth.uid()=user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);
create policy "owners update posts" on public.posts for update using(auth.uid()=user_id) with check(auth.uid()=user_id);

create policy "reactions readable" on public.likes_dislikes for select using(true);
create policy "users react as self" on public.likes_dislikes for insert with check(auth.uid()=user_id);
create policy "users change own reaction" on public.likes_dislikes for update using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "users remove own reaction" on public.likes_dislikes for delete using(auth.uid()=user_id);

create policy "comments readable" on public.comments for select using(true);
create policy "users comment as self" on public.comments for insert with check(auth.uid()=user_id);
create policy "owners or admins delete comments" on public.comments for delete using (
 auth.uid()=user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);
create policy "owners update comments" on public.comments for update using(auth.uid()=user_id) with check(auth.uid()=user_id);

create policy "follows readable" on public.follows for select using(true);
create policy "follow as self" on public.follows for insert with check(auth.uid()=follower_id and follower_id<>following_id);
create policy "unfollow as self" on public.follows for delete using(auth.uid()=follower_id);

create policy "reporter can submit report" on public.reports for insert with check(auth.uid()=reporter_id);
create policy "reporter and admins can view reports" on public.reports for select using (
 auth.uid()=reporter_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);
create policy "admins update reports" on public.reports for update using (
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
) with check (
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);

-- Helpful indexes
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_user_id_idx on public.posts(user_id);
create index if not exists comments_post_id_idx on public.comments(post_id);
create index if not exists follows_following_idx on public.follows(following_id);
create index if not exists reports_created_at_idx on public.reports(created_at desc);

-- IMPORTANT: After signing up with your own account, run this separately,
-- replacing YOUR_LOGIN_EMAIL with the email you used. This grants Master Admin.
-- update public.profiles p set role='admin'
-- where p.id=(select id from auth.users where email='YOUR_LOGIN_EMAIL');
