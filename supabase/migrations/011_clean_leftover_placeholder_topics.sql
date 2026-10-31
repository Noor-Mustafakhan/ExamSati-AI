-- Clean remaining placeholder topics from migration 003
DELETE FROM public.syllabus_topics
WHERE id IN (
  'd1000000-0000-0000-0000-000000000005',
  'd1000000-0000-0000-0000-000000000006'
);
