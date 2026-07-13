-- Add updated_at tracking to vehiculos (previously only created_at existed)
alter table public.vehiculos
  add column if not exists updated_at timestamptz not null default now();

-- Backfill existing rows so "last updated" doesn't appear blank
update public.vehiculos set updated_at = created_at where updated_at is null;

drop trigger if exists vehiculos_updated_at on public.vehiculos;
create trigger vehiculos_updated_at
  before update on public.vehiculos
  for each row execute function public.set_updated_at();
