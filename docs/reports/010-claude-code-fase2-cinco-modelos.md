# 010 · Fase 2 · Etapas 3 a 7 · Cinco modelos construidos

**Agente:** Claude Code (Opus 5) · **Rama:** `fase-2` · **Fechas:** 14–15 de septiembre de 2026
**Alcance:** E3 `restaurante`, E4 `cafeteria`, E5 `abarrotes`, E6 `ferreteria`, E7 `estetica-salon`

---

## 0 · ETAPA 0 · LA RECONCILIACIÓN DEL CATÁLOGO

Se hizo el 14-09-2026, antes de escribir una línea de código, y es lo que evitó que cinco modelos
reinventaran las mismas funciones con nombres distintos.

| Qué | Cuánto |
|---|---|
| IDs añadidos al catálogo | **50** |
| Colisiones de ID entre modelos | **2** — F-146 (caducidad sin lote) y F-148 (peso embebido en EAN-13), las dos entre `abarrotes` y `cafeteria` |
| Funciones FUSIONADAS | **1** — `abarrotes` la llamaba «cobro de fiado en caja» y `ferreteria` «cobro de crédito en caja». Son la misma: dinero que entra al cajón y NO es venta. Quedó **F-254** |
| Reclasificaciones aplicadas | **7** |
| Total de funciones catalogadas | de 232 mal contadas a **363** reales |

**Las dos colisiones las ganó `abarrotes`** porque su acepción la citan tres modelos —el suyo,
`ferreteria` y `estetica-salon`— contra uno solo de `cafeteria`, que se movió a F-156 y F-157.

**El hallazgo que más trabajo ahorró:** F-254, F-255, F-256 y F-260 **no** se fusionan —sus
operaciones y pantallas difieren— pero son el mismo objeto de datos: dinero que entra al cajón, no
es del negocio, y hay que devolverlo o entregarlo. Se construyen sobre **un solo ledger** con cuatro
naturalezas. Escribirlos cuatro veces habría producido cuatro formas distintas de descuadrar. E5 lo
confirmó con el código delante: los tres comandos de F-254/F-255/F-256 salieron sobre la
`pasivos_terceros` de la 063, **sin una tabla nueva**.

**Y un error de conteo que se iba a propagar a 73 modelos:** el catálogo decía «232 funciones» y el
número real era 313 —232 contaba sólo las filas con columna de marca y dejaba fuera las variantes de
inventario, las subfunciones y las sub-filas—. Ese número se cita en tres documentos.

---

## 1 · QUÉ SE CONSTRUYÓ, MODELO POR MODELO

### E3 · `restaurante` — 10 de 11

| Construido | Commit | Prueba | Una mutación que la valida |
|---|---|---|---|
| F-321 dividir cuenta | `dda16de` | `division.test.ts` × 2 | las hijas nacen con el `mesa_id` de la madre |
| F-324 anulación de línea con motivo | `22b9755` | `anulacion-linea.test.ts` · `anulacion.test.ts` | cotizar sin filtrar las líneas anuladas |
| F-303 cambiar de mesa | `8d3aafa` | `cambio-de-mesa.test.ts` | la comanda no reapunta a la mesa nueva |
| F-302 unir y separar mesas | `ef4bb19` | `union-de-mesas.test.ts` | las líneas no se mueven a la cuenta principal |
| F-305 tiempo de ocupación | `fa1938b` | `ocupacion.test.ts` | el ciclo vigente entra en el promedio |
| F-306 lista de espera con la espera calculada | `818d4c6` | `espera.test.ts` × 2 | la cola cuenta a todos y no a los de su tamaño |
| F-323 marcha por tiempos · F-315 el reloj | `42bbd2e` | `marcha.test.ts` · `comandos-cocina.test.ts` | el plato que no sale entra al promedio |
| F-325 relevo de responsable · F-242 propina | `c22947a` | `relevo.test.ts` · `propina-repartida.test.ts` | el que entra hereda el consumo del que sale |
| F-261 consumo de empleados y cortesías | `6aceab0` | `consumo-interno.test.ts` | se registra como salida de venta |
| **Cierre** · migraciones 070-074, 076, 077 | `c6f3536` | — | — |

**Pendiente:** F-318 impresión de comanda — **BLOQUEADA** por el encargo.

### E4 · `cafeteria` — 6 de 15

| Construido | Commit | Prueba | Una mutación que la valida |
|---|---|---|---|
| §0.1 el trigger de unidad base, ampliado | `4be6d6d` | `canal.test.ts` | el empaque no se filtra por canal |
| F-328 fila · F-329 llamado · F-331 empaque | `4be6d6d` | `barra.test.ts` · `comanda-al-cobrar.test.ts` | la espera se mide desde que se encoló, no desde que pagó |
| F-156 merma de barra · F-157 frescura del grano | `b21205f` | `merma-barra.test.ts` · `lote-grano.test.ts` | la merma entra en positivo |
| F-248 el bote del turno, repartido por horas | `b47ee9f` | `bote.test.ts` | reparte en partes iguales y no por horas |
| **Cierre** · migraciones 080-083, 085-087 | `7c63eaf` | — | — |

