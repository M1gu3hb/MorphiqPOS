# 00 · FICHA Y EJES · Restaurante de mesa

**Modelo:** `restaurante` · **Familia:** 01 Alimentos y bebidas · **Arquetipo:** A2 Mesa y comanda
**Prioridad:** P0 — cliente vivo: **Restaurante MH**
**Plantilla:** `restaurante` (antes `restaurante_pro`; renombre por decisión **D-01**)

---

## 1 · QUÉ ES ESTE NEGOCIO

Un restaurante de mesa vende **tiempo de mesa ocupada**, no platillos. El platillo es lo que el
comensal cree que compra; lo que el dueño vende es una silla durante hora y media, y lo que gana
depende de cuántas veces logre volver a venderla el mismo día. Un local de treinta lugares que
rota 1.5 veces en la comida vende cuarenta y cinco cuentas; el mismo local rotando 2.5 vende
setenta y cinco con exactamente la misma renta, la misma nómina y la misma cocina. Ahí está el
negocio entero, y por eso todo lo que estorbe la rotación —una comanda que no llegó, una cuenta
que tarda ocho minutos en salir, una mesa que quedó sucia veinte minutos— es dinero que ya se
perdió y que no se recupera esa noche.

El ingreso entra por **cuenta abierta**: el comensal se sienta, pide, la cuenta crece durante
cuarenta o noventa minutos y se cierra al final, de una sola vez. Eso tiene tres consecuencias
que separan este modelo de cualquier mostrador. Primera: hay un intervalo largo entre entregar el
producto y cobrarlo, y en ese intervalo el producto ya se consumió — si la cuenta se pierde, la
comida no vuelve. Segunda: el producto se **fabrica al momento** a partir de insumos que se miden
en gramos y mililitros, así que el inventario no baja por piezas sino por receta. Tercera: hay
**propina**, dinero que pasa por la caja del negocio y **no es del negocio**, y confundirlo con
venta es la forma más rápida de inventarse una utilidad que no existe. En México ese dinero es
salario del trabajador por el artículo 346 de la Ley Federal del Trabajo: el patrón no puede
retenerlo, y desde 2026 Profeco insiste además en que el cobro automático de propina es
improcedente porque es voluntaria. Un punto de venta que trate la propina como ingreso no está
mal diseñado: está mal, y punto.

---

## 2 · QUIÉN LO COMPRA

El perfil real del que firma en México, no el del folleto:

| | Cómo es |
|---|---|
| **Quién es** | Dueño-operador. Está en el piso todos los días. Muchas veces cocina o cobra él mismo los fines de semana. Rara vez es un corporativo. |
| **Tamaño** | 8 a 30 mesas. 60 a 140 lugares. De 8 a 25 empleados entre cocina, meseros, caja, barra y lavaloza. |
| **Nivel de computación** | Bajo a medio. Usa WhatsApp todo el día, hace transferencias por app, y le cuesta un Excel con fórmulas. **No lee manuales.** Si una pantalla necesita explicación, no se usa. |
| **Qué usa hoy** | Tres escenarios reales: (a) comandera de papel + calculadora + cuaderno del corte; (b) Soft Restaurant en una PC vieja del mostrador, versión que ya no actualiza; (c) Parrot o similar en tablets, contratado por un hijo o un socio más joven. |
| **Qué paga hoy** | Soft Restaurant en renta mensual: **$500 a $900 MXN** según el tamaño (la Lite ronda los $810). Parrot: **$1,800 MXN + IVA** el plan de entrada y hasta **$2,800 + IVA** el completo, con costo adicional por terminal. |
| **Qué puede pagar** | **$700 a $1,600 MXN al mes** sin pelear, si el sistema le resuelve el corte y las propinas. Arriba de $2,000 lo compara con Parrot y pide licitación. |
| **Qué lo hace firmar** | Que el corte cuadre solo y que el reparto de propinas deje de ser una discusión a la medianoche. No lo hace firmar "la nube", ni "analítica avanzada". |

