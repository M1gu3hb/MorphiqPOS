# FILE-MAP · Restaurante de mesa

**Modelo:** `restaurante` · **Familia:** 01 Alimentos y bebidas · **Arquetipo:** A2
**Ruta:** `fase-2/modelos/01-alimentos/restaurante/`
**Estado:** ✅ **terminado** (documentación) · el código tiene ocho funciones pendientes
**Cliente vivo:** Restaurante MH

---

## 1 · ÍNDICE DE LA CARPETA

| Archivo | Qué hay dentro |
|---|---|
| `00-FICHA-Y-EJES.md` | Qué es el negocio y cómo gana dinero, el perfil real del dueño mexicano y lo que paga hoy, el día completo hora por hora, los seis ejes del mapa y los seis de diseño con su razón, arquetipo y deltas, lo que **no** necesita, y los tres dolores que tiene que resolver el sistema para venderse |
| `01-FUNCIONES.md` | El árbol completo con IDs canónicos y marcas, las `[=]` que nacen aquí y heredan los demás A2, las cinco `[≠]` con su tabla comparativa contra `cafeteria`, las `[+]` del arquetipo, las ocho funciones que faltan con su costo operativo, **seis funciones nuevas propuestas para el catálogo**, el grafo de dependencias y el orden de construcción en cuatro tandas |
| `02-DINERO-Y-CAJA.md` | Qué cuenta como venta y qué no, IVA extraído al 16% y por qué, descuentos y su hueco de control, las propinas completas (ley, los tres momentos, el desglose exacto, la liquidación y el reparto por puntos pendiente), métodos de pago reales, por qué no hay anticipos ni crédito ni comisiones, la caja del restaurante con sus nueve movimientos, **el PDF del corte descrito sección por sección en orden**, y los cinco descuadres típicos del giro |
| `03-INVENTARIO.md` | Por qué la variante V6 y por qué no las otras nueve, las tres unidades base y sus conversiones, qué se descuenta y **por qué al cobrar y no al comandar**, entradas y salidas, cómo se toma el inventario físico en este giro, las cuatro mermas propias, qué alertas importan y cuáles serían ruido, y los tres errores que más comete este negocio |
| `04-INTERFAZ.md` | Vocabulario del giro con género y plural, la navegación por rol y su razón, **catorce pantallas documentadas una por una** con layout en PC, tablet y teléfono, estados, atajos y qué no va en cada una, el dashboard completo con la decisión que dispara cada indicador, multi-sucursal, y las condiciones reales de operación con su consecuencia concreta |
| `05-DATOS-Y-BACKEND.md` | Siete tablas y dos vistas nuevas con campos y restricciones, las diecisiete extensiones a entidades existentes, doce reglas de integridad que garantiza la base, catorce comandos con entrada y roles, las entradas del puente con `rolesLectura`, trece rutas de API, **las migraciones 060 a 069 escritas y no aplicadas**, las dependencias externas con la decisión pendiente de impresión, y la lista de lo que se reutiliza tal cual con su ruta |
| `FILE-MAP.md` | Este archivo. Índice, destino del código, qué hereda de aquí el resto del sistema, y las cuatro preguntas de cierre |

---

## 2 · DÓNDE VIVIRÁ EL CÓDIGO

Rutas exactas dentro del monorepo cuando se acople. **Acoplar es mover carpetas y aplicar
migraciones, nunca reescribir** (D-05).

### 2.1 · Lógica de aplicación

