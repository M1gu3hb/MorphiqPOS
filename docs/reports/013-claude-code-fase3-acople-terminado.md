# 013 · Fase 3 · ACOPLE TERMINADO · la puerta en 0, contra el despliegue

**Agente:** Claude Code (Opus 5) · **Rama:** `fase-2` · **Fecha:** 17 de septiembre de 2026
**Alcance:** A3 a A7 de `docs/fase-2/F3-REGLAS-DE-ACOPLE.md`
**Continúa:** `docs/reports/012-claude-code-fase3-acople.md`, que cerró con A3 bloqueada

---

## 1 · LA SALIDA DE `pnpm verify:acople`, LITERAL · EN 0

Va primero porque es lo único que no es mi opinión. Y va contra el **despliegue de Vercel**, no
contra un servidor local:

```
$ MORPHIQPOS_URL_DESPLIEGUE=https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app \
  MORPHIQPOS_COOKIE_VERCEL='_vercel_jwt=…' pnpm verify:acople

$ node --conditions=react-server scripts/verificar-acople.mjs

ACOPLE DE LA FASE 2 · lo escrito contra lo conectado

  migraciones   97 en disco = 97 en el ledger
  seguridad     RLS y grants cerrados en 162 relaciones y 15 funciones
  despliegue    https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app → 200 · con la cookie de un enlace compartido
  rutas         103 declaradas · 82 probadas por HTTP · 21 dinámicas o exceptuadas, comprobadas en disco
  plantillas    3 resuelven módulos · los 6 giros de GIROS caen en una
  vocabulario   ruta + los dos envoltorios + el menú heredado · 3 pantalla(s) lo consumen

✓ Acople completo: migraciones aplicadas, seguridad cerrada, rutas vivas,
  plantillas resueltas, vocabulario consumido y aplicación respondiendo.
```

La puerta empezó la fase con **siete** pendientes, el reporte 012 la dejó en **dos**, y hoy está en
**cero**.

---

## 2 · EL BLOQUEO NO ERA UNA CREDENCIAL

La sesión anterior se declaró bloqueada diciendo que no había forma de aplicar las migraciones.
Buscó la credencial en el `.env` y en el repositorio, no la encontró, y concluyó que no existía.
**Existía, en dos sitios que git ignora a propósito:**

| Dónde | Qué | Por qué no se vio |
|---|---|---|
| `D:\herramientas\supabase-cli\…\supabase.exe` | el CLI, fijado y FUERA del checkout | está en `docs/RUNBOOK.md`, no en el `.env` |
| `supabase/.temp/linked-project.json` | el **vínculo** con el proyecto | está en `.gitignore` y es **local a cada worktree**: existía en `morphiqpos-codex` y no aquí |

Sin el segundo, `supabase db query --linked` no tiene de dónde leer el ref. Codex aplicó de la 050 a
la 057 desde esta misma máquina; lo que no cruzó fue el archivo de vínculo.

**La lección queda escrita en `A3-COMO-APLICAR.md`:** antes de declararse bloqueado, mirar los otros
worktrees, `docs/RUNBOOK.md` y los directorios que git ignora.

Y un fallo que costó media hora y también queda escrito: **el CLI parsea el `.env` del directorio
actual.** Alguien había pegado un `DATABASE_URL` delante de la primera línea y el BOM del archivo
quedó en medio, en el byte 156. El CLI abortaba con
`LegacyDbConfigLoadError: failed to parse environment file: .env`, y el mensaje no menciona el BOM.
El `.env` además se contradecía: la línea 1 traía la cadena real y quince líneas más abajo seguía un
bloque diciendo «FALTA. Es el único bloqueo activo del carril A».

---

## 3 · LA SALIDA DE `pnpm verify` COMPLETO

31 eslabones. **Sale en 1, y en el único que no puede correr en esta máquina: `test:integracion`,
que exige Docker.**

Y eso ya no tapa nada, que era el defecto que había: `test:integracion` estaba **antes** de
`verify:acople` en la cadena, abortaba, y el `&&` cortaba — **la puerta de la fase no llegaba a
correr nunca**. Ahora va detrás, y `verify:fase2` —que no la incluía— también la lleva, para que no
quede una cadena corta por la que colarse.