**El contexto de costos que lo tiene nervioso:** el insumo está alrededor de 18% más caro que en
2022 y el salario mínimo pasó de $312.41 diarios en 2023 a $419.88 en 2025. Un restaurante casual
sano trae food cost de 30% a 35% y utilidad neta de 10% a 22% sobre ventas. Cuando el food cost
se le va a 40% y no sabe por qué, es cuando compra un sistema con recetas.

---

## 3 · EL DÍA COMPLETO

Restaurante de comida corrida y carta, servicio de comida y cena, seis meseros, dos cocineros,
una barra, una caja. Es el día de Restaurante MH y el de casi todos sus vecinos.

```
08:30  Llega el dueño o el encargado. Abre. Enciende cocina.
       ── SISTEMA: nada. Y está bien que no haya nada.

09:00  Llega el proveedor de verdura. Llega el de carne. Se recibe, se pesa,
       se discute el precio de la caja de jitomate.
       ── SISTEMA: registrar compra. Es el momento donde entra el costo real
          del día, y donde el costo promedio del insumo se recalcula. Se hace
          con la tablet en la mano y las manos sucias, apoyado en una mesa.

10:00  Mise en place. Se pican, se porcionan, se preparan bases y salsas.
       Se saca lo del congelador.
       ── SISTEMA: nada, salvo merma si algo salió echado a perder.
          Este hueco es real y no se llena con software.

11:30  Junta de dos minutos: qué se acabó, qué hay que empujar, cuál es el
       platillo del día.
       ── SISTEMA: el mesero abre su tablet y ve qué está agotado. Si no lo
          ve aquí, lo va a vender y lo va a cancelar en la mesa 7.

12:00  Abre. Entran los primeros: comida corrida, oficinistas, solos o de dos.
       Ticket bajo, rotación rápida, salen en 45 minutos.
       ── SISTEMA: abrir mesa, comandar, enviar a cocina, cobrar. El ciclo
          completo, veinte veces.

14:00  ── HORA PICO. LA COMIDA. Esto es México: aquí se hace el día.
       Entran familias y grupos de trabajo. Cuentas de 4 a 10 personas.
       Tiempo de mesa 60–90 minutos. Todo pasa a la vez: una mesa pide la
       cuenta mientras otra reclama que falta un plato y tres esperan lugar.
       ── SISTEMA: el mapa de mesas es la pantalla. El mesero comanda de pie,
          con una mano, sin mirar. Cocina recibe y marca. La caja cobra sin
          preguntarle al mesero cuánto era.
       ── AQUÍ SE PIERDE EL DINERO: comanda que no llegó, platillo que salió
          y nadie cobró, mesa que se fue sin pagar, propina que se dividió mal.

17:00  Baja. Se limpia. Corte de turno del mesero de mediodía: entrega su
       efectivo, se le liquidan sus propinas del turno.
       ── SISTEMA: corte de turno (NO cierra la caja) + liquidación de propinas
          por mesero. Este es el momento que más veces al mes genera pleito.

18:00  Valle. Dos o tres mesas. Se repone inventario, se hacen pedidos a
       proveedor para mañana.
       ── SISTEMA: revisar bajos y críticos. Levantar plantilla de compra.

20:00  ── SEGUNDO PICO. LA CENA. Menos cuentas, más grandes. Ticket alto:
       entran bebidas, entra postre, entra la cuenta de 12 personas que se
       va a querer dividir. Tiempo de mesa 90–120 minutos.
       ── SISTEMA: lo mismo, pero con cuentas más altas y más riesgo por
          cuenta. Aquí duele no poder dividir cuenta (F-321) todos los días.

22:30  Última orden. Las mesas se van vaciando.
       ── SISTEMA: el encargado revisa que no quede ninguna mesa abierta. Si
          queda una, el cierre no puede correr — y eso el sistema ya lo impide.

23:30  CIERRE. Se cuenta el efectivo del cajón. Se compara con lo esperado.
       Se deja el fondo de mañana. Se reparten las propinas del turno noche.
       Se imprime o se descarga el corte.
       ── SISTEMA: cierre diario, arqueo a ciegas, PDF del corte. Es el
          momento en que el dueño decide si confía en el sistema o no.

00:15  El dueño se va con el PDF en el teléfono y lo lee en el coche.
       ── SISTEMA: el corte tiene que leerse en un teléfono, de noche, cansado.
          Si necesita zoom para encontrar el faltante, está mal hecho.
```