```
packages/app/src/restaurante/
├── division.ts                    F-321 · dividirCuenta
├── division.test.ts
├── union-mesas.ts                 F-302 · unirMesas, separarMesas
├── union-mesas.test.ts
├── cambio-mesa.ts                 F-303 · cambiarMesa
├── cambio-mesa.test.ts
├── anulacion-linea.ts             F-324 · anularLinea
├── anulacion-linea.test.ts
├── marcha.ts                      F-323 · marcharTiempo
├── marcha.test.ts
├── espera.ts                      F-306 · registrarEspera, sentarEspera
├── espera.test.ts
├── impresion.ts                   F-318 · cola de impresión de comanda
├── impresion.test.ts
├── ocupacion.ts                   F-305 · lectura de la vista ocupacion_mesas
├── tiempos.ts                     F-315 · lectura de tiempos_preparacion
│
├── mesas-escrituras.ts            ← YA EXISTE. Se extiende
├── transiciones.ts                ← YA EXISTE. Sella eventos_mesa
├── comandas.ts                    ← YA EXISTE
├── preparacion-escrituras.ts      ← YA EXISTE
└── propagacion.ts                 ← YA EXISTE. Intacto

packages/app/src/propinas/
├── esquemas.ts                    F-242 · alta y vigencia de esquemas
├── reparto-puntos.ts              F-242 · cálculo del reparto
├── reparto-puntos.test.ts
├── desglose.ts                    ← YA EXISTE. INTACTO
├── folio.ts · rango.ts            ← YA EXISTEN. Intactos
└── liquidadas.ts                  ← YA EXISTE. Se extiende con beneficiarios

packages/app/src/inventario/
└── consumo-interno.ts             F-261 · registrarConsumoInterno

packages/app/src/venta/
└── autorizacion-descuento.ts      F-205
```

### 2.2 · Puente

```
packages/app/src/puente/mapa.ts    ← se AMPLÍA con diez entidades:
    MovimientoCuenta · UnionMesa · EventoMesa · EsperaMesa ·
    ImpresionComanda · EsquemaPropina · BeneficiarioPropina ·
    ConsumoInterno · OcupacionMesa · TiempoPreparacion
  … y con los campos nuevos de Venta, DetalleVenta,
    PedidoPreparacionItem y EstacionPreparacion
```

### 2.3 · Rutas

```
apps/web/app/api/restaurante/dividir-cuenta/route.ts
apps/web/app/api/restaurante/unir-mesas/route.ts
apps/web/app/api/restaurante/separar-mesas/route.ts
apps/web/app/api/restaurante/cambiar-mesa/route.ts
apps/web/app/api/restaurante/anular-linea/route.ts
apps/web/app/api/restaurante/marchar-tiempo/route.ts
apps/web/app/api/restaurante/espera/registrar/route.ts
apps/web/app/api/restaurante/espera/sentar/route.ts
apps/web/app/api/restaurante/imprimir-comanda/route.ts
apps/web/app/api/restaurante/impresion/resultado/route.ts
apps/web/app/api/propinas/esquema/route.ts
apps/web/app/api/inventario/consumo-interno/route.ts
apps/web/app/api/venta/autorizar-descuento/route.ts
```

### 2.4 · Migraciones

```
packages/data/src/migraciones/sql/
├── 070_movimientos_cuenta.sql
├── 071_union_y_cambio_de_mesa.sql
├── 072_eventos_mesa.sql
├── 073_lista_espera.sql
├── 074_tiempos_y_marcha.sql
├── 075_impresion_comanda.sql
├── 076_esquemas_propina.sql
├── 077_consumos_internos.sql
├── 078_tope_descuento.sql
└── 066_plantillas_semilla.sql     ← D-01. Toca datos vivos. Aplicada en la Fase 3 (P-04 resuelta)
```

### 2.5 · Interfaz

Nada se toca en `apps/web/heredado/` mientras Codex siga en la Fase 1. Lo que después habrá que
modificar, y es poco:

| Archivo | Qué cambia |
|---|---|
| `apps/web/heredado/pages/Mesero.jsx` | Acciones de unir, cambiar de mesa y marchar tiempo |
| `apps/web/heredado/pages/Caja.jsx` | Diálogo de dividir cuenta |
| `apps/web/heredado/pages/Cocina.jsx` | Umbrales de color por tiempo y botón de reimprimir |
| `apps/web/heredado/components/tickets/CorteTicket.jsx` | Dos secciones: reparto por puntos y consumos internos |
| `apps/web/heredado/components/propinas/LiquidarPropinasDialog.jsx` | Selector de esquema y vista previa del reparto |

Componentes nuevos, en `packages/ui` o en la carpeta heredada según dónde acabe la migración de
pantallas:

