# 023 · PAR-1 · Paridad con POS Don Poncho

Fecha: 31-10-2026. Sesión de desarrollo en la nube (Claude Code). Sin secretos ni PIN en este
documento. Progreso vivo, tabla commit por commit y pasos de las fases 3 y 4:
[`docs/paridad/PARIDAD-DON-PONCHO.md`](../paridad/PARIDAD-DON-PONCHO.md). Decisiones A-53 a A-58.

## 1 · Resumen

| Qué | Dónde | Estado |
| --- | --- | --- |
| Next 16.4.3, DOMPurify 3.4.17, Zod 4.6.7 (+ dos defectos del maestro) | PR #19 | **fusionado, en producción** |
| Bloques A a D (sin migraciones) | PR #20, `paridad/sin-migracion` | **fusionado, en producción** (`6bd55ba`) |
| Bloque E: pedido compartido y unir mesas, migraciones 186 y 187 | PR #21, `paridad/fase-b` | abierto, **sin fusionar** |
| Guion de la laptop (`scripts/paridad-laptop.mjs`) | PR #21 | revisado y probado de punta a punta |
| Don Poncho `fase-b` listo para la fase 4 | PR #1 de Don Poncho | listo para revisión, **sin fusionar** |
| Fases 3 y 4 | laptop de Miguel | pendientes |

71 commits de Don Poncho revisados: **32 porta, 14 adapta, 25 no** (tabla en el archivo de progreso).

## 2 · Por bloque

**A · Arreglos del arranque** (reporte 001 §4 de Don Poncho). Portados: `jsonb`, zonas del salón,
receta pendiente, opciones en el menú público, las dos carreras de la cocina, colores fijos (extracto
de DP-3). Adaptado: DP-7a con pnpm (lockfile del maestro); DP-7g sin la mutación que dependía de
DP-7f. No: DP-7b (sólo existía por la poda de Don Poncho), DP-7f (acople reducido).

**B · DP-9.** Portados: Recetas y área (9.1), portal sin asignación y globos (9.2), «Solicitudes»
(9.3, sólo el paquete restaurante), cocina en el teléfono (9.4), QR con diseño (9.8), botones del
menú QR (9.7, sin la carta de Don Poncho). Adaptado: `cookiesSeguras` también en el modo
presentación; `demo-local.mjs` sobre las demos del maestro.

**C · DP-10.** Portados: estaciones (10.1), cierre de caja con cuentas vivas (10.2), puente de
mesas unidas (10.3). Adaptado: la estación se lee del empleo gemelo en el modo presentación; la
mudanza (10.5) parametrizada por negocio (`--org` + `--id`), sin id fijo.

**D · DP-11.0 a 11.3.** Portados: `idAlAzar`, Morfi, modo espera, sonidos, la licencia servida.
Adaptado: `idAlAzar` en cafetería y ferretería; la huella generalizada (todos los negocios,
columnas de la primera toma, relleno de la 187); el modo espera con la hora de
`organizaciones.zona_horaria` y las pantallas de cada giro; el acceso de la cafetería suena y quita
el candado; el medidor de fluidez con los PIN públicos de las demos. No: DP-11.4 (no aprobado),
`acomodar-mesas`, la galería de Don Poncho.

**E · DP-9.5 y 9.6.** La diferencia `dp/main..dp/fase-b` (ya reconciliada con el puente de 10.3),
sin la 188 ni sus documentos. 186 y 187 byte por byte: mismo hash con el ejecutor de cada repo.

Las pruebas de navegador de Don Poncho se tradujeron a la demo del restaurante del maestro.
Mutaciones sólo de lo adaptado, todas muertas (estación en presentación, contratos de `idAlAzar` y
cookies, zona del modo espera ×3, sonidos de la cafetería ×2, huella ×2, lista de espera).

## 3 · Lo que apareció en el camino (del maestro, no de Don Poncho)