```
$ pnpm verify
$ pnpm verify:arranque && pnpm verify:estructura && pnpm verify:historico && pnpm verify:tsconfig && pnpm verify:entorno && pnpm verify:certificado && pnpm verify:esquema && pnpm verify:rls && pnpm verify:residuos && pnpm verify:aspecto && pnpm verify:escrituras && pnpm verify:lecturas && pnpm verify:primitivas && pnpm format:check && pnpm lint && pnpm typecheck && pnpm verify:pruebas && pnpm test:unit && pnpm verify:mutaciones-backend && pnpm verify:catalogo && pnpm verify:inventario && pnpm verify:comandos-catalogo && pnpm verify:comandos-inventario && pnpm verify:venta && pnpm verify:identidad && pnpm verify:paquetes && pnpm build && pnpm verify:cabeceras && pnpm verify:cobertura && pnpm verify:acople && pnpm test:integracion
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
  · pendiente: La comprobacion EN VIVO (levantar el compose y conectarse) NO se ejecuto: no hay Docker en esta maquina. Esta DECLARADA en docs/fase-2/EXCEPCIONES-COBERTURA.md como "PUERTA verify:entorno/comprobacion-en-vivo". A-27 no esta demostrado por esta corrida
✓ Entorno local: 3 servicios, imagenes fijadas, 9 variables declaradas.
$ node --conditions=react-server scripts/verificar-certificado.mjs
✓ Raíz de Supabase vigente 1682 día(s) más (hasta 2031-04-26).
$ node --conditions=react-server scripts/verificar-esquema-aplicado.mjs
✓ La base cumple el contrato: 1702 columnas, 1329 restricciones y 429 índices.
$ node --conditions=react-server scripts/verificar-rls.mjs
✓ RLS y grants cerrados en 162 relaciones y 15 funciones; índices 046 presentes.
$ node scripts/verificar-residuos.mjs
✓ Cero residuos: 8 patrones buscados fuera de historico/, ninguno presente.
  · 1 ruta(s) que APUNTAN a historico/, permitidas por R6.
$ node scripts/verificar-aspecto.mjs
La estructura NO cambió en los 73 archivos comparados de apps/web/heredado.
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
Pages directory cannot be found at D:\MIS PROYECTOS\Master POS\morphiqpos-fase2\pages or D:\MIS PROYECTOS\Master POS\morphiqpos-fase2\src\pages. If using a custom path, please configure with the `no-html-link-for-pages` rule in your eslint config file.
$ turbo run typecheck
• turbo 2.10.12

   • Packages in scope: @morphiqpos/app, @morphiqpos/contracts, @morphiqpos/data, @morphiqpos/domain, @morphiqpos/testing, @morphiqpos/ui, @morphiqpos/web
   • Running typecheck in 7 packages
   • Remote caching disabled, using shared worktree cache

@morphiqpos/contracts:typecheck: cache hit, replaying logs f433a06e1322faa0
@morphiqpos/contracts:typecheck: $ tsc --noEmit
@morphiqpos/ui:typecheck: cache hit, replaying logs 3f76a6f700d15e0f
@morphiqpos/testing:typecheck: cache hit, replaying logs b6b448cf464b6d99
@morphiqpos/ui:typecheck: $ tsc --noEmit
@morphiqpos/domain:typecheck: cache hit, replaying logs ea754436dad13e08
@morphiqpos/testing:typecheck: $ tsc --noEmit
@morphiqpos/domain:typecheck: $ tsc --noEmit
@morphiqpos/data:typecheck: cache hit, replaying logs aade240a89681720
@morphiqpos/data:typecheck: $ tsc --noEmit
@morphiqpos/app:typecheck: cache hit, replaying logs 69102833c9a237dd
@morphiqpos/app:typecheck: $ tsc --noEmit
@morphiqpos/web:typecheck: cache hit, replaying logs d00fd633710d9433
@morphiqpos/web:typecheck: $ tsc --noEmit

 Tasks:    7 successful, 7 total
Cached:    7 cached, 7 total
  Time:    146ms >>> FULL TURBO

$ node scripts/verificar-pruebas.mjs
✓ Pruebas: 223 unitarias en la puerta correcta, 5 de integración cubiertas, cero scripts que esquiven la raíz.
$ vitest run

 RUN  v5.0.0 D:/MIS PROYECTOS/Master POS/morphiqpos-fase2


 Test Files  223 passed (223)
      Tests  2650 passed (2650)
   Start at  23:59:04
   Duration  50.17s (import 87%, transform 7%, tests 4%, worker 1%)

     Import  552 modules were evaluated 2984 times · 200.36s total, 87% of tracked time
             ~16.92s faster with isolate: false — shared modules are evaluated once per worker instead of once per file
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
✓ Mutación rechazada: paquete servido sin normalizar
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
{"mutacion":"merma trunca precisión","detectadaPor":["INV-01 · consumo planeado multiplica la receta por la cantidad vendida y aplica merma exacta","INV-01 · consumo planeado rechaza merma que no cabe en cuatro decimales sin corregir el dato en silencio"],"restaurada":true}
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
{"mutacion":"modificadores estrechados a la plantilla de restaurante","detectadaPor":["B-04 · modificadores por plantilla declara la constante de operación, no una lista propia","B-04 · modificadores por plantilla existe en las tres plantillas, porque las tres traen el bloque de operación"],"restaurada":true}
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
✓ destructiva «abrir las mesas a todas las plantillas» → 1 prueba(s) en rojo
✓ inocua «una línea en blanco de más en recetas» → todo sigue en verde

2 contratos · 1 destructivas de contrato · 1 destructivas de prueba · 1 inocuas. Árbol restaurado.
$ turbo run build
• turbo 2.10.12

   • Packages in scope: @morphiqpos/app, @morphiqpos/contracts, @morphiqpos/data, @morphiqpos/domain, @morphiqpos/testing, @morphiqpos/ui, @morphiqpos/web
   • Running build in 7 packages
   • Remote caching disabled, using shared worktree cache

@morphiqpos/web:build: cache hit, replaying logs e1b34699fb977513
@morphiqpos/web:build: $ next build
@morphiqpos/web:build: ▲ Next.js 16.3.4 (Turbopack)
@morphiqpos/web:build: ✓ Running next.config.mjs took 69ms
@morphiqpos/web:build: 
@morphiqpos/web:build: ⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
@morphiqpos/web:build: 
@morphiqpos/web:build:   To migrate automatically, run:
@morphiqpos/web:build:   npx @next/codemod@canary middleware-to-proxy .
@morphiqpos/web:build: 
@morphiqpos/web:build:   Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
@morphiqpos/web:build:   Creating an optimized production build ...
@morphiqpos/web:build: ✓ Compiled successfully in 71s
@morphiqpos/web:build:   Running TypeScript ...
@morphiqpos/web:build: ✓ Finished writing to filesystem cache in 10.1s
@morphiqpos/web:build:   Finished TypeScript in 21.6s ...
@morphiqpos/web:build:   Collecting page data using 7 workers ...
@morphiqpos/web:build:   Generating static pages using 7 workers (0/189) ...
@morphiqpos/web:build:   Generating static pages using 7 workers (47/189) 
@morphiqpos/web:build:   Generating static pages using 7 workers (94/189) 
@morphiqpos/web:build:   Generating static pages using 7 workers (141/189) 
@morphiqpos/web:build: ✓ Generating static pages using 7 workers (189/189) in 527ms
@morphiqpos/web:build:   Finalizing page optimization ...
@morphiqpos/web:build: 
@morphiqpos/web:build: Route (app)
@morphiqpos/web:build: ┌ ƒ /
@morphiqpos/web:build: ├ ƒ /_not-found
@morphiqpos/web:build: ├ ƒ /abarrotes/alta-rapida-de-producto
@morphiqpos/web:build: ├ ƒ /abarrotes/caja
@morphiqpos/web:build: ├ ƒ /abarrotes/cobrar
@morphiqpos/web:build: ├ ƒ /abarrotes/conteo
@morphiqpos/web:build: ├ ƒ /abarrotes/cortes
@morphiqpos/web:build: ├ ƒ /abarrotes/entradas
@morphiqpos/web:build: ├ ƒ /abarrotes/existencias
@morphiqpos/web:build: ├ ƒ /abarrotes/fiado
@morphiqpos/web:build: ├ ƒ /abarrotes/producto
@morphiqpos/web:build: ├ ƒ /abarrotes/registros
@morphiqpos/web:build: ├ ƒ /abarrotes/servicios
@morphiqpos/web:build: ├ ƒ /api/agenda/cancelar
@morphiqpos/web:build: ├ ƒ /api/agenda/cerrar-servicio
@morphiqpos/web:build: ├ ƒ /api/agenda/cita
@morphiqpos/web:build: ├ ƒ /api/agenda/dia
@morphiqpos/web:build: ├ ƒ /api/agenda/huecos
@morphiqpos/web:build: ├ ƒ /api/agenda/iniciar
@morphiqpos/web:build: ├ ƒ /api/agenda/no-llego
@morphiqpos/web:build: ├ ƒ /api/agenda/proximos-huecos
@morphiqpos/web:build: ├ ƒ /api/anticipos
@morphiqpos/web:build: ├ ƒ /api/anticipos/[id]/aplicar
@morphiqpos/web:build: ├ ƒ /api/archivos/[...ruta]
@morphiqpos/web:build: ├ ƒ /api/archivos/subir
@morphiqpos/web:build: ├ ƒ /api/auth/empleados
@morphiqpos/web:build: ├ ƒ /api/auth/entrar
@morphiqpos/web:build: ├ ƒ /api/auth/salir
@morphiqpos/web:build: ├ ƒ /api/buscar/material
@morphiqpos/web:build: ├ ƒ /api/cafeteria/anticipado/encolar
@morphiqpos/web:build: ├ ƒ /api/cafeteria/anticipado/entregar
@morphiqpos/web:build: ├ ƒ /api/cafeteria/calibracion
@morphiqpos/web:build: ├ ƒ /api/cafeteria/contar-leche
@morphiqpos/web:build: ├ ƒ /api/cafeteria/deshacer-entrega
@morphiqpos/web:build: ├ ƒ /api/cafeteria/entregar-pedido
@morphiqpos/web:build: ├ ƒ /api/cafeteria/llamar-pedido
@morphiqpos/web:build: ├ ƒ /api/cafeteria/lote-grano/abrir
@morphiqpos/web:build: ├ ƒ /api/cafeteria/merma-barra
@morphiqpos/web:build: ├ ƒ /api/cafeteria/no-recogido
@morphiqpos/web:build: ├ ƒ /api/caja/abiertas
@morphiqpos/web:build: ├ ƒ /api/caja/abrir
@morphiqpos/web:build: ├ ƒ /api/caja/cajon
@morphiqpos/web:build: ├ ƒ /api/caja/cerrar
@morphiqpos/web:build: ├ ƒ /api/caja/corte-turno
@morphiqpos/web:build: ├ ƒ /api/caja/eliminar-corte
@morphiqpos/web:build: ├ ƒ /api/caja/encolar-sincronizacion
@morphiqpos/web:build: ├ ƒ /api/caja/entrada-cambio
@morphiqpos/web:build: ├ ƒ /api/caja/estado
@morphiqpos/web:build: ├ ƒ /api/caja/movimiento
@morphiqpos/web:build: ├ ƒ /api/catalogo/alta-rapida
@morphiqpos/web:build: ├ ƒ /api/catalogo/archivar
@morphiqpos/web:build: ├ ƒ /api/catalogo/atributo
@morphiqpos/web:build: ├ ƒ /api/catalogo/atributos
@morphiqpos/web:build: ├ ƒ /api/catalogo/buscar-material
@morphiqpos/web:build: ├ ƒ /api/catalogo/calibrar-peso
@morphiqpos/web:build: ├ ƒ /api/catalogo/categorias
@morphiqpos/web:build: ├ ƒ /api/catalogo/configuracion
@morphiqpos/web:build: ├ ƒ /api/catalogo/crear-producto
@morphiqpos/web:build: ├ ƒ /api/catalogo/demostracion/resetear
@morphiqpos/web:build: ├ ƒ /api/catalogo/equivalencia
@morphiqpos/web:build: ├ ƒ /api/catalogo/etiquetas
@morphiqpos/web:build: ├ ƒ /api/catalogo/fiscal-masivo
@morphiqpos/web:build: ├ ƒ /api/catalogo/foto-mostrador
@morphiqpos/web:build: ├ ƒ /api/catalogo/inicio
@morphiqpos/web:build: ├ ƒ /api/catalogo/linea
@morphiqpos/web:build: ├ ƒ /api/catalogo/modificador
@morphiqpos/web:build: ├ ƒ /api/catalogo/modificadores
@morphiqpos/web:build: ├ ƒ /api/catalogo/presentacion
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos/actualizar
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos/codigo
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos/crear
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos/precio
@morphiqpos/web:build: ├ ƒ /api/catalogo/sesion
@morphiqpos/web:build: ├ ƒ /api/catalogo/ubicacion
@morphiqpos/web:build: ├ ƒ /api/cita-servicios/[id]/cerrar
@morphiqpos/web:build: ├ ƒ /api/cita-servicios/[id]/foto
@morphiqpos/web:build: ├ ƒ /api/citas
@morphiqpos/web:build: ├ ƒ /api/citas/[id]/cancelar
@morphiqpos/web:build: ├ ƒ /api/citas/[id]/cobrar
@morphiqpos/web:build: ├ ƒ /api/citas/[id]/iniciar
@morphiqpos/web:build: ├ ƒ /api/citas/[id]/no-llego
@morphiqpos/web:build: ├ ƒ /api/citas/[id]/reprogramar
@morphiqpos/web:build: ├ ƒ /api/citas/walk-in
@morphiqpos/web:build: ├ ƒ /api/clientes
@morphiqpos/web:build: ├ ƒ /api/clientes/[id]
@morphiqpos/web:build: ├ ƒ /api/clientes/[id]/expediente
@morphiqpos/web:build: ├ ƒ /api/clientes/[id]/ultima-formula
@morphiqpos/web:build: ├ ƒ /api/clientes/por-volver
@morphiqpos/web:build: ├ ƒ /api/comision/depositar
@morphiqpos/web:build: ├ ƒ /api/comision/liquidar
@morphiqpos/web:build: ├ ƒ /api/comision/registrar
@morphiqpos/web:build: ├ ƒ /api/compras/importar-nota
@morphiqpos/web:build: ├ ƒ /api/compras/plantilla
@morphiqpos/web:build: ├ ƒ /api/compras/plantilla/usar
@morphiqpos/web:build: ├ ƒ /api/compras/recibir-nota
@morphiqpos/web:build: ├ ƒ /api/compras/registrar
@morphiqpos/web:build: ├ ƒ /api/compras/sugerencia
@morphiqpos/web:build: ├ ƒ /api/compras/sugerencia/[proveedorId]
@morphiqpos/web:build: ├ ƒ /api/configuracion/modulo
@morphiqpos/web:build: ├ ƒ /api/configuracion/modulo-restablecer
@morphiqpos/web:build: ├ ƒ /api/configuracion/paquete
@morphiqpos/web:build: ├ ƒ /api/configuracion/presentacion
@morphiqpos/web:build: ├ ƒ /api/configuracion/presentacion-contrasena
@morphiqpos/web:build: ├ ƒ /api/configuracion/vocabulario
@morphiqpos/web:build: ├ ƒ /api/configuracion/vocabulario-restablecer
@morphiqpos/web:build: ├ ƒ /api/cortes/[id]/pdf
@morphiqpos/web:build: ├ ƒ /api/cotizacion
@morphiqpos/web:build: ├ ƒ /api/cotizacion/[id]/convertir
@morphiqpos/web:build: ├ ƒ /api/cotizacion/aprobar
@morphiqpos/web:build: ├ ƒ /api/cotizacion/cerrar
@morphiqpos/web:build: ├ ƒ /api/cotizacion/enviar
@morphiqpos/web:build: ├ ƒ /api/cotizacion/surtir
@morphiqpos/web:build: ├ ƒ /api/cotizacion/versionar
@morphiqpos/web:build: ├ ƒ /api/credito/autorizado
@morphiqpos/web:build: ├ ƒ /api/credito/autorizado-baja
@morphiqpos/web:build: ├ ƒ /api/credito/autorizar
@morphiqpos/web:build: ├ ƒ /api/credito/confirmar-transferencia
@morphiqpos/web:build: ├ ƒ /api/credito/estado-cuenta
@morphiqpos/web:build: ├ ƒ /api/credito/evaluar
@morphiqpos/web:build: ├ ƒ /api/credito/limite
@morphiqpos/web:build: ├ ƒ /api/credito/obra
@morphiqpos/web:build: ├ ƒ /api/credito/obra-cerrar
@morphiqpos/web:build: ├ ƒ /api/credito/pago
@morphiqpos/web:build: ├ ƒ /api/credito/remision
@morphiqpos/web:build: ├ ƒ /api/datos/consultar
@morphiqpos/web:build: ├ ƒ /api/datos/escribir
@morphiqpos/web:build: ├ ƒ /api/envase/deposito
@morphiqpos/web:build: ├ ƒ /api/fiado/abono
@morphiqpos/web:build: ├ ƒ /api/fiado/incobrable
@morphiqpos/web:build: ├ ƒ /api/fiado/limite
@morphiqpos/web:build: ├ ƒ /api/gastos/plantilla
@morphiqpos/web:build: ├ ƒ /api/gastos/registrar
@morphiqpos/web:build: ├ ƒ /api/identidad/accesos
@morphiqpos/web:build: ├ ƒ /api/identidad/empleados
@morphiqpos/web:build: ├ ƒ /api/identidad/pin
@morphiqpos/web:build: ├ ƒ /api/inventario/ajustar
@morphiqpos/web:build: ├ ƒ /api/inventario/almacenes/crear
@morphiqpos/web:build: ├ ƒ /api/inventario/cabina/alcanza
@morphiqpos/web:build: ├ ƒ /api/inventario/caducidad
@morphiqpos/web:build: ├ ƒ /api/inventario/caducidad/consumir
@morphiqpos/web:build: ├ ƒ /api/inventario/consumo-interno
@morphiqpos/web:build: ├ ƒ /api/inventario/conteo/abrir
@morphiqpos/web:build: ├ ƒ /api/inventario/conteo/capturar
@morphiqpos/web:build: ├ ƒ /api/inventario/conteo/cerrar
@morphiqpos/web:build: ├ ƒ /api/inventario/conteo/peso
@morphiqpos/web:build: ├ ƒ /api/inventario/cortar
@morphiqpos/web:build: ├ ƒ /api/inventario/corte
@morphiqpos/web:build: ├ ƒ /api/inventario/garantia
@morphiqpos/web:build: ├ ƒ /api/inventario/garantia/resolver
@morphiqpos/web:build: ├ ƒ /api/inventario/inicial
@morphiqpos/web:build: ├ ƒ /api/inventario/insumos/costo
@morphiqpos/web:build: ├ ƒ /api/inventario/insumos/crear
@morphiqpos/web:build: ├ ƒ /api/inventario/kardex
@morphiqpos/web:build: ├ ƒ /api/inventario/merma
@morphiqpos/web:build: ├ ƒ /api/inventario/pieza-abierta
@morphiqpos/web:build: ├ ƒ /api/inventario/pieza-abierta/retazo
@morphiqpos/web:build: ├ ƒ /api/inventario/recetas
@morphiqpos/web:build: ├ ƒ /api/inventario/recetas/eliminar
@morphiqpos/web:build: ├ ƒ /api/inventario/resumen
@morphiqpos/web:build: ├ ƒ /api/inventario/traspaso
@morphiqpos/web:build: ├ ƒ /api/inventario/traspaso-recibir
@morphiqpos/web:build: ├ ƒ /api/inventario/valuacion
@morphiqpos/web:build: ├ ƒ /api/lealtad/ajustar
@morphiqpos/web:build: ├ ƒ /api/lealtad/canjear
@morphiqpos/web:build: ├ ƒ /api/lealtad/identificar
@morphiqpos/web:build: ├ ƒ /api/liquidaciones
@morphiqpos/web:build: ├ ƒ /api/liquidaciones/[id]/comprobante
@morphiqpos/web:build: ├ ƒ /api/lista-espera
@morphiqpos/web:build: ├ ƒ /api/lista-espera/[id]/agendar
@morphiqpos/web:build: ├ ƒ /api/lista-espera/[id]/avisar
@morphiqpos/web:build: ├ ƒ /api/mantenimiento/purgar-seccion
@morphiqpos/web:build: ├ ƒ /api/mantenimiento/purgar-ventas
@morphiqpos/web:build: ├ ƒ /api/mantenimiento/reiniciar-pruebas
@morphiqpos/web:build: ├ ƒ /api/mantenimiento/reiniciar-todo
@morphiqpos/web:build: ├ ƒ /api/mantenimiento/vaciar-mesas
@morphiqpos/web:build: ├ ƒ /api/por-pagar
@morphiqpos/web:build: ├ ƒ /api/por-pagar/pagar
@morphiqpos/web:build: ├ ƒ /api/por-pagar/resumen
@morphiqpos/web:build: ├ ƒ /api/portal/pedido-anticipado
@morphiqpos/web:build: ├ ƒ /api/productos/[id]/abrir
@morphiqpos/web:build: ├ ƒ /api/profesionales
@morphiqpos/web:build: ├ ƒ /api/profesionales/[id]/comisiones
@morphiqpos/web:build: ├ ƒ /api/profesionales/[id]/mi-dia
@morphiqpos/web:build: ├ ƒ /api/propinas/entregar
@morphiqpos/web:build: ├ ƒ /api/propinas/esquema
@morphiqpos/web:build: ├ ƒ /api/propinas/liquidar
@morphiqpos/web:build: ├ ƒ /api/propinas/pasivo
@morphiqpos/web:build: ├ ƒ /api/propinas/pendientes
@morphiqpos/web:build: ├ ƒ /api/propinas/recibir-directa
@morphiqpos/web:build: ├ ƒ /api/propinas/repartir-bote
@morphiqpos/web:build: ├ ƒ /api/publico/archivo/[...ruta]
@morphiqpos/web:build: ├ ƒ /api/publico/qr/[token]
@morphiqpos/web:build: ├ ƒ /api/publico/qr/[token]/cuenta
@morphiqpos/web:build: ├ ƒ /api/publico/qr/[token]/mesa
@morphiqpos/web:build: ├ ƒ /api/publico/qr/[token]/pedido
@morphiqpos/web:build: ├ ƒ /api/publico/qr/[token]/solicitud
@morphiqpos/web:build: ├ ƒ /api/publico/qr/[token]/valoracion
@morphiqpos/web:build: ├ ƒ /api/publico/recogida/[token]
@morphiqpos/web:build: ├ ƒ /api/renta
@morphiqpos/web:build: ├ ƒ /api/renta/devolver
@morphiqpos/web:build: ├ ƒ /api/rentas/[id]/cobrar
@morphiqpos/web:build: ├ ƒ /api/reportes/huecos
@morphiqpos/web:build: ├ ƒ /api/reportes/ocupacion
@morphiqpos/web:build: ├ ƒ /api/restaurante/abrir-mesa
@morphiqpos/web:build: ├ ƒ /api/restaurante/anular-linea
@morphiqpos/web:build: ├ ƒ /api/restaurante/asignar-mesero
@morphiqpos/web:build: ├ ƒ /api/restaurante/atender-solicitud
@morphiqpos/web:build: ├ ƒ /api/restaurante/cambiar-mesa
@morphiqpos/web:build: ├ ƒ /api/restaurante/cancelar-orden
@morphiqpos/web:build: ├ ƒ /api/restaurante/crear-estacion
@morphiqpos/web:build: ├ ƒ /api/restaurante/dividir-cuenta
@morphiqpos/web:build: ├ ƒ /api/restaurante/entregar-pedidos
@morphiqpos/web:build: ├ ƒ /api/restaurante/enviar-pedido
@morphiqpos/web:build: ├ ƒ /api/restaurante/espera/mover
@morphiqpos/web:build: ├ ƒ /api/restaurante/espera/registrar
@morphiqpos/web:build: ├ ƒ /api/restaurante/espera/sentar
@morphiqpos/web:build: ├ ƒ /api/restaurante/liberar-mesa
@morphiqpos/web:build: ├ ƒ /api/restaurante/limpiar-solicitudes
@morphiqpos/web:build: ├ ƒ /api/restaurante/marchar-tiempo
@morphiqpos/web:build: ├ ƒ /api/restaurante/relevar
@morphiqpos/web:build: ├ ƒ /api/restaurante/rotacion
@morphiqpos/web:build: ├ ƒ /api/restaurante/rotar-qr
@morphiqpos/web:build: ├ ƒ /api/restaurante/separar-mesas
@morphiqpos/web:build: ├ ƒ /api/restaurante/solicitar-cuenta
@morphiqpos/web:build: ├ ƒ /api/restaurante/tiempos
@morphiqpos/web:build: ├ ƒ /api/restaurante/transicionar-pedido
@morphiqpos/web:build: ├ ƒ /api/restaurante/unir-mesas
@morphiqpos/web:build: ├ ƒ /api/restaurante/vaciar-solicitudes
@morphiqpos/web:build: ├ ƒ /api/servicio/trabajo
@morphiqpos/web:build: ├ ƒ /api/turno/presencia/ajustar
@morphiqpos/web:build: ├ ƒ /api/venta/agregar-linea
@morphiqpos/web:build: ├ ƒ /api/venta/autorizar-descuento
@morphiqpos/web:build: ├ ƒ /api/venta/buscar
@morphiqpos/web:build: ├ ƒ /api/venta/cambiar-cantidad
@morphiqpos/web:build: ├ ƒ /api/venta/cobrar
@morphiqpos/web:build: ├ ƒ /api/venta/cobrar-cita
@morphiqpos/web:build: ├ ƒ /api/venta/crear-orden
@morphiqpos/web:build: ├ ƒ /api/venta/estado
@morphiqpos/web:build: ├ ƒ /api/venta/lista-trabajo
@morphiqpos/web:build: ├ ƒ /api/venta/lista-trabajo/cerrar
@morphiqpos/web:build: ├ ƒ /api/venta/nota-mostrador
@morphiqpos/web:build: ├ ƒ /api/venta/nota-mostrador/entregar
@morphiqpos/web:build: ├ ƒ /api/venta/quitar-linea
@morphiqpos/web:build: ├ ƒ /api/venta/redondeo
@morphiqpos/web:build: ├ ƒ /api/venta/remision
@morphiqpos/web:build: ├ ƒ /api/venta/retomar
@morphiqpos/web:build: ├ ƒ /api/venta/servicio
@morphiqpos/web:build: ├ ƒ /api/venta/suspender
@morphiqpos/web:build: ├ ƒ /api/venta/ticket
@morphiqpos/web:build: ├ ƒ /cafeteria/acceso-por-pin
@morphiqpos/web:build: ├ ƒ /cafeteria/barra
@morphiqpos/web:build: ├ ƒ /cafeteria/cierre-de-turno-y-arqueo
@morphiqpos/web:build: ├ ƒ /cafeteria/clientes-y-sellos
@morphiqpos/web:build: ├ ƒ /cafeteria/cobrar
@morphiqpos/web:build: ├ ƒ /cafeteria/cobro-y-propina
@morphiqpos/web:build: ├ ƒ /cafeteria/inventario
@morphiqpos/web:build: ├ ƒ /cafeteria/menu-publico-y-pedido-anticipado
@morphiqpos/web:build: ├ ƒ /cafeteria/opciones-de-la-bebida
@morphiqpos/web:build: ├ ƒ /cafeteria/productos
@morphiqpos/web:build: ├ ƒ /cafeteria/recetas
@morphiqpos/web:build: ├ ƒ /cafeteria/recogida
@morphiqpos/web:build: ├ ƒ /cafeteria/turno
@morphiqpos/web:build: ├ ƒ /caja
@morphiqpos/web:build: ├ ƒ /cocina
@morphiqpos/web:build: ├ ƒ /compras
@morphiqpos/web:build: ├ ƒ /configuracion
@morphiqpos/web:build: ├ ƒ /corte-caja
@morphiqpos/web:build: ├ ƒ /estetica-salon/agenda-del-dia
@morphiqpos/web:build: ├ ƒ /estetica-salon/agendar
@morphiqpos/web:build: ├ ƒ /estetica-salon/caja-y-corte
@morphiqpos/web:build: ├ ƒ /estetica-salon/catalogo-de-servicios
@morphiqpos/web:build: ├ ƒ /estetica-salon/cita-en-curso
@morphiqpos/web:build: ├ ƒ /estetica-salon/clientas
@morphiqpos/web:build: ├ ƒ /estetica-salon/cobrar
@morphiqpos/web:build: ├ ƒ /estetica-salon/ficha-del-profesional
@morphiqpos/web:build: ├ ƒ /estetica-salon/historial-de-la-clienta
@morphiqpos/web:build: ├ ƒ /estetica-salon/liquidacion
@morphiqpos/web:build: ├ ƒ /estetica-salon/mi-dia
@morphiqpos/web:build: ├ ƒ /estetica-salon/productos
@morphiqpos/web:build: ├ ƒ /ferreteria/caja
@morphiqpos/web:build: ├ ƒ /ferreteria/conteo
@morphiqpos/web:build: ├ ƒ /ferreteria/corte-de-material
@morphiqpos/web:build: ├ ƒ /ferreteria/cotizacion
@morphiqpos/web:build: ├ ƒ /ferreteria/cuentas
@morphiqpos/web:build: ├ ƒ /ferreteria/entradas
@morphiqpos/web:build: ├ ƒ /ferreteria/existencias
@morphiqpos/web:build: ├ ƒ /ferreteria/facturacion
@morphiqpos/web:build: ├ ƒ /ferreteria/ficha-de-pieza
@morphiqpos/web:build: ├ ƒ /ferreteria/material
@morphiqpos/web:build: ├ ƒ /ferreteria/mostrador
@morphiqpos/web:build: ├ ƒ /ferreteria/trabajos-de-mostrador
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
@morphiqpos/web:build: ├ ƒ /restaurante/acceso-por-pin
@morphiqpos/web:build: ├ ƒ /restaurante/caja
@morphiqpos/web:build: ├ ƒ /restaurante/cierre-diario-y-arqueo
@morphiqpos/web:build: ├ ƒ /restaurante/cobro
@morphiqpos/web:build: ├ ƒ /restaurante/cocina
@morphiqpos/web:build: ├ ƒ /restaurante/inventario
@morphiqpos/web:build: ├ ƒ /restaurante/mapa-de-mesas
@morphiqpos/web:build: ├ ƒ /restaurante/mesa-activa
@morphiqpos/web:build: ├ ƒ /restaurante/portal-del-comensal
@morphiqpos/web:build: ├ ƒ /restaurante/precuenta
@morphiqpos/web:build: ├ ƒ /restaurante/productos
@morphiqpos/web:build: ├ ƒ /restaurante/recetas
@morphiqpos/web:build: ├ ƒ /restaurante/registros
@morphiqpos/web:build: └ ƒ /ventas
@morphiqpos/web:build: 
@morphiqpos/web:build: 
@morphiqpos/web:build: ƒ Proxy (Middleware)
@morphiqpos/web:build: 
@morphiqpos/web:build: ƒ  (Dynamic)  server-rendered on demand
@morphiqpos/web:build: 

 Tasks:    1 successful, 1 total
Cached:    1 cached, 1 total
  Time:    850ms >>> FULL TURBO

$ node scripts/verificar-cabeceras.mjs
✓ Cabeceras de seguridad: 6 presentes y correctas, nonce por peticion.
$ node scripts/verificar-cobertura.mjs

COBERTURA DE LA FASE 2 · lo declarado en la documentación contra lo que hay en disco

MODELO           FUNCIONES        RUTAS            PANTALLAS        MIGRACIONES
───────────────  ───────────────  ───────────────  ───────────────  ───────────────
restaurante        8/8   100%   13/13  100%   13/13  100%   10/10  100%
cafeteria         17/17  100%   16/16  100%   13/13  100%   11/11  100%
abarrotes         25/25  100%   20/20  100%   11/11  100%   14/14  100%
ferreteria        38/38  100%   27/27  100%   12/12  100%   13/13  100%
estetica-salon    25/25  100%   29/29  100%   12/12  100%   18/18  100%
───────────────  ───────────────  ───────────────  ───────────────  ───────────────
TOTAL            113/113 100%  105/105 100%   61/61  100%   66/66  100%

TRONCO COMPARTIDO · lo que heredan los 73 modelos que faltan:    8/8   100%

Excepciones declaradas en docs/fase-2/EXCEPCIONES-COBERTURA.md: 12 (9 funciones · 3 rutas · 0 pantallas · 1 migraciones)

✓ Cobertura completa: funciones, rutas y pantallas, o declaradas como excepción.
$ node --conditions=react-server scripts/verificar-acople.mjs

ACOPLE DE LA FASE 2 · lo escrito contra lo conectado

  migraciones   97 en disco = 97 en el ledger
  seguridad     RLS y grants cerrados en 162 relaciones y 15 funciones
  despliegue    https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app → 200 · con la cookie de un enlace compartido
  rutas         103 declaradas · 82 probadas por HTTP · 21 dinámicas o exceptuadas, comprobadas en disco
  plantillas    3 resuelven módulos · los 6 giros de GIROS caen en una
  vocabulario   ruta + los dos envoltorios + el menú heredado · 3 pantalla(s) lo consumen

✓ Acople completo: migraciones aplicadas, seguridad cerrada, rutas vivas,
  plantillas resueltas, vocabulario consumido y aplicación respondiendo.
$ vitest run --config vitest.integracion.config.ts

 RUN  v5.0.0 D:/MIS PROYECTOS/Master POS/morphiqpos-fase2

No test files found, exiting with code 1

include: packages/*/src/**/*.integracion.test.ts, capabilities/*/**/*.integracion.test.ts
exclude:  **/node_modules/**, historico/**


⎯⎯⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯⎯⎯⎯
Error: No hay base de datos para las pruebas de integracion.

Opciones:
  · Levanta Docker Desktop y vuelve a correr. Se crea un contenedor efimero.
  · O exporta DATABASE_URL_PRUEBAS apuntando a un Postgres 16 de usar y tirar.

Estas pruebas NO se saltan cuando falta la base: son la mitad de la piramide
que mas riesgo cubre —transacciones, restricciones unicas y carreras— y una
suite verde sin ellas da una seguridad que no existe (13-PRUEBAS §2).
 ❯ prepararPostgres packages/testing/src/postgres.ts:87:11
     85|
     86|   if (!hayDocker()) {
     87|     throw new Error(
       |           ^
     88|       [
     89|         'No hay base de datos para las pruebas de integracion.',
 ❯ Object.setup pruebas/postgres.setup.ts:10:21
 ❯ TestProject._initializeGlobalSetup ../../../MIS%20PROYECTOS/Master%20POS/morphiqpos-fase2/node_modules/.pnpm/vitest@5.0.0_@types+node@24_a05f29bc04f808d133c46ece39a9949f/node_modules/vitest/dist/chunks/index.B89dZ0-N.js:12116:50
 ❯ Vitest.initializeGlobalSetup ../../../MIS%20PROYECTOS/Master%20POS/morphiqpos-fase2/node_modules/.pnpm/vitest@5.0.0_@types+node@24_a05f29bc04f808d133c46ece39a9949f/node_modules/vitest/dist/chunks/index.B89dZ0-N.js:21204:35
 ❯ ../../../MIS%20PROYECTOS/Master%20POS/morphiqpos-fase2/node_modules/.pnpm/vitest@5.0.0_@types+node@24_a05f29bc04f808d133c46ece39a9949f/node_modules/vitest/dist/chunks/index.B89dZ0-N.js:21044:6
 ❯ ../../../MIS%20PROYECTOS/Master%20POS/morphiqpos-fase2/node_modules/.pnpm/vitest@5.0.0_@types+node@24_a05f29bc04f808d133c46ece39a9949f/node_modules/vitest/dist/chunks/index.B89dZ0-N.js:21073:11
 ❯ ../../../MIS%20PROYECTOS/Master%20POS/morphiqpos-fase2/node_modules/.pnpm/vitest@5.0.0_@types+node@24_a05f29bc04f808d133c46ece39a9949f/node_modules/vitest/dist/chunks/index.B89dZ0-N.js:20935:19
 ❯ startVitest ../../../MIS%20PROYECTOS/Master%20POS/morphiqpos-fase2/node_modules/.pnpm/vitest@5.0.0_@types+node@24_a05f29bc04f808d133c46ece39a9949f/node_modules/vitest/dist/chunks/cli-api.LUtK11-x.js:369:8
 ❯ start ../../../MIS%20PROYECTOS/Master%20POS/morphiqpos-fase2/node_modules/.pnpm/vitest@5.0.0_@types+node@24_a05f29bc04f808d133c46ece39a9949f/node_modules/vitest/dist/chunks/cac.D805sv8h.js:2370:15
 ❯ CAC.run ../../../MIS%20PROYECTOS/Master%20POS/morphiqpos-fase2/node_modules/.pnpm/vitest@5.0.0_@types+node@24_a05f29bc04f808d133c46ece39a9949f/node_modules/vitest/dist/chunks/cac.D805sv8h.js:2346:2




[ELIFECYCLE] Command failed with exit code 1.
[ELIFECYCLE] Command failed with exit code 1.
```