**Pendientes con su razón:** F-023 listas de precio —reclasificada a TRONCO: toca el camino del
precio de los cinco modelos y de las tres rutas de captura—; F-027, F-030, F-330, F-235, F-984.
**F-249 segunda pantalla al cliente: BLOQUEADA.**

### E5 · `abarrotes` — 8 de 12 · la raíz de A1

| Construido | Commit | Prueba | Una mutación que la valida |
|---|---|---|---|
| F-111 · F-112 · F-147 presentaciones | `8ea8846` | `v3-presentaciones.test.ts` · `presentaciones.test.ts` | el factor que no convierte nada |
| F-254 · F-255 · F-256 el dinero ajeno | `329049c` | `pasivos.test.ts` · 28 casos | `aTerceros` con el importe completo: la comisión nunca se separa |
| F-149 · F-106 conteo cíclico por zona | `9db8a99` | `conteo.test.ts` × 2 · 36 casos | el factor puesto a 1 en vez de leído del catálogo |
| F-148 EAN-13 con peso o importe embebido | `a089046` | `codigo-barras.test.ts` · 16 casos | la suma del dígito de control sin alternar 1 y 3 |
| F-107 sugerencia · F-040 clientes en el puente | `4cab9e5` | `pedido.test.ts` · `sugerencia.test.ts` | la merma prediciendo el pedido |
| F-257 redondeo de cambio | `c8b767c` | `cambio.test.ts` · `redondeo.test.ts` | el `en_contra` sin restar |
| **Cierre** · migraciones 090, 091, 097, 099 | `4c90a2c` | — | — |

**Pendientes con su razón:** F-011 IVA mixto e IEPS —toca el camino del precio de las tres rutas de
captura; media función deja el sistema declarando mal con apariencia de estar hecho—; F-986, F-201
y F-983 son pantalla y hardware; F-146, F-058, F-980, F-214, F-103, F-635, F-017.
**F-988 venta sin conexión y F-940…F-945 CFDI: BLOQUEADAS.**

### E6 · `ferreteria` — 9 de 13

| Construido | Commit | Prueba | Una mutación que la valida |
|---|---|---|---|
| F-059 · F-152 · F-201 la medida como eje | `ba3becf` | `medidas.test.ts` · `catalogo.test.ts` · 39 casos | la pulgada en milímetros enteros |
| F-151 pieza ↔ kilo con tolerancia | `ba3becf` | dentro de `medidas.test.ts` | la pesada redondeada hacia abajo |
| F-145 · F-150 corte de material y retazo | `5c80fbc` | `corte.test.ts` × 2 · 32 casos | la merma sin salir del almacén |
| F-638 · F-639 · F-606 · F-614 el crédito | `66e4d28` | `credito.test.ts` × 2 · `obras.test.ts` · 44 casos | sellar que todos estaban en la lista |
| F-258 servicio de mostrador | `7d806fa` | `servicio.test.ts` · 8 casos | el material saliendo como venta |
| **Cierre** · migraciones 110-113 | `3cbfeef` | — | — |

**Pendientes con su razón:** F-061 foto de mostrador es pantalla; F-060 tiene tabla y no comando;
el pago a crédito y F-617 quedan sin comando aunque `repartirPago` está probado; F-153, F-600…F-607,
F-103, F-051, F-635, F-636, F-054. **F-940…F-945 CFDI: BLOQUEADAS.**

### E7 · `estetica-salon` — el motor de A3, de cero

| Construido | Commit | Prueba | Una mutación que la valida |
|---|---|---|---|
| F-401 · F-415 duración como secuencia | `1523813` | `duracion.test.ts` · 17 casos | el procesado ocupando al profesional |
| F-404 · F-409 huecos y lista de espera | `1523813` | `huecos.test.ts` · 15 casos | el hueco de doce minutos contado como hueco |
| F-440 · F-423 · F-428 la comisión | `1523813` | `comision.test.ts` · 24 casos | el IVA siempre comisionado |
| F-400 · F-402 agendar | `b11791d` | `agenda.test.ts` · 16 casos | el rango activo igualado a la ocupación |
| F-412 · F-407 · F-434 · F-443 ciclo y ledger | `b11791d` | `ciclo.test.ts` · 21 casos | el no-show sin firma |
| F-427 · F-259 liquidación · F-155 · F-441 | `8a0719a` | `liquidacion.test.ts` · 12 casos | comisión y propina sumadas en un total |