```
DividirCuentaDialog · UnirMesasDialog · CambiarMesaDialog ·
AnularLineaDialog · ListaEsperaPanel · MarchaTiemposControl ·
EsquemaPropinaEditor · ConsumoInternoDialog
```

---

## 3 · QUÉ ESTÁ YA CONSTRUIDO, Y DÓNDE

Este modelo es el **origen** del arquetipo A2 y de buena parte del núcleo. No reutiliza de nadie:
todos reutilizan de aquí. Lo que sigue es lo que **ya existe y funciona**, y que por lo tanto
`cafeteria`, `bar-cantina`, `taqueria`, `comida-rapida`, `pizzeria`, `jugueria` y
`cerveceria-artesanal` **no vuelven a construir**.

| Bloque | Funciones | Dónde vive hoy |
|---|---|---|
| Identidad y acceso | F-001…F-006 | `packages/app/src/identidad/` · `heredado/pages/POSLogin.jsx` |
| Salón y mesas | F-300, F-301, F-304 | `packages/app/src/restaurante/mesas-escrituras.ts` · `heredado/pages/Mesero.jsx` · `heredado/components/mesas/` |
| Comandas y preparación | F-310…F-314, F-316, F-317 | `packages/app/src/restaurante/comandas.ts` · `heredado/pages/Cocina.jsx` · `heredado/components/cocina/` |
| Cuenta abierta y precuenta | F-320, F-322 | `packages/app/src/venta/` · `heredado/components/tickets/PreCuentaTicket.jsx` |
| Cobro y métodos de pago | F-210…F-213, F-220, F-223, F-225 | `packages/app/src/venta/pagos.ts` · `heredado/components/pos/PaymentModal.jsx` |
| Caja, arqueo y corte | F-230…F-234, F-236 | `packages/app/src/caja/` · `heredado/pages/Caja.jsx` · `heredado/components/caja/` |
| **El PDF del corte** | F-234, F-057 | `heredado/components/tickets/CorteTicket.jsx` · `heredado/lib/pdfDownload.js` |
| **Propinas completas** | F-240, F-241, F-245, F-246 | `packages/app/src/propinas/` · `heredado/utils/tipsUtils.js` · `heredado/components/propinas/` |
| Inventario V6 | F-100…F-102, F-104, F-107, F-108, F-115, F-128…F-132 | `packages/app/src/inventario/` · `heredado/pages/Inventario.jsx`, `Recetas.jsx` |
| Compras y proveedores | F-631…F-634 | `packages/app/src/compras/` · `heredado/pages/Compras.jsx` |
| Gastos | F-250, F-251 | `heredado/components/compras/RegistrarGastoDialog.jsx` |
| Catálogo e importación | F-020…F-022, F-027, F-028, F-032 | `packages/app/src/catalogo/` · `heredado/pages/Productos.jsx` · `heredado/components/datos/` |
| Portal QR V1 | F-920, F-921, F-952 | `packages/app/src/portal/` · `heredado/pages/PortalCliente.jsx`, `PortalQR.jsx` |
| Registros y dashboard | F-050…F-053, F-056, F-057 | `heredado/pages/Registros.jsx`, `Dashboard.jsx` |

**La lectura que importa:** de las 232 funciones del catálogo, este modelo tiene **54 construidas y
9 parciales**. Y de esas 54, la mayoría son `[=]`: se construyeron una vez aquí y sirven a los 78.

---

## 3.ter · LOS COMPONENTES NUEVOS, Y EL CAMBIO DE UNA LÍNEA

Escritos AL LADO de los viejos, como manda D-09: viven en `apps/web/src/restaurante/`, que es
donde el verificador de primitivas sí vigila los literales de color y tamaño —`heredado/` está
exento y por eso lo nuevo no va ahí—.

| Componente | Función | Ruta |
|---|---|---|
| `DividirCuentaDialog.tsx` | F-321 | `apps/web/src/restaurante/DividirCuentaDialog.tsx` |
| `AnularLineaDialog.tsx` | F-324 | `apps/web/src/restaurante/AnularLineaDialog.tsx` |

**El cambio exacto de UNA LÍNEA que hará falta al acoplar**, cuando D-09 quede derogada:

```
heredado/components/pos/PaymentModal.jsx      ← el diálogo de cobro real
  + import { DividirCuentaDialog } from '~/restaurante/DividirCuentaDialog';
    …y montarlo detrás de un botón «Dividir» que hoy no existe en ese modal.

heredado/components/mesero/MesaActivaView.jsx ← la comanda de la mesa
  + import { AnularLineaDialog } from '~/restaurante/AnularLineaDialog';
    …y montarlo detrás del gesto de quitar una línea.
```

Los dos archivos se comprobaron en el disco: `PaymentModal.jsx` es el modal de cobro —no hay
ningún `CobroDialog.jsx`— y `MesaActivaView.jsx` es la pantalla que pinta la comanda.

**Ninguno de los dos se abrió en el navegador**, y no se puede: los dos llaman a rutas cuyos
comandos leen tablas de las migraciones `070`–`077`, que la Fase 2 escribe y no aplica.

---

## 3.quater · LO QUE LAS ETAPAS 10-13 AÑADIERON

Escrito con el código delante. `verify:cobertura` sale en 0 para este modelo:
8/8 funciones, 13/13 rutas, 13/13 pantallas, 10/10 migraciones.

| Pieza | Dónde quedó | Prueba |
|---|---|---|
| **PANTALLA · portal-del-comensal** | `apps/web/src/restaurante/PortalDelComensal.tsx` · página en `apps/web/app/(modelos)/restaurante/portal-del-comensal/page.tsx` | la lógica pura está exportada y es la que se prueba |

La pantalla se pinta con UNA petición al portal por token, que ya existía. No se
añadió ninguna ruta: se añadió el consumidor. Es la única pantalla de todo el
sistema que se abre SIN sesión, y por eso la respuesta del token trae ya
resuelto lo que puede ver: el comensal no consulta, le contestan.

### El cambio de UNA LÍNEA que hará falta en `heredado/` al acoplar

`heredado/pages/PortalQR.jsx` deja de resolver su propio estado y pasa a montar
`PortalDelComensal` con el token de la URL. Es una línea —el `render`— porque
todo lo demás ya vive en el componente nuevo.

---

## 3.quinquies · LO QUE EL ACOPLE (FASE 3) CAMBIÓ

Nada de este modelo cambió de sitio. Lo único suyo que el acople toca es el sustantivo: la pantalla
`portal-del-comensal` dice «la mesa 5» leyendo el vocabulario del giro, así que en una estética que
herede este portal dirá «la estación 5» sin tocar el componente.

### Lo que el acople le añadió a este modelo

| Pieza | Dónde quedó |
|---|---|
| **F-017 · el vocabulario, enganchado** | `apps/web/app/api/configuracion/vocabulario/route.ts` (el `GET` que faltaba) · `apps/web/src/servidor/vocabulario.ts` · `apps/web/src/cliente/vocabulario.tsx` · inyectado en `apps/web/app/(modelos)/layout.tsx` **y** en `apps/web/app/(interno)/layout.tsx` |
| **El menú, traducido** | `apps/web/heredado/lib/permissions.js` (`entidad` por entrada + `etiquetaDeNavegacion`) · `apps/web/heredado/components/common/Sidebar.jsx` |
| **La plantilla, en el código** | `packages/contracts/src/comandos/ambito.ts` (`PAQUETES` = `tienda·cafeteria·restaurante`) · `packages/contracts/src/comandos/plantillas.ts` (`plantillaDeOrganizacion`) · los cinco sitios que leen `organizaciones.paquete` normalizan con ella |
| **La plantilla, en la PANTALLA** | `apps/web/heredado/lib/packageConfig.js` (`normalizarPlantilla`: las tres de D-01 son canónicas, los tres nombres viejos son alias, y lo irreconocible cae en `tienda`) · `apps/web/src/cliente/package-config.ts` delega en ella · `packages/app/src/puente/configuracion.ts` sirve `paquete_modo` ya normalizado · el contrato que impide que las dos listas de módulos divergan está en `apps/web/src/cliente/package-config.test.ts` |

