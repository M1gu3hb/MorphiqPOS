# FILE-MAP · Abarrotes / tienda de conveniencia

**Modelo:** `abarrotes` · **Familia:** 02 Retail y mostrador · **Arquetipo:** A1 puro
**Ruta:** `fase-2/modelos/02-retail/abarrotes/`
**Estado:** ✅ **terminado** (documentación) · el código está **sin empezar**
**Cliente vivo:** Abarrotes Don Chuy · giro `tienda` · paquete `operativo`
**Plantilla destino:** `tienda` (D-01)

> **Esta carpeta es la raíz del arquetipo A1.** Dieciocho modelos de retail heredan de aquí, igual
> que doce modelos de alimentos heredan de `restaurante`. Cuando alguien abra `ferreteria`,
> `farmacia` o `boutique`, lo primero que tiene que hacer es leer esta carpeta y citar sus IDs.

---

## 1 · ÍNDICE DE LA CARPETA

| Archivo | Qué hay dentro |
|---|---|
| `00-FICHA-Y-EJES.md` | Cómo gana dinero una tiendita y por qué el margen del 20% manda sobre todo, el perfil real de Don Chuy con lo que usa y lo que puede pagar, **el día completo hora por hora con los tres picos y los doce proveedores**, los seis ejes del mapa y los seis de diseño con su razón, el arquetipo y sus deltas, lo que hereda cada uno de los 18 vecinos, las once cosas que este negocio **no** necesita, y los tres dolores con sus cifras |
| `01-FUNCIONES.md` | El árbol completo con IDs canónicos, las `[=]` que se reutilizan de `restaurante` sin tocarlas, **dieciséis `[≠]` con su tabla comparativa de tres columnas**, las `[+]` que nacen aquí para los 18, los once huecos con su costo operativo, **diez funciones nuevas propuestas al catálogo y dos reclasificaciones**, el grafo de dependencias y el orden de construcción en seis tandas |
| `02-DINERO-Y-CAJA.md` | **La distinción entre dinero propio y dinero en tránsito, que es el eje del giro**, qué cuenta como venta uno por uno, IVA mixto 0%/16% con el algoritmo por grupo de tasa, IEPS con sus tres mecánicas y su decisión de alcance, descuentos y por qué el cajero no debe tener, por qué **no hay propinas**, los seis métodos de pago reales, el fiado completo, el negocio de las comisiones, la caja con sus **quince movimientos de los cuales once no son venta**, **el PDF del corte en quince secciones en orden**, y los cinco descuadres típicos |
| `03-INVENTARIO.md` | Por qué V3 contiene a V2 y por qué no las otras ocho, la regla de hierro del ledger en unidad base, las unidades y presentaciones reales con los tres casos que rompen el modelo ingenuo, **qué se descuenta y por qué al cobrar**, las doce puertas de entrada con el ritmo de cada proveedor, la entrada con canje en la misma nota, **la decisión del almacén único y por qué**, las once salidas, **cómo se arranca el inventario sin capturar nada primero**, el conteo cíclico, las cinco mermas con su responsable, las ocho alertas que importan y las seis que son ruido, y los tres errores que más comete este negocio |
| `04-INTERFAZ.md` | Vocabulario con género y plural, la navegación con su razón sección por sección, **once pantallas documentadas una por una** con layout en PC, tablet y teléfono, estados, atajos de teclado reales y qué no va en cada una, **el comportamiento exacto del escáner**, el dashboard de siete indicadores con la decisión que dispara cada uno y lo que cambia entre las 6:50 y las 22:45, multi-sucursal, y las diez condiciones reales de operación con su consecuencia concreta |
| `05-DATOS-Y-BACKEND.md` | Diez tablas nuevas con campos, tipos y restricciones, las veintiocho extensiones a entidades existentes, seis vistas, **doce reglas de integridad que garantiza la base**, veintiséis comandos con entrada y roles, diecisiete entradas del puente con `rolesLectura`, veinte rutas de API, **las migraciones 070 a 082 escritas y no aplicadas**, las cuatro decisiones de integración con su recomendación, y la lista de lo que se reutiliza tal cual con su ruta |
| `FILE-MAP.md` | Este archivo. Índice, destino del código, qué heredan los 18 vecinos, y las cuatro preguntas de cierre |

---

## 2 · DÓNDE VIVIRÁ EL CÓDIGO

Rutas exactas dentro del monorepo. **Acoplar es mover carpetas y aplicar migraciones, nunca
reescribir** (D-05).