**Pendientes con su razón:** F-414 anticipo, F-439 paquetes, F-243/F-260 propina V4, el comando de
F-416 y el expediente completo de F-434 quedan con su hueco de migración libre (`134`, `136`–`145`);
F-409 tiene dominio y no tabla; F-428 tiene dominio y no tabla de participaciones; F-017 sigue sin
construirse y **once modelos más vienen detrás**. **F-406 recordatorio por WhatsApp: BLOQUEADA.**

**Migraciones escritas y NO aplicadas en las cinco etapas:** 070-074, 076, 077, 080-083, 085-087,
090, 091, 097, 099, 110-113, 130-133, 135.

---

## 2 · `pnpm verify:fase2`

Ejecutado al cierre de cada modelo y al final. Los 26 eslabones en 0:

```
arranque · estructura · histórico · tsconfig · entorno · certificado · residuos · aspecto
escrituras · lecturas · primitivas · format:check · lint · typecheck · pruebas · test:unit
mutaciones-backend · catalogo · inventario · comandos-catalogo · comandos-inventario
venta · identidad · paquetes · build · cabeceras
```

Al cierre de E7, con los tres componentes de `apps/web/src/` ya en el árbol —o sea que
`verify:primitivas`, `lint`, `typecheck` y `build` los vieron—: **158 archivos de prueba ·
1,837 pruebas · 0 fallos**, y `exit=0` en el último eslabón.

Esta es la salida entera, sin recortar. Es larga a propósito: las líneas de las puertas de
mutación son el único sitio donde se puede comprobar, una por una, que cada destructiva
encontró una prueba que la cazara.

<details>
<summary><strong>Salida completa de <code>pnpm verify:fase2</code> (505 líneas, 26 eslabones, exit=0)</strong></summary>

