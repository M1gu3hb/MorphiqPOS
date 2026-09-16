# FILE-MAP · Estética / salón de belleza

**Modelo:** `estetica-salon` · **Familia:** 03 Servicios con cita · **Arquetipo:** A3 raíz + A1 injertado
**Ruta:** `fase-2/modelos/03-servicios-cita/estetica-salon/`
**Estado:** ✅ **terminado** (documentación) · el código está **sin empezar**
**Cliente vivo:** ninguno todavía
**Plantilla destino:** `salon` (nueva)

> **Esta carpeta es la raíz del arquetipo A3, y A3 no existía.**
> `restaurante` es la raíz de A2 (la heredan 12 de alimentos). `abarrotes` es la raíz de A1 (la
> heredan 18 de retail). **Ésta es la tercera raíz**, y la heredan **once modelos de servicios con
> cita** más otros once que llevan A3 como delta — veintidós en total, según
> `01-MAPA-GENERAL.md` §5.
>
> De las treinta y cinco funciones catalogadas del bloque F-4xx, **cero estaban construidas.**
> Ninguna. Ni un calendario. Cuando alguien abra `barberia`, `nail-salon`, `spa-masajes`,
> `clinica-dental`, `veterinaria`, `fisioterapia`, `estudio-tatuajes` o `estudio-fotografia`, lo
> primero que tiene que hacer es leer esta carpeta y citar sus IDs.

---

## 1 · ÍNDICE DE LA CARPETA

| Archivo | Qué hay dentro |
|---|---|
| `00-FICHA-Y-EJES.md` | Por qué el hueco de las 3 pm no se recupera nunca y por qué la clienta viene con Paty y no al salón; el perfil real de la dueña con sus cinco personas y **cuatro formas distintas de repartir el dinero**; el precio que ya anclaron AgendaPro, Booksy y Fresha; **el día completo hora por hora con el procesado, la walk-in metida adentro y el no-show de las 18:00**; los seis ejes del mapa y los seis de diseño **con la defensa de por qué la agenda es la pantalla de inicio y no un dashboard**; el arquetipo y lo que hereda cada uno de los once vecinos; las trece cosas que este negocio **no** necesita; y los tres dolores con sus cifras |
| `01-FUNCIONES.md` | El árbol completo con IDs canónicos, **el aviso de que el bloque F-4xx entero está a cero**, las `[=]` que se reutilizan sin tocarlas —incluido el IVA, donde este modelo es **más simple** que abarrotes—, **cincuenta `[≠]` con su tabla comparativa de tres columnas**, las `[+]` que nacen aquí para los once, los doce huecos con su costo operativo, **quince funciones nuevas propuestas al catálogo y tres reclasificaciones**, el grafo de dependencias y el orden de construcción en siete tandas con la defensa de por qué la regla va antes que el cálculo |
| `02-DINERO-Y-CAJA.md` | **La distinción entre comisión y propina, que es el eje del giro: dos dineros de naturaleza contraria que salen del mismo cajón la misma noche**; qué cuenta como venta uno por uno con el anticipo, el paquete y la renta; IVA 16% de tasa única y la asimetría del anticipo; el descuento con su efecto en comisión enseñado en pantalla; **propinas V4 directas con su mecánica de pasivo**; los siete métodos de pago reales; anticipos y paquetes con su reconocimiento por sesión; **las cinco preguntas donde nace el pleito de la comisión, contestadas una por una**; la caja con sus **veintidós movimientos de los cuales quince no son venta y cinco son repartos a personas del salón**; **el PDF del corte en diecisiete secciones en orden, con la liquidación por profesional y la sección de agenda**; el comprobante individual; y los cinco descuadres típicos |
| `03-INVENTARIO.md` | **Por qué V1 no significa "sin inventario" y hay que reescribirla en el catálogo: el tiempo es el inventario, con existencia, merma y caducidad instantánea**; por qué V6 para cabina y V2 para anaquel y por qué no V3; las unidades reales con los tres casos que rompen el modelo ingenuo; **los dos almacenes y el evento ABRIR**; **qué se descuenta y por qué el producto de cabina NO baja al cobrar**; la fórmula capturada con su triple efecto de una sola captura; entradas y salidas; **el conteo del tubo abierto en tres niveles**; las cuatro mermas del giro; las alertas que importan y las seis que son ruido; y los tres errores que más comete este negocio |
| `04-INTERFAZ.md` | Vocabulario con género, plural y **el problema de "el clienta"**; la navegación con su razón sección por sección; **doce pantallas documentadas una por una** con layout en tablet, teléfono y PC —en ese orden—, estados, atajos y qué no va en cada una; **el bloque de cita con sus tres zonas visuales, que es la decisión de diseño más importante del modelo**; **el dashboard de ocho indicadores con la decisión que dispara cada uno, la ocupación de mañana como estrella, y la defensa de por qué no es la pantalla de inicio**; lo que cambia entre las 9:45 y las 21:00; multi-sucursal; y **las diez condiciones reales de operación, empezando por las manos manchadas de tinte** |
| `05-DATOS-Y-BACKEND.md` | Las tres cosas que hacen distinto a este backend; **catorce grupos de tablas nuevas** con campos, tipos y restricciones; las veintiocho extensiones a entidades existentes; **doce reglas de integridad que garantiza la base, incluida la restricción de exclusión GiST sobre el rango activo —la línea de SQL más importante de la carpeta—**; treinta comandos con entrada, roles e idempotencia; **veintitrés entradas del puente con `rolesLectura`, incluida la deuda de tres modelos**; treinta rutas de API; **las migraciones 096 a 112 escritas y no aplicadas**, con las tres delicadas señaladas; la decisión de WhatsApp con su recomendación; y lo que se reutiliza tal cual |
| `FILE-MAP.md` | Este archivo. Índice, destino del código, qué heredan los once vecinos, y las cuatro preguntas de cierre |

