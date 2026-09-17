# FILE-MAP · Cafetería de mostrador

**Modelo:** `cafeteria` · **Familia:** 01 Alimentos y bebidas · **Arquetipo:** A2 de mostrador
**Ruta:** `fase-2/modelos/01-alimentos/cafeteria/`
**Estado:** ✅ **terminado** (documentación) · el código tiene quince funciones pendientes
**Cliente vivo:** Café Jacaranda — hoy en la plantilla equivocada (`restaurante_pro`)

---

## 1 · ÍNDICE DE LA CARPETA

| Archivo | Qué hay dentro |
|---|---|
| `00-FICHA-Y-EJES.md` | Qué es el negocio y por qué cobra antes de que el producto exista, el perfil real de la dueña mexicana y lo que paga hoy, **el día completo con sus dos picos —la ráfaga de las 7:00 y el pico real de las 10:00—**, los seis ejes del mapa y los seis de diseño con su razón, el arquetipo A2 **restado**, **la respuesta a qué le falta a `operativo` para ser honestamente una `cafeteria`**, lo que este negocio no necesita, y los tres dolores |
| `01-FUNCIONES.md` | El árbol completo con IDs canónicos, las nueve `[=]` verificadas campo por campo contra `restaurante`, **nueve `[≠]` con su tabla comparativa de tres columnas**, las nueve `[+]` del modelo, las quince funciones que faltan con su costo operativo, **nueve funciones nuevas propuestas para el catálogo**, el grafo de dependencias y el orden de construcción en cuatro tandas |
| `02-DINERO-Y-CAJA.md` | Qué cuenta como venta y qué no —incluido el canje de sello, que no es venta ni descuento sino cancelación de un pasivo—, IVA extraído con el exento del grano en bolsa, descuentos con **tope en pesos y no en porcentaje**, las propinas completas (la ley, la segunda pantalla, el bote del turno, el reparto por horas), métodos de pago reales, **las dos comisiones que el negocio paga y que ningún POS enseña**, la caja con su fondo desglosado y su doble arqueo, **el PDF del corte descrito en dieciocho secciones en orden**, y los cinco descuadres típicos |
| `03-INVENTARIO.md` | Por qué V6 y por qué no las otras nueve, **el hueco del trigger de unidad base que deja `cafeteria` sin proteger**, las tres unidades base más la onza, **por qué descontar al cobrar aquí invierte el riesgo y para bien**, entradas y salidas, las cinco cadencias de conteo —la leche diaria—, las cinco mermas del giro con la de calibración que nadie registra, la frescura del grano, qué alertas importan medidas **en días y no en cantidad**, y los tres errores del negocio |
| `04-INTERFAZ.md` | Vocabulario con género y plural y **la regla de que la palabra "mesa" no aparece en ninguna pantalla**, la navegación contra la que `operativo` tiene hoy y sus seis cambios con su razón, **doce pantallas documentadas una por una** con layout en terminal, tablet y teléfono, estados, atajos y qué no va, **la pantalla de recogida que no se deriva de nada porque la mira alguien sin sesión**, el dashboard completo con la decisión que dispara cada indicador y **el reconocimiento de que a las 8 de la mañana nadie lo mira**, multi-sucursal con el pasivo de sellos consolidado, y las condiciones reales con su consecuencia |
| `05-DATOS-Y-BACKEND.md` | **Dos hallazgos del código que condicionan todo**, cinco tablas y dos vistas nuevas, treinta y cuatro extensiones a entidades existentes, dieciséis reglas de integridad que garantiza la base, diecinueve comandos con entrada y roles, **la entidad `clientes` que existe y no está en el puente**, la única ruta de lectura sin sesión del sistema y por qué su contrato es la lista más corta posible, **las migraciones 070 a 080 escritas y no aplicadas**, la decisión pendiente de la segunda pantalla, y lo que se reutiliza tal cual con su ruta |
| `FILE-MAP.md` | Este archivo. Índice, destino del código, qué se hereda y qué se aporta, los pendientes abiertos, y las cuatro preguntas de cierre |

---

## 2 · DÓNDE VIVIRÁ EL CÓDIGO

Rutas exactas dentro del monorepo cuando se acople. **Acoplar es mover carpetas y aplicar
migraciones, nunca reescribir** (D-05).