**Lo que este recorrido decide, y que no se decide de otra forma:** la pantalla de inicio del
mesero es el mapa de mesas; la de cocina son tres columnas; la de caja es la lista de mesas que
ya pidieron cuenta; y el corte es un documento, no una tabla.

---

## 4 · LOS SEIS EJES

### Ejes del mapa general (`01-MAPA-GENERAL.md` §1)

| Eje | Valor | Por qué |
|---|---|---|
| **E1 · Cómo entra el ingreso** | **E1.2 Cuenta abierta** | El comensal pide en tres o cuatro tandas y paga una sola vez al final. La cuenta es un objeto que vive una hora y media. |
| **E2 · Qué se descuenta** | **E2.5 + E2.6 Peso/volumen + receta** | Nadie vende "una arrachera de inventario": vende 280 g de arrachera, 40 ml de salsa y 2 tortillas. El descuento se hace por escandallo. |
| **E3 · Quién atiende** | **E3.1 Empleado genérico… con matiz** | El mesero no tiene agenda ni cartera, así que no es E3.2. Pero **sí importa quién es**, porque la propina es suya y su ticket promedio se compara. Es E3.1 con identidad. |
| **E4 · Cuándo se paga** | **E4.2 Al cerrar** | Se cobra cuando la cuenta se cierra, nunca antes. Ningún anticipo, ningún crédito en el modelo base. |
| **E5 · Qué se entrega** | **E5.1 Ticket** (+ precuenta) | Dos documentos distintos y esto no es un detalle: la **precuenta** no es un ticket, es una propuesta de cobro que el comensal revisa. |
| **E6 · Relación con el cliente** | **E6.0 Anónima** | Nadie pide nombre para sentarse. El nombre que se captura —"Familia López"— es una etiqueta de la mesa, no un cliente con historial. |

### Ejes de diseño (`04-SISTEMA-DE-DISENO.md` §2)

| Eje | Valor | Por qué |
|---|---|---|
| **A · Pantalla de inicio** | **Mapa de mesas** (`/mesero`) para mesero; **Cobros pendientes** (`/caja`) para cajero; **Cocina** para cocina | Lo primero que cada rol necesita saber es distinto y no se negocia: el mesero necesita saber qué está ocupado, el cajero qué ya pidió cuenta, la cocina qué falta salir. Un solo inicio para los tres sería un inicio equivocado para dos. |
| **B · Acción principal** | **Abrir mesa** (mesero) · **Enviar a cocina** (mesa activa) · **Cobrar** (caja) · **Marcar listo** (cocina) | Una por pantalla, nombrable en dos palabras. Si no se puede nombrar en dos palabras, la pantalla está mal. |
| **C · Unidad de trabajo** | **La mesa** | Todo cuelga de ahí: la cuenta es de la mesa, la comanda dice de qué mesa viene, el mesero está asignado a mesas, la propina se atribuye por la mesa que atendió. |
| **D · Densidad** | **Media**, con una excepción alta | Mapa de mesas y cocina: pocas piezas grandes, leíbles a dos metros. Caja y registros: densidad alta, porque ahí se busca un dato entre cientos. |
| **E · Dispositivo principal** | **Tablet** (mesero) → PC (caja y cocina) → **teléfono** (dueño) | El mesero trae tablet de 8 a 10 pulgadas, de pie, con una mano. La caja es PC con teclado. El dueño lee el corte en el teléfono a medianoche. Se diseña la tablet primero. |
| **F · Ritmo de uso** | **Sostenido con dos ráfagas** | De 14:00 a 16:00 y de 20:00 a 22:00 es ráfaga pura: cero fricción, cero confirmaciones de más. El resto del día es sostenido y ahí sí caben formularios. |

---

## 5 · ARQUETIPO BASE Y DELTAS

**Arquetipo A2 · Mesa y comanda.** Éste es el modelo que **define** el arquetipo: no hereda de
nadie, todos los demás A2 heredan de aquí. Cafetería, bar, taquería, pizzería y cervecería
artesanal reutilizan lo que se construya en esta carpeta.