---

## 2 · DÓNDE VIVIRÁ EL CÓDIGO

Rutas exactas dentro del monorepo. **Acoplar es mover carpetas y aplicar migraciones, nunca
reescribir.**

### 2.1 · Lógica de aplicación

```
packages/app/src/agenda/                    ← CARPETA NUEVA. Es el arquetipo A3
├── disponibilidad.ts              F-404 · huecos, próximos N, cabe-aquí
├── disponibilidad.test.ts         ← PRUEBA CRÍTICA: un hueco dentro de un procesado
├── tramos.ts                      F-401/F-415 · secuencia activo-pasivo-cierre
├── tramos.test.ts                 ← PRUEBA CRÍTICA: factor de duración por profesional
├── cita.ts                        F-400 · agendar, reprogramar, cancelar
├── cita.test.ts                   ← PRUEBA CRÍTICA: dos agendando el mismo hueco
├── walk-in.ts                     F-413 · dos toques, sin cliente obligatorio
├── bloqueos.ts                    F-416 · y su efecto en el denominador
├── no-show.ts                     F-412 · marcar, liberar, valuar, historial
├── hueco.ts                       F-417 · valuación y acumulado
├── lista-espera.ts                F-409 · apuntar y ofrecer al liberarse
├── recursos.ts                    F-403 · lavabo, secadora, estación
└── recordatorio.ts                F-406 · armar mensaje y lista

packages/app/src/profesional/               ← CARPETA NUEVA
├── ficha.ts                       F-420, F-421, F-422
├── regla-comision.ts              F-440 · las cinco preguntas, versionada
├── regla-comision.test.ts         ← PRUEBA CRÍTICA: cambiar la tasa NO recalcula
├── comision.ts                    F-423, F-424 · causar sobre la regla vigente
├── comision.test.ts               ← PRUEBA CRÍTICA: descuento, cancelación, rehacer
├── ledger.ts                      F-443 · asiento, contrapartida, saldo
├── ledger.test.ts                 ← PRUEBA CRÍTICA: no existe UPDATE
├── reparto.ts                     F-428 · suma 100%
├── renta.ts                       F-441 · y su exclusión de la venta
├── renta.test.ts                  ← PRUEBA CRÍTICA: lo de Sol NO entra a ventas
├── liquidacion.ts                 F-427 + F-259 · caja y marcado, una transacción
├── liquidacion.test.ts            ← PRUEBA CRÍTICA: comisión y propina NUNCA sumadas
├── ocupacion.ts                   F-426
└── cartera.ts                     F-425, F-429

packages/app/src/expediente/                ← CARPETA NUEVA. La hereda A3 y A4
├── belleza.ts                     F-434 · alergias, bandera, frecuencia
├── formula.ts                     F-154 · capturar, repetir, costear
├── formula.test.ts                ← PRUEBA CRÍTICA: el sobrante cuadra siempre
├── fotos.ts                       F-436 · con los DOS permisos separados
├── consentimiento.ts              F-438
└── frecuencia.ts                  F-951 · el ciclo propio de cada clienta

packages/app/src/inventario/                ← YA EXISTE. Se amplía
├── cabina.ts                      F-155 · abrir, consumir, alcanza-contra-agenda
├── cabina.test.ts                 ← PRUEBA CRÍTICA: el galón abierto no se vende
├── conteo.ts                      ← DE ABARROTES. Se añade el modo estimado
├── caducidad.ts                   ← DE ABARROTES. Intacto
├── merma.ts                       ← se extiende con `merma_mezcla`
└── inventario.ts · consultas.ts   ← YA EXISTEN. Intactos

packages/app/src/anticipos/                 ← CARPETA NUEVA. La heredan A3, A5 y A7
├── anticipo-cita.ts               F-414 · cobrar, aplicar, retener, mover
├── anticipo-cita.test.ts          ← PRUEBA CRÍTICA: no se aplica dos veces
└── paquete.ts                     F-439 · vender, consumir, vencer, avisar

packages/app/src/propinas/                  ← YA EXISTE. Se amplía
├── directa.ts                     F-243 · V4, con destinatario y reparto
├── pasivo.ts                      F-260 · saldo, entrega, alerta de antigüedad
├── pasivo.test.ts                 ← PRUEBA CRÍTICA: la de mano NO toca caja
└── desglose.ts                    ← YA EXISTE. Intacto

packages/app/src/venta/                     ← YA EXISTE. Se amplía
├── cobrar-cita.ts                 La transacción grande de §5.1
├── cobrar-cita.test.ts            ← PRUEBA CRÍTICA: si falla, no queda nada
├── transferencia-destino.ts       §3.38 · salón o profesional
└── pagos.ts · cotizar.ts          ← YA EXISTEN. Se extienden
```

### 2.2 · Puente

```
packages/app/src/puente/mapa.ts    ← se AMPLÍA con veintitrés entidades:
    Cliente(!) · Profesional · Cita · CitaServicio · HuecoDisponible ·
    BloqueoAgenda · Servicio · ServicioProfesional · Recurso ·
    ReglaComision · ComisionCausada · Liquidacion · SaldoPropina ·
    RentaEstacion · ExpedienteBelleza · FormulaAplicada · AnticipoCita ·
    PaqueteVendido · NoShow · ListaEspera · OcupacionProfesional ·
    ProductoCabina · MargenServicio

  … y con los campos nuevos de Cliente, ProductoTerminado, Venta,
    DetalleVenta, MovimientoCaja y CorteCaja (ver 05 §3)

  ⚠ `Cliente` NO está declarada hoy en mapa.ts aunque la tabla existe
    desde 002_catalogo.sql. `abarrotes` y `ferreteria` ya lo señalaron.
    AQUÍ ES BLOQUEANTE: sin clienta no hay cita, ni expediente, ni
    recordatorio, ni cartera. Es la deuda más cara del proyecto.
```