**Y ya están APLICADAS.** Las migraciones de este modelo entraron en la tanda del acople el 17 de
septiembre de 2026: 72 en una sola transacción, con respaldo comprobado y dos ensayos delante. El
ledger dice 97 migraciones, última la `165`. El procedimiento —y la lección de por qué la sesión
anterior se creyó bloqueada— está en `docs/fase-2/A3-COMO-APLICAR.md`.

---

## 4 · LAS CUATRO PREGUNTAS DE CIERRE

Contestadas con honestidad, incluido lo que quedó flojo.

### P1 · ¿Es fiel al negocio?

**Sí, con una reserva.**

Lo que sostiene el sí: el día completo está escrito con los dos picos reales de México —la comida
de 14:00 a 16:00 y la cena de 20:00 a 22:00, no el horario de mediodía de los folletos
internacionales—, con el corte de turno de las 17:00, que es donde de verdad se parte el día de un
restaurante mexicano, y con la junta de las 11:30, que no aparece en ningún manual y existe en
todos los locales. Las mermas están separadas en las cuatro que un cocinero distingue, y la merma
de limpieza está donde va: dentro de la receta, por insumo, no como un porcentaje global. La
propina se trata como lo que la ley dice que es. Los precios de la competencia son los reales de
2026, no estimaciones.

**La reserva, y es real:** no se documentó la operación de **barra** como un mundo propio. Un
restaurante con barra fuerte tiene inventario de botella abierta, mermas de derrame que se miden
en onzas, y un ritmo de comandas distinto al de cocina. Aquí la barra aparece sólo como una
estación de preparación más. Alguien que lleva veinte años en un restaurante con bar diría "esto
lo escribió alguien que conoce el comedor mejor que la barra", y tendría razón. Se resuelve
parcialmente en `bar-cantina`, pero este modelo debería tener al menos la merma de barra
documentada con su propio flujo, y hoy sólo está nombrada.

### P2 · ¿Da control total?

**Casi. Y los huecos están señalados con nombre y apellido, no escondidos.**

Lo que sí puede contestar el dueño hoy: cuánto vendí (por periodo, por producto, por método de
pago), cuánto gané (utilidad bruta, margen, utilidad neta estimada), qué me falta (alertas de
mínimo y crítico), qué debí consumir de insumo (la sección de ingredientes consumidos del corte),
cuánto le toca a cada mesero de propina, si la caja cuadró, quién canceló qué y por qué, y cuánto
gasté y en qué categoría.

Lo que **no** puede contestar, dicho sin maquillaje:

1. **"¿Cuántas veces rota una mesa?"** — el número del que depende su negocio entero, y no existe.
   Falta F-305. Es el hueco más grave del modelo en términos de gestión, y por eso está dicho
   también en el dashboard: se reconoce que falta en vez de inventar un sustituto.
2. **"¿Quién me está robando?"** — el sistema da el consumo teórico pero no tiene el conteo físico
   contra el cual compararlo (falta F-106) ni el reporte de diferencia acumulada (falta F-133).
   Enseña el síntoma, no el diagnóstico.
3. **"¿Quién está descontando de más?"** — no hay tope por rol ni autorización con PIN (falta
   F-205). **Éste es el hueco de control más serio que tiene hoy el modelo**, porque el descuento
   fantasma es invisible al arqueo: la caja cuadra perfecto y el dinero no está.
4. **"¿Cuánto tarda cada platillo?"** — F-315 pendiente. Sin eso no se puede prometer un tiempo al
   comensal ni detectar una estación atorada.

Cuatro de esas cinco cosas están en el orden de construcción de `01-FUNCIONES.md` §8. Que estén
señaladas no las arregla, pero al menos nadie va a creer que el sistema las resuelve.

### P3 · ¿Parece hecho a la medida?

**Sí.** Es el modelo más maduro del sistema y se nota en cosas que sólo aparecen cuando alguien
estuvo en un restaurante.

