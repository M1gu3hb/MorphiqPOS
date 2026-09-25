# 05 · DECISIONES

Bitácora. **No se borra nada.** Una decisión revertida se marca como derogada y se explica por qué, pero se queda escrita. Quien retome el trabajo tiene que poder saber no sólo qué se decidió, sino qué se descartó y por qué.

Formato: `D-NN · fecha · título` → contexto, decisión, consecuencia.

---

## D-01 · 14-09-2026 · Las tres plantillas actuales se renombran a modelos de negocio

**Contexto.** Hoy existen tres paquetes: `esencial`, `operativo`, `restaurante_pro`. Son niveles comerciales, no modelos de negocio. Miguel pidió que cada plantilla lleve el nombre del modelo de negocio al que sirve.

**Lo que tiene hoy cada uno:**

| | esencial | operativo | restaurante_pro |
|---|---|---|---|
| Dashboard, Caja, Ventas, Productos, Registros, Configuración | ✓ | ✓ | ✓ |
| Inventario, Compras, Recetas, Portal QR | | ✓ | ✓ |
| Mesero, Cocina | | | ✓ |

**Decisión.**

```
restaurante_pro  →  restaurante
operativo        →  cafeteria
esencial         →  tienda
```

**Por qué `cafeteria` para operativo.** Operativo tiene recetas, inventario, compras y portal QR, pero **no** tiene mesero ni cocina. Eso es exactamente un negocio de alimentos que se opera desde el mostrador: cafetería, juguería, fonda, food truck, taquería de mostrador. `cafeteria` es el nombre más reconocible de ese conjunto y el que mejor vende.

**Por qué `tienda` para esencial.** Esencial vende sin controlar stock. Como modelo de negocio eso no existe: una tienda sin inventario no es una tienda, es una calculadora. Así que `tienda` **no es sólo un renombre: es un renombre más las funciones que le faltan** para ser fiel a su nombre.

**Consecuencia — lo que hay que construir para que cada nombre sea honesto:**

- `tienda` necesita **F-111** (stock simple), **F-112** (presentaciones), **F-029/F-986** (código de barras) y **F-107** (alertas de mínimo). Sin eso el nombre miente.
- `cafeteria` necesita revisarse contra el modelo real: probablemente le falten **F-030** (combos) y **F-820** (domicilio).
- `restaurante` está casi completo, pero la Fase 1 dejó pendientes suyos: **F-321** (dividir cuenta), **F-302** (unir mesas), **F-315** (tiempos por platillo), **F-318** (impresión de comanda).

**Encaja con los datos vivos.** Los cuatro negocios en la base tienen giro `restaurante`, `cafeteria`, `tienda` y `ferreteria`. Los tres primeros quedan cubiertos por su plantilla homónima. **Ferretería La Broca**, que hoy está en `operativo`, pasa a `tienda` de forma provisional hasta que exista la plantilla `ferreteria` (que es `tienda` + F-112 + F-145 corte de material).

**Reversible.** Es un renombre de tres valores y una migración de datos. Si Miguel prefiere otros nombres, se cambia aquí y se propaga.

---

## D-02 · 14-09-2026 · Diez arquetipos, no setenta y ocho plantillas

**Contexto.** El mapa general identificó 78 modelos de negocio. Construir 78 plantillas independientes es inviable y además está mal: se duplicaría casi todo.

**Decisión.** Se definen **diez arquetipos**. Cada modelo de negocio es **un arquetipo más un conjunto de deltas**. Un modelo puede componer dos o tres arquetipos (una panadería es Producción + Mostrador; un hotel es Espacio + Mostrador + Suscripción).

**Consecuencia.** El trabajo de la Fase 2 se planifica por arquetipo, no por modelo. Terminar un arquetipo desbloquea decenas de modelos de golpe. Las carpetas de modelo siguen existiendo las 78, porque la documentación de operación, interfaz y dinero **sí** es específica de cada negocio aunque el esqueleto se comparta.

---

## D-03 · 14-09-2026 · Los átomos no cambian; la estructura sí

**Contexto.** Miguel pidió que ninguna sección se vea igual entre modelos, pero también que la diferencia no sea arbitraria.

**Decisión.** Tipografía, color, espaciado, radios, componentes base y comportamientos son **idénticos en los 78**. Lo que cambia es la estructura de cada pantalla, según los seis ejes de diferenciación de `04-SISTEMA-DE-DISENO.md`: pantalla de inicio, acción principal, unidad de trabajo, densidad, dispositivo principal y ritmo de uso.

**Consecuencia.** Se mantiene **un** `packages/ui`, no 78. Una mejora de accesibilidad en el botón beneficia a todos los clientes el mismo día.

---

## D-04 · 14-09-2026 · El vocabulario se resuelve con diccionario, no duplicando pantallas

**Contexto.** La misma entidad se llama "mesa", "cabina", "bahía", "habitación" o "cancha" según el giro. Miguel señaló que si el sistema no habla como el negocio, se nota.

**Decisión.** Una entidad interna, N nombres visibles, resueltos por un diccionario declarado en la plantilla (**F-017**). Incluye singular, plural y género — el español lo exige. Aplica también a mensajes de error y estados vacíos.

**Descartado:** duplicar componentes por giro. Multiplicaría el mantenimiento por 78 y garantizaría que las correcciones lleguen a unos giros sí y a otros no.

---

## D-05 · 14-09-2026 · Se construye aparte, con los contratos de adentro