### 2.3 · Rutas

Las treinta de `05-DATOS-Y-BACKEND.md` §7.

### 2.4 · Migraciones

```
packages/data/src/migraciones/sql/
├── 130_profesionales.sql              ⚠ requiere btree_gist. VERIFICAR PRIMERO
├── 131_servicios.sql
├── 132_citas.sql                      ★ las restricciones de exclusión
├── 133_reglas_comision.sql
├── 134_comisiones_ledger.sql          ★ trigger anti-UPDATE
├── 135_liquidaciones.sql
├── 136_rentas_estacion.sql
├── 137_expediente_belleza.sql
├── 138_anticipos_y_paquetes.sql
├── 139_propinas_v4.sql
├── 140_no_show_y_espera.sql
├── 141_inventario_cabina.sql
├── 142_clientes_salon.sql             ⚠ TOCA TABLA VIVA
├── 143_ordenes_salon.sql              ⚠ TOCA TABLAS VIVAS
├── 144_caja_salon.sql
├── 145_vistas_salon.sql
└── 066_plantillas_semilla.sql            ⚠ NO se aplica sin decisión de Miguel
```

### 2.5 · Interfaz

Nada se toca en `apps/web/heredado/` mientras Codex siga en la Fase 1. Lo que después habrá que
hacer:

| Archivo | Qué cambia |
|---|---|
| `apps/web/heredado/pages/Agenda.jsx` | **PÁGINA NUEVA.** La rejilla de día, el bloque de tres zonas, el panel lateral en PC, la lista en teléfono |
| `apps/web/heredado/pages/MiDia.jsx` | **PÁGINA NUEVA.** La del profesional, primero en teléfono |
| `apps/web/heredado/pages/Profesionales.jsx` | **PÁGINA NUEVA.** Ficha, horario, **las cinco preguntas de la comisión** |
| `apps/web/heredado/pages/Liquidacion.jsx` | **PÁGINA NUEVA.** Primero en PC |
| `apps/web/heredado/pages/POS.jsx` | **Se reestructura en la pantalla de Cobrar:** profesional por línea, propina con destinatario, anticipo aplicado de entrada, destino de transferencia, aviso de efecto en comisión al descontar |
| `apps/web/heredado/pages/Clientes.jsx` | Deja de ser una lista alfabética y pasa a ser **"quién no ha vuelto"** + búsqueda |
| `apps/web/heredado/pages/Productos.jsx` | Pestañas cabina/anaquel, botón ABRIR, campos de servicio con la duración en tramos. **Se ocultan** receta que explota, presentaciones, código de barras como eje |
| `apps/web/heredado/pages/Caja.jsx` | Muro de citas sin resolver, aviso de fórmulas sin capturar, la cascada, los dos arqueos informativos |
| `apps/web/heredado/components/tickets/CorteTicket.jsx` | **Documento nuevo**, las diecisiete secciones de `02-DINERO-Y-CAJA.md` §9.3. No se modifican los de restaurante ni abarrotes: se elige por plantilla |
| `apps/web/heredado/lib/packageConfig.js` | La plantilla `salon` y sus perillas |

Componentes nuevos:

```
RejillaAgenda · BloqueCita · ZonaPasiva · HuecoConValor · LineaAhora ·
DialogoAgendar · ProximosHuecos · CitaEnCurso · CapturaFormula ·
BotonRepetir · FotoAntesDespues · BanderaAlergia · PropinaDestinatario ·
AvisoComisionDescuento · DestinoTransferencia · LiquidacionPanel ·
ComprobanteProfesional · ReglaComisionForm · MiDiaCard ·
OcupacionMananaCard · ClientasPorVolverLista · AbrirProductoDialog ·
AlcanzaContraAgenda · ConteoEstimadoInput · CascadaEsperadoSalon
```

---

## 3 · QUÉ ESTÁ YA CONSTRUIDO, Y DÓNDE

**Poco, y hay que decirlo con claridad: éste es el arquetipo que más código nuevo cuesta de los tres
construidos hasta hoy.**

| Bloque | Funciones | Origen |
|---|---|---|
| Identidad y acceso | F-001…F-006 | `restaurante` · `packages/app/src/identidad/` |
| Cobro y métodos de pago | F-210, F-211, F-213, F-220, F-223, F-225 | `restaurante` · `venta/pagos.ts` |
| Caja, arqueo, corte de turno | F-230, F-232, F-233, F-236 | `restaurante` · `packages/app/src/caja/` |
| Tronco de inventario | F-100, F-101, F-103, F-104, F-108 | `restaurante` · `packages/app/src/inventario/` |
| Impuestos IVA tasa única | F-011 | `restaurante` · **tal cual, sin una línea nueva** |
| Catálogo, categorías, búsqueda, importación | F-020…F-022, F-032, F-201 | `restaurante` · `packages/app/src/catalogo/` |
| Compras y proveedores | F-630…F-633 | `restaurante` · **intacto, es el caso más fácil del proyecto** |
| Gastos | F-250, F-251 | `restaurante` |
| Desglose exacto de propina por método | F-245 | `restaurante` · `packages/app/src/propinas/` |
| Conteo físico con alcance parcial | F-106 | **`abarrotes`** · `inventario/conteo.ts` |
| Caducidad sin lote | F-146 | **`abarrotes`** · `inventario/caducidad.ts` |
| Stock simple V2 | F-111 | **`abarrotes`** · `packages/app/src/retail/` |
| Autorización de descuento | F-205 | **`abarrotes`** · `venta/autorizacion-descuento.ts` |
| Generación de PDF | F-057 | `restaurante` · `heredado/lib/pdfDownload.js` |

