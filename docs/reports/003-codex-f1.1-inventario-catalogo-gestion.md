# Reporte 003 — Codex — Inventario, catálogo y gestión F1.1

- **Agente:** Codex
- **Carril:** B (catálogo, inventario, gestión y público)
- **Rama:** `carril-b`
- **Fecha inicio / fin:** 2026-09-07 / 2026-09-08
- **Commits:** `9237dc8`, `afc45e4`, `443ac3f`, `64f512d` (4 commits de implementación e integración)
- **Tareas cubiertas:** B-02 … B-07

## 1. El prompt que recibí

> Terminaste B-01 y lo hiciste bien: bigint puro, cero any, 62 pruebas no
> triviales, 18 mutaciones verificadas, y un reporte honesto que coincide con
> el disco. Eso se queda.
>
> Pero hay un problema de prioridad que hay que corregir ahora mismo.
>
> ═══════════════════════════════════════════════════════════════════════
> LO PRIMERO: DESBLOQUEA A CLAUDE CODE
> ═══════════════════════════════════════════════════════════════════════
>
> Tu prompt anterior decía que Claude Code depende de B-02 y B-03 y que los
> construyeras pronto. Te fuiste a profundizar en catálogo y él lleva
> bloqueado desde entonces: no puede cerrar cobrarOrden sin el consumo de
> inventario.
>
> B-02 y B-03 son TU PRIMERA Y SEGUNDA TAREA DE ESTA SESIÓN. Antes de
> cualquier pantalla, antes del selector de paquete, antes de nada.
>
>   B-02  packages/domain/src/inventario/consumo.ts
>         export function calcularConsumo(lineas): MovimientoPlaneado[]
>         Resuelve las 4 estrategias de consumo:
>           sku          → descuenta el producto mismo (retail)
>           receta       → descuenta los insumos vía recetas (restaurante)
>           insumo_base  → descuenta el insumo base por cantidad variable
>                          (peso, porción — aquí SÍ se usan los ml de
>                           calcularMlPorPorcion, que hoy calculas y descartas)
>           ninguno      → no descuenta (servicios)
>         Dominio puro: sin I/O, sin base de datos.
>
>   B-03  packages/data/src/repos/stock.ts
>         export async function aplicarMovimientos(movimientos, tx)
>         Inserta en movimientos_stock (ledger inmutable) y actualiza
>         existencias con DECREMENTO ATÓMICO:
>           UPDATE existencias SET cantidad = cantidad - $1
>           WHERE almacen_id = $2 AND insumo_id = $3
>             AND (cantidad >= $1 OR $4)
>         FALLA si no alcanza y la política lo prohíbe. Nunca Math.max(0,...).
>         Recibe la transacción por parámetro: Claude Code la abre desde
>         cobrarOrden y tú escribes DENTRO de ella.
>
> Apenas pasen sus pruebas: commit, push a carril-b, y merge a main. NO
> esperes a terminar la sesión — Claude Code lo necesita hoy.
>
> Las firmas exactas están en TEAM.md §4. Respétalas: él ya escribió un STUB
> contra ellas.
>
> ═══════════════════════════════════════════════════════════════════════
> CALIBRACIÓN: MISMA EXIGENCIA, MÁS ALCANCE
> ═══════════════════════════════════════════════════════════════════════
>
> Hiciste 1 tarea de 24 en una sesión. A ese ritmo la Fase 1 no termina.
>
> No bajes la calidad — el rigor de B-01 es correcto y es lo que quiero. Lo
> que cambia es cómo lo distribuyes:
>
> · Las mutaciones se concentran donde se pierde dinero o datos: consumo de
>   stock, decremento atómico, precios, totales. En un formateador de texto
>   o un componente de UI, la prueba basta.
> · No hace falta un documento de contrato por módulo. B01-CATALOGO-CONTRATO.md
>   estuvo bien porque otro agente lo consume; para lo que sólo usas tú, el
>   tipo en TypeScript ES el contrato.
> · Un reporte por SESIÓN, no por tarea.
>
> ESTA SESIÓN NO TERMINA CON MENOS DE: B-02, B-03, B-04, B-05, B-06 y B-07.
> Seis tareas. Si te sobra sesión, sigues con B-08 y B-09.
>
> ═══════════════════════════════════════════════════════════════════════
> TUS TAREAS DE ESTA SESIÓN
> ═══════════════════════════════════════════════════════════════════════
>
> Detalle completo en docs/fase-1/18-REPARTO-DOS-CARRILES.md §4.
>
>   B-02  Dominio de consumo de inventario          ← PRIMERO
>   B-03  Repositorio de stock con decremento atómico ← SEGUNDO, y avisas
>   B-04  Comandos de catálogo: crear, actualizar, precio, código de barras,
>         archivar. Modificadores normalizados con precio extra.
>   B-05  Configuración por organización + EL SELECTOR DE PAQUETE
>         (Tienda·Ferretería·Farmacia·Cafetería·Restaurante).
>         Se verifica en el SERVIDOR: 403 PAQUETE_NO_INCLUYE.
>         Ocultar botones NO es verificación. Esta es la jugada de venta de
>         Miguel: la usa enfrente del cliente para enseñarle "así se vería el
>         tuyo".
>   B-06  Pantalla (gestion)/productos: alta, edición, búsqueda difusa,
>         imagen, precios, mayoreo, código de barras.
>   B-07  Pantalla (gestion)/configuracion con el selector de paquete y la
>         identidad visual del negocio.
>
> B-04 en adelante necesitan packages/app/comando.ts, de Claude Code. Si aún
> no está: haz el dominio y los repositorios, deja la capa de comando para
> cuando llegue, y anótalo. No lo escribas tú: es su zona.
>
> ═══════════════════════════════════════════════════════════════════════
> CABOS SUELTOS QUE TE TOCAN
> ═══════════════════════════════════════════════════════════════════════
>
> 1. pnpm verify está ROJO y bloquea a los dos. Te asigno el arreglo para
>    que no choquen:
>    · verify:residuos falla por 14 referencias históricas en documentación.
>      Son legítimas: los documentos EXPLICAN la erradicación de Base44.
>      El escáner debe excluir docs/ y historico/, no el código.
>    · format:check falla. Corre pnpm format y commitea.
>    Avísalo en el commit porque es zona neutral.
>
> 2. Engancha tu script de mutación. verificar-catalogo-codex.mjs no está en
>    ningún package.json: la garantía se pudre en silencio. Agrégalo como
>    verify:catalogo y métela en verify. Renómbralo sin "codex" — es del
>    proyecto, no tuyo.
>
> 3. packages/domain/src/index.ts sólo exporta dinero. Agrega catalogo, como
>    está el patrón de dinero.
>
> ═══════════════════════════════════════════════════════════════════════
> EL ESTÁNDAR DE ENTREGA QUE PEDISTE
> ═══════════════════════════════════════════════════════════════════════
>
> morphiq-prs es una skill de Claude y no la tienes. Pero los checks que te
> aplican están enumerados en la tabla "Gate morphiq-prs" al final de cada
> documento de corte: 16-CORTE-F1.1 §Gate, 10-CORTE-F1.3 §Gate y
> 12-CORTE-F1.5 §Gate. Esa tabla ES tu lista. Úsala para cerrar tus tareas.
>
> Los BLOCKERS que te tocan en este corte:
>   · Montos y precios recalculados en el servidor. Cero importes del cliente.
>   · Constraints reales en la base; transacciones en operaciones multi-tabla.
>   · Cero N+1; paginación real en toda colección grande; cero SELECT *.
>   · Autorización server-side en todo dato sensible.
>   · RLS habilitado; service_role jamás en el navegador.
>   · Datos de demostración creíbles. Cero "Producto 1, $100".
>
> ═══════════════════════════════════════════════════════════════════════
> LO DEMÁS SIGUE IGUAL
> ═══════════════════════════════════════════════════════════════════════
>
> · Lee TEAM.md antes de tocar nada. Zonas de propiedad en §3.
> · Tu rango de migraciones: 040–069.
> · Si un archivo no es tuyo, no lo tocas. Lo anotas.
> · La prueba antes que el código, y la mutación después.
> · historico/ se lee como especificación. No se copia un archivo.
> · Cero any, cero @ts-ignore, cero catch vacío. Ningún archivo sobre 300
>   líneas.
> · Secretos en .env, que está en .gitignore. Nunca en un commit ni en un
>   reporte.
> · NO se toca Pasteleria Confetti (ivqcxdpqxwjxfohiswqb).
> · Commits a nombre de M1gu3hb. Todo se sube.
>
> Al terminar: reporte 003 (Claude Code va a tomar el 002) en
> docs/reports/003-codex-<tema>.md siguiendo PLANTILLA.md. El campo "Lo que
> NO hice" lo llenaste bien la vez pasada — sigue así, es lo que más sirve.
>
> Y mergea carril-b a main cuando pnpm verify quede verde. Tu trabajo de
> B-01 todavía no está en main y Miguel no lo ve.
>
> Arranca por B-02.