**Contexto.** Codex sigue cerrando la Fase 1 en `carril-b`. Trabajar los dos en el mismo árbol garantiza conflictos.

**Decisión.** La Fase 2 vive en `D:\MIS PROYECTOS\Master POS\fase-2\`, fuera de los dos worktrees. Se construye **como si ya estuviera dentro**: mismos contratos (`comando()`, el puente, el ámbito de sesión, bigint de centavos), misma estructura de carpetas que tendría en el monorepo. Las migraciones se escriben numeradas y listas, **pero no se aplican en la Fase 2** — la Fase 2.3 las aplicó el 16-09-2026 (F2.3-REGLAS §2 y §4).

**Consecuencia.** Acoplar es mover carpetas y aplicar migraciones. Nunca reescribir. `FILE-MAP.md` de cada modelo declara la ruta exacta de destino de cada archivo.

---

## D-06 · 14-09-2026 · Todo el contexto vive en archivos, no en sesiones

**Contexto.** Miguel: *"Por si a mí se me hinchan los huevos y abro una sesión nueva, que continúe donde lo dejó."*

**Decisión.** Ninguna decisión, ningún avance y ningún criterio vive sólo en la memoria de una sesión. `00-LEEME-PRIMERO.md` es el punto de entrada; `07-ESTADO.md` dice qué falta; este archivo dice por qué las cosas son como son.

**Consecuencia.** Al terminar cualquier modelo se actualiza `07-ESTADO.md` **en el mismo turno**. Una carpeta terminada que no está marcada en el estado es una carpeta que se va a volver a hacer.

---

## D-07 · 14-09-2026 · El código de la Fase 2 vive en su propia rama y su propio worktree

**Contexto.** D-05 dijo "se construye aparte". Faltaba decir **dónde**, y la respuesta importa: para escribir código que compile, tipe y pase pruebas hace falta el monorepo entero, no una carpeta suelta de archivos sueltos.

**Decisión.** Un worktree nuevo, rama nueva, partiendo de `carril-b`:

```
git worktree add "D:\MIS PROYECTOS\Master POS\morphiqpos-fase2" -b fase-2 carril-b
```

- Directorio distinto al de Codex (`morphiqpos-codex`), así que no se pisan.
- Rama distinta, así que acoplar es un `git merge`, no un copiar y pegar.
- Monorepo completo: `pnpm install`, `typecheck`, `test:unit` y el arnés de mutación funcionan desde el minuto uno.

**Consecuencia.** `carril-b` va a seguir moviéndose mientras Codex cierra la Fase 1. Eso está previsto: se hace `git merge carril-b` cada vez que Codex publique, y se resuelven los conflictos en caliente en vez de acumularlos.

**Lo que NO cambiaba EN LA FASE 2:** las migraciones se escribían y **no se aplicaban** a `wyqmzhliurwyxuyxznpb`. **DEROGADO en la Fase 2.3** (F2.3-REGLAS §2): se aplicaron las 70 el 16-09-2026, en una sola transacción, con respaldo restaurado y ensayo sobre una copia con datos. Las pruebas unitarias no necesitan Postgres (`vitest.config.ts` excluye las de integración y ninguna unitaria abre conexión), así que la puerta de calidad funciona igual.

---

## D-08 · 14-09-2026 · Rangos de numeración de migraciones, uno por modelo

**Contexto.** Cinco agentes documentaron cinco modelos en paralelo y cada uno numeró sus migraciones por su cuenta. Ya hay solapamientos declarados. Si eso llega al código, el ejecutor —que valida por hash y aborta— revienta.

**Estado real:** 24 migraciones **aplicadas** a la base, la última es la 056 (cuota atómica de archivos). Pero **en disco, en `carril-b`, ya existe `057_resumen_pagos_por_orden.sql`**, escrita por Codex y todavía sin aplicar. La Fase 2 empieza en **058**.

> Corregido el 14-09-2026 tras la revisión adversarial del prompt F2-01. La versión anterior de esta decisión decía 057 y habría chocado de frente con el ejecutor, que valida por hash y aborta.

**Decisión — rangos cerrados, nadie sale del suyo:**

```
058 – 069   tronco compartido: plantilla, vocabulario, variantes de inventario
070 – 079   restaurante
080 – 089   cafeteria
090 – 109   abarrotes
110 – 129   ferreteria
130 – 159   estetica-salon   (A3 nace de cero, necesita el rango más ancho)
160 – 199   reservado
```

**Antes de numerar nada, lista `packages/data/src/migraciones/sql/` y arranca en el siguiente libre real.** Codex sigue trabajando y puede haber escrito más.

**Consecuencia.** Todo número que aparezca en los `05-DATOS-Y-BACKEND.md` ya escritos hay que renumerarlo a su rango. Y al renumerar hay que **arreglar las referencias cruzadas**: por ejemplo `cafeteria/FILE-MAP.md` dice que su migración 077 depende de la 066 de `restaurante`. Si se renumera una y no la otra, la dependencia queda apuntando al vacío.

---

## D-09 · 14-09-2026 · No se editan archivos de `heredado/` mientras Codex trabaje

**Contexto.** Cuatro de los cinco modelos tocan pantallas que viven en `apps/web/heredado/`. Codex está arreglando ahí mismo las propinas, el bucle de cobro y `qr_token`. Editar los mismos archivos en dos ramas garantiza conflictos en el peor sitio: el que maneja dinero.

**Decisión.**
- Todo lo nuevo se escribe en `packages/` y en `apps/web/app/` — archivos nuevos, cero conflicto.
- Cuando una pantalla existente de `heredado/` tenga que cambiar, **se escribe el componente nuevo al lado** (por ejemplo `heredado/components/caja/DividirCuentaDialog.jsx`) y en `FILE-MAP.md` se anota **el cambio exacto de una línea** que hará falta en el archivo viejo al acoplar.
- Un archivo nuevo dentro de `heredado/` sí se permite. Lo que no se permite es **modificar uno que ya existía**.

**Excepción única:** si Codex ya publicó su cierre de Fase 1 y `carril-b` está fusionada a `main`, esta restricción queda derogada. Anótalo aquí cuando pase.

> **Derogada.** `carril-b` está fusionada a `main` (lo dice el encargo de la etapa 2.35 y la
> rama ya no recibe trabajo). Anotado el 22-09-2026, en el cierre de la 2.35 —tarde: el
> encargo pedía anotarlo al pasar—. Lo que rige ahora sobre `heredado/` es D-14 y
> `verify:aspecto`: se puede cambiar, a propósito y moviendo su base, nunca a escondidas.

---

## D-10 · 14-09-2026 · `btree_gist` está disponible; el solape de citas no es bloqueante

**Contexto.** La carpeta de `estetica-salon` marcó como riesgo bloqueante que Supabase pudiera no ofrecer `btree_gist`, que es lo que permite una restricción de exclusión para impedir que dos citas se encimen en la misma silla.

**Verificado en vivo contra `wyqmzhliurwyxuyxznpb`:** `btree_gist` versión **1.7**, disponible, no instalada. `pg_cron` 1.6.4 ya instalada. `pg_trgm`, `unaccent`, `pgcrypto` y `uuid-ossp` instaladas.

**Decisión.** La restricción de exclusión GiST se usa. La migración habilita la extensión.

**Con una condición, aprendida de la Fase 1:** `pg_cron` rompió el ensayo de restauración en un Postgres pelón. `btree_gist` viene en contrib estándar y es mucho más seguro, pero la migración sigue el mismo patrón que Codex dejó: **si la extensión no está disponible, avisa y continúa**, y se degrada a una comprobación en el comando. Nunca `create extension` a pelo.

---

## D-11 · 14-09-2026 · Reconciliar el catálogo es la tarea cero

**Contexto.** Los cinco agentes propusieron cerca de **50 IDs de función nuevos**, cada uno por su lado, más reclasificaciones.

**Las colisiones reales, verificadas archivo por archivo el 14-09-2026:**

| ID | Lo que pidió `cafeteria` | Lo que pidió `abarrotes` |
|---|---|---|
| **F-146** | merma de barra | caducidad sin lote |
| **F-148** | frescura del grano | EAN-13 con peso embebido |

Y sólo esas dos. `estetica-salon` **ya deconflictó a mano** —leyó lo que propuso `abarrotes` y arrancó en F-154 a propósito, está escrito en su §6— así que no choca con nadie.

> Corregido tras la revisión adversarial. La versión anterior afirmaba una colisión en F-154/F-155 que **no existe**, y no veía las dos que sí. Un agente enviado a arbitrar la falsa habría resuelto una no-colisión y embarcado las dos verdaderas en el código.

**Agravante que hay que atender al reconciliar:** `estetica-salon/FILE-MAP.md` §3 ya cita F-146 con la acepción de `abarrotes` (caducidad sin lote). Al asignar el ID definitivo hay que arrastrar esa cita.

**Decisión.** Antes de escribir una línea de código se reconcilia `03-CATALOGO-DE-FUNCIONES.md`: se leen los cinco `01-FUNCIONES.md`, se recogen todas las propuestas, se resuelven colisiones asignando IDs definitivos, se aplican las reclasificaciones, y **se corrigen los cinco archivos** para que citen el ID definitivo.

**Por qué primero.** Un ID mal asignado no se nota hasta el modelo 40, y para entonces hay cuarenta carpetas que citan el número equivocado.

---

## D-12 · 14-09-2026 · El renombre de plantillas se migra POR GIRO, no por paquete

**Contexto.** D-01 renombra `operativo → cafeteria`. Escrito como un `update` plano sobre la columna `paquete`, eso arrastra a **Abarrotes Don Chuy y Ferretería La Broca** —que hoy están en `operativo`— a la plantilla `cafeteria`. Dos clientes que pagan, operando, con la plantilla de un negocio de café.

Lo detectaron las carpetas de `cafeteria` (§5.4) y `ferreteria` (§6) y quedó sin resolver. La revisión adversarial del prompt lo levantó como bloqueante.

**Decisión.** La migración del renombre **parte por giro**:

```
giro = 'restaurante' o 'cafeteria'   y paquete = 'restaurante_pro'  →  'restaurante'
giro = 'restaurante' o 'cafeteria'   y paquete = 'operativo'        →  'cafeteria'
giro = 'tienda' o 'ferreteria'       y paquete = 'operativo'        →  'tienda'
cualquier giro                        y paquete = 'esencial'         →  'tienda'
```

Resultado sobre los cuatro negocios vivos:

| Negocio | Giro | Antes | Después |
|---|---|---|---|
| Restaurante MH | restaurante | restaurante_pro | **restaurante** |
| Café Jacaranda | cafeteria | restaurante_pro | **restaurante** |
| Abarrotes Don Chuy | tienda | operativo | **tienda** |
| Ferretería La Broca | ferreteria | operativo | **tienda** |

**Café Jacaranda se queda en `restaurante`, no en `cafeteria`.** Tiene contratado el paquete completo con mesero y cocina; bajarlo a `cafeteria` le quitaría módulos que paga. El giro dice qué tipo de negocio es; el paquete dice qué compró. No son lo mismo y ésa es justo la razón de la migración 054 de Codex.

**Consecuencia.** La migración se escribe y **no se aplica**. El acople exige aplicarla con los negocios cerrados y con respaldo hecho.

---

## D-13 · 14-09-2026 · La documentación de la Fase 2 se respalda dentro del repositorio

**Contexto.** D-05 puso `fase-2/` fuera de los dos worktrees para no chocar con Codex. Efecto lateral que nadie vio: **nada de esa carpeta entra en un commit**. Los cimientos, los cinco modelos y todo lo que produzca la reconciliación del catálogo viven en un solo disco, sin respaldo.

Es exactamente el fallo de la Fase 1, donde 41 commits de trabajo de seguridad estuvieron cuatro días en una sola máquina.

**Decisión.** Al crear el worktree de la Fase 2, lo primero es copiar `D:\MIS PROYECTOS\Master POS\fase-2\` dentro de él como `docs/fase-2/`, y commitear. **A partir de ese momento, `docs/fase-2/` es la copia canónica**: ahí se edita, ahí se actualiza el estado y la bitácora, y se empuja con cada etapa.

La carpeta de fuera queda como histórico y se deja de tocar.

---

## D-14 · 22-09-2026 · Las pantallas heredadas se quedan con la estructura de Miguel, y con los tokens del sistema

**Contexto.** El cierre de la etapa 2.35 recompuso las pantallas de los cinco modelos con la
biblioteca (`apps/web/src`). `apps/web/heredado/` —el punto de venta que lleva meses
cobrando: accesos, ventas, compras, registros, portal QR, configuración— no se tocó, y
`verify:aspecto` sigue comparándolo contra `89830e5`, el commit en que Miguel lo entregó.
El encargo pidió decidir: o se recomponen también, o se declara por escrito que se quedan.

**Decisión.** **Se quedan con la estructura y los componentes de Miguel**, y la base de
`verify:aspecto` no se mueve. Tres razones:

1. **Ya llevan el lenguaje donde importa.** Desde la etapa 2.35 sus nombres en inglés
   —`bg-card`, `text-muted-foreground`— son ALIAS de los tokens del sistema
   (`heredado/index.css`): cambian con el estilo, con el modo oscuro y con las cuatro
   perillas igual que las pantallas de los modelos. Lo que no tienen es la biblioteca
   (`Superficie`, `Tabla`, `Dinero`), y eso es composición, no color.
2. **Son las que cobrarán.** *(Corregido el 24-09-2026, C.15 de la 2.4: aquí decía «Son las
   que cobran hoy. Cuatro negocios operan con ellas», y no era verdad: los cuatro negocios
   reales están dados de alta y **nadie cobra todavía** con estas pantallas. La razón de
   fondo sigue en pie —son las de Miguel y las usarán—, pero no por un uso que no existe.)*
   Recomponerlas es tocar el
   flujo de dinero de un cliente que paga sin que su dueño lo haya pedido, y `verify:aspecto`
   existe precisamente para que eso no pase sin decidirlo.
3. **Cada modelo trae ya las suyas para lo que más se usa.** El cobro, la caja, el catálogo y
   el inventario de cada giro son pantallas de `apps/web/src`, recompuestas; las heredadas
   que perdieron su sitio en el menú están declaradas en `EXCEPCIONES-COBERTURA.md`.

**Lo que queda dicho para cuando cambie.** El día que Miguel quiera el lenguaje nuevo en
ellas, se recomponen una por una con la guía (`GUIA-DE-RECOMPOSICION.md`) y la base de
`verify:aspecto` se mueve A PROPÓSITO en ese commit —nunca se apaga la puerta—.

## D-15 · 24-09-2026 · La entrada es de UN negocio, y el negocio lo dice la dirección

**Contexto.** Producción sirve a Restaurante MH y a las cinco demos en un solo despliegue, y
`/api/auth/empleados` —sin sesión— devolvía a la gente de los seis mezclada: nombre, rol, color y
el `empleoId`, que es el primer factor del acceso. El cajero de un negocio veía al personal de
otro. Un paso de «enrolar el equipo» antes del PIN lo resolvería y Miguel ya lo rechazó: le cerraba
la puerta de su propio negocio.

**Decisión.** Cada negocio tiene su dirección, `/n/<slug>/login-pos`, que no depende del DNS; el
host con el slug, cuando exista, manda sobre ella. La lista de empleados exige el negocio y devuelve
sólo el suyo; un slug que el despliegue no sirve es la MISMA 404 que uno que no existe. En un
despliegue de varios negocios, `/login-pos` a secas no enseña a nadie: la caja que ya entró antes
vuelve a su entrada (cookie de la entrada, o su terminal —la cookie del dispositivo que el servidor
da después de un PIN correcto—), y una que nunca entró ve una pantalla sin nombres. La etiqueta del
rol pasa por el vocabulario del giro (la estilista no es «Mesero»), sin crear un rol en la base.

**Café Jacaranda, Abarrotes Don Chuy y Ferretería La Broca SÍ se sirven en producción**, cada uno
en su dirección (A.6). Nadie los usa todavía, y con la entrada por negocio servirlos no enseña su
gente a nadie que no tenga su dirección; no servirlos obligaría a otro despliegue el día que
empiecen. Cambiar `ORGANIZACION` de Production está fuera de lo que esta sesión puede hacer, así que
va al §10 del encargo con su valor exacto — **y sólo DESPUÉS de fusionar la 2.4**: con la entrada
de `main`, que todavía mezcla, añadirlos antes enseñaría también su personal.

**Preview** lleva sólo las cinco demos (`demo-acople-*`): escribe en la misma base que producción,
y un Preview que sirva a un negocio real sería una puerta trasera. Configurado el 24-09-2026.

## D-16 · 24-09-2026 · El corte guarda su esperado y su diferencia, sin migración nueva

**Contexto.** El encargo de la 2.4 (C.4) pedía una migración para que `sesiones_caja` guardara el
efectivo esperado, con su respaldo, su ensayo y su aplicación. El ensayo con datos de esa migración
(178) falló: **la columna ya existía**. La migración 100 creó `efectivo_esperado_centavos` y
`diferencia_centavos` —«se guarda calculada y no se deduce después»— y `caja.cerrar` nunca las
escribió; `esquema.ts` tampoco las declaraba, que es por lo que nadie las usaba.

**Decisión.** Sin migración. `cerrarSesion` escribe las dos columnas con el esperado que comparó y
la diferencia; el puente las sirve en `CorteCaja` como `esperado_al_cerrar` y
`diferencia_al_cerrar` —con nombre propio: `efectivo_esperado` y `diferencia_efectivo` los reserva
F1-04 §20.4 como derivados de las heredadas—; el histórico de cortes las pinta ordenadas por la
diferencia. Los cierres anteriores las traen en nulo, y la pantalla dice «no se guardó» en vez de
re-derivarlas: la foto de lo que se firmó al cerrar no se reconstruye después.

La regla de F1-04 §20.2 —«los totales no se guardan»— sigue valiendo para la sesión ABIERTA:
mientras está abierta, el esperado se deriva siempre.

## D-17 · 25-09-2026 · El cobro del salón: tope de descuento, propina por camino, comisión sin IVA

**Contexto.** C.3 de la 2.4 cerró el cobro de la estética contra su `02-DINERO-Y-CAJA`. Cuatro
puntos del documento dejaban la forma abierta y había que elegir.

**Decisiones.**
1. **Por encima del tope de descuento, cobra quien lo autoriza, con SU sesión.** Los topes son los
   de F-205 (`topes_descuento`, por puesto). El documento pide «PIN de la dueña»; ese PIN se teclea en
   la entrada de siempre —con su límite de intentos— y no dentro del comando: un segundo verificador
   de PIN sería una puerta sin `LIMITES`, y un campo «autorizado por» es poner el nombre de otro en lo
   que uno hace (R16). `venta/descuento.ts` ya razonaba igual. La pantalla lo avisa ANTES
   (`venta.cotizar_cita`), y el cobro contesta 403 auditado si se intenta igual.
2. **La propina a la mano se anota como recibida Y entregada** en `movimientos_propina`, en el mismo
   acto: queda en la cuenta de la profesional —el corte la cuenta— y su saldo no le debe nada, porque
   el dinero no pasó por el salón. Al cajón: recibida en efectivo, atada a su movimiento de caja
   `propina`. En terminal: recibida con tarjeta, en el cargo del pago con tarjeta. Nunca toca la
   venta, el IVA ni `pagos.monto_centavos`.
3. **La cuenta de la transferencia va en `pagos.referencia`**, como `cuenta-salon` o
   `cuenta-profesional:<id>`, más ` por-confirmar`. Sin columna nueva: `pagos` ya tiene su referencia
   libre y esto es lo que el corte y la liquidación necesitan leer de ella.
4. **La comisión se calcula sobre la base SIN IVA** cuando la regla dice `sobre_iva = false`, que es
   la omisión del documento (§7.2, pregunta 2). El cobro comisionaba el precio al público entero: 16 %
   de más por servicio. Cambia lo que se causa desde hoy; lo ya causado no se recalcula (F-443).
5. **El anticipo en efectivo entra al cajón con su movimiento** (`anticipo_cita`, de la 135), y exige
   caja abierta. Se APLICA en el mismo cobro: la venta es la cita entera y los pagos suman el resto.

## D-18 · 25-09-2026 · El apartado de la cafetería: sin sesión, sin pago y por la dirección del negocio

**Contexto.** C.14 de la 2.4: «cobrar en línea exige pasarela, que es del §10. Mientras, se reserva
sin pago y se cobra al recoger. Completo.» La forma quedaba abierta.

**Decisiones.**
1. **El menú y el apartado públicos van por la dirección del negocio**, `/n/<slug>/pedir` y
   `/api/publico/negocio/<slug>/{menu,apartar}`, resueltos DENTRO de los negocios del despliegue
   (lo mismo que la entrada del bloque A). Un slug ajeno, inexistente o que no es cafetería contesta
   igual: 404. Sin token de mesa, el límite es por IP y por negocio (`LIMITES_PORTAL`, dos
   acciones nuevas; `LIMITES` de `http/limite.ts` no se toca), tres apartados por hueco de cinco
   minutos, y la clave de idempotencia va a `ordenes.idempotency_key`.
2. **La orden nace CONFIRMADA, no pagada**, con precio de catálogo. «Preparar» emite su comanda antes
   del pago (la misma `comandarLineasPendientes` del cobro, que así no la duplica), se cobra al
   recoger y `entregar_anticipado` exige la orden pagada y cierra su comanda.
3. **El origen de la propina de la barra, en la lista cerrada del servidor**: la que teclea el
   barista es `tradicional` (el POS de mostrador) y la que elige el cliente en su pantalla es
   `portal_qr` (elegida por el cliente en una pantalla suya). Sin migración: `'barista'` y
   `'cliente'` no están en el `check propina_origen`.

## D-19 · 25-09-2026 · El heredado cambia de color, y SÓLO de color (deroga D-14 en lo que toca al color)

**Contexto.** D-14 dejó el heredado con la estructura de Miguel «y con los tokens del sistema»,
pero eso sólo era verdad para sus alias en inglés (`bg-card`, `text-muted-foreground`). Los
colores FIJOS de paleta —`bg-white`, `text-emerald-700`, `dark:bg-gray-900`, más de 3 000 en
111 archivos— no cambiaban con el estilo: en Noche y en Terminal había tarjetas blancas sobre
fondo negro, y un parche (`PARCHE DARK` de `heredado/index.css`) que repintaba a mano algunas
clases con `!important`. El encargo C.16 pide traducirlos.

**Decisión.** **D-14 queda DEROGADA en lo que toca al color**; composición, textos, iconos,
orden y flujo siguen siendo de Miguel e intocables.

1. **Un commit de sólo color** (`a92c343`): cada clase de paleta pasa a su token por su papel
   (superficie, texto, borde, éxito, aviso, peligro, acento), y
   `scripts/verificar-traduccion-de-color.mjs` demuestra que, quitadas las clases de color
   (`scripts/lib/clases-de-color.mjs`), cada archivo es idéntico carácter a carácter a su
   original.
2. **La base de `verify:aspecto` se movió a ese commit, y la puerta lo vuelve a demostrar en
   cada corrida**: `aspecto-permitido.json` declara `baseAnterior` (`89830e5`) y
   `porqueSeMovioLaBase`, y todo testigo que cambia entre las dos bases tiene que ser una clase
   de color o una excepción motivada de la lista. Un texto o un espaciado colado en ese tramo
   la pone en rojo; mover la base sin decir por qué, también.
3. **El `PARCHE DARK` se retiró**: sin colores fijos que repintar, sólo tapaba los tokens.
4. **Para que no vuelvan**, `verify:primitivas` mira ahora el heredado SÓLO por colores de
   paleta: cero, salvo **22 excepciones en 6 archivos**, cada una con su número exacto y su
   razón en el código (texto blanco sobre un fondo que no es del sistema: la vista previa de
   los colores de marca, el color del mesero elegido por el negocio, degradados fijos en línea
   de tres botones). Una más, una menos o una excepción de un archivo que ya no existe es rojo.

5. **Lo impreso sigue siendo papel.** La traducción metió un defecto que se corrigió en el
   mismo bloque: dentro de los cuatro imprimibles (pre-cuenta, corte, PDF del periodo, ficha
   de producto) `bg-gray-100` pasó a `bg-fondo-sutil` y `bg-white` a `bg-superficie`, fondos
   que en Noche se oscurecen bajo un texto que la protección de impresión fuerza a oscuro.
   Los contenedores protegidos (`.ticket-printable`, `.cash-cut-pdf`, `.pdf-corte-caja`,
   `.printable-doc`) redefinen ahora los tokens con su valor claro, y
   `apps/web/src/imprimibles-en-papel.contrato.test.ts` exige que cubran todo token que
   pintan sus documentos.

## D-20 · 25-09-2026 · El corte y su PDF: el fondo dejado es un campo, y cada giro arma su hoja

**Contexto.** C.6 de la 2.4 (F-234). Las pantallas de cierre sólo exportaban CSV; el restaurante
prometía «Imprimir el cierre» con `window.print()` sobre la pantalla, y el fondo que se deja en el
cajón viajaba como texto dentro de `notas`. Al probar el cierre POR LA PANTALLA salieron tres
defectos más: el cierre del restaurante mandaba el contado como TEXTO y el servidor lo rechazaba
(su botón nunca cerró: el e2e cerraba por la API), la ferretería no tenía dónde abrir ni cerrar su
caja, y la entrada de cambio de la cafetería se registraba como depósito.

**Decisión.**

1. **El fondo dejado es un campo, sin migración.** `caja.cerrar` recibe `fondoDejadoCentavos` y
   guarda lo RETIRADO en `efectivo_retirado_centavos` (contado − dejado): la columna se llama así y
   así la usa el corte de turno. El puente sirve `dinero_dejado_en_caja` como CÁLCULO (contado −
   retirado) y ya no lee esa columna como si fuera lo dejado. `caja.abrir` espera lo que dejó el
   último cierre de la terminal (`fondo_esperado_centavos`), y la diferencia de apertura se mide
   contra eso. El conteo por denominación se guarda en `conteos_denominacion` (momento `cierre`) y
   tiene que sumar lo contado, con lo suelto aparte (`sueltosCentavos`).
2. **El desglose del cambio que se deja no se guarda al cerrar.** Ese cambio es el fondo del turno
   que sigue, y su desglose se CUENTA al abrir (monedas, chicos, grandes), que es donde se sabe si
   alcanza. Guardarlo también al cerrar pediría una columna nueva (una migración, que es de Miguel)
   para un número que el conteo de la mañana ya da.
3. **Una lectura, cinco documentos.** `caja.hoja_del_corte` lee en una transacción el tronco de
   todos los cortes y lo propio de cada giro. La pantalla de cada giro arma SU documento, en el
   orden de su §9.3 (`apps/web/src/corte/`), y el PDF sale con `generatePDFBlobFromNode` de Miguel
   sobre `#cash-cut-pdf-document`. Se descarga solo al cerrar si el negocio no apagó
   `descargar_pdf_corte_auto`; en la cafetería espera al reparto del bote, porque bajado antes
   saldría sin él. Un fallo al leer no produce archivo.
