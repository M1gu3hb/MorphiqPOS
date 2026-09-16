# FILE-MAP · Ferretería y tlapalería

**Modelo:** `ferreteria` · **Familia:** 02 Retail y mostrador · **Arquetipo:** A1 + deltas de A5
**Ruta:** `fase-2/modelos/02-retail/ferreteria/`
**Estado:** ✅ **terminado** (documentación) · el código está **sin empezar**
**Cliente vivo:** Ferretería La Broca · giro `ferreteria` · paquete `operativo`
**Plantilla destino:** `tienda` **provisional** por D-01 → `ferreteria` propia
**Hereda de:** `modelos/02-retail/abarrotes/` — la raíz del arquetipo A1

> **Esta carpeta NO es raíz de arquetipo.** Hereda de `abarrotes`, que sí lo es, y su valor está tanto
> en lo que añade como en lo que **cita sin repetir**. Alrededor de **siete de cada diez funciones van
> marcadas `[=]`**. Quien abra `materiales-construccion`, `refaccionaria`, `merceria-telas` o
> `carpinteria-herreria` tiene que leer primero `abarrotes` y después ésta.

---

## 1 · ÍNDICE DE LA CARPETA

| Archivo | Qué hay dentro |
|---|---|
| `00-FICHA-Y-EJES.md` | **La tabla que contesta el riesgo de fusión con `abarrotes` en la primera página**, cómo gana dinero una ferretería y el margen real de cada línea (14% en plomería, 50% en tornillería), el perfil de Beto con su objeción literal —*"me hacía capturar el tornillo como si fuera un refresco"*—, **el día completo con los dos picos y el sábado aparte**, los seis ejes del mapa y los seis de diseño con su razón, el arquetipo con sus deltas y **lo que se apaga respecto del padre**, las doce cosas que este negocio **no** necesita, y los tres dolores con sus cifras |
| `01-FUNCIONES.md` | El árbol completo de 112 funciones con IDs canónicos, las **`[=]` que se citan de `abarrotes` y no se vuelven a construir**, **43 `[≠]` con su tabla comparativa de tres columnas contra `abarrotes`**, las `[+]` que nacen aquí, los trece huecos con su costo operativo, **diez funciones nuevas propuestas al catálogo y tres reclasificaciones**, el grafo de dependencias y el orden de construcción en seis tandas con las tres decisiones de orden explicadas |
| `02-DINERO-Y-CAJA.md` | **La frase que define el giro —lo que sale por la puerta no entra al cajón—**, qué cuenta como venta uno por uno, **las DOS pruebas de cuadre** (el cajón y el material), el IVA único y por qué **la sección más difícil de `abarrotes` aquí desaparece**, la `ClaveUnidad` del SAT, **el tope de descuento por línea derivado del margen de la línea**, por qué no hay propinas **con una razón distinta a la del padre**, la mezcla real de métodos de pago, **el crédito con sus tres puertas de pérdida**, por qué NO se comisiona al mostradorista, la caja con sus **dos modos** y sus diecinueve movimientos, **el PDF del corte en diecinueve secciones en orden**, y los cinco descuadres típicos |
| `03-INVENTARIO.md` | Por qué V3 + F-145 y no las otras, **la regla del milímetro como unidad base**, **la conversión por peso explicada con su tolerancia y su recalibración**, los cuatro casos que rompen el modelo del padre, **el rollo abierto y por qué sólo lo abierto tiene identidad**, los tres disparadores de descuento de stock, **por qué aquí sí hay dos almacenes y en `abarrotes` no**, la captura de 200 líneas, **el conteo priorizado por valor y el modo por peso**, las seis mermas, **el robo hormiga con su forma propia y por qué baja de rango**, las once alertas que importan y las siete que son ruido, y los tres errores del giro |
| `04-INTERFAZ.md` | Vocabulario con género y plural, la navegación con su razón sección por sección, **doce pantallas documentadas una por una** con layout en PC, tablet y teléfono, estados, atajos y qué no va en cada una, **el comportamiento exacto de la búsqueda por medida**, **la pantalla de corte de material con sus tres decisiones**, **el dashboard de ocho indicadores con la decisión que dispara cada uno y el que se decidió NO poner**, lo que cambia el sábado, multi-sucursal con el límite de crédito consolidado, y las trece condiciones reales de operación con su consecuencia |
| `05-DATOS-Y-BACKEND.md` | **Quince tablas nuevas** con campos, tipos y restricciones, las extensiones a entidades existentes, **diez vistas incluida la materializada de búsqueda**, **diez reglas de integridad propias y la que se decidió NO poner, con su razón**, treinta y ocho comandos con entrada y roles, veintitrés entradas del puente con `rolesLectura`, veintisiete rutas de API, **las migraciones 083 a 095 escritas y no aplicadas**, las cuatro decisiones de integración, y lo que se reutiliza tal cual con su ruta |
| `FILE-MAP.md` | Este archivo. Índice, destino del código, qué heredan los vecinos, y **las cuatro preguntas de cierre con la P4 contestada de frente** |

---

## 2 · DÓNDE VIVIRÁ EL CÓDIGO

Rutas exactas dentro del monorepo. **Acoplar es mover carpetas y aplicar migraciones, nunca
reescribir** (D-05).

### 2.1 · Lógica de aplicación