**Lo que NO existe y hay que escribir entero:** la agenda, el profesional, la comisión, el
expediente, los anticipos, la propina directa y la cabina. **El bloque F-4xx completo, treinta y
cinco funciones, más quince nuevas.**

---

## 3.bis · LO QUE LA ETAPA 7 CONSTRUYÓ, CON SUS RUTAS REALES

Escrito con el código delante, el 2026-09-15. Es la lista que hay que leer al acoplar.

| Función | Dónde quedó | Prueba |
|---|---|---|
| **F-401 · F-415** duración como secuencia | `packages/domain/src/agenda/duracion.ts` | `duracion.test.ts` · 17 casos |
| **F-404 · F-409** huecos y lista de espera | `packages/domain/src/agenda/huecos.ts` | `huecos.test.ts` · 15 casos |
| **F-440 · F-423 · F-428** la comisión y sus cinco preguntas | `packages/domain/src/agenda/comision.ts` | `comision.test.ts` · 24 casos |
| **F-400 · F-402** agendar | `packages/app/src/salon/agenda.ts` | `agenda.test.ts` · 16 casos |
| **F-412 · F-407 · F-434** no-show, cancelar, cerrar servicio | `packages/app/src/salon/ciclo.ts` | `ciclo.test.ts` |
| **F-443** el ledger de comisión causada | `packages/app/src/salon/cobro.ts` + migración `133` | `ciclo.test.ts` · 21 casos |
| **F-427 · F-259** liquidación y su salida de caja | `packages/app/src/salon/liquidacion.ts` | `liquidacion.test.ts` · 12 casos |
| **F-155** producto de cabina | almacén propio en `cerrarServicio`, con `consumo_servicio` | dentro de `ciclo.test.ts` |
| **F-441** renta de estación | `profesionales.tipo_relacion = 'independiente_renta'` y su exclusión de comisión | dentro de `ciclo.test.ts` |

**Migraciones escritas, NO aplicadas:** `130_profesionales.sql`, `131_servicios.sql`,
`132_citas.sql`, `133_comisiones.sql`, `135_liquidaciones.sql`. Quedan libres la `134` y las
`136`–`145`.

**Rutas de API nuevas:**

```
apps/web/app/api/agenda/{cita,no-llego,cancelar,iniciar,cerrar-servicio}/route.ts
apps/web/app/api/venta/cobrar-cita/route.ts
apps/web/app/api/comision/liquidar/route.ts
```

**Entidades nuevas en el puente:** `Profesional`, `Cita`, `CitaServicio`, `ReglaComision`,
`ComisionCausada`, `Liquidacion`. `Cliente` la declaró E5, que era la deuda transversal que este
modelo señalaba como bloqueante.

### El riesgo técnico, dicho en su sitio

La `130` necesita `create extension if not exists btree_gist`: sin ella no se pueden combinar
`uuid with =` y `tstzrange with &&` en la restricción de exclusión que impide agendar dos clientas
con la misma persona a la misma hora. **Hay que verificar que el proyecto de Supabase la permita
antes de dar por buena esta arquitectura.** Si no, el plan B es un índice único sobre slots
discretos de cinco minutos: mucho peor, y con huecos que no se pueden usar, pero funciona.

### El cambio de UNA LÍNEA que hará falta en `heredado/` al acoplar

Ninguno. Este modelo **no existía**: no hay pantalla vieja que enganchar, y todo lo nuevo vive en
`packages/` y en `apps/web/app/`.

---

## 3.ter · LO QUE LAS ETAPAS 10-13 AÑADIERON

Escrito con el código delante. `verify:cobertura` sale en 0 para este modelo:
25/25 funciones, 29/29 rutas, 12/12 pantallas, 17/17 migraciones.

| Pieza | Dónde quedó | Prueba |
|---|---|---|
| **F-404 · F-415 · F-417 · F-951** lo que la agenda contesta | `packages/app/src/salon/consultas.ts` · rutas de agenda, huecos, clientes por volver y los dos reportes | `consultas.test.ts` |
| **F-153 · F-154 · F-436** el expediente de belleza | `packages/app/src/salon/expediente.ts` · rutas de expediente, última fórmula y foto de servicio | `expediente.test.ts` |
| reprogramar y walk-in | `packages/app/src/salon/reprogramar.ts` · rutas `citas/[id]/reprogramar` y `citas/walk-in` | `reprogramar.test.ts` |
| quién atiende, mi día y el comprobante | `packages/app/src/salon/profesionales.ts` · rutas de profesionales, mi día, comisiones y comprobante | `profesionales.test.ts` |
| **F-259** el documento del corte | `packages/app/src/caja/documento.ts` · ruta del documento de corte | `documento.test.ts` |
| **PANTALLAS** caja-y-corte, catalogo-de-servicios, clientas, ficha-del-profesional, liquidacion, productos | `apps/web/src/estetica-salon/{CajaYCorte,CatalogoDeServicios,Clientas,FichaDelProfesional,Liquidacion,Productos}.tsx` | la lógica pura está exportada archivo por archivo |

**Siete tablas nuevas tipadas** en `packages/data/src/esquema.ts`:
`expedientes_belleza`, `formulas_aplicadas`, `consentimientos`,
`fotos_expediente`, `no_shows`, `paquetes_vendidos` y `sesiones_paquete`. Las
migraciones que las crean ya estaban escritas; lo que faltaba era que el código
pudiera verlas.

Cinco decisiones que el código fija:

- **La fórmula se CONGELA.** `formulas_aplicadas` guarda el jsonb tal como se
  aplicó, no una referencia al producto: si mañana cambia la marca del tinte, lo
  que se le hizo a esa clienta en marzo no puede cambiar con ella.