4. **Quién ve costos.** Dirección siempre; el cajero sólo con `mostrar_costos_a_caja`. Sin permiso
   el documento sale sin costo, utilidad, margen ni consumo de insumo, como el `sinCostos` del
   corte de Miguel.
5. **Lo que el documento todavía no trae, y por qué.** ~~La *comisión estimada de terminal* de la
   cafetería: el sistema no conoce la tasa que cobra la terminal de cada negocio, y no hay dónde
   escribirla.~~ **Ya la trae (C.10, D-22 punto 1):** el negocio la declara una vez, en el mismo
   cierre de turno. *Devoluciones del día* de la ferretería: aparecerá
   cuando F-222 escriba devoluciones con motivo y destino; hoy no hay ninguna, y una sección sin
   filas no se pinta. *Bloqueos por mora levantados*: la base guarda el bloqueo vigente, no su
   historia. *El renglón completo de existencia por producto* (inicial, entradas, esperado): el
   documento enseña lo vendido y los faltantes de los conteos cerrados en el día, que son las dos
   cifras que se miden; un «inicial» sacado de un libro que la siembra no siempre alimenta sería
   un número inventado.
6. **La ferretería hereda «Caja y corte» de abarrotes**, como dice su documento: «Fondo y
   movimientos» (`/ferreteria/fondo-y-movimientos`) y «Cortes» (`/ferreteria/cortes`).