---

## 4 · MIGRACIONES: CUÁNTAS, Y LOS HASHES

| | |
|---|---|
| En disco | **97** |
| En el ledger `_migraciones` | **97** · última la `165` |
| **Aplicadas por esta sesión** | **72** — las 71 que estaban pendientes más la `165` |
| Pendientes | **0** |
| Hashes | **coinciden**: `verify:acople` compara el ledger con el disco por número **y** por hash, y no reporta divergencia |

El orden fue el del §4, sin saltarse un paso:

```
respaldo          morphiqpos-2026-09-17T03-10-14.sql · 642 380 bytes · 879 filas en 29 tablas
respaldo ✓        sha256 y cuenta de inserts contra su manifiesto
ensayo con datos  PGlite + el respaldo de HOY + las pendientes encima → verde
ensayo en vivo    aplicadas y REVERTIDAS contra producción → verde
ledger antes      25 migraciones · última 57   (releído DESPUÉS del ensayo: no se movió)
db:migrate        ✓ Aplicadas 71
ledger después    96 · última 164
db:migrate (165)  ✓ Aplicadas 1
ledger final      97 · última 165
```

### Dos migraciones nuevas, y por qué

**`164_giro_estetica.sql`.** El giro `estetica` no existía, y sin él `db:alta-negocio --giro
estetica` lo rechazaba el `check` de la 054. Once modelos de «servicios con cita» heredan de esa
carpeta. Suelta el check y lo **reescribe entero** con los seis —un check de lista cerrada no se
extiende— y siembra dos motivos de merma propios; los otros dos que el modelo documenta ya son del
tronco desde la 062 y volver a declararlos crearía dos claves para lo mismo. En el código, `GIROS`
gana el sexto valor y `DICCIONARIOS` el vocabulario de `04-INTERFAZ §4.1`: estación, cita, servicio,
estilista, **clienta** —femenino por omisión, que es lo que §4.1.1 ordena— y `preparacion`
**ausente del objeto**, porque un salón no tiene cocina y lo que un giro no usa no se traduce: se
apaga. **`salon` NO se añadió como plantilla**, y la prueba lo afirma.

