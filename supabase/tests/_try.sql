create or replace function try(label text, stmt text) returns void language plpgsql as $$
declare n integer;
begin
  execute stmt; get diagnostics n = row_count;
  if n = 0 then raise notice 'NO-OP    % (0 rows - policy matched nothing)', label;
  else raise notice 'ALLOWED  % (% row(s))', label, n; end if;
exception when others then
  raise notice 'BLOCKED  %  (%)', label, replace(SQLERRM, E'\n', ' ');
end $$;
