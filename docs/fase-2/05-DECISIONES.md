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

**Decisión.** La Fase 2 vive en `D:\MIS PROYECTOS\Master POS\fase-2\`, fuera de los dos worktrees. Se construye **como si ya estuviera dentro**: mismos contratos (`comando()`, el puente, el ámbito de sesión, bigint de centavos), misma estructura de carpetas que tendría en el monorepo. Las migraciones se escriben numeradas y listas, **pero no se aplican en la Fase 2** — la Fase 3 las aplicó el 16-09-2026 (F3-REGLAS §2 y §4).

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

**Lo que NO cambiaba EN LA FASE 2:** las migraciones se escribían y **no se aplicaban** a `wyqmzhliurwyxuyxznpb`. **DEROGADO en la Fase 3** (F3-REGLAS §2): se aplicaron las 70 el 16-09-2026, en una sola transacción, con respaldo restaurado y ensayo sobre una copia con datos. Las pruebas unitarias no necesitan Postgres (`vitest.config.ts` excluye las de integración y ninguna unitaria abre conexión), así que la puerta de calidad funciona igual.

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

## DECISIONES PENDIENTES · las tiene que tomar Miguel

**P-01 · ¿Plantilla cerrada o plantilla + perillas?**
Hoy los paquetes son bloques cerrados. La alternativa es que la plantilla sea un punto de partida y cada módulo se pueda encender y apagar (**F-016**). La segunda vende mucho mejor —permite el "sí, y además te pongo citas"— y complica el gate de paquetes, las pruebas y el soporte.
*Recomendación: plantilla como preajuste, perillas por módulo detrás de una pantalla de administrador. Lo mejor de ambas.*

**P-02 · ¿Entra CFDI en la Fase 2 y en qué momento?**
No lo pide ningún arquetipo en particular: lo piden los 78. En México es lo que separa "sistema de cobro" de "sistema del negocio". Es el módulo con más superficie regulatoria y el único que ningún competidor puede no tener.
*Recomendación: sí, y temprano — porque condiciona el modelo de datos de cliente, producto y venta. Meterlo tarde obliga a migrar todo.*

**P-03 · ¿En qué orden se atacan los arquetipos?**
Por rendimiento: **A1 Mostrador** completo (desbloquea ~20 modelos) → **A3 Agenda** (desbloquea 22) → **A5 Cotización y crédito** (18) → **A4 Orden de trabajo** (9) → el resto.
*Pendiente de confirmación.*

**P-04 · ¿Qué pasa con los clientes que ya operan cuando cambie la plantilla?**
Los cuatro negocios vivos tienen datos. Cualquier renombre o cambio de estructura necesita migración probada, no un `update` a mano.
*Sin esto no se despliega nada.*