## D-21 · 25-09-2026 · Lo recortado de la tienda se construye: el fiado en el cobro, una sola cartera, la báscula declarada

**Contexto.** C.10 de la 2.4: treinta y nueve pantallas llevaban «Alcance recortado» en su
cabecera; al empezar el bloque quedaban veintinueve. Las seis de la tienda, al construirse,
destaparon cuatro defectos que ninguna prueba veía: F11 (fiado) contestaba «La venta llegó
incompleta»; un cobro fallido dejaba sus líneas en el borrador de la terminal y el siguiente las
metía encima —el total ya no cuadraba nunca—; el abono del fiado se anotaba en un libro que nadie
lee; y la pantalla «Productos» no abría ninguna ficha.

**Decisión.**

1. **El fiado es un pago del cobro, no un comando aparte.** `venta.cobrar` acepta el método
   `fiado` (el `check` de `pagos.metodo` lo admite desde la 003) con `clienteId`, y emite el
   documento de crédito en la MISMA transacción con la misma comprobación que
   `credito.emitir_documento` (`emitirDocumento`, una sola aritmética). La venta suma a ventas, no
   al cajón. La propina no se fía. Los documentos de fiado llevan serie propia `CR`: en la del
   ticket, cada fiado se comía un folio de venta.
2. **Una sola cartera.** `fiado.registrar_abono` —el nombre que declara el `05-DATOS-Y-BACKEND`—
   aplica el pago con `aplicarPagoDeCredito`, el mismo de la ferretería: a lo más viejo, el
   efectivo al cajón como depósito, la transferencia por confirmar. `pasivos_terceros` deja de
   recibir abonos de fiado; sigue siendo el libro de recargas, servicios y cascos.