```
packages/app/src/retail/                    ← YA EXISTE (de abarrotes). Se amplía
├── presentaciones.ts · conversion.ts        ← INTACTOS. El rollo es una presentación
├── alta-rapida.ts                           ← se extiende: medida y ubicación obligatorias
├── atributos.ts                   F-059 · definirAtributos, validarContraEsquema
├── medidas.ts                     F-059 · fraccion↔decimal↔micrometro, normalizar
├── medidas.test.ts                ← PRUEBA CRÍTICA: 1/4" · .25 · 6.35mm · 6,350 µm
├── busqueda.ts                    F-201 · índice en memoria, filtro progresivo
├── busqueda.test.ts               ← PRUEBA CRÍTICA: tolerancia de escritura y orden
├── equivalencias.ts               F-060 · declarar, resolver, bidireccional
├── ubicaciones.ts                 F-152
├── listas-trabajo.ts              F-153 · volcar a partidas editables
└── etiquetas.ts                   ← de abarrotes (F-058). Se extiende: etiqueta de gaveta

packages/app/src/material/                  ← CARPETA NUEVA. El corte
├── corte.ts                       F-145 · cortar (dos movimientos, una transacción)
├── corte.test.ts                  ← PRUEBA CRÍTICA: la merma no puede quedar huérfana
├── piezas-abiertas.ts             F-150 · abrir, sugerir de dónde, cerrar, retazo
├── piezas-abiertas.test.ts        ← PRUEBA CRÍTICA: la suma no puede exceder existencia
└── peso-pieza.ts                  F-151 · convertir, calibrar, evaluar tolerancia

packages/app/src/credito/                   ← CARPETA NUEVA (distinta de `fiado/`)
├── limite.ts                      F-610, F-617 · evaluar, bloquear, levantar
├── autorizados.ts                 F-638 · alta, baja, evaluar quién recoge
├── autorizados.test.ts            ← PRUEBA CRÍTICA: el sello se calcula en servidor
├── obras.ts                       F-639 · abrir, cerrar, saldo por obra
├── remision.ts                    F-606 · entregar con firma (venta + stock + saldo)
├── remision.test.ts               ← PRUEBA CRÍTICA: sin firmante no existe
├── pago.ts                        F-614 · aplicar a documentos elegidos
└── pago.test.ts                   ← PRUEBA CRÍTICA: efectivo exige movimiento de caja

packages/app/src/inventario/                ← YA EXISTE. Se amplía
├── conteo.ts                      ← INTACTO el motor. Se añade el modo por peso
├── conteo-peso.ts                 F-149 variante + tolerancia sin ajuste
├── merma.ts                       ← se extiende con `corte` y `retazo`
├── garantias.ts                   F-127 variante · enviar, resolver, costo detenido
└── rentas.ts                      F-119 variante · entregar, recibir, depósito

packages/app/src/servicios/                 ← CARPETA NUEVA
└── mostrador.ts                   F-258 · cobrar trabajo, consumir material

packages/app/src/cotizacion/                ← CARPETA NUEVA (bloque A5)
├── cotizacion.ts                  F-600…F-603
├── conversion.ts                  F-604, F-605 · surtido parcial
└── seguimiento.ts                 F-607 · ganada, perdida, motivo

packages/app/src/venta/                     ← YA EXISTE. Se amplía
├── nota-mostrador.ts              El documento intermedio del modo B
├── devolucion-ferreteria.ts       F-222 · tres destinos y política con plazo
└── pagos.ts · escala.ts           ← YA EXISTEN. `escala.ts` es la base del corte

packages/app/src/compras/                   ← YA EXISTE. Se amplía
├── importar-nota.ts               La función más rentable de la carpeta
├── sugerencia-ferreteria.ts       90 días + dinero dormido al lado
└── costeo.ts                      ← INTACTO

packages/app/src/fiscal/                    ← YA EXISTE (de abarrotes)
├── iva-mixto.ts · ieps.ts         ← EXISTEN Y NO SE ENCIENDEN aquí
└── clave-unidad.ts                F-940 · la ClaveUnidad sale de la presentación
```

### 2.2 · Puente

```
packages/app/src/puente/mapa.ts    ← se AMPLÍA con veintitrés entidades:
    Linea · AtributoProducto · Equivalencia · Ubicacion · PiezaAbierta ·
    CorteMaterial · Obra · AutorizadoCuenta · Remision · PagoCredito ·
    AplicacionPago · ServicioMostrador · GarantiaProveedor · Renta ·
    NotaMostrador · ListaTrabajo ·
    BusquedaMaterial · DineroDormido · RotacionPorLinea · CarteraPorObra ·
    SalioSinCobrar · MermaCortePeriodo · VentaPorMostradorista

  … y con los campos nuevos de ProductoTerminado, Venta, DetalleVenta,
    Cliente y Proveedor (ver 05-DATOS-Y-BACKEND.md §5)

  ⚠ `Cliente` SIGUE sin estar declarada hoy en mapa.ts, igual que señaló
    `abarrotes`. Aquí es todavía más grave: sin Cliente no hay crédito,
    y sin crédito este modelo no existe.
```

### 2.3 · Rutas

Las veintisiete de `05-DATOS-Y-BACKEND.md` §6.

### 2.4 · Migraciones

```
packages/data/src/migraciones/sql/
├── 110_lineas_y_atributos.sql
├── 111_ubicaciones.sql
├── 112_equivalencias.sql
├── 113_material_continuo.sql            ⚠ backfill deliberadamente vacío, ver 05 §7
├── 114_doble_unidad_peso.sql
├── 115_credito_ferreteria.sql           ⚠ convive con abonos_fiado, NO la sustituye
├── 116_notas_mostrador.sql
├── 117_servicios_mostrador.sql
├── 118_garantias_y_rentas.sql
├── 119_listas_trabajo.sql
├── 120_proveedores_ferreteria.sql
├── 121_vistas_ferreteria.sql
└── 066_plantillas_semilla.sql         ⚠ TOCA DATOS VIVOS. No sin P-04
```

### 2.5 · Interfaz

Nada se toca en `apps/web/heredado/` mientras Codex siga en la Fase 1. Lo que después habrá que
modificar, **además de todo lo que `abarrotes` ya declara**:

| Archivo | Qué cambia |
|---|---|
| `apps/web/heredado/pages/POS.jsx` | **Se reestructura más fuerte que en `abarrotes`.** El buscador pasa al centro y ocupa dos tercios; la venta pasa a la derecha y **deja de ser lo grande**; aparecen la franja de cliente con saldo, los ocho grupos de línea y la tabla de resultados con medida, existencia y **ubicación** |
| `apps/web/heredado/pages/Inventario.jsx` | Cuatro contadores en vez de tres —**dormido primero**—, columnas de 90 días y días de inventario, detalle de piezas abiertas |
| `apps/web/heredado/pages/Productos.jsx` | **Campos de medida generados desde la línea**, presentaciones con factor por peso, equivalencias, foto, ubicación. **Se ocultan** receta, alérgenos, caducidad y régimen de IEPS |
| `apps/web/heredado/pages/Compras.jsx` | Importación de archivo, emparejamiento, aviso de costo, **dinero dormido en el pedido sugerido** |
| `apps/web/heredado/pages/Caja.jsx` | Lista de notas pendientes, cuatro métodos del mismo tamaño, pagadas sin entregar, cuatro bloqueos de cierre |
| `apps/web/heredado/components/tickets/CorteTicket.jsx` | **Documento nuevo**, las diecinueve secciones de `02-DINERO-Y-CAJA.md` §9.3. No se modifican el de restaurante ni el de abarrotes: se elige por plantilla |
| `apps/web/heredado/components/mesero/CantidadVariableDialog.jsx` | **Base de la pantalla de corte.** Se reestructura con "de dónde", merma propuesta y destino del sobrante |
| `apps/web/heredado/lib/packageConfig.js` | D-01: la plantilla `ferreteria` con sus módulos, y **con IEPS, comisiones, casco, caducidad y restricción legal apagados** |

Componentes nuevos:

```
BuscadorMaterial · TablaResultados · FichaPieza · EquivalenciasEditor ·
FotoMostrador · GruposLinea · CorteMaterialDialog · PiezaAbiertaSelector ·
ListaTrabajoPanel · NotasPendientesPanel · FranjaClienteCuenta ·
CarteraPorObraTabla · FichaClienteCuenta · AutorizadosEditor · ObrasEditor ·
RemisionFirma · AplicacionPagoDialog · CotizacionEditor · TrabajosMostradorPanel ·
ImportarNotaPanel · ConteoPorPeso · DineroDormidoPanel · FacturacionAgrupada
```

---

## 3 · QUÉ ESTÁ YA CONSTRUIDO, Y DÓNDE

Este modelo **hereda muchísimo**. Lo que ya existe o ya está documentado y **no se vuelve a construir**:

| Bloque | Funciones | Origen |
|---|---|---|
| Identidad y acceso | F-001…F-006 | `restaurante` → `abarrotes` · `packages/app/src/identidad/` |
| Cobro y métodos de pago | F-210…F-213, F-220, F-223, F-225 | `abarrotes` · `packages/app/src/venta/pagos.ts` |
| Caja, arqueo, corte de turno, denominaciones | F-230…F-233, F-236 | `abarrotes` · `packages/app/src/caja/` |
| Tronco de inventario | F-100…F-104, F-108 | `abarrotes` · `packages/app/src/inventario/` |
| **Presentaciones, factor, venta en dos unidades** | F-111, F-112, F-120 | **`abarrotes` · `packages/app/src/retail/`** |
| **Capturador de código como teclado** | F-986 | **`abarrotes`.** Aquí cubre medio catálogo, y con eso basta |
| **Motor de conteo con esperado sellado** | F-106, F-149 | **`abarrotes` · `inventario/conteo.ts`** |
| Alta rápida desde el código no encontrado | F-020 variante | `abarrotes` · se extiende |
| Redondeo de cambio | F-257 | `abarrotes` |
| Cartera, antigüedad, abono parcial, aviso | F-613, F-615, F-616, F-618 | `abarrotes` · `packages/app/src/fiado/` |
| Compras, costo promedio, plantillas | F-631, F-633, F-634 | `abarrotes` · `packages/app/src/compras/` |
| Gastos | F-250…F-252 | `abarrotes` |
| Etiquetas | F-058 | `abarrotes` · se extiende a etiqueta de gaveta |
| Generación de PDF | F-057 | `restaurante` · `heredado/lib/pdfDownload.js` |
| Venta por medida variable | base de F-145 | `restaurante` · `venta/escala.ts` · `CantidadVariableDialog.jsx` |
| **El corte de caja con su cascada del esperado** | F-234 estructura | **`abarrotes`.** Aquí cambian las secciones, no el mecanismo |

**Lo que hay que reconocer con honestidad:** **este modelo se ahorra alrededor del 60% del trabajo
gracias a `abarrotes`**, y eso es exactamente lo que D-02 prometía cuando dijo que se construyen
arquetipos y no plantillas. Si `abarrotes` no existiera, esta carpeta tendría el doble de tamaño y el
triple de código.

---

## 3.bis · LO QUE LA ETAPA 6 CONSTRUYÓ, CON SUS RUTAS REALES

Escrito con el código delante, el 2026-09-15. Es la lista que hay que leer al acoplar.

