# PAR-1 · Paridad: lo de POS Don Poncho, en el maestro

Archivo de progreso. **Con él solo, otra sesión retoma el encargo.** Se actualiza en cada paso.

- Fuente: `M1gu3hb/POS-Don-Poncho`, `main` = `2feb661`, `fase-b` = `16d621b`, más `95274d7` de
  `dp-11` (la licencia de Sound Lab servida). Fichas: `docs/para-el-maestro/` de `fase-b`.
- Destino: `M1gu3hb/MorphiqPOS`, `main` = `5f4534c` al empezar (31-10-2026).
- Commits `PAR-1.<n>: … (DP-x.y)`, a nombre de `M1gu3hb`, sin coautoría.
- Mecánica: `git remote add dp https://github.com/M1gu3hb/POS-Don-Poncho.git`, `git fetch dp`,
  `git cherry-pick -n <commit>` por cambio (nunca por carpeta) y choques resueltos a favor del
  maestro multigiro, conservando sólo el cambio del commit. El bloque E entra como la diferencia
  `dp/main..dp/fase-b` (ya reconciliada con el puente de 10.3), sin la 188.

## 1 · Estado

| Paso       | Qué                                                                   | Estado                                            |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| Fase 0     | Este archivo: tabla, PR A / PR B, nube contra laptop                  | hecho                                             |
| PR #19     | Next 16.4.3 + la lista de espera (R16) + la galería por día de semana | CI corriendo; se fusiona en verde                 |
| PR A       | `paridad/sin-migracion`: bloques A a D, `PAR-1.2` a `PAR-1.44`        | portado y probado en local; falta CI y producción |
| PR B       | `paridad/fase-b`: bloque E, 186 y 187                                 | pendiente                                         |
| Guion      | `scripts/paridad-laptop.mjs` y su huella                              | huella hecha (`PAR-1.35`); guion pendiente        |
| Don Poncho | PR #1 (`fase-b` → `main`) al día y listo                              | pendiente                                         |
| Fase 3     | Migrar la base compartida (laptop)                                    | espera a la laptop                                |
| Fase 4     | Fusionar `fase-b` de Don Poncho (laptop + Miguel)                     | espera a la fase 3                                |

Numeración: el PR #19 lleva sus propios `PAR-1.1` a `PAR-1.3` (rama de la sesión); el PR A
empieza en `PAR-1.2` sobre `PAR-1.1` y sigue hasta `PAR-1.44`. Los dos `PAR-1.2`/`PAR-1.3` son
commits distintos; el mensaje dice cuál es cuál.

### Cómo se probó en la nube (para repetirlo)

- Postgres 17 desechable en `127.0.0.1:5433` (`initdb` como `postgres`, rol `morphiqpos` y
  `morphiqpos_app` con `bypassrls`), migrado con `pnpm --filter @morphiqpos/data migrate`.
- Integración: `DATABASE_URL_PRUEBAS=… npx vitest run --config vitest.integracion.config.ts <archivo>`.
- Navegador: la demo del restaurante como en la CI (`db:alta-negocio`, `db:bootstrap`,
  `sembrar-demos.mjs --solo demo-acople-restaurante`), el web compilado con
  `pnpm --filter @morphiqpos/web build` (en este contenedor `turbo` no puede lanzar procesos) y
  servido en un worktree aparte, `MORPHIQPOS_PUERTO_E2E=<puerto>`.
- Las pruebas de Don Poncho se traducen a los nombres del maestro: `prueba-restaurante` →
  `demo-acople-restaurante`, `/api/pruebas/resetear` → `/api/catalogo/demostracion/resetear`,
  `equipo-de-prueba.ts` → `equipo-demo.ts`, `NEGOCIOS_DE_PRUEBA` → `DEMOS`,
  `sembrar-pruebas.mjs` → `sembrar-demos.mjs`; las páginas de su carta → una imagen que el
  maestro sirve (`/platillos/arrachera-al-carbon.webp`).