```
A2 MESA Y COMANDA
  + Salón: zonas, mesas con estado, posición en mapa, asignación de mesero   [⚙]
  + Comandas: envío a preparación, estaciones, ruteo, pantalla, estados      [⚙]
  + Cuenta abierta que crece, precuenta con código para caja                 [⚙]
NÚCLEO
  + Identidad y acceso por PIN, roles, sesiones                              [⚙]
  + Catálogo, precios, modificadores, importación por Excel                  [⚙]
  + Caja: apertura con fondo, arqueo a ciegas, corte de turno, cierre diario [⚙]
  + Compras, proveedores, gastos con categoría                               [⚙]
DELTAS PROPIOS DEL RESTAURANTE DE MESA
  + Inventario V6: gramos, mililitros, receta, explosión al cobrar           [⚙]
  + Propinas V2 sugeridas al cobrar, con desglose exacto por método          [⚙]
  + Liquidación de propinas por mesero y periodo                             [⚙]
  + Portal QR V1: menú, pedido en mesa, pedir cuenta, valoración             [⚙]
  + Alergias y celebración a nivel de mesa, propagadas a la comanda          [⚙]
DELTAS PENDIENTES  ← lo que falta para que el modelo esté completo
  − Dividir cuenta                    F-321
  − Unir y separar mesas              F-302
  − Cambiar de mesa                   F-303
  − Tiempos por platillo              F-315
  − Impresión de comanda              F-318
  − Lista de espera                   F-306
  − Tiempo de ocupación               F-305
  − Propina repartida por puntos      F-242
```

---

## 6 · LO QUE ESTE NEGOCIO NO NECESITA

Tan importante como lo anterior. Un sistema que enseña lo que no se usa es un sistema difícil, y
en hora pico un menú con módulos muertos cuesta segundos que no hay.

| No necesita | Por qué |
|---|---|
| **Agenda de citas (F-4xx)** | No se reserva un hueco en el tiempo de nadie. La reserva de mesa existe en restaurantes grandes, pero no en éste y no es agenda: es lista de espera (F-306). |
| **Crédito y cuentas por cobrar (F-610…F-618)** | Nadie se lleva la comida fiada. El "fiado del cliente frecuente" es de la fonda, no de aquí. |
| **Número de serie, lote y caducidad (F-113, F-114)** | El insumo se compra, se cocina y se va en tres días. Rastrear lote de jitomate es trabajo sin beneficio. La caducidad sí importa, pero se resuelve con rotación física, no con el sistema. |
| **Matriz talla/color, presentaciones caja↔pieza (F-033, F-112)** | No se revende empaquetado. Se transforma. |
| **Facturación por cada ticket** | Se factura el 3% de las cuentas. Lo que necesita es **factura global del día** (F-942) cuando CFDI entre. Un flujo de facturación por ticket en hora pico es un estorbo. |
| **Comisión por profesional (F-423, F-424)** | Al mesero no se le comisiona: se le da propina. Son cosas distintas y mezclarlas rompe la contabilidad. |
| **Órdenes de trabajo, cotizaciones, proyectos** | No entra nada a reparar, no se cotiza nada por adelantado. |
| **Dashboard de doce indicadores** | Al dueño le sirven ocho, y sólo si cada uno dispara una decisión. Ver `04-INTERFAZ.md` §4.4. |

---

## 7 · LOS TRES DOLORES

Lo que de verdad le duele al dueño hoy. Si el sistema no resuelve estos tres, no se vende.

### Dolor 1 · "No sé a dónde se va el dinero, pero se va"

Vende bien, tiene lleno los viernes, y a fin de mes no queda. La causa casi siempre es una mezcla
de tres fugas invisibles: **robo hormiga** —hurtos pequeños de insumo y de caja que pueden llegar
al 20% del inventario en un año—, **merma no registrada** y **porciones sin control** (el cocinero
que sirve 320 g donde la receta dice 250 g y multiplica eso por doscientos platos al mes).