### 2.1 · Lógica de aplicación

```
packages/app/src/cafeteria/
├── fila.ts                        F-328 · consulta y transiciones de la fila
├── fila.test.ts
├── llamado.ts                     F-329 · llamarPedido, entregarPedido,
│                                          marcarNoRecogido, deshacerEntrega
├── llamado.test.ts
├── canal.ts                       F-331 · resolución de empaque por canal
├── canal.test.ts
├── opciones.ts                    F-027 · resolución de modificadores sobre
│                                          la receta (sustitución y factor)
├── opciones.test.ts
├── merma-barra.ts                 F-156 · registrarMermaBarra, registrarCalibracion
├── merma-barra.test.ts
├── lote-grano.ts                  F-157 · abrirLoteGrano, frescura
├── conteo-leche.ts                F-106 parcial · contarLeche + % de merma
├── conteo-leche.test.ts
├── anticipado.ts                  F-330 · programar y encolar
└── anticipado.test.ts

packages/app/src/lealtad/
├── sellos.ts                      F-930 · otorgar al cobrar
├── canje.ts                       F-934 · canjearSello
├── canje.test.ts
├── pasivo.ts                      F-936 · consulta del pasivo
└── ajustes.ts                     F-936 · ajustarSellos

packages/app/src/propinas/
├── reparto-horas.ts               F-248 · cálculo del reparto por horas
├── reparto-horas.test.ts
├── desglose.ts                    ← YA EXISTE. INTACTO
├── folio.ts · rango.ts            ← YA EXISTEN. Intactos
└── liquidadas.ts                  ← YA EXISTE. Se extiende con reparto_base

packages/app/src/turno/
├── presencias.ts                  F-248 · abrir, cerrar y ajustar presencia
└── presencias.test.ts

packages/app/src/caja/
└── cambio.ts                      entradaCambio + cálculo de cambio disponible

packages/app/src/restaurante/
├── comandas.ts                    ← YA EXISTE. F-328 lo EXTIENDE
└── preparacion-escrituras.ts      ← YA EXISTE. F-328 lo EXTIENDE
```

**Por qué F-328 vive en `cafeteria/` y extiende `restaurante/comandas.ts` en vez de copiarlo.**
Porque la fila de barra **es** una preparación: mismo ruteo a estación, mismos estados base, mismo
refresco. Lo que cambia es cuándo nace (al cobrar), cómo se identifica (por nombre) y cómo termina
(el cliente la recoge). Copiar el módulo daría dos sitios donde corregir el mismo error.

### 2.2 · Puente

```
packages/app/src/puente/mapa.ts    ← se AMPLÍA con nueve entidades:
    Cliente · SaldoLealtad · MovimientoLealtad · LlamadoPedido ·
    PresenciaTurno · LoteGrano · PedidoAnticipado · FilaBarra ·
    MermaBarraTurno
  … y con los campos nuevos de Venta, DetalleVenta, PedidoPreparacion,
    RecetaEscandallo, Ingrediente, ProductoTerminado y CorteCaja
```

**`Cliente` es el más importante de los nueve y el menos obvio:** la tabla existe desde la
migración 002 y hoy **no se lee por ningún lado**. Sin declararla, el módulo de sellos entero no
tiene de dónde leer.

### 2.3 · Rutas

```
apps/web/app/api/cafeteria/llamar-pedido/route.ts
apps/web/app/api/cafeteria/entregar-pedido/route.ts
apps/web/app/api/cafeteria/no-recogido/route.ts
apps/web/app/api/cafeteria/deshacer-entrega/route.ts
apps/web/app/api/cafeteria/merma-barra/route.ts
apps/web/app/api/cafeteria/calibracion/route.ts
apps/web/app/api/cafeteria/lote-grano/abrir/route.ts
apps/web/app/api/cafeteria/contar-leche/route.ts
apps/web/app/api/caja/entrada-cambio/route.ts
apps/web/app/api/propinas/repartir-bote/route.ts
apps/web/app/api/turno/presencia/ajustar/route.ts
apps/web/app/api/lealtad/identificar/route.ts
apps/web/app/api/lealtad/canjear/route.ts
apps/web/app/api/lealtad/ajustar/route.ts
apps/web/app/api/portal/pedido-anticipado/route.ts
apps/web/app/api/publico/recogida/[token]/route.ts   ← sin sesión, sólo lectura
```

