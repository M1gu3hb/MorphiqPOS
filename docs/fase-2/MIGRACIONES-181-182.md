# Migraciones 181 y 182 en `wyqmzhliurwyxuyxznpb` · evidencia, respaldo y vuelta atrás

Escrito ANTES de aplicar nada en la base compartida (cierre de la 2.4, 19-10-2026). Sigue el
orden de F2.3-REGLAS §4 y de `ROLLBACK-ACOPLE.md`: verificar, ensayar, comprobar la
compatibilidad, respaldar y restaurar, preparar la vuelta atrás, aplicar y verificar.

| Migración | Qué hace | Por qué |
|---|---|---|
| `181_pago_a_credito.sql` | Ensancha `pagos_metodo_check` con `credito` | La remisión firmada de la ferretería es VENTA del día sin dinero en el cajón (D-37, `ferreteria/02-DINERO-Y-CAJA` §1 y §6.3). Sin ella, el código registra `credito` y el `check` desplegado lo rechaza. |
| `182_devolucion_a_cuenta.sql` | `devoluciones.metodo` admite `fiado` y `credito`; `devoluciones.documento_credito_id` con su llave a la misma organización y su índice; `unique (id, organizacion_id)` en `documentos_credito`; el `check` que ata la devolución a cuenta con su documento | Lo vendido a cuenta se devuelve a cuenta (D-37, §8.3). |

Las dos son **aditivas**: ensanchan listas, agregan una columna nula y restricciones que todo
dato existente ya cumple. Ninguna borra, renombra ni reescribe datos.

---

## 1 · El proyecto y su estado real (comprobado el 19-10-2026)

- Proyecto `wyqmzhliurwyxuyxznpb` («MorphiqPOS», us-east-2, PostgreSQL 17.6.1.166,
  `ACTIVE_HEALTHY`). No es el de Pastelería Confetti (`ivqcxdpqxwjxfohiswqb`), que no se tocó.
- Ledger `_migraciones`: **112 filas, última la 180** (aplicada el 09-10-2026 09:04 UTC).
- **Los 112 hashes coinciden con los archivos del repositorio** (FNV-1a de `lectura.ts`); en
  disco hay 114 y faltan exactamente la 181 y la 182.