*Cómo lo resuelve el sistema:* receta y costeo (F-128, F-130), explosión al cobrar (F-129), ledger
inmutable de movimientos (F-101) y la sección de **insumos consumidos** dentro del corte, que le
enseña cuánto **debió** gastarse contra lo que hay. La diferencia entre teórico y físico es el
nombre exacto del dinero que se va.

### Dolor 2 · "El reparto de propinas es un pleito cada quincena"

La propina llega revuelta: parte en efectivo en la mano, parte en el voucher de la terminal, parte
en transferencia. Repartirla "proporcional" es cómodo y es mentira, y el mesero que trabajó mesas
de tarjeta siempre sale perdiendo. Además la ley es clara —artículo 346 LFT— y el patrón no puede
quedarse con un porcentaje "de administración". El resultado son discusiones a la medianoche, con
todo el mundo cansado, y meseros que se van.

*Cómo lo resuelve el sistema:* **desglose exacto por método** (F-245), nunca proporcional; propinas
fuera de ventas, costo, utilidad y margen, siempre (F-240); agrupación por mesero y **liquidación
por periodo con folio** (F-246). Falta la variante de reparto por puntos para incluir cocina y
lavaloza (**F-242**), que es lo que piden los restaurantes de más de quince empleados.

### Dolor 3 · "El cierre me toma cuarenta minutos y termino sin saber si cuadró"

Cuenta el efectivo, resta lo que sacó para el gas, suma los vouchers, no le da, vuelve a contar.
A la una de la mañana acepta la diferencia y la anota en un cuaderno que nadie vuelve a abrir.

*Cómo lo resuelve el sistema:* **arqueo a ciegas** (F-232) —se cuenta primero, el esperado aparece
después, calculado por el servidor y no por la pantalla—, cierre bloqueado si quedan mesas abiertas,
y un **PDF del corte** (F-234) con las once secciones que contestan de una sola lectura: cuánto se
vendió, cuánto se gastó, cuánto se debió consumir de insumo, cuánto de propina le toca a cada
mesero y en qué quedó el cajón. Se descarga solo al cerrar, sin que nadie lo pida.

---

## 8 · FUENTES DE LA INVESTIGACIÓN

- Rotación de mesas, tiempos de permanencia y horas pico: [Rappi Merchants](https://merchants.rappi.com/es-co/rotacion-mesas-restaurante), [Modelos de plan de negocios](https://modelosdeplandenegocios.com/blogs/news/restaurante-rotacion-mesa-por-dia)
- KPIs, food cost y utilidad neta: [AI Chef Pro](https://blog.aichef.pro/rentabilidad-restaurante-kpis-metricas-2026/), [PoloTab · Finanzas para restaurantes](https://www.polotab.com/blog/finanzas-para-restaurantes-101-guia-practica-2025-mexico)
- Costos de insumo y salario mínimo 2025-2026: [PoloTab · Sueldos en restaurantes México 2026](https://www.polotab.com/blog/guia-practica-de-sueldos-y-salarios-para-restaurantes-mexico-2026)
- Precios de competencia: [Soft Restaurant · Precios](https://softrestaurant.com/soft-restaurant-precio), [Parrot Software](https://parrotsoftware.com.mx/)
- Propinas, LFT art. 346 y postura de Profeco 2026: [Veritas · Reforma LFT propinas](https://www.veritas.org.mx/Impuestos/Seguridad-social/reforma-a-la-lft-sobre-propinas-en-mexico-2025), [El Imparcial · Profeco 2026](https://www.elimparcial.com/dinero/2026/01/02/no-mas-propinas-en-bares-restaurantes-y-cafes-este-2026-profeco-alerta-sobre-las-nuevas-reglas-que-prohiben-a-los-meseros-cobrar-extra-a-los-consumidores/)
- Robo hormiga y mermas: [Revista Apetito](https://apetitoenlinea.com/robo-hormiga-en-restaurantes-y-hoteles/), [Poster POS](https://joinposter.mx/blog/management/como-evitar-robo-hormiga-restaurante)
- División de cuenta, práctica y límites: [Scrampi](https://scrampi.com/blog/organizar-mesas-comandas-domicilios-restaurante/), [WinCaja](https://wincaja.mx/punto-de-venta-restaurante)