## 2. Qué se me pidió

Desbloquear primero a Claude Code con el consumo y el decremento atómico; publicar
ese bloque de inmediato; después entregar comandos de catálogo, configuración y las
dos pantallas de gestión. También reparar y conectar los gates neutrales asignados,
mantener dinero exacto y autorización de servidor, aplicar constraints reales y dejar
un único reporte honesto de la sesión.

## 3. Qué hice — tarea por tarea

### B-02 · Dominio de consumo de inventario

- **Qué construí:** `calcularConsumo(lineas): MovimientoPlaneado[]` para `sku`,
  `receta`, `insumo_base` y `ninguno`.
- **Cómo lo resolví:** cantidades en diezmilésimas con `bigint`; conversión a unidad
  base, merma exacta, ml por porción y agrupación por insumo. Al agrupar se conserva
  la política más restrictiva de venta sin stock.
- **Archivos creados:** `packages/domain/src/inventario/consumo.ts`, prueba e índice.
- **Archivos modificados:** exportaciones del paquete y raíz de domain.
- **Migraciones aplicadas:** ninguna.
- **Pruebas escritas:** 11, incluidas cantidades mayores que `Number.MAX_SAFE_INTEGER`,
  unidad incompatible, referencias mezcladas y las cuatro estrategias.
