-- Rename the Queen Breeding sub-topic "Selection and breeding value" to
-- "Breeding Concepts". The id (rs-select) is unchanged, so subscriptions,
-- team grants and contributed content are unaffected.
update public.repository_sub_topics
   set name = 'Breeding Concepts'
 where id = 'rs-select';