```text
$ pnpm verify:arranque && pnpm verify:estructura && pnpm verify:historico && pnpm verify:tsconfig && pnpm verify:entorno && pnpm verify:certificado && pnpm verify:residuos && pnpm verify:aspecto && pnpm verify:escrituras && pnpm verify:lecturas && pnpm verify:primitivas && pnpm format:check && pnpm lint && pnpm typecheck && pnpm verify:pruebas && pnpm test:unit && pnpm verify:mutaciones-backend && pnpm verify:catalogo && pnpm verify:inventario && pnpm verify:comandos-catalogo && pnpm verify:comandos-inventario && pnpm verify:venta && pnpm verify:identidad && pnpm verify:paquetes && pnpm build && pnpm verify:cabeceras
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
✓ Raíz de Supabase vigente 1683 día(s) más (hasta 2031-04-26).
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
Pages directory cannot be found at D:\MIS PROYECTOS\Master POS\morphiqpos-fase2\pages or D:\MIS PROYECTOS\Master POS\morphiqpos-fase2\src\pages. If using a custom path, please configure with the `no-html-link-for-pages` rule in your eslint config file.
$ turbo run typecheck
• turbo 2.10.12

   • Packages in scope: @morphiqpos/app, @morphiqpos/contracts, @morphiqpos/data, @morphiqpos/domain, @morphiqpos/testing, @morphiqpos/ui, @morphiqpos/web
   • Running typecheck in 7 packages
   • Remote caching disabled, using shared worktree cache

@morphiqpos/contracts:typecheck: cache hit, replaying logs 43a0708421f0d191
@morphiqpos/contracts:typecheck: $ tsc --noEmit
@morphiqpos/testing:typecheck: cache hit, replaying logs a0a367305ce1ceb2
@morphiqpos/testing:typecheck: $ tsc --noEmit
@morphiqpos/domain:typecheck: cache hit, replaying logs e7f247faf7654437
@morphiqpos/ui:typecheck: cache hit, replaying logs 0d1e3e0db184a077
@morphiqpos/ui:typecheck: $ tsc --noEmit
@morphiqpos/domain:typecheck: $ tsc --noEmit
@morphiqpos/data:typecheck: cache hit, replaying logs acf8b50a1be56136
@morphiqpos/data:typecheck: $ tsc --noEmit
@morphiqpos/app:typecheck: cache hit, replaying logs 4a16676bf3b0c719
@morphiqpos/app:typecheck: $ tsc --noEmit
@morphiqpos/web:typecheck: cache hit, replaying logs 460206012ccdd658
@morphiqpos/web:typecheck: $ tsc --noEmit

 Tasks:    7 successful, 7 total
Cached:    7 cached, 7 total
  Time:    155ms >>> FULL TURBO

$ node scripts/verificar-pruebas.mjs
✓ Pruebas: 158 unitarias en la puerta correcta, 5 de integración cubiertas, cero scripts que esquiven la raíz.
$ vitest run

 RUN  v5.0.0 D:/MIS PROYECTOS/Master POS/morphiqpos-fase2


 Test Files  158 passed (158)
      Tests  1837 passed (1837)
   Start at  05:13:17
   Duration  51.20s (import 88%, transform 8%, tests 3%, worker 1%)

     Import  421 modules were evaluated 2105 times · 198.08s total, 88% of tracked time
             ~15.50s faster with isolate: false — shared modules are evaluated once per worker instead of once per file
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

@morphiqpos/web:build: cache hit, replaying logs 4e618348bce51a0f
@morphiqpos/web:build: $ next build
@morphiqpos/web:build: ▲ Next.js 16.3.4 (Turbopack)
@morphiqpos/web:build: ✓ Running next.config.mjs took 122ms
@morphiqpos/web:build: 
@morphiqpos/web:build: ⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
@morphiqpos/web:build: 
@morphiqpos/web:build:   To migrate automatically, run:
@morphiqpos/web:build:   npx @next/codemod@canary middleware-to-proxy .
@morphiqpos/web:build: 
@morphiqpos/web:build:   Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
@morphiqpos/web:build:   Creating an optimized production build ...
@morphiqpos/web:build: ✓ Compiled successfully in 2.2min
@morphiqpos/web:build:   Running TypeScript ...
@morphiqpos/web:build: ✓ Finished filesystem cache database compaction in 16.8s
@morphiqpos/web:build:   Finished TypeScript in 25.0s ...
@morphiqpos/web:build:   Collecting page data using 7 workers ...
@morphiqpos/web:build:   Generating static pages using 7 workers (0/104) ...
@morphiqpos/web:build:   Generating static pages using 7 workers (26/104) 
@morphiqpos/web:build:   Generating static pages using 7 workers (52/104) 
@morphiqpos/web:build:   Generating static pages using 7 workers (78/104) 
@morphiqpos/web:build: ✓ Generating static pages using 7 workers (104/104) in 548ms
@morphiqpos/web:build:   Finalizing page optimization ...
@morphiqpos/web:build: 
@morphiqpos/web:build: Route (app)
@morphiqpos/web:build: ┌ ƒ /
@morphiqpos/web:build: ├ ƒ /_not-found
@morphiqpos/web:build: ├ ƒ /api/agenda/cancelar
@morphiqpos/web:build: ├ ƒ /api/agenda/cerrar-servicio
@morphiqpos/web:build: ├ ƒ /api/agenda/cita
@morphiqpos/web:build: ├ ƒ /api/agenda/iniciar
@morphiqpos/web:build: ├ ƒ /api/agenda/no-llego
@morphiqpos/web:build: ├ ƒ /api/archivos/[...ruta]
@morphiqpos/web:build: ├ ƒ /api/archivos/subir
@morphiqpos/web:build: ├ ƒ /api/auth/empleados
@morphiqpos/web:build: ├ ƒ /api/auth/entrar
@morphiqpos/web:build: ├ ƒ /api/auth/salir
@morphiqpos/web:build: ├ ƒ /api/cafeteria/bote
@morphiqpos/web:build: ├ ƒ /api/cafeteria/calibracion
@morphiqpos/web:build: ├ ƒ /api/cafeteria/deshacer-entrega
@morphiqpos/web:build: ├ ƒ /api/cafeteria/entregar
@morphiqpos/web:build: ├ ƒ /api/cafeteria/llamar
@morphiqpos/web:build: ├ ƒ /api/cafeteria/lote-grano
@morphiqpos/web:build: ├ ƒ /api/cafeteria/merma
@morphiqpos/web:build: ├ ƒ /api/cafeteria/no-recogido
@morphiqpos/web:build: ├ ƒ /api/cafeteria/presencia
@morphiqpos/web:build: ├ ƒ /api/caja/abrir
@morphiqpos/web:build: ├ ƒ /api/caja/cerrar
@morphiqpos/web:build: ├ ƒ /api/caja/corte-turno
@morphiqpos/web:build: ├ ƒ /api/caja/eliminar-corte
@morphiqpos/web:build: ├ ƒ /api/caja/encolar-sincronizacion
@morphiqpos/web:build: ├ ƒ /api/caja/estado
@morphiqpos/web:build: ├ ƒ /api/caja/movimiento
@morphiqpos/web:build: ├ ƒ /api/catalogo/atributo
@morphiqpos/web:build: ├ ƒ /api/catalogo/buscar-material
@morphiqpos/web:build: ├ ƒ /api/catalogo/categorias
@morphiqpos/web:build: ├ ƒ /api/catalogo/configuracion
@morphiqpos/web:build: ├ ƒ /api/catalogo/crear-producto
@morphiqpos/web:build: ├ ƒ /api/catalogo/demostracion/resetear
@morphiqpos/web:build: ├ ƒ /api/catalogo/inicio
@morphiqpos/web:build: ├ ƒ /api/catalogo/modificadores
@morphiqpos/web:build: ├ ƒ /api/catalogo/presentacion
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos/actualizar
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos/codigo
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos/crear
@morphiqpos/web:build: ├ ƒ /api/catalogo/productos/precio
@morphiqpos/web:build: ├ ƒ /api/catalogo/sesion
@morphiqpos/web:build: ├ ƒ /api/comision/liquidar
@morphiqpos/web:build: ├ ƒ /api/comision/registrar
@morphiqpos/web:build: ├ ƒ /api/compras/plantilla
@morphiqpos/web:build: ├ ƒ /api/compras/plantilla/usar
@morphiqpos/web:build: ├ ƒ /api/compras/registrar
@morphiqpos/web:build: ├ ƒ /api/compras/sugerencia
@morphiqpos/web:build: ├ ƒ /api/configuracion/paquete
@morphiqpos/web:build: ├ ƒ /api/configuracion/presentacion
@morphiqpos/web:build: ├ ƒ /api/configuracion/presentacion-contrasena
@morphiqpos/web:build: ├ ƒ /api/credito/autorizado
@morphiqpos/web:build: ├ ƒ /api/credito/autorizado-baja
@morphiqpos/web:build: ├ ƒ /api/credito/evaluar
@morphiqpos/web:build: ├ ƒ /api/credito/obra
@morphiqpos/web:build: ├ ƒ /api/credito/obra-cerrar
@morphiqpos/web:build: ├ ƒ /api/credito/remision
@morphiqpos/web:build: ├ ƒ /api/datos/consultar
@morphiqpos/web:build: ├ ƒ /api/datos/escribir
@morphiqpos/web:build: ├ ƒ /api/envase/deposito
@morphiqpos/web:build: ├ ƒ /api/fiado/abono
@morphiqpos/web:build: ├ ƒ /api/gastos/plantilla
@morphiqpos/web:build: ├ ƒ /api/gastos/registrar
@morphiqpos/web:build: ├ ƒ /api/identidad/accesos
@morphiqpos/web:build: ├ ƒ /api/identidad/empleados
@morphiqpos/web:build: ├ ƒ /api/identidad/pin
@morphiqpos/web:build: ├ ƒ /api/inventario/ajustar
@morphiqpos/web:build: ├ ƒ /api/inventario/almacenes/crear
@morphiqpos/web:build: ├ ƒ /api/inventario/consumo-interno
@morphiqpos/web:build: ├ ƒ /api/inventario/conteo/abrir
@morphiqpos/web:build: ├ ƒ /api/inventario/conteo/capturar
@morphiqpos/web:build: ├ ƒ /api/inventario/conteo/cerrar
@morphiqpos/web:build: ├ ƒ /api/inventario/corte
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
@morphiqpos/web:build: ├ ƒ /api/propinas/esquema
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
@morphiqpos/web:build: ├ ƒ /api/venta/agregar-linea
@morphiqpos/web:build: ├ ƒ /api/venta/buscar
@morphiqpos/web:build: ├ ƒ /api/venta/cambiar-cantidad
@morphiqpos/web:build: ├ ƒ /api/venta/cobrar
@morphiqpos/web:build: ├ ƒ /api/venta/cobrar-cita
@morphiqpos/web:build: ├ ƒ /api/venta/crear-orden
@morphiqpos/web:build: ├ ƒ /api/venta/estado
@morphiqpos/web:build: ├ ƒ /api/venta/quitar-linea
@morphiqpos/web:build: ├ ƒ /api/venta/redondeo
@morphiqpos/web:build: ├ ƒ /api/venta/servicio
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
Cached:    1 cached, 1 total
  Time:    494ms >>> FULL TURBO

$ node scripts/verificar-cabeceras.mjs
✓ Cabeceras de seguridad: 6 presentes y correctas, nonce por peticion.
exit=0
```

