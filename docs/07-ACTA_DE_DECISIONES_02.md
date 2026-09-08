# Acta de decisiones 02 — El propósito real de MorphiqPOS

Fecha: 6 de septiembre de 2026
Estado: **vigente.** Manda sobre los documentos 00–05.

---

## 1. Lo que cambia

Tu explicación corrige mi lectura en un punto que reordena todo el plan.

**Lo que yo entendí antes:** MorphiqPOS es una plataforma en construcción, sin cliente, sin fecha y sin criterio externo de "suficiente".

**Lo que realmente es:**

> MorphiqPOS es, **primero**, la herramienta de venta que hoy te falta para cerrar tratos que estás perdiendo. **Después**, la fábrica que evita que te ahogues cuando esos tratos se multipliquen.

Tres datos tuyos que lo cambian todo:

1. **Ya vendes sistemas.** Tienes dos plantillas en producción: el POS de restaurante (este ZIP) y el de tienda con escáner de códigos, inventario y reportes financieros.
2. **La razón #1 por la que no cierras ventas de sistemas es que el prospecto no ve nada.** Confían en tu palabra o no, y la mayoría no. Ver para creer.
3. **El flujo real de entrega es:** demostrar → el cliente pide ajustes → firmar → **2–3 semanas armando su sistema** con features ya hechas.

Eso significa que MorphiqPOS **sí tiene cliente y sí tiene criterio de éxito medible**. El cliente eres tú y tu gente vendiendo. El criterio no es técnico: es **¿el prospecto vio algo y firmó?**

También significa que "no me importa el tiempo que me tarde" no es del todo cierto, y conviene decirlo: cada mes sin demo es un mes de tratos que no cierras. El tiempo no debe sacrificar la cimentación, pero tampoco es gratis. Volvemos a esto en §7.

**Nombre:** el producto se llama **MorphiqPOS**, con tu marca y tu logo. "Master POS" queda como nombre de la carpeta y del proyecto interno.

---

## 2. Consecuencia 1 — El criterio de "terminado" cambia

Mi regla anterior era: *solo entra al corte lo que un negocio necesitaría para operar un día completo.* Sigue siendo válida para la calidad interna, pero no es la que ordena el trabajo. La que ordena es esta:

> **Cada corte debe agregar un capítulo al guion de demostración.**

Nada entra al roadmap si no aparece en pantalla frente a un prospecto o si no es cimentación obligatoria de algo que sí aparece.

### El guion de demostración (el producto real que hay que construir)

Esto es lo que vas a hacer parado frente a un dueño de restaurante. Cada renglón es un entregable:

| # | Escena | Dispositivo | Qué ve el prospecto |
|---|---|---|---|
| 1 | Login con tu marca y el logo del negocio de ejemplo | PC | "Esto se ve profesional y se puede poner mi marca" |
| 2 | Abrir mesa, agregar platillos con foto, mandar a cocina | Tablet | "Así trabajaría mi mesero" |
| 3 | La comanda aparece en la pantalla de cocina | Teléfono / 2ª pantalla | **El momento que más impresiona.** Dos aparatos hablando en vivo |
| 4 | Cocina marca listo → mesero recibe → entrega | Tablet + teléfono | "El flujo completo funciona" |
| 5 | Comensal escanea el QR, ve el menú, pide su cuenta | El teléfono **del prospecto** | Que lo toque con su propio celular vale más que cualquier explicación |
| 6 | Caja cobra mixto con propina e imprime ticket | PC | "Así cierro yo" |
| 7 | El dueño abre su teléfono y ve venta del día, inventario y utilidad | Teléfono | **El argumento de venta más fuerte para el dueño** |
| 8 | "¿Qué le cambiarías?" | — | Aquí es donde se cierra el trato |

**Fíjate en la escena 8.** Los dos ejemplos que me diste de lo que esperas oír —*"¿movemos este botón para acá?"* y *"no quiero que un empleado vea esto"*— son **Nivel 2 (composición: layout)** y **Nivel 1 (configuración: permisos por rol)** del esquema de `01_MODELO_MASTER_POS.md` §3. Ninguno requiere escribir código. Si la mayoría de las peticiones se parecen a esas, tu promesa boutique es perfectamente sostenible.

---

## 3. Consecuencia 2 — La secuencia se reordena, y el Corte 0 vale mucho más de lo que yo dije

Aquí está el hallazgo importante de esta sesión.

Yo te presenté el **Corte 0 (mostrador)** como cimentación necesaria pero poco vistosa. **Estaba mal.** El Corte 0 es exactamente tu segunda plantilla —la tiendita— y en cuanto esté sembrado con datos, **ya te da tres giros demostrables**.

Un mostrador sólido con catálogo, venta, cobro, caja, corte, ticket e inventario **es** el POS de una tienda. Cambia los datos y es una ferretería. Cambia los datos otra vez y es una farmacia.