- **La foto es UNA por momento.** Antes y después, y el reemplazo se anuncia. Un
  álbum sin control acaba siendo el sitio donde nadie encuentra la del «antes»
  el día que hay una queja.
- **Reprogramar DESPLAZA, no replanifica.** Conserva el folio y le añade el
  motivo a las notas. Cancelar y volver a agendar pierde el hilo de que es la
  misma cita movida dos veces, que es justo lo que la dueña necesita ver.
- **La ocupación se mide contra el horario DE ESA PERSONA**, no contra el del
  salón; y el hueco se valora al ticket promedio DE ESA PERSONA. Medir a todas
  contra la misma vara hace que la de medio tiempo parezca la peor del salón.
- **El comprobante lee las MISMAS filas que la liquidación marcó.** No recalcula:
  un comprobante que recalcula puede dar un número distinto al que ya se pagó, y
  entonces la discusión es sobre el sistema en vez de sobre el trabajo.

### El cambio de UNA LÍNEA que hará falta en `heredado/` al acoplar

Ninguno. Este modelo no comparte una sola pantalla con el frontend heredado.
Lo que hará falta al acoplar es la entrada de menú, que es configuración y no
código.

---

## 3.quinquies · LO QUE EL ACOPLE (FASE 3) CAMBIÓ

Ninguna ruta de este modelo faltaba: las 29 estaban. Lo que le llega del acople es el vocabulario,
y es el modelo donde más se nota — «mesa» pasa a «estación», «mesero» a «estilista» y «comensal» a
«clienta», con su género, que es la mitad de lo que hace que la plantilla se sienta propia.

**Y el riesgo que la Fase 2 dejó marcado como bloqueante ya no lo es:** `btree_gist` ESTÁ disponible
en `wyqmzhliurwyxuyxznpb` (versión 1.7), así que la restricción de exclusión GiST sobre `tstzrange`
en la que descansa toda la agenda funciona. No era un riesgo: era una pregunta sin hacer.

### Lo que el acople le añadió a este modelo

| Pieza | Dónde quedó |
|---|---|
| **F-017 · el vocabulario, enganchado** | `apps/web/app/api/configuracion/vocabulario/route.ts` (el `GET` que faltaba) · `apps/web/src/servidor/vocabulario.ts` · `apps/web/src/cliente/vocabulario.tsx` · inyectado en `apps/web/app/(modelos)/layout.tsx` **y** en `apps/web/app/(interno)/layout.tsx` |
| **El menú, traducido** | `apps/web/heredado/lib/permissions.js` (`entidad` por entrada + `etiquetaDeNavegacion`) · `apps/web/heredado/components/common/Sidebar.jsx` |
| **La plantilla, en el código** | `packages/contracts/src/comandos/ambito.ts` (`PAQUETES` = `tienda·cafeteria·restaurante`) · `packages/contracts/src/comandos/plantillas.ts` (`plantillaDeOrganizacion`) · los cinco sitios que leen `organizaciones.paquete` normalizan con ella |

**Lo que NO está hecho, y bloquea lo demás:** las migraciones de este modelo están escritas,
ensayadas contra una copia de producción CON DATOS, y **sin aplicar**. Falta una credencial con
DDL. El procedimiento exacto está en `docs/fase-2/A3-COMO-APLICAR.md`.

---

## 4 · QUÉ HEREDAN DE AQUÍ LOS ONCE VECINOS

Lo que **no** deben volver a construir. Si un modelo de servicios con cita reinventa algo de esta
lista, está mal hecho.

| Función | Qué es | Modelos que la reutilizan |
|---|---|---|
| **F-400…F-404, F-407** | El motor de agenda completo | Los 11, más gimnasio y escuela con grupos |
| **F-415** tiempo pasivo | La secuencia activo-pasivo-cierre y el hueco intercalable | **nail salon, spa, fisioterapia, dental.** No barbería, no médico, no fotografía — y para ellos `duracion_pasiva_min = 0`, misma tabla, sin ramas |
| **F-403** recurso | Con el eje configurable | **spa lo usa AL REVÉS**: la cabina manda y el terapeuta es intercambiable. Mismo motor, eje invertido |
| **F-412 + F-406 + F-414 + F-409** | El paquete anti-no-show completo | Los 11. En `estudio-tatuajes` el anticipo pasa de opcional a **obligatorio** |
| **F-416** bloqueo no productivo | El denominador de la ocupación | Los 11, y A7 entero |
| **F-417** costo del hueco | La merma del tiempo | Los 11, y A7 entero |
| **F-413** walk-in en dos toques | | **barbería lo convierte en el camino principal**, no la excepción |
| **F-420…F-429, F-440…F-444** | El bloque de profesional y comisión completo | Los 11, **y también `distribuidora-mayorista` e `inmobiliaria`**, que son A5 y A10 pero pagan comisión igual |
| **F-440** la regla con sus cinco preguntas | La forma de producto de apagar el pleito | Todo el que pague comisión, en los 78 |
| **F-443** ledger inmutable de comisión | El patrón de `movimientos_stock` aplicado al dinero de las personas | Todo el que pague comisión |
| **F-441** renta de estación | | **barbería, nail salon, spa, tatuajes** — donde el independiente es la norma |
| **F-427 + F-259** liquidación y su salida de caja | Un documento, cinco conceptos, dos sumas | Los 11 |
| **F-243 + F-260** propina directa y su pasivo | | estética, barbería, nail, spa, tatuajes. **F-260 es el mismo objeto que F-256 (casco) de abarrotes** |
| **F-430 + F-436 + F-437 + F-438** | El tronco del expediente con fotos, adjuntos y consentimiento | Los 11 y **todo A4**. V4 es de aquí; dental y médico usan V1, veterinaria V2, vehicular V3 |
| **F-154** fórmula capturada | El consumo que no se puede predecir del catálogo | **nail salon (esmalte), tatuajes (tinta), veterinaria (dosis por peso), dental (material).** No restaurante ni panadería |
| **F-155** doble destino del SKU | Cabina contra anaquel | **spa, veterinaria, taller mecánico (aceite), autolavado** |
| **F-439** paquete de sesiones | Con reconocimiento por sesión y dos comisiones | **fisioterapia lo usa como modelo entero**, spa, tatuajes, estudio de fotografía |
| **F-951** recuperación por frecuencia propia | El ciclo de cada cliente, no un umbral global | Los 11, y **todos los de suscripción (A6)** |
| **F-110 redefinida** | El tiempo como inventario | Los 11 y A7 entero |