**`165_cerrar_seguridad_del_acople.sql`.** Es el §5.

---

## 5 · LO MÁS GRAVE QUE ENCONTRÓ ESTA SESIÓN · 404 AGUJEROS DE SEGURIDAD

Con la tanda aplicada, `pnpm verify:rls` pasó de 0 problemas a **404**. No los causó la tanda: los
**destapó**.

La 050 y la 055 —las dos migraciones que cierran la superficie pública— corrieron en las versiones
50 y 55, **antes de que existieran** las sesenta tablas, las cien funciones y la extensión que
trajeron las 71 nuevas. PostgreSQL concede EXECUTE a PUBLIC al crear una función y no activa RLS al
crear una tabla: **todo lo nuevo nació abierto.**

| Cuántos | Qué |
|---|---|
| 4 | `motivos_merma` (062) y `regimenes_ieps` (098) **sin RLS activa ni forzada**. A las dos se les revocaron los privilegios de `anon` y `authenticated` y a ninguna se le activó RLS: media defensa |
| 24 | doce funciones de disparador nuestras con EXECUTE para `anon` y `authenticated`, heredado de PUBLIC |
| 376 | `btree_gist`, que la 130 creó **en `public`** en vez de en `extensions` |

Esto es exactamente lo que dejó ocho tablas sin RLS en la Fase 1. **Es el mejor argumento que hay
para no aplicar a mano por la consola**, y la puerta lo cazó antes de que lo viera nadie.