### Resultados en local (antes de la CI)

- Bloque A en navegador: 3 de 3. Bloque B: 8 de 8 suites (18 pruebas, tres aparatos).
- Unitarias, integración, tipos y las puertas estáticas tocadas, en verde en cada commit.
- Mutaciones de lo adaptado: la estación en el modo presentación (1), el contrato de
  `idAlAzar` (2 archivos), el de las cookies (2 rutas), la zona del modo espera (3), los
  sonidos de la cafetería (2) y la lista de espera (PR #19): todas muertas.
- La mudanza (exportar/importar) con la demo: 132 tablas, 322 filas, idénticas en md5.

## 2 · Qué va en cada PR

- **PR #19** (rama `ccr-f495c998-wt1flk`): sólo DP-7a. Va primero y solo porque producción corre
  Next 16.3.8 (ejecución remota de código).
- **PR A** (`paridad/sin-migracion`): bloques A, B, C y D. Ninguna migración: entra a `main` y a
  producción en cuanto su CI esté verde.
- **PR B** (`paridad/fase-b`, sobre PR A): bloque E (DP-9.5, DP-9.6, `38a94f2`) con la 186 y la
  187 byte por byte. **No se fusiona** hasta que la laptop migre la base compartida: su código
  lee tablas y columnas que la base todavía no tiene.

## 3 · Commit por commit

Clave: **porta** = entra como está (sólo choques de documentos de Don Poncho); **adapta** = entra
con cambios para el maestro multigiro; **no** = no se porta. Los documentos propios de Don Poncho
que traen los commits (`DECISIONES.md`, `docs/BITACORA.md`, `docs/para-el-maestro/`,
`docs/reports/`, `docs/cliente/`) nunca se copian: se citan.

### A · Arreglos del arranque (reporte 001 §4, DP-D14 a DP-D19)

| Commit    | DP       | Decisión          | Por qué                                                                                                                                    |
| --------- | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `3806c25` | 5a       | porta             | Defecto 2: arreglos a `jsonb` (DP-D15). La barbacoa por kilo con receta (DP-D14) es regla genérica: un `variable_medida` acepta receta.    |
| `4c150cc` | 5b       | porta             | Defecto 3: zonas del negocio en el salón (DP-D16).                                                                                         |
| `024ac2f` | 5c       | porta             | Defecto 4: receta pendiente, costo desconocido y no $0 / 100 % (DP-D17).                                                                   |
| `1673cba` | 5e       | porta             | La prueba de 5b compila.                                                                                                                   |
| `e719a94` | 5f       | porta             | Defecto 5: el menú público publica las opciones; el marcador sin foto sin colores fijos (defecto 7). La regla del título la reemplaza 9.7. |
| `8254ceb` | 7a       | adapta            | Defecto 1. Lockfile regenerado con pnpm en el maestro (PAR-1.1, PR #19).                                                                   |
| `ed7c0b7` | 7b       | **no**            | Sólo existe porque DP-2b quitó `/api/configuracion/paquete`; en el maestro la ruta vive y la prueba la usa.                                |
| `6597b9d` | 7d       | porta             | Defecto 8, primera carrera de cocina (DP-D19).                                                                                             |
| `8e90253` | 7e       | porta             | La prueba del menú personalizado deja la demo en limpio.                                                                                   |
| `ce2f2a3` | 7g       | adapta            | Defecto 8, segunda carrera (la fila por comanda). Sin su cambio a `verificar-mutaciones-backend.mjs`: depende de 7f, que no entra.         |
| `44fbdb7` | 7h       | porta             | Lint de la prueba de 7g.                                                                                                                   |
| `70ed4c1` | 3        | adapta (extracto) | Sólo el defecto 7: colores fijos de Morphiq en el botón del carrito del mesero. Lo demás es la marca de Don Poncho.                        |
| Defecto 6 | 5d / 9.1 | —                 | En Don Poncho lo cubre su cargador del menú (5d, propio). En el maestro lo cubre 9.1: el servidor aprende el área al crear.                |

### B · DP-9

| Commit    | DP  | Decisión | Por qué                                                                                                                                                 |
| --------- | --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0ce0e9e` | 9.1 | porta    | Ficha 01, DP-D22.                                                                                                                                       |
| `8aa1a6e` | 9.2 | porta    | Ficha 02, DP-D23. El paso de CI se acomoda al flujo del maestro.                                                                                        |
| `37c5310` | 9.3 | porta    | Ficha 03, DP-D24.                                                                                                                                       |
| `295a18a` | 9.3 | porta    | La e2e entra al paso de CI.                                                                                                                             |
| `5e4b2c5` | 9.4 | porta    | Ficha 04, DP-D25.                                                                                                                                       |
| `b338ea2` | 9.7 | adapta   | Ficha 05, DP-D26. Sin `docs/cliente/botones-menu-qr.json` ni los pasos de `preparar-negocio.mjs` / `generar-menu-qr.mjs` (las 8 páginas de Don Poncho). |
| `aa3ab7c` | 9.7 | porta    | La suite del menú personalizado pide desde los botones.                                                                                                 |
| `0a7319c` | 9.9 | adapta   | DP-D27. `cookiesSeguras` entra igual; `demo-local.mjs` se acomoda al maestro (su restaurante de demostración, sin el ID de Don Poncho).                 |
| `3f246a2` | 9.8 | porta    | Ficha 06, DP-D28.                                                                                                                                       |
| `408fb69` | 9.8 | no       | Retratos de la galería con el estilo `don-poncho`: la galería del maestro se regenera en su CI.                                                         |
| `d8b6896` | 9   | no       | Reporte 002 de Don Poncho.                                                                                                                              |

### C · DP-10

| Commit    | DP   | Decisión | Por qué                                                                                                                                                                     |
| --------- | ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dd945a2` | 10.1 | adapta   | Ficha 09, DP-D31. Sin los datos de Don Poncho (`negocio-don-poncho.json`, `preparar-negocio.mjs`).                                                                          |
| `0f19720` | 10.1 | porta    | Prueba de la respuesta del PIN.                                                                                                                                             |
| `f7cfc38` | 10.1 | porta    | Tipo del doble.                                                                                                                                                             |
| `d1d6b01` | 10.1 | porta    | El portal arma una comanda por estación y área.                                                                                                                             |
| `542382a` | 10.2 | porta    | Ficha 10, DP-D32.                                                                                                                                                           |
| `1d4a7e4` | 10.2 | porta    | La jornada de concurrencia cancela las mesas sentadas antes del corte.                                                                                                      |
| `37dc6bb` | 10.3 | porta    | Ficha 11, DP-D33. Lo reemplaza el bloque E en PR B.                                                                                                                         |
| `1eff34a` | 10.3 | porta    | D-3 cuenta sólo las comandas de su grupo.                                                                                                                                   |
| `0d10464` | 10.5 | adapta   | Ficha 12, DP-D34. La lista de negocios que acepta es la del maestro, por negocio (`--negocio`), sin el ID de Don Poncho fijo; puertas por `MORPHIQPOS_PROYECTO_VERIFICADO`. |
| `c53fcb8` | 10.5 | porta    | Lint de la prueba.                                                                                                                                                          |
| `6f8e9a3` | 10   | no       | Reporte 003 de Don Poncho.                                                                                                                                                  |

### D · DP-11.0 a 11.3

| Commit    | DP   | Decisión        | Por qué                                                                                                                              |
| --------- | ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `b5e88db` | 11.0 | porta           | Ficha 13, DP-D37: `idAlAzar`.                                                                                                        |
| `cc8cf91` | 11.0 | porta (parcial) | Sólo `scripts/medir-fluidez.mjs`; el inventario y el plan son de Don Poncho.                                                         |
| `21637fa` | 11.0 | adapta          | Sólo `huella-ajena.mjs`, generalizada (`--excluir`/`--solo` por slug, sin `don-poncho` fijo). `acomodar-mesas` y su plano no entran. |
| `6d53338` | 11.1 | porta           | Formato de la huella.                                                                                                                |
| `891c087` | 11.1 | adapta          | Ficha 14, DP-D38. Morfi para todos los giros; se monta donde el maestro tiene la carga larga y el 404.                               |
| `6d57118` | 11.2 | adapta          | Ficha 15, DP-D39. La zona de la hora sale del negocio; las reglas de las rutas suman las de los otros giros.                         |
| `16fe68d` | 11.2 | porta           | Pruebas del modo espera en dos archivos.                                                                                             |
| `a93f86b` | 11.2 | porta           | La prueba de Cocina resetea la demo.                                                                                                 |
| `93f2884` | 11.2 | no              | Galería: se regenera en la CI del maestro.                                                                                           |
| `3a8f771` | 11.3 | adapta          | Ficha 16, DP-D40. `sonar` en las pantallas del restaurante; los otros giros heredan el oyente único.                                 |
| `2feb661` | 11.3 | adapta          | Sólo la etiqueta de `MesaActiva.tsx`; los retratos se regeneran.                                                                     |
| `95274d7` | 11.3 | porta           | La licencia de Sound Lab servida en `/licencias/`.                                                                                   |

### E · DP-9.5 y DP-9.6 (fichas 07 y 08, DP-D29 y DP-D30) — PR B

| Commit                                                           | DP       | Decisión              | Por qué                                                                  |
| ---------------------------------------------------------------- | -------- | --------------------- | ------------------------------------------------------------------------ |
| `6341a60`                                                        | 9.5      | porta                 | El pedido compartido; migración 186 byte por byte.                       |
| `311cf2c`                                                        | 9.5      | porta                 | El candado del envío contra la caja.                                     |
| `fad280d`                                                        | 9.6      | porta                 | Unir mesas desde el mapa; migración 187 byte por byte.                   |
| `c7a90c8`                                                        | 9.6      | porta                 | La frontera de sucursal; la etiqueta de la mesa activa.                  |
| `38a94f2`                                                        | 11.0     | porta                 | El carrito compartido usa `idAlAzar`.                                    |
| `cbb80f5`, `42fc58a`, `1d803f9`, `dacea35`, `2aec862`, `16d621b` | fusiones | porta (su resolución) | Se toma `dp/main..dp/fase-b`, que ya trae el puente de 10.3 reemplazado. |
| `222cbe3`                                                        | 9.6      | no                    | Galería.                                                                 |
| `076a5d1`                                                        | 10.5     | **no**                | La 188 archiva las demos en una base nueva; dañaría al maestro.          |

### No se porta (resto)

| Commit(s)                                                                 | Qué                                                            | Por qué                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| `cf12dcd` DP-1                                                            | Importa el maestro                                             | Es el origen.                            |
| `7e17400`…`e139205` DP-2a–2h                                              | Poda de giros, demos, presentación, dueño general, puertas, CI | Encargo: no se porta (DP-D03, D05, D06). |
| `70ed4c1` DP-3 (salvo el extracto)                                        | Marca y estilo `don-poncho`                                    | De Don Poncho.                           |
| `6a3d6fe`, `737ab9c`, `ce25450` DP-5d, 5g, 5h                             | Menú, páginas y guiones de Don Poncho                          | De Don Poncho.                           |
| `7c2467d` DP-7c                                                           | Galería con su marca                                           | De Don Poncho.                           |
| `1ec73cf` DP-7f                                                           | `verify:acople` reducido                                       | DP-D21: no se porta.                     |
| `2ef1e26`, `bba570b`, `875c187`, `ea3b209`, `3cbb858` DP-8, 4, 8b, 8c, 8d | Su mudanza, alta, Vercel y reportes                            | De Don Poncho (DP-D07, DP-D20).          |
| `dp-11`, `dp11-4-en-faseb` (salvo `95274d7`)                              | DP-11.4, el diseño nuevo                                       | Miguel no lo aprobó.                     |

Conteo: 71 candidatos (63 de `main` después de DP-1, 7 de `fase-b`, `95274d7`): **32 porta, 14
adapta, 25 no**.

## 4 · Nube contra laptop

Es **laptop** sólo si necesita la sesión o el vínculo del CLI de Supabase, una credencial con DDL
de la base compartida, algo de `..\_PRIVADO\` (PIN, `PIN_PEPPER`) o a Miguel en persona.

| Fase · paso                                                                                   | Dónde                 | Por qué                                                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 0 · Plan, tabla y auditoría                                                                   | nube                  | Sólo lee los repos.                                                                                                       |
| 1 · PR #19 y PR A: código, pruebas, mutaciones, CI                                            | nube                  | Postgres 17 desechable en el contenedor; CI en GitHub.                                                                    |
| 1 · Fusionar PR #19 y PR A, Vercel `READY`                                                    | nube                  | GitHub y el conector de Vercel. Sin migración: no depende de la base.                                                     |
| 1 · Humo sin sesión (raíz, entrada, 404 con Morfi, portal QR público, otro giro)              | nube                  | Páginas públicas.                                                                                                         |
| 1 · Humo con sesión (Configuración → Sonidos y → Este aparato en producción)                  | **laptop**            | Entrar pide el PIN de un usuario de demostración (`..\_PRIVADO\`). En la nube se prueba en la CI y en la base desechable. |
| 2 · PR B: código, pruebas, mutaciones, CI                                                     | nube                  | Igual que el PR A.                                                                                                        |
| 2 · Convivencia del código viejo con la 187                                                   | nube                  | Se prueba en una base desechable migrada a la 187 con el código de `main`.                                                |
| 2 · Guion de la laptop probado de punta a punta                                               | nube                  | Contra un Postgres desechable por `DATABASE_URL`.                                                                         |
| 3.1 · Huella de los 11 negocios                                                               | **laptop**            | Lee la base compartida con su credencial.                                                                                 |
| 3.2 · `pnpm db:migrate` (186 y 187)                                                           | **laptop**            | DDL en la base compartida, por el CLI de Supabase vinculado. Nunca desde la nube (RUNBOOK §2).                            |
| 3.3 · `verify:esquema` y `verify:rls` contra la base viva                                     | **laptop**            | Credencial o vínculo del CLI.                                                                                             |
| 3.4 · Fusionar PR B y Vercel `READY`                                                          | nube, después de 3.3  | GitHub y Vercel; lo hace esta sesión si sigue viva, si no la de la laptop.                                                |
| 3.5 · Humo con escritura: unir, separar y pedido compartido en el restaurante de demostración | **laptop**            | PIN del mesero y dos teléfonos o pestañas; deja la demo como estaba.                                                      |
| 3.6 · Huella otra vez y comparación                                                           | **laptop**            | La misma credencial.                                                                                                      |
| 4 · `fase-b` de Don Poncho al día con `main`, CI verde, revisiones de código                  | nube                  | GitHub.                                                                                                                   |
| 4.1 · Fusionar `fase-b` en `main` de Don Poncho                                               | **Miguel** (decisión) | Fuera del horario del restaurante. El clic lo puede dar esta sesión cuando Miguel diga.                                   |
| 4.2 · Producción de Don Poncho `READY` y humo sin PIN                                         | nube                  | Vercel y páginas públicas.                                                                                                |
| 4.3 · Humo con PIN y huella de Don Poncho                                                     | **laptop**            | PIN de Don Poncho y credencial (`..\_PRIVADO\`).                                                                          |
| Lecturas de la base (`_migraciones` en 185, tablas nuevas ausentes, uniones abiertas)         | nube, si hay conector | Sólo `select` por el conector de Supabase.                                                                                |

## 5 · Lo que falta (se llena al cerrar las fases 1 y 2)

Pendiente.