### 2.1 · Lógica de aplicación

```
packages/app/src/retail/                    ← CARPETA NUEVA. Es el arquetipo A1
├── presentaciones.ts              F-112 · crearPresentacion, actualizarPresentacion
├── presentaciones.test.ts
├── conversion.ts                  F-120 · aBase, aPresentacion, expresarExistencia
├── conversion.test.ts             ← prueba crítica: cigarro suelto y huevo por kilo
├── alta-rapida.ts                 F-020 · altaRapidaDesdeCodigo
├── alta-rapida.test.ts
├── codigo-peso.ts                 F-148 · interpretarEan13Prefijo2
├── codigo-peso.test.ts
├── etiquetas.ts                   F-058 · hoja de etiquetas de anaquel
└── restriccion-legal.ts           F-980 · evaluarRestriccion (horario, edad)

packages/app/src/inventario/                ← YA EXISTE. Se amplía
├── conteo.ts                      F-149/F-106 · abrirConteo, capturar, cerrarConteo
├── conteo.test.ts                 ← prueba crítica: esperado sellado con ventas en curso
├── caducidad.ts                   F-146 · registrarCaducidad, porVencer
├── merma.ts                       F-109 · merma con los cinco motivos
├── consumo-interno.ts             F-261 (de restaurante) reutilizado aquí
├── inventario.ts                  ← YA EXISTE. Intacto
└── consultas.ts                   ← YA EXISTE. Se amplía con existencia_presentada

packages/app/src/fiado/                     ← CARPETA NUEVA
├── abono.ts                       F-254 · registrarAbono (caja + saldo, una transacción)
├── abono.test.ts
├── cartera.ts                     F-612, F-613 · estado de cuenta y antigüedad
├── limite.ts                      F-610, F-617 · ajustarLimite, evaluarLimite
└── incobrable.ts                  F-618

packages/app/src/comisiones/                ← CARPETA NUEVA
├── operacion.ts                   F-255 · registrarOperacion
├── operacion.test.ts
└── saldo.ts                       F-255 · depositarSaldo, alertaMinimo

packages/app/src/envases/                   ← CARPETA NUEVA
└── deposito.ts                    F-256 · cobrarDeposito, devolverDeposito

packages/app/src/fiscal/                    ← CARPETA NUEVA
├── iva-mixto.ts                   F-011 · extraerPorGrupoDeTasa
├── iva-mixto.test.ts              ← prueba crítica: 14 líneas de tres tasas, cero deriva
├── ieps.ts                        F-011 · las tres mecánicas, versionadas
└── ieps.test.ts

packages/app/src/compras/                   ← YA EXISTE. Se amplía
├── recepcion-con-canje.ts         F-632 · recibirNota con entradas y canjes
├── sugerencia.ts                  F-107 · sugerirPedido por proveedor
├── compras.ts · costeo.ts         ← YA EXISTEN. Intactos
└── —

packages/app/src/venta/                     ← YA EXISTE. Se amplía
├── redondeo.ts                    F-257
├── suspension.ts                  F-224
├── autorizacion-descuento.ts      F-205  ← compartida con restaurante
└── pagos.ts · cotizar.ts · escala.ts   ← YA EXISTEN. Se extienden
```

### 2.2 · Puente

```
packages/app/src/puente/mapa.ts    ← se AMPLÍA con diecisiete entidades:
    Presentacion · ZonaAnaquel · Conteo · ConteoLinea · Caducidad ·
    Cliente · AbonoFiado · OperacionComision · SaldoComisionista ·
    DepositoEnvase · Redondeo · RegimenIeps ·
    ExistenciaPresentada · SugerenciaPedido · CarteraFiado ·
    MargenPorCategoria · SaldoEnvases

  … y con los campos nuevos de ProductoTerminado, Venta, DetalleVenta,
    Proveedor y CorteCaja (ver 05-DATOS-Y-BACKEND.md §5)

  ⚠ `Cliente` NO está declarada hoy en mapa.ts aunque la tabla existe
    desde 002_catalogo.sql. Es la entrada más importante de las diecisiete.
```

### 2.3 · Rutas

Las veinte de `05-DATOS-Y-BACKEND.md` §6.

### 2.4 · Migraciones

