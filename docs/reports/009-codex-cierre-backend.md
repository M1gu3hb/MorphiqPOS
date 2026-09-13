# 009 · Cierre del backend de MorphiqPOS

Fecha: 13 de septiembre de 2026

Rama: `carril-b`

Proyecto Supabase comprobado: `wyqmzhliurwyxuyxznpb`

## 1. Respaldo inicial y commits publicados

Antes de modificar el código ejecuté `git push origin carril-b`. El SHA que quedó respaldado al cerrar la TAREA 0 fue:

```text
19cc25dda9880564a605afa2ecbdfbbf81580f52
```

Después publiqué cada tarea por separado, como pidió el encargo:

| Tarea | Commit publicado |
| --- | --- |
| TAREA 1 | `3edc0535e7bbb210dc9863374757e5806bcd5022` |
| TAREA 2 | `7ec3057e1b38dae63096b8fc18513f16cedc321e` |
| TAREA 3 | `7a5f68776e502048a79f0f918bd1a7f018118ce0` |
| TAREA 4 | `e26a7dd238a0a25b8397919edf21c43231664a1c` |

Todos fueron creados por `M1gu3hb <enchuer2797@gmail.com>` y enviados a `origin/carril-b` inmediatamente después de cerrar su tarea.

## 2. `pnpm verify` completo

Ejecuté la cadena completa, sin omitir pasos, con la referencia explícita de MorphiqPOS y el Supabase CLI configurado. Terminó con código `0`.

Resumen literal de la salida:

```text
✓ Correcciones de arranque: guarda viva, Kysely instalado, Postgres 17, cero andamiaje.
✓ Estructura del monorepo correcta (15 carpetas, 6 manifiestos).
✓ historico/ cumple su contrato: 3 fuentes, aisladas del monorepo.
✓ TypeScript estricto: 12 banderas obligatorias, 5 prohibidas, 7 workspace(s) conformes.
  · excepción declarada: apps/web · allowJs por heredado/
  · pendiente: Docker no esta instalado: la comprobacion en vivo (levantar y conectarse) queda PENDIENTE. F1.0-T05 no se puede firmar hasta ejecutarla
✓ Entorno local: 3 servicios, imagenes fijadas, 9 variables declaradas.
✓ Raíz de Supabase vigente 1685 día(s) más (hasta 2031-04-26).
✓ La base cumple el contrato: 626 columnas, 468 restricciones y 171 índices.
✓ RLS y grants cerrados en 51 relaciones y 3 funciones; índices 046 presentes.
✓ Cero residuos: 8 patrones buscados fuera de historico/, ninguno presente.
La estructura NO cambió en los 61 archivos comparados de apps/web/heredado.
Miradas 51 escrituras de apps/web/heredado contra el mapa del puente.
NO ANALIZADAS (8): el cuerpo no es un objeto literal; la puerta las informa y no las declara correctas.
✓ Las 36 primitivas estan tokenizadas.
✓ Cero literales de color, altura, sombra o variante en componentes.
✓ format:check y lint terminaron en 0.
Tasks: 7 successful, 7 total (typecheck).
✓ Pruebas: 102 unitarias en la puerta correcta, 2 de integración cubiertas, cero scripts que esquiven la raíz.
Test Files 102 passed (102)
Tests 1067 passed (1067)
103 mutaciones del blindaje del backend rechazadas.
18 mutaciones de catálogo detectadas; versión restaurada en verde.
20 mutaciones de inventario detectadas; versión restaurada en verde.
9 mutaciones de comandos de catálogo detectadas; versión restaurada en verde.
5 mutaciones de comandos de inventario detectadas; versión restaurada en verde.
15 contratos de venta; 16 destructivas de contrato y 8 destructivas de prueba rechazadas; árbol restaurado.
11 contratos de identidad; 11 destructivas de contrato y 6 destructivas de prueba rechazadas; árbol restaurado.
2 contratos de paquetes; 1 destructiva de contrato y 1 destructiva de prueba rechazadas; árbol restaurado.
✓ Compiled successfully in 54s.
✓ Finished TypeScript in 14.9s.
✓ Generating static pages using 7 workers (55/55).
Tasks: 1 successful, 1 total (build).
✓ Cabeceras de seguridad: 6 presentes y correctas, nonce por peticion.
```

El aviso de ESLint sobre la ausencia de un directorio raíz `pages/` es informativo: la aplicación usa `apps/web/app` y ESLint terminó en `0`.

## 3. Estado por punto