---

## 5 · LAS CUATRO PREGUNTAS DE CIERRE

Contestadas con honestidad, incluido lo que quedó flojo.

### P1 · ¿Es fiel al negocio?

**Sí, con tres reservas que hay que decir.**

Lo que sostiene el sí: el día está escrito con el procesado de las 10:35 y la walk-in metida adentro,
que es el hecho operativo central del giro y que ningún competidor modela. **Las cinco relaciones
económicas del salón de Paty son cuatro esquemas distintos** —comisión pura, sueldo más comisión,
renta de estación y sueldo simple— y están las cuatro, porque así opera el giro en México y así lo
reportan las fuentes del sector. Las cinco preguntas donde nace el pleito de la comisión están
escritas una por una y contestadas en una pantalla, que es la forma de producto del dolor 2. La
distinción entre comisión y propina —dos dineros de naturaleza contraria que salen del mismo cajón
la misma noche— está en el centro del documento de dinero y no como nota al pie. Y el expediente
está tratado como lo que es: el activo que hace que la clienta vuelva, con la frase del giro —*"si
se pierde la fórmula se pierde la clienta"*— como criterio de diseño y no como adorno.

**Reserva 1 · la estacionalidad no está modelada, otra vez.** `abarrotes` y `ferreteria` ya la
dejaron abierta y **aquí vuelve con otra forma y es igual de real**: diciembre y mayo valen por dos
meses, el 10 de mayo, los quince años, las graduaciones de junio y las bodas de noviembre son picos
que un salón planea con semanas. Nada de esta carpeta lo contempla: la ocupación se compara contra el
mismo día de la semana y punto. **Que tres modelos de tres familias distintas señalen el mismo hueco
significa que es deuda del proyecto, no de un modelo**, y está anotado en §6.

**Reserva 2 · la relación con el distribuidor de producto está descrita desde afuera.** Las marcas
profesionales —L'Oréal, Wella, Schwarzkopf y las nacionales— dan capacitación, apoyos por volumen,
exclusividad de tono y a veces mobiliario a cambio de compra comprometida. Es una parte real de la
economía de un salón y **en esta carpeta aparece sólo como "se le compra a tres distribuidores"**.
Alguien con veinte años en el giro leería la sección de compras y diría que le falta la mitad. Es
honesto decir que no se investigó lo suficiente como para modelarlo.

**Reserva 3 · la informalidad se describe pero no se resuelve.** `02-DINERO-Y-CAJA.md` §2.3 dice que
una parte grande de los 310,000 establecimientos no factura y no tiene a su gente en el IMSS, y saca
dos consecuencias de producto correctas —no exigir RFC, no esconder el dato—. **Pero no dice qué pasa
cuando la dueña quiere registrar la venta completa y pagar comisión sobre una parte.** Ocurre, es lo
normal, y el sistema o lo soporta explícitamente o la gente va a llevar dos registros y el de
adentro va a ser el falso. **No se resolvió y no se debe fingir que sí.**

### P2 · ¿Da control total?

**No todavía, y los huecos están con nombre y apellido.**

Lo que **sí** puede contestar la dueña con esta documentación implementada: cuánto vendí hoy contra
el mismo día de la semana pasada, **cuánto me quedó de verdad después de comisión y material** —que
es el número que hoy no existe en ningún sistema del segmento—, quién está produciendo y quién no
(ocupación, no ranking de venta), **cuánto tiempo perdí hoy y cuánto valía**, quién me está fallando
y cuánto me cuesta, **quién se está yendo antes de que se haya ido**, qué producto no me alcanza para
lo que ya agendé, cuánto le debo a cada quien separando comisión de propina, y si la caja cuadró y
**de dónde salió el esperado**.

Lo que **no** puede contestar, sin maquillaje:

1. **"¿Cuánto me cuesta de verdad cada estilista?"** — Está la comisión causada y el material. **No
   está el costo total de la plaza**: el IMSS, la parte proporcional de renta y luz por estación, el
   tiempo que la dueña invierte en resolverle problemas. Un salón que compara "Karla al 50%" contra
   "Dany con sueldo + 25%" necesita ese número y no lo tiene. Es la pregunta que decide a quién
   contratar y **está a medias**.
2. **"¿Me conviene subir el precio o subir la ocupación?"** — Es la decisión estratégica del giro y
   requiere elasticidad, que no se puede calcular con los datos de un salón. Se documentó el precio
   por horario (F-026) como la palanca contra el hueco y **se dejó en la tanda 6, que es
   probablemente demasiado tarde**: es la única función que ataca el dolor 1 por el lado de la
   demanda en vez del lado del recordatorio.
3. **"¿Cuánto vale mi cartera?"** — Está F-425 (quién es de quién) y F-951 (quién se está yendo).
   **No está el valor de vida del cliente ni el riesgo concentrado**: si Karla tiene 60 de las 180
   clientas del salón y se va, ¿qué porcentaje de la facturación se va con ella? Ese número existe en
   los datos y no se documentó ningún reporte que lo dé. **Es, probablemente, el número más
   importante que esta carpeta no produce.**