3. **El carrito del mostrador se vacía antes de armarse**, con su propia clave de idempotencia
   (`venta.vaciar_orden` en `armarCarrito`): en el mostrador la venta vive en la pantalla y lo que
   quedó en el borrador es resto de un intento. Retomar una venta apartada retira el carrito vacío
   de la caja y se niega a pisar uno con líneas.
4. **La báscula de etiquetas (F-148) no se interpreta sin declararla.** Cada marca reparte los
   dígitos a su manera y leer un importe como peso cobraría otra cosa sin que nada fallara. El
   negocio la declara en el catálogo (`bascula_etiqueta`, validada en el servidor: prefijo 2x,
   trece dígitos) y la prueba con una etiqueta real antes de guardar. Por importe, la cantidad se
   elige para que precio × cantidad dé exactamente lo impreso.
5. **F1–F8 contra las acciones.** El documento de abarrotes pide F1–F8 para los ocho de siempre Y
   F2, F4, F6 y F7 para buscar, cliente, apartar y abono. Mandan las acciones: se usan en cada venta
   que las necesita y ya están impresas. Los ocho llevan su tecla donde está libre (F1, F3, F5, F8)
   y los demás son botones. Son los que el negocio VENDE (`venta.mas_vendidos`, 30 días), nunca los
   primeros del catálogo: una tienda que aún no vende nada no ve fila.