- Producción sirve `main` @ `25c0fdd850c5110562b2f277a6304fc96af6e43c` (despliegue
  `dpl_Tg9Thw7kLDc2qZguU37aRCcZz5iM`, «Merge pull request #10»).
- Ninguna fila con `sucursal_id` nulo en las tablas que la frontera D-36 lee con `coalesce`.

## 2 · Ensayo en PostgreSQL desechable, desde el esquema vigente

Contenedor `postgres:17.6-alpine` aparte, con los roles `morphiqpos_app` (bypassrls), `anon`,
`authenticated` y `service_role` vacíos:

1. Se aplicaron las **112 migraciones hasta la 180** con la misma tanda vinculada del
   ejecutor (`prepararTandaVinculada`): el ledger quedó igual al de producción.
2. Se sembraron datos **por los comandos de producción** en cada tabla que tocan las
   migraciones: cobros en efectivo, tarjeta, transferencia y fiado (con su documento de
   cartera), pagos con `puntos` y `monedero`, y una devolución por cada método de la 178.
3. Foto de las 135 tablas: filas y md5 del contenido.
4. `node packages/data/bin/migrar.mjs --emitir` produjo la tanda de la 181+182 —**el mismo
   texto que recibirá producción**— (`sha256 e6977075…8216437`, 9,456 bytes) y se aplicó con
   `psql` en una transacción: **193 ms**.
5. Resultado:
   - Ledger con 181 (`1fa2c7eec55c4fc3`) y 182 (`5f87446d7f2c43c4`).
   - **134 tablas idénticas** (filas y md5). En `devoluciones`, las 3 filas con el mismo md5
     sobre sus 11 columnas de antes; la columna nueva, nula en las tres.
   - Restricciones nuevas presentes con su definición, índice `devoluciones_por_documento`,
     RLS forzada intacta en `pagos`, `devoluciones` y `documentos_credito`.
   - Comportamiento: se admite `credito` con documento y un pago `credito`; se RECHAZAN
     `credito` sin documento, `efectivo` con documento y un método inventado.

## 3 · Ensayo sobre los datos reales de producción, revertido

La misma tanda con `rollback` en vez de `commit` (`--ensayo`), ejecutada en
`wyqmzhliurwyxuyxznpb`. Antes se comprobó que el transporte respeta `begin`/`rollback`
(una tabla temporal creada dentro no existía después). Todas las sentencias corrieron
—precondiciones, `alter`, validación de los `check` sobre las filas reales y las
poscondiciones de cada migración—, y **después del rollback**: ledger en 180, ninguna de las
restricciones nuevas, sin la columna nueva y `pagos_metodo_check` como estaba.

## 4 · Compatibilidad con lo que sirve producción (`main` @ `25c0fdd`)

- El código de `main` nunca escribe `credito` en `pagos` ni en `devoluciones`, nunca escribe
  `documento_credito_id`, y sus devoluciones son de efectivo, tarjeta o transferencia: el
  `check` nuevo sólo restringe las devoluciones a cuenta, que `main` no hace.
- `unique (id, organizacion_id)` en `documentos_credito` lo cumple ya la llave primaria.
- Ninguna columna se quita ni se renombra. `main` ya sirve hoy sobre un esquema más nuevo que
  el suyo (la 180 entró antes que su código, por el mismo orden de despliegue).

**Orden de despliegue:** primero las migraciones (aditivas), después el código de la rama.

## 5 · Respaldo y su restauración · BLOQUEADO en esta sesión

El respaldo del repositorio es `scripts/respaldo-logico.mjs`: vuelca los datos por PostgREST
con la clave de servicio y lee el catálogo con `DATABASE_URL`. En la sesión de desarrollo en la
nube **no hay ninguna de las dos credenciales**, ni CLI de Supabase, ni la contraseña de la base.
El único acceso es el conector de Supabase, que devuelve los resultados dentro de la
conversación: vaciar por ahí 11 MB —con `credenciales_pin` y los datos personales de cuatro
negocios reales— sería exponerlos, y no se hizo.

**Por eso la 181 y la 182 NO se aplicaron.** Para destrabarlo, una de dos:

- **Miguel, desde su máquina** (la de siempre, con `.env`):
  ```
  node scripts/respaldo-logico.mjs
  node scripts/respaldo-logico.mjs --verificar <archivo>
  node scripts/ensayo-con-datos.mjs --respaldo <archivo>     # restaura en una base desechable y aplica 181+182 encima
  pnpm db:migrate --ensayo                                  # contra wyqmzhliurwyxuyxznpb: aplica y revierte
  pnpm db:migrate                                           # «Aplicadas 2»
  ```
- **O** dar a la sesión un secreto de entorno con `DATABASE_URL` de la base (y la clave de
  servicio para el volcado): entonces el respaldo y su restauración se hacen dentro del
  contenedor, sin que los datos pasen por la conversación.

## 6 · Vuelta atrás

- **Si la tanda falla al aplicar:** no hay nada que deshacer. Va en UNA transacción; la base
  queda como estaba (`ROLLBACK-ACOPLE.md` §2).
- **Si después de aplicar algo del código nuevo falla:** se vuelve al despliegue anterior en
  Vercel (`promote` del de `25c0fdd`). El esquema se QUEDA: `main` funciona con la 182 aplicada
  (§4). Es la vuelta atrás recomendada: un minuto y sin tocar la base.
- **Si hubiera que quitar las migraciones** (no se espera): una migración NUEVA, la 183, por el
  mismo proceso, que antes comprueba que no hay devoluciones a cuenta ni pagos `credito` (si los
  hay, se detiene: quitarlas perdería información) y después revierte la 182 y la 181 en orden
  inverso: `drop` del `check` de la devolución a cuenta, la lista de métodos de la 178, el
  índice, la llave, la columna, el `unique` de `documentos_credito`, y la lista de pagos de la
  003. Nunca se edita una migración aplicada ni se borra una fila del ledger.
- **Último recurso:** restaurar el respaldo de §5 en un proyecto nuevo (`ROLLBACK-ACOPLE.md` §4).

## 7 · Al aplicar · lo que se verifica

1. «Aplicadas 2» y el ledger con 114 filas: 181 `1fa2c7eec55c4fc3`, 182 `5f87446d7f2c43c4`.
2. `pnpm verify:acople` (el ledger contra el disco) y `pnpm verify:rls`.
3. `scripts/esquema-esperado.json` regenerado contra la base viva, y `pnpm verify:esquema`.
4. Las restricciones nuevas con su definición; la columna nueva nula en todas las filas.
5. Los flujos afectados en el preview contra esa base: la remisión a crédito de la ferretería
   (pago `credito`, sin dinero en el cajón) y una devolución a cuenta (baja el saldo, el cajón
   quieto) — los dos pasos de `pruebas/e2e/dia-completo-ferreteria.spec.ts`.