| Función | Dónde quedó | Prueba |
|---|---|---|
| **F-059 · F-201** atributos y búsqueda por medida | `packages/domain/src/catalogo/medidas.ts` · `packages/app/src/ferreteria/catalogo.ts` | `medidas.test.ts` · `catalogo.test.ts` · 39 casos |
| **F-152** ubicación física | tabla `ubicaciones` en la `110` · viaja con cada resultado de `buscarMaterial` | dentro de `catalogo.test.ts` |
| **F-060** equivalencias | tabla `equivalencias` en la `110`, con `declarado_por` | — (tabla escrita; el comando de alta queda pendiente) |
| **F-145 · F-150** corte y retazo | `packages/domain/src/inventario/corte.ts` · `packages/app/src/ferreteria/corte.ts` | `corte.test.ts` × 2 · 32 casos |
| **F-151** pieza ↔ kilo | `piezasDesdePeso` en `packages/domain/src/catalogo/medidas.ts` | dentro de `medidas.test.ts` |
| **F-638 · F-639 · F-606** crédito, obra, remisión | `packages/domain/src/venta/credito.ts` · `packages/app/src/ferreteria/credito.ts` · `obras.ts` | `credito.test.ts` × 2 · `obras.test.ts` · 44 casos |
| **F-614** aplicación de pagos | `repartirPago` en `packages/domain/src/venta/credito.ts` | dentro de `credito.test.ts` |
| **F-258** servicio de mostrador | `packages/app/src/ferreteria/servicio.ts` | `servicio.test.ts` · 8 casos |

**Migraciones escritas, NO aplicadas:** `110_atributos_y_ubicacion.sql`,
`111_corte_y_retazo.sql`, `112_credito_de_obra.sql`, `113_servicio_de_mostrador.sql`. Quedan libres
del rango de este modelo la `114`–`121`.

**Rutas de API nuevas:**

```
apps/web/app/api/catalogo/{atributo,buscar-material}/route.ts
apps/web/app/api/inventario/corte/route.ts
apps/web/app/api/credito/{evaluar,remision,obra,obra-cerrar,autorizado,autorizado-baja}/route.ts
apps/web/app/api/venta/servicio/route.ts
```

**Entidades nuevas en el puente:** `Obra`, `AutorizadoCuenta`, `Remision`, `Ubicacion`,
`ProductoAtributo`, `PiezaAbierta`. La `identificacion` del autorizado la ve sólo `DIRECCION`: para
despachar basta el nombre y la foto.

### El cambio de UNA LÍNEA que hará falta en `heredado/` al acoplar

`heredado/utils/barcodeUtils.js` gana una rama: cuando `esCodigoInterno(codigo, layout)` da cierto,
el resultado del escaneo pasa por `interpretarCodigoInterno` en vez de buscarse tal cual en el
catálogo. Es el único enganche de esta etapa con el código viejo, y **no se hizo** por D-09.

---

## 3.ter · LO QUE LAS ETAPAS 10-13 AÑADIERON

Escrito con el código delante. `verify:cobertura` sale en 0 para este modelo:
38/38 funciones, 27/27 rutas, 12/12 pantallas, 13/13 migraciones.

| Pieza | Dónde quedó | Prueba |
|---|---|---|
| **F-021 · F-152 · F-060** línea, ubicación y equivalencia | `packages/app/src/ferreteria/organizacion-catalogo.ts` · rutas `catalogo/{linea,ubicacion,equivalencia}` | `organizacion-catalogo.test.ts` |
| **F-151** calibrar y contar por peso | `packages/app/src/ferreteria/peso.ts` · rutas de calibración y de conteo por peso | `peso.test.ts` |
| **F-058** etiquetas de anaquel y de gaveta | `packages/app/src/ferreteria/etiquetas.ts` · `apps/web/app/api/catalogo/etiquetas/route.ts` | `etiquetas.test.ts` |
| **F-146** garantías al proveedor | `packages/app/src/ferreteria/garantias.ts` · `apps/web/app/api/inventario/garantia/route.ts` | `garantias.test.ts` |
| **F-147** renta de herramienta | `packages/app/src/ferreteria/renta.ts` · `apps/web/app/api/renta/route.ts` | `renta.test.ts` |
| **F-145** pieza abierta y retazo | `packages/app/src/ferreteria/pieza-abierta.ts` · `apps/web/app/api/inventario/pieza-abierta/route.ts` | `pieza-abierta.test.ts` |
| **F-631** importar la nota del proveedor | `packages/app/src/compras/importar-nota.ts` · `apps/web/app/api/compras/importar-nota/route.ts` | `importar-nota.test.ts` |
| transferencia pendiente de confirmar | `packages/app/src/cartera/cobranza.ts` · `apps/web/app/api/credito/confirmar-transferencia/route.ts` | dentro de `cobranza.test.ts` |
| la llave del dueño sobre el muro de crédito | `packages/app/src/ferreteria/autorizacion-credito.ts` · `apps/web/app/api/credito/autorizar/route.ts` | `autorizacion-credito.test.ts` |
| **PANTALLAS** conteo, facturacion, material, trabajos-de-mostrador | `apps/web/src/ferreteria/{Conteo,Facturacion,Material,TrabajosDeMostrador}.tsx` | la lógica pura está exportada archivo por archivo |

**Migraciones ampliadas, ninguna nueva.** La `115` gana `confirmado`,
`confirmado_en`, `confirmado_por` y `recibido_en` en `pagos_credito`, más
`cliente_id` y `vence_en` en `autorizaciones_descuento`. La `120` gana
`compra_lineas.clave_proveedor`, que es la memoria que hace que la SEGUNDA nota
del mismo proveedor se empareje sola.

Cuatro decisiones que el código fija y el papel no decía:

- **La transferencia ya NO se aplica al recibirse.** Entra como pendiente y sólo
  reparte cuando alguien la confirma contra el banco. Aplicarla antes es dar por
  cobrado un dinero que todavía puede no llegar, y el saldo del cliente es
  precisamente lo que no debe mentir.
- **Abrir una pieza NO mueve existencia.** El rollo ya estaba contado; moverlo
  al abrirlo lo descontaría dos veces, al abrir y al cortar. Y se recomienda la
  pieza MÁS CHICA QUE ALCANZA, porque el trabajo de una ferretería es acabarse
  los abiertos, no abrir otro.
