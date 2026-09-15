# 04 · SISTEMA DE DISEÑO · lo que se mantiene y lo que cambia

Miguel fue explícito en dos cosas que parecen contradecirse y no se contradicen:

> "No quiero que ninguna sección se vea igual que otra. Porque si es así, ¿qué chiste que separemos los modelos de negocio?"

> "No hacerlo diferente porque sí. Sino de una manera que sea más sencilla para operarse acorde al modelo de negocio."

La resolución es ésta: **lo que cambia es la estructura de la pantalla; lo que no cambia son los átomos.** Un botón se ve igual en los 78 modelos. Lo que cambia es qué botón es el grande, dónde está, qué dice, y qué hay a su alrededor.

Si cambiáramos los átomos, tendríamos 78 productos que mantener. Si no cambiáramos la estructura, tendríamos uno genérico con una máscara. Ninguna de las dos sirve.

---

## 1 · LOS CIMIENTOS · idénticos en los 78

Esto no se toca nunca. Es lo que hace que siga siendo **un** producto.

**Tipografía**
Una sola familia, una sola escala. Los tamaños salen de la escala, no del capricho. El texto de datos numéricos siempre en cifras tabulares — una columna de precios que baila es una columna que no se puede leer.

**Color**
La paleta de Miguel, ya definida en su `index.css`. Los semánticos son universales y no se negocian:
- verde = confirmado, cobrado, disponible, listo
- ámbar = pendiente, por vencer, atención
- rojo = error, vencido, agotado, cancelado
- azul = informativo, en proceso

Un giro **no** cambia lo que significa el rojo. Lo que cambia es **qué cosa se pinta de rojo**: en restaurante, un platillo que lleva 20 minutos en cocina; en farmacia, un lote que caduca esta semana; en taller, una orden que pasó su fecha prometida.

**Espaciado y radios**
Escala única, de tokens. Cero valores sueltos.

**Componentes base**
Botón, campo, selector, tabla, tarjeta, diálogo, pestaña, aviso, insignia. Se ven igual en todos lados. Se construyen una vez en `packages/ui`.

**Comportamientos**
- Toda acción destructiva confirma.
- Todo error dice qué pasó y qué hacer.
- Todo estado de carga tiene esqueleto, no spinner suelto.
- Todo campo de dinero se alinea a la derecha.
- Toda tabla larga tiene su cabecera fija.
- Nada se mueve solo debajo del dedo.

**Accesibilidad — mínimos de todos los modelos**
- Contraste 4.5:1 en texto normal, 3:1 en texto grande.
- Objetivo táctil mínimo 44×44 px. En giros con guantes o prisa, 56×56.
- Todo operable con teclado. Foco visible siempre.
- El color nunca es el único portador de significado.

---

## 2 · LOS SEIS EJES DE DIFERENCIACIÓN

Aquí es donde un modelo se separa de otro. Cada uno de los 78 toma una posición en estos seis ejes, y **la posición sale del negocio, no del gusto**.

### Eje A · Cuál es la pantalla de inicio

La primera pantalla al entrar es la declaración de identidad del sistema. No es "el dashboard" por omisión.

| Si el negocio... | Abre en | Porque |
|---|---|---|
| cobra decenas de veces por hora | la pantalla de cobro | el cajero no quiere ver gráficas, quiere cobrar |
| gira alrededor de un salón | el mapa de mesas | lo primero es saber qué está ocupado |
| trabaja con citas | la agenda de hoy | el día ya está escrito, hay que leerlo |
| recibe objetos | el tablero de órdenes | qué entró, qué está listo, qué se entrega |
| vende a crédito | la cartera del día | quién debe y quién vence |
| renta espacio | el calendario de ocupación | cuántas unidades libres quedan |
| es de proyecto | el embudo | dónde está cada trato |

### Eje B · Cuál es la acción principal

Una sola, por pantalla. La que se hace el 80% de las veces. Debe ser la más grande, estar en el camino del pulgar en móvil, y alcanzarse sin pensar.

En restaurante es *abrir mesa*. En abarrotes es *escanear*. En estética es *iniciar cita*. En taller es *recibir*. En hotel es *check-in*. Si no puedes nombrar la acción principal de una pantalla en una palabra, la pantalla está mal diseñada.

### Eje C · Cuál es la unidad de trabajo