```
packages/data/src/migraciones/sql/
├── 090_presentaciones.sql                 ⚠ backfill delicado, ver 05 §7
├── 091_zonas_y_conteo.sql
├── 092_caducidad_sin_lote.sql
├── 093_movimientos_stock_tipos_retail.sql
├── 094_clientes_fiado.sql
├── 095_comisiones.sql
├── 096_envases.sql
├── 097_redondeos.sql
├── 098_fiscal_producto.sql                ⚠ lo revisa un contador antes de aplicar
├── 099_proveedores_ruta.sql
├── 100_caja_denominaciones.sql
├── 101_vistas_retail.sql
└── 066_plantillas_semilla.sql               ⚠ TOCA DATOS VIVOS. No se aplica sin P-04
```

### 2.5 · Interfaz

Nada se toca en `apps/web/heredado/` mientras Codex siga en la Fase 1. Lo que después habrá que
modificar:

| Archivo | Qué cambia |
|---|---|
| `apps/web/heredado/pages/POS.jsx` | **Se reestructura en la pantalla de Cobrar**: capturador de teclado a nivel de documento, agrupación de línea repetida, teclas rápidas, cobro por expansión en vez de modal, franja de cliente con saldo |
| `apps/web/heredado/components/barcode/BarcodeScanner.jsx` | **Intacto.** Pasa a ser el camino de respaldo en teléfono |
| `apps/web/heredado/pages/Inventario.jsx` | Existencia en dos lentes, filtros por zona y proveedor, marca de negativo |
| `apps/web/heredado/pages/Productos.jsx` | Bloque de presentaciones, campos fiscales, margen en vivo. **Se ocultan** los campos de receta, área de preparación y alérgenos |
| `apps/web/heredado/pages/Compras.jsx` | "Hoy toca", sugerencia de pedido, canje en la misma nota |
| `apps/web/heredado/pages/Caja.jsx` | Denominaciones, segundo arqueo de recargas, el desplegable "¿de dónde salió el esperado?" |
| `apps/web/heredado/components/tickets/CorteTicket.jsx` | **Documento nuevo**, las quince secciones de `02-DINERO-Y-CAJA.md` §9.3. No se modifica el de restaurante: se elige por plantilla |
| `apps/web/heredado/lib/packageConfig.js` | D-01: `esencial` → `tienda` + los módulos nuevos |
| `apps/web/heredado/components/datos/` | Plantilla de importación con tasa por categoría |

Componentes nuevos:

```
CapturadorCodigo · AltaRapidaDialog · PresentacionesEditor ·
ConteoZonaPanel · CierreConteoResumen · CarteraFiadoTabla ·
FichaClienteFiado · AbonoDialog · ServiciosPanel · RecargaForm ·
PagoServicioForm · DepositoEnvaseDialog · RedondeoControl ·
SugerenciaPedidoPanel · RecepcionConCanje · DenominacionesInput ·
CascadaEsperadoCaja · TeclasRapidasBar
```

---

## 3 · QUÉ ESTÁ YA CONSTRUIDO, Y DÓNDE

Este modelo **hereda mucho y construye mucho**. Lo que ya existe y por lo tanto **no se vuelve a
construir** (detalle con rutas en `05-DATOS-Y-BACKEND.md` §9):

| Bloque | Funciones | Origen |
|---|---|---|
| Identidad y acceso | F-001…F-006 | `restaurante` · `packages/app/src/identidad/` |
| Cobro y métodos de pago | F-210…F-213, F-220, F-223, F-225 | `restaurante` · `packages/app/src/venta/pagos.ts` |
| Caja, arqueo y corte de turno | F-230…F-233, F-236 | `restaurante` · `packages/app/src/caja/` |
| Tronco de inventario | F-100…F-102, F-104, F-107, F-108 | `restaurante` · `packages/app/src/inventario/` |
| Compras y costo promedio | F-631, F-633, F-634 | `restaurante` · `packages/app/src/compras/` |
| Gastos | F-250, F-251 | `restaurante` |
| Catálogo base e importación | F-020…F-022, F-028, F-032 | `restaurante` · `packages/app/src/catalogo/` |
| Generación de PDF | F-057 | `restaurante` · `heredado/lib/pdfDownload.js` |
| Utilidades de código de barras | parte de F-029 | **`POS-MH-Tiendita`** → `heredado/utils/barcodeUtils.js` |
| Escáner de cámara | parte de F-986 | **`POS-MH-Tiendita`** → `heredado/components/barcode/` |
| Venta por medida variable | base de F-144 | `restaurante` · `venta/escala.ts` · `CantidadVariableDialog.jsx` |
| Conversión de unidades de compra | base de F-120 | `restaurante` · `heredado/utils/unitConversions.js` |