</details>

---

## 3 · QUÉ SE ABRIÓ EN EL NAVEGADOR, Y QUÉ NO

**Nada. Ninguna pantalla de las cinco etapas se abrió en el navegador, y hay que decirlo entero.**

Las razones, por etapa:

- **E3 y E4** · casi todas sus pantallas viven en `apps/web/heredado/` y **D-09 prohíbe editar
  archivos que ya existen ahí** mientras Codex trabaja —comprobado al cierre: `carril-b` **no** está
  fusionada a `main`, así que la excepción de D-09 no aplica—. El encargo dice que de esas dos
  etapas salga «el backend completo, los componentes nuevos escritos al lado, y el cambio de una
  línea en el FILE-MAP». **Las tres cosas salieron**: los tres componentes nuevos están en
  `apps/web/src/` —donde el verificador de primitivas sí los vigila, cosa que `heredado/` no hace—
  y el enganche de una línea está anotado en cada FILE-MAP. Lo que no se pudo es **abrirlos**:
  llaman a rutas cuyos comandos leen tablas de las migraciones `070`–`077` y `082`, escritas y sin
  aplicar.
- **E5, E6 y E7** · las funciones dependen de tablas y columnas que sólo existen en migraciones
  **escritas y no aplicadas**, que es lo que la Fase 2 manda hacer. Una pantalla de conteo contra
  una base sin `zonas_anaquel` no falla con un error entendible: falla con un 42P01. El encargo
  dice: *«Lo que dependa de una migración sin aplicar no se puede abrir: DILO EXPLÍCITAMENTE en vez
  de declararlo hecho»*. Aquí queda dicho.

