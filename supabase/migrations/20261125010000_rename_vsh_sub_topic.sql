-- Rename the Queen Breeding sub-topic "VSH: the trait and its measurement"
-- to "Breeding Methods". The id (rs-vsh) is unchanged, so subscriptions,
-- team grants and contributed content are unaffected. PRJ-00's topic card
-- stores the sub-topic name as text, so it is renamed to match.
update public.repository_sub_topics
   set name = 'Breeding Methods'
 where id = 'rs-vsh';

update public.projects
   set topics = replace(topics::text, 'VSH: the trait and its measurement', 'Breeding Methods')::jsonb
 where topics::text like '%VSH: the trait and its measurement%';