**El antecedente que hay que reconocer:** el escáner de código de barras y sus utilidades vienen de
`POS-MH-Tiendita`, el POS de tiendita que Miguel construyó antes. Están portados en
`apps/web/heredado/` y funcionan. **Lo que se conserva es `barcodeUtils.js` completo** —
`normalizeBarcode`, `isLikelyValidBarcode`, `isSuspiciousBarcode`, `compareBarcodes` — y el
componente de cámara como camino de respaldo. Lo que **no** sirve para este modelo es el enfoque:
cámara con *cooldown* de 1500 ms y búsqueda exacta contra la lista en memoria. Ese diseño es
correcto para un teléfono y no lo es para un mostrador con lector USB y fila.

---

## 3.bis · LO QUE LA ETAPA 5 CONSTRUYÓ, CON SUS RUTAS REALES

Escrito con el código delante, el 2026-09-15. Es la lista que hay que leer al acoplar.

| Función | Dónde quedó | Prueba |
|---|---|---|
| **F-111 · F-112** presentaciones | `packages/domain/src/inventario/variantes/v3-presentaciones.ts` · `packages/app/src/abarrotes/presentaciones.ts` | `v3-presentaciones.test.ts` · `presentaciones.test.ts` |
| **F-147** código por presentación | `producto_presentaciones.codigo_barras` + índice único parcial, en la `090` | dentro de `presentaciones.test.ts` |
| **F-148** EAN con peso o importe embebido | `packages/domain/src/catalogo/codigo-barras.ts` | `codigo-barras.test.ts` · 16 casos |
| **F-149 · F-106** conteo cíclico por zona | `packages/domain/src/inventario/conteo.ts` · `packages/app/src/abarrotes/conteo.ts` · repo de E2 en `packages/data/src/repos/tomas-inventario.ts` | `conteo.test.ts` × 2 · 36 casos |
| **F-107** alerta de mínimo y sugerencia de pedido | `packages/domain/src/inventario/pedido.ts` · `packages/app/src/abarrotes/sugerencia.ts` | `pedido.test.ts` · `sugerencia.test.ts` |
| **F-254 · F-255 · F-256** el dinero ajeno | `packages/app/src/abarrotes/pasivos.ts`, sobre el ledger `pasivos_terceros` de la `063` | `pasivos.test.ts` · 28 casos |
| **F-257** redondeo de cambio | `packages/domain/src/dinero/cambio.ts` · `packages/app/src/abarrotes/redondeo.ts` | `cambio.test.ts` · `redondeo.test.ts` |
| **F-040** clientes en el puente | `packages/app/src/puente/mapa.ts` · entidad `Cliente` | `puente.test.ts` (contrato de forma) |

**Migraciones escritas, NO aplicadas:** `090_presentaciones.sql`, `091_zonas_y_conteo.sql`,
`097_redondeos.sql`, `099_proveedores_ruta.sql`. Las cuatro llevan en su cabecera por qué existen.
Quedan libres del rango de este modelo la `092`–`096`, la `098` y las `100`–`101`.

**Rutas de API nuevas:**

```
apps/web/app/api/catalogo/presentacion/route.ts
apps/web/app/api/comision/registrar/route.ts
apps/web/app/api/fiado/abono/route.ts
apps/web/app/api/envase/deposito/route.ts
apps/web/app/api/inventario/conteo/{abrir,capturar,cerrar}/route.ts
apps/web/app/api/compras/sugerencia/route.ts
apps/web/app/api/venta/redondeo/route.ts
```

**Entidades nuevas en el puente** (`packages/app/src/puente/mapa.ts`): `Cliente`, `Presentacion`,
`ZonaAnaquel`, `Conteo`, `ConteoLinea`, `Redondeo`, más los cuatro campos de ruta en `Proveedor`.

### El cambio de UNA LÍNEA que hará falta en `heredado/` al acoplar

Ninguno todavía. Este modelo **no tocó una sola pantalla**, ni vieja ni nueva, y la razón está
escrita abajo en §6 y en la bitácora: las ocho funciones dependen de migraciones que la Fase 2 no
aplica. Cuando se apliquen, el primer enganche será el de `F-986` sobre
`heredado/utils/barcodeUtils.js`, que es donde entra `interpretarCodigoInterno`.

---

## 3.ter · LO QUE LAS ETAPAS 10-13 AÑADIERON

