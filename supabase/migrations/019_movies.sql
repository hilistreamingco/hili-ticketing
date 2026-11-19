-- Movies: one film, many showtimes. A showtime is simply a cinema event
-- (seat map, holds, orders, tickets and codes all keep working) linked to a movie.
begin;

create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  tagline text,
  synopsis text,
  poster_url text,
  backdrop_url text,
  backdrop_video_url text,
  trailer_url text,
  rating text,                 -- e.g. PG-13
  runtime_min integer check (runtime_min is null or runtime_min between 1 and 600),
  genres text,                 -- free text, e.g. "Sci-fi, Adventure"
  look text not null default 'noir'
    check (look in ('desert', 'heroic', 'noir', 'midnight', 'ember')),
  accent text check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$'),
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.movies enable row level security;

drop policy if exists public_read_published_movies on public.movies;
create policy public_read_published_movies on public.movies
  for select to anon, authenticated using (is_published);

-- Writes happen only through the website server (service role).

alter table public.events
  add column if not exists movie_id uuid references public.movies(id) on delete set null;
create index if not exists events_movie_id_idx on public.events (movie_id);

commit;
-- Check afterwards:  select count(*) from movies;   -- 0