4. **"¿El servicio que doy es bueno?"** — Está el contador de rehacer (F-444), que es el único dato
   de calidad medible, y F-952 (encuesta). **No hay nada más.** En un negocio donde volver depende
   enteramente de que quede bien, eso es poco.
5. **"¿Cuánto debo yo?"** — F-635 (cuentas por pagar) sigue sin existir. Aquí pesa menos que en
   retail —tres distribuidores, compra mensual— pero es el tercer modelo que lo señala.

### P3 · ¿Parece hecho a la medida?

**Sí, y se nota en cosas que sólo aparecen cuando alguien estuvo en un salón.**

El bloque de cita con su zona rayada que dice *"cabe una cita"*, porque es la interfaz enseñando una
oportunidad que ningún competidor sabe que existe. El botón REPETIR de 64 píxeles, solo en su zona,
porque se toca con guantes manchados de tinte y porque si cuesta más de un toque la fórmula no se
captura nunca. El campo *"mezclé 90, usé 75"* dentro del mismo formulario, porque el 10%–20% que se
va al bote es estructural y si se pregunta después aparece como faltante y acusa a alguien. La
pregunta *"¿a qué cuenta?"* con dos opciones y sin juicio, que convierte el agujero número uno del
giro en un flujo declarado. La advertencia *"tu comisión baja $113"* antes de aplicar un descuento.
El *"toca volver el 18 de abril"* con el botón de agendar al lado, en la silla y no en la salida. La
alergia en rojo arriba del todo y como triángulo en el bloque de la agenda, porque si hay que hacer
scroll alguien acaba en urgencias. Las cinco preguntas de la comisión numeradas en una sola pantalla
con la frase *"lo ya causado no se recalcula"* debajo. Los dos permisos separados de la foto. Y la
regla de que **comisión y propina nunca van en el mismo renglón**, que está en el PDF, en la pantalla
de "Mi día", en la liquidación **y en el esquema de la base**, como dos columnas que el modelo no
deja sumar.

**Lo que todavía delataría al sistema como genérico:**

**El vocabulario.** Es el **tercer modelo** que pide F-017 y aquí ya no es un aviso: "mesa" donde
debe decir "estación", "mesero" donde debe decir "estilista", "comensal" donde debe decir "clienta"
—y con género—. `restaurante` podía vivir con las palabras escritas a mano porque era el único. Con
tres arquetipos y **once herederos esperando detrás de éste**, escribirlo a mano es garantizar que se
rompa. **Este modelo es el que debería forzar F-017 de una vez.**

**Y un riesgo mayor que en `abarrotes`: la pantalla de agenda de este modelo es la misma pantalla
para los once.** `clinica-dental` agenda contra un plan de tratamiento por fases, no contra un
servicio suelto. `spa-masajes` agenda contra una cabina, no contra una persona. `gimnasio` agenda
grupos con cupo, no citas. **Si la rejilla queda pensada sólo para un salón de tres sillas, esos tres
van a tener que pelearse con ella.** Está anotado en §4 —el eje configurable, `duracion_pasiva_min=0`,
el recurso invertido— pero **anotarlo no es resolverlo**, y sólo se va a saber cuando se escriba el
segundo A3.

### P4 · ¿Se distingue de sus vecinos?

**Sí contra los otros arquetipos, de forma absoluta. Y contra un vecino inmediato hay riesgo real de
fusión, que hay que decir ahora.**

**Contra `restaurante` y `abarrotes`**, un extraño lo vería en dos segundos:

| | `estetica-salon` | `restaurante` | `abarrotes` |
|---|---|---|---|
| Pantalla de inicio | **La agenda del día** | Mapa del salón | Cobro con el cursor en el lector |
| Acción principal | **Iniciar cita** | Abrir mesa | Escanear |
| Unidad de trabajo | **La cita**, que nace días antes | La mesa, 90 minutos | El ticket, 30 segundos |
| El inventario es | **El tiempo** + producto en dos destinos | Insumo con receta fija | Producto que se revende |
| Consumo | **Fórmula capturada al aplicar** | Receta que explota al cobrar | El producto ES lo que sale |
| Propinas | **Directa al profesional, con pasivo** | Al tronco, por puntos | **No existen, ni en cero** |
| Comisión | **40%–60%, es medio negocio** | No existe | No existe |
| El corte contesta | **¿Cuánto le toca a cada estilista?** | ¿Cuánto le toca a cada mesero de propina? | ¿Qué producto falta? |
| Dispositivo | **Tablet + teléfono de la estilista** | Tablet | PC con lector |
| IVA | **16% tasa única** (más simple) | 16% tasa única | Mixto 0%/16% + IEPS |
| Ritmo | Sostenido, 15–30 ops | Sostenido | **Ráfaga, 220 ops** |

**Contra `barberia`, que es el vecino inmediato, el riesgo de fusión es REAL y hay que exigirlo
cuando se escriba.** Los dos son A3, los dos tienen comisión, propina directa, expediente y venta de
producto. **Lo que de verdad los separa, y si `barberia` se escribe sin esto, o se fusiona o los dos
están mal documentados:**

1. **El walk-in es la mayoría, no la excepción.** Una barbería de barrio opera con 60%–80% sin cita.
   Eso cambia la pantalla de inicio por completo: **la rejilla de agenda deja de ser el centro y
   aparece una cola de espera**, que es una estructura distinta.
2. **No hay tiempo pasivo.** Un corte y una barba son 20–35 minutos de trabajo continuo. **F-415
   queda en cero**, y con eso se va la función más valiosa del arquetipo. Una agenda de barbería es
   una agenda de bloques sólidos.