### 2.4 · Migraciones

```
packages/data/src/migraciones/sql/
├── 080_unidad_base_cafeteria.sql      ← corrige un hueco activo. Va primera
├── 081_canal_y_nombre_pedido.sql
├── 082_fila_barra.sql
├── 083_empaque_por_canal.sql
├── 084_opciones_con_receta.sql
├── 085_merma_barra_y_lote.sql
├── 086_turno_bote_y_cambio.sql
├── 087_presencias_y_reparto.sql       ← depende de la 076 de `restaurante`
├── 088_lealtad_sellos.sql
├── 089_pedido_anticipado.sql
└── 066_plantillas_semilla.sql        ← D-01. Toca datos vivos. Aplicada en la Fase 3 (P-04 resuelta)
```

### 2.5 · Interfaz

Nada se toca en `apps/web/heredado/` mientras Codex siga en la Fase 1. El detalle de los ocho
archivos que habrá que modificar y los doce componentes nuevos está en `05-DATOS-Y-BACKEND.md` §9.

---

## 3 · QUÉ HEREDA DE `restaurante` Y QUÉ APORTA A LOS DEMÁS

### 3.1 · Lo que hereda, y no vuelve a construir

Este modelo es el **primer consumidor** del arquetipo A2, y esa es su prueba de fuego: si A2 está
bien construido, `cafeteria` debería poder reutilizar la mayoría sin tocar nada. Lo hace.

| Bloque | Funciones | Dónde vive hoy |
|---|---|---|
| Identidad y acceso | F-001…F-006 | `packages/app/src/identidad/` · `heredado/pages/POSLogin.jsx` |
| Cobro y métodos de pago | F-210…F-213, F-221, F-223, F-225 | `packages/app/src/venta/pagos.ts` · `heredado/components/pos/PaymentModal.jsx` |
| Caja, arqueo y corte (tronco) | F-230…F-233, F-236 | `packages/app/src/caja/` · `heredado/pages/Caja.jsx` |
| **Desglose exacto de propina** | F-245 | `heredado/utils/tipsUtils.js` · **intacto, sin una línea de cambio** |
| Liquidación de propinas (tronco) | F-246 | `packages/app/src/propinas/` |
| Inventario V6 (tronco) | F-100…F-104, F-107, F-108, F-115, F-128…F-132 | `packages/app/src/inventario/` |
| Preparación (tronco) | F-310…F-314, F-316, F-317 | `packages/app/src/restaurante/comandas.ts` · `heredado/pages/Cocina.jsx` |
| Compras y proveedores | F-631…F-634 | `packages/app/src/compras/` |
| Gastos | F-250, F-251 | `heredado/components/compras/RegistrarGastoDialog.jsx` |
| Catálogo e importación | F-020…F-022, F-028, F-032 | `packages/app/src/catalogo/` · `heredado/pages/Productos.jsx` |
| Escáner de código de barras | F-029, F-986 | `heredado/components/barcode/` · **encendido aquí, apagado en `restaurante`** |
| Portal (tronco) y encuesta | F-920, F-952 | `packages/app/src/portal/` |
| Registros y exportación | F-050…F-053, F-057 | `heredado/pages/Registros.jsx` |
| Voz | — | `heredado/lib/voiceAlert.js` · F-329 sólo cambia el texto |

**La lectura que importa:** de las funciones que este modelo necesita, **cerca de dos tercios ya
existen y no se vuelven a tocar**. Eso es la prueba de que D-02 (diez arquetipos, no setenta y
ocho plantillas) era correcta, y es el argumento más fuerte que tiene el proyecto.

### 3.2 · Lo que aporta, y heredarán los demás

`cafeteria` es el **origen del A2 de mostrador**, igual que `restaurante` es el origen del A2 con
mesa. Lo que se construya aquí lo reutilizan sin tocarlo:

| Función | La heredarán |
|---|---|
| **F-328 · Fila de despacho** | `comida-rapida`, `taqueria`, `jugueria`, `food-truck`, `heladeria-paleteria`, `bufet-por-peso` |
| **F-329 · Llamado por nombre y pantalla de recogida** | los mismos seis, y `farmacia` con el mostrador de recetas |
| **F-331 · Empaque por canal** | los mismos seis, y `pizzeria` y `dark-kitchen` con más razón todavía |
| **F-249 · Segunda pantalla al cliente** | los seis, más `abarrotes` y cualquier mostrador de alto volumen |
| **F-248 · Bote del turno por horas** | `taqueria`, `jugueria`, `food-truck`, `fonda-cocina-economica`, `heladeria` |
| **F-027 · Opciones con impacto en receta** | `jugueria` (que es casi este mismo modelo con fruta), `taqueria`, `bar-cantina` |
| **F-930/F-934/F-936 · Sellos y su pasivo** | `heladeria`, `taqueria`, `barberia`, `autolavado`, `tortilleria` — cualquier giro de recurrencia alta |
| **F-235 · Varias cajas simultáneas** | `abarrotes`, `farmacia`, `panaderia-pasteleria` |
| **F-156 · Merma de barra** | `jugueria` y `bar-cantina`, con otros motivos |
| Fondo de caja desglosado y **aviso de cambio bajo** | todos los mostradores de ticket bajo: `abarrotes`, `taqueria`, `dulceria`, `tortilleria` |

---

## 3.ter · EL COMPONENTE NUEVO, Y EL CAMBIO DE UNA LÍNEA

Escrito AL LADO de los viejos, como manda D-09, y en `apps/web/src/` para que el verificador de
primitivas lo vigile.

| Componente | Función | Ruta |
|---|---|---|
| `FilaDeBarra.tsx` | F-328 · F-329 | `apps/web/src/cafeteria/FilaDeBarra.tsx` |

**El cambio exacto de UNA LÍNEA que hará falta al acoplar**, cuando D-09 quede derogada:

```
heredado/pages/Barra.jsx                      ← la pantalla de barra real
  + import { FilaDeBarra } from '~/cafeteria/FilaDeBarra';
    …y montarla debajo del encabezado, sustituyendo la lista actual.
```

El archivo se comprobó en el disco: `pages/Barra.jsx` existe y es la pantalla de barra. En
`components/cocina/` no hay ningún `Cocina.jsx` — el tablero de cocina es `pages/Cocina.jsx` y es
otra pantalla.

**No se abrió en el navegador**, y no se puede: llama a `/api/cafeteria/{llamar,entregar}`, cuyos
comandos leen `fila_barra` de la migración `082`, escrita y sin aplicar.

---

## 3.quater · LO QUE LAS ETAPAS 10-13 AÑADIERON

Escrito con el código delante. `verify:cobertura` sale en 0 para este modelo:
17/17 funciones, 16/16 rutas, 13/13 pantallas, 11/11 migraciones.

| Pieza | Dónde quedó | Prueba |
|---|---|---|
| conteo de leche de barra | `packages/app/src/cafeteria/leche.ts` · `apps/web/app/api/cafeteria/contar-leche/route.ts` | `leche.test.ts` |
| entrada de cambio a media mañana | `packages/app/src/caja/entrada-cambio.ts` · `apps/web/app/api/caja/entrada-cambio/route.ts` | `entrada-cambio.test.ts` |
| **F-329** monitor de recogida sin sesión | `packages/app/src/portal/recogida.ts` · `apps/web/app/api/publico/recogida/[token]/route.ts` | `recogida.test.ts` |
| **PANTALLAS** clientes-y-sellos, menu-publico-y-pedido-anticipado, productos, recetas | `apps/web/src/cafeteria/{ClientesYSellos,MenuPublicoYPedidoAnticipado,Productos,Recetas}.tsx` | la lógica pura está exportada archivo por archivo |

Tres decisiones que el código dice y conviene que el papel repita:

- **La leche se cuenta en CUARTOS de litro y nunca se ajusta sola.** Lo que
  sobra en la jarra no es un número que el sistema pueda inferir; es algo que
  alguien mira. Un ajuste automático aquí convierte la merma real en una cifra
  inventada que después nadie sabe de dónde salió.
