-- PROPOSAL ONLY. Do not apply until Fable approves this exact SQL.
-- No column, row, audience, grant or immutable-update rule changes.
begin;
create or replace function strava.check_capture_estimates(e jsonb,m jsonb) returns void
language plpgsql set search_path=strava,pg_temp as $$
declare s jsonb; a jsonb; c jsonb; p jsonb; k text; x jsonb;
 start_at timestamptz; end_at timestamptz; origin_at timestamptz;
 total_input numeric:=0; total_output numeric:=0; total_cache numeric:=0;
begin
 if e is null then return; end if;
 if jsonb_typeof(e) is distinct from 'object' or e->>'v' is distinct from '1'
 or jsonb_typeof(e->'v') is distinct from 'number'
 or exists(select 1 from jsonb_object_keys(e) as keys(key_name) where key_name not in ('v','source','cost','tool_activity')) then raise exception 'Invalid estimate envelope'; end if;
 s=e->'source';
 if jsonb_typeof(s) is distinct from 'object' or not(s ?& array['sha256','started_at','ended_at'])
 or exists(select 1 from jsonb_object_keys(s) as keys(key_name) where key_name not in ('sha256','started_at','ended_at'))
 or coalesce(s->>'sha256','') !~ '^[a-f0-9]{64}$'
 or coalesce(s->>'started_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$'
 or coalesce(s->>'ended_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$' then raise exception 'Invalid estimate source window'; end if;
 start_at=(s->>'started_at')::timestamptz;end_at=(s->>'ended_at')::timestamptz;
 if end_at<start_at then raise exception 'Estimate window is reversed'; end if;
 if e ? 'cost' then
  a=e->'cost';
  if jsonb_typeof(a) is distinct from 'object' or a->>'method' is distinct from 'model-price-v1'
  or exists(select 1 from jsonb_object_keys(a) as keys(key_name) where key_name not in ('method','components'))
  or jsonb_typeof(a->'components') is distinct from 'array' then raise exception 'Invalid cost inputs'; end if;
  if jsonb_array_length(a->'components') not between 1 and 64 then raise exception 'Invalid cost component count'; end if;
  for c in select value from jsonb_array_elements(a->'components') loop
   if jsonb_typeof(c) is distinct from 'object' or not(c ?& array['model','role','input_tokens','output_tokens','cache_read_tokens','cache_write_5m_tokens','cache_write_1h_tokens','price'])
   or exists(select 1 from jsonb_object_keys(c) as keys(key_name) where key_name not in ('model','role','input_tokens','output_tokens','cache_read_tokens','cache_write_5m_tokens','cache_write_1h_tokens','price'))
   or jsonb_typeof(c->'model') is distinct from 'string' or coalesce(m->'models' ? (c->>'model'),false) is not true or coalesce(c->>'role','') not in ('primary','advisor') then raise exception 'Invalid cost component'; end if;
   foreach k in array array['input_tokens','output_tokens','cache_read_tokens','cache_write_5m_tokens','cache_write_1h_tokens'] loop
    if strava.grinder_is_safe_count(c->k) is not true then raise exception 'Invalid estimate token count'; end if;
   end loop;
   if (c->>'cache_read_tokens')::numeric+(c->>'cache_write_5m_tokens')::numeric+(c->>'cache_write_1h_tokens')::numeric>(c->>'input_tokens')::numeric then raise exception 'Estimate cache exceeds input'; end if;
   total_input=total_input+(c->>'input_tokens')::numeric;total_output=total_output+(c->>'output_tokens')::numeric;total_cache=total_cache+(c->>'cache_read_tokens')::numeric;
   p=c->'price';
   -- Null means unknown price: the renderer omits the whole dollar estimate.
   if p<>'null'::jsonb then
    if jsonb_typeof(p) is distinct from 'object' or not(p ?& array['table_url','table_version','checked_on','currency','service_tier','context_tier','rates_per_million'])
    or exists(select 1 from jsonb_object_keys(p) as keys(key_name) where key_name not in ('table_url','table_version','checked_on','currency','service_tier','context_tier','rates_per_million'))
    or p->>'currency' is distinct from 'USD'
    or coalesce(p->>'service_tier','') not in ('standard','fast','batch','standard-assumed')
    or coalesce(p->>'table_url','') !~ '^https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~:/?#\[\]@!$&()*+,;=%+-]*)?$'
    or length(p->>'table_url')>500
    or coalesce(p->>'table_version','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,119}$'
    or coalesce(p->>'context_tier','') !~ '^[A-Za-z0-9][A-Za-z0-9 ._:/+<>=-]{0,119}$'
    or coalesce(p->>'checked_on','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid price provenance'; end if;
    perform (p->>'checked_on')::date;
    if jsonb_typeof(p->'rates_per_million') is distinct from 'object'
    or not(p->'rates_per_million' ?& array['input','output','cache_read','cache_write_5m','cache_write_1h'])
    or exists(select 1 from jsonb_object_keys(p->'rates_per_million') as keys(key_name) where key_name not in ('input','output','cache_read','cache_write_5m','cache_write_1h')) then raise exception 'Invalid rate table'; end if;
    for k,x in select * from jsonb_each(p->'rates_per_million') loop
     if jsonb_typeof(x)<>'number' then raise exception 'Invalid model rate'; end if;
     if (x::text)::numeric<0 or (x::text)::numeric>1000000 then raise exception 'Invalid model rate'; end if;
    end loop;
   end if;
  end loop;
  if m->>'input_tokens' is null or m->>'output_tokens' is null
  or total_input<>(m->>'input_tokens')::numeric or total_output<>(m->>'output_tokens')::numeric
  or (m->>'cached_input_tokens' is not null and total_cache<>(m->>'cached_input_tokens')::numeric) then raise exception 'Estimate usage does not reconcile with capture totals'; end if;
 end if;
 if e ? 'tool_activity' then
  a=e->'tool_activity';
  if jsonb_typeof(a) is distinct from 'object' or a->>'method' is distinct from 'occupied-tool-minutes-v1'
  or a->'bin_seconds' is distinct from '60'::jsonb
  or exists(select 1 from jsonb_object_keys(a) as keys(key_name) where key_name not in ('method','bin_seconds','origin_utc','occupied_bins'))
  or coalesce(a->>'origin_utc','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$'
  or jsonb_typeof(a->'occupied_bins') is distinct from 'array' then raise exception 'Invalid tool activity inputs'; end if;
  origin_at=(a->>'origin_utc')::timestamptz;
  if origin_at<>date_trunc('minute',start_at) then raise exception 'Tool activity origin differs from capture window'; end if;
  if jsonb_array_length(a->'occupied_bins')>2048 then raise exception 'Tool activity inputs too large'; end if;
  for x in select value from jsonb_array_elements(a->'occupied_bins') loop
   if strava.grinder_is_safe_count(x) is not true then raise exception 'Invalid tool bin'; end if;
   if (x::text)::numeric>floor(extract(epoch from (end_at-origin_at))/60) then raise exception 'Tool bin outside source window'; end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements(a->'occupied_bins'))<>jsonb_array_length(a->'occupied_bins') then raise exception 'Duplicate tool bins'; end if;
 end if;
end $$;
revoke all on function strava.check_capture_estimates(jsonb,jsonb) from public,anon,authenticated;
create or replace function strava.check_capture_metadata(m jsonb, source_basis text) returns void
language plpgsql set search_path=strava,pg_temp as $$
declare k text;
begin
 if m is null then return; end if;
 if source_basis in ('typed-by-author','historical-reconstruction') then raise exception 'Recorded usage needs a session capture'; end if;
 if jsonb_typeof(m) is distinct from 'object' or octet_length(m::text)>8192 then raise exception 'Invalid capture metadata'; end if;
 if exists(select 1 from jsonb_object_keys(m) x where x not in ('models','basis','input_tokens','output_tokens','cached_input_tokens','reasoning_tokens','estimates')) then raise exception 'Unsupported capture metadata'; end if;
 if m->>'basis' is null or m->>'basis' not in ('codex-records','claude-message-usage','cursor-model-info') then raise exception 'Unknown capture metadata source'; end if;
 if jsonb_typeof(m->'models') is distinct from 'array' then raise exception 'Invalid recorded models'; end if;
 if jsonb_array_length(m->'models')>32 or exists(select 1 from jsonb_array_elements(m->'models') x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 120 or (x#>>'{}') !~ '^[a-zA-Z0-9][a-zA-Z0-9 ._:/+\-]*$') then raise exception 'Invalid recorded models'; end if;
 foreach k in array array['input_tokens','output_tokens','cached_input_tokens','reasoning_tokens'] loop
  if m ? k and m->k<>'null'::jsonb and strava.grinder_is_safe_count(m->k) is not true then raise exception 'Invalid token count'; end if;
 end loop;
 if m->>'cached_input_tokens' is not null and (m->>'input_tokens' is null or (m->>'cached_input_tokens')::numeric>(m->>'input_tokens')::numeric) then raise exception 'Cached input exceeds input'; end if;
 if m->>'reasoning_tokens' is not null and (m->>'output_tokens' is null or (m->>'reasoning_tokens')::numeric>(m->>'output_tokens')::numeric) then raise exception 'Reasoning exceeds output'; end if;
 if (m->>'input_tokens')::numeric+(m->>'output_tokens')::numeric>9007199254740991 then raise exception 'Token count too large'; end if;
 perform strava.check_capture_estimates(m->'estimates',m);
end $$;
revoke all on function strava.check_capture_metadata(jsonb,text) from public,anon,authenticated;

commit;
