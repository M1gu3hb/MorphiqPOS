# CONTEXTO MAESTRO — MorphiqPOS

> **Lee este archivo completo antes de responder cualquier cosa sobre MorphiqPOS.**
> Es la fuente de verdad del proyecto. No dependas de memoria de conversaciones: todo lo acordado vive aquí y en `DECISIONES.md`.

Última actualización: 7 de septiembre de 2026
Fase actual: **Fase 1 EN EJECUCIÓN. Corte F1.0 a una tarea de firmarse.**

> **El plan completo de la Fase 1 está en [`docs/fase-1/`](docs/fase-1/00-INDICE-Y-COMO-USAR.md).**
> Fase 1 = fusionar los dos sistemas fuente en una sola aplicación, erradicar Base44 y corregir los defectos de auditoría. Seis cortes, ~74–101 jornadas.
> La ejecuta **Claude Code**, con el prompt de [`docs/fase-1/14-PROMPT-CLAUDE-CODE.md`](docs/fase-1/14-PROMPT-CLAUDE-CODE.md).
> **El desarrollo se abrió el 7 de septiembre de 2026.** El código vive en el repositorio
> `morphiqpos` (local, sin remoto — A-35). El corte F1.0 está construido y verificado;
> falta levantar el entorno con Docker para firmarlo. Ver `docs/fase-1/BITACORA.md`.

---

## 1. Quién es el dueño del proyecto

**Miguel** (`M1gu3hb` en GitHub). Fundador de **Morphiq** (antes MH Astral Systems), marca boutique mexicana de ~4–6 meses de vida que construye sitios web y sistemas de negocio personalizados.

**Cómo trabaja:**
- Habla por **voz a texto**. Si una frase suena rara o incompleta, **pregúntale antes de asumir**. No interpretes por tu cuenta.
- Se comunica en **español mexicano**, directo e informal. Respóndele igual: en español, conciso, sin rodeos ni relleno.
- Trabaja **medio tiempo (~15–20 h/semana) y solo**. También opera un salón de eventos (Jardines Club Hípico). Cualquier plan que ignore esto es ficción.
- Prefiere **preguntas interactivas de opción múltiple** sobre preguntas abiertas que tenga que escribir.
- Valora la crítica honesta. Si una decisión suya es cara o riesgosa, **díselo con la razón concreta**; no lo dejes pasar por complacencia. Pero es su decisión final.

**Su negocio hoy:**
- Lo que más vende: **sitios web**.
- Sistemas de negocio vendidos: **tres**, todos con renta mensual.
  1. **Pastelería Confeti** — el más grande. POS + sitio web + e-commerce.
  2. **Una ferretería** — usa el POS de tiendita. Pagó anual.
  3. **Una tienda** — POS de tiendita.
- Quiere vender más sistemas porque son sus ventas más fuertes, y llegar a **franquicias**.

---

## 2. Qué es MorphiqPOS

> **Primero es la herramienta de venta que hoy le falta para cerrar tratos. Después es la fábrica que evita que se ahogue cuando los clientes se multipliquen.**

**El problema real que resuelve:** la razón número uno por la que Miguel no cierra ventas de sistemas es que **el prospecto no ve nada**. Confían en su palabra o no, y la mayoría no. Ver para creer.

**Cómo se usa:** Miguel llega con el dueño de un restaurante, **activa el modo restaurante** con platillos y fotos ya cargados, y le enseña el sistema funcionando en su tablet, su teléfono y una PC. El dueño dice "¿y si movemos este botón?" o "no quiero que un empleado vea esto". Firman. Miguel se toma **2–3 semanas armando el sistema de ese cliente** con features ya construidas.

**NO es un SaaS.** Miguel es boutique: *no vende sacos, toma medidas*. No habrá punto de venta en línea de autoservicio donde la gente se arme su sistema sola.