**Lo que sí se puede ejercer hoy sin base:** las **26 funciones puras de dominio** que estas cinco
etapas añadieron a `packages/domain`, que es donde vive la aritmética que importa —el reparto por
pesos, la escala de cantidades, el EAN con peso embebido, la medida en micrómetros, el corte y su
merma, la secuencia de la cita, las cinco preguntas de la comisión— y que corren en cada
`verify:fase2` dentro de las 1,837 pruebas de la suite.

---

## 4 · RECLASIFICACIONES `[=]` ↔ `[≠]`

| Función | De | A | Por qué, con el código delante |
|---|---|---|---|
| **F-106** toma de inventario | `[falta]` en `cafeteria` y `abarrotes` | `[=]` reutilizada | E2 la construyó entera: `tomas_inventario`, `toma_conteos` con el esperado sellado, y su repositorio |
| **F-149** conteo cíclico | parte de F-106 | función propia | Lo que faltaba no era el motor: era una zona que sabe cada cuántos días toca y cuándo se contó |
| **F-152** ubicación contra **F-149** zona | se leían como la misma | **dos tablas** | La zona es para CONTAR —una vez al día, agrupando gavetas— y la ubicación para VENDER —sesenta veces al día, gaveta por gaveta—. Fusionarlas obliga a contar 400 gavetas |
| **F-121** venta en dos unidades | `[+]` factor exacto | `[≠]` con dos variantes | En `abarrotes` la caja trae 24; en `ferreteria` el factor es el PESO POR PIEZA, medido, con 3–8 % de desviación entre lotes |
| **F-254** cobro de fiado / de crédito | dos IDs | **uno** | Ya fusionadas en E0; confirmado con el código: es el mismo movimiento con el vocabulario de cada giro |
| La aplicación de pagos | `jsonb` como en `abarrotes` | **tabla** en `ferreteria` | Allá nadie consulta el detalle; aquí se consulta Y SE DISCUTE, y por eso `repartirPago` es función pura con prueba propia |
| **«barista»** | rol del sistema | **no existe** | Un barista cobra y prepara: los comandos de barra los ejecutan `cajero` y `cocina` |
| **F-023** listas de precio | de `cafeteria` | **de TRONCO** | Toca el camino del precio de los cinco modelos y de las tres rutas de captura |
| **La zona del conteo** | `productos.zona_id` (doc) | **`insumos.zona_id`** | Lo que se cuenta es el insumo; con la zona en el producto, un insumo sin producto es invisible al recorrido |

---

## 5 · DOCUMENTACIÓN CORREGIDA, Y POR QUÉ ESTABA MAL

1. **`restaurante` §5 · `anularLinea` «revierte el consumo si ya se cobró».** Eso es F-222
   (devolución), que es otra función con otro flujo de caja. Anular una línea de una cuenta abierta
   no devuelve dinero.
2. **`restaurante` · la nota «Sobre 069».** La consolidación de plantillas la dejó en la 066.
3. **`cafeteria` · `pedidos_preparacion` no existe** en el esquema: es `comandas`, y el puente ya
   las traduce. La carpeta usa el nombre del frontend heredado.
4. **`cafeteria` §7 · «`restaurante` ocupa de la 060 a la 069»** — D-08 le da de la 070 a la 078.
5. **`abarrotes` §1.5–1.8 · cuatro tablas que no se crearon.** `operaciones_comision`,
   `saldos_comisionista`, `depositos_envase` y `abonos_fiado` son el mismo objeto, y E0 ya lo había
   decidido: salieron como tres comandos sobre la `pasivos_terceros` de la 063.
6. **`abarrotes` §1.9 · `redondeos` sin `movimiento_caja_id`.** Sin la fila gemela, el arqueo sigue
   descuadrando por los mismos veinte centavos que F-257 viene a explicar.
7. **`abarrotes` §7 · la migración de presentaciones numerada `070` en el texto y `090` en el
   árbol.** La real es la `090`; la `070` es de `restaurante`.
8. **`abarrotes`/`ferreteria` §6 · `compras/sugerencia/[proveedorId]` y `credito/*` con parámetro de
   ruta.** Los comandos que necesitan más de un dato van por POST con cuerpo validado: meter dos en
   la cadena de consulta los deja fuera de la validación de `definirComando`.
9. **`estetica-salon` §8.1 · las migraciones numeradas `096`, `108`, `109` y `112`** con la
   numeración anterior a D-08. Son la `130`, la `142`, la `143` y la `066`.