La `165` lo cierra, y es la 050 y la 055 otra vez sobre lo que hay hoy, más lo que a las dos les
faltaba:

1. **`btree_gist` se MUEVE a `extensions`**, no se le revoca. El problema no era el permiso, era el
   sitio: las otras seis extensiones del proyecto ya viven ahí y ésta era la única en `public`.
   Mover una extensión relocalizable no toca los índices —las restricciones de exclusión GiST
   referencian sus clases de operadores por OID— y lo único que cambia es cómo se imprime la
   definición, que ya estaba contemplado desde que `gin_trgm_ops` hizo lo mismo.
2. **RLS activa y forzada en toda tabla de `public`**, recorriendo el catálogo y no una lista.
   Enumerar es lo que falló en la 045.
3. **`anon` y `authenticated` sin un solo privilegio** sobre relaciones y secuencias.
4. **EXECUTE retirado de PUBLIC** —que es de quien heredan— y de los dos roles.
5. **Poscondición con las mismas tres reglas que `packages/data/src/verificacion/rls.ts`**: si algo
   queda abierto, la migración falla y la transacción entera se deshace. Las dos que la preceden no
   comprobaban nada, y por eso hizo falta ésta.

Activar y FORZAR RLS no le esconde una sola fila a la aplicación: `morphiqpos_app` tiene
`BYPASSRLS`, comprobado. Y las doce funciones son todas de disparador, y PostgreSQL no comprueba
EXECUTE al dispararlas.