- **Mutaciones ejecutadas:** 10; unidad, multiplicación, merma, porción, agrupación,
  política negativa, referencia y servicio. Todas fallaron por aserción y se restauraron.
- **Criterio de aceptación:** ✅ cumplido. Dominio puro, sin I/O.

### B-03 · Stock con decremento atómico

- **Qué construí:** `aplicarMovimientos(movimientos, tx)`.
- **Cómo lo resolví:** valida antes de escribir, ordena bloqueos, ejecuta un `UPDATE`
  condicional por saldo y sólo después inserta el ledger completo. Cero filas produce
  `STOCK_INSUFICIENTE`; la transacción la abre el llamador.
- **Archivos creados:** `packages/data/src/repos/stock.ts` y prueba.
- **Archivos modificados:** exportaciones de data y códigos estables de error.
- **Migraciones aplicadas:** ninguna.
- **Pruebas escritas:** 7 del SQL compilado, orden de bloqueos, fallo y ledger.
- **Mutaciones ejecutadas:** 9; signo, organización, guarda, política, fila ausente,
  ledger, orden y cero. Todas detectadas y restauradas.
- **Criterio de aceptación:** ✅ cumplido. Se publicó en `main` en cuanto pasó el gate.

### B-04 · Comandos de catálogo

- **Qué construí:** alta, edición, precio, SKU/código de barras, archivo y modificadores
  con precio extra; alta del insumo espejo para SKU y vínculo explícito del insumo base.
- **Cómo lo resolví:** cada comando consume `definirComando`, toma el ámbito de `ctx`,
  declara rol/paquete, escribe dentro de la transacción y audita. Los importes llegan
  como texto y se convierten con `desdeTexto` en servidor.
