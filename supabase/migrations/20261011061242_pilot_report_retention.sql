create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('pilot-report-retention','15 3 * * *','select island_private.purge_expired_reports()');