Escrito con el código delante. `verify:cobertura` sale en 0 para este modelo:
25/25 funciones, 20/20 rutas, 11/11 pantallas, 14/14 migraciones.

| Pieza | Dónde quedó | Prueba |
|---|---|---|
| **F-106** caducidad sin lote | `packages/app/src/abarrotes/caducidad.ts` · `apps/web/app/api/inventario/caducidad/route.ts` | `caducidad.test.ts` |
| recibir la nota con sus caducidades | `packages/app/src/abarrotes/recibir-nota.ts` · `apps/web/app/api/compras/recibir-nota/route.ts` | `recibir-nota.test.ts` |
| **F-255** entregar el dinero ajeno | `packages/app/src/abarrotes/deposito-comision.ts` · `apps/web/app/api/comision/depositar/route.ts` | `deposito-comision.test.ts` |
| **F-201** alta rápida desde el código de barras | `packages/app/src/catalogo/alta-rapida.ts` · `apps/web/app/api/catalogo/alta-rapida/route.ts` | `alta-rapida.test.ts` |
| IVA e IEPS por categoría, en masa | `packages/app/src/catalogo/fiscal-masivo.ts` · `apps/web/app/api/catalogo/fiscal-masivo/route.ts` | dentro de `alta-rapida.test.ts` |
| **F-224** venta en espera | `packages/app/src/venta/suspender.ts` · `apps/web/app/api/venta/suspender/route.ts` | `suspender.test.ts` |
| **PANTALLAS** caja, cortes, entradas, producto, registros | `apps/web/src/abarrotes/{Caja,Cortes,Entradas,Producto,Registros}.tsx` | la lógica pura está exportada archivo por archivo |

**Migración nueva y DECLARADA: `102_venta_en_espera.sql`.** El `05` declaraba
`venta.suspender` escribiendo `ordenes.estado`, y el `check` de esa columna no
admitía ningún estado que significara «apartada»: el comando existía en el papel
y no podía existir en la base. Se escribió dentro del rango 090-109 y el árbol
de migraciones de este modelo pasa de 13 a 14.

Esa migración reescribe el `check` completo —no lo parchea—, y por eso tuvo que
traer también `dividida` (070) y `absorbida` (071). Copiar la lista de la 003
las habría borrado, y con ellas la cuenta dividida y la mesa que se junta con
otra. Lo cazó el contrato `estados-con-columna.contrato.test.ts` antes de que
llegara a ninguna base.

Dos decisiones más que el código fija:

- **La caducidad NO resta de la existencia.** `consumida` es una anotación sobre
  el lote, no un movimiento de stock: restarla descontaría dos veces lo que la
  venta ya descontó.
- **El fiscal masivo es simulacro por omisión.** Cambiar el IVA de una categoría
  entera toca cientos de precios; enseñar primero a cuántos productos les va a
  pegar es más barato que revertirlo después.

### El cambio de UNA LÍNEA que hará falta en `heredado/` al acoplar

Sigue siendo el de `F-986` sobre `heredado/utils/barcodeUtils.js`, y ahora tiene
destino: `apps/web/src/cliente/lector-teclado.ts`. La línea es el `import` que
sustituye la detección actual por `esDeLector`.

---

## 4 · QUÉ HEREDAN DE AQUÍ LOS DIECIOCHO VECINOS

Lo que **no** deben volver a construir. Si un modelo de retail reinventa algo de esta lista, está
mal hecho.

| Función | Qué es | Modelos que la reutilizan |
|---|---|---|
| **F-986** lector como teclado | El capturador, la distinción por tiempo entre teclas, el foco imperdible, sin *cooldown* | Los 18 |
| **F-111 / F-112** stock simple y presentaciones | El motor entero, con V2 como caso degenerado de V3 | Los 18 |
| **F-120 / F-121** factor y venta en dos unidades | La conversión en el borde, el ledger en unidad base | ferretería, farmacia, vinatería, agroveterinaria, mascotas, materiales |
| **F-147** código por presentación | | abarrotes, farmacia, vinatería, vapes, mascotas |
| **F-148** peso embebido | | dulcería, mascotas, agroveterinaria, bufet por peso, tortillería |
| **F-106 / F-149** conteo cíclico y toma física | El motor de esperado-contra-contado con alcance parcial | Los 18, **y también `restaurante`**, que hoy tiene el mismo hueco |
| **F-109** merma con cinco motivos | Los motivos de custodia, no de proceso | Los 18 |
| **F-146** caducidad sin lote | | papelería (no), farmacia (la reemplaza por V4), mascotas, agroveterinaria, dulcería |
| **F-254 / F-610…F-617** fiado ligero | La variante de libreta, no la de crédito formal | fonda, papelería, mercería, tortillería |
| **F-255** venta por comisión | | papelería, misceláneas, y potencialmente los 78 |
| **F-256** casco | | vinatería, purificadora (en su variante de ruta) |
| **F-257** redondeo | | Los 18 |
| **F-011** IVA mixto e IEPS | El cálculo por grupo de tasa | Los 18, y `cafeteria` cuando venda producto empaquetado |
| **F-234** el corte de faltantes | El documento de quince secciones | Los 18, con sus deltas |
| **F-058** etiquetas de anaquel | | Los 18 |
| **F-980** restricción por línea | | vinatería, vapes, farmacia |