---

## 6 · EL OTRO HALLAZGO QUE AFECTA A LOS CUATRO NEGOCIOS · EL POOLER

A la tercera corrida de la suite de navegador, todo empezó a contestar **500**:

```
(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15
```

La `DATABASE_URL` entraba por el pooler de Supabase en el puerto **5432, modo SESIÓN**, donde el
techo son **15 clientes simultáneos**. Y `packages/data/src/cliente.ts` tenía el pool clavado en
`max: 10` con un comentario que decía «Supabase con pooler en modo **transacción** admite
bastante». El comentario describía otro puerto.

Medido, no supuesto:

| Puerto | Resultado |
|---|---|
| **5432** · sesión | dos procesos agotan el pooler · las suites dan 500 · hubo que bajar el pool a 3 y cerrar conexiones a mano entre corridas |
| **6543** · transacción | las cinco suites en verde **con el pool por omisión**, y **~40 % más rápidas**: 20.3 s contra 35.0 s en restaurante; 17.6 s contra 29.1 s en abarrotes |

**En producción cada instancia de Vercel abre su propio pool.** Con 10 por instancia y 15 clientes
de techo, **dos instancias calientes bastan para que el punto de venta empiece a devolver 500 en
hora pico** — con un error que no menciona el pooler por ningún lado.