| Punto | Estado | Commit | Evidencia ejecutada |
| --- | --- | --- | --- |
| T1 · QR de mesas | Cerrado. Las dos escrituras directas de `qr_token` usan `restaurante.rotar_qr`; el token lo genera el servidor. | `3edc053` | `restaurante/qr.test.ts`, mutaciones de cliente y pestaña QR, `verify:escrituras`. |
| T1 · bitácora de sincronización de Caja | Cerrado. Caja encola por un comando servidor y ya no escribe `IntegrationSyncLog` directamente. | `3edc053` | `caja/sincronizacion.test.ts`, mutación que repone la escritura directa. |
| T1 · cadena completa | Cerrado. La cadena de 27 pasos llegó hasta build y cabeceras. | `e26a7dd` | `pnpm verify`, código `0`; resumen en §2. |
| T2-a · separar giro y paquete | Cerrado. `organizaciones.giro` contiene el tipo de negocio y `organizaciones.paquete` el producto comercial. | `7ec3057` | `paquete-giro.test.ts`, contrato vivo de esquema. |
| T2-b · migración 054 | Cerrado y aplicado sólo mediante `pnpm db:migrate`. Conserva el giro anterior y migra a los tres paquetes. | `7ec3057` | Base viva sin pendientes; 24 migraciones registradas hasta 056. |
| T2-c · gate de comandos | Cerrado. El ámbito y el envoltorio de comandos leen el paquete comercial. | `7ec3057` | `paquetes.test.ts`, mutaciones de paquetes y comandos. |
| T2-d · escritor único de paquete | Cerrado. `configuracion.cambiar_paquete` acepta `esencial`, `operativo` y `restaurante_pro`; valida además que Pro sea compatible con el giro. | `7ec3057` | `puente/presentacion.test.ts`; tres respuestas HTTP 200 observadas en navegador. |
| T2-e · fallback restrictivo | Cerrado. El alias exacto `@/lib/packageConfig` lleva a la fachada TypeScript y cualquier valor desconocido cae a `esencial`. | `7ec3057` | `cliente/package-config.test.ts`: valor desconocido sin Inventario ni Mesas. |
| T2-f · módulos por paquete | Cerrado. Las reglas se prueban para los tres valores comerciales. | `7ec3057` | `package-config.test.ts` y `verify:paquetes`. |
| T2-g · navegador | Cerrado en Chrome contra PostgreSQL 18.4 local con las 24 migraciones. El selector persistió los tres paquetes y recompuso el menú. | `7ec3057` | Evidencia visible y respuestas `POST /api/configuracion/paquete 200`; detalle en §4. |
| S-1 · rutinas públicas | Cerrado genéricamente para funciones presentes y futuras; no es una lista de nombres. | `7a5f687` | Migración 055, `rutinas.test.ts`, comprobación viva de 3 funciones y mutaciones de grants. |
| S-2 · JSON sin `content-length` | Cerrado: las cuatro vías fallan cerradas cuando falta la longitud. | `7a5f687` | `limite-cuerpo.test.ts`, `limite-seguridad.test.ts` y mutaciones de las cuatro fronteras. |
| S-3 · costo en catálogo | Cerrado: un rol sin permiso no incluye `costo_unitario_centavos` en el `SELECT`. | `7a5f687` | `repos/catalogo.test.ts`, `catalogo/consulta.test.ts` y dos mutaciones de costo. |
| S-4 · eco de create/update | Cerrado: la selección y traducción de salida respetan `rolesLectura`. | `7a5f687` | `puente/escribir-lectura.test.ts` y mutación de campos restringidos. |
| S-5 · `imagen_url` | Cerrado con un validador compartido que sólo permite HTTP(S). | `7a5f687` | `url-publica.test.ts` y mutaciones de mapa/esquema. |
| S-6 · roles de consulta | Cerrado a nivel de tipo. Cada consulta declara roles o `PUBLICA` explícitamente. | `7a5f687` | `consultas-roles.test.ts`, typecheck de 7 paquetes y mutaciones. |
| S-7 · errores de datos | Cerrado: `cliente.ts` y `repos/limite.ts` pasan por el registrador local y no serializan el error de Postgres. | `7a5f687` | `observabilidad.test.ts`, `observabilidad-backend.test.ts` y mutaciones de adopción. |
| S-8 · cubo de empleados | Cerrado: `/api/auth/empleados` tiene cubo independiente del login por PIN. | `7a5f687` | `empleados-limite.test.ts` y mutación del nombre de cubo. |
| S-9 · origen desconocido | Cerrado: sin IP identificable se usa un cubo global por endpoint. | `7a5f687` | `limite-seguridad.test.ts` y mutación que vuelve a saltarse la cuota. |
| O-1 · restauración sin `pg_cron` | Cerrado. El ejecutor conserva archivo y hash de 053, pero vuelve opcionales la extensión y la programación al aplicarla en PostgreSQL puro. | `e26a7dd` | Ensayo completo con 48 tablas/828 filas y checksums idénticos; mutación que vuelve a fabricar `pg_cron`. |
| O-2 · índice QR | Cerrado. El verificador deriva los índices únicos críticos de 046 y 052 e incluye `mesas_qr_token_unico`. | `e26a7dd` | `rls.test.ts`, mutación de derivación y comprobación viva de 171 índices del contrato. |
| O-3 · puerta de aspecto | Cerrado. Siempre compara y tanto estructura como avisos no autorizados hacen fallar `verify`. | `e26a7dd` | `aspecto-gate.test.ts`, mutación de avisos y `verify:aspecto` sobre 61 archivos. |
| O-4 · cuota atómica | Cerrado. Una fila por organización reserva bytes con un solo `INSERT … ON CONFLICT … WHERE … RETURNING`; la condición se evalúa bajo el bloqueo de PostgreSQL y se compensa si S3 falla. | `e26a7dd` | Migración 056, `archivos-cuota.test.ts`, `cuota-archivos.test.ts` y tres mutaciones específicas. |