### Secuencia revisada

| Corte | Qué construye | Qué desbloquea en ventas | Esfuerzo (medio tiempo) |
|---|---|---|---|
| **Fase 0** | ADR, baseline del mostrador, matrices, backlog | — | 4–5 semanas |
| **Corte 0** | Mostrador completo + marca MorphiqPOS + tenants demo sembrados | **Demos de tienda, ferretería y farmacia.** Escenas 1, 6 y 7 del guion | 8–9 semanas |
| **Corte 1** | Mesas, mesero, cocina/KDS, comandas, entrega, propinas | **Demo de restaurante** — la más vendedora. Escenas 2, 3 y 4 | 7–8 semanas |
| **Corte 2** | Portal QR + panel del dueño en móvil | Escenas 5 y 7 completas. **Guion cerrado** | 4–5 semanas |
| **Corte 3** | Recetas, costos, márgenes, compras, reportes avanzados | El argumento para el dueño que ya sabe de números | 5–6 semanas |
| **Corte 4** | Multisucursal y administración centralizada | **Franquicias**, que es a donde quieres llegar | por definir |

**Al terminar el Corte 0 ya puedes vender.** No dentro de un año: en unos tres meses tienes tres giros demostrables con un sistema que además es real, no una maqueta. Eso resuelve el problema de motivación que yo había señalado.

**Al terminar el Corte 1** tienes el restaurante, que es tu demo más fuerte y el giro que mejor conoces.

Y cada corte sirve dos propósitos a la vez —demostrar y producir— porque es el mismo sistema. Eso es lo que ninguna maqueta te daría.

---

## 4. Consecuencia 3 — No son cuatro giros. Son dos perfiles y datos

Dijiste que quieres poder activarte un restaurante, una ferretería, una farmacia. Buena noticia:

| Giro | Qué es en realidad | Costo |
|---|---|---|
| Restaurante | Perfil `restaurante` | Corte 1 |
| Tienda / abarrotes | Perfil `retail` | **Corte 0** |
| Ferretería | Perfil `retail` + datos + unidades de medida | **Datos, no código** |
| Farmacia | Perfil `retail` + datos + lotes y caducidad | Datos + una capacidad chica |
| Cafetería, panadería, juguería | Perfil `retail` o `restaurante` ligero + datos | **Datos** |

**Dos perfiles bien construidos te dan cinco o seis giros demostrables.** Un tenant de demostración es una fila en la base de datos con productos, categorías, fotos y un tema — no un módulo. Sembrar una ferretería creíble es una tarde de trabajo, no un mes.

Esto es exactamente la mecánica de "perfiles de giro certificados" que propuse en `02_ARQUITECTURA_CONCEPTUAL.md` §5, y ahora tiene una justificación comercial concreta además de la técnica.

---

## 5. Consecuencia 4 — La demo impone requisitos que yo no había listado

Estos son obligatorios y ninguno estaba en mi plan. Entran al Corte 0.

| Requisito | Por qué | Nota |
|---|---|---|
| **Funciona sin internet, en red local** | Vas a demostrar en el local del prospecto, donde el wifi es malo o no hay. Un demo que depende de internet es un demo que falla enfrente del cliente | **Tu decisión de construir todo local no era solo por costo: es literalmente el requisito de la demo.** Tu instinto fue correcto. Todo corre en tu laptop; tablet y teléfono se conectan por wifi local o tu hotspot |
| **Tablet, teléfono y PC a la vez, en vivo** | La escena 3 (comanda apareciendo en cocina) es la que más impresiona, y necesita dos aparatos sincronizados frente al cliente | Obliga a resolver sincronización en tiempo real desde el Corte 1, no "después" |
| **Reset a estado inicial en un clic** | Después de cada demo hay que dejarlo limpio para la siguiente | Comando de siembra idempotente |
| **Datos que no se vean falsos** | "Producto 1, Producto 2, $100" mata la venta. Necesitas platillos con foto, nombres reales, precios creíbles | Es trabajo de contenido, no de código. Se puede ir juntando desde ya |
| **Cambio de giro delante del cliente** | "Ahora te lo enseño en modo restaurante" | Selector de tenant de demostración |
| **Modo presentación** | Ocultar datos sensibles, evitar cambios accidentales durante la demo | Ya lo habías inventado: existe en tu sistema actual (`modo_presentacion_activo`). Buena idea, se conserva — pero con la contraseña fuera del bundle |
| **Tu marca, no la del cliente** | MorphiqPOS con tu logo, y el negocio de ejemplo con el suyo | El sistema de temas del `02_` lo resuelve |

---

## 6. La meta que ordena la arquitectura: 2–3 semanas por cliente

Me diste un número medible sin darte cuenta, y es el mejor criterio de diseño de todo el proyecto:

> **Firmar el viernes y entregar el sistema del cliente en 2–3 semanas.**

Todo lo que propuse en los documentos anteriores se debe juzgar contra eso. Si una decisión de arquitectura hace que armar un cliente tome cinco semanas, esa decisión está mal aunque sea elegante.

Y explica por qué la regla de A-01 no es negociable:

> **Un proyecto de cliente declara dependencias. Nunca copia código.**

Armar en 2–3 semanas solo es posible si esas semanas se van en **configurar, sembrar, adaptar y probar** — no en depurar código copiado. Si copias, la semana 2 se va en encontrar por qué el módulo de caja se comporta distinto en ese proyecto.

---

## 7. R-09 revisado

El riesgo que había marcado como número uno cambia de forma. Ya no es "sin criterio de suficiente" —tienes uno excelente—, sino este:

### R-09b — La demo se puede fingir mucho más rápido de lo que se puede construir

La tentación va a ser enorme, y es la trampa exacta en la que ya caíste con Base44: pantallas rápidas y bonitas que demuestran bien y no sirven para producción. Si cedes, terminas con una tercera plantilla desechable y el problema de fondo intacto.

**La defensa:** cada corte se declara terminado con tu propio estándar, la skill **`morphiq-prs`** que ya tienes escrita. Ese es tu "zero vibe coding" y es exactamente el mecanismo de definición de terminado que este plan necesitaba. No hay que inventar nada: aplícalo a cada corte antes de dar el siguiente.

### R-10 — Sin fecha, tres meses se vuelven dieciocho

Dijiste que no te importa el tiempo. Entiendo por qué —no hay cliente esperando— pero hay un costo real: cada mes sin demo es un mes de tratos que no cierras, y ese es justo el problema que este proyecto viene a resolver.

**Propuesta:** no una fecha rígida, sino un compromiso con el **Corte 0 en unas 12–14 semanas** (Fase 0 + Corte 0, a medio tiempo). Si a las 14 semanas no está, el diagnóstico no es "voy lento": es que el alcance del corte estaba mal y hay que recortarlo, no extenderlo.

**Mientras tanto no estás ciego:** tu POS de restaurante actual sigue funcionando y lo puedes seguir demostrando. La única regla es la obvia: **demuestra solo lo que puedas entregar.** Si cierras un trato hoy, lo entregas con lo que tienes hoy. Eso ya es tu negocio actual y no cambia.

---

## 8. Lo que necesito de ti

### Prioridad 1 — El proyecto de la tiendita

Es la acción de mayor valor ahora mismo, y para ti cuesta casi nada: **copia ese proyecto (o su ZIP) a `D:\MIS PROYECTOS\Master POS\01_FUENTES_TIENDITA\` y avísame.**

Tres razones concretas:

1. **Valida la abstracción de A-02.** Tengo dos sistemas reales que comparar. Donde restaurante y tienda coinciden, está el núcleo verdadero. Donde difieren, están los perfiles. Una abstracción sacada de dos implementaciones reales es sólida; sacada de una sola, es inventada. Es la diferencia entre acertar y adivinar.
2. **El Corte 0 es literalmente ese sistema.** Su modelo de datos, sus reportes financieros y su manejo de códigos de barras son la especificación del primer corte. Sin verlo, escribo el baseline del mostrador a ciegas.
3. **Puede que ya tengas resuelto el escáner**, que es hardware y suele ser más latoso de lo que parece.

Si es también de Base44, no importa: lo trato como evidencia histórica igual que el otro, sin copiar nada.

### Prioridad 2 — Decisión A-02

La única de Nivel 1 que sigue abierta, y ahora pesa más: si vas a demostrar restaurante, retail, ferretería y farmacia con el mismo sistema, el núcleo **no puede** estar modelado como venta de restaurante.

Mi recomendación se refuerza: **`Orden` genérica con estrategias de cumplimiento** (`02_ARQUITECTURA_CONCEPTUAL.md` §2). Hoy cuesta nombrar bien tres tablas. Con clientes entregados, cuesta reescribir el núcleo de ventas.

Prefiero decidirla **después** de ver la tiendita, porque ahí se confirma o se corrige con evidencia.

### Prioridad 3 — Confirmar

- La secuencia de cortes del §3 y el compromiso de ~12–14 semanas para el Corte 0.
- Q-06: formato de ticket en v1 (carta / 80 mm / 58 mm / combinación).
- Q-13: ¿los perfiles se llaman Esencial / Operativo / Restaurante Pro, o se renombran ahora que hay giros reales (`retail`, `restaurante`, `servicios`)?

---

## 9. Nota de trabajo

Usas voz a texto. Anotado: si una frase me suena rara, pregunto antes de asumir en vez de interpretar por mi cuenta.

**Sigo sin escribir código.**