- **La entrada de cambio SUBE el fondo esperado.** Si no lo subiera, meter
  cambio a media mañana haría que el corte marcara sobrante, y el cajero
  aprendería a ignorar el sobrante, que es justo la alarma que importa.
- **El nombre en el monitor de recogida es SÓLO el nombre de pila**, recortado
  en el servidor y no en el navegador. Es una pantalla que mira toda la
  cafetería: el apellido de quien pidió no es asunto de la fila.

### El cambio de UNA LÍNEA que hará falta en `heredado/` al acoplar

`heredado/pages/Productos.jsx` gana el enlace a la pantalla nueva de productos
de barra, que es la que trae el margen por canal. Una línea en su barra de
acciones; el resto vive en `apps/web/src/cafeteria/Productos.tsx`.

---

## 3.quinquies · LO QUE EL ACOPLE (FASE 3) CAMBIÓ

Dos rutas que faltaban y que eran de este modelo:
`apps/web/app/api/cafeteria/anticipado/encolar/route.ts` y `…/entregar/route.ts`. Los comandos
`cafeteria.encolar_anticipado` y `cafeteria.entregar_anticipado` existían desde E13 y no llegaba
ninguna ruta: el pedido anticipado se podía crear y nunca entraba a la fila de barra.

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

**Sí, con dos reservas, y una de ellas es incómoda.**

Lo que sostiene el sí: **los dos picos están bien**, y están bien porque se investigaron en vez de
suponerse. El encargo de esta carpeta decía "el pico de 7 a 10 de la mañana", que es lo que todo el
mundo cree. Los datos agregados de más de doscientas cafeterías mexicanas dicen otra cosa: **la
hora de más órdenes es las 10:00**, no las 7:00, y es otro cliente —el que ya llegó a donde iba, se
queda, personaliza su bebida y gasta más—. Documentar los dos picos por separado, con distinto
ticket, distinto canal y distinta pantalla dominante, es lo que hace que el día del §3 se parezca a
un día de verdad y no a un folleto. La calibración del molino de las 6:25 no aparece en ningún
manual de punto de venta y pasa en todas las cafeterías de México todos los días. El conteo diario
de leche, también. El bote de vidrio sobre la barra del que alguien saca cien pesos para dar
cambio, también. Y los números son los de 2025-2026: $400/kg el grano, $1.53 el vaso, 3.6% + IVA la
Clip, $8,795 el sueldo de barista, 8% de utilidad neta.

**Reserva 1, y es real: no se documentó la operación de ALIMENTOS como un mundo propio.** Una
cafetería con brunch fuerte tiene cocina de verdad —una plancha, un cocinero, tiempos de veinte
minutos— y eso convierte la barra en dos estaciones con ritmos incompatibles: el café sale en
noventa segundos y los huevos en dieciocho minutos, y la fila de despacho de este documento asume
que todo sale en el mismo orden en que entró. Ese supuesto se rompe en cuanto hay una plancha.
Alguien que lleva quince años en una cafetería con brunch diría *"esto lo escribió alguien que
conoce la barra mejor que la cocina"*, y tendría razón. El ticket promedio de $211.59 que reporta
Parrot es justamente el de esas cafeterías, no el de Café Jacaranda. **Se documenta Café Jacaranda,
que es barra con pan, y se dice explícitamente que la cafetería con brunch necesita al menos dos
estaciones con ordenamiento independiente y una regla de sincronía de salida.** No está resuelto.

**Reserva 2, más chica pero honesta: el hielo y el armado de la bolsa de grano son producción y se
difirieron.** Los dos son V7 en miniatura y los dos se resuelven hoy con ajustes a mano. Está
escrito en `03-INVENTARIO.md` §4 con nombre y apellido, y con el umbral a partir del cual deja de
ser aceptable: cuando el grano en bolsa pase del 10% de la venta.

### P2 · ¿Da control total?

**Casi, y los huecos están señalados con nombre y apellido.**

