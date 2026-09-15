# 010 · Cierre de la Fase 1 de MorphiqPOS

Fecha: 15 de septiembre de 2026

Rama de trabajo: `carril-b`

Proyecto Supabase comprobado: `wyqmzhliurwyxuyxznpb`

## 1. Estado por tarea

| Tarea | Estado | Commit publicado | Prueba que la cierra |
| --- | --- | --- | --- |
| T1 · comparación de cuota como `bigint` | Cerrada. Los dos parámetros de la rama de inicialización se convierten explícitamente a `bigint`; la revisión de las expresiones `sql<boolean>` y `sql\`` de `packages/data` no encontró otra comparación de dos parámetros sin una columna o cast que fijara el tipo. | `b80e6d8724655ceb6eb5d98a91b9e7df54a787c9` | `archivos-cuota.integracion.test.ts` ejecuta la primera reserva de 1 GiB con límite de 500 MiB contra PostgreSQL y la rechaza. Al retirar los casts, la prueba quedó roja; restaurados, volvió a verde. |
| T2 · propinas derivadas de pagos confirmados | Cerrada. La proyección de `Venta` toma importes, desglose por método, estado y mesero desde pagos confirmados. `tipsUtils.js` concentra la derivación y todos los consumidores indicados usan esa fuente. La migración nueva `057_resumen_pagos_por_orden.sql` se aplicó con `pnpm db:migrate`; no se editó ninguna migración aplicada. | `f17a2e83d26535b198c91a93a98214044f0caeb4` | `propinas-derivadas.integracion.test.ts`, `propinas-derivadas.test.ts`, `tips-utils.test.ts` y la prueba de navegador de dos cobros. |
| T3 · propina manual sin bucle | Cerrada. `requiereConfirmarPropinaAntesDeCobrar` sólo fuerza `monto_manual` mientras su origen no sea `caja`; los estados realmente pendientes siguen forzando el diálogo. | `893df5dce4cfd1328e4be9aab05dc969dadc6141` | `propina-confirmacion.test.ts`, mutación manual del predicado y dos recorridos en navegador: importe manual en Caja e importe manual originado en QR. |
| T4 · guardar mesa con QR | Cerrada. La escritura genérica descarta `qr_token`; `qr_activo` se conserva porque sí mapea a `mesas.qr_activa` y es escribible. El comentario de Portal QR quedó corregido. Durante la comprobación apareció además el UUID vacío de `mesero_asignado_id`; se normaliza a `null`. | `ad8eff08f9d64c2aab13286137430a23cfbb765b`, `410efc80edf339db364ac681416eb659c566b5d9` | `mesa-configuracion.test.ts`; cada mutación devolvió la prueba a rojo. En navegador se creó la mesa 1, se generó su QR, se cambió `Ventana` por `Ventana QR` y el guardado terminó con éxito. |
| T5 · puertas de lecturas y escrituras | Cerrada. `verify:lecturas` toma los descartes declarados por el puente, exige una justificación escrita para cada excepción y está conectada a `pnpm verify`. `verify:escrituras` resuelve variables y spreads y ya no permite terminar en verde con escrituras sin analizar. | `9efb9f6b4edc327e804ac9a3d70b71cd4a440da1` | Antes: 415 lecturas prohibidas y código 1. Después: 44 campos descartados vigilados, 216 lecturas justificadas y código 0. `verify:escrituras` revisó 51 escrituras y no dejó ninguna sin resolver. |
| T6-E · límite del JSON de login | Cerrada. `/api/auth/entrar` pasa por la misma guarda de tamaño que las demás fronteras JSON. | `a40cc47266d3b014dbc5b5f41df84358f6c3c2cf` | `auth-entrar-limite.test.ts` ejecuta la ruta y `limite-cuerpo.test.ts` cubre el límite compartido; sus mutaciones quedan rojas. |
| T6-G · costos invisibles para Cocina | Cerrada. Una prueba recorre todos los roles y sólo permite el costo a los cuatro autorizados. | `a40cc47266d3b014dbc5b5f41df84358f6c3c2cf` | `catalogo/consulta.test.ts` y `repos/catalogo.test.ts`, con `cocina` incluido en la matriz completa. |
| T6-A · autorización ejecutada | Cerrada. La prueba llama a `responderConsulta` con una sesión sin autorización y exige 403. | `a40cc47266d3b014dbc5b5f41df84358f6c3c2cf` | `apps/web/src/servidor/consultas-roles.test.ts`; invertir o relajar la condición deja la prueba roja. |
| T6-D3 · arqueo con fondo inicial | Cerrada. El diálogo conserva el conteo ciego y, después de capturarlo, presenta `arqueo.efectivoEsperadoCentavos`, calculado por el servidor desde movimientos. | `a40cc47266d3b014dbc5b5f41df84358f6c3c2cf` | `caja/consulta.test.ts` cubre fondo y movimientos. En navegador: fondo $2,000.00 + venta efectiva $245.00 + propina efectiva $14.00 = esperado $2,259.00; contado $2,259.00, diferencia $0.00. |
| T7 · cierre reproducible | Cerrada. El RUNBOOK documenta la instalación aislada y fijada de Supabase CLI 2.115.0 en Windows; el arnés de integración admite las dos formas válidas de URL y limpia su organización de prueba de forma repetible. | `6421c10ac57ada92cb2acf9d47f20fc1ea6e7e76` | `pnpm test:integracion`: 5 archivos y 10 pruebas verdes contra PostgreSQL 18; `pnpm verify` completo y salida en §2. |
| Hallazgo de navegador · lote vacío de comandas | Cerrado. El cobro de un producto sin grupo de preparación generaba `insert into "comandas" () values`; la primitiva ahora no emite SQL para un lote vacío. | `3a4623b6d9bbfce4452d82e9eb2b51a1f6192cb5` | `comandas.integracion.test.ts` reprodujo `42601` en PostgreSQL. La guarda la dejó verde; retirarla volvió a producir el mismo error; restaurada, las 10 pruebas de integración pasaron. |

Todos los commits fueron creados por `M1gu3hb <enchuer2797@gmail.com>` y enviados a `origin/carril-b` al cerrar su tarea.

## 2. `pnpm verify` completo

Ejecuté la cadena completa con `MORPHIQPOS_SUPABASE_PROJECT_REF=wyqmzhliurwyxuyxznpb` y Supabase CLI 2.115.0 fijado mediante `SUPABASE_CLI_PATH`. Terminó con código `0`. No se omitió ningún eslabón.

`verify:entorno` ejecutó y dejó un único subchequeo pendiente: levantar la pila mediante Docker, porque Docker no está instalado en esta máquina. Las comprobaciones vivas de esquema y RLS sí se ejecutaron contra MorphiqPOS y pasaron. El aviso de ESLint sobre la ausencia de un directorio raíz `pages/` es informativo; ESLint terminó en `0`.

Salida completa:

```text
$ pnpm verify:arranque && pnpm verify:estructura && pnpm verify:historico && pnpm verify:tsconfig && pnpm verify:entorno && pnpm verify:certificado && pnpm verify:esquema && pnpm verify:rls && pnpm verify:residuos && pnpm verify:aspecto && pnpm verify:escrituras && pnpm verify:lecturas && pnpm verify:primitivas && pnpm format:check && pnpm lint && pnpm typecheck && pnpm verify:pruebas && pnpm test:unit && pnpm verify:mutaciones-backend && pnpm verify:catalogo && pnpm verify:inventario && pnpm verify:comandos-catalogo && pnpm verify:comandos-inventario && pnpm verify:venta && pnpm verify:identidad && pnpm verify:paquetes && pnpm build && pnpm verify:cabeceras
$ node scripts/verificar-arranque.mjs
✓ Correcciones de arranque: guarda viva, Kysely instalado, Postgres 17, cero andamiaje.
$ node scripts/verificar-estructura.mjs
✓ Estructura del monorepo correcta (15 carpetas, 6 manifiestos).
$ node scripts/verificar-historico.mjs
✓ historico/ cumple su contrato: 3 fuentes, aisladas del monorepo.
$ node scripts/verificar-tsconfig.mjs
✓ TypeScript estricto: 12 banderas obligatorias, 5 prohibidas, 7 workspace(s) conformes.
  · excepción declarada: apps/web · allowJs por heredado/
$ node scripts/verificar-entorno.mjs
  · pendiente: Docker no esta instalado: la comprobacion en vivo (levantar y conectarse) queda PENDIENTE. F1.0-T05 no se puede firmar hasta ejecutarla
✓ Entorno local: 3 servicios, imagenes fijadas, 9 variables declaradas.
$ node --conditions=react-server scripts/verificar-certificado.mjs
✓ Raíz de Supabase vigente 1684 día(s) más (hasta 2031-04-26).
$ node --conditions=react-server scripts/verificar-esquema-aplicado.mjs
✓ La base cumple el contrato: 626 columnas, 468 restricciones y 171 índices.
$ node --conditions=react-server scripts/verificar-rls.mjs
✓ RLS y grants cerrados en 52 relaciones y 3 funciones; índices 046 presentes.
$ node scripts/verificar-residuos.mjs
✓ Cero residuos: 8 patrones buscados fuera de historico/, ninguno presente.
  · 1 ruta(s) que APUNTAN a historico/, permitidas por R6.
$ node scripts/verificar-aspecto.mjs
La estructura NO cambió en los 65 archivos comparados de apps/web/heredado.
7 archivo(s) más se tocaron pero NO existían en 89830e59aed8688042d98c06d3521c35e95a9906, así que no hay aspecto suyo que preservar:
  · apps/web/heredado/components/barcode/BarcodeScanner.jsx
  · apps/web/heredado/components/barcode/ScanFeedbackOverlay.jsx
  · apps/web/heredado/components/barcode/ScannerMiniCart.jsx
  · apps/web/heredado/components/caja/dinero.js
  · apps/web/heredado/components/inventario/comandos.js
  · apps/web/heredado/utils/barcodeUtils.js
  · apps/web/heredado/utils/mesaConfigUtils.js

$ node scripts/verificar-escrituras.mjs
Miradas 51 escrituras de apps/web/heredado contra el mapa del puente.

Ninguna escritura la rechaza el puente.
$ node scripts/verificar-lecturas.mjs
✓ Lecturas del puente: 44 campos descartados vigilados; 216 lectura(s) justificadas.
$ node scripts/tokenizar-primitivas.mjs --verificar && node scripts/verificar-primitivas.mjs
✓ Las 36 primitivas estan tokenizadas.
  · exenta: apps\web\src\mh — Frontend portado del restaurante: sus literales los cubre su propio parche dark
✓ Cero literales de color, altura, sombra o variante en componentes.
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
$ eslint .
Pages directory cannot be found at D:\MIS PROYECTOS\Master POS\morphiqpos-codex\pages or D:\MIS PROYECTOS\Master POS\morphiqpos-codex\src\pages. If using a custom path, please configure with the `no-html-link-for-pages` rule in your eslint config file.
$ turbo run typecheck
• turbo 2.10.12

   • Packages in scope: @morphiqpos/app, @morphiqpos/contracts, @morphiqpos/data, @morphiqpos/domain, @morphiqpos/testing, @morphiqpos/ui, @morphiqpos/web
   • Running typecheck in 7 packages
   • Remote caching disabled, using shared worktree cache

@morphiqpos/contracts:typecheck: cache miss, executing de0dab99cb619df2
@morphiqpos/domain:typecheck: cache miss, executing ce315e8a4722a2bf
@morphiqpos/web:typecheck: cache miss, executing 3339c4c14a46ff7f
@morphiqpos/testing:typecheck: cache miss, executing a767ec3f10dce6f8
@morphiqpos/data:typecheck: cache miss, executing 1d185e4e74f3b9af
@morphiqpos/app:typecheck: cache miss, executing 8bbabc5f6d8dd5ce
@morphiqpos/ui:typecheck: cache miss, executing f802492d93b493c6
@morphiqpos/contracts:typecheck: $ tsc --noEmit
@morphiqpos/domain:typecheck: $ tsc --noEmit
@morphiqpos/web:typecheck: $ tsc --noEmit
@morphiqpos/testing:typecheck: $ tsc --noEmit
@morphiqpos/data:typecheck: $ tsc --noEmit
@morphiqpos/app:typecheck: $ tsc --noEmit
@morphiqpos/ui:typecheck: $ tsc --noEmit

 Tasks:    7 successful, 7 total
Cached:    0 cached, 7 total
  Time:    14.141s 

$ node scripts/verificar-pruebas.mjs
✓ Pruebas: 110 unitarias en la puerta correcta, 5 de integración cubiertas, cero scripts que esquiven la raíz.
$ vitest run

 RUN  v5.0.0 D:/MIS PROYECTOS/Master POS/morphiqpos-codex


 Test Files  110 passed (110)
      Tests  1086 passed (1086)
   Start at  18:36:02
   Duration  27.15s (import 88%, transform 7%, tests 4%, worker 1%)

     Import  314 modules were evaluated 1184 times · 114.14s total, 88% of tracked time
             ~6.39s faster with isolate: false — shared modules are evaluated once per worker instead of once per file
             learn more: https://vitest.dev/guide/improving-performance#test-isolation

$ node scripts/verificar-mutaciones-backend.mjs
✓ Mutación rechazada: RLS FORCE eliminado
✓ Mutación rechazada: secuencias excluidas del REVOKE
✓ Mutación rechazada: EXECUTE de rutinas conservado para PUBLIC
✓ Mutación rechazada: privilegios futuros de rutinas conservados para PUBLIC
✓ Mutación rechazada: paquete reabierto en configuracion.guardar
✓ Mutación rechazada: merge parcial sustituido por replace
✓ Mutación rechazada: cambio de paquete devuelto al JSON
✓ Mutación rechazada: lectura de paquete devuelta al JSON
✓ Mutación rechazada: RLS FORCE omitido en sesiones
✓ Mutación rechazada: sid ignorado al resolver sesión
✓ Mutación rechazada: sesión no persistida al entrar
✓ Mutación rechazada: sesiones conservadas tras cambiar acceso
✓ Mutación rechazada: logout limitado a borrar la cookie
✓ Mutación rechazada: roles de entidad otra vez opcionales
✓ Mutación rechazada: guarda de lectura por entidad desactivada
✓ Mutación rechazada: cortes abiertos a todos los roles
✓ Mutación rechazada: token QR visible a roles operativos
✓ Mutación rechazada: unicidad del token QR eliminada
✓ Mutación rechazada: entropía del token QR reducida
✓ Mutación rechazada: escritura directa de qr_token reabierta
✓ Mutación rechazada: cliente QR devuelto a escritura genérica
✓ Mutación rechazada: pestaña QR devuelta a escritura directa del token
✓ Mutación rechazada: caja devuelta a escritura directa de sincronización
✓ Mutación rechazada: costo de consumo abierto por la vista alternativa
✓ Mutación rechazada: costo de catálogo devuelto a todos los roles
✓ Mutación rechazada: costo de catálogo seleccionado para todos los roles
✓ Mutación rechazada: eco de escritura selecciona campos restringidos
✓ Mutación rechazada: rol de catálogo sustituido por dueño
✓ Mutación rechazada: autorización de rol omitida en responderConsulta
✓ Mutación rechazada: decisión de roles otra vez opcional en responderConsulta
✓ Mutación rechazada: estado de bloqueo visible para gerente
✓ Mutación rechazada: límite de cuerpo elevado a 50 MiB
✓ Mutación rechazada: cuerpo fragmentado sin longitud admitido
✓ Mutación rechazada: límite omitido en rutaDeComando
✓ Mutación rechazada: límite omitido en el portal público
✓ Mutación rechazada: límite omitido en ejecutarComandoHttp
✓ Mutación rechazada: límite omitido en conSesion
✓ Mutación rechazada: allowlist de configuración desactivada
✓ Mutación rechazada: documento de configuración permitido hasta 1 MiB
✓ Mutación rechazada: nombre del negocio sin máximo efectivo
✓ Mutación rechazada: índices omitidos del contrato de esquema
✓ Mutación rechazada: contrato de esquema desconectado de verify
✓ Mutación rechazada: comprobación viva de RLS desactivada
✓ Mutación rechazada: derivación de índices únicos críticos eliminada
✓ Mutación rechazada: FORCE RLS omitido de la consulta viva
✓ Mutación rechazada: verificación RLS desconectada de verify
✓ Mutación rechazada: purga de limite_tasa desconectada del contador
✓ Mutación rechazada: probabilidad de purga de limite_tasa anulada
✓ Mutación rechazada: retención de idempotencia ampliada a 900 días
✓ Mutación rechazada: trabajo de retención sin borrado
✓ Mutación rechazada: CSRF omitido en conSesion
✓ Mutación rechazada: origen web confiado al Host falsificable
✓ Mutación rechazada: origen del portal confiado al Host falsificable
✓ Mutación rechazada: clave pública devuelta al alcance global
✓ Mutación rechazada: mesa omitida de la huella pública
✓ Mutación rechazada: ventana de presentación eliminada
✓ Mutación rechazada: desbloqueo de presentación sin consumo de cuota
✓ Mutación rechazada: plantilla anónima sin consumo de cuota de entrada
✓ Mutación rechazada: origen desconocido vuelve a saltarse la cuota
✓ Mutación rechazada: HSTS eliminada de Next
✓ Mutación rechazada: HSTS eliminada de la comprobación viva
✓ Mutación rechazada: correlación del middleware omitida en web
✓ Mutación rechazada: correlación del middleware omitida en comandos
✓ Mutación rechazada: correlación del middleware omitida en portal
✓ Mutación rechazada: registrador estructurado devuelto a texto libre
✓ Mutación rechazada: registro estructurado omitido en auditoria
✓ Mutación rechazada: registro estructurado omitido en comando
✓ Mutación rechazada: registro estructurado omitido en limite
✓ Mutación rechazada: registro estructurado omitido en portal comando
✓ Mutación rechazada: registro estructurado omitido en portal http
✓ Mutación rechazada: registro estructurado omitido en portal limite
✓ Mutación rechazada: registro estructurado omitido en http web
✓ Mutación rechazada: registro estructurado omitido en auth entrar
✓ Mutación rechazada: registro estructurado omitido en auth empleados
✓ Mutación rechazada: registro estructurado omitido en pool postgres
✓ Mutación rechazada: registro estructurado omitido en purga de cuotas
✓ Mutación rechazada: alerta del contador degradada en limite
✓ Mutación rechazada: alerta del contador degradada en portal limite
✓ Mutación rechazada: ensayo de restauracion dirigido a otro proyecto
✓ Mutación rechazada: destino de restauracion sin migraciones controladas
✓ Mutación rechazada: restauracion declarada sin comparar checksums
✓ Mutación rechazada: ensayo de restauración vuelve a fabricar pg_cron
✓ Mutación rechazada: avisos visuales dejan de tumbar la puerta de aspecto
✓ Mutación rechazada: metacaracteres ILIKE sin escapar
✓ Mutación rechazada: bitacora de sincronizacion reabierta a escritura directa
✓ Mutación rechazada: validacion URL retirada de las imagenes publicas
✓ Mutación rechazada: esquema URL degradado a texto
✓ Mutación rechazada: host TLS comparado sin parsear la URL
✓ Mutación rechazada: raices del sistema sustituidas por la de Supabase
✓ Mutación rechazada: subida de archivos abierta al rol mesero
✓ Mutación rechazada: limite de subida devuelto a agrupacion distinta de la organizacion
✓ Mutación rechazada: guardian multipart devuelto a JSON
✓ Mutación rechazada: tipo MIME de la subida confiado al navegador
✓ Mutación rechazada: limite de archivos elevado otra vez a 8 MiB
✓ Mutación rechazada: rechazo de reserva de cuota de archivos desactivado
✓ Mutación rechazada: FORCE RLS omitido del contador de cuota de archivos
✓ Mutación rechazada: límite condicional retirado del upsert de cuota de archivos
✓ Mutación rechazada: archivo nuevo guardado directamente como publico
✓ Mutación rechazada: tope dimensional de imagen elevado a 60000
✓ Mutación rechazada: recodificacion de imagen omitida
✓ Mutación rechazada: imagen de producto conservada privada al persistirla
✓ Mutación rechazada: limite visual de ImageUploader devuelto a 8 MiB
✓ Mutación rechazada: limite visual del menu QR devuelto a 8 MiB
$ node scripts/verificar-catalogo.mjs
{"mutacion":"truncar medio centavo","detectadaPor":["CAT-01/02 · precio de catálogo convierte 250 gramos antes de cobrar el precio por kilogramo","CAT-01/02 · precio de catálogo redondea medio centavo una sola vez al cerrar la línea"],"restaurada":true}
{"mutacion":"dinero por Number","detectadaPor":["CAT-01/02 · precio de catálogo no pierde enteros grandes al calcular dinero"],"restaurada":true}
{"mutacion":"excluir umbral mayoreo","detectadaPor":["CAT-01/02 · precio de catálogo aplica mayoreo desde el umbral, con interruptor explícito del servidor"],"restaurada":true}
{"mutacion":"ignorar interruptor mayoreo","detectadaPor":["CAT-01/02 · precio de catálogo aplica mayoreo desde el umbral, con interruptor explícito del servidor"],"restaurada":true}
{"mutacion":"permitir precio negativo","detectadaPor":["CAT-01/02 · precio de catálogo rechaza unidades incompatibles, porciones fraccionarias y precio negativo"],"restaurada":true}
{"mutacion":"permitir cantidad cero","detectadaPor":["CAT-01/02 · precio de catálogo rechaza piezas inválidas 0","CAT-01/02 · precio de catálogo rechaza configuraciones incoherentes aunque la cantidad de venta sea válida"],"restaurada":true}
{"mutacion":"permitir fracciones de piezas","detectadaPor":["CAT-01/02 · precio de catálogo rechaza piezas inválidas 0.5"],"restaurada":true}
{"mutacion":"omitir mínimo","detectadaPor":["CAT-01/02 · precio de catálogo respeta mínimo, máximo e incremento: 0.05"],"restaurada":true}
{"mutacion":"omitir máximo","detectadaPor":["CAT-01/02 · precio de catálogo respeta mínimo, máximo e incremento: 5.05"],"restaurada":true}
{"mutacion":"omitir incremento","detectadaPor":["CAT-01/02 · precio de catálogo respeta mínimo, máximo e incremento: 0.12","CAT-01/02 · precio de catálogo rechaza configuraciones incoherentes aunque la cantidad de venta sea válida"],"restaurada":true}
{"mutacion":"omitir capacidad","detectadaPor":["CAT-01/02 · precio de catálogo rechaza configuraciones incoherentes aunque la cantidad de venta sea válida"],"restaurada":true}
{"mutacion":"omitir escala al derivar porción","detectadaPor":["CAT-02 · equivalencias y contenedor deriva 46.875 ml exactos y da prioridad a los ml explícitos","CAT-02 · equivalencias y contenedor cobra porciones cuya medida se deriva del contenedor"],"restaurada":true}
{"mutacion":"omitir contenido del empaque","detectadaPor":["CAT-02 · equivalencias y contenedor convierte cajas con equivalencia explícita del catálogo"],"restaurada":true}
{"mutacion":"omitir unidad y entero de porciones","detectadaPor":["CAT-01/02 · precio de catálogo rechaza unidades incompatibles, porciones fraccionarias y precio negativo"],"restaurada":true}
{"mutacion":"mezclar dimensiones","detectadaPor":["CAT-02 · cantidades exactas y unidades no inventa equivalencia de kg a l","CAT-02 · cantidades exactas y unidades no inventa equivalencia de m a pieza","CAT-02 · cantidades exactas y unidades no inventa equivalencia de caja a pieza","CAT-02 · cantidades exactas y unidades no inventa equivalencia de paquete a caja","CAT-02 · equivalencias y contenedor no usa equivalencias cero ni corrige dimensiones estándar incompatibles","CAT-01/02 · precio de catálogo rechaza unidades incompatibles, porciones fraccionarias y precio negativo"],"restaurada":true}
{"mutacion":"omitir factor de conversión","detectadaPor":["CAT-02 · cantidades exactas y unidades convierte 1.2345 kg a g","CAT-02 · cantidades exactas y unidades convierte 0.125 l a ml","CAT-02 · cantidades exactas y unidades rechaza pérdida de precisión y desbordamiento al convertir","CAT-01/02 · precio de catálogo redondea medio centavo una sola vez al cerrar la línea"],"restaurada":true}
{"mutacion":"truncar cantidad de stock","detectadaPor":["CAT-02 · cantidades exactas y unidades rechaza pérdida de precisión y desbordamiento al convertir","CAT-02 · equivalencias y contenedor requiere medida explícita o una división exacta del contenedor"],"restaurada":true}
{"mutacion":"permitir desbordamiento","detectadaPor":["CAT-02 · cantidades exactas y unidades rechaza pérdida de precisión y desbordamiento al convertir"],"restaurada":true}
18 mutaciones detectadas; versión restaurada en verde.
$ node scripts/verificar-inventario.mjs
{"mutacion":"no crear existencia para venta negativa autorizada","detectadaPor":["INV-03 · repositorio de stock envía la política de negativo como parámetro de la misma guarda","INV-03 · repositorio de stock crea la existencia ausente y permite dejarla negativa cuando la política lo autoriza"],"restaurada":true}
{"mutacion":"sku sin conversión","detectadaPor":["INV-01 · consumo planeado descuenta el insumo espejo de un SKU en su unidad base","INV-01 · consumo planeado rechaza unidad incompatible sin corregir el dato en silencio"],"restaurada":true}
{"mutacion":"receta sin cantidad vendida","detectadaPor":["INV-01 · consumo planeado multiplica la receta por la cantidad vendida y aplica merma exacta","INV-01 · consumo planeado agrupa por insumo y conserva todos los orígenes con la política más restrictiva","INV-01 · consumo planeado no pierde precisión al multiplicar cantidades mayores que Number.MAX_SAFE_INTEGER"],"restaurada":true}
{"mutacion":"receta sin merma","detectadaPor":["INV-01 · consumo planeado multiplica la receta por la cantidad vendida y aplica merma exacta","INV-01 · consumo planeado rechaza merma que no cabe en cuatro decimales sin corregir el dato en silencio"],"restaurada":true}
{"mutacion":"variable sin conversión base","detectadaPor":["INV-01 · consumo planeado descuenta la cantidad variable convertida a la unidad base"],"restaurada":true}
{"mutacion":"porción usa contenedor completo","detectadaPor":["INV-01 · consumo planeado usa los ml calculados por porción y respeta la medida explícita"],"restaurada":true}
{"mutacion":"agrupación pierde consumos previos","detectadaPor":["INV-01 · consumo planeado agrupa por insumo y conserva todos los orígenes con la política más restrictiva"],"restaurada":true}
{"mutacion":"política negativa permisiva","detectadaPor":["INV-01 · consumo planeado agrupa por insumo y conserva todos los orígenes con la política más restrictiva"],"restaurada":true}
{"mutacion":"mezclar referencias de orden","detectadaPor":["INV-01 · consumo planeado rechaza mezclar órdenes para no fabricar una referencia ambigua"],"restaurada":true}
{"mutacion":"servicio descuenta o falla","detectadaPor":["INV-01 · consumo planeado no genera movimientos para servicios"],"restaurada":true}
{"mutacion":"merma trunca precisión","detectadaPor":["INV-01 · consumo planeado rechaza merma que no cabe en cuatro decimales sin corregir el dato en silencio"],"restaurada":true}
{"mutacion":"incrementar en una venta","detectadaPor":["INV-03 · repositorio de stock decrementa con una guarda atómica por organización y después inserta el ledger","INV-03 · repositorio de stock crea la existencia ausente y permite dejarla negativa cuando la política lo autoriza"],"restaurada":true}
{"mutacion":"omitir organización","detectadaPor":["INV-03 · repositorio de stock decrementa con una guarda atómica por organización y después inserta el ledger"],"restaurada":true}
{"mutacion":"omitir guarda de stock","detectadaPor":["INV-03 · repositorio de stock decrementa con una guarda atómica por organización y después inserta el ledger","INV-03 · repositorio de stock envía la política de negativo como parámetro de la misma guarda","INV-03 · repositorio de stock crea la existencia ausente y permite dejarla negativa cuando la política lo autoriza"],"restaurada":true}
{"mutacion":"forzar stock negativo","detectadaPor":["INV-03 · repositorio de stock decrementa con una guarda atómica por organización y después inserta el ledger"],"restaurada":true}
{"mutacion":"aceptar update sin fila","detectadaPor":["INV-03 · repositorio de stock decrementa con una guarda atómica por organización y después inserta el ledger","INV-03 · repositorio de stock falla sin insertar ledger cuando la guarda de stock no actualiza la fila","INV-03 · repositorio de stock envía la política de negativo como parámetro de la misma guarda","INV-03 · repositorio de stock crea la existencia ausente y permite dejarla negativa cuando la política lo autoriza","INV-03 · repositorio de stock ordena los bloqueos por saldo y escribe todos los movimientos en un solo insert"],"restaurada":true}
{"mutacion":"ledger con signo positivo","detectadaPor":["INV-03 · repositorio de stock decrementa con una guarda atómica por organización y después inserta el ledger"],"restaurada":true}
{"mutacion":"bloqueos sin orden estable","detectadaPor":["INV-03 · repositorio de stock ordena los bloqueos por saldo y escribe todos los movimientos en un solo insert"],"restaurada":true}
{"mutacion":"ledger omite movimientos","detectadaPor":["INV-03 · repositorio de stock ordena los bloqueos por saldo y escribe todos los movimientos en un solo insert"],"restaurada":true}
{"mutacion":"aceptar movimiento cero","detectadaPor":["INV-03 · repositorio de stock rechaza cantidades cero antes de tocar la base"],"restaurada":true}
20 mutaciones detectadas; versión restaurada en verde.
$ node scripts/verificar-comandos-catalogo.mjs
{"mutacion":"modificadores habilitados en todos los paquetes","detectadaPor":["comando() · paquete de la organización (A-42, prueba PAQ-01) un comando real de modificadores devuelve 403 fuera de cafetería/restaurante"],"restaurada":true}
{"mutacion":"precio de alta en cero","detectadaPor":["B-04 · comandos de producto crea el producto y su insumo espejo con dinero convertido en el servidor"],"restaurada":true}
{"mutacion":"costo de alta en cero","detectadaPor":["B-04 · comandos de producto crea el producto y su insumo espejo con dinero convertido en el servidor"],"restaurada":true}
{"mutacion":"costo actualizado en cero","detectadaPor":["B-04 · comandos de producto cambia precios por id y organización con centavos exactos"],"restaurada":true}
{"mutacion":"precio actualizado en cero","detectadaPor":["B-04 · comandos de producto cambia precios por id y organización con centavos exactos"],"restaurada":true}
{"mutacion":"extra de modificador en cero","detectadaPor":["B-04 · modificadores normalizados crea grupo, opciones con precio extra y vínculo al producto"],"restaurada":true}
{"mutacion":"precio fuera de la organización","detectadaPor":["B-04 · comandos de producto cambia precios por id y organización con centavos exactos"],"restaurada":true}
{"mutacion":"configuración sin versión esperada","detectadaPor":["B-05 · configuración por organización cambia sólo sus secciones y conserva el resto del documento"],"restaurada":true}
{"mutacion":"paquete efectivo ignorado al leer","detectadaPor":["B-05 · configuración por organización lee una sola fila y completa valores ausentes con defaults versionados"],"restaurada":true}
9 mutaciones detectadas; versión restaurada en verde.
$ node scripts/verificar-comandos-inventario.mjs
{"mutacion":"inventario inicial sobrescribe saldo","detectadaPor":["B-11 · SQL de movimientos de inventario el inventario inicial acumula el saldo y escribe el ledger"],"restaurada":true}
{"mutacion":"inventario inicial pierde tipo de ledger","detectadaPor":["B-11 · SQL de movimientos de inventario el inventario inicial acumula el saldo y escribe el ledger"],"restaurada":true}
{"mutacion":"ajuste omite guarda negativa","detectadaPor":["B-11 · SQL de movimientos de inventario el ajuste suma el delta con guarda y registra un movimiento"],"restaurada":true}
{"mutacion":"costeo ignora cantidad","detectadaPor":["B-12 · SQL de costeo por receta multiplica costo por cantidad y merma antes de actualizar productos"],"restaurada":true}
{"mutacion":"costeo ignora merma","detectadaPor":["B-12 · SQL de costeo por receta multiplica costo por cantidad y merma antes de actualizar productos"],"restaurada":true}
5 mutaciones detectadas; versión restaurada en verde.
$ node scripts/verificar-venta.mjs
✓ base: 15 contratos y la suite en verde.
✓ destructiva «tomar el folio antes de descontar el stock» → cae stock_antes_de_folio
✓ destructiva «cotizar fuera de la transacción del cobro» → cae cotiza_dentro_de_la_transaccion
✓ destructiva «cobrar sin comprobar que el total sigue vigente» → cae exige_total_vigente
✓ destructiva «cobrar con la caja cerrada» → cae no_cobra_sin_caja
✓ destructiva «aceptar pagos que superen el total» → cae pago_suma_exacta
✓ destructiva «devolver cambio en tarjeta» → cae cambio_solo_en_efectivo
✓ destructiva «cobrar dos veces la misma orden (quitando la guarda)» → cae marcar_pagada_guarda_estado_cobrable
✓ destructiva «cobrar dos veces admitiendo «pagada» como estado cobrable» → cae marcar_pagada_guarda_estado_cobrable
✓ destructiva «tomar el folio leyendo y luego escribiendo» → cae folio_atomico
✓ destructiva «esperar «fondo + ventas en efectivo» (no resta los retiros)» → cae esperado_es_la_suma_de_movimientos
✓ destructiva «leer el esperado de una columna almacenada» → cae arqueo_no_lee_totales_almacenados
✓ destructiva «abrir la caja sin registrar el fondo como movimiento» → cae apertura_registra_el_fondo
✓ destructiva «cobrar en efectivo sin registrar el movimiento de caja» → cae cobro_registra_el_efectivo_en_caja
✓ destructiva «cerrar la caja antes de derivar su arqueo» → cae arqueo_dentro_del_cierre
✓ destructiva «aceptar GET en una ruta de comando» → cae ruta_de_comando_solo_post
✓ destructiva «dejar que el cliente mande el precio de la línea» → cae agregar_linea_no_acepta_importes
✓ destructiva «cobrar de menos aceptando que falte dinero» → 1 prueba(s) en rojo
✓ destructiva «no comprobar que el efectivo recibido alcance» → 1 prueba(s) en rojo
✓ destructiva «aceptar un renglón de pago en cero» → 1 prueba(s) en rojo
✓ destructiva «truncar la cantidad a entero (media res costaría cero)» → 5 prueba(s) en rojo
✓ destructiva «redondear el medio centavo hacia abajo» → 2 prueba(s) en rojo
✓ destructiva «perder el signo en una devolución» → 1 prueba(s) en rojo
✓ destructiva «sumar el IVA en vez de extraerlo de un precio que ya lo incluye» → 3 prueba(s) en rojo
✓ destructiva «dejar que el descuento haga el total negativo» → 1 prueba(s) en rojo
✓ inocua «una línea en blanco de más en el cobro» → todo sigue en verde
✓ inocua «partir la guarda del estado cobrable en varias líneas» → todo sigue en verde
✓ inocua «renombrar un local del reparto de pagos» → todo sigue en verde

15 contratos · 16 destructivas de contrato · 8 destructivas de prueba · 3 inocuas. Árbol restaurado.
$ node scripts/verificar-identidad.mjs
✓ base: 11 contratos y la suite en verde.
✓ destructiva «quitar la guarda de forma y volver al catch que lo traga todo» → cae verificar_no_traga_errores_de_llamada
✓ destructiva «dejar que el cliente diga en que negocio entra» → cae la_organizacion_no_viene_del_cliente
✓ destructiva «dar de alta la caja ANTES de comprobar el PIN» → cae la_terminal_se_crea_despues_de_verificar_el_pin
✓ destructiva «comprobar el PIN aunque la credencial esté bloqueada» → cae bloqueo_antes_de_comprobar_el_pin
✓ destructiva «firmar la sesión sin releer el ámbito» → cae el_ambito_se_relee_de_la_base
✓ destructiva «poner PIN a un empleado de otra organización» → cae establecer_pin_filtra_por_organizacion
✓ destructiva «auditar el hash del PIN junto al cambio» → cae establecer_pin_no_audita_el_pin
✓ destructiva «guardar el token del dispositivo en claro» → cae el_token_del_dispositivo_se_guarda_hasheado
✓ destructiva «devolver el hash del PIN en la lista de accesos» → cae la_consulta_de_accesos_no_devuelve_el_hash
✓ destructiva «seleccionar el hash también en la lista de empleados» → cae solo_credencial_para_verificar_lee_el_hash
✓ destructiva «guardar el PIN del arranque sin hashear» → cae el_arranque_hashea_con_argon2
✓ destructiva «devolver la pimienta a Buffer (el fallo que impidió entrar)» → 3 prueba(s) en rojo
✓ destructiva «la pimienta deja de mezclarse (el hash no depende de ella)» → 1 prueba(s) en rojo
✓ destructiva «verificar acepta cualquier PIN» → 3 prueba(s) en rojo
✓ destructiva «bajar Argon2id a parámetros de juguete» → 1 prueba(s) en rojo
✓ destructiva «aceptar PIN de tres dígitos» → 1 prueba(s) en rojo
✓ destructiva «quitar el tope del bloqueo (lockout como negación de servicio)» → 1 prueba(s) en rojo
✓ inocua «una línea en blanco de más en pin.ts» → todo sigue en verde
✓ inocua «partir el where de la organización en cuatro líneas» → todo sigue en verde
✓ inocua «renombrar un local del arranque» → todo sigue en verde

11 contratos · 11 destructivas de contrato · 6 destructivas de prueba · 3 inocuas. Árbol restaurado.
$ node scripts/verificar-paquetes.mjs
✓ base: 2 contratos y la suite en verde.
✓ destructiva «volver a escribir la lista de paquetes a mano» → cae ningun_comando_escribe_la_lista_a_mano
✓ destructiva «abrir recetas a todos los paquetes» → 1 prueba(s) en rojo
✓ inocua «una línea en blanco de más en recetas» → todo sigue en verde

2 contratos · 1 destructivas de contrato · 1 destructivas de prueba · 1 inocuas. Árbol restaurado.
$ turbo run build
• turbo 2.10.12

   • Packages in scope: @morphiqpos/app, @morphiqpos/contracts, @morphiqpos/data, @morphiqpos/domain, @morphiqpos/testing, @morphiqpos/ui, @morphiqpos/web
   • Running build in 7 packages
   • Remote caching disabled, using shared worktree cache

@morphiqpos/web:build: cache miss, executing b63b306d07fe68fa
@morphiqpos/web:build: $ next build
@morphiqpos/web:build: ▲ Next.js 16.3.4 (Turbopack)
@morphiqpos/web:build: ✓ Running next.config.mjs took 182ms
@morphiqpos/web:build: 
@morphiqpos/web:build: ⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
@morphiqpos/web:build: 
@morphiqpos/web:build:   To migrate automatically, run:
@morphiqpos/web:build:   npx @next/codemod@canary middleware-to-proxy .
@morphiqpos/web:build: 
@morphiqpos/web:build:   Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
@morphiqpos/web:build:   Creating an optimized production build ...
@morphiqpos/web:build: ✓ Compiled successfully in 81s
@morphiqpos/web:build:   Running TypeScript ...
@morphiqpos/web:build:   Finished TypeScript in 9.9s ...
@morphiqpos/web:build:   Collecting page data using 7 workers ...
@morphiqpos/web:build:   Generating static pages using 7 workers (0/55) ...
@morphiqpos/web:build:   Generating static pages using 7 workers (13/55) 
@morphiqpos/web:build:   Generating static pages using 7 workers (27/55) 
@morphiqpos/web:build:   Generating static pages using 7 workers (41/55) 
@morphiqpos/web:build: ✓ Generating static pages using 7 workers (55/55) in 385ms
@morphiqpos/web:build:   Finalizing page optimization ...
@morphiqpos/web:build: 
@morphiqpos/web:build: Route (app)
@morphiqpos/web:build: ┌ ƒ /
@morphiqpos/web:build: ├ ƒ /_not-found
@morphiqpos/web:build: ├ ƒ /api/archivos/[...ruta]
@morphiqpos/web:build: ├ ƒ /api/archivos/subir
@morphiqpos/web:build: ├ ƒ /api/auth/empleados
@morphiqpos/web:build: ├ ƒ /api/auth/entrar
@morphiqpos/web:build: ├ ƒ /api/auth/salir
@morphiqpos/web:build: ├ ƒ /api/caja/abrir
@morphiqpos/web:build: ├ ƒ /api/caja/cerrar
@morphiqpos/web:build: ├ ƒ /api/caja/corte-turno
@morphiqpos/web:build: ├ ƒ /api/caja/eliminar-corte
@morphiqpos/web:build: ├ ƒ /api/caja/encolar-sincronizacion
@morphiqpos/web:build: ├ ƒ /api/caja/estado
@morphiqpos/web:build: ├ ƒ /api/caja/movimiento
@morphiqpos/web:build: ├ ƒ /api/catalogo/categorias
@morphiqpos/web:build: ├ ƒ /api/catalogo/configuracion
@morphiqpos/web:build: ├ ƒ /api/catalogo/crear-producto
@morphiqpos/web:build: ├ ƒ /api/catalogo/demostracion/resetear
@morphiqpos/web:build: ├ ƒ /api/catalogo/inicio
@morphiqpos/web:build: ├ ƒ /api/catalogo/modificadores
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos/actualizar
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos/codigo
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos/crear
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos/precio
@morphiqpos/web:build: ├ ƒ /api/catalogo/sesion
@morphiqpos/web:build: ├ ƒ /api/compras/plantilla
@morphiqpos/web:build: ├ ƒ /api/compras/plantilla/usar
@morphiqpos/web:build: ├ ƒ /api/compras/registrar
@morphiqpos/web:build: ├ ƒ /api/configuracion/paquete
@morphiqpos/web:build: ├ ƒ /api/configuracion/presentacion
@morphiqpos/web:build: ├ ƒ /api/configuracion/presentacion-contrasena
@morphiqpos/web:build: ├ ƒ /api/datos/consultar
@morphiqpos/web:build: ├ ƒ /api/datos/escribir
@morphiqpos/web:build: ├ ƒ /api/gastos/plantilla
@morphiqpos/web:build: ├ ƒ /api/gastos/registrar
@morphiqpos/web:build: ├ ƒ /api/identidad/accesos
@morphiqpos/web:build: ├ ƒ /api/identidad/empleados
@morphiqpos/web:build: ├ ƒ /api/identidad/pin
@morphiqpos/web:build: ├ ƒ /api/inventario/ajustar
@morphiqpos/web:build: ├ ƒ /api/inventario/almacenes/crear
@morphiqpos/web:build: ├ ƒ /api/inventario/inicial
@morphiqpos/web:build: ├ ƒ /api/inventario/insumos/costo
@morphiqpos/web:build: ├ ƒ /api/inventario/insumos/crear
@morphiqpos/web:build: ├ ƒ /api/inventario/recetas
@morphiqpos/web:build: ├ ƒ /api/inventario/recetas/eliminar
@morphiqpos/web:build: ├ ƒ /api/inventario/resumen
@morphiqpos/web:build: ├ ƒ /api/mantenimiento/purgar-seccion
@morphiqpos/web:build: ├ ƒ /api/mantenimiento/purgar-ventas
@morphiqpos/web:build: ├ ƒ /api/mantenimiento/reiniciar-pruebas
@morphiqpos/web:build: ├ ƒ /api/mantenimiento/reiniciar-todo
@morphiqpos/web:build: ├ ƒ /api/mantenimiento/vaciar-mesas
@morphiqpos/web:build: ├ ƒ /api/propinas/liquidar
@morphiqpos/web:build: ├ ƒ /api/propinas/pendientes
@morphiqpos/web:build: ├ ƒ /api/publico/archivo/[...ruta]
@morphiqpos/web:build: ├ ƒ /api/publico/qr/[token]
@morphiqpos/web:build: ├ ƒ /api/publico/qr/[token]/cuenta
@morphiqpos/web:build: ├ ƒ /api/publico/qr/[token]/mesa
@morphiqpos/web:build: ├ ƒ /api/publico/qr/[token]/pedido
@morphiqpos/web:build: ├ ƒ /api/publico/qr/[token]/solicitud
@morphiqpos/web:build: ├ ƒ /api/publico/qr/[token]/valoracion
@morphiqpos/web:build: ├ ƒ /api/restaurante/abrir-mesa
@morphiqpos/web:build: ├ ƒ /api/restaurante/asignar-mesero
@morphiqpos/web:build: ├ ƒ /api/restaurante/atender-solicitud
@morphiqpos/web:build: ├ ƒ /api/restaurante/cancelar-orden
@morphiqpos/web:build: ├ ƒ /api/restaurante/crear-estacion
@morphiqpos/web:build: ├ ƒ /api/restaurante/entregar-pedidos
@morphiqpos/web:build: ├ ƒ /api/restaurante/enviar-pedido
@morphiqpos/web:build: ├ ƒ /api/restaurante/liberar-mesa
@morphiqpos/web:build: ├ ƒ /api/restaurante/limpiar-solicitudes
@morphiqpos/web:build: ├ ƒ /api/restaurante/rotar-qr
@morphiqpos/web:build: ├ ƒ /api/restaurante/solicitar-cuenta
@morphiqpos/web:build: ├ ƒ /api/restaurante/transicionar-pedido
@morphiqpos/web:build: ├ ƒ /api/restaurante/vaciar-solicitudes
@morphiqpos/web:build: ├ ƒ /api/venta/agregar-linea
@morphiqpos/web:build: ├ ƒ /api/venta/buscar
@morphiqpos/web:build: ├ ƒ /api/venta/cambiar-cantidad
@morphiqpos/web:build: ├ ƒ /api/venta/cobrar
@morphiqpos/web:build: ├ ƒ /api/venta/crear-orden
@morphiqpos/web:build: ├ ƒ /api/venta/estado
@morphiqpos/web:build: ├ ƒ /api/venta/quitar-linea
@morphiqpos/web:build: ├ ƒ /api/venta/ticket
@morphiqpos/web:build: ├ ƒ /caja
@morphiqpos/web:build: ├ ƒ /cocina
@morphiqpos/web:build: ├ ƒ /compras
@morphiqpos/web:build: ├ ƒ /configuracion
@morphiqpos/web:build: ├ ƒ /corte-caja
@morphiqpos/web:build: ├ ƒ /inventario
@morphiqpos/web:build: ├ ƒ /login-pos
@morphiqpos/web:build: ├ ƒ /mesas
@morphiqpos/web:build: ├ ƒ /mesero
@morphiqpos/web:build: ├ ƒ /portal-qr
@morphiqpos/web:build: ├ ƒ /pos
@morphiqpos/web:build: ├ ƒ /productos
@morphiqpos/web:build: ├ ƒ /qr/[token]
@morphiqpos/web:build: ├ ƒ /recetas
@morphiqpos/web:build: ├ ƒ /registros
@morphiqpos/web:build: └ ƒ /ventas
@morphiqpos/web:build: 
@morphiqpos/web:build: 
@morphiqpos/web:build: ƒ Proxy (Middleware)
@morphiqpos/web:build: 
@morphiqpos/web:build: ƒ  (Dynamic)  server-rendered on demand
@morphiqpos/web:build: 

 Tasks:    1 successful, 1 total
Cached:    0 cached, 1 total
  Time:    1m47.757s 

$ node scripts/verificar-cabeceras.mjs
✓ Cabeceras de seguridad: 6 presentes y correctas, nonce por peticion.
```