- **La renta se cobra desde que la herramienta SALE**, no desde que se pactó, y
  no se puede retener más que el depósito: cobrarle a alguien más de lo que dejó
  en garantía es una discusión que el mostrador pierde siempre.
- **La salida por garantía es `garantia_proveedor`**, no un tipo inventado. Lo
  cazó `valores-de-check.contrato.test.ts`: con el nombre que yo había escrito,
  la primera garantía real habría reventado con un 23514.

**Excepción declarada:** la ruta de factura agrupada es CFDI y depende de P-02,
así que está en `EXCEPCIONES-COBERTURA.md`. Lo de debajo sí está construido:
remisiones con saldo por documento y los datos fiscales del cliente.

### El cambio de UNA LÍNEA que hará falta en `heredado/` al acoplar

`heredado/pages/Inventario.jsx` gana el enlace a la pantalla de material, que es
donde viven los rollos abiertos. Una línea; el corte y el retazo ya están en
`apps/web/src/ferreteria/Material.tsx`.

---

## 4 · QUÉ HEREDAN DE AQUÍ LOS VECINOS

| Función | Qué es | Modelos que la reutilizan |
|---|---|---|
| **F-059** atributos técnicos de medida | El catálogo por medida, con normalización fracción↔decimal↔micrómetro | `materiales-construccion`, `refaccionaria`, `merceria-telas`, `optica`, `electronica-celulares` |
| **F-201** búsqueda por atributo | El índice en memoria con tolerancia de escritura y orden por coincidencia | Los mismos |
| **F-060** equivalencias y sustitutos | Y el mecanismo de capturarlas desde el resultado, en un clic | `refaccionaria` (la necesita más que nadie), `materiales`, `electronica` |
| **F-061** foto de mostrador | Con escala, y la rejilla visual filtrada por atributo | `refaccionaria`, `merceria-telas`, `agroveterinaria` |
| **F-145** corte de material | Las tres variantes: lineal, plana, tubular | `merceria-telas` (lineal), `carpinteria-herreria` y `fabrica-muebles` (plana), `materiales-construccion` (tubular) |
| **F-150** retazo y sobrante | La mitad invisible del corte | Los mismos |
| **F-151** doble unidad con factor por peso | Y la regla de tolerancia que evita el ruido en el conteo | `materiales-construccion`, `agroveterinaria`, `dulceria` |
| **F-152** ubicación física | Dónde está la pieza, en el resultado y en la etiqueta | `refaccionaria`, `merceria-telas`, `papeleria` grande, `farmacia` |
| **F-153** listas de materiales por trabajo | El conocimiento del mostradorista, guardado | `materiales`, `agroveterinaria`, `tienda-mascotas` |
| **F-258** servicio de mostrador | Consume material propio y cobra mano de obra | `papeleria` (copias, impresión, engargolado), `merceria-telas`, `vidrieria` |
| **F-606 · F-638 · F-639** remisión, autorizados, obra | **El bloque de crédito B2B completo** | `materiales-construccion`, `distribuidora-mayorista`, `refaccionaria` (crédito a talleres) |
| **F-610…F-617** crédito formal | La variante de contratista, no la de libreta | Los mismos, y `muebleria` |
| **F-600…F-607** cotización | El bloque A5 de mostrador | `materiales`, `carpinteria-herreria`, `imprenta-serigrafia` |
| **F-234** el corte de "salió y no se cobró" | El documento de diecinueve secciones | `materiales`, `distribuidora` |
| **F-051 inverso** dinero dormido y rotación | El reporte de cola larga valuado a costo | **Todo retail con más de 2,000 SKU** |
| **F-054** venta por mostradorista con líneas por venta | La medida de la asesoría | `refaccionaria`, `materiales`, `boutique` |

---

## 5 · LAS CUATRO PREGUNTAS DE CIERRE

Contestadas con honestidad, incluido lo que quedó flojo.

### P1 · ¿Es fiel al negocio?

**Sí, con tres reservas que hay que decir.**

Lo que sostiene el sí: el día está escrito con **el pico de los albañiles a las 7:30**, que es el
momento donde de verdad se juega el dinero de una ferretería, y no con un horario genérico de tienda. El
margen está desglosado **por línea** —14% en plomería, 15% en eléctrico, 26% en pintura, 35%–50% en
tornillería— y de ahí sale una decisión de producto concreta: **el tope de descuento es por línea**, que
es algo que no se le ocurre a quien no ha visto los números. El crédito está tratado como lo que es —un
producto financiero con tres puertas de pérdida— y no como un fiado grande. El corte de material está
resuelto con sus tres decisiones y con el retazo, que es la mitad que nadie modela. Y el conteo por peso
está ahí porque **es como se cuenta de verdad una gaveta de tornillos**, no como un extra.

**Reserva 1 · La estacionalidad, otra vez, y aquí es peor que en `abarrotes`.** Una ferretería tiene un
año con forma muy marcada: la temporada de lluvias dispara impermeabilizante y plomería; diciembre y
enero son de remodelación; el arranque de una obra grande cerca cambia la demanda de una colonia entera
por seis meses. **La sugerencia de pedido de esta carpeta usa 90 días de venta y no sabe nada de eso.**
Alguien con veinte años en el giro leería la sección de compras y diría *"le falta la temporada y le
falta la obra de enfrente"*. Queda anotado y no resuelto — es la misma reserva que dejó `abarrotes`, lo
que sugiere que **es un hueco del arquetipo A1, no de un modelo**, y conviene resolverlo una vez.

