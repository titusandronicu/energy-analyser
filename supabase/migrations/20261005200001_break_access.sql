-- THROWAWAY BREAK: lets anon read raw pushes.
grant select on public.ingest_pushes to anon;
create policy "break anon read" on public.ingest_pushes for select to anon using (true);