El mapa del salón con la forma y el tamaño reales de cada mesa, no una lista. Los diez estados de
mesa, cada uno hablándole a una persona distinta. La alerta de alergia en su esquina propia,
imposible de colapsar, porque un error ahí no es un descuadre. La separación física entre "pedido
actual" y "agregar al pedido", que evita el error más caro del turno. La precuenta con su código
para caja, que no se llama ticket porque no lo es. El desglose exacto de propina por método, con
el botón de cobrar deshabilitado hasta que sume — fricción deliberada, la única de la pantalla de
cobro. El bloqueo del cierre con mesas abiertas, verificado dos veces para cerrar la carrera. El
PDF que se descarga solo porque el dueño lo va a leer en el coche.

**Lo que todavía delataría al sistema como genérico:** el vocabulario está escrito a mano en los
componentes en vez de salir de un diccionario (F-017 pendiente). Hoy no se nota, porque este es
*el* modelo de restaurante; se va a notar el día que `taqueria` reutilice estas pantallas y la
palabra "mesa" aparezca donde debería decir otra cosa. El día que eso pase, la culpa será de esta
carpeta por no haberlo resuelto primero.

### P4 · ¿Se distingue de sus vecinos?

**Sí, y por razones de negocio, no cosméticas.**

El vecino más cercano es **`cafeteria`** (A2 de mostrador). Un extraño las distinguiría viendo
sólo las pantallas, y en menos de cinco segundos:

| | `restaurante` | `cafeteria` |
|---|---|---|
| Pantalla de inicio del operador | **Mapa del salón** con mesas dibujadas | Catálogo de productos con carrito a la derecha |
| Pantalla de cocina | **Tres columnas** de comandas por estación | No existe |
| Quién cobra | El cajero, en otro momento y otra pantalla | La misma persona que atiende, en el acto |
| Documentos | **Dos**: precuenta y ticket | Uno: ticket |
| Propina | Tres momentos posibles, tres personas | Un momento, una persona |
| Corte | Lleva tabla de propinas **por mesero** | No la lleva |

El segundo vecino es **`bar-cantina`**, y aquí hay que ser honesto: hoy se parecen **demasiado**.
Los dos son A2 con mesas, comandas y cuenta abierta. Lo que de verdad los separa es el inventario
de botella abierta —una botella de 750 ml que se mide en mililitros servidos y cuya merma por
derrame es del 2 al 4%—, el precio por horario (happy hour, F-026), la restricción legal de venta
por horario (F-980) y la cuenta por consumo en barra sin mesa asignada. **Si `bar-cantina` se
documenta sin esos cuatro deltas, va a salir siendo este mismo modelo con otro nombre, y entonces
uno de los dos está mal.** Queda anotado aquí para la segunda pasada.

El tercero es **`comida-rapida`**, y ése no se confunde con nada: comparte la preparación (F-310…
F-319) y no tiene mesas ni cuenta abierta. Es A1 con un módulo prestado de A2, y se ve.

---

## 5 · PENDIENTES QUE ESTA CARPETA DEJA ABIERTOS

Para que nadie tenga que deducirlos leyendo los siete archivos.

1. **Añadir al catálogo las seis funciones propuestas** en `01-FUNCIONES.md` §6 — F-247, F-323,
   F-324, F-325, F-261, F-262 — antes de construir nada. Sin ID canónico se van a reinventar con
   otro nombre en `bar-cantina`.
2. **Decidir el camino de impresión de comanda** (agente local, impresora de red o `window.print`).
   La recomendación está en `05-DATOS-Y-BACKEND.md` §8 y la decisión la toma Miguel.
3. **No aplicar la migración 069** hasta que esté contestada la decisión pendiente **P-04**: es la
   única que toca datos de clientes que están operando.
4. **Documentar el flujo de barra** con su merma propia, o decidir explícitamente que vive
   completo en `bar-cantina`. Hoy está a medias, y así se dijo en P1.
5. **F-205 (tope y autorización de descuento) no es opcional.** Está fuera de las cuatro tandas del
   orden de construcción porque es transversal a los 78 modelos, pero en este giro es un hueco de
   control activo. Debe entrar con el arquetipo A1.
6. **En la segunda pasada, leer `restaurante` y `bar-cantina` uno junto al otro** y verificar que
   se distinguen de verdad. Es el riesgo de fusión más probable de toda la familia 01.