---

## 5 · LAS CUATRO PREGUNTAS DE CIERRE

Contestadas con honestidad, incluido lo que quedó flojo.

### P1 · ¿Es fiel al negocio?

**Sí, con dos reservas que hay que decir.**

Lo que sostiene el sí: el día está escrito con los tres picos reales de una tiendita mexicana —el de
las 7:10, el de la comida y el fuerte de las 19:00—, no con un horario genérico. Los doce
proveedores están con su ritmo real: Bimbo a diario con logística inversa, Coca con preventa de día
fijo y cooler en comodato, Sabritas semanal con exhibidor, central de abasto quincenal y de contado.
El fiado está tratado como lo que es —una relación, no una línea de crédito— y con el dato duro de
que el 78% de los tenderos fía. La distinción entre dinero propio y dinero en tránsito, que es la
que hace que el cajón cuadre, está en el centro del documento de dinero y no como nota al pie. Y el
IVA mixto está resuelto con el algoritmo por grupo de tasa, que es la diferencia entre un corte que
cuadra y uno que se desvía por centavos todos los días.

**Reserva 1 · la estacionalidad no está modelada.** Una tiendita tiene un año con forma: el regreso
a clases, la quincena, el 15 de septiembre, diciembre, la cuaresma, el calor de mayo. La sugerencia
de pedido que se describe en esta carpeta usa la venta de 14 días, y eso es correcto para un martes
normal y **es malo para el 10 de diciembre**. Alguien con veinte años en el giro leería la sección
de compras y diría *"le falta la temporada"*, y tendría razón. Queda anotado y no resuelto.

**Reserva 2 · la relación con el proveedor está descrita desde afuera.** El cooler en comodato, el
exhibidor de Sabritas, las metas de compra, los "apoyos" que dan las marcas por exhibición, las
promociones que el preventista negocia en el mostrador: todo eso es una parte real de la economía de
una tiendita y en esta carpeta aparece sólo como contexto. Un sistema que supiera *"este mes te
faltan 4 cajas para la meta de Coca y el apoyo es de $800"* sería valioso, y no está aquí. Es
honesto decir que no lo investigamos lo suficiente como para modelarlo.

### P2 · ¿Da control total?

**No todavía, y los huecos están con nombre y apellido.**

Lo que **sí** puede contestar el dueño con esta documentación implementada: cuánto vendí hoy y
contra qué (venta y comparativo), cuánto gané de verdad (margen sobre costo promedio ponderado, no
sobre el precio de compra que recuerda), qué categoría me deja y cuál sólo me trae gente (margen por
categoría, que es la pregunta que hoy contesta con el estómago), qué me falta y a quién pedírselo
(sugerencia agrupada por proveedor, con el de mañana arriba), qué se me va a echar a perder, quién
me debe y desde cuándo, cuánto gané de comisiones, si la caja cuadró y **de dónde salió el
esperado**, y quién canceló y quién descontó.

Lo que **no** puede contestar, sin maquillaje:

1. **"¿Quién me está robando?"** — El sistema da esperado contra contado por producto, y eso es más
   de lo que tiene hoy `restaurante`. Pero **el conteo cíclico es voluntario**: si nadie cuenta, no
   hay diferencia que mostrar. El sistema puede acabar enseñando un cero honesto y pareciendo
   inútil. Está mitigado —el dashboard dice "no se está contando" en vez de mentir con un cero—
   pero la verdad es que **el dolor 1 sólo se resuelve si la rutina de veinte minutos diarios se
   sostiene, y eso no lo garantiza ningún software.**