Lo que se hizo: `max` deja de estar clavado y lo baja `MORPHIQPOS_DB_POOL_MAX`; el valor por omisión
sigue en 10. **Preview y el `.env` local ya están en el 6543. Production NO se tocó**: es lo que
usan cuatro negocios para cobrar. Las dos líneas para cambiarlo están en `VERCEL-ENTORNO.md §4`.

---

## 7 · LOS CUATRO NEGOCIOS, LEÍDOS DE LA BASE DESPUÉS DE APLICAR

```sql
select nombre, giro, paquete from organizaciones order by nombre;
```

| Negocio | Giro | Plantilla |
|---|---|---|
| Abarrotes Don Chuy | `tienda` | `tienda` |
| Café Jacaranda | `cafeteria` | **`restaurante`** |
| Ferretería La Broca | `ferreteria` | `tienda` |
| Restaurante MH | `restaurante` | `restaurante` |

Los cuatro caen donde D-12 dice, y es lo mismo que había predicho el ensayo con los datos de
verdad. **Café Jacaranda en `restaurante` aunque su giro sea cafetería NO es un error**: tiene
contratado el paquete completo con mesero y cocina, y bajarlo a `cafeteria` le quitaría módulos que
paga.

**Ni una venta, ni un corte, ni una mesa de prueba en ninguno de los cuatro.** Todo lo que la suite
de navegador toca —entrar con PIN, cambiar de plantilla— ocurre sobre las cinco organizaciones de
demostración, y la precondición **se niega a seguir** si el nombre que devuelve
`/api/auth/empleados` es el de uno de los cuatro. La base tiene hoy 9 organizaciones: los 4 negocios
y las 5 demos.

---

## 8 · LA URL DE VERCEL, Y QUÉ SE PROBÓ EN ELLA

```
https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app     (alias de la rama fase-2)
```

Es el **PREVIEW**. **No se promovió nada a producción**, que es lo que usan cuatro negocios y una
decisión de Miguel.

El reporte 012 cerró diciendo que el preview no se podía verificar desde fuera por el SSO de Vercel.
**Ya se verificó**, y sin encender ni apagar la Protección de Despliegue —que es un cambio
persistente de seguridad sobre un despliegue con datos reales—: se usó un **enlace compartido**, que
deja una cookie de 23 horas. `verify:acople` y la suite de navegador aprendieron a llevar la
credencial, y la puerta **dice en su salida con cuál de las dos entró**, porque «probado contra el
despliegue» significa cosas distintas según cómo se entró.

Y antes de nada: **el `ORGANIZACION` del Preview apuntaba al mismo negocio que Production**, es
decir a un negocio vivo. La suite entra con PIN y **cambia la plantilla**. Se cambió a una demo
antes de tocar nada.

| Qué | Resultado |
|---|---|
| La raíz | **200** |
| `/api/auth/empleados` | 200 · devuelve **«Demo del acople · tienda»**, la demo |
| `/api/datos/consultar` **sin** sesión | **401** |
| Entrar con PIN · `/api/auth/entrar` | **200**, devuelve al dueño con su rol |
| `/api/datos/consultar` **con** sesión | 200 · `paquete_modo=tienda` · `nombre_negocio=Demo del acople · tienda` |
| `/api/configuracion/vocabulario` | 200 · `giro=tienda` |
| Pantallas de modelo | `/abarrotes/caja` 200 · `/estetica-salon/agenda-del-dia` 200 |
| **`verify:acople`** | **en 0**, con las **82 rutas probadas por HTTP contra el despliegue** |
| Suite de navegador · `abarrotes` | **2 passed** contra el preview |
| Suite de navegador · `estetica-salon` | **2 passed** contra el preview — el giro que la 164 acaba de crear |

---

## 9 · LAS CINCO PLANTILLAS EN EL NAVEGADOR: QUÉ SE VIO

**Las diez pasan.** Cinco modelos × los dos proyectos —Desktop Chrome y la Galaxy Tab S4 en
horizontal—, cada uno contra SU organización de demostración.

```
restaurante   2 passed (20.3s)
cafeteria     2 passed (22.7s)
tienda        2 passed (17.6s)   ← abarrotes
ferreteria    2 passed (18.5s)
estetica      2 passed (25.0s)
```

| Modelo | Lo que se vio |
|---|---|
| **restaurante** | «Mesas», «Meseros» y «Cocinas» en el menú · el tablero ofrece **«Nueva venta»**, no «Ir a Caja» · las once pantallas del modelo responden |
| **cafetería** | con SU plantilla: mostrador, **sin sala** · y con la de Jacaranda: **«Baristas» y «Barras»** donde un restaurante dice «Meseros» y «Cocinas» — la misma entrada del menú, el diccionario del giro · la pantalla de barra con su fila vacía |
| **abarrotes** | la plantilla `tienda` trae inventario, compras y recetas (D-01) y **no trae sala** · «Productos» · el tablero ofrece «Ir a Caja» y **no** «Nueva venta» |
| **ferretería** | **«Materiales»** donde la tiendita dice «Productos», con la misma plantilla · el mostrador con su buscador y la venta armándose al lado —desplegada en PC, plegada en una barra en la tablet, y la prueba la ABRE para comprobar que se puede cobrar desde el pasillo |
| **estética** | el giro `estetica` **ya existe** y habla como una estética —estación, cita, estilista, clienta— · **`salon` sigue sin ser plantilla** y el servidor la rechaza con `ENTRADA_INVALIDA` · las doce pantallas responden · la agenda con sus botones de día |

### Los cinco defectos que sólo se ven corriéndolas

1. **`APP_URL` contra el `Origin`.** `peticionDeEscrituraValida` compara el `Origin` del navegador
   con `APP_URL`, y el servidor de pruebas vive en el 3200 mientras el `.env` decía 3000:
   `/api/auth/entrar` devolvía **403 SIN_PERMISO**, la pantalla se quedaba en el teclado y el rastro
   decía «timeout esperando la navegación». Con `curl` el login funcionaba —sin `Origin` la guarda
   deja pasar—, que es lo que hace que este fallo se persiga en el sitio equivocado.
