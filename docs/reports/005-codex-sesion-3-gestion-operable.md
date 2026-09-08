# Reporte 005 · Sesión 3 · Gestión operable

**Carril:** B · **Fecha:** 2026-09-09 · **Proyecto remoto:** MorphiqPOS
`wyqmzhliurwyxuyxznpb`

## Resultado

Se cerraron ocho tareas: BUG-01, B-06b, B-07b, B-08, B-09, B-10, B-11 y
B-12. Productos y configuración dejaron de usar datos locales; las rutas HTTP
ejecutan consultas y comandos reales, con ámbito resuelto en servidor, idempotencia,
autorización por rol/paquete y auditoría. Se añadieron inicio, inventario, almacenes,
insumos, movimientos y recetas con costo, utilidad y margen derivados en PostgreSQL.

| Tarea | Entrega | Evidencia principal |
|---|---|---|
| BUG-01 | Una venta negativa autorizada crea la existencia faltante en cero antes del decremento | prueba roja/verde y mutación que retira el insert |
| B-06b | `/productos` consulta, crea y edita catálogo mediante `app/api/catalogo/**` | recarga posterior a cada comando; búsqueda `pg_trgm` paginada |
| B-07b | `/configuracion` lee y guarda datos reales con versión optimista | conflicto de versión revierte también organización/paquete |
| B-08 | Navegación según paquete y 403 real fuera de paquete | `catalogo.crear_modificador` rechazado para Ferretería |
| B-09 | `/inicio` muestra venta del día local, caja abierta, ventas recientes y stock bajo | datos de operación consultados en PostgreSQL |
| B-10 | Semillas creíbles para abarrotes, ferretería y cafetería; `resetearDemo` auditable | confirmación literal y reconstrucción limitada a la organización actual |
| B-11 | Alta de almacén/insumo, inventario inicial y ajustes | saldo atómico y ledger inmutable en una transacción |
| B-12 | Recetas por insumo, actualización de costo y rentabilidad | costo recalculado; utilidad y margen como columnas generadas |

## Base y seguridad

Las migraciones 041–043 se ensayaron con `BEGIN/ROLLBACK`, se aplicaron sólo a
MorphiqPOS y quedaron registradas en `_migraciones`: `041_recetas_y_costeo`
`9bdf5f0bae2839fe`, `042_demostraciones_credibles` `548b8ecfa7518a63` y
`043_operacion_demo_inicio` `f0673b1c19d95fa0`. La base contiene tres negocios
coherentes; Ferretería tiene 5 productos y una caja abierta con 2 ventas por $347.00,
y Cafetería tiene 4 productos, 4 insumos y 5 renglones de receta. La consulta verificó,
por ejemplo, Latte con precio $65.00, costo $15.30, utilidad $49.70 y margen 76.46%.

Las escrituras exigen JSON, marcador propio, origen compatible y clave de idempotencia.
El navegador nunca envía organización, empleo, rol ni paquete. Mientras A-03 no publique
X-02, un adaptador sólo de desarrollo resuelve una organización demo desde la base; en
producción falla cerrado con 401. `recetas` tiene RLS forzada y privilegios revocados a
`anon` y `authenticated`.

## Verificación

- `pnpm verify`: 326 pruebas en 27 archivos, lint, TypeScript, formato, estructura,
  residuos, primitivas, build y cabeceras.
- 52 mutaciones detectadas y restauradas: catálogo 18, consumo/stock 20, comandos de
  catálogo/configuración 9 y comandos de inventario/recetas 5.
- Build de Next con `/inicio`, `/productos`, `/inventario`, `/recetas`,
  `/configuracion` y 16 rutas API nuevas.
- Cero `any`, `@ts-ignore`, `@ts-expect-error`, `catch` vacío o archivo fuente nuevo
  mayor de 300 líneas; `git diff --check` limpio.

## Lo que NO hice

- No ejecuté las rutas Next ni los comandos Kysely contra PostgreSQL: `.env` no tiene
  `DATABASE_URL`. Por eso no afirmo un E2E de guardar y recargar desde navegador, aunque
  la ruta, el comando y la recarga están implementados y pasan tipos/build.
- No regeneré `packages/data/src/esquema.ts`; `pnpm db:tipos` falla de forma explícita
  por la misma variable ausente. Las tablas/columnas 041 se consumen con SQL tipado.
- No sustituí el adaptador temporal por la sesión real: X-02/A-03 sigue abierto. La
  compilación de producción no concede un ámbito demo; devuelve 401.
- No ejecuté `resetearDemo` mediante `comando()` sobre la base remota. La migración de
  semilla sí fue aplicada y consultada; probar el comando requiere `DATABASE_URL`.
- No automatizé Playwright para estos flujos ni probé 50 altas desde UI. Tampoco ejecuté
  Security Advisor después de las nuevas migraciones.
- El alta de productos desde `/productos` cubre precio fijo y servicio. Los productos
  nuevos por medida o porción requieren crear antes insumo/receta y la pantalla lo
  rechaza con un mensaje; no construí ese asistente combinado.
- No añadí alta de categorías, carga binaria de imágenes ni edición del tipo de venta.
  Una categoría escrita que no existe guarda el producto sin categoría; imagen sigue
  siendo URL.
- No hice B-13 ni tareas posteriores. Los avisos conocidos de Next sobre la clave
  `eslint` y la migración de `middleware` a `proxy` siguen abiertos.

## Cruces y siguiente paso

Se tocó zona neutral para publicar `@morphiqpos/app/produccion`, conectar los nuevos
gates y registrar X-02. La migración 042 incluye persona, identidad, empleo y terminal
demo porque el proyecto estaba vacío; no cambia el esquema del carril A. El siguiente
paso es que A-03 entregue el resolvedor de cookie y una conexión `DATABASE_URL`; entonces
se reemplaza el adaptador, se regenera el esquema y se ejecutan integración y E2E.
