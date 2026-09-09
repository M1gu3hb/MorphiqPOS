-- ═══════════════════════════════════════════════════════════════════════════
-- 044 · Límite de tasa por origen (F1.1-C-13)
--
-- El bloqueo del PIN cuenta por credencial: frena a quien ataca UNA cuenta, no
-- a quien barre la nómina entera probando 1234 en cada empleado. `morphiq-prs
-- §09` pide límite por IP además del de usuario, y §10 lo repite para el login.
--
-- ── Por qué en Postgres y no en memoria ───────────────────────────────────
-- En Vercel cada función serverless es un proceso distinto: un contador en
-- memoria sólo frena al atacante que tenga la mala suerte de caer dos veces en
-- la misma instancia. Y un servicio aparte —Redis, Upstash— rompería A-27, que
-- promete poder instalarle a un cliente su propio servidor sin internet.
--
-- El coste es una escritura por intento de acceso. Es un endpoint de login: si
-- eso fuera el cuello de botella, el problema sería otro.
--
-- ── La clave es un hash, no la IP ─────────────────────────────────────────
-- La dirección de un cajero es un dato personal (LFPDPPP) y no hace falta
-- conservarla para contar intentos. Se guarda el HMAC de `ip:acción` con la
-- pimienta del servidor: sirve para agrupar, no para identificar, y quien lea
-- la tabla no obtiene de dónde se conectó nadie.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists limite_tasa (
  clave        text        primary key,
  ventana_en   timestamptz not null default now(),
  intentos     integer     not null default 0,

  constraint limite_intentos_no_negativos check (intentos >= 0)
);

comment on table limite_tasa is
  'Contador de intentos por origen y acción. La clave es un HMAC, nunca la IP.';

-- Barrer lo viejo sin recorrer la tabla entera. Sin este índice, la limpieza
-- haría un scan completo en cada corrida y acabaría costando más que el propio
-- límite que protege.
create index if not exists limite_tasa_ventana on limite_tasa (ventana_en);

-- Esta tabla NO la lee nadie por PostREST. Misma postura que el resto del
-- esquema: `anon` y `authenticated` no pueden hacer nada (migración 005).
alter table limite_tasa enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on limite_tasa from anon, authenticated;
  end if;
end $$;