Cada giro organiza el día alrededor de un objeto. Ese objeto manda en la navegación, en el vocabulario y en el dashboard.

```
restaurante ....... la mesa
abarrotes ......... el ticket
estética .......... la cita
taller ............ la orden
hotel ............. la habitación-noche
mayorista ......... el pedido
gimnasio .......... el socio
panadería ......... el lote
ruta .............. la visita
agencia ........... el proyecto
```

### Eje D · Densidad de información

No todos los giros quieren ver lo mismo de golpe.

- **Densidad alta** — mucha fila, poca decoración: abarrotes, ferretería, farmacia, mayorista. Quien opera busca un dato entre miles y lo necesita rápido.
- **Densidad media** — tarjetas con jerarquía: restaurante, taller, veterinaria.
- **Densidad baja** — pocos elementos grandes: food truck, estética pequeña, cualquier cosa que se opere de pie y con prisa.

### Eje E · Dispositivo principal

Decide qué layout se diseña primero. **No todos los giros son "escritorio primero".**

| Giro | Principal | Secundario |
|---|---|---|
| restaurante | tablet (mesero) | PC (caja) |
| abarrotes | PC con lector | teléfono (dueño) |
| estética | tablet (recepción) | teléfono (estilista) |
| taller | teléfono (técnico en bahía) | PC (recepción) |
| ruta / reparto | **teléfono** | PC (liquidación) |
| hotel | PC (recepción) | tablet (ama de llaves) |
| agencia | PC | teléfono |

El layout del dispositivo principal se diseña primero y con detalle. Los otros dos se derivan.

### Eje F · Ritmo de uso

- **Ráfaga** — cientos de operaciones cortas seguidas. Cero fricción, atajos de teclado, foco que no se pierde. Abarrotes, farmacia, cafetería en hora pico.
- **Sostenido** — operaciones medias a lo largo del día. Restaurante, estética.
- **Episódico** — pocas operaciones largas y cuidadosas. Taller, mayorista, inmobiliaria. Aquí sí caben formularios largos y confirmaciones.

Un formulario de tres pasos es correcto en una inmobiliaria y es un desastre en una tienda de abarrotes.

---

## 3 · EL VOCABULARIO · F-017

La misma entidad se llama distinto en cada giro. **Esto no es cosmético: es la diferencia entre un sistema que se siente propio y uno que se siente prestado.**

Se resuelve con un diccionario por plantilla, no duplicando pantallas. Una entidad interna, N nombres visibles.

```
entidad interna    restaurante   estética    taller      hotel        deportivo
─────────────────────────────────────────────────────────────────────────────
unidad_servicio    mesa          cabina      bahía       habitación   cancha
orden              cuenta        cita        orden       reserva      reserva
linea_orden        platillo      servicio    concepto    consumo      —
responsable        mesero        estilista   técnico     recepción    —
cliente            comensal      cliente     propietario huésped      socio
preparacion        cocina        —           taller      —            —
```

**Reglas del diccionario:**
1. Se define en la plantilla, no en el componente.
2. Lleva singular, plural y género — el español lo exige. "La mesa" / "el bahía" mal conjugado delata el sistema inmediatamente.
3. Si un giro no usa una entidad, no se traduce: se apaga.
4. Los mensajes de error y los estados vacíos **también** se traducen. Es donde más se nota el descuido.

---

## 4 · EL DASHBOARD · F-056

Miguel lo dijo sin que hiciera falta pedirlo: **en cada negocio es totalmente diferente.** Tiene razón, y hay una regla que lo hace verificable.

> Cada indicador del dashboard existe porque **hay una decisión que el dueño toma al verlo**. Si no puedes nombrar la decisión, el indicador no va.

Ejemplos de la regla aplicada:

| Giro | Indicador | Decisión que dispara |
|---|---|---|
| restaurante | ticket promedio por mesero | a quién capacito en sugerir postre |
| abarrotes | productos bajo mínimo | qué pido hoy al proveedor |
| farmacia | lotes que caducan en 30 días | qué remato esta semana |
| estética | ocupación de agenda mañana | a quién llamo para llenar huecos |
| taller | órdenes que pasaron su fecha | a quién le hablo antes de que hable él |
| hotel | ocupación de esta noche | bajo tarifa o no |
| gimnasio | socios que no vienen hace 15 días | a quién retengo antes de que se dé de baja |
| ruta | visitas sin venta | qué cliente está comprando en otro lado |

