-- 053 · Retención de las claves de idempotencia completadas (F1-10 R-15).
--
-- Noventa días cubren reintentos, conciliación y soporte sin conservar para
-- siempre cada petición que haya pasado por el envoltorio de comandos.

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'morphiqpos_retencion_comandos',
  '17 3 * * *',
  $trabajo$
    delete from public.comandos_ejecutados
    where created_at < now() - interval '90 days';
  $trabajo$
);

comment on table comandos_ejecutados is
  'Idempotencia de R10. Sus registros se conservan 90 días mediante el trabajo diario morphiqpos_retencion_comandos.';