**Reserva 2 · La relación con el proveedor grande está descrita desde afuera.** Las metas de compra, los
descuentos por volumen escalonado que negocia el distribuidor, los apoyos por exhibición, las promociones
de temporada de Truper, el precio especial por pedido consolidado: todo eso es una parte real de la
economía de una ferretería y aquí aparece sólo como contexto. Un sistema que supiera *"te faltan $8,000
para el siguiente escalón de descuento"* sería muy valioso y no está. **Es honesto decir que no lo
investigamos lo suficiente como para modelarlo.**

**Reserva 3 · No se modeló la venta de material de construcción pesado con flete.** El cemento, la
varilla, la arena y el tabique se venden por camión, se cobran con flete, a veces se entregan directo de
la planta a la obra sin pasar por la ferretería, y se cotizan con precio de obra. Esta carpeta los trata
como un producto más de la bodega. **Funciona para La Broca, que vende poco de eso**, y no funcionaría
para una ferretería que viva del material. Se declara a propósito como el límite de este modelo y como
el delta que tiene que documentar `materiales-construccion`.

### P2 · ¿Da control total?

**No todavía, y los huecos están con nombre y apellido.**

Lo que **sí** puede contestar Beto con esta documentación implementada: cuánto vendí hoy y contra qué;
cuánto gané de verdad, por línea y contra el objetivo de esa línea; **cuánto salió hoy sin cobrarse y
quién firmó**; quién me debe, desde cuándo y de qué obra; **cuánto dinero tengo dormido y en qué
líneas**; qué material se cortó y cuánta merma dejó; quién vende la solución completa y quién sólo
despacha; cuánto debo yo y qué vence esta semana; si la caja cuadró **y de dónde salió el esperado**;
qué garantías tengo detenidas y desde cuándo.

Lo que **no** puede contestar, sin maquillaje:

1. **"¿Quién me está robando?"** — **Y aquí la respuesta es más floja que en `abarrotes`, no más
   fuerte.** El sistema da esperado contra contado por producto, pero **con 6,000 claves la primera
   vuelta de conteo tarda tres meses**, y mientras tanto el indicador cubre una fracción del catálogo. Y
   hay algo peor, y está escrito en `03-INVENTARIO.md` §7.2: **mientras las remisiones se capturen tarde
   y la merma de corte no se registre, el ruido tapa la señal**. Por eso el indicador de diferencia de
   conteo **se decidió NO poner en el dashboard** — es la decisión más incómoda de esta carpeta y
   preferimos un hueco declarado a un número que miente.
2. **"¿Cuánto de mi cartera voy a recuperar?"** — Hay saldo, antigüedad, obras e incobrables declarados.
   **No hay tasa de recuperación histórica ni predicción.** Con ciclos de cobro de 60 a 120 días en el
   sector construcción, ése es un número que valdría mucho y no está.
3. **"¿Me conviene este contratista?"** — No hay rentabilidad por cliente que cruce **margen, plazo real
   de pago y costo financiero del crédito**. Un contratista que compra mucho al 14% de margen y paga a
   90 días puede ser peor negocio que un particular que compra poco de contado, y **el sistema no lo
   sabe decir**. Es el hueco de análisis más importante que queda abierto.
4. **"¿Qué venta perdí?"** — Se registra la cotización perdida con su motivo, que es más de lo que tiene
   `abarrotes`. Pero **la venta perdida en el mostrador —"no hay", "no sé qué es"— no deja rastro**, y es
   el dolor 3. Se podría capturar con un botón de "no lo tenía" en el estado de cero resultados; **se
   consideró y no se documentó como función**, porque un botón que hay que apretar con fila nunca se
   aprieta. **Queda como pregunta abierta, no como decisión tomada.**
5. **"¿Cuánto me cuesta el flete?"** — Hay una línea de ingreso por flete en el corte. No hay costo de
   flete —gasolina, el ayudante, la camioneta— contra ese ingreso. El flete gratis arriba de $2,000
   puede estar costando dinero y no se sabe.

### P3 · ¿Parece hecho a la medida?

**Sí, y se nota en cosas que sólo aparecen cuando alguien estuvo en un mostrador de ferretería.**

La medida antes que el nombre en la tabla de resultados, porque el nombre es el mismo en las cinco
filas. La columna **"Dónde"**, que es lo que hace útil al empleado nuevo desde el primer día. El aviso de
*"hay 37 m abiertos en el rollo R-114, ¿cortas de ahí?"* antes de abrir uno nuevo. La merma de corte
propuesta con el valor típico del material en vez de un campo vacío. El costo del desperdicio mostrado
**en pesos** y no en metros, porque 6.80 m suenan a nada y $61.20 suenan a algo. La conversión pulgada ↔
milímetro en vivo mientras se captura. La lista de autorizados con tope por persona, porque un albañil
puede llevarse clavos y no un tinaco. El renglón del corte con el ⚠ de *"NO AUTORIZADO"* la misma noche
y no en 45 días. El botón `[+]` de equivalentes puesto en el resultado de búsqueda y no en una pantalla
de administración, porque si hay que ir a buscarlo no se captura nunca. La tolerancia del 8% que evita
que cada conteo por peso produzca un ajuste fantasma. Y **el hecho de que se apaguen el IEPS, la
caducidad, el casco y las recargas**, que son cuatro pantallas menos que un sistema genérico enseñaría.

**Lo que todavía delataría al sistema como genérico, y son dos cosas:**

**Primero, lo mismo que en `abarrotes`: F-017 sigue sin construirse.** Y aquí ya no es una advertencia,
es un hecho consumado: **`ferreteria` es el segundo modelo que reutiliza la pantalla de mostrador**, y en
el momento en que aparezca la palabra "artículo" donde debe decir "partida", o "producto" donde debe
decir "material", se va a notar. `abarrotes` dejó escrito que este modelo iba a forzar la construcción de
F-017. **La fuerza.**