- **Archivos creados:** `packages/app/src/catalogo/*`, migración 040 y arnés de mutación.
- **Archivos modificados:** exports de app/data, esquema generado sincronizado y errores.
- **Migraciones aplicadas:** `040_producto_insumo_base`, ensayada con `ROLLBACK` y
  aplicada a Supabase MorphiqPOS `wyqmzhliurwyxuyxznpb`; registrada con hash
  `02664d7e6a00e913`. FK misma organización y check de estrategia confirmados.
- **Pruebas escritas:** 12 de comandos y esquemas.
- **Mutaciones ejecutadas:** 6 de precios, costo, extra y ámbito; todas detectadas.
- **Criterio de aceptación:** ✅ cumplido en la capa de aplicación y base.

### B-05 · Configuración y selector de paquete

- **Qué construí:** lectura con defaults, guardado de identidad/apariencia/paquete y
  control optimista por versión.
- **Cómo lo resolví:** actualización de organización y configuración en el mismo comando;
  un conflicto lanza y revierte ambas. El gate de paquete corre en `comando()` antes del
  caso de uso y devuelve `403 PAQUETE_NO_INCLUYE`.
- **Archivos creados:** `packages/app/src/configuracion/*` y contrato de colores default.
- **Archivos modificados:** exports de app/contracts.
- **Migraciones aplicadas:** ninguna; usa `configuracion` y `organizaciones` existentes.
- **Pruebas escritas:** 6 de alta, actualización, conflicto, defaults, entrada y 403.
- **Mutaciones ejecutadas:** versión esperada y paquete ignorado; ambas detectadas.
- **Criterio de aceptación:** ✅ lógica y autorización de servidor cumplidas. El adaptador
  HTTP espera A-03; no se sustituyó por ámbito enviado desde navegador.

### B-06 · Pantalla de productos

- **Qué construí:** `/productos`, navegación responsive, alta/edición, filtros, imagen,
  cuatro tipos de venta, SKU, código, costo, venta, mayoreo y visibilidad.
- **Cómo lo resolví:** página de servidor pequeña y componentes cliente sólo donde hay
  estado. La colección de servidor tiene columnas explícitas, `pg_trgm`, límite 50 y
  cursor `(updated_at,id)` sin `OFFSET`.
- **Archivos creados:** `apps/web/app/(gestion)/productos/*`, consulta app y repo data.
- **Archivos modificados:** layout y exports de data/app.
- **Migraciones aplicadas:** ninguna; `pg_trgm` e índice ya existían.
- **Pruebas escritas:** 4 de consulta/paginación y 3 de formato/búsqueda.
- **Mutaciones ejecutadas:** N/A; la mutación se concentró en importes y stock como pidió
  el prompt.
- **Criterio de aceptación:** 🟨 interfaz completa y verificada en navegador; el alta
  actual modifica la muestra en memoria. Persistir 50 productos desde la UI no se puede
  afirmar hasta enlazar A-03 con los comandos B-04.

### B-07 · Pantalla de configuración

- **Qué construí:** `/configuracion` con cinco tarjetas de giro, identidad, contacto,
  logo, colores, tres estilos y vista previa.
- **Cómo lo resolví:** usa tokens y la perilla `--altura-control`; `useApariencia` aplica
  la previsualización. La pantalla recuerda versión para representar el control optimista.
- **Archivos creados:** `apps/web/app/(gestion)/configuracion/*`.
- **Archivos modificados:** navegación y layout de gestión.
- **Migraciones aplicadas:** ninguna.
- **Pruebas escritas:** contrato de cinco paquetes con explicación comercial.
- **Mutaciones ejecutadas:** N/A; la lógica crítica B-05 sí tiene mutaciones.
- **Criterio de aceptación:** 🟨 selector e identidad completos y revisados en navegador;
  el guardado es local hasta A-03.

### Reparaciones neutrales asignadas

- `verify:residuos` excluye documentación e histórico sin dejar de vigilar código.
- `pnpm format` aplicado.
- `verificar-catalogo.mjs` quedó sin nombre de agente y conectado como
  `verify:catalogo`; inventario y comandos también quedaron conectados al gate.
- Catálogo e inventario se exportan desde la raíz de domain.

## 4. Errores que encontré

### Error 1 — Las pruebas de UI estaban fuera del patrón de Vitest

