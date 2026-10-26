-- ============================================================================
-- Apiary ids become readable slugs of their names (#/apiaries/newcastle)
-- instead of the generated leftovers from the original static data
-- (ap-barrow, ap-oradale, ap-tambo) and Date.now()-based ids for apiaries
-- added in-app (ap-1790166442859).
--
-- apiaries.id is referenced by hives and apiary_managers (both gain ON UPDATE
-- CASCADE so the rename carries through) and, as plain text inside a jsonb
-- array, by projects.sites. No subscriptions, notifications or content
-- reference the old ids. js/app.js redirects old #/apiaries/ap-… links.
-- New apiaries get a slug id from their name (js/store.js addApiary).
-- ============================================================================

alter table public.hives
  drop constraint hives_apiary_id_fkey,
  add constraint hives_apiary_id_fkey foreign key (apiary_id) references public.apiaries(id) on delete cascade on update cascade;

alter table public.apiary_managers
  drop constraint apiary_managers_apiary_id_fkey,
  add constraint apiary_managers_apiary_id_fkey foreign key (apiary_id) references public.apiaries(id) on delete cascade on update cascade;

update public.apiaries set id = case id
  when 'ap-oradale'        then 'carwoola'
  when 'ap-tambo'          then 'merriville'
  when 'ap-barrow'         then 'newcastle'
  when 'ap-1790166442859'  then 'numeralla'
  when 'ap-1790768901390'  then 'victor-harbor'
end
where id in ('ap-oradale', 'ap-tambo', 'ap-barrow', 'ap-1790166442859', 'ap-1790768901390');

update public.projects set sites = '["merriville", "newcastle", "carwoola"]'::jsonb where id = 'p0';