**Segundo, y es más grave: `abarrotes` advirtió exactamente esto y hay que reconocerlo.** Su P3 dice
—textualmente— que *"la pantalla de Cobrar de este modelo es la misma pantalla para los dieciocho"* y
que si su estructura queda pensada sólo para abarrotes, `ferreteria` *"va a tener que pelearse con un
diseño hecho para escanear"*. **Tenía razón.** La solución que toma esta carpeta es **no pelearse: la
pantalla 1 de `ferreteria` no es la pantalla de Cobrar de `abarrotes` reacomodada, es otra pantalla** que
comparte los átomos, el capturador de código, el motor de precios y el cobro, pero **no la estructura**.
Eso está permitido por D-03 y es lo correcto. Pero tiene un costo que hay que decir: **son dos pantallas
de mostrador que mantener dentro del mismo arquetipo A1**, y cuando llegue `farmacia` habrá que decidir
a cuál de las dos se parece más —se parece a `abarrotes`— en lugar de inventar una tercera.

### P4 · ¿Se distingue de sus vecinos? ★

**Ésta es la pregunta crítica de esta carpeta, porque `abarrotes` la dejó planteada por escrito. La
respuesta es sí, son dos modelos, y aquí está la prueba y también lo que la debilita.**

#### 4.1 · Contra `abarrotes` · el vecino que planteó el riesgo

`abarrotes` exigió cinco deltas para aceptar que `ferreteria` no es su copia. Los cinco están, y
**dónde**:

| Lo que `abarrotes` exigió | Dónde está resuelto | ¿Suficiente? |
|---|---|---|
| 1 · La mitad del catálogo no tiene código; la búsqueda por nombre y medida pasa a ser la mitad del tráfico | `01-FUNCIONES.md` §3.3, §3.7, §3.24 · `04-INTERFAZ.md` PANTALLA 1 · F-059, F-060, F-061 | **Sí, y de sobra.** Es el eje del modelo y cambia la pantalla de inicio entera |
| 2 · El corte de material (F-145) con merma de corte | `01-FUNCIONES.md` §3.18 · `03-INVENTARIO.md` §3.3 · `04-INTERFAZ.md` PANTALLA 3 · F-145, F-150 | **Sí**, y con más de lo que pidió: el retazo y el rollo abierto |
| 3 · La compatibilidad y la medida como atributo de búsqueda | `01-FUNCIONES.md` §3.9 · F-059 + reclasificación de F-034 | **Sí** |
| 4 · Ticket más grande, ritmo sostenido, densidad y dashboard distintos | `00-FICHA-Y-EJES.md` §5 eje F · `04-INTERFAZ.md` §4.4 · ocho indicadores, seis distintos | **Sí** |
| 5 · Venta a obra y contratista con crédito formal, no fiado de libreta | `02-DINERO-Y-CAJA.md` §6 · F-606, F-610…F-617, F-638, F-639 | **Sí**, y es el dolor 1 del modelo |

**La prueba falsable, que es lo que pide `04-SISTEMA-DE-DISENO.md` §7 —la prueba del vecino—:** pon las
dos pantallas de inicio una al lado de la otra.

| | `abarrotes` · Cobrar | `ferreteria` · Mostrador |
|---|---|---|
| Lo más grande de la pantalla | **El total**, en la tipografía mayor de la aplicación | **El campo de búsqueda y la tabla de resultados** |
| El foco al entrar | Capturando el lector | **En el buscador, con los ocho grupos de línea debajo** |
| Estado inicial | Lista vacía: *"Escanea el primer producto"* | **Ocho grupos y las listas de trabajo. No arranca vacío** |
| Columnas de la tabla principal | Cantidad · producto · precio · importe | **Medida · acabado · marca · precio · existencia · DÓNDE** |
| Qué hay arriba a la derecha | Nada. Sólo el total | **El cliente, su saldo, su obra y quién recoge** |
| Qué se hace con una tecla | Cobrar (F12) | **Buscar (escribir)** |
| Cuánto dura una operación | 30 segundos | **3 a 8 minutos** |
| Qué se imprime al final | Un ticket | **Ticket, remisión firmada o cotización** |

**Un extraño las distingue en dos segundos.** Y lo más importante: **no se distinguen por decoración,
se distinguen porque el trabajo es otro.**

#### 4.2 · Lo que debilita la respuesta, y hay que decirlo

**Tres cosas.**

**Primera: el 70% del árbol va marcado `[=]`.** Detrás de las dos pantallas hay el mismo motor:
presentaciones, ledger, caja, arqueo, conteo, cobro, costo promedio, alta rápida, redondeo. **Si alguien
midiera el parecido por líneas de código compartidas en vez de por pantallas, diría que son el mismo
modelo.** La respuesta honesta es que **esa es exactamente la promesa de D-02**: diez arquetipos, no 78
plantillas. Compartir el 70% del motor y diferenciarse en la estructura **es el diseño funcionando**, no
el diseño fallando. Pero conviene tenerlo escrito, porque en la segunda pasada alguien va a mirar los
IDs y le va a parecer duplicación.

**Segunda: la frontera con `materiales-construccion` es más delgada que la que había con `abarrotes`.**
Ésta es la advertencia que esta carpeta le deja a la siguiente, igual que `abarrotes` se la dejó a ésta.
`materiales-construccion` es A1 + A5 + A9 y comparte con `ferreteria` **casi todo lo que aquí se declaró
como propio**: corte de material, crédito a contratista con obra, atributos de medida, cotización,
doble unidad por peso. **Lo que de verdad los separa, y hay que exigirlo cuando se escriba:**

1. **El flete y la logística son el negocio**, no un servicio. Camión, viaje, tonelaje, entrega directa
   de planta a obra sin pasar por el patio. Eso es A9 y `ferreteria` no lo tiene.