- **Qué pasaba:** las puse junto a `app/`, pero la configuración sólo incluye `apps/*/src`.
- **Cómo lo detecté:** Vitest respondió “No test files found”.
- **Causa raíz:** no cotejé el include antes de crear las rutas de prueba.
- **Cómo lo resolví:** moví las pruebas a `apps/web/src` e importé las funciones puras.
- **Prueba que impide que vuelva:** `verify:pruebas` y `test:unit` las enumeran y ejecutan.
- **¿Estaba en verde para todas las puertas antes?** No.

### Error 2 — La primera UI ignoraba las perillas del sistema de diseño

- **Qué pasaba:** siete archivos tenían tamaños fijos; configuración duplicaba dos hex.
- **Cómo lo detecté:** `verify:primitivas` detuvo `pnpm verify` con siete hallazgos.
- **Causa raíz:** usé tamaños visuales de Tailwind en vez del contrato de densidad.
- **Cómo lo resolví:** tamaños derivados de `--altura-control`; colores default movidos
  al contrato compartido por cliente y servidor.
- **Prueba que impide que vuelva:** `verify:primitivas` recorre app y UI en cada gate.
- **¿Estaba en verde para todas las puertas antes?** No.

### Error 3 — El reporte 002 documenta un export que no existe

- **Qué pasaba:** indica `import { comando } from '@morphiqpos/app/produccion'`, pero el
  subpath no está en `packages/app/package.json`.
- **Cómo lo detecté:** inspección del manifiesto al preparar las acciones de servidor.
- **Causa raíz:** `produccion.ts` existe, el manifiesto no lo publica.
- **Cómo lo resolví:** no lo toqué por ser zona A; quedó como X-02.
- **Prueba que impide que vuelva:** ninguna todavía; corresponde al carril A.
- **¿Estaba en verde para todas las puertas antes?** Sí: ningún consumidor usa el subpath.

## 5. Decisiones que tomé sin preguntar

| Decisión | Alternativas | Por qué esta | ¿Va a DECISIONES.md? |
|---|---|---|---|
| Agrupar bloqueos de stock en orden estable | Orden de llegada | Reduce interbloqueos sin cambiar la firma | No |
| Hacer conservadora la política negativa al agrupar | Permitir si una línea permite | Una línea estricta no debe perder su protección | No |
| Añadir `insumo_base_id` con FK compuesta | Inferir por nombre o producto | La relación debe existir y pertenecer a la organización | No |
| Cursor por fecha e id | `OFFSET` | Evita duplicados/saltos y cumple el gate de colección | No |
| No crear ruta insegura sin A-03 | Aceptar ámbito en body/header | R16 y Next 16 exigen autenticar cada acción en servidor | No |
| Datos visuales coherentes de una sola ferretería | Productos genéricos mezclados | La pantalla sirve para una demostración creíble | No |

## 6. Verificación ejecutada — evidencia, no promesas

| Comando | Resultado | Salida relevante |
|---|---|---|
| `pnpm verify` | ✅ salida 0 | 312 pruebas, 23 archivos; build y cabeceras verdes |
| `pnpm test:unit` | ✅ | 312 pruebas |
| `pnpm test:integracion` | ⬜ no ejecutado | falta `DATABASE_URL` |
| `pnpm test:e2e` | ⬜ no ejecutado | revisión manual de los flujos nuevos |
| `pnpm lint` | ✅ | 0 errores; aviso conocido de config Next |
| `pnpm typecheck` | ✅ | 7 paquetes |
| `pnpm build` | ✅ | rutas `/productos` y `/configuracion` |
| arneses de mutación | ✅ | 18 + 19 + 8 mutaciones detectadas |

**Contra la base real:** la migración 040 se ejecutó primero en una transacción con
`ROLLBACK`, después se aplicó y se consultó. PostgreSQL devolvió la columna UUID, la
entrada de `_migraciones` con el hash esperado y las restricciones FK/check. No ejecuté
los repositorios Kysely contra la base porque falta `DATABASE_URL`.