6. **El canje en la misma nota lo valora el servidor**, al costo de ANTES de la nota, y se le
   descuenta al total de la compra. El navegador sólo dice qué, cuánto y por qué.
7. **El kardex vive en la ficha del producto** (era «su propia pantalla» según la ficha y «la
   ficha» según Existencias: no existía en ninguna). El conteo lo abre desde cada diferencia, y
   cada diferencia elige su motivo de los del tronco y del giro (`inventario.motivos_de_merma`).

## D-22 · 25-09-2026 · La cafetería sin nada recortado: la comisión declarada, la leche que se elige es la que sale

**Contexto.** C.10 de la 2.4, las cinco pantallas de la cafetería. Construirlas destapó que la
opción de bebida —la leche, el tamaño— no llegaba a ninguna parte: el mostrador no podía cobrarla
(la pantalla de opciones metía la bebida en un borrador que el cobro nunca leía) y, aunque se
hubiera cobrado, el consumo descontaba la receta de catálogo. Un latte de avena descontaba leche
entera; uno de 16 oz, lo de uno de 12. Y la pantalla de recetas borraba el canal, la merma y el
grupo de todas las líneas cada vez que se guardaba cualquiera.

**Decisión.**

1. **La comisión de la terminal se declara, y la declara el negocio donde la necesita.** Clave
   `comision_terminal_bp` en la configuración (puntos base, 0 a 1000; nula = no declarada, y
   entonces el corte dice «—», nunca cero). La pregunta el cierre de turno la primera vez que
   falta. Estimación: (ventas con tarjeta + propinas con tarjeta) × tasa × 1.16 —la comisión
   lleva IVA—, y se resta de la utilidad neta estimada del turno y del corte. Es ESTIMADA porque el
   banco la cobra por su lado; el corte lo dice.
