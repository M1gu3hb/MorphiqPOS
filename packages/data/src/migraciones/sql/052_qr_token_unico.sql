-- C-5: el token del portal es una credencial y no se puede compartir entre
-- dos mesas del mismo negocio. NULL sigue permitido para mesas sin portal.
-- La base viva heredó fuera del ledger un índice con este nombre sólo sobre
-- qr_token. Se sustituye dentro de la transacción para reconciliarlo.
drop index if exists mesas_qr_token_unico;

create unique index mesas_qr_token_unico
  on mesas (organizacion_id, qr_token)
  where qr_token is not null;