- **`lista_espera_citas.anotar` aceptaba la clienta de otro negocio** (R16) y respondía 500 con una
  inexistente. La prueba de aislamiento lo veía sólo cuando sus dos «ahora» caían en milisegundos
  distintos. Arreglado con prueba y mutación (PR #19).
- **La galería dependía del día de la semana** («Mié» contra «Sáb» en la agenda de la estética).
  Arreglado fijando la abreviatura (PR #19).
- **Riesgo de la fase 4:** el `verify:acople` de Don Poncho habría exigido la 188 aplicada en la
  base compartida, y su `db:migrate` la habría aplicado ahí (rompiendo el ledger del maestro).
  Corregido en `fase-b` (§6).

## 3 bis · La revisión adversarial del PR B

Antes de abrirlo, una revisión con subagentes (§9): 22 hallazgos, 11 refutados, 11 en pie. El de
peso: el ensayo del guion con `--transporte url` habría migrado **producción** si el `.env` de la
laptop trae el proyecto compartido (el guion borraba la variable y el `db:migrate` hijo la
recargaba). La corrida normal no estaba expuesta. Se reprodujo con un CLI trampa y se corrigió
(`PAR-1.58`), junto con:
- los hashes de la 186 y la 187 fijados;
- el estado de la base dicho en cada fallo, y `--reanudar`;
- `tomar --entorno`;
- el slug en las diferencias de la huella;
- los pasos del §5 para PowerShell 5.1.

Queda anotado, sin corregir porque es igual en Don Poncho: un producto que se oculta con líneas
en el carrito compartido traba el envío de esa mesa (progreso §2).

## 4 · Convivencia con la 187

La 187 quita el `NOT NULL` de `uniones_mesa.orden_id` y agrega columnas. Contra una base desechable
con la 186 y la 187: la integración del `main` del maestro (48 archivos, 179 pruebas) y la del
`main` de Don Poncho (45, 185) pasan; el `db:migrate` del código viejo se niega con la 186
aplicada, como debe. Riesgo de ventana: una unión creada con el código viejo después de migrar no
queda marcada; por eso la fase 3 y la 4 van seguidas y fuera del horario (progreso §5).

## 5 · CI

| PR | Corrida | Resultado |
| --- | --- | --- |
| #19 | 1ª | 15/17: aislamiento (intermitente, verde al relanzarlo una vez) y galería de estética (día de la semana): ninguno del cambio |
| #19 | 2ª (con PAR-1.2 y 1.3) | **17/17** |
| #20 | 1ª (`c4309be`) | 17/18: la galería del restaurante, por el cambio declarado (Configuración y Portal QR) |
| #20 | galería regenerada (41232816583) | 16 retratos distintos según Playwright, subidos (`PAR-1.56`) |
| #20 | 2ª (`71e7c87`, 41235720581) | **18/18** |
| #21 | ver el PR | — |

Producción tras el PR #19: `85556f0` `READY`; humo sin sesión: la raíz y la entrada 200, la página
que no existe 404, la API sin sesión 401, CSP y HSTS presentes.

Producción tras el PR #20: `6bd55ba` `READY`. Humo sin sesión:
- 200: la raíz, la entrada, la demo del restaurante, la entrada de la tienda, el menú público de
  la cafetería, la imagen de Morfi y la licencia de Sound Lab;
- 404 con Morfi («Ocultar a Morfi»): la página que no existe;
- 404: la API pública del QR con un token inválido;
- rechazada (403): la API de caja sin sesión;
- CSP, HSTS y `nosniff` presentes.

Configuración → Sonidos y → Este aparato piden PIN: se ven en la galería de la CI y quedan para el
humo de la laptop.

No corren desde la nube: `verify:esquema`, `verify:rls` y `verify:acople` contra la base viva
(fase 3, laptop). Lecturas hechas por el conector (sólo `select`): ledger en la 185, hashes 181–185
como el repositorio, tablas y columna nuevas ausentes, 0 uniones abiertas, 11 negocios.

## 6 · Don Poncho (`fase-b`)

- `fase-b` contiene `main` (`2feb661`); el PR #1 es fusionable y su CI salió en verde sobre las
  guardas (`c39a26a`, corrida 41235753096).
- Nuevo en `fase-b`: su `verify:acople` no cuenta la 188 como faltante en la base compartida, y su
  `db:migrate` se niega a migrar la compartida (`--emitir`, que sólo lee, sí). Con prueba y dos
  mutaciones.
- Comprobado leyendo el código: su `esquema-esperado.json` es idéntico al del PR B (= una base en
  la 187); su exportador incluye las tablas nuevas (135 con una base en la 187).
- `00-INDICE.md` marca cada ficha como portada al maestro, con su PR.

## 7 · Lo que falta (laptop y Miguel)

Fase 3: correr `scripts/paridad-laptop.mjs` (migra 186 y 187, puertas, huellas), fusionar el PR B,
humo con PIN de unir mesas y pedido compartido, huella. Fase 4: fusionar `fase-b` de Don Poncho
fuera de su horario, su CI, producción y humo. Paso por paso en el archivo de progreso §5.

## 8 · Commits

Todos a nombre de `M1gu3hb <118588634+M1gu3hb@users.noreply.github.com>`, sin `Co-Authored-By` ni
«Generated with» (comprobado con `git log --format=%B`): PR #19 `PAR-1.1` a `1.3`; PR A
`PAR-1.2` a `1.56`; PR B `PAR-1.46` a `1.49`, `1.52`, `1.55`, `1.57` y los que siguen; Don
Poncho, `PAR-1` en `fase-b`. Las descripciones de los PR, sin pie de atribución.

## 9 · Subagentes

Para portar, ninguno: el trabajo era secuencial (cada choque dependía del anterior) y cada
adaptación pedía criterio sobre el maestro multigiro.

Para revisar el PR B antes de abrirlo, sí. Todos fueron Sonnet (ninguno Opus), con dos a la vez
como máximo, cada uno en su propia worktree, de sólo lectura, sin commits ni push y sin tocar
ninguna base remota.
- **Primera ronda.** Tres revisores: el guion de la laptop, el bloque E en el maestro multigiro, y
  los pasos escritos junto con Don Poncho. Detrás de cada uno, un escéptico que intentaba
  refutarlo. Fueron 6 agentes y unos 945 mil tokens.
- **Segunda ronda.** Dos atacantes sobre las correcciones (`PAR-1.58`).

Lo que encontraron está en §3 bis.