**Los cuatro roles de MorphiqPOS:**
1. Herramienta de venta y demostración (el propósito #1).
2. Biblioteca de capacidades reutilizables.
3. Referencia técnica y estándar de calidad de la marca.
4. Laboratorio de features nuevas.

**La meta que ordena toda la arquitectura:**
> Firmar el viernes y **entregar el sistema del cliente en 2–3 semanas.**
> Toda decisión técnica se juzga contra ese número.

---

## 3. De dónde sale — los dos sistemas fuente

MorphiqPOS **no se construye desde cero**. Nace de extraer y endurecer dos sistemas reales que Miguel ya construyó y vendió.

### Fuente A — POS MH Restaurante (el ZIP histórico)
- Construido en **Base44** durante 3–4 meses. Es su sistema más completo y el que más le gusta.
- Vite + React SPA, 244 archivos en `src/`, 25 entidades.
- Cubre: mesas, mesero, cocina/KDS, estaciones, comandas, propinas, precuenta, caja, cortes, inventario, recetas, compras, productos variables y por porción, portal QR del comensal, modificadores, exclusiones "SIN".
- **Qué se toma de aquí: las features, los flujos y las reglas de negocio.** Es conocimiento de operación real que sólo se obtiene construyendo.
- **Qué NO se toma: su arquitectura.** Lógica de negocio dentro de pantallas, 359 accesos directos a datos en 68 archivos, PIN comparado en el navegador, cobro sin transacción, 1,592 errores de tipos, cero pruebas.
- **Base44 queda erradicado por completo.** Sólo se conserva como evidencia histórica.
- Evidencia: paquete `POSMH_FASE_0_CLOUD_COWORK_2026-09-06` (local, no publicado). SHA-256 del ZIP: `1BF6FC7C26E460B7FE763E80074716BA7FA231B999870CB0EF6174102B72BFF3` — **verificado el 7-sep-2026** con `Get-FileHash` sobre el ZIP original: coincide. Se comprobaron además las cifras de la auditoría: 288 entradas, 244 archivos en `src/`.

### Fuente B — POS-MH-Tiendita (repo público `M1gu3hb/POS-MH-Tiendita`)
- POS de tienda/abarrotes. **Ya migrado de Base44 a Next.js + Supabase.**
- Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + TanStack Query. Supabase (Postgres, Auth, Storage, Realtime). Stripe. 29 tablas.
- **Qué se toma de aquí: la arquitectura.** Patrón de repositorios (ningún componente toca Supabase directo), RLS multi-tenant por `negocio_id`, alta de tenant atómica por RPC con rollback compensatorio, `audit_log` sólo escribible por servidor, sesión de servidor en cookies, documentación en `/docs`.
- **Features fuertes ya resueltas:** escáner de código de barras por tres vías (cámara ZXing, físico USB/keyboard-wedge, y remoto desde el teléfono vía Realtime), báscula por Web Serial, venta por peso, mayoreo, fiado, combos, conteos de inventario, historial de precios por trigger, devoluciones, compras con conversión de unidades, vista cliente en segundo monitor.
- **Sus defectos, que NO se heredan:** el cobro normal son 6+ llamadas sueltas desde el navegador sin transacción (la RPC `crear_venta_completa` existe y es correcta pero sólo la usa el sync offline); totales y precios calculados en el cliente; stock con read-then-write y `Math.max(0,…)` que silencia sobreventa; carrito que se cierra al final → un fallo a media venta hace que el cajero reintente y duplique; folio con colisión probable; permisos prácticamente inexistentes (un cajero puede cerrar caja, cambiar precios y editar configuración); no existe alta de empleados; el gate de suscripción está desactivado en código.

### El hallazgo que define la arquitectura
Comparando ambos sistemas, **la divergencia real entre giros son sólo dos cosas**:
1. **Cómo se llena el carrito** — escaneo de código vs. mesa y comanda.
2. **Qué se descuenta del inventario al cobrar** — el mismo SKU vs. una receta de ingredientes.

Todo lo demás coincide: tenant, identidad, configuración, catálogo, sesión de caja, la venta con sus snapshots de costo y utilidad, gastos, auditoría y reportes. **Ese es el núcleo, y está validado por dos implementaciones reales, no inventado.**

---

## 4. Arquitectura acordada

### Forma
Monorepo. **Next.js 14 App Router único** — sin segunda app en Vite. Las pantallas de operación (venta, cocina, mesero) son rutas 100% cliente, así que se sienten como SPA sin partir el proyecto.

**La lógica crítica vive en una API TypeScript con transacciones reales**, conectada directo a Postgres (pg/Drizzle). No en RPCs de PL/pgSQL, no en RLS, no en Edge Functions. RLS se conserva únicamente como defensa en profundidad.

### El modelo de venta — `ordenes` con tres estrategias

Una sola tabla `ordenes` con estrategias intercambiables:

- **Captura:** escaneo · menú táctil · mesa · cita · tienda en línea
- **Cumplimiento:** inmediato · preparación (cocina/KDS) · agendado (cita) · envío · retiro
- **Consumo de inventario:** el SKU mismo · receta/BOM · nada (servicios)

Caja, pagos, costos, clientes y reportes se escriben **una sola vez** y sirven a todos los giros. Es lo que hace posibles las ramas de servicios, espacios, producción y e-commerce sin reescribir el núcleo.

### Multi-tenant
Se conserva `negocio_id` en todas las tablas. **No para SaaS** — para que MorphiqPOS tenga varios negocios de demostración y Miguel cambie de restaurante a ferretería enfrente del prospecto. Multisucursal es un concepto aparte y llega con franquicias.

### Identidad y permisos
- La **terminal** se da de alta una vez y queda autorizada.
- Los **empleados** entran y salen con **PIN de 4–6 dígitos verificado EN SERVIDOR**, con hash lento y límite de intentos. Rápido entre cliente y cliente.
- El **dueño** entra con correo y contraseña desde su teléfono.
- **Permisos por acción, verificados en servidor**, con pruebas negativas por rol. Ocultar botones no es autorización.

### Motor de estilos intercambiables
Tokens (color, tipografía, radio, sombra, espaciado) + **cuatro perillas estructurales**: densidad, escala de redondeo, tipo de elevación, intensidad de movimiento. Con eso se cambia entre estilo premium (Apple/Linear), editorial (Notion/Craft) e industrial/brutalista **sin duplicar componentes**.

Se cambia de estilo como se cambia de modo oscuro. Es feature de producto **y jugada de venta**: frente al dueño, Miguel le cambia el aspecto completo y le pregunta cuál le late.

### Despliegue y portabilidad — requisito duro
Supabase gestionado es el camino por defecto. **Pero el backend completo debe poder correr en el servidor privado del cliente** (una PC potente con Postgres, en su local, sin internet). Miguel lo va a ofrecer como opción de venta: "con internet o sin internet".

**Consecuencia no negociable:** cero lógica de negocio en RLS, en Edge Functions o en cualquier servicio propietario. Todo el backend debe ser desplegable con Docker en una máquina local. **Esta es la regla que impide repetir el error de Base44 con otro proveedor.**

### Offline
**Sin offline por ahora.** Sólo online. El caso de "cliente sin internet" se resuelve con servidor local propio (arriba), no con sincronización offline. El offline real se evalúa cuando un cliente concreto lo exija.

### Suscripciones y Stripe
Sale del núcleo. Se conserva el código de la tiendita como **capacidad opcional `membresias`**, para clientes que sí venden suscripciones (gimnasios, academias, clubes). La cobranza de rentas de Miguel se maneja aparte.

### Pruebas — pirámide mínima obligatoria en el núcleo
- Unitarias: dinero, redondeo, máquinas de estado, cotización.
- Integración contra **Postgres real** (no mocks) para cada comando crítico.
- **Concurrencia real** (dos ventas simultáneas contra el mismo stock, dos aperturas de caja).
- **Inyección de fallos** (interrumpir el cobro a la mitad y verificar que no queda nada a medias).
- **Idempotencia** (el mismo comando tres veces = un solo resultado).
- **Aislamiento de tenant** en todos los comandos y consultas.
- E2E sólo del guion de demostración.
- Presupuesto: ~20–25 % del tiempo.

---

## 5. Modelo de producto — cómo se entrega a un cliente

**Ensamblaje por cliente**, no plataforma multi-inquilino compartida.

- Monorepo con **paquetes versionados** desde el día uno: `core`, `contracts`, `capabilities/*`, `ui`, `registry`.
- El **generador de proyectos NO se construye** hasta que exista el primer cliente real. Sin él no hay trabajo desperdiciado.
- **Regla no negociable:** un proyecto de cliente **declara dependencias, nunca copia código.**

```jsonc
// proyectos/cliente-x/package.json
{ "dependencies": {
    "@morphiqpos/core":       "^1.4.0",
    "@morphiqpos/catalogo":   "^2.1.0",
    "@morphiqpos/ventas":     "^3.0.0",
    "@morphiqpos/caja":       "^2.2.0",
    "@morphiqpos/inventario": "^1.4.0"
}}
```

Si copia archivos, es un fork, y a los dos años son ocho sistemas distintos que nadie entiende. Eso es exactamente el problema que Miguel ya sufre con tres versiones divergentes del POS de restaurante (ZIP / borrador / En vivo).

### Los cuatro niveles de personalización
Toda petición de cliente se clasifica, y siempre se intenta el nivel más bajo:

| Nivel | Qué es | Costo | % esperado |
|---|---|---|---|
| 1. Configuración | Datos: colores, impuestos, catálogo, roles, textos | Minutos | ~70 % |
| 2. Composición | Activar capacidades, elegir perfil de giro, layout, tema, flujos declarados | Horas | ~20 % |
| 3. Extensión | Código del cliente en paquete aislado, sólo por puntos de extensión publicados | Días | ~9 % |
| 4. Núcleo | La petición revela un hueco genérico; se construye para todos | Semanas | ~1 % |
| ~~5. Fork~~ | ~~Copiar el repo~~ | — | **Prohibido** |

Los dos ejemplos que Miguel espera oír de un cliente —"¿movemos este botón?" y "no quiero que un empleado vea esto"— son Nivel 2 y Nivel 1. **Ninguno requiere código.**

### Perfiles de giro certificados
Combinaciones nombradas y probadas en CI (`retail`, `restaurante`, `servicios`…). Un cliente recibe **perfil + deltas**. Sólo perfiles y deltas comunes entran a la matriz de regresión. Sin este eslabón, N capacidades activables = 2^N combinaciones y ninguna probada.

---

## 6. Secuencia de trabajo

### Fase 0 — planeación (AQUÍ ESTAMOS)
Cerrar decisiones, escribir el baseline funcional, firmar ADR, preparar backlog. **Cero código.**

### Corte 0 — Núcleo endurecido + motor de diseño, al mismo tiempo
Extraer el núcleo de la tiendita al monorepo y arreglar sus tres defectos graves —**cobro atómico, permisos reales en servidor, alta de empleados**— construyendo las pantallas sobre tokens desde el primer commit. **Cero features nuevas.**

Al terminar: retail vendible, y todo lo que venga después nace correcto y con diseño.
Desbloquea demos de **tienda, ferretería y farmacia** (son el mismo perfil `retail` + datos sembrados).

### Corte 1 — Restaurante (rama B)
~70 % ya construido, es la demo más fuerte (la comanda apareciendo en cocina es la escena que más impresiona) y **valida la abstracción `ordenes` con una segunda estrategia real**. Una abstracción con una sola implementación está inventada; con dos, está probada.

### Corte 2 — Completar retail
Variantes (talla/color), lotes y caducidad, números de serie. Cubre farmacia, boutique, calzado, celulares y refaccionaria. Amplitud de giros a bajo costo.

### Corte 3 — Servicios y citas (rama C)
Agenda, recursos, comisiones, recordatorios, paquetes. El mercado nuevo más grande y peor atendido en México.

### Cortes posteriores
Espacios y tiempo rentado · producción · omnicanal · membresías · multisucursal para franquicias · hardware · IA y MCP.

### Regla que ordena todo
> **Cada corte debe agregar un capítulo al guion de demostración.**
> Nada entra al roadmap si no aparece en pantalla frente a un prospecto o si no es cimentación obligatoria de algo que sí aparece.

### El guion de demostración — el producto real
| # | Escena | Dispositivo |
|---|---|---|
| 1 | Login con marca Morphiq y logo del negocio de ejemplo | PC |
| 2 | Abrir mesa, agregar platillos con foto, mandar a cocina | Tablet |
| 3 | La comanda aparece en la pantalla de cocina | Teléfono |
| 4 | Cocina marca listo → mesero recibe → entrega | Tablet + teléfono |
| 5 | El comensal escanea el QR y pide su cuenta | **El teléfono del prospecto** |
| 6 | Caja cobra mixto con propina e imprime ticket | PC |
| 7 | El dueño ve venta del día, inventario y utilidad | Teléfono |
| 8 | "¿Qué le cambiarías?" | — |

### Requisitos que impone la demo
- **Funciona sin internet, en red local.** Se demuestra en el local del prospecto donde el wifi es malo o no hay. Todo corre en la laptop de Miguel; tablet y teléfono se conectan por wifi local o hotspot.
- Tablet, teléfono y PC sincronizados **en vivo** (la escena 3 lo exige).
- Reset a estado inicial en un clic entre demos.
- **Datos que no se vean falsos**: platillos con foto, nombres y precios creíbles.
- Cambio de giro delante del cliente.
- Modo presentación (ya existía en el POS de restaurante; se conserva con la contraseña fuera del bundle).

### Horizonte realista
A medio tiempo (~2.25 jornadas/semana): **Fase 0 ~4–5 semanas · Corte 0 ~8–9 semanas.** Termómetro: si a las 14 semanas el Corte 0 no está, el alcance estaba mal y hay que recortarlo, no extenderlo.

Miguel dijo que el tiempo no le importa. La fricción honesta que hay que recordarle: **cada mes sin demo es un mes de tratos que no cierra**, y ese es justo el problema que el proyecto viene a resolver.

---

## 7. El catálogo de capacidades

`docs/07_CATALOGO_DE_GIROS_Y_FEATURES.md` mapea **9 ramas, ~180 capacidades y 30 giros de negocio**, marcando qué ya existe en cada sistema fuente.

Miguel decidió que **todo el catálogo se construirá eventualmente**. Está bien: el total no es lo que importa, **el orden sí**. A medio tiempo son años; el orden decide si puede vender en 3 meses o en 3 años.

**Regla de admisión** (reemplaza a "sólo si un cliente paga", porque hoy no hay cliente esperando):
> Sólo entra al corte actual lo que un negocio real necesitaría para **operar un día completo sin Miguel presente**.

---

## 8. Riesgos vivos

| ID | Riesgo | Mitigación |
|---|---|---|
| **R-09b** | **La demo se puede fingir mucho más rápido de lo que se puede construir.** Es la trampa exacta en la que ya cayó con Base44: pantallas rápidas y bonitas que demuestran bien y no sirven para producción | Cada corte se declara terminado con su propio estándar **`morphiq-prs`** ("zero vibe coding"), que ya tiene escrito como skill |
| **R-10** | Sin fecha, tres meses se vuelven dieciocho | Termómetro de 14 semanas para el Corte 0 |
| **R-02** | ~180 capacidades sin costo estimado se leen como plan cuando son lista de deseos | El catálogo es mapa de ventas, no backlog. Regla de admisión por corte |
| **R-03** | Explosión combinatoria: N capacidades activables = 2^N configuraciones imposibles de probar | Perfiles de giro certificados. Cliente = perfil + deltas |
| **R-04** | El núcleo modelado como restaurante bloquearía las ramas de servicios y e-commerce | **Resuelto** por el modelo `ordenes` con estrategias |
| **R-11** | Heredar los defectos de la tiendita al partir de su código | Compromiso explícito: cobro a transacción real, totales recalculados en servidor y permisos construidos **antes** de agregar una sola feature nueva |

### Señales de que la arquitectura se está desviando
Revisar una vez al mes. Si aparecen dos, se para y se corrige:
1. Un módulo importa código de otro en vez de usar su contrato.
2. Existen dos cálculos distintos de precio, impuesto o stock.
3. Se desactiva una capacidad y algo se rompe o deja datos huérfanos.
4. Un cliente pide algo y la respuesta natural es "copio el repo".
5. Agregar un cliente nuevo cuesta más que el anterior.
6. Un componente de React importa SQL o detalles del proveedor.
7. Una operación crítica necesita varios requests independientes desde la UI.

---

## 9. Estado y qué sigue

### Pendiente de Miguel
1. ~~Verificar el SHA-256 del ZIP~~ — **hecho el 7-sep-2026. Coincide.** Se comprobaron además las cifras de la auditoría: 288 entradas, 244 archivos en `src/`.
2. **Instalar Docker Desktop** (y mover *Disk image location* al disco D). Es lo único que bloquea la firma del corte F1.0.
3. **Decidir si este repositorio se vuelve privado** — ver la advertencia en `README.md`.
4. Formato de ticket en v1: carta / 80 mm / 58 mm / combinación.
5. Nombres de los perfiles: ¿se conservan Esencial / Operativo / Restaurante Pro, o se renombran a `retail` / `restaurante` / `servicios`?

### Pendiente del asistente, cuando Miguel lo autorice
1. ADR de arquitectura con alternativas evaluadas.
2. Baseline funcional del Corte 0 (fichas Given/When/Then, clasificadas CONSERVAR / CORREGIR / RETIRAR / PENDIENTE).
3. Matrices de conservación y de corrección, separadas.
4. Backlog del Corte 0 en tareas pequeñas con criterio de aceptación, prueba y rollback.
5. Presentar go/no-go y **detenerse**.

### Criterios para autorizar el primer commit de código
Los diez de `docs/04_DECISIONES_PREGUNTAS_Y_AUTORIZACION.md` §3. Si uno falla, se sigue en Fase 0.

---

## 10. Flujo de trabajo y agentes

Miguel usa **tres agentes de IA**: Claude Code, Codex y Antigravity. Este repositorio es la **fuente de verdad compartida entre los tres**.

**Reglas para cualquier agente que trabaje aquí:**

1. **Lee `CONTEXTO_MAESTRO.md`, `DECISIONES.md` y `REGLAS.md` antes de proponer nada.** No dependas de memoria de conversación.
2. **Se ejecuta un corte a la vez** (R21), con el prompt de `docs/fase-1/14-PROMPT-CLAUDE-CODE.md`. Antes de escribir una línea, lee `docs/fase-1/BITACORA.md`.
3. **Toda decisión nueva se registra en `DECISIONES.md`** con fecha, alternativas evaluadas, elección y consecuencia. Si no está escrita, no existe.
4. Cuando una decisión previa quede superada, **no borres la anterior**: márcala como superada y apunta a la nueva. La trazabilidad importa más que la limpieza.
5. **Responde en español**, conciso y directo.
6. Miguel habla por **voz a texto**: ante una frase ambigua, pregunta.
7. **Marca siempre** qué es confirmado por evidencia, qué es inferido, qué es propuesta y qué es decisión pendiente de Miguel.
8. **Nunca copies PINs, contraseñas, tokens, correos de usuarios ni datos de clientes** a este repositorio.

**Continuidad entre sesiones:** hay conversaciones locales (Cowork, en la PC de Miguel) y remotas (nube). Cualquiera de las dos debe poder retomar leyendo este repositorio. Al terminar una sesión con acuerdos nuevos, **actualiza `DECISIONES.md` y este archivo antes de cerrar**, y anota en el registro de sesiones de `DECISIONES.md` dónde ocurrió.