2. **El programa de sellos lo cuenta el servidor** (`lealtad.programa`): el pasivo, quién está a un
   sello y quién no viene hace 21 días miran a TODOS los del programa. El mensaje al que no viene
   lo redacta el sistema y lo manda la dueña desde su WhatsApp (`wa.me`): el proveedor de envío es
   F-406, que es del §10, y un mensaje automático a la vecina rompe lo que sostiene el negocio.
3. **El alta de producto de la barra es la del catálogo del tronco** (`/productos`): la foto, la
   receta, la familia y el IVA viven ahí. La pantalla de productos de la barra enseña los grupos
   de opciones de cada bebida y su tasa de IVA.
4. **Las opciones se aplican al CONSUMO** (`recetaConOpciones`, del dominio): la línea que declara
   `sustituible_por_grupo_id` cambia su insumo por el de la opción elegida de ese grupo; el factor
   escala lo que se MIDE (g, ml) y no lo que se CUENTA —un 16 oz lleva un vaso, no 1.44; el vaso
   grande es una sustitución del grupo «Tamaño»—; la cantidad escalada se redondea a la
   diezmilésima, al medio hacia arriba. Un sustituto de otra dimensión no se inventa (la línea
   queda como estaba), y uno archivado o de otro negocio no sustituye.