10. **El contrato `estados-con-columna.contrato.test.ts` de E2 estaba mal**, y se corrigió. Ver §7.

---

## 6 · LO QUE NO HICE

Esta sección es obligatoria y va entera.

### 6.1 · La interfaz: tres componentes, y todo lo demás sin escribir

El encargo pide, por función, «(f) la pantalla, con el layout de PC, tablet y teléfono que ya está
descrito en su `04-INTERFAZ.md`». Lo que salió es **tres componentes nuevos**, los de E3 y E4, que
son los que D-09 permite escribir al lado de los viejos:

| Componente | Función | Gate que lo cubre |
|---|---|---|
| `DividirCuentaDialog.tsx` | F-321 | primitivas · lint · typecheck · build |
| `AnularLineaDialog.tsx` | F-324 | ídem |
| `FilaDeBarra.tsx` | F-328 · F-329 | ídem |

**De las demás funciones no escribí pantalla.** Para E5, E6 y E7 la razón es la de §3 —dependen de
migraciones que la Fase 2 escribe y no aplica— pero hay una segunda que también hay que decir: el
`04-INTERFAZ.md` de esos modelos **no decide** los diálogos de las funciones nuevas. Decide las
pantallas del modelo —mapa de mesas, cobro, precuenta, cocina—, no un diálogo de conteo cíclico ni
uno de corte de material. Construirlos habría sido inventar layout, que es justo lo que el encargo
prohíbe («No lo reinventes, está decidido»). **Que la decisión falte no me exime de la función: me
obliga a decir que falta.** Aquí queda dicho, y es el hueco más grande de estas cinco etapas.

Ninguno de los tres componentes escritos se abrió en el navegador, por lo mismo.

### 6.2 · Funciones que quedaron sin construir, con su razón

- **F-011 IVA mixto e IEPS** (`abarrotes`). Es lo único que dejé **sabiendo que duele**. Toca el
  camino del precio de las tres rutas de captura y de los cinco modelos; media función —la tasa por
  producto sin el desglose en el ticket ni en la factura global— deja el sistema declarando mal con
  la apariencia de estar hecho, que es peor que no tenerlo.
- **F-023 listas de precio** (`cafeteria`), por lo mismo y reclasificada a tronco.
- **F-017 diccionario de vocabulario.** Lo pidieron `abarrotes`, `ferreteria` y `estetica-salon`.
  **Tres modelos seguidos y once más vienen detrás.** No lo construí.
- **El pago a crédito de `ferreteria`** (F-614 en variante) y **F-617 bloqueo por mora**:
  `repartirPago` existe y está probado; falta el comando que lo ejecuta contra `pagos_credito`.
- **F-409 lista de espera** y **F-428 reparto entre profesionales** en `estetica-salon`: los dos
  tienen dominio construido y probado, y les falta tabla y comando.
- **El material en la base de la comisión**: `calcularComision` sabe descontarlo; `cobrarCita` le
  pasa cero, con un comentario que lo dice.
- **F-060 equivalencias** en `ferreteria`: tabla escrita, comando no.
- Y las listas largas de cada etapa, en su bitácora.

### 6.3 · Dos huecos de cobertura que declaro en vez de tapar

- **Los predicados de SQL crudo no se pueden poner rojos.** El `and cantidad >= …` de los `update`
  de existencias —en el conteo, en el corte, en el servicio de mostrador y en el consumo de
  cabina— no es observable con la base falsa, que no interpreta SQL. Las pruebas cubren la
  REACCIÓN —cuando el update no casa ninguna fila se lanza `STOCK_INSUFICIENTE`— y no el predicado.
  Son contratos con Postgres y necesitan integración con `DATABASE_URL`.
- **Los compare-and-set de carrera tampoco.** El del saldo del cliente en la remisión y el de la
  comisión al liquidar sólo fallan con una escritura ajena entre la lectura y el `update`, y montar
  eso con la base falsa exigiría dos filas con el mismo id —que Postgres no permite—. Una prueba
  sobre un estado imposible no prueba nada. Se conservan como segundos cerrojos **y el comentario
  lo dice**.

### 6.4 · Un commit que dejé en rojo, y cómo se arregló

El commit `1523813` se hizo **con cinco pruebas en rojo**: el contrato `estados-con-columna` de E2
marcaba que las migraciones `132` declaraban `check` que ningún comando satisfacía. Lo vi al leer la
salida DESPUÉS de haber hecho el commit. Se arregló en `b11791d`, que es el commit siguiente, y la
rama está verde. **No debí haber cometido con la suite en rojo**, y lo anoto porque el encargo pide
reportar lo que pasó y no lo que debería haber pasado.

### 6.5 · Lo que no toqué, a propósito