Lo que sí puede contestar la dueña con este sistema: cuánto vendí —por turno, por franja, por
producto, por canal, por método de pago—; cuánto gané, con el costo del vaso y la comisión de la
terminal dentro, que es la primera vez que ese número sería verdad; **cuánto cuesta cada bebida y
cada una de sus variantes**, que es lo que hoy no puede saber en ningún sistema del mercado; cuánta
leche debí gastar contra la que conté, todos los días, con su porcentaje de merma y su semáforo;
qué se me fue en calibración, en vaporizado y en bebidas rehechas, separado; cuántas bebidas por
hora aguanta mi barra y cuánto tarda un pedido del cobro a la entrega; cuánto hay en el bote y a
quién le toca cuánto, con las horas a la vista; cuántos sellos debo y cuánto me costarían; y si la
caja cuadró — las dos cajas, la del cajón y la del bote.

Lo que **no** puede contestar, dicho sin maquillaje:

1. **"¿Cuánta de mi venta es de clientes que vuelven?"** — el dato existe a partir de los sellos,
   pero **sólo de los clientes que se identifican**, que serán el 20 o 30%. El 70% restante es
   anónimo por diseño y no hay forma honesta de saberlo sin pedirle el teléfono a todo el mundo en
   la ráfaga, que es exactamente lo que este documento se niega a hacer. **El sistema da una
   muestra, no una medición, y hay que decirlo así en la pantalla.**
2. **"¿Cuánta gente se fue sin comprar porque la fila estaba larga?"** — es el número más caro del
   giro y **ningún punto de venta puede saberlo**. Lo más cerca que llega este modelo es "bebidas
   por hora en el pico" y "tiempo del cobro a la entrega", que son proxies. Inventar un indicador
   de "clientes perdidos" sería mentir.
3. **"¿Quién me está robando?"** — misma respuesta que en `restaurante` y por la misma causa: falta
   **F-106** (toma de inventario físico como objeto del sistema) y **F-133** (rendimiento real
   contra teórico con serie histórica). El conteo diario de leche de esta carpeta es medio F-106, y
   es el medio que más sirve, pero sin la serie histórica no se distingue un mal día de una fuga.
4. **"¿Quién está descontando de más?"** — no hay tope por rol ni autorización con PIN. **F-205.
   Es el hueco de control más serio que tiene hoy este modelo**, exactamente igual que en
   `restaurante`, y aquí es más difícil de ver porque los importes son de $18 y nadie los audita.

Las cuatro están en el orden de construcción de `01-FUNCIONES.md` §8 salvo F-205, que es
transversal a los 78 y entra con el arquetipo A1.

### P3 · ¿Parece hecho a la medida?

**Sí, y se nota en cosas que sólo aparecen cuando alguien estuvo detrás de una barra.**

El nombre y el canal como los dos primeros campos del pedido, porque es lo primero que se pregunta
en un mostrador mexicano. El total dentro del botón de cobrar, porque quien cobra es quien va a
preparar y no lee el total desde lejos. La segunda pantalla que pide la propina en pesos y no en
porcentaje, con "Sin propina" del mismo tamaño, y con ocho segundos de espera para que nadie tenga
que preguntar en voz alta. El botón de la barra que dice dos verbos —LISTO Y LLAMAR— porque
separarlos garantiza que alguien haga sólo el primero y deje a un cliente mirando su propio vaso.
El nombre a 96 píxeles en la pantalla de recogida, con tema claro fijo porque da a la calle y a las
ocho de la mañana le pega el sol. La zona de "entregados hace un momento" con su flecha de
deshacer, que dura sesenta segundos. El aviso de cambio bajo en el encabezado de la pantalla de
cobro, que es el único dato del encabezado y el que salva media ráfaga. El botón de calibración en
la apertura, que registra en cuatro segundos los setecientos pesos al mes que ningún sistema del
mercado sabe que existen. El fondo de caja capturado en tres denominaciones. El doble arqueo, el
del cajón y el del bote. La tabla de variantes de la receta, que contesta si el sobreprecio de la
avena cubre lo que cuesta la avena.

**Lo que todavía delataría al sistema como genérico, y es lo mismo que en `restaurante`:** el
vocabulario está escrito a mano en los componentes en vez de salir de un diccionario (F-017
pendiente). Aquí es **más peligroso** que allá, porque este modelo reutiliza las pantallas de
`restaurante` de forma directa: `Cocina.jsx` se deriva en la pantalla de barra, `CorteTicket.jsx`
se comparte, `PaymentModal.jsx` se comparte. **El día que un componente heredado pinte la palabra
"mesa" o "mesero" en una cafetería, esta carpeta es la culpable por no haber exigido F-017 antes.**
Por eso `04-INTERFAZ.md` §4.1 cierra con una regla que no está en el estándar y debería: *la
palabra "mesa" no aparece en ninguna pantalla, en ningún mensaje de error, en ningún estado vacío y
en ningún PDF.* Es la comprobación más rápida de que la plantilla está bien acoplada.