3. **Casi no hay producto de cabina.** No hay fórmula, no hay F-154, no hay cabina contra anaquel.
   Todo el `03-INVENTARIO.md` de este modelo se reduce a V2 simple.
4. **El expediente es casi nada.** "Número 2 a los lados, tijera arriba" cabe en una nota. No hay
   alergia, no hay prueba de mecha, no hay fotos de antes y después como activo.
5. **El ticket es de $150–$350 y el ritmo es de ráfaga**, no sostenido. Eso cambia la densidad, el
   cobro y el dashboard entero: una barbería hace 40 servicios al día y un salón hace 15.

**Contra `nail-salon` la distinción es más débil de lo que parece y también hay que vigilarla.** Sí
hay tiempo pasivo (secado, cabina UV), sí hay comisión y renta de mesa, sí hay expediente con foto.
**Lo que de verdad cambia:** el producto de cabina se cuenta por frasco y no se pesa (no hay F-154,
hay conteo simple), el expediente es de **diseño con foto** y no de fórmula, y el servicio se da en
una mesa, no en una estación con lavabo. **Es un candidato legítimo a ser un delta de esta carpeta en
vez de una carpeta propia**, y hay que evaluarlo en la segunda pasada antes de escribir dos
documentos que digan lo mismo.

**Contra `spa-masajes` la distinción es limpia y vale la pena decir por qué:** allá **el recurso
escaso es la cabina y el terapeuta es intercambiable**. Es el eje E3.2 invertido, y eso cambia quién
manda en la agenda, cómo se busca disponibilidad y de quién es la cartera. **Son el mismo motor con
el eje al revés**, y ése es exactamente el tipo de reutilización que el proyecto busca.

---

## 6 · PENDIENTES QUE ESTA CARPETA DEJA ABIERTOS

Para que nadie tenga que deducirlos leyendo los siete archivos.

1. **Añadir al catálogo las quince funciones nuevas** de `01-FUNCIONES.md` §6 — F-154, F-155, F-259,
   F-260, F-414, F-415, F-416, F-417, F-428, F-429, F-440, F-441, F-442, F-443, F-444 — **y las tres
   reclasificaciones**: F-110 deja de llamarse "sin inventario", F-401 deja de ser `[=]`, F-424 deja
   de ser `[=]`. **Antes de construir nada.** Con esto el catálogo pasa de 232 a **más de 280
   funciones** sumando lo que propusieron `cafeteria`, `abarrotes` y `ferreteria`, y ya hay
   solapamientos que hay que consolidar en una sola pasada, no modelo por modelo.
2. **Verificar que `btree_gist` esté disponible en el proyecto Supabase antes de escribir nada más.**
   Es el único riesgo técnico serio de la carpeta: toda la arquitectura de agenda descansa en la
   restricción de exclusión de `05-DATOS-Y-BACKEND.md` §4.1. Si no se puede, el plan B —slots
   discretos de 5 minutos— es mucho peor y hay que saberlo antes, no después.
3. **La decisión de WhatsApp la toma Miguel.** `05-DATOS-Y-BACKEND.md` §9.1. Enlace `wa.me`
   semiautomático contra API oficial de Meta. De la respuesta depende la función que más dinero
   mueve del modelo y un argumento de folleto frente a AgendaPro.
4. **F-017 (diccionario de vocabulario) debería construirse con este modelo, no después.** Tercer
   modelo que lo pide, tercer arquetipo, y once herederos esperando. Ya no es una advertencia.
5. **`Cliente` en el puente es bloqueante y ya es la tercera vez que se señala.** `abarrotes` lo
   avisó, `ferreteria` lo repitió, y aquí **no se puede empezar sin ello**: no hay cita sin clienta.
   Debería resolverse de una vez, fuera de cualquier modelo.
6. **Las migraciones 108 y 109 tocan tablas vivas** (`clientes`, `ordenes`, `orden_lineas`) que usan
   cuatro negocios en producción. Todos los campos son nullable o con default, pero no se aplican sin
   decisión explícita.
7. **F-026 (precio por horario) debería subir de la tanda 6.** Es la única función que ataca el
   dolor 1 por el lado de la demanda —el martes a las 11:00 vale menos que el sábado a las 17:00— y
   quedó al final. Está señalado en P2 punto 2 y es una debilidad consciente del orden propuesto.
8. **El valor de la cartera concentrada no se documentó como reporte.** Ver P2 punto 3. Es
   probablemente el número más importante que esta carpeta no produce, y los datos para calcularlo
   sí están.
9. **La estacionalidad, por tercera vez.** `abarrotes` y `ferreteria` ya la dejaron abierta. **Tres
   familias distintas señalando el mismo hueco quiere decir que es deuda transversal del proyecto**,
   y hay que resolverla una vez: en retail es la sugerencia de pedido, aquí es la proyección de
   ocupación y de producto.
10. **La informalidad y la venta parcialmente registrada no se resolvió.** Ver P1, reserva 3. Hay que
    decidir si el sistema la soporta explícitamente o si se asume que la gente va a llevar dos
    registros.
11. **En la segunda pasada, leer `estetica-salon`, `barberia` y `nail-salon` uno junto al otro.** Es
    el riesgo de fusión más probable de la familia 03, y `nail-salon` es candidato serio a ser un
    delta de esta carpeta en vez de una carpeta propia.
12. **Datos que no se pudieron verificar en la investigación y que se evitaron a propósito:** el
    porcentaje de no-show específico de salones mexicanos —sólo se encontró el dato internacional de
    15%–20% de la Professional Beauty Association 2025 y se citó como tal—, y el reparto exacto entre
    los tres esquemas de comisión en México, que se describió cualitativamente porque ninguna fuente
    lo cuantifica. Si alguien los necesita para un argumento comercial, **hay que buscarlos antes de
    usarlos.**