2. **La venta por tonelada y por metro cúbico, con báscula de camión**, que es otra escala de F-151.
3. **El granel que no se cuenta: arena, grava, tepetate.** El inventario es un montón que se mide por
   volumen y se merma con la lluvia. **Es una variante de inventario que no existe en el catálogo.**
4. **El precio que se cotiza por obra completa**, con vigencia corta porque el acero y el cemento se
   mueven semanalmente.
5. **El ticket es de $20,000 a $200,000**, y eso vuelve a cambiar el ritmo, el crédito y el corte.

**Si `materiales-construccion` se escribe sin esos cinco, es esta carpeta con otro nombre.**

**Tercera, y es la más incómoda: `refaccionaria`.** Nadie la ha señalado todavía y **el parecido es
alto**: catálogo por atributos, medio catálogo sin código, búsqueda por medida y equivalencia, crédito a
talleres, mostrador que asesora, cola larga de miles de claves que no rotan. **Se distinguen por dos
cosas y sólo por dos:** el inventario V5 con número de serie, y la **compatibilidad por vehículo**
(F-034 variante vehicular), que es un árbol cerrado año-marca-modelo y cambia por completo la búsqueda.
**Son dos diferencias reales y bastan**, pero son menos de las cinco que separan a `ferreteria` de
`abarrotes`, y conviene revisarlo en la segunda pasada antes de que `refaccionaria` se escriba
copiando esta carpeta.

#### 4.3 · La respuesta, en una frase

**`abarrotes` y `ferreteria` son dos modelos porque cuatro de los seis ejes de diseño toman valor
distinto y porque las dos pantallas de inicio no se parecen en nada.** Comparten el motor y eso es una
virtud, no un defecto. **Lo que hay que vigilar no es la frontera entre ellos dos —está clara— sino las
dos fronteras que esta carpeta abre hacia abajo: `materiales-construccion` y `refaccionaria`.**

---

## 6 · PENDIENTES QUE ESTA CARPETA DEJA ABIERTOS

Para que nadie tenga que deducirlos leyendo los siete archivos.

1. **Añadir al catálogo las diez funciones nuevas** de `01-FUNCIONES.md` §6 — F-059, F-060, F-061,
   F-150, F-151, F-152, F-153, F-258, F-638, F-639 — **y las tres reclasificaciones**: F-034 de `[+]` a
   `[≠]`, F-121 de `[+]` a `[≠]`, y la tercera variante mixta de F-029. **Junto con las diez de
   `abarrotes` y antes de construir nada.**
2. **F-017 (diccionario de vocabulario) ya no es una recomendación, es un bloqueo.** Éste es el segundo
   modelo que reutiliza la pantalla de mostrador y el vocabulario escrito a mano se rompe aquí. Ver P3.
3. **P-02 (CFDI) deja de ser abierta para este modelo.** Un ferretero sin facturación en el punto de
   venta no compra. Ver `05-DATOS-Y-BACKEND.md` §10.
4. **La migración 095 no se aplica sin P-04**, y plantea la pregunta del **doble movimiento de plantilla
   de La Broca** —`operativo` → `tienda` → `ferreteria`—. Recomendación: saltarse el paso intermedio si
   P-04 se resuelve con una sola ventana.
5. **El modo despacho+caja (F-235 en variante) hay que decidirlo.** Es la única pieza de este modelo que
   se puede posponer sin romper nada, y se ahorra una tabla y dos estados.
6. **La estacionalidad es un hueco del arquetipo A1, no de un modelo.** `abarrotes` y `ferreteria` la
   dejaron abierta las dos. **Resolverla una vez, en el arquetipo.**
7. **La rentabilidad por cliente cruzando margen, plazo real y costo financiero** no está. Es el hueco
   de análisis más importante de P2.
8. **La captura de la venta perdida en mostrador** se consideró y **no se documentó como función**,
   porque un botón que hay que apretar con fila no se aprieta. **Queda como pregunta abierta**: puede
   haber una forma pasiva de capturarla —búsquedas con cero resultados que no terminaron en alta— y esa
   sí vale la pena explorarla.
9. **El indicador de diferencia de conteo NO está en el dashboard**, a propósito, hasta que las
   remisiones y la merma de corte se capturen bien. **Cuando eso ocurra, hay que subirlo.** Está
   declarado como deuda, no como omisión.
10. **En la segunda pasada, leer `ferreteria` junto a `materiales-construccion` y junto a
    `refaccionaria`**, que son las dos fronteras que esta carpeta abre. La frontera con `abarrotes` se
    considera cerrada y demostrada en P4.
11. **Dato que no se pudo verificar en la investigación:** el precio mensual exacto de Wansoft y de
    Ferrepunto para ferretería, y la lista de precios vigente de Aspel SAE 2026. Se citaron los que sí
    están publicados —SICAR: licencia de servidor **$4,940** pago único, terminal adicional **$1,320**,
    lector desde **$1,200**, impresora térmica desde **$2,497**— y se evitó inventar los otros. Si
    alguien los necesita para un argumento comercial, **hay que cotizarlos antes de usarlos**.
12. **Las cifras de operación de La Broca —$380,000 de venta mensual, $700,000 de inventario a costo,
    31% dormido— son una MODELACIÓN coherente con los rangos publicados, no un dato medido.** Los rangos
    sí están investigados: ticket promedio ~$500, 25 a 60 ventas diarias, 3,000 a 8,000 SKU, márgenes por
    línea del 14% al 50%, rotación de 3 a 5 vueltas al año. **Cuando el sistema esté puesto en La Broca,
    hay que sustituirlas por las reales** y revisar si alguna decisión de esta carpeta cambia.