### P4 · ¿Se distingue de sus vecinos?

Ésta es la pregunta que había que contestar con más cuidado, porque la sospecha razonable es que
`cafeteria` sea **`restaurante` sin mesas**. Lo pongo al lado y lo miro de frente.

**La respuesta corta: sí se distingue, y no porque se le quitaran las mesas, sino porque se le
adelantó el cobro.** Quitar las mesas es la consecuencia visible; adelantar el cobro es la causa, y
de ella salen todas las demás diferencias en cascada.

| | `restaurante` | `cafeteria` |
|---|---|---|
| **Cuándo se cobra** | Al final, después de consumir | **Antes de que el producto exista** |
| **Pantalla de inicio del operador** | Mapa del salón con mesas dibujadas | Rejilla de bebidas con carrito a la derecha |
| **Unidad de trabajo** | La mesa | El pedido con nombre — *"el vaso"* |
| **Segunda pantalla del sistema** | Cocina: tres columnas por estación | Barra: **dos** columnas, encabezadas por el nombre del cliente |
| **Pantalla dirigida al cliente dentro del local** | Ninguna | **Dos**: la de propina y la de recogida |
| **Documentos** | Dos: precuenta y ticket | **Uno**: ticket |
| **Quién cobra** | El cajero, en otro momento y otra pantalla | **El mismo que prepara y entrega** |
| **Propina** | Tres momentos, tres personas, atribuida al mesero | **Un momento, la elige el cliente, va al bote del turno** |
| **Reparto de propina** | Por mesero, con folio y rango | **Por horas presentes, en efectivo, esa misma tarde** |
| **El corte contesta** | ¿Cuadró la caja y cuánto le toca a cada mesero? | ¿Cuadró la caja, cuánto se fue en leche, café y vaso, y cuánto hay en el bote? |
| **Cortes por día** | Uno, más un corte de turno que **no cierra** la caja | **Dos, y los dos cierran** |
| **Arqueos por corte** | Uno: el cajón | **Dos: el cajón y el bote** |
| **Fondo de caja** | $1,500, importe global | **$800–$1,200, desglosado en tres denominaciones** |
| **Indicador exclusivo del encabezado** | Ninguno | **Cambio disponible** |
| **Cuántas cajas** | Una, por diseño | **Dos los fines de semana** |
| **El empaque** | No existe | **El tercer costo del producto** |
| **Merma que define el giro** | De limpieza, dentro de la receta | **De calibración y vaporizado, movimientos con motivo tipado** |
| **Receta** | Larga, doce insumos, con merma por insumo | **Corta, con variantes por modificador**; `merma_bp` oculto |
| **Escáner de código de barras** | **Apagado a propósito** | **Encendido** |
| **Ritmo** | Sostenido con dos ráfagas | **Ráfaga de cuatro horas y media con un día sostenido detrás** |
| **Dispositivo principal** | Tablet en la mano del mesero | **Terminal fija con segunda pantalla** |

**Un extraño las distinguiría viendo sólo las pantallas, en menos de cinco segundos**, y por tres
cosas a la vez: una tiene un plano dibujado y la otra una rejilla de productos; una tiene tres
columnas con números de mesa y la otra dos con nombres de personas; una tiene una pantalla que
mira al comensal y la otra tiene dos.

**Ahora lo incómodo, porque la pregunta pide honestidad.** Hay dos vecinos con los que el riesgo de
fusión es real, y no son `restaurante`:

**`comida-rapida` y `taqueria` de mostrador.** Los tres son A2 de mostrador: se pide en barra, se
cobra antes, se prepara detrás, se llama por nombre o por número. **Las tres van a compartir F-328,
F-329, F-331, F-249 y F-248 sin una sola diferencia.** Si esas carpetas se documentan sin encontrar
sus propios deltas, van a salir siendo ésta con otro menú, y entonces uno de los tres está mal —o
los tres deberían ser un solo modelo con tres vocabularios. **Lo que los separa de verdad, y lo
dejo escrito aquí para la segunda pasada:** `comida-rapida` llama por **número**, no por nombre, y
eso cambia la pantalla de recogida entera; `taqueria` vende **por pieza y por kilo** con báscula
(F-131, F-983) y tiene un ritmo nocturno, no matutino; y ninguna de las dos tiene el problema de la
leche, que es el que estructura la mitad de esta carpeta. Si al documentarlas esas diferencias no
alcanzan para llenar siete archivos distintos, **hay que decirlo y fusionarlas**, que también es un
resultado.

**`jugueria`.** Éste es el más peligroso de todos y hay que nombrarlo: A1 + preparación, mostrador,
receta con variantes —¿con agua o con leche?, ¿grande o chico?—, empaque desechable, merma de
fruta, ritmo de ráfaga. **Es casi exactamente este modelo con fruta en vez de café.** Lo único que
lo separa de fondo es que la fruta es perecedera y estacional, lo que mete alertas de caducidad
reales y compra diaria, y que no hay calibración de nada. **Si `jugueria` se documenta sin esos dos
deltas, va a ser esta misma carpeta con otro nombre.** Queda anotado como el riesgo de fusión más
alto de toda la familia 01, por encima del que `restaurante` señaló con `bar-cantina`.

---

## 5 · PENDIENTES QUE ESTA CARPETA DEJA ABIERTOS

Para que nadie tenga que deducirlos leyendo los siete archivos.

1. **Añadir al catálogo las nueve funciones propuestas** en `01-FUNCIONES.md` §6 — F-156, F-157,
   F-248, F-249, F-328, F-329, F-330, F-331, F-936 — antes de construir nada. Sin ID canónico se
   van a reinventar con otro nombre en `comida-rapida` y en `jugueria`.
2. **Aplicar la migración 070 pronto, independientemente del resto.** El trigger
   `insumo_unidad_base_valida()` no protege a `giro = 'cafeteria'` y hoy se puede dar de alta la
   leche en litros y dividir el consumo entre mil. Es un error de datos activo en un cliente vivo,
   no una función nueva, y es la única de las once que no depende de nada más.
3. **No aplicar la migración 080 hasta que P-04 esté contestada**, y **no antes de que exista la
   tanda 1**. Bajar a Café Jacaranda de `restaurante_pro` a `cafeteria` le quita Mesero, Cocina y
   Mesas; hacerlo antes de que exista la fila de barra sería quitarle algo sin darle nada.
4. **Resolver el conflicto del renombre `operativo` → `cafeteria` con Abarrotes Don Chuy y
   Ferretería La Broca**, que hoy están en `operativo` y según D-01 deben ir a `tienda`. La
   migración 080 los arrastraría a la plantilla equivocada. Se coordina con la carpeta `tienda` o
   se parte en dos migraciones. **No se resuelve aquí.**
5. **Decidir el camino de la segunda pantalla (F-249)**: monitor secundario, tablet independiente o
   girar la tablet. La recomendación está en `05-DATOS-Y-BACKEND.md` §8 y la decisión la toma
   Miguel.
6. **Documentar la cafetería con brunch**, o decidir explícitamente que es otro modelo. Hoy está
   a medias y así se dijo en P1. La pista concreta: dos estaciones con ordenamiento independiente y
   una regla de sincronía de salida.
7. **F-205 (tope y autorización de descuento) no es opcional**, y aquí el tope tiene que ser **en
   pesos, no en porcentaje**. Está fuera de las cuatro tandas porque es transversal a los 78, pero
   en este giro es un hueco de control activo.
8. **F-017 (diccionario de vocabulario) sube de prioridad por culpa de este modelo.** `cafeteria`
   es el primero que reutiliza pantallas de `restaurante` de forma directa, y es el primero donde
   una palabra mal traducida se va a ver en producción.
9. **En la segunda pasada, leer `cafeteria` junto a `jugueria` y a `comida-rapida`** y verificar
   que se distinguen de verdad. Es el riesgo de fusión más probable de toda la familia 01.