**Prohibido en todos:** indicadores que se ven bonitos y no disparan nada. "Total histórico de ventas" no es un indicador, es un adorno.

**Lo que también cambia:** cuántos indicadores. Un food truck necesita tres. Una distribuidora con rutas necesita doce. Meterle doce al food truck es hacerle daño.

---

## 5 · EL CORTE Y SU PDF · F-234

Otro punto que Miguel señaló y que tiene consecuencias más hondas de lo que parece.

El corte **no es un formato con secciones opcionales**. Es un documento distinto por giro, porque contesta una pregunta distinta:

| Giro | El corte contesta |
|---|---|
| restaurante | ¿cuadró la caja y cuánto le toca a cada mesero de propina? |
| abarrotes | ¿cuadró la caja y qué producto falta contra lo que debería haber? |
| farmacia | ¿cuadró la caja y qué se vendió de controlados? |
| estética | ¿cuadró la caja y cuánto le toca a cada estilista de comisión? |
| taller | ¿cuánto entró de anticipos y cuánto de órdenes entregadas? |
| hotel | ¿cuánto se cobró del turno y qué quedó cargado a habitaciones abiertas? |
| ruta | ¿el repartidor entregó lo que cargó y trajo el dinero que corresponde? |

Reglas del corte, en todos:
1. **El arqueo va a ciegas.** Nunca se muestra lo esperado antes de contar. Esto ya está decidido y documentado, y se respeta en los 78.
2. **El esperado lo calcula el servidor**, nunca la pantalla. Es fondo + movimientos, no "ventas en efectivo".
3. El PDF lleva folio, sucursal, terminal, quién cerró y a qué hora.
4. Lo que no aplica al giro **no aparece**, ni siquiera en cero. Una sección "Propinas: $0.00" en una ferretería es ruido que hace dudar del resto.

---

## 6 · CÓMO SE DOCUMENTA UNA PANTALLA

Formato obligatorio en `04-INTERFAZ.md` de cada modelo. Ejemplo del nivel de detalle que se espera:

```
PANTALLA · Cobro
Propósito ......... convertir un carrito en una venta cobrada
Frecuencia ........ 150–400 veces al día · cajero
Acción principal .. COBRAR (una sola tecla: F12 o el botón grande)
Primero se ve ..... el total, en el tamaño más grande de la pantalla
Jerarquía ......... 1 total · 2 métodos de pago · 3 el desglose del carrito

PC (≥1280)
  ┌───────────────────────────┬──────────────────┐
  │ carrito (scroll)          │  TOTAL $ 439.00  │
  │ 1 × Arrachera    280.00   │                  │
  │ 2 × Cerveza       80.00   │  [ EFECTIVO  ]   │
  │                           │  [ TARJETA   ]   │
  │                           │  [ MIXTO     ]   │
  │                           │                  │
  │ subtotal / IVA / desc.    │  [ COBRAR F12 ]  │
  └───────────────────────────┴──────────────────┘

Tablet (768–1279)
  El carrito arriba, el bloque de cobro fijo abajo, a la altura del pulgar.

Teléfono (<768)
  Sólo el total y los tres métodos. El carrito se colapsa a "12 artículos ▾".

Estado vacío ...... "Escanea o busca un producto para empezar" + el foco
                    ya puesto en el campo de búsqueda
Atajos ............ F12 cobrar · F2 buscar · ESC limpiar · +/- cantidad
NO va aquí ........ reportes, configuración, historial. Nada que distraiga
                    de cobrar.
```

Una pantalla documentada con menos detalle que eso **no está documentada**.

---

## 7 · LAS TRES PRUEBAS DE UNA PANTALLA

Antes de dar por buena cualquier pantalla de cualquier modelo:

**Prueba del recién llegado.** Alguien que entró a trabajar hoy, que conoce el giro pero no el sistema. ¿Puede hacer la acción principal sin que nadie le explique?

**Prueba de la hora pico.** Con prisa, con gente esperando, con ruido. ¿La acción principal se alcanza sin buscar? ¿Se puede deshacer un error rápido?

**Prueba del vecino.** Pon esta pantalla al lado de la misma pantalla del modelo más parecido. ¿Se distinguen? Si no, o falta trabajo, o los dos modelos deberían ser uno.