2. **"¿Cuánto me cuesta el fiado que no vuelve?"** — Hay saldo, antigüedad e incobrables declarados.
   No hay **tasa de recuperación histórica** ni predicción. Con el 63% de los tenderos reportando
   pérdidas de al menos 20%, ése es un número que valdría mucho y no está.
3. **"¿Cuánto debo yo?"** — El crédito de proveedor (8–15 días en ruta, 15–30 en mayoristas) es la
   otra mitad del flujo de efectivo de este negocio. **F-635 está en la tanda 5 y debería estar
   antes.** Un tendero que sabe lo que le deben y no lo que debe tiene media película.
4. **"¿Voy a tener con qué pagarle a Coca el jueves?"** — No hay flujo de efectivo proyectado.
   Es la consecuencia del punto 3 y es la pregunta que de verdad quita el sueño.
5. **"¿Me conviene más la Coca o el agua?"** — Está el margen por categoría, pero no está la
   **rentabilidad por espacio de anaquel**, que es el número correcto en retail. Se documentó el
   margen porque es lo que se puede calcular con los datos que hay; el metro lineal de anaquel no
   está modelado y no se pretendió que lo estuviera.

### P3 · ¿Parece hecho a la medida?

**Sí, y se nota en cosas que sólo aparecen cuando alguien estuvo en un mostrador.**

La cascada de "¿de dónde salió el efectivo esperado?" con sus once renglones, porque un tendero
cuyo cajón sobra tres mil pesos cada noche deja de creer en el arqueo. El total en la tipografía más
grande de la aplicación porque el cliente lo lee desde el otro lado. El desglose por denominación al
abrir la caja, porque un fondo de $800 en dos billetes de $500 no sirve para dar cambio. La
diferencia de conteo mostrada **con su contexto** —1.9%, y el promedio del retail mexicano es
1.5–2.5%— porque el número solo no le dice nada a nadie. El alta rápida desde el código no
encontrado, que convierte la objeción de venta número uno en el mecanismo por el que el catálogo se
completa solo. El motivo de ajuste que dice *"diferencia de conteo"* y nunca *"robo"*. El canje de
Bimbo como tipo de salida propio, porque meterlo en merma arruina el indicador que sirve para
detectar al que sí roba. Y la ausencia total de propinas, de mesas y de recetas, incluidas las
casillas que se ocultan en la ficha de producto.

**Lo que todavía delataría al sistema como genérico:** lo mismo que en `restaurante` — el
vocabulario está descrito en esta carpeta pero **F-017 sigue sin construirse**. Y aquí pesa más:
`restaurante` podía vivir con "mesa" escrito a mano en los `.jsx` porque era el único modelo. En el
momento en que `ferreteria` reutilice la pantalla de Cobrar y aparezca la palabra "artículo" donde
debería decir "material", o el corte hable de "productos" donde debería decir "piezas", se va a
notar. **Este modelo es el que debería forzar la construcción de F-017, porque es el primero que
tiene dieciocho herederos.**

Y hay un segundo riesgo, más grande: **la pantalla de Cobrar de este modelo es la misma pantalla
para los dieciocho.** Si la estructura queda pensada sólo para abarrotes, `ferreteria` —donde la
mitad del catálogo no tiene código y se busca por nombre y por medida— va a tener que pelearse con
un diseño hecho para escanear. Está anotado en la sección de herencia, pero no está resuelto.

### P4 · ¿Se distingue de sus vecinos?

**Sí, pero uno de los vecinos está demasiado cerca y hay que decirlo.**

**Contra `restaurante`** (el único modelo terminado con el que hay comparación real) la distinción
es absoluta y un extraño la vería en dos segundos:

| | `abarrotes` | `restaurante` |
|---|---|---|
| Pantalla de inicio | **Cobro**, con el cursor capturando el lector | **Mapa del salón** con mesas dibujadas |
| Acción principal | **Escanear** (ninguna tecla) | **Abrir mesa** (un toque) |
| Unidad de trabajo | **El ticket**, que vive 30 segundos | **La mesa**, que vive 90 minutos |
| Documentos | Uno: el ticket | **Dos**: precuenta y ticket |
| Propinas | **No existen. Ni en cero en el corte** | Tres momentos, tres personas, desglose exacto |
| Inventario | Producto que se revende, **en dos unidades** | Insumo que se transforma, **con receta** |
| El corte contesta | **¿Qué producto falta?** | ¿Cuánto le toca a cada mesero? |
| Dispositivo | **PC con lector** | Tablet |
| IVA | **Mixto 0%/16% + IEPS** | Tasa única 16% |