**En navegador real:** alta de “Pinza electricista 8 pulgadas” a `$219.90`; búsqueda
`tornilo` encontró “Tornillo punta broca”; cambio de paquete Ferretería → Cafetería y
guardado visible de versión 3 → 4.

## 7. Gate `morphiq-prs`

- **Superficies activadas:** S2, S5, S7, S10, S11, S14 y S15.
- **BLOCKERS abiertos:** enlace HTTP de B-05/B-06/B-07 a la sesión A-03; persistencia
  de 50 altas desde UI aún no verificable.
- **CRITICAL abiertos y aceptados:** `DATABASE_URL` impide el camino Kysely → Postgres;
  la migración y constraints sí se verificaron por la API de gestión.
- **Checks que NO pude verificar:** integración, E2E automatizado, Security Advisor y
  persistencia desde la UI. Cero N+1, paginación, `SELECT *`, importes y aislamiento sí
  están cubiertos en código/pruebas.

## 8. Lo que NO hice

- No conecté las pantallas a una ruta o Server Action: A-03 aún no entrega el ámbito
  desde cookie y el export de producción documentado por A no existe. No acepté
  organización, rol ni paquete desde el navegador como atajo.
- El alta y guardado que probé en navegador son estado local demostrativo; al recargar
  vuelven a la muestra. No afirmo que 50 productos queden persistidos.
- No ejecuté `pnpm test:integracion`: falta `DATABASE_URL`. Los repositorios están
  compilados y no han corrido mediante Kysely contra Postgres real.
- `esquema.ts` se sincronizó con la columna 040 después de comprobarla en la base, pero
  no se regeneró con `pnpm db:tipos` por la misma falta de URL.
- Imagen es URL, no carga de archivo; storage pertenece a una tarea posterior.
- No ejecuté `pnpm test:e2e`; hice comprobación manual accesible en el navegador.
- No ejecuté Security Advisor tras 040.
- No hice B-08 ni B-09. La muestra visual no es una semilla SQL y no tiene `resetearDemo`.
- No muté componentes de UI; el prompt indicó concentrar mutaciones donde se pierde
  dinero o datos.

## 9. Bugs ajenos detectados

| Archivo | Qué vi | Gravedad |
|---|---|---|
| `packages/app/package.json` | Falta `./produccion`, aunque el reporte 002 dice que está disponible | ALTA para integrar rutas |
| `apps/web/middleware.ts` | Sigue siendo esqueleto; no resuelve cookie ni `Ambito` (A-03) | BLOCKER de integración |
| `apps/web/next.config.mjs` | Next 16 rechaza la clave `eslint`; `middleware` también está obsoleto a favor de `proxy` | BAJA, build pasa |

## 10. Pendientes cruzados

| Necesito | De quién | Para qué tarea | ¿Puse un STUB? |
|---|---|---|---|
| Resolvedor de `Ambito` desde cookie y export `@morphiqpos/app/produccion` | Claude Code, A-03 | B-05, B-06, B-07 | No; un stub sería inseguro |

También quedó en `docs/reports/PENDIENTES-CRUZADOS.md` como X-02.

## 11. Estado al cerrar

- **Tareas de mi carril terminadas:** B-01 a B-05 completas; B-06 y B-07 completas
  como pantallas, con persistencia cruzada pendiente. 7 de 24 iniciadas/entregadas.
- **Rama integrada a `main`:** sí; implementación hasta `64f512d` publicada en
  `carril-b` y `main`.
- **Bloqueos activos:** X-02 del carril A y `DATABASE_URL`; Miguel no tiene que decidir
  una regla de producto para este bloque.
- **Siguiente tarea:** enlazar B-05/B-06/B-07 al llegar A-03; después B-08 y B-09.

## 12. Para el que retome esto

El `UPDATE` de existencias y el insert del ledger deben seguir dentro de la transacción
recibida; separar ambos reabre el defecto de stock. La consulta de catálogo pide una
fila extra para saber si hay cursor siguiente. Los componentes UI usan una muestra local
declarada: no la confundas con semillas. Al integrar Next, autentica dentro de cada
Server Action y usa `ctx.ambito`; nunca agregues `organizacionId` al formulario.