- El proyecto Supabase de Pastelería Confetti. Ni para leer.
- La base viva: no se aplicó ninguna migración ni se escribió un dato.
- `scripts/esquema-esperado.json`.
- Archivos que ya existían dentro de `apps/web/heredado/` (D-09).
- La rama `carril-b` y el árbol viejo.

---

## 7 · TRES HALLAZGOS QUE VALEN MÁS QUE SU FUNCIÓN

### 7.1 · Dos `check` que reventaban contra Postgres, invisibles para toda la suite

Al escribir F-257 aparecieron dos defectos latentes que ninguna puerta veía:

1. `movimientos_caja.referencia_tipo` seguía con el `check` de la 003 —`('orden','gasto','manual')`—
   y los comandos de F-254/F-255/F-256 escriben `'pasivo'`. Contra una base con la 003 aplicada,
   **revientan**.
2. `packages/domain/src/inventario/consumo.ts` planea movimientos con
   `tipo = 'salida_consumo_interno'` desde F-261 (E3) y **ninguna migración lo añadió al `check`**.
   La primera cortesía revienta igual.

Los dos se cierran en la `097`. Ninguno se vio antes porque en la Fase 2 las migraciones no se
aplican y las pruebas corren contra la base falsa, que no lleva `check`. Es literalmente la pregunta
que el estándar de contratos obliga a hacerse: **¿qué camino de ejecución NO recorre ninguna de mis
puertas?**

### 7.2 · Un contrato de E2 cazó un hueco… y el contrato también estaba mal

`estados-con-columna.contrato.test.ts` marcó en rojo que nadie escribía `cerrada` en `obras` (E6) ni
`cobrada`/`no_llego`/`cancelada` en `citas` (E7). Las dos veces tenía razón y salieron los comandos
que faltaban —entre ellos `credito.cerrar_obra`, que además no deja cerrar una obra con saldo—.

Pero al escribir `cobrarCita`, el mismo contrato **falló señalando código correcto**: leía el archivo
entero y le atribuía a `citas` el `values({ estado: 'cobrada' })` de `ordenes`. Se corrigió para que
recorte por tabla, **y se comprobó que sigue cazando las regresiones reales**. Un contrato que manda
a arreglar lo que no está roto es la versión más cara de un contrato que miente.

### 7.3 · La lección más cara: una mutación que no se APLICA se lee igual que una que no se pone roja

Las sustituciones con `perl -0pi -e` cuyo patrón lleva `\n` **no aplican** a través de esta
herramienta. Cuatro mutaciones seguidas salieron «verdes» sin haberse escrito nunca, y la conclusión
falsa —«la prueba no vale»— habría llevado a **borrar código bueno**. Desde entonces las mutaciones
van por un script que falla ruidosamente si no encuentra el texto o si lo encuentra más de una vez:
una mutación ambigua tampoco prueba nada.

---

## 8 · LAS CUATRO PREGUNTAS DE CIERRE, CONTESTADAS CON EL CÓDIGO DELANTE

**P1 · ¿Es fiel al negocio?** Sí en lo construido, y de una manera que se puede señalar: la merma de
corte que se escribe junto a la venta, el procesado que libera al profesional, el dinero ajeno que
no suma a ventas, el chicle de cambio que sale del anaquel con renglón. Cada uno de ésos venía de un
descuadre documentado en el `02-DINERO-Y-CAJA.md` de su modelo.

**P2 · ¿Da control total?** No todavía. Falta el IVA por producto, faltan los cortes rearmados de
cada giro (F-234 en tres modelos) y faltan los reportes de dinero dormido y rotación. Lo que sí hay
es el ledger debajo de todos ellos.

**P3 · ¿Parece hecho a la medida?** **No se puede contestar: no hay pantalla.** Es la pregunta que
esta entrega no puede responder, y por la razón de §6.1.

**P4 · ¿Se distingue de sus vecinos?** Sí, y se comprobó campo por campo: `ferreteria` desborda a
`abarrotes` por la medida, el corte y el crédito con autorizados —los cinco puntos que su FILE-MAP
exigía—, y `estetica-salon` no se parece a nada porque A3 no existía.

---

## 9 · LO QUE HAY QUE DECIDIR ANTES DE SEGUIR

1. **¿Permite Supabase `create extension btree_gist`** en el proyecto del salón? Sin ella, la
   restricción que impide agendar dos clientas con la misma persona a la misma hora no se puede
   declarar, y el plan B —slots discretos de cinco minutos— pierde justo los huecos que F-415 viene
   a recuperar. **Es el único riesgo técnico serio de las cinco etapas.**
2. **P-04** sigue abierta: la `066` toca datos vivos de cuatro negocios.
3. **F-988** (venta sin conexión) y **P-02** (CFDI) siguen esperando decisión.
4. **La tabla de mapeo categoría → tasa de IVA la revisa un contador** antes de aplicar la `098`.
5. **La pasada de interfaz** es lo siguiente, y es grande: son cinco modelos sin una sola pantalla.