## 3. Evidencia de `verify:lecturas`

La primera ejecución ocurrió antes de reparar T2 y antes de declarar excepciones. Detectó 415 accesos y terminó con código `1`; por tanto, la puerta demostró que no daba un falso verde.

Salida roja completa:

```text
$ node scripts/verificar-lecturas.mjs
Lecturas prohibidas: 415 acceso(s) a campos descartados por el puente.
  apps/web/heredado/components/barcode/BarcodeScanner.jsx:416 · items (PedidoPreparacion) · items={miniCart.items}
  apps/web/heredado/components/barcode/ScannerMiniCart.jsx:23 · items (PedidoPreparacion) · items = [],
  apps/web/heredado/components/caja/CierreDiarioDialog.jsx:335 · fecha_apertura (Venta) · {cajaAbierta?.fecha_apertura &&
  apps/web/heredado/components/caja/CierreDiarioDialog.jsx:336 · fecha_apertura (Venta) · ` Apertura: ${new Date(cajaAbierta.fecha_apertura).toLocaleString('es-MX')}`}
  apps/web/heredado/components/cocina/CocinaKanbanCard.jsx:42 · fecha_creacion (PedidoPreparacion, SolicitudQR) · const fecha = pedido?.fecha_creacion;
  apps/web/heredado/components/cocina/CocinaKanbanCard.jsx:50 · items (PedidoPreparacion) · const items = Array.isArray(pedido?.items) ? pedido.items : [];
  apps/web/heredado/components/cocina/CocinaKanbanCard.jsx:50 · items (PedidoPreparacion) · const items = Array.isArray(pedido?.items) ? pedido.items : [];
  apps/web/heredado/components/cocina/CocinaKanbanCard.jsx:190 · producto_id (DescuentoInventarioVenta) · {item?.producto_id && (
  apps/web/heredado/components/cocina/CocinaMesaGroupCard.jsx:29 · fecha_creacion (PedidoPreparacion, SolicitudQR) · .map((p) => p?.fecha_creacion)
  apps/web/heredado/components/cocina/CocinaMesaGroupCard.jsx:51 · items (PedidoPreparacion) · const items = Array.isArray(p?.items) ? p.items : [];
  apps/web/heredado/components/cocina/CocinaMesaGroupCard.jsx:51 · items (PedidoPreparacion) · const items = Array.isArray(p?.items) ? p.items : [];
  apps/web/heredado/components/cocina/CocinaNuevoPedidoWatcher.jsx:82 · items (PedidoPreparacion) · ? `Mesa ${p.mesa_numero} — ${(p.items || []).length} producto(s)`
  apps/web/heredado/components/cocina/CocinaNuevoPedidoWatcher.jsx:83 · items (PedidoPreparacion) · : `Mostrador — ${(p.items || []).length} producto(s)`;
  apps/web/heredado/components/cocina/CocinaNuevoPedidoWatcher.jsx:91 · items (PedidoPreparacion) · fraseNuevoPedidoCocina(p.mesa_numero, p.items, p.notas, {
  apps/web/heredado/components/cocina/CocinaPedidoCardCompact.jsx:24 · items (PedidoPreparacion) · const items = pedido.items || [];
  apps/web/heredado/components/cocina/CocinaPedidoCardCompact.jsx:53 · fecha_creacion (PedidoPreparacion, SolicitudQR) · {pedido.fecha_creacion
  apps/web/heredado/components/cocina/CocinaPedidoCardCompact.jsx:54 · fecha_creacion (PedidoPreparacion, SolicitudQR) · ? formatDistanceToNow(new Date(pedido.fecha_creacion), {
  apps/web/heredado/components/cocina/CocinaPedidoCardPremium.jsx:104 · fecha_creacion (PedidoPreparacion, SolicitudQR) · const fecha = pedido?.fecha_creacion;
  apps/web/heredado/components/cocina/CocinaPedidoCardPremium.jsx:112 · items (PedidoPreparacion) · const items = Array.isArray(pedido?.items) ? pedido.items : [];
  apps/web/heredado/components/cocina/CocinaPedidoCardPremium.jsx:112 · items (PedidoPreparacion) · const items = Array.isArray(pedido?.items) ? pedido.items : [];
  apps/web/heredado/components/cocina/CocinaPedidoCardPremium.jsx:224 · estacion_preparacion_nombre (CategoriaProducto) · pedido?.estacion_preparacion_nombre ||
  apps/web/heredado/components/cocina/CocinaPedidoCardPremium.jsx:225 · estacion_preparacion_id (CategoriaProducto) · (pedido?.estacion_preparacion_id ? 'Estación' : 'Cocina general');
  apps/web/heredado/components/cocina/CocinaPedidoCardPremium.jsx:226 · estacion_preparacion_color (CategoriaProducto) · const colorEst = pedido?.estacion_preparacion_color || '#4A5568';
  apps/web/heredado/components/cocina/CocinaPedidoCardPremium.jsx:323 · modificadores (ProductoTerminado) · const modificadoresArr = Array.isArray(item?.modificadores)
  apps/web/heredado/components/cocina/CocinaPedidoCardPremium.jsx:324 · modificadores (ProductoTerminado) · ? item.modificadores
  apps/web/heredado/components/cocina/CocinaPedidoCardPremium.jsx:380 · producto_id (DescuentoInventarioVenta) · {item?.producto_id && (
  apps/web/heredado/components/cocina/CocinaProductoDialog.jsx:21 · producto_id (DescuentoInventarioVenta) · const productoId = item?.producto_id;
  apps/web/heredado/components/cocina/CocinaProductoDialog.jsx:65 · descripcion (CategoriaIngrediente, CategoriaProducto) · {producto?.descripcion && (
  apps/web/heredado/components/cocina/CocinaProductoDialog.jsx:70 · descripcion (CategoriaIngrediente, CategoriaProducto) · <p className="text-sm text-slate-700">{producto.descripcion}</p>
  apps/web/heredado/components/cocina/CocinaStationMiniCard.jsx:36 · items (PedidoPreparacion) · const items = Array.isArray(pedido?.items) ? pedido.items : [];
  apps/web/heredado/components/cocina/CocinaStationMiniCard.jsx:36 · items (PedidoPreparacion) · const items = Array.isArray(pedido?.items) ? pedido.items : [];
  apps/web/heredado/components/cocina/CocinaStationMiniCard.jsx:38 · estacion_preparacion_nombre (CategoriaProducto) · pedido?.estacion_preparacion_nombre ||
  apps/web/heredado/components/cocina/CocinaStationMiniCard.jsx:39 · estacion_preparacion_id (CategoriaProducto) · (pedido?.estacion_preparacion_id ? 'Estación' : 'Cocina general');
  apps/web/heredado/components/cocina/CocinaStationMiniCard.jsx:40 · estacion_preparacion_color (CategoriaProducto) · const colorEst = pedido?.estacion_preparacion_color || '#4A5568';
  apps/web/heredado/components/cocina/CocinaStationMiniCard.jsx:146 · modificadores (ProductoTerminado) · const modificadoresArr = Array.isArray(item?.modificadores)
  apps/web/heredado/components/cocina/CocinaStationMiniCard.jsx:147 · modificadores (ProductoTerminado) · ? item.modificadores
  apps/web/heredado/components/common/PedidoListoWatcher.jsx:128 · estacion_preparacion_nombre (CategoriaProducto) · const estacionNombre = (p?.estacion_preparacion_nombre || '').trim();
  apps/web/heredado/components/compras/PlantillaGastoDialog.jsx:73 · metodo_pago (Venta) · metodo_pago: plantilla.metodo_pago || 'efectivo',
  apps/web/heredado/components/compras/PlantillaGastoDialog.jsx:114 · metodo_pago (Venta) · metodoPago: form.metodo_pago,
  apps/web/heredado/components/compras/PlantillaGastoDialog.jsx:205 · metodo_pago (Venta) · value={form.metodo_pago}
  apps/web/heredado/components/compras/PlantillasGastoSection.jsx:117 · fecha (MovimientoInventario, DescuentoInventarioVenta) · (g) => (g.fecha || '').slice(0, 7) === mesActual,
  apps/web/heredado/components/compras/PlantillasGastoSection.jsx:298 · fecha (MovimientoInventario, DescuentoInventarioVenta) · {confirmDup?.existente?.fecha || ''} por{' '}
  apps/web/heredado/components/compras/PlantillasGastoSection.jsx:146 · metodo_pago (Venta) · metodoPago: plantilla.metodo_pago || 'efectivo',
  apps/web/heredado/components/compras/RegistrarCompraDialog.jsx:50 · fecha (MovimientoInventario, DescuentoInventarioVenta) · const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  apps/web/heredado/components/compras/RegistrarGastoDialog.jsx:66 · descripcion (CategoriaIngrediente, CategoriaProducto) · if (!form.descripcion.trim() || !monto || monto <= 0) {
  apps/web/heredado/components/compras/RegistrarGastoDialog.jsx:85 · descripcion (CategoriaIngrediente, CategoriaProducto) · descripcion: form.descripcion.trim(),
  apps/web/heredado/components/compras/RegistrarGastoDialog.jsx:137 · descripcion (CategoriaIngrediente, CategoriaProducto) · value={form.descripcion}
  apps/web/heredado/components/compras/RegistrarGastoDialog.jsx:83 · fecha (MovimientoInventario, DescuentoInventarioVenta) · fecha: form.fecha,
  apps/web/heredado/components/compras/RegistrarGastoDialog.jsx:157 · fecha (MovimientoInventario, DescuentoInventarioVenta) · value={form.fecha}
  apps/web/heredado/components/compras/RegistrarGastoDialog.jsx:87 · metodo_pago (Venta) · metodoPago: form.metodo_pago,
  apps/web/heredado/components/compras/RegistrarGastoDialog.jsx:166 · metodo_pago (Venta) · value={form.metodo_pago}
  apps/web/heredado/components/compras/RepetirCompraDialog.jsx:87 · fecha (MovimientoInventario, DescuentoInventarioVenta) · !q || (c?.proveedor_nombre || '').toLowerCase().includes(q) || (c?.fecha || '').includes(q),
  apps/web/heredado/components/compras/RepetirCompraDialog.jsx:238 · fecha (MovimientoInventario, DescuentoInventarioVenta) · {c.fecha ? format(new Date(c.fecha), 'd MMM yyyy', { locale: es }) : ''}
  apps/web/heredado/components/compras/RepetirCompraDialog.jsx:238 · fecha (MovimientoInventario, DescuentoInventarioVenta) · {c.fecha ? format(new Date(c.fecha), 'd MMM yyyy', { locale: es }) : ''}
  apps/web/heredado/components/compras/RepetirCompraDialog.jsx:136 · metodo_pago (Venta) · metodoPago: compra.metodo_pago || 'efectivo',
  apps/web/heredado/components/compras/RepetirCompraDialog.jsx:240 · metodo_pago (Venta) · {c.metodo_pago ? ` · ${c.metodo_pago}` : ''}
  apps/web/heredado/components/compras/RepetirCompraDialog.jsx:240 · metodo_pago (Venta) · {c.metodo_pago ? ` · ${c.metodo_pago}` : ''}
  apps/web/heredado/components/configuracion/CategoriasProductoSection.jsx:147 · estacion_preparacion_id (CategoriaProducto) · estacion_id: categoria?.estacion_preparacion_id || '',
  apps/web/heredado/components/configuracion/CategoriasProductoSection.jsx:230 · estacion_preparacion_id (CategoriaProducto) · const id = categoria?.estacion_preparacion_id || '';
  apps/web/heredado/components/configuracion/CategoriasProductoSection.jsx:247 · estacion_preparacion_color (CategoriaProducto) · const color = est?.color || categoria?.estacion_preparacion_color || COCINA_GENERAL_COLOR;
  apps/web/heredado/components/configuracion/CategoriasProductoSection.jsx:248 · estacion_preparacion_nombre (CategoriaProducto) · const label = est?.nombre || categoria?.estacion_preparacion_nombre || '—';
  apps/web/heredado/components/configuracion/EstacionesPreparacionSection.jsx:93 · estacion_preparacion_id (CategoriaProducto) · const id = c?.estacion_preparacion_id || null;
  apps/web/heredado/components/configuracion/EstacionesPreparacionSection.jsx:265 · estacion_preparacion_id (CategoriaProducto) · (c) => c?.estacion_preparacion_id === estacion.id,
  apps/web/heredado/components/configuracion/EstacionesPreparacionSection.jsx:130 · descripcion (CategoriaIngrediente, CategoriaProducto) · descripcion: estacion?.descripcion || '',
  apps/web/heredado/components/configuracion/EstacionesPreparacionSection.jsx:153 · descripcion (CategoriaIngrediente, CategoriaProducto) · descripcion: form.descripcion || '',
  apps/web/heredado/components/configuracion/EstacionesPreparacionSection.jsx:166 · descripcion (CategoriaIngrediente, CategoriaProducto) · descripcion: form.descripcion || '',
  apps/web/heredado/components/configuracion/EstacionesPreparacionSection.jsx:195 · descripcion (CategoriaIngrediente, CategoriaProducto) · descripcion: form.descripcion || '',
  apps/web/heredado/components/configuracion/EstacionesPreparacionSection.jsx:387 · descripcion (CategoriaIngrediente, CategoriaProducto) · {e?.descripcion ? ` · ${e.descripcion}` : ''}
  apps/web/heredado/components/configuracion/EstacionesPreparacionSection.jsx:387 · descripcion (CategoriaIngrediente, CategoriaProducto) · {e?.descripcion ? ` · ${e.descripcion}` : ''}
  apps/web/heredado/components/configuracion/EstacionesPreparacionSection.jsx:468 · descripcion (CategoriaIngrediente, CategoriaProducto) · value={form.descripcion}
  apps/web/heredado/components/configuracion/ModoPresentacion.jsx:206 · descripcion (CategoriaIngrediente, CategoriaProducto) · {PACKAGE_FLOW[key].descripcion}
  apps/web/heredado/components/configuracion/UsuarioPOSDialog.jsx:128 · estacion_preparacion_id (CategoriaProducto) · estacion_preparacion_id: user?.estacion_preparacion_id || '',
  apps/web/heredado/components/configuracion/UsuarioPOSDialog.jsx:152 · estacion_preparacion_id (CategoriaProducto) · const id = form.estacion_preparacion_id;
  apps/web/heredado/components/configuracion/UsuarioPOSDialog.jsx:155 · estacion_preparacion_id (CategoriaProducto) · }, [mostrarEstacion, form.estacion_preparacion_id, estacionesArr]);
  apps/web/heredado/components/configuracion/UsuarioPOSDialog.jsx:205 · estacion_preparacion_id (CategoriaProducto) · const tieneEstacion = !!form.estacion_preparacion_id;
  apps/web/heredado/components/configuracion/UsuarioPOSDialog.jsx:239 · estacion_preparacion_id (CategoriaProducto) · if (!puedeTodas && form.estacion_preparacion_id) {
  apps/web/heredado/components/configuracion/UsuarioPOSDialog.jsx:240 · estacion_preparacion_id (CategoriaProducto) · const est = estacionesArr.find((e) => e?.id === form.estacion_preparacion_id);
  apps/web/heredado/components/configuracion/UsuarioPOSDialog.jsx:241 · estacion_preparacion_id (CategoriaProducto) · estacionId = form.estacion_preparacion_id;
  apps/web/heredado/components/configuracion/UsuarioPOSDialog.jsx:269 · estacion_preparacion_id (CategoriaProducto) · return form.estacion_preparacion_id || '';
  apps/web/heredado/components/cortes/CorteAutoDownloader.jsx:31 · fecha_inicio (CorteCaja) · const inicio = corte.fecha_inicio ? new Date(corte.fecha_inicio).getTime() : 0;
  apps/web/heredado/components/cortes/CorteAutoDownloader.jsx:31 · fecha_inicio (CorteCaja) · const inicio = corte.fecha_inicio ? new Date(corte.fecha_inicio).getTime() : 0;
  apps/web/heredado/components/cortes/CorteAutoDownloader.jsx:55 · fecha_inicio (CorteCaja) · if (!v.corte_caja_id && corte.fecha_inicio) {
  apps/web/heredado/components/cortes/CorteAutoDownloader.jsx:56 · fecha_inicio (CorteCaja) · const dayCorte = corte.fecha_inicio.slice(0, 10);
  apps/web/heredado/components/cortes/CorteAutoDownloader.jsx:57 · fecha_apertura (Venta) · const dayVenta = (v.fecha_apertura || v.fecha_cierre || '').slice(0, 10);
  apps/web/heredado/components/cortes/CorteAutoDownloader.jsx:114 · producto_id (DescuentoInventarioVenta) · (r) => r.producto_id === det.producto_id && r.activo !== false,
  apps/web/heredado/components/cortes/CorteAutoDownloader.jsx:114 · producto_id (DescuentoInventarioVenta) · (r) => r.producto_id === det.producto_id && r.activo !== false,
  apps/web/heredado/components/cortes/CorteHistorialList.jsx:151 · total_efectivo (CorteCaja) · <Stat label="Efectivo" v={c.total_efectivo} />
  apps/web/heredado/components/cortes/CorteHistorialList.jsx:152 · total_tarjeta (CorteCaja) · <Stat label="Tarjeta" v={c.total_tarjeta} />
  apps/web/heredado/components/cortes/CorteHistorialList.jsx:153 · total_transferencia (CorteCaja) · <Stat label="Transfer." v={c.total_transferencia} />
  apps/web/heredado/components/cortes/CorteHistorialList.jsx:157 · total_general (CorteCaja) · <p className="font-heading font-black">{formatCurrency(c.total_general)}</p>
  apps/web/heredado/components/cortes/CorteHistorialList.jsx:158 · numero_ventas (CorteCaja, LiquidacionPropina) · <p className="text-xs text-muted-foreground">{c.numero_ventas || 0} tickets</p>
  apps/web/heredado/components/cortes/CorteViewerDialog.jsx:36 · fecha_inicio (CorteCaja) · const inicio = corte.fecha_inicio ? new Date(corte.fecha_inicio).getTime() : 0;
  apps/web/heredado/components/cortes/CorteViewerDialog.jsx:36 · fecha_inicio (CorteCaja) · const inicio = corte.fecha_inicio ? new Date(corte.fecha_inicio).getTime() : 0;
  apps/web/heredado/components/cortes/CorteViewerDialog.jsx:59 · fecha_inicio (CorteCaja) · if (!v.corte_caja_id && corte.fecha_inicio) {
  apps/web/heredado/components/cortes/CorteViewerDialog.jsx:60 · fecha_inicio (CorteCaja) · const dayCorte = corte.fecha_inicio.slice(0, 10);
  apps/web/heredado/components/cortes/CorteViewerDialog.jsx:61 · fecha_apertura (Venta) · const dayVenta = (v.fecha_apertura || v.fecha_cierre || '').slice(0, 10);
  apps/web/heredado/components/cortes/CorteViewerDialog.jsx:72 · fecha_apertura (Venta) · : v.fecha_apertura
  apps/web/heredado/components/cortes/CorteViewerDialog.jsx:73 · fecha_apertura (Venta) · ? new Date(v.fecha_apertura).getTime()
  apps/web/heredado/components/cortes/CorteViewerDialog.jsx:125 · producto_id (DescuentoInventarioVenta) · (r) => r.producto_id === det.producto_id && r.activo !== false,
  apps/web/heredado/components/cortes/CorteViewerDialog.jsx:125 · producto_id (DescuentoInventarioVenta) · (r) => r.producto_id === det.producto_id && r.activo !== false,
  apps/web/heredado/components/dashboard/FinancialChart.jsx:149 · fecha_apertura (Venta) · const d = safeDate(v.fecha_cierre || v.fecha_apertura);
  apps/web/heredado/components/dashboard/FinancialChart.jsx:187 · fecha_apertura (Venta) · const d = safeDate(v.fecha_cierre || v.fecha_apertura);
  apps/web/heredado/components/dashboard/FinancialChart.jsx:154 · fecha (MovimientoInventario, DescuentoInventarioVenta) · const d = safeDate(g.fecha);
  apps/web/heredado/components/dashboard/FinancialChart.jsx:202 · fecha (MovimientoInventario, DescuentoInventarioVenta) · const d = safeDate(g.fecha);
  apps/web/heredado/components/datos/ExportarDatos.jsx:75 · producto_id (DescuentoInventarioVenta) · producto_nombre: mapProd.get(r.producto_id) || r.producto_id || '',
  apps/web/heredado/components/datos/ExportarDatos.jsx:75 · producto_id (DescuentoInventarioVenta) · producto_nombre: mapProd.get(r.producto_id) || r.producto_id || '',
  apps/web/heredado/components/datos/ExportarDatos.jsx:235 · descripcion (CategoriaIngrediente, CategoriaProducto) · <p className="text-[11px] text-muted-foreground">{b.descripcion}</p>
  apps/web/heredado/components/datos/ImportarDatos.jsx:66 · descripcion (CategoriaIngrediente, CategoriaProducto) · <p className="text-[11px] text-muted-foreground">{t.descripcion}</p>
  apps/web/heredado/components/datos/ImportarDatosDialog.jsx:519 · descripcion (CategoriaIngrediente, CategoriaProducto) · fila.parsed?.descripcion ||
  apps/web/heredado/components/datos/PlantillasDescargables.jsx:187 · descripcion (CategoriaIngrediente, CategoriaProducto) · <p className="text-[11px] text-muted-foreground">{p.descripcion}</p>
  apps/web/heredado/components/mesero/CantidadVariableDialog.jsx:41 · tipo_venta (Venta) · const tipo = producto?.tipo_venta;
  apps/web/heredado/components/mesero/ListosParaRecogerCard.jsx:117 · estacion_preparacion_id (CategoriaProducto) · const key = p?.estacion_preparacion_id || p?.estacion_preparacion_nombre || '__general__';
  apps/web/heredado/components/mesero/ListosParaRecogerCard.jsx:117 · estacion_preparacion_nombre (CategoriaProducto) · const key = p?.estacion_preparacion_id || p?.estacion_preparacion_nombre || '__general__';
  apps/web/heredado/components/mesero/ListosParaRecogerCard.jsx:120 · estacion_preparacion_nombre (CategoriaProducto) · nombre: p?.estacion_preparacion_nombre || 'Cocina',
  apps/web/heredado/components/mesero/ListosParaRecogerCard.jsx:121 · estacion_preparacion_color (CategoriaProducto) · color: p?.estacion_preparacion_color || '#4A5568',
  apps/web/heredado/components/mesero/ListosParaRecogerCard.jsx:128 · items (PedidoPreparacion) · const items = Array.isArray(p?.items) ? p.items : [];
  apps/web/heredado/components/mesero/ListosParaRecogerCard.jsx:128 · items (PedidoPreparacion) · const items = Array.isArray(p?.items) ? p.items : [];
  apps/web/heredado/components/mesero/ListosParaRecogerCard.jsx:131 · items (PedidoPreparacion) · g.items.push({
  apps/web/heredado/components/mesero/ListosParaRecogerCard.jsx:327 · items (PedidoPreparacion) · {g.items.length > 0 && (
  apps/web/heredado/components/mesero/ListosParaRecogerCard.jsx:329 · items (PedidoPreparacion) · {g.items.map((it) => `${it.cantidad}× ${it.producto_nombre}`).join(' · ')}
  apps/web/heredado/components/mesero/PrecioProductoMesero.jsx:20 · tipo_venta (Venta) · const tipo = producto?.tipo_venta;
  apps/web/heredado/components/mesero/PrecioProductoMesero.jsx:48 · tipo_venta (Venta) · const tipo = producto?.tipo_venta;
  apps/web/heredado/components/mesero/ProductoFichaExpandible.jsx:106 · tipo_venta (Venta) · tipo_venta: variableSnap.tipo_venta,
  apps/web/heredado/components/mesero/ProductoFichaExpandible.jsx:181 · descripcion (CategoriaIngrediente, CategoriaProducto) · {item?.descripcion && (
  apps/web/heredado/components/mesero/ProductoFichaExpandible.jsx:182 · descripcion (CategoriaIngrediente, CategoriaProducto) · <p className="text-[11px] text-muted-foreground italic">{item.descripcion}</p>
  apps/web/heredado/components/mesero/SeleccionModificadoresDialog.jsx:36 · modificadores (ProductoTerminado) · const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
  apps/web/heredado/components/mesero/SeleccionModificadoresDialog.jsx:36 · modificadores (ProductoTerminado) · const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
  apps/web/heredado/components/mesero/SeleccionModificadoresDialog.jsx:156 · descripcion (CategoriaIngrediente, CategoriaProducto) · {producto.descripcion && (
  apps/web/heredado/components/mesero/SeleccionModificadoresDialog.jsx:158 · descripcion (CategoriaIngrediente, CategoriaProducto) · {producto.descripcion}
  apps/web/heredado/components/mesero/SolicitudesQRCardList.jsx:103 · fecha_creacion (PedidoPreparacion, SolicitudQR) · return s?.fecha_creacion
  apps/web/heredado/components/mesero/SolicitudesQRCardList.jsx:104 · fecha_creacion (PedidoPreparacion, SolicitudQR) · ? formatDistanceToNow(new Date(s.fecha_creacion), { addSuffix: true, locale: es })
  apps/web/heredado/components/mesero/SolicitudesQRPanel.jsx:134 · fecha_creacion (PedidoPreparacion, SolicitudQR) · return s?.fecha_creacion
  apps/web/heredado/components/mesero/SolicitudesQRPanel.jsx:135 · fecha_creacion (PedidoPreparacion, SolicitudQR) · ? formatDistanceToNow(new Date(s.fecha_creacion), { addSuffix: true, locale: es })
  apps/web/heredado/components/portalqr/CarritoQR.jsx:34 · items (PedidoPreparacion) · items,
  apps/web/heredado/components/portalqr/CarritoQR.jsx:119 · tipo_venta (Venta) · tipo_venta: variableSnap.tipo_venta,
  apps/web/heredado/components/portalqr/MenuQRTab.jsx:47 · descripcion (CategoriaIngrediente, CategoriaProducto) · descripcion: editForm.descripcion || '',
  apps/web/heredado/components/portalqr/MenuQRTab.jsx:140 · descripcion (CategoriaIngrediente, CategoriaProducto) · {s.descripcion && (
  apps/web/heredado/components/portalqr/MenuQRTab.jsx:141 · descripcion (CategoriaIngrediente, CategoriaProducto) · <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.descripcion}</p>
  apps/web/heredado/components/portalqr/MenuQRTab.jsx:189 · descripcion (CategoriaIngrediente, CategoriaProducto) · value={editForm.descripcion}
  apps/web/heredado/components/portalqr/ProductoPlaceholder.jsx:47 · descripcion (CategoriaIngrediente, CategoriaProducto) · `${producto?.nombre || ''} ${producto?.categoria_nombre || categoriaNombre || ''} ${producto?.descripcion || ''}`.toLowerCase();
  apps/web/heredado/components/portalqr/ProductoQRDialog.jsx:37 · tipo_venta (Venta) · const tipoVenta = producto?.tipo_venta;
  apps/web/heredado/components/portalqr/ProductoQRDialog.jsx:63 · modificadores (ProductoTerminado) · const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
  apps/web/heredado/components/portalqr/ProductoQRDialog.jsx:63 · modificadores (ProductoTerminado) · const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
  apps/web/heredado/components/portalqr/ProductoQRDialog.jsx:283 · descripcion (CategoriaIngrediente, CategoriaProducto) · {producto.descripcion && (
  apps/web/heredado/components/portalqr/ProductoQRDialog.jsx:284 · descripcion (CategoriaIngrediente, CategoriaProducto) · <p className="text-sm text-muted-foreground mt-1">{producto.descripcion}</p>
  apps/web/heredado/components/portalqr/SolicitudesQRTab.jsx:203 · fecha_creacion (PedidoPreparacion, SolicitudQR) · return s?.fecha_creacion
  apps/web/heredado/components/portalqr/SolicitudesQRTab.jsx:204 · fecha_creacion (PedidoPreparacion, SolicitudQR) · ? formatDistanceToNow(new Date(s.fecha_creacion), { addSuffix: true, locale: es })
  apps/web/heredado/components/pos/CartPanel.jsx:9 · items (PedidoPreparacion) · export default function CartPanel({ items, onUpdateQty, onRemove, total, onCheckout, onClear }) {
  apps/web/heredado/components/pos/CartPanel.jsx:40 · tipo_venta (Venta) · const tipo = item?.tipo_venta;
  apps/web/heredado/components/pos/ProductCard.jsx:9 · tipo_venta (Venta) · const tipo = product?.tipo_venta;
  apps/web/heredado/components/productos/FichaResumenVariable.jsx:37 · tipo_venta (Venta) · const tipo = producto?.tipo_venta || TIPO_VENTA.PRECIO_FIJO;
  apps/web/heredado/components/productos/ModificadoresDialog.jsx:35 · modificadores (ProductoTerminado) · setGrupos(Array.isArray(producto?.modificadores) ? producto.modificadores : []);
  apps/web/heredado/components/productos/ModificadoresDialog.jsx:35 · modificadores (ProductoTerminado) · setGrupos(Array.isArray(producto?.modificadores) ? producto.modificadores : []);
  apps/web/heredado/components/productos/ProductoDesglose.jsx:65 · descripcion (CategoriaIngrediente, CategoriaProducto) · {producto.descripcion && <p className="text-sm mt-1">{producto.descripcion}</p>}
  apps/web/heredado/components/productos/ProductoDesglose.jsx:65 · descripcion (CategoriaIngrediente, CategoriaProducto) · {producto.descripcion && <p className="text-sm mt-1">{producto.descripcion}</p>}
  apps/web/heredado/components/productos/ProductoDesglose.jsx:240 · descripcion (CategoriaIngrediente, CategoriaProducto) · {producto.descripcion && <p className="text-sm mt-1">{producto.descripcion}</p>}
  apps/web/heredado/components/productos/ProductoDesglose.jsx:240 · descripcion (CategoriaIngrediente, CategoriaProducto) · {producto.descripcion && <p className="text-sm mt-1">{producto.descripcion}</p>}
  apps/web/heredado/components/productos/ProductoDesglose.jsx:133 · fecha (MovimientoInventario, DescuentoInventarioVenta) · function FichaVariable({ producto, ingrediente, config, fecha }) {
  apps/web/heredado/components/productos/ProductoDesglose.jsx:134 · tipo_venta (Venta) · const tipo = producto.tipo_venta;
  apps/web/heredado/components/productos/ProductoSimpleDialog.jsx:34 · descripcion (CategoriaIngrediente, CategoriaProducto) · const [descripcion, setDescripcion] = useState('');
  apps/web/heredado/components/productos/ProductoSimpleDialog.jsx:61 · descripcion (CategoriaIngrediente, CategoriaProducto) · setDescripcion(producto?.descripcion || '');
  apps/web/heredado/components/productos/ProductoSimpleDialog.jsx:67 · tipo_venta (Venta) · tipo_venta: producto?.tipo_venta || TIPO_VENTA.PRECIO_FIJO,
  apps/web/heredado/components/productos/ProductoSimpleDialog.jsx:124 · tipo_venta (Venta) · tipo_venta: tipoVentaState.tipo_venta,
  apps/web/heredado/components/productos/TipoVentaSection.jsx:75 · tipo_venta (Venta) · const tipo = v.tipo_venta || TIPO_VENTA.PRECIO_FIJO;
  apps/web/heredado/components/propinas/PropinasDashboardSection.jsx:43 · propina_monto (Venta) · const conPropina = safe.filter((v) => (Number(v?.propina_monto) || 0) > 0);
  apps/web/heredado/components/propinas/PropinasDashboardSection.jsx:59 · propina_liquidada (Venta) · const pendientes = conPropina.filter((v) => v?.propina_liquidada !== true);
  apps/web/heredado/components/propinas/PropinasDashboardSection.jsx:60 · propina_liquidada (Venta) · const liquidadas = conPropina.filter((v) => v?.propina_liquidada === true);
  apps/web/heredado/components/propinas/PropinasRegistros.jsx:105 · propina_monto (Venta) · safe.filter((v) => v?.estado === 'pagada' && (Number(v?.propina_monto) || 0) > 0),
  apps/web/heredado/components/propinas/PropinasRegistros.jsx:350 · propina_monto (Venta) · {formatCurrency(v.propina_monto)}
  apps/web/heredado/components/propinas/PropinasRegistros.jsx:109 · propina_liquidada (Venta) · if (estado === 'pendientes') res = res.filter((v) => v?.propina_liquidada !== true);
  apps/web/heredado/components/propinas/PropinasRegistros.jsx:110 · propina_liquidada (Venta) · if (estado === 'liquidadas') res = res.filter((v) => v?.propina_liquidada === true);
  apps/web/heredado/components/propinas/PropinasRegistros.jsx:117 · propina_liquidada (Venta) · const pendientes = ventasFiltradas.filter((v) => v?.propina_liquidada !== true);
  apps/web/heredado/components/propinas/PropinasRegistros.jsx:341 · propina_liquidada (Venta) · className={`text-[10px] ${v.propina_liquidada ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}
  apps/web/heredado/components/propinas/PropinasRegistros.jsx:344 · propina_liquidada (Venta) · {v.propina_liquidada ? 'Liquidada' : 'Pendiente'}
  apps/web/heredado/components/propinas/PropinasRegistros.jsx:269 · numero_ventas (CorteCaja, LiquidacionPropina) · {l.numero_ventas || 0} ventas
  apps/web/heredado/components/propinas/PropinasRegistros.jsx:338 · metodo_pago (Venta) · {v.metodo_pago || '—'}
  apps/web/heredado/components/recetas/RecetaAccordionRow.jsx:58 · tipo_venta (Venta) · if (producto.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA) {
  apps/web/heredado/components/recetas/RecetaAccordionRow.jsx:109 · tipo_venta (Venta) · {producto.tipo_venta === 'variable_medida' ? 'Variable por medida' : 'Por porción'}
  apps/web/heredado/components/recetas/RecetaFormDialog.jsx:133 · descripcion (CategoriaIngrediente, CategoriaProducto) · descripcion: productoToEdit.descripcion || '',
  apps/web/heredado/components/recetas/RecetaFormDialog.jsx:303 · descripcion (CategoriaIngrediente, CategoriaProducto) · descripcion: producto.descripcion || '',
  apps/web/heredado/components/recetas/RecetaFormDialog.jsx:425 · descripcion (CategoriaIngrediente, CategoriaProducto) · value={producto.descripcion}
  apps/web/heredado/components/recetas/RecetaFormDialog.jsx:165 · tipo_venta (Venta) · tipo_venta: productoToEdit.tipo_venta || TIPO_VENTA.PRECIO_FIJO,
  apps/web/heredado/components/recetas/RecetaFormDialog.jsx:272 · tipo_venta (Venta) · tipo_venta: tipoVentaState.tipo_venta,
  apps/web/heredado/components/registros/MovimientosPanel.jsx:88 · fecha (MovimientoInventario, DescuentoInventarioVenta) · const t = new Date(m.fecha || m.created_date || 0).getTime();
  apps/web/heredado/components/registros/MovimientosPanel.jsx:117 · fecha (MovimientoInventario, DescuentoInventarioVenta) · const key = (m.fecha || m.created_date || '').slice(0, 10);
  apps/web/heredado/components/registros/MovimientosPanel.jsx:244 · fecha (MovimientoInventario, DescuentoInventarioVenta) · {m.fecha ? format(new Date(m.fecha), 'HH:mm', { locale: es }) : ''}
  apps/web/heredado/components/registros/MovimientosPanel.jsx:244 · fecha (MovimientoInventario, DescuentoInventarioVenta) · {m.fecha ? format(new Date(m.fecha), 'HH:mm', { locale: es }) : ''}
  apps/web/heredado/components/registros/MovimientosPanel.jsx:227 · items (PedidoPreparacion) · {grouped.map(([day, items]) => (
  apps/web/heredado/components/registros/MovimientosPanel.jsx:259 · costo_total_movimiento (MovimientoInventario) · {formatCurrency(Math.abs(m.costo_total_movimiento || 0))}
  apps/web/heredado/components/registros/PeriodoPDF.jsx:153 · tipo_venta (Venta) · {v.tipo_venta}
  apps/web/heredado/components/registros/PeriodoPDF.jsx:156 · metodo_pago (Venta) · <td className="border px-1.5 py-1 capitalize">{v.metodo_pago || '—'}</td>
  apps/web/heredado/components/registros/PeriodoPDF.jsx:196 · metodo_pago (Venta) · <td className="border px-1.5 py-1 capitalize">{c.metodo_pago || '—'}</td>
  apps/web/heredado/components/registros/PeriodoPDF.jsx:194 · fecha (MovimientoInventario, DescuentoInventarioVenta) · <td className="border px-1.5 py-1">{c.fecha}</td>
  apps/web/heredado/components/registros/PeriodoPDF.jsx:225 · fecha (MovimientoInventario, DescuentoInventarioVenta) · <td className="border px-1.5 py-1">{g.fecha}</td>
  apps/web/heredado/components/registros/PeriodoPDF.jsx:227 · descripcion (CategoriaIngrediente, CategoriaProducto) · <td className="border px-1.5 py-1">{g.descripcion}</td>
  apps/web/heredado/components/registros/ResumenPeriodo.jsx:67 · fecha (MovimientoInventario, DescuentoInventarioVenta) · const comprasP = compras.filter((c) => inRange(c.fecha || c.created_date));
  apps/web/heredado/components/registros/ResumenPeriodo.jsx:68 · fecha (MovimientoInventario, DescuentoInventarioVenta) · const gastosP = gastos.filter((g) => inRange(g.fecha || g.created_date));
  apps/web/heredado/components/registros/ResumenPeriodo.jsx:76 · propina_monto (Venta) · propinas: ventasP.reduce((s, v) => s + (Number(v?.propina_monto) || 0), 0),
  apps/web/heredado/components/tickets/CorteTicket.jsx:31 · propinas_por_mesero (CorteCaja) · const raw = corte?.propinas_por_mesero;
  apps/web/heredado/components/tickets/CorteTicket.jsx:41 · total_propinas (CorteCaja) · const totalPropinas = Number(corte?.total_propinas) || 0;
  apps/web/heredado/components/tickets/CorteTicket.jsx:46 · fecha_inicio (CorteCaja) · const fInicio = corte?.fecha_inicio
  apps/web/heredado/components/tickets/CorteTicket.jsx:47 · fecha_inicio (CorteCaja) · ? format(new Date(corte.fecha_inicio), 'd MMM yyyy, HH:mm', { locale: es })
  apps/web/heredado/components/tickets/CorteTicket.jsx:53 · total_general (CorteCaja) · corte?.total_general > 0 ? (corte.utilidad_bruta_total / corte.total_general) * 100 : 0;
  apps/web/heredado/components/tickets/CorteTicket.jsx:53 · total_general (CorteCaja) · corte?.total_general > 0 ? (corte.utilidad_bruta_total / corte.total_general) * 100 : 0;
  apps/web/heredado/components/tickets/CorteTicket.jsx:214 · total_general (CorteCaja) · <Cell label="Total ventas" value={formatCurrency(corte?.total_general)} bold />
  apps/web/heredado/components/tickets/CorteTicket.jsx:320 · total_general (CorteCaja) · <Cell label="Ventas reales (sin propina)" value={formatCurrency(corte?.total_general)} />
  apps/web/heredado/components/tickets/CorteTicket.jsx:323 · total_general (CorteCaja) · value={formatCurrency((Number(corte?.total_general) || 0) + totalPropinas)}
  apps/web/heredado/components/tickets/CorteTicket.jsx:53 · utilidad_bruta_total (CorteCaja) · corte?.total_general > 0 ? (corte.utilidad_bruta_total / corte.total_general) * 100 : 0;
  apps/web/heredado/components/tickets/CorteTicket.jsx:54 · utilidad_bruta_total (CorteCaja) · const utilidadNeta = (corte?.utilidad_bruta_total || 0) - (corte?.total_gastos || 0);
  apps/web/heredado/components/tickets/CorteTicket.jsx:224 · utilidad_bruta_total (CorteCaja) · <Cell label="Utilidad bruta" value={formatCurrency(corte?.utilidad_bruta_total)} />
  apps/web/heredado/components/tickets/CorteTicket.jsx:54 · total_gastos (CorteCaja) · const utilidadNeta = (corte?.utilidad_bruta_total || 0) - (corte?.total_gastos || 0);
  apps/web/heredado/components/tickets/CorteTicket.jsx:228 · total_gastos (CorteCaja) · <Cell label="Gastos operativos" value={formatCurrency(corte?.total_gastos)} />
  apps/web/heredado/components/tickets/CorteTicket.jsx:67 · producto_id (DescuentoInventarioVenta) · const key = d.producto_id || d.producto_nombre;
  apps/web/heredado/components/tickets/CorteTicket.jsx:85 · costo_total_linea_snapshot (DetalleVenta) · productosMap[key].costo += d.costo_total_linea_snapshot || 0;
  apps/web/heredado/components/tickets/CorteTicket.jsx:96 · tipo_venta (Venta) · if (p.tipo_venta === 'variable_medida' && p.cantidad_variable_total > 0) {
  apps/web/heredado/components/tickets/CorteTicket.jsx:100 · tipo_venta (Venta) · } else if (p.tipo_venta === 'porcion_contenedor' && p.cantidad_porciones_total > 0) {
  apps/web/heredado/components/tickets/CorteTicket.jsx:197 · diferencia_apertura (CorteCaja) · <Cell label="Diferencia apertura" value={formatCurrency(corte?.diferencia_apertura)} />
  apps/web/heredado/components/tickets/CorteTicket.jsx:202 · diferencia_efectivo (CorteCaja) · <Cell label="Diferencia efectivo" value={formatCurrency(corte?.diferencia_efectivo)} />
  apps/web/heredado/components/tickets/CorteTicket.jsx:215 · numero_ventas (CorteCaja, LiquidacionPropina) · <Cell label="N° tickets" value={corte?.numero_ventas || 0} />
  apps/web/heredado/components/tickets/CorteTicket.jsx:216 · ticket_promedio (CorteCaja) · <Cell label="Ticket promedio" value={formatCurrency(corte?.ticket_promedio)} />
  apps/web/heredado/components/tickets/CorteTicket.jsx:217 · total_efectivo (CorteCaja) · <Cell label="Efectivo" value={formatCurrency(corte?.total_efectivo)} />
  apps/web/heredado/components/tickets/CorteTicket.jsx:240 · total_efectivo (CorteCaja) · (corte?.total_efectivo || 0) +
  apps/web/heredado/components/tickets/CorteTicket.jsx:218 · total_tarjeta (CorteCaja) · <Cell label="Tarjeta" value={formatCurrency(corte?.total_tarjeta)} />
  apps/web/heredado/components/tickets/CorteTicket.jsx:241 · total_tarjeta (CorteCaja) · (corte?.total_tarjeta || 0) +
  apps/web/heredado/components/tickets/CorteTicket.jsx:219 · total_transferencia (CorteCaja) · <Cell label="Transferencia" value={formatCurrency(corte?.total_transferencia)} />
  apps/web/heredado/components/tickets/CorteTicket.jsx:242 · total_transferencia (CorteCaja) · (corte?.total_transferencia || 0),
  apps/web/heredado/components/tickets/CorteTicket.jsx:221 · costo_total_estimado (CorteCaja) · <Cell label="Costo de ventas" value={formatCurrency(corte?.costo_total_estimado)} />
  apps/web/heredado/components/tickets/CorteTicket.jsx:233 · utilidad_neta_estimada (CorteCaja) · value={formatCurrency(corte?.utilidad_neta_estimada || utilidadNeta)}
  apps/web/heredado/components/tickets/CorteTicket.jsx:393 · metodo_pago (Venta) · <td className="border px-2 py-1 capitalize">{v.metodo_pago || '—'}</td>
  apps/web/heredado/components/tickets/CorteTicket.jsx:506 · metodo_pago (Venta) · <td className="border px-2 py-1 capitalize">{g.metodo_pago || '—'}</td>
  apps/web/heredado/components/tickets/CorteTicket.jsx:505 · descripcion (CategoriaIngrediente, CategoriaProducto) · <td className="border px-2 py-1">{g.descripcion}</td>
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:23 · fecha_apertura (Venta) · venta.fecha_cierre || venta.fecha_apertura
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:24 · fecha_apertura (Venta) · ? format(new Date(venta.fecha_cierre || venta.fecha_apertura), 'd MMM yyyy · HH:mm', {
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:125 · propina_monto (Venta) · {Number(venta.propina_monto) > 0 && (
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:128 · propina_monto (Venta) · value={formatCurrency(venta.propina_monto)}
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:146 · propina_monto (Venta) · <span>{formatCurrency(subtotalEfectivo + (Number(venta.propina_monto) || 0))}</span>
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:148 · metodo_pago (Venta) · {esFinal && venta.metodo_pago && (
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:150 · metodo_pago (Venta) · <Row label="Pago" value={venta.metodo_pago} capitalize />
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:151 · monto_efectivo (Venta) · {venta.monto_efectivo > 0 && (
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:152 · monto_efectivo (Venta) · <Row label="Efectivo" value={formatCurrency(venta.monto_efectivo)} />
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:154 · monto_tarjeta (Venta) · {venta.monto_tarjeta > 0 && (
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:155 · monto_tarjeta (Venta) · <Row label="Tarjeta" value={formatCurrency(venta.monto_tarjeta)} />
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:157 · monto_transferencia (Venta) · {venta.monto_transferencia > 0 && (
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:158 · monto_transferencia (Venta) · <Row label="Transf." value={formatCurrency(venta.monto_transferencia)} />
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:160 · cambio (Venta) · {venta.cambio > 0 && (
  apps/web/heredado/components/tickets/PreCuentaTicket.jsx:161 · cambio (Venta) · <Row label="Cambio" value={formatCurrency(venta.cambio)} bold />
  apps/web/heredado/pages/Barra.jsx:102 · fecha_creacion (PedidoPreparacion, SolicitudQR) · {pedido.fecha_creacion
  apps/web/heredado/pages/Barra.jsx:103 · fecha_creacion (PedidoPreparacion, SolicitudQR) · ? formatDistanceToNow(new Date(pedido.fecha_creacion), {
  apps/web/heredado/pages/Barra.jsx:113 · items (PedidoPreparacion) · {(pedido.items || []).map((item, i) => (
  apps/web/heredado/pages/Caja.jsx:131 · propina_monto (Venta) · const yaElegida = Number(venta?.propina_monto);
  apps/web/heredado/pages/Caja.jsx:272 · propina_monto (Venta) · const totalPropinas = ventas.reduce((s, v) => s + (Number(v?.propina_monto) || 0), 0);
  apps/web/heredado/pages/Caja.jsx:276 · propina_monto (Venta) · const monto = Number(v?.propina_monto) || 0;
  apps/web/heredado/pages/Caja.jsx:469 · propina_monto (Venta) · const p = Number(ventaSeleccionada?.propina_monto) || 0;
  apps/web/heredado/pages/Caja.jsx:492 · propina_monto (Venta) · propina_monto: Number(propinaData?.propina_monto) || 0,
  apps/web/heredado/pages/Caja.jsx:591 · propina_monto (Venta) · const propinaMonto = Number(ventaSeleccionada.propina_monto) || 0;
  apps/web/heredado/pages/Caja.jsx:1329 · propina_monto (Venta) · {formatCurrency(Number(v.propina_monto) || 0)})
  apps/web/heredado/pages/Caja.jsx:1331 · propina_monto (Venta) · ) : (Number(v.propina_monto) || 0) > 0 ? (
  apps/web/heredado/pages/Caja.jsx:1333 · propina_monto (Venta) · QR: propina {formatCurrency(Number(v.propina_monto) || 0)}
  apps/web/heredado/pages/Caja.jsx:1425 · propina_monto (Venta) · const monto = Number(ventaSeleccionada?.propina_monto) || 0;
  apps/web/heredado/pages/Caja.jsx:1488 · propina_monto (Venta) · {(Number(ventaSeleccionada?.propina_monto) || 0) > 0 && (
  apps/web/heredado/pages/Caja.jsx:1496 · propina_monto (Venta) · <span>+ {formatCurrency(Number(ventaSeleccionada?.propina_monto) || 0)}</span>
  apps/web/heredado/pages/Caja.jsx:1599 · propina_monto (Venta) · {(Number(ventaSeleccionada?.propina_monto) || 0) > 0 && (
  apps/web/heredado/pages/Caja.jsx:1604 · propina_monto (Venta) · {formatCurrency(Number(ventaSeleccionada?.propina_monto) || 0)}
  apps/web/heredado/pages/Caja.jsx:1641 · propina_monto (Venta) · const pT = Number(ventaSeleccionada?.propina_monto) || 0;
  apps/web/heredado/pages/Caja.jsx:254 · fecha_apertura (Venta) · cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio || cajaAbierta.created_date;
  apps/web/heredado/pages/Caja.jsx:1033 · fecha_apertura (Venta) · cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio || cajaAbierta.created_date,
  apps/web/heredado/pages/Caja.jsx:1240 · fecha_apertura (Venta) · {safeFormatDate(cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio, 'd MMM, HH:mm')}{' '}
  apps/web/heredado/pages/Caja.jsx:254 · fecha_inicio (CorteCaja) · cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio || cajaAbierta.created_date;
  apps/web/heredado/pages/Caja.jsx:1033 · fecha_inicio (CorteCaja) · cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio || cajaAbierta.created_date,
  apps/web/heredado/pages/Caja.jsx:1240 · fecha_inicio (CorteCaja) · {safeFormatDate(cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio, 'd MMM, HH:mm')}{' '}
  apps/web/heredado/pages/Caja.jsx:1053 · utilidad_neta_estimada (CorteCaja) · utilidad_neta_estimada: form.utilidad_neta_estimada,
  apps/web/heredado/pages/Caja.jsx:1801 · total_general (CorteCaja) · {formatCurrency(corteCerrado?.total_general || resumen.totalGeneral)}
  apps/web/heredado/pages/Cocina.jsx:56 · venta_folio (PedidoPreparacion) · if (pedido.venta_folio) return false;
  apps/web/heredado/pages/Cocina.jsx:83 · estacion_preparacion_id (CategoriaProducto) · if (posUser?.estacion_preparacion_id) {
  apps/web/heredado/pages/Cocina.jsx:86 · estacion_preparacion_id (CategoriaProducto) · stationId: posUser.estacion_preparacion_id,
  apps/web/heredado/pages/Cocina.jsx:180 · estacion_preparacion_id (CategoriaProducto) · if (p?.estacion_preparacion_id === userScope.stationId) return true;
  apps/web/heredado/pages/Cocina.jsx:183 · estacion_preparacion_id (CategoriaProducto) · if (!p?.estacion_preparacion_id && userEsCocinaGeneral) return true;
  apps/web/heredado/pages/Cocina.jsx:87 · estacion_preparacion_nombre (CategoriaProducto) · label: posUser.estacion_preparacion_nombre || 'Estación',
  apps/web/heredado/pages/Cocina.jsx:88 · estacion_preparacion_color (CategoriaProducto) · color: posUser.estacion_preparacion_color || COCINA_GENERAL_COLOR,
  apps/web/heredado/pages/Cocina.jsx:425 · fecha_creacion (PedidoPreparacion, SolicitudQR) · const t = p?.fecha_creacion ? new Date(p.fecha_creacion).getTime() : Infinity;
  apps/web/heredado/pages/Cocina.jsx:425 · fecha_creacion (PedidoPreparacion, SolicitudQR) · const t = p?.fecha_creacion ? new Date(p.fecha_creacion).getTime() : Infinity;
  apps/web/heredado/pages/Cocina.jsx:429 · fecha_creacion (PedidoPreparacion, SolicitudQR) · const t = p?.fecha_creacion ? new Date(p.fecha_creacion).getTime() : Infinity;
  apps/web/heredado/pages/Cocina.jsx:429 · fecha_creacion (PedidoPreparacion, SolicitudQR) · const t = p?.fecha_creacion ? new Date(p.fecha_creacion).getTime() : Infinity;
  apps/web/heredado/pages/Compras.jsx:123 · fecha (MovimientoInventario, DescuentoInventarioVenta) · {c.fecha} {c.usuario_nombre ? `· ${c.usuario_nombre}` : ''}
  apps/web/heredado/pages/Compras.jsx:162 · fecha (MovimientoInventario, DescuentoInventarioVenta) · {g.fecha} · <span className="capitalize">{g.categoria}</span>
  apps/web/heredado/pages/Compras.jsx:127 · metodo_pago (Venta) · {c.metodo_pago || '—'}
  apps/web/heredado/pages/Compras.jsx:172 · metodo_pago (Venta) · {g.metodo_pago || '—'}
  apps/web/heredado/pages/Compras.jsx:160 · descripcion (CategoriaIngrediente, CategoriaProducto) · <p className="font-medium text-sm">{g.descripcion}</p>
  apps/web/heredado/pages/Configuracion.jsx:213 · estacion_preparacion_id (CategoriaProducto) · const tieneEstacion = !!payload?.estacion_preparacion_id;
  apps/web/heredado/pages/Configuracion.jsx:242 · estacion_preparacion_id (CategoriaProducto) · estacionPreparacionId: payload.estacion_preparacion_id || null,
  apps/web/heredado/pages/Configuracion.jsx:285 · estacion_preparacion_id (CategoriaProducto) · estacionPreparacionId: usuario?.estacion_preparacion_id || null,
  apps/web/heredado/pages/Configuracion.jsx:824 · estacion_preparacion_id (CategoriaProducto) · ) : u.estacion_preparacion_id ? (
  apps/web/heredado/pages/Configuracion.jsx:828 · estacion_preparacion_color (CategoriaProducto) · borderColor: (u.estacion_preparacion_color || '#94a3b8') + '66',
  apps/web/heredado/pages/Configuracion.jsx:829 · estacion_preparacion_color (CategoriaProducto) · color: u.estacion_preparacion_color || '#475569',
  apps/web/heredado/pages/Configuracion.jsx:830 · estacion_preparacion_color (CategoriaProducto) · background: (u.estacion_preparacion_color || '#94a3b8') + '15',
  apps/web/heredado/pages/Configuracion.jsx:833 · estacion_preparacion_nombre (CategoriaProducto) · {u.estacion_preparacion_nombre || 'Estación'}
  apps/web/heredado/pages/CorteCaja.jsx:58 · fecha_inicio (CorteCaja) · return new Date(v.created_date) >= new Date(corteAbierto.fecha_inicio);
  apps/web/heredado/pages/CorteCaja.jsx:62 · fecha_inicio (CorteCaja) · return new Date(g.created_date) >= new Date(corteAbierto.fecha_inicio);
  apps/web/heredado/pages/CorteCaja.jsx:161 · fecha_inicio (CorteCaja) · Corte abierto desde {safeFormatDate(corteAbierto.fecha_inicio, 'd MMM, HH:mm')} · Folio:{' '}
  apps/web/heredado/pages/CorteCaja.jsx:61 · fecha (MovimientoInventario, DescuentoInventarioVenta) · if (!corteAbierto) return g.fecha === today;
  apps/web/heredado/pages/CorteCaja.jsx:66 · monto_efectivo (Venta) · totalEfectivo: ventas.reduce((s, v) => s + (v.monto_efectivo || 0), 0),
  apps/web/heredado/pages/CorteCaja.jsx:67 · monto_tarjeta (Venta) · totalTarjeta: ventas.reduce((s, v) => s + (v.monto_tarjeta || 0), 0),
  apps/web/heredado/pages/CorteCaja.jsx:68 · monto_transferencia (Venta) · totalTransferencia: ventas.reduce((s, v) => s + (v.monto_transferencia || 0), 0),
  apps/web/heredado/pages/CorteCaja.jsx:229 · total_general (CorteCaja) · <p className="font-bold">{formatCurrency(c.total_general)}</p>
  apps/web/heredado/pages/CorteCaja.jsx:230 · numero_ventas (CorteCaja, LiquidacionPropina) · <p className="text-xs text-muted-foreground">{c.numero_ventas} ventas</p>
  apps/web/heredado/pages/Dashboard.jsx:137 · fecha_apertura (Venta) · cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio || cajaAbierta.created_date;
  apps/web/heredado/pages/Dashboard.jsx:137 · fecha_inicio (CorteCaja) · cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio || cajaAbierta.created_date;
  apps/web/heredado/pages/Dashboard.jsx:158 · monto_efectivo (Venta) · const totalEfectivo = ventasCaja.reduce((s, v) => s + (v.monto_efectivo || 0), 0);
  apps/web/heredado/pages/Dashboard.jsx:159 · monto_tarjeta (Venta) · const totalTarjeta = ventasCaja.reduce((s, v) => s + (v.monto_tarjeta || 0), 0);
  apps/web/heredado/pages/Dashboard.jsx:160 · monto_transferencia (Venta) · const totalTransferencia = ventasCaja.reduce((s, v) => s + (v.monto_transferencia || 0), 0);
  apps/web/heredado/pages/Inventario.jsx:135 · fecha (MovimientoInventario, DescuentoInventarioVenta) · const f = (d.fecha || d.created_date || '').slice(0, 10);
  apps/web/heredado/pages/Mesero.jsx:453 · modificadores (ProductoTerminado) · const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
  apps/web/heredado/pages/Mesero.jsx:453 · modificadores (ProductoTerminado) · const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
  apps/web/heredado/pages/Mesero.jsx:530 · modificadores (ProductoTerminado) · const confirmarPersonalizacion = ({ modificadores, notas }) => {
  apps/web/heredado/pages/Mesero.jsx:468 · tipo_venta (Venta) · producto?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA ||
  apps/web/heredado/pages/Mesero.jsx:469 · tipo_venta (Venta) · producto?.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR
  apps/web/heredado/pages/Mesero.jsx:624 · tipo_venta (Venta) · variableSnap?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA
  apps/web/heredado/pages/Mesero.jsx:626 · tipo_venta (Venta) · : variableSnap?.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR
  apps/web/heredado/pages/Mesero.jsx:642 · tipo_venta (Venta) · variableSnap?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA &&
  apps/web/heredado/pages/POS.jsx:111 · tipo_venta (Venta) · ...(item?.tipo_venta
  apps/web/heredado/pages/POS.jsx:113 · tipo_venta (Venta) · tipo_venta_snapshot: item.tipo_venta,
  apps/web/heredado/pages/POS.jsx:209 · tipo_venta (Venta) · const tipo = producto?.tipo_venta;
  apps/web/heredado/pages/POS.jsx:275 · tipo_venta (Venta) · const existente = cart.find((i) => i.producto_id === product.id && !i.tipo_venta);
  apps/web/heredado/pages/POS.jsx:341 · tipo_venta (Venta) · const esPorcion = snap.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR;
  apps/web/heredado/pages/POS.jsx:363 · tipo_venta (Venta) · (item.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA ||
  apps/web/heredado/pages/POS.jsx:364 · tipo_venta (Venta) · item.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR)
  apps/web/heredado/pages/POS.jsx:275 · producto_id (DescuentoInventarioVenta) · const existente = cart.find((i) => i.producto_id === product.id && !i.tipo_venta);
  apps/web/heredado/pages/POS.jsx:483 · propina_monto (Venta) · const propinaCentavos = aCentavos(propina?.propina_monto);
  apps/web/heredado/pages/POS.jsx:741 · propina_monto (Venta) · propinaMonto={Number(propina?.propina_monto) || 0}
  apps/web/heredado/pages/POS.jsx:484 · metodo_pago (Venta) · const esEfectivo = paymentData?.metodo_pago === 'efectivo';
  apps/web/heredado/pages/POS.jsx:498 · metodo_pago (Venta) · metodo: paymentData.metodo_pago,
  apps/web/heredado/pages/PortalCliente.jsx:238 · modificadores (ProductoTerminado) · const handleAddToCart = ({ producto, cantidad, notas, modificadores, _variable }) => {
  apps/web/heredado/pages/PortalCliente.jsx:794 · modificadores (ProductoTerminado) · const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
  apps/web/heredado/pages/PortalCliente.jsx:794 · modificadores (ProductoTerminado) · const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
  apps/web/heredado/pages/PortalCliente.jsx:578 · descripcion (CategoriaIngrediente, CategoriaProducto) · {s.descripcion && (
  apps/web/heredado/pages/PortalCliente.jsx:579 · descripcion (CategoriaIngrediente, CategoriaProducto) · <p className="text-xs text-muted-foreground">{s.descripcion}</p>
  apps/web/heredado/pages/PortalCliente.jsx:824 · descripcion (CategoriaIngrediente, CategoriaProducto) · {producto?.descripcion && (
  apps/web/heredado/pages/PortalCliente.jsx:825 · descripcion (CategoriaIngrediente, CategoriaProducto) · <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{producto.descripcion}</p>
  apps/web/heredado/pages/Productos.jsx:102 · producto_id (DescuentoInventarioVenta) · const lines = safeRecetas.filter((r) => r.producto_id === p.id && r.activo !== false);
  apps/web/heredado/pages/Productos.jsx:206 · tipo_venta (Venta) · ? p.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA
  apps/web/heredado/pages/Productos.jsx:212 · tipo_venta (Venta) · p.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA
  apps/web/heredado/pages/Productos.jsx:257 · tipo_venta (Venta) · {p.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA
  apps/web/heredado/pages/Productos.jsx:323 · descripcion (CategoriaIngrediente, CategoriaProducto) · {p.descripcion && isEsencial && (
  apps/web/heredado/pages/Productos.jsx:324 · descripcion (CategoriaIngrediente, CategoriaProducto) · <p className="text-xs text-muted-foreground line-clamp-2">{p.descripcion}</p>
  apps/web/heredado/pages/Productos.jsx:355 · modificadores (ProductoTerminado) · {Array.isArray(p.modificadores) && p.modificadores.length > 0 && (
  apps/web/heredado/pages/Productos.jsx:355 · modificadores (ProductoTerminado) · {Array.isArray(p.modificadores) && p.modificadores.length > 0 && (
  apps/web/heredado/pages/Productos.jsx:357 · modificadores (ProductoTerminado) · {p.modificadores.length}
  apps/web/heredado/pages/Recetas.jsx:94 · producto_id (DescuentoInventarioVenta) · const lines = recetas.filter((r) => r.producto_id === p.id && r.activo !== false);
  apps/web/heredado/pages/Registros.jsx:176 · metodo_pago (Venta) · filterFn(v.metodo_pago) ||
  apps/web/heredado/pages/Registros.jsx:203 · metodo_pago (Venta) · filterFn(c.metodo_pago) ||
  apps/web/heredado/pages/Registros.jsx:401 · metodo_pago (Venta) · {v.metodo_pago || '—'}
  apps/web/heredado/pages/Registros.jsx:446 · metodo_pago (Venta) · {c.metodo_pago || '—'}
  apps/web/heredado/pages/Registros.jsx:503 · metodo_pago (Venta) · {g.metodo_pago || '—'}
  apps/web/heredado/pages/Registros.jsx:178 · fecha_apertura (Venta) · filterFn(v.fecha_apertura?.slice(0, 10)) ||
  apps/web/heredado/pages/Registros.jsx:385 · fecha_apertura (Venta) · {v.fecha_apertura
  apps/web/heredado/pages/Registros.jsx:386 · fecha_apertura (Venta) · ? format(new Date(v.fecha_apertura), 'd MMM yyyy, HH:mm', { locale: es })
  apps/web/heredado/pages/Registros.jsx:204 · fecha (MovimientoInventario, DescuentoInventarioVenta) · filterFn(c.fecha),
  apps/web/heredado/pages/Registros.jsx:228 · fecha (MovimientoInventario, DescuentoInventarioVenta) · filterFn(g.fecha),
  apps/web/heredado/pages/Registros.jsx:441 · fecha (MovimientoInventario, DescuentoInventarioVenta) · {c.fecha} {c.factura_folio ? `· ${c.factura_folio}` : ''}
  apps/web/heredado/pages/Registros.jsx:498 · fecha (MovimientoInventario, DescuentoInventarioVenta) · {g.fecha} · <span className="capitalize">{g.categoria}</span>
  apps/web/heredado/pages/Registros.jsx:225 · descripcion (CategoriaIngrediente, CategoriaProducto) · filterFn(g.descripcion) ||
  apps/web/heredado/pages/Registros.jsx:496 · descripcion (CategoriaIngrediente, CategoriaProducto) · <p className="font-semibold text-sm">{g.descripcion}</p>
  apps/web/heredado/pages/Registros.jsx:377 · satisfaccion_label (Venta) · title={v.satisfaccion_label || ''}
  apps/web/heredado/pages/Registros.jsx:380 · satisfaccion_label (Venta) · <span>{v.satisfaccion_label || `${v.satisfaccion_score}/5`}</span>
  apps/web/heredado/pages/Registros.jsx:652 · total_general (CorteCaja) · {formatCurrency(corte.total_general)}
  apps/web/heredado/pages/Ventas.jsx:195 · tipo_venta (Venta) · {v.tipo_venta}
  apps/web/heredado/pages/Ventas.jsx:206 · satisfaccion_label (Venta) · title={v.satisfaccion_label || ''}
  apps/web/heredado/pages/Ventas.jsx:209 · satisfaccion_label (Venta) · <span>{v.satisfaccion_label || `${v.satisfaccion_score}/5`}</span>
  apps/web/heredado/pages/Ventas.jsx:394 · satisfaccion_label (Venta) · {selectedVenta.satisfaccion_label ||
  apps/web/heredado/pages/Ventas.jsx:236 · metodo_pago (Venta) · <p className="text-xs text-muted-foreground">{v.metodo_pago || '—'}</p>
  apps/web/heredado/pages/Ventas.jsx:358 · metodo_pago (Venta) · <p className="font-bold">{selectedVenta.metodo_pago}</p>
  apps/web/heredado/pages/Ventas.jsx:398 · satisfaccion_origen (Venta) · {selectedVenta.satisfaccion_origen === 'portal_qr'
  apps/web/heredado/utils/entregaPedidos.js:51 · fecha_apertura (Venta) · new Date(b?.fecha_apertura || b?.created_date || 0) -
  apps/web/heredado/utils/entregaPedidos.js:52 · fecha_apertura (Venta) · new Date(a?.fecha_apertura || a?.created_date || 0),
  apps/web/heredado/utils/importExecutors.js:233 · descripcion (CategoriaIngrediente, CategoriaProducto) · descripcion: safeStr(p.descripcion),
  apps/web/heredado/utils/importExecutors.js:416 · descripcion (CategoriaIngrediente, CategoriaProducto) · descripcion: p.descripcion,
  apps/web/heredado/utils/importExecutors.js:424 · descripcion (CategoriaIngrediente, CategoriaProducto) · descripcion: p.descripcion,
  apps/web/heredado/utils/importExecutors.js:294 · producto_id (DescuentoInventarioVenta) · const k = r.parsed.producto_id;
  apps/web/heredado/utils/importExecutors.js:415 · fecha (MovimientoInventario, DescuentoInventarioVenta) · fecha: p.fecha,
  apps/web/heredado/utils/importExecutors.js:423 · fecha (MovimientoInventario, DescuentoInventarioVenta) · fecha: p.fecha,
  apps/web/heredado/utils/importExecutors.js:419 · metodo_pago (Venta) · metodoPago: p.metodo_pago,
  apps/web/heredado/utils/importExecutors.js:427 · metodo_pago (Venta) · metodo: p.metodo_pago,
  apps/web/heredado/utils/importValidators.js:239 · descripcion (CategoriaIngrediente, CategoriaProducto) · descripcion: String(r.descripcion || '').trim() || undefined,
  apps/web/heredado/utils/importValidators.js:530 · descripcion (CategoriaIngrediente, CategoriaProducto) · const descripcion = String(r.descripcion || '').trim();
  apps/web/heredado/utils/importValidators.js:529 · fecha (MovimientoInventario, DescuentoInventarioVenta) · const fechaRaw = String(r.fecha || '').trim();
  apps/web/heredado/utils/importValidators.js:535 · metodo_pago (Venta) · const metodo = String(r.metodo_pago || 'efectivo')
  apps/web/heredado/utils/inventarioValidation.js:120 · producto_id (DescuentoInventarioVenta) · (r) => r?.producto_id === det?.producto_id && r?.activo !== false,
  apps/web/heredado/utils/inventarioValidation.js:120 · producto_id (DescuentoInventarioVenta) · (r) => r?.producto_id === det?.producto_id && r?.activo !== false,
  apps/web/heredado/utils/preparacionEstacionUtils.js:102 · estacion_preparacion_id (CategoriaProducto) · const catEstId = cat.estacion_preparacion_id;
  apps/web/heredado/utils/preparacionEstacionUtils.js:151 · estacion_preparacion_id (CategoriaProducto) · const key = est.estacion_preparacion_id || 'general';
  apps/web/heredado/utils/preparacionEstacionUtils.js:148 · items (PedidoPreparacion) · groups.get(key).items.push(item);
  apps/web/heredado/utils/preparacionEstacionUtils.js:153 · items (PedidoPreparacion) · groups.get(key).items.push(item);
  apps/web/heredado/utils/qrPedidoFlow.js:175 · tipo_venta (Venta) · ? variable.tipo_venta === 'porcion_contenedor'
  apps/web/heredado/utils/qrPedidoFlow.js:242 · items (PedidoPreparacion) · export function enviarPedidoQR({ token, items, notaGeneral, clave }) {
  apps/web/heredado/utils/tipoVentaUtils.js:156 · tipo_venta (Venta) · const tipo = args?.tipo_venta;
  apps/web/heredado/utils/tipoVentaUtils.js:212 · tipo_venta (Venta) · const tipo = item?.tipo_venta || item?.tipo_venta_snapshot;
  apps/web/heredado/utils/tipoVentaUtils.js:241 · tipo_venta (Venta) · const tipo = producto?.tipo_venta;
  apps/web/heredado/utils/tipoVentaUtils.js:279 · tipo_venta (Venta) · producto?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA ||
  apps/web/heredado/utils/tipoVentaUtils.js:280 · tipo_venta (Venta) · producto?.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR
  apps/web/heredado/utils/tipsUtils.js:30 · propina_monto (Venta) · return safe.filter((v) => v?.estado === 'pagada' && (Number(v?.propina_monto) || 0) > 0);
  apps/web/heredado/utils/tipsUtils.js:36 · propina_monto (Venta) · return safe.reduce((s, v) => s + (Number(v?.propina_monto) || 0), 0);
  apps/web/heredado/utils/tipsUtils.js:57 · propina_monto (Venta) · const monto = Number(v?.propina_monto) || 0;
  apps/web/heredado/utils/tipsUtils.js:107 · propina_monto (Venta) · const propina = Number(v?.propina_monto) || 0;
  apps/web/heredado/utils/tipsUtils.js:45 · fecha_apertura (Venta) · const ref = v?.fecha_cierre || v?.fecha_apertura || v?.created_date;
  apps/web/heredado/utils/tipsUtils.js:71 · venta_ids (LiquidacionPropina) · if (v?.id) map[key].venta_ids.push(v.id);
  apps/web/heredado/utils/tipsUtils.js:110 · monto_efectivo (Venta) · const ef = Number(v?.monto_efectivo) || 0;
  apps/web/heredado/utils/tipsUtils.js:111 · monto_tarjeta (Venta) · const ta = Number(v?.monto_tarjeta) || 0;
  apps/web/heredado/utils/tipsUtils.js:112 · monto_transferencia (Venta) · const tr = Number(v?.monto_transferencia) || 0;
  apps/web/heredado/utils/tipsUtils.js:116 · propina_efectivo (Venta) · v?.propina_efectivo !== undefined ||
  apps/web/heredado/utils/tipsUtils.js:120 · propina_efectivo (Venta) · let pEf = Number(v?.propina_efectivo) || 0;
  apps/web/heredado/utils/tipsUtils.js:117 · propina_tarjeta (Venta) · v?.propina_tarjeta !== undefined ||
  apps/web/heredado/utils/tipsUtils.js:121 · propina_tarjeta (Venta) · let pTa = Number(v?.propina_tarjeta) || 0;
  apps/web/heredado/utils/tipsUtils.js:118 · propina_transferencia (Venta) · v?.propina_transferencia !== undefined;
  apps/web/heredado/utils/tipsUtils.js:122 · propina_transferencia (Venta) · let pTr = Number(v?.propina_transferencia) || 0;
  apps/web/heredado/utils/tipsUtils.js:138 · metodo_pago (Venta) · const m = v?.metodo_pago;
[ELIFECYCLE] Command failed with exit code 1.
```

Después de reparar las fuentes de datos y justificar los usos de compatibilidad restantes, la puerta terminó con código `0`:

```text
$ node scripts/verificar-lecturas.mjs
✓ Lecturas del puente: 44 campos descartados vigilados; 216 lectura(s) justificadas.
```

## 4. Evidencia en navegador

La comprobación se hizo sobre la aplicación local y PostgreSQL 18 aislado, con las migraciones del repositorio. Se inició sesión como Mariana, rol dueño/administrador, en `demo-cafe-jacaranda`.

### Propinas y PDF

1. Venta A-1: subtotal $245.00, propina manual $14.00, pago efectivo $259.00. El ticket mostró a Mariana y los tres importes separados.
2. Venta A-2: subtotal $130.00, propina de 5% por $6.50, pago tarjeta $136.50. El ticket mostró `Propina (5%)`, Mariana y tarjeta.
3. Antes de agregar la prueba QR, **Registros → Propinas** mostró total $20.50, pendientes $20.50, 2 ventas y Mariana $20.50. El detalle conservó $14.00 en efectivo y $6.50 en tarjeta; no hubo prorrateo.
4. Tras el tercer cobro de la prueba QR, el PDF del corte CC-1 mostró propinas totales $27.75, $14.00 en efectivo, $13.75 en tarjeta, $0.00 en transferencia y Mariana $27.75. Ventas reales $424.00 y total cobrado con propina $451.75 permanecieron separados.

### Importe manual en Caja y desde QR

- En Caja, escribir $14.00 en el diálogo manual y pulsar **Aplicar** abrió directamente **Cobrar venta** con subtotal $245.00, propina $14.00 y total $259.00. El cobro terminó; no reapareció el diálogo.
- Para el origen QR, el mesero abrió Mesa 1, envió un café de $49.00 y solicitó la cuenta M01-5079. El portal del comensal abrió automáticamente la selección, recibió $7.25 como monto manual y mostró total estimado $56.25.
- Caja recibió `QR: propina $7.25`. El primer intento de cobro forzó el diálogo. Tras volver a confirmar $7.25, el segundo intento pasó directamente a **Guardando venta…** y generó el ticket por tarjeta de $56.25. El diálogo no se abrió una segunda vez.

### Mesa con QR

Desde **Configuración → Mesas** se creó Mesa 1 sin mesero asignado, se generó un token por `restaurante.rotar_qr` y el Portal QR mostró el código. Con ese QR ya existente se cambió el nombre de `Ventana` a `Ventana QR`; la pantalla respondió **Mesa 1 actualizada**. El token siguió operativo en el portal público.

### Arqueo con fondo inicial

La caja se abrió con $2,000.00 de efectivo inicial. El cierre diario mantuvo oculto el esperado mientras se capturó el conteo. Al enviar $2,259.00, el servidor devolvió y la pantalla mostró:

```text
Efectivo esperado en cajón  $2,259.00
Efectivo contado            $2,259.00
Diferencia                  $0.00
La caja cuadra perfectamente.
```

El importe demuestra que el fondo inicial sí participa en el esperado: $2,000.00 + $245.00 de ventas en efectivo + $14.00 de propina en efectivo.

## 5. Fusión a `main`

`carril-b` se fusionó en `main` y se empujó a `origin/main`.

SHA del commit de fusión: `PENDIENTE_MERGE_SHA`

## LO QUE NO HICE

- No refactoricé en lote las pruebas existentes basadas en `readFileSync`. Las pruebas nuevas de estas tareas sí ejecutan comportamiento.
- No cambié la regla que permite al dueño modificar el paquete de su propio negocio.
- No desplegué a producción, no promoví un preview y no configuré Vercel. El push a las ramas se limitó al repositorio solicitado.
- No ejecuté purgas ni comandos destructivos sobre los datos de demostración. Las ventas, la mesa, la estación y el corte usados para la comprobación quedan como evidencia local.
- No leí ni modifiqué el proyecto Pasteleria Confetti `ivqcxdpqxwjxfohiswqb`. Todas las comprobaciones vivas de Supabase usaron explícitamente MorphiqPOS `wyqmzhliurwyxuyxznpb`.
- No edité migraciones aplicadas. La única migración nueva es 057 y se aplicó con `pnpm db:migrate`.
- No declaré verde el subchequeo vivo de Docker: la herramienta no está instalada en esta máquina. Sí quedaron verdes el esquema y RLS contra Supabase, la integración en PostgreSQL 18 y el build de 55 rutas.