**Contra `ferreteria`, que es el vecino inmediato, hay riesgo real de fusión.** Los dos son A1 puro,
los dos usan V3, los dos venden a granel, los dos tienen fiado y los dos son PC con lector. Si
`ferreteria` se documenta sin sus deltas de verdad, va a salir siendo esta misma carpeta con otro
nombre. **Lo que de verdad los separa, y hay que exigirlo cuando se escriba:**

1. **La mitad del catálogo de una ferretería no tiene código de barras.** Tornillos, tubo, cable,
   bisagras. Eso cambia la pantalla de Cobrar por completo: la búsqueda por nombre y por medida deja
   de ser el camino de excepción y pasa a ser la mitad del tráfico.
2. **El corte de material (F-145).** Cable por metro, lámina cortada, tubo. Es una operación de
   transformación física con merma de corte, y no existe aquí.
3. **La compatibilidad y la medida como atributo de búsqueda** ("tornillo 1/4 × 2 galvanizado"). Es
   un modelo de catálogo distinto, no un campo más.
4. **El ticket es mucho más grande y el ritmo es sostenido, no ráfaga.** Una ferretería hace 40
   tickets de $400 y una tiendita 220 de $50. Eso cambia la densidad, el cobro y el dashboard entero.
5. **La venta a obra y a contratista, con crédito formal y no fiado de libreta.**

Si `ferreteria` se escribe sin esos cinco, **o se fusiona con este modelo o los dos están mal
documentados**, y hay que decirlo en la segunda pasada.

**Contra `papeleria` y `dulceria`** la distinción es de grado, no de clase: son este modelo con V2
en vez de V3 y con menos SKU. `papeleria` añade servicios (copias, impresión) que son productos sin
stock, y `dulceria` añade granel. **Son candidatos legítimos a ser deltas de `abarrotes` en vez de
carpetas propias**, y eso también hay que evaluarlo en la segunda pasada en vez de escribir dos
carpetas que digan lo mismo.

---

## 6 · PENDIENTES QUE ESTA CARPETA DEJA ABIERTOS

Para que nadie tenga que deducirlos leyendo los siete archivos.

1. **Añadir al catálogo las diez funciones nuevas** de `01-FUNCIONES.md` §6 — F-058, F-146, F-147,
   F-148, F-149, F-254, F-255, F-256, F-257, F-988 — **y las dos reclasificaciones**: F-815 deja de
   ser exclusiva de A9 y F-029 deja de ser `[=]`. **Antes de construir nada.**
2. **F-988 (venta sin conexión) la decide Miguel.** Entra en tensión directa con la regla de Fase 1
   de totales en el servidor, y de la respuesta depende la arquitectura de la pantalla de Cobrar.
3. **La migración 082 no se aplica sin P-04.** Toca a Don Chuy y a La Broca, que están operando.
4. **La tabla de mapeo categoría → tasa de IVA la revisa un contador** antes de aplicar la 078. Es
   la única parte de esta carpeta con consecuencia fiscal directa sobre un cliente vivo.
5. **F-017 (diccionario de vocabulario) debería construirse con este modelo**, no después. Es el
   primero con dieciocho herederos y es donde el vocabulario escrito a mano se va a romper.
6. **F-635 (cuentas por pagar / crédito de proveedor) debería subir de la tanda 5 a la tanda 3.**
   Está señalado en P2 punto 3 y es una debilidad consciente del orden propuesto.
7. **La estacionalidad de la sugerencia de pedido** no está modelada. Ver P1, reserva 1.
8. **El agregador de recargas es una decisión comercial.** Ver `05-DATOS-Y-BACKEND.md` §8.
9. **En la segunda pasada, leer `abarrotes` y `ferreteria` uno junto al otro** y verificar que se
   distinguen de verdad. Es el riesgo de fusión más probable de toda la familia 02. Y evaluar si
   `papeleria` y `dulceria` merecen carpeta propia o son deltas de ésta.
10. **Dato que no se pudo verificar en la investigación:** el número exacto de tiendas OXXO en
    México y la magnitud medida del impacto de las cadenas de conveniencia sobre la tiendita. Se
    describió el efecto cualitativamente y se evitó citar una cifra sin fuente. Si alguien lo
    necesita para un argumento comercial, hay que buscarlo antes de usarlo.