5. **La tabla de variantes usa esa misma función** y el mismo redondeo que el costo de línea del
   puente: la opción que no cambia nada cuesta al centavo lo que la receta base. Si la pantalla no
   conoce el sustituto, la variante queda SIN costo, no con el de la leche entera.
6. **El mostrador de la cafetería cobra en un viaje** (`/api/venta/cobrar-mostrador`, el de la
   tienda, que vacía el borrador): la bebida con opciones, alergias o nota entra por
   `cafeteria.agregar_bebida`. La línea del pedido se reconoce por producto + opciones + alergias
   + nota: dos lattes de avena se suman, uno de avena y uno con entera no.
7. **La receta se reenvía entera con todo lo que tiene.** El comando reemplaza la receta, así que
   el puente sirve `aplica_canal` y `sustituible_por_grupo_id`, y la pantalla devuelve canal,
   merma y grupo de cada línea. El grupo se valida contra el negocio antes de borrar nada.

## DECISIONES PENDIENTES · las tiene que tomar Miguel

*Revisadas el 24-09-2026 (C.15 de la 2.4). De las cuatro, sólo P-02 sigue abierta. Las otras
tres se conservan abajo, con lo que las cerró, para que nadie las vuelva a plantear.*

**P-02 · ¿Entra CFDI en la Fase 2 y en qué momento?** — **ABIERTA**
No lo pide ningún arquetipo en particular: lo piden los 78. En México es lo que separa "sistema de cobro" de "sistema del negocio". Es el módulo con más superficie regulatoria y el único que ningún competidor puede no tener.
*Recomendación: sí, y temprano — porque condiciona el modelo de datos de cliente, producto y venta. Meterlo tarde obliga a migrar todo.* Lo que falta para empezar es elegir y contratar el PAC (F-940…945), que es de Miguel.

**P-01 · ¿Plantilla cerrada o plantilla + perillas?** — **CERRADA: implementada**
Se hizo lo recomendado: la plantilla es un preajuste y cada módulo se enciende o apaga por negocio (**F-016**). Las excepciones viven en `organizacion_modulos` (migración 058), los comandos `configuracion.fijar_modulo` y `restablecer_modulo` las escriben (`packages/app/src/configuracion/modulos.ts`), y el gate de `comando.ts` las consulta con `leerModulosActivos` para todo comando que declara módulo.

**P-03 · ¿En qué orden se atacan los arquetipos?** — **CERRADA: sin objeto**
Dejó de ser una decisión pendiente cuando la Fase 2 se partió en etapas: los cinco primeros modelos (2.2–2.4) ya están hechos, y el orden de la siguiente tanda es el contenido de la etapa 2.5, no una pregunta abierta de la fase.

**P-04 · ¿Qué pasa con los clientes que ya operan cuando cambie la plantilla?** — **CERRADA: resuelta por D-12**
D-12 lo resolvió: el renombre de plantillas se migra POR GIRO, con migración probada y no con un `update` a mano. Y desde la 2.4 ninguna operación de prueba, siembra o reseteo puede tocar un negocio real (`packages/contracts/src/negocios`, D-15).