## 4. Las tres combinaciones en navegador

El preview de Vercel del commit `e26a7dd` construyó correctamente, pero sus variables de runtime estaban vacías y las APIs devolvían 500. Para no confundir un despliegue sin configurar con una prueba de producto, levanté PostgreSQL 18.4 aislado, apliqué por el ejecutor las 24 migraciones `001`–`056`, preparé un dueño de `demo-cafe-jacaranda` y abrí el commit exacto en Chrome. Al terminar apagué y eliminé la base, el servidor y los archivos de entorno temporales.

| Paquete guardado | Menú observado | Ausencias que verifican el recorte |
| --- | --- | --- |
| `esencial` | Dashboard, Caja, Ventas, Productos, Registros, Configuración. | Sin Inventario, Compras, Recetas, Portal QR, Mesero ni Cocina. |
| `operativo` | Dashboard, Caja, Ventas, Productos, Inventario, Compras, Recetas, Registros, Portal QR, Configuración. | Sin Mesero ni Cocina. |
| `restaurante_pro` | Dashboard, Mesero, Cocina, Caja, Ventas, Productos, Inventario, Compras, Recetas, Registros, Portal QR, Configuración. | Conserva todo el flujo operativo y añade los módulos de restaurante. |

En cada caso observé estas tres señales después de pulsar **Guardar modo de paquete**:

1. `POST /api/configuracion/paquete` respondió `200`.
2. **Paquete actual** cambió al valor guardado y el botón volvió a quedar deshabilitado.
3. La barra lateral se recompuso en la misma pantalla. En `operativo` y `restaurante_pro`, el guardado mostró además **Modo de paquete actualizado correctamente**.

## 5. Ensayo de restauración y `pg_cron`

El primer ensayo histórico usaba una extensión falsa y no demostraba portabilidad. El ensayo definitivo arrancó PostgreSQL puro, sin `extension_control_path` ni archivos de extensión fabricados. La migración 053 detectó que `pg_cron` no estaba disponible, continuó y dejó el aviso de purga manual de `comandos_ejecutados` con más de 90 días.

Salida completa del ensayo definitivo:

```json
{
  "proyectoFuente": "wyqmzhliurwyxuyxznpb",
  "destino": "PostgreSQL temporal aislado",
  "creadoEn": "2026-09-13T18:56:48.938945+00:00",
  "tablas": 48,
  "filas": 828,
  "bytesRespaldoJson": 452021,
  "respaldoMs": 10007,
  "preparacionMs": 22989,
  "restauracionMs": 3079,
  "validacionMs": 296,
  "totalMs": 36373,
  "estadoPgCron": "ausente; purga manual documentada para comandos de más de 90 días",
  "verificacion": "filas y checksum por tabla coinciden"
}
```

## LO QUE NO HICE

- No hice la TAREA 5 opcional. No convertí como lote las cinco pruebas basadas en `readFileSync` ni añadí la invariante genérica de dos campos que mapean la misma tabla/columna. El encargo la declaró prescindible y prioricé cerrar, ejecutar y publicar T1–T4.
- No firmé la comprobación viva de `pnpm db:up` con Docker. Docker no está instalado en esta máquina y `verify:entorno` lo declara expresamente. Sí ejecuté dos comprobaciones equivalentes que no dependen de Docker: la restauración completa en PostgreSQL puro y la prueba de navegador sobre PostgreSQL 18.4 aislado.
- No configuré ni promoví un despliegue de producción. El preview automático de `carril-b` quedó `Ready`, pero Vercel entregó vacíos `DATABASE_URL`, almacenamiento, secretos y organización en ese entorno. No inventé credenciales ni modifiqué la configuración externa para ocultar ese hecho.
- No edité ninguna migración aplicada. 053 conserva su archivo y hash; la compatibilidad de `pg_cron` vive en el ejecutor, y 054, 055 y 056 se aplicaron con `pnpm db:migrate`.
- No leí ni modifiqué el proyecto Pasteleria Confetti `ivqcxdpqxwjxfohiswqb`. Todas las operaciones vivas usaron explícitamente `wyqmzhliurwyxuyxznpb`.
