# Certificado raíz de Supabase

`supabase-root-2021.crt` es la **CA raíz pública** con la que Supabase firma el
certificado de sus bases y de su pooler. No es un secreto: se publica en
`https://supabase-downloads.s3.amazonaws.com/prod/ssl/prod-ca-2021.crt` y va al
repositorio a propósito, porque el servidor tiene que poder verificar la
conexión sin depender de una descarga en tiempo de arranque.

Está aquí porque el almacén de CAs del sistema **no** la incluye, y sin ella la
única salida sería `rejectUnauthorized: false`: cifrado sin autenticar, que es
exactamente el escenario en el que un intermediario lee las ventas del cliente
en claro. Preferimos fijar la raíz.

    subject  CN=Supabase Root 2021 CA, O=Supabase Inc
    válido   2021-04-28 → 2031-04-26

Cuando Supabase rote su raíz habrá que traer la nueva y dejar las dos mientras
dure el solape. La comprobación de vigencia vive en `verificar-certificado.mjs`
y `pnpm verify` la ejecuta: si caduca en menos de 90 días, la puerta avisa.