2. **«Ir a Caja» aparece DOS veces, y las dos son legítimas**: la acción del encabezado, que sí
   gobierna la plantilla, y la del aviso «No hay caja abierta», que sale en las tres. Las cinco
   pruebas lo buscaban en toda la página. Es el fallo del identificador suelto, pero en el navegador.
3. **El techo de 30 s estaba mal puesto.** Cada prueba entra con PIN, cambia la plantilla y abre las
   once, doce o trece pantallas del modelo. Las dos que pasaban lo hacían en 26 s, a cuatro segundos
   del límite. Sube a 120 s; el mecanismo no cambia.
4. **`complementary`, no `region`**, y el panel plegado por debajo de 1280 px: con `display:none` el
   `aside` sale del árbol de accesibilidad y ni `toBeAttached` lo encuentra por rol.
5. **El pooler**, que es el §6.

---

## 10 · QUÉ SE ROMPIÓ DEL TRABAJO DE CODEX, Y CÓMO SE RESTITUYÓ

**Nada, y se comprobó una por una.** Ninguna migración aplicada fue tocada: la frontera aplicada
era la 057 y los diez defectos corregidos en la sesión anterior están todos en el tramo ≥ 074. El
ejecutor valida por hash y habría abortado.

Lo que sí se cambió a propósito, y hay que decirlo:

| Qué | Por qué |
|---|---|
| `packageConfig.js` dice **Tienda / Cafetería / Restaurante** donde decía Esencial / Operativo / Restaurante Pro | Son los únicos tres valores que `/api/configuracion/paquete` acepta después de D-01. **Revertirlo es tocar sólo `PACKAGE_LABELS` y su excepción en `scripts/aspecto-permitido.json`**, por si Miguel prefiere los nombres comerciales viejos |
| `test:integracion` se mueve **detrás** de `verify:acople` | Estaba tapando la puerta de la fase, que no llegaba a correr nunca |
| El `ORGANIZACION` del **Preview** deja de apuntar a un negocio vivo | §4.5. La suite entra con PIN y cambia la plantilla |
| El `DATABASE_URL` del **Preview** y del `.env` local pasa al puerto 6543 | §6. **Production no se tocó** |

Y un contrato que la fase de refutación encontró **mintiendo**, antes de aplicar nada: el de la
`164` buscaba `raise exception` suelto sobre todo el archivo, y ese texto aparece **cinco veces**.
Se podía vaciar entera la poscondición del check —el cuerpo del bucle en `null;`— y la prueba seguía
verde. Apretado recortando el bloque `do $$ … $$;` que toca y afirmando dentro. Validado mutando:

```
D1 · el bucle de la poscondición del check, vaciado        → ROJO
D2 · el conteo «y sólo los seis», borrado                  → ROJO
D3 · la poscondición avisa (raise notice) en vez de fallar → ROJO
D4 · el check reescrito DOS veces y manda la de abajo      → ROJO
I1 · una línea en blanco y un comentario reescrito         → VERDE
```

La D4 es la que más importa: el contrato leía la PRIMERA reescritura y en Postgres manda la ÚLTIMA.

---

## 11 · LO QUE NO HICE, CON NÚMEROS

### Lo que depende de una decisión de Miguel

| Qué | Cuánto | Por qué es suya |
|---|---|---|
| **Promover a producción** | **0 promociones** | Es lo que usan cuatro negocios para cobrar. El preview es lo que quedó funcionando, y promover es un clic |
| **El `DATABASE_URL` de Production al puerto 6543** | 1 variable | §6. Es el cambio que más corre: dos instancias calientes bastan para 500 en hora pico. Está medido y las dos líneas están en `VERCEL-ENTORNO.md §4` |
| **Los nombres comerciales de los paquetes** | 3 etiquetas | §10. Revertirlo es tocar `PACKAGE_LABELS` y su excepción |
| **Protection Bypass for Automation** | 1 secreto | Se genera en el panel, no por línea de comandos. Sin él la verificación usa un enlace compartido que caduca en 23 horas |

### Lo que depende de algo que no está en esta máquina

| Qué | Cuánto | De qué depende |
|---|---|---|
| **`test:integracion`** | **0 de 5 pruebas corridas** | Docker, o `DATABASE_URL_PRUEBAS`. Está EN la cadena a propósito, y por eso `pnpm verify` sale en 1 |
| **La comprobación en vivo de `verify:entorno`** | 0 | Docker. Declarada en `EXCEPCIONES-COBERTURA.md` y la puerta FALLA si esa fila no está |
| **`TZ` en el preview** | 1 variable | Vercel la rechaza: nombre reservado |

### Lo que no se probó contra el despliegue, y sí contra el build local

| Qué | Cuánto |
|---|---|
| Suites de navegador contra el **preview** | **2 de 5** (`abarrotes` y `estetica-salon`). Las cinco pasan contra el mismo build en local. Cada suite contra el preview cuesta cambiar `ORGANIZACION`, redesplegar y renovar la cookie, y lo que la 3.ª, 4.ª y 5.ª añadirían es que el despliegue sirve a otra demo, no código distinto |

### Lo que sigue bloqueado por una decisión de producto

| Qué | Cuánto | Quién decide |
|---|---|---|
| CFDI | 6 funciones + 1 ruta | P-02 · Miguel |
| Impresión de comanda | 1 función + 2 rutas + 1 migración | el hardware · Miguel |
| Segunda pantalla de cafetería | 1 función | el hardware · Miguel |
| Recordatorio por WhatsApp | 1 función | el proveedor · Miguel |
| La plantilla `salon` | 1 plantilla | **Se descartó y está razonado** en la `164` y en el `FILE-MAP.md` del modelo: una cuarta plantilla obligaría a declarar sus módulos, su gate y su `check`, y el primer negocio que la estrenara sería el único que la ejercita |

### Y lo que no se tocó, a propósito

- **Escrituras a los cuatro negocios vivos: 0.** Ni una venta, ni un corte, ni una mesa.
- **Pastelería Confetti (`ivqcxdpqxwjxfohiswqb`): 0 consultas.** Ni para leer.
- **Migraciones aplicadas editadas: 0.** El ejecutor valida por hash.
- **Secretos en commits, reportes o código: 0.** El repositorio es público. Del `.env` se comprueba
  el nombre y la longitud, nunca el valor; la cookie del muro vive fuera del árbol y viaja por el
  entorno.
- **`morphiqpos-codex` y la rama `carril-b`: 0 cambios.**
- **Reescribir la historia de la rama: 0 veces.**
- **Comprobaciones relajadas para que pasaran: 0.** Las tres puertas que se movieron —el orden de
  `test:integracion`, el techo de tiempo de Playwright y el rol `complementary`— se movieron porque
  estaban mal puestas, y las tres están razonadas arriba.

---

## 12 · CÓMO SE SIGUE

1. **`VERCEL-ENTORNO.md §4`** — el pooler. Es lo único que corre prisa y afecta a los cuatro
   negocios.
2. **`A3-COMO-APLICAR.md`** — ya no hay nada que aplicar, pero el §1 es el procedimiento de la
   próxima tanda y el §2 cuenta el error que costó una sesión.
3. **Promover a producción**, cuando Miguel quiera. El preview lleva el mismo build.

Y para reproducir lo de este reporte:

```bash
pnpm verify:acople     # la salida del §1 · con MORPHIQPOS_URL_DESPLIEGUE y la credencial
pnpm verify            # los 31 eslabones del §3
pnpm test:e2e pruebas/e2e/estetica-salon.spec.ts   # una plantilla en el navegador
```
