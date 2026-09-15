# BITÁCORA · Fase 2

Las decisiones que se toman mientras se construye, con su razón. Lo que sale de aquí y se sostiene,
sube a `05-DECISIONES.md`. **No se borra nada.**

Formato: `fecha · etapa · qué se decidió` → por qué.

---

## 2026-09-14 · E1 (adelantada) · El worktree se crea ANTES de la Etapa 0

**Qué.** El prompt pide arrancar por la Etapa 0 (reconciliar el catálogo) y crear el worktree en la
Etapa 1. Lo hice al revés: primero el worktree, después la reconciliación **dentro** de él.

**Por qué.** La Etapa 0 produce ~100 ediciones sobre 43 archivos de documentación. Hacerlas en
`D:\MIS PROYECTOS\Master POS\fase-2\` —que no está bajo control de versiones— y copiarlas después
deja todo ese trabajo en un solo disco durante horas. Es exactamente el fallo que D-13 existe para
evitar y el que costó cuatro días en la Fase 1. El prompt dice «lo primero, antes de cualquier
código», y la Etapa 0 no es código: las dos lecturas caben, y ésta respeta mejor la intención de
D-13.

**Consecuencia.** La reconciliación nació versionada. Commit `8bbd756`.

---

## 2026-09-14 · E1 · Base del worktree: `3a4623b`, no `fde78ca`

**Qué.** El worktree se partió de `origin/carril-b` en `3a4623b` («T7: evitar comandas vacías al
cobrar»), no del commit que la auditoría del reporte 009 había visto.

**Por qué.** Codex siguió trabajando: `carril-b` avanzó seis commits desde entonces. Partir del
estado viejo habría garantizado un conflicto en el primer `git merge carril-b`.

**Comprobado de paso:** Codex **no** ha fusionado `carril-b` a `main` (50 commits de diferencia).
Por tanto **D-09 sigue vigente**: no se edita ningún archivo que ya exista en `apps/web/heredado/`.

---

## 2026-09-14 · E2 · Nunca correr el arnés de mutación de fondo mientras se edita

**Qué pasó.** Lancé `verify:fase2` en segundo plano y seguí escribiendo código.
El `typecheck` falló con un error absurdo —un import sin usar en un archivo que
no había tocado— y el `git diff` mostraba `consumo.ts` modificado.

**Por qué.** `verify:mutaciones-*` **muta los archivos reales en el disco**,
corre la suite y los restaura. Si lees el árbol mientras tanto, lees una
mutación. No era un defecto ni de Codex ni mío: era mi propia verificación.

**Regla para quien siga:** el arnés de mutación y la edición no conviven. O se
espera, o se edita. Perder diez minutos esperando es más barato que diagnosticar
un fantasma.

---

## 2026-09-14 · E2 · El contrato de «estado ⇒ columna» tenía DOS huecos

Los encontró el propio contrato al añadir las tablas nuevas, que es exactamente
para lo que se escribió.

**1 · Sólo miraba `.set({`.** `enviarTraspaso` crea el traspaso ya `enviado` con
un `insertInto(...).values({...})`. Una fila que NACE en un estado que exige
columna: el `check` la rechaza con 23514 igual, y el contrato no la veía. Ahora
mira las dos formas. Es el mismo defecto de «mirar la mitad del dominio» que
este archivo ya tuvo con los `check` de `create table`.

**2 · Suponía que toda columna del `check` se reescribe en cada transición.**
Vale para `pagada` y `cerrada`, que son estados FINALES. No vale para una
máquina de varios pasos: `traspaso_recibido_completo` exige `enviado_en` y
`recibido_en`, pero `enviado_en` la escribió el paso de enviar tres horas antes,
y reescribirla al recibir **sustituiría la hora real de salida por la de
llegada** — un dato peor que el que había.

**Cómo se resolvió, y por qué así.** Con una lista de excepciones DECLARADAS,
cada una con su motivo y diciendo qué estado anterior escribió la columna. No
relajando la regla para todos: un hueco nombrado es honesto; una regla ablandada
esconde los casos que sí importan.

---

## 2026-09-14 · E2 · Las mutaciones del arnés se REAPUNTAN, nunca se borran

**Qué pasó.** Extraer V6 a estrategia movió seis trozos de código, y
`verify:inventario` falló con «No se encontró la protección: sku sin
conversión». Eso NO es un defecto: es que el arnés busca cadenas literales y el
texto cambió de archivo.

**Qué se hizo.** Las seis mutaciones se reapuntaron al texto nuevo conservando
**exactamente** lo que cada una probaba. Cinco cambiaron de archivo a
`variantes/v6-receta-y-peso.ts`; una cambió de forma (`case 'ninguno': break;`
pasó a `return [];` al convertirse el `switch` en una función que devuelve).

**Lo que NO se hizo, y es la tentación:** borrar la mutación para poner la
cadena en verde. Eso convierte un arnés en decoración.

**Resultado:** 20 mutaciones detectadas, árbol restaurado.

---

## 2026-09-14 · E2 · El kardex es una VISTA, y por qué importa

**Qué.** F-103 no crea tabla. Es una vista sobre `movimientos_stock` con el
saldo corrido por ventana.

**Por qué.** El dato ya existe: `movimientos_stock` es un ledger inmutable desde
la 011. Guardar el kardex aparte obligaría a mantener dos fuentes del mismo
número y abriría la puerta a que discrepen — el defecto que un ledger existe
para no tener, y la misma trampa del `read-then-write` que el catálogo tiene
fichada como P1-03.

**El detalle que casi se escapa:** el saldo corrido se particiona por
`(organización, almacén, insumo)`. Sin el almacén, el mismo insumo en dos
bodegas daría un saldo sumado que **no existe en ningún estante**.

Y la vista lleva `security_invoker = on`: sin eso correría con los permisos de
quien la creó y sería una puerta trasera al ledger de todas las organizaciones.

---

## 2026-09-14 · E1 · `historico/` hay que copiarla a mano en cada worktree

**Qué.** El punto de partida venía roto: `packages/app/src/puente/cobertura.test.ts` fallaba con
`ENOENT: scandir 'historico\restaurante\base44\entities'`.

**Por qué pasó, y por qué NO es un defecto de `carril-b`.** `historico/` está en `.gitignore`
(«es evidencia, no código», R30/R34), así que **un worktree nuevo nace sin ella**. No es que Codex
la rompiera: es que no viaja por git, por diseño. Se copió desde el checkout principal —628
archivos, 7.2 MB— y el árbol de git siguió limpio, que es la prueba de que sigue ignorada.

**Consecuencia para quien retome esto:** todo worktree nuevo del monorepo necesita ese `cp`, y sin
él fallan `cobertura.test.ts` y `verify:historico`. Queda dicho aquí porque no está escrito en
ningún otro sitio.

**Estado tras copiarla:** `typecheck` 7/7, `test:unit` **110 archivos · 1086 pruebas**, todo verde.
(Son 19 pruebas más que las 1067 del reporte 009 de Codex: `carril-b` avanzó seis commits.)

---

## 2026-09-14 · E1 · `docs/fase-2/` entra a `.prettierignore`

**Qué.** `format:check` —eslabón 14 de la cadena— falló sobre los 43 MD recién importados.

**Por qué se excluye en vez de formatear.** Es el mismo criterio que ya estaba escrito para
`docs/fase-1/`, `docs/*.md` y `docs/reports/`: *«Prettier formatea CÓDIGO. Estos son documentos de
prosa escritos a mano: al reformatearlos reacomoda saltos de línea, tablas y viñetas»*. Los MD de la
Fase 2 son exactamente eso, y además llevan **árboles ASCII alineados a mano** —los `│ ├──` de los
§1 de cada `01-FUNCIONES.md`— que Prettier desalinea sin piedad. Formatearlos habría movido miles de
líneas sin cambiar una palabra.

**Lo que NO se excluye:** el código de la Fase 2. Todo lo que se escriba en `packages/` y
`apps/web/app/` se formatea como el resto.

---

## 2026-09-14 · E1 · La puerta `verify:fase2`

**Qué.** 26 eslabones: la cadena `verify` completa de 28 **menos** `verify:esquema` y `verify:rls`.
Nada más.

**Por qué esos dos y sólo esos.** Son los únicos que consultan la base **viva** a través del CLI de
Supabase, y esta fase escribe migraciones que **no se aplican**. Compararlas contra una base que
todavía no tiene las tablas daría rojo sin que haya defecto.

**Lo que se conserva a propósito, aunque tentara quitarlo:** `verify:primitivas` y `verify:aspecto`
obligan a que los componentes salgan de `packages/ui`; `verify:pruebas` impide escribir una prueba
de integración que nunca corre; `verify:escrituras` y `verify:lecturas` vigilan el puente. Son justo
las que este encargo necesita.

**Hallazgo de paso:** `verify:lecturas` **ya existe** en `carril-b` —44 campos descartados vigilados,
216 lecturas justificadas—. Es la puerta que faltaba cuando se auditó el cierre del backend, y Codex
la construyó. Conviene saberlo antes de escribir una lectura nueva del puente.

**`cross-env` no está instalado**, así que el eslabón de `build` va sin él. No hizo falta: este
worktree no tiene `.env` propio y `NODE_ENV` llega sin definir, que es lo que `next build` espera.
Si un `.env` aparece aquí con el `NODE_ENV` no estándar de la Fase 1, habrá que reintroducirlo.

**Resultado: `pnpm verify:fase2` sale en 0.**

---

## 2026-09-14 · E0 · Las dos colisiones las cede `cafeteria`, no `abarrotes`

**Qué.** `F-146` y `F-148` los conserva `abarrotes`. `cafeteria` se mueve a `F-156` (merma de barra)
y `F-157` (frescura del grano).

**Por qué.** No por antigüedad ni por importancia: **por número de citas cruzadas**. La acepción de
`abarrotes` la usan tres modelos —él, `ferreteria` y `estetica-salon`— contra uno solo de
`cafeteria`. Y `estetica-salon` había deconflictado a mano contra la numeración de `abarrotes`,
arrancando en F-154 a propósito. Mover `abarrotes` habría roto ese trabajo y habría obligado a tocar
tres carpetas en vez de una.

**Efecto lateral que el prompt avisaba:** `estetica-salon/FILE-MAP.md` §3 citaba F-146 con la
acepción de `abarrotes`. Al conservarla `abarrotes`, **esa cita quedó correcta sin tocarla**.

**Medido:** 31 apariciones de F-146 y 19 de F-148 reescritas, todas acotadas a la carpeta de
`cafeteria`. Un `sed` global habría renombrado la acepción equivocada en tres modelos.

---

## 2026-09-14 · E0 · F-326 y F-327 se mueven al bloque F-2xx

**Qué.** `F-326` (consumo de empleados y cortesías) → **F-261**. `F-327` (bloqueo de cierre por
unidades abiertas) → **F-262**.

**Por qué.** `restaurante` las propuso con número del bloque F-3xx —*mesa y preparación, arquetipo
A2*— mientras sus propias fichas las declaraban del bloque **F-2xx**. Y las dos aplican fuera de A2:
`abarrotes` ya citaba el consumo de empleados para el autoconsumo del tendero, y el bloqueo de
cierre aplica a A2 **y a A7**. Un ID de A2 para una función universal confunde a los 73 modelos que
vienen detrás, y ése es justo el daño que D-11 existe para prevenir.

**Decisión adicional:** F-326 y F-327 **quedan libres y no se reutilizan**. Un hueco no le miente a
nadie; un número reciclado sí.

**Medido:** 27 + 11 apariciones, en 13 archivos de tres modelos.

---

## 2026-09-14 · E0 · `F-254` era una sola función con dos nombres

**Qué.** `abarrotes` la llamó *cobro de fiado en caja* y `ferreteria` *cobro de crédito en caja*.
Son la misma: dinero que entra al cajón y **no es venta**. Se fusionan en un solo **F-254**.

**Por qué.** Es la única fusión real de las cincuenta propuestas, y es trabajo ahorrado: una tabla,
un comando y una pantalla en vez de dos. Que una carpeta diga «fiado» y la otra «crédito» lo
resuelve el diccionario de vocabulario (**F-017**), que es exactamente para lo que existe.

---

## 2026-09-14 · E0 · Cuatro funciones distintas, un solo ledger de pasivos

**Qué.** `F-254` (abono de fiado), `F-255` (recargas y servicios), `F-256` (casco) y `F-260`
(propina en tarjeta) **no se fusionan** —sus operaciones y pantallas difieren— pero se construyen
sobre **un solo ledger de pasivos de terceros** con cuatro naturalezas.

**Por qué.** Son el mismo objeto de datos: dinero que entra al cajón, no es del negocio, y hay que
devolverlo o entregarlo. `estetica-salon` ya lo había visto y lo dejó escrito: *«es, mecánicamente,
el mismo objeto que F-256»*. Si se escriben cuatro veces, se descuadran de cuatro formas distintas.

**Consecuencia.** Queda anotado en el catálogo para que la etapa que construya el primero de los
cuatro construya el tronco, no una implementación suelta.

---

## 2026-09-14 · E0 · Las cinco migraciones de plantilla se consolidan en una

**Qué.** `069_plantilla_restaurante`, `080_plantilla_cafeteria`, `082_plantilla_tienda`,
`095_plantilla_ferreteria` y `112_plantilla_salon` se consolidan en **`066_plantillas_semilla.sql`**,
en el rango del tronco.

**Por qué.** Dos razones, y la segunda es la que obligó:

1. Una plantilla es **una fila de un catálogo**. Cinco migraciones que insertan una fila cada una es
   peor que una que inserta cinco, y además reparte por cinco archivos una decisión (F-015) que es
   del tronco.
2. **`cafeteria` no cabía en su rango.** D-08 le da diez números (080–089) y tenía once migraciones.
   Consolidar la de plantilla libera exactamente el hueco que faltaba.

**Efecto lateral bueno:** la condición de la decisión pendiente **P-04** —no aplicar un cambio de
plantilla sin respaldo y con los negocios cerrados— pasa a cubrir las cinco plantillas de golpe, en
vez de estar repetida en cinco archivos.

---

## 2026-09-14 · E0 · Errores encontrados en la documentación, y corregidos

1. **El conteo del catálogo estaba mal antes de esta etapa.** Decía «Total de funciones catalogadas:
   232». El número real era **313**: 232 contaba sólo las filas con columna de marca de los bloques
   principales, y dejaba fuera las diez variantes de inventario (F-110–F-119), las veintiséis
   subfunciones (F-120–F-145) y las sub-filas de F-241–F-244, F-431–F-435 y F-921–F-926. Se corrige
   a **363** tras añadir los 50, y se deja escrito por qué estaba mal: ese número se cita en tres
   documentos y se iba a propagar a los 73 modelos que faltan.

2. **Las tablas de migraciones tenían la columna de número desincronizada del nombre de archivo.**
   En `restaurante` y `cafeteria`, la primera columna decía `**060**` junto a
   `070_movimientos_cuenta.sql`. Se alinearon las 21 filas.

3. **Dos referencias cruzadas apuntaban al vacío tras renumerar.** `cafeteria` declara que su
   migración de presencias depende de la de esquemas de propina de `restaurante` (077→087 depende de
   066→**076**), y citaba además «la 069 de `restaurante`» para la condición de P-04, que ahora es la
   066 consolidada. Las dos corregidas.

---

## 2026-09-14 · E0 · Lo que NO cambié, a propósito

- **`estetica-salon` no se renumeró en absoluto.** Fue el único de los cinco que leyó lo que
  propusieron los otros y deconflictó antes de escribir. Reasignarle un ID habría roto algo que ya
  estaba bien, que es justo lo que el prompt advertía.
- **No compacté los huecos** (F-326, F-327, F-637). Renumerar para que no haya huecos es churn sin
  beneficio y con riesgo de romper citas.
- **No toqué `scripts/esquema-esperado.json`.**
- **No apliqué ninguna migración.** Ninguna de las escritas en esta fase se aplica: el acople las
  aplica, con respaldo y con los negocios cerrados.

---

## 2026-09-14 · E3 · `restaurante` · EN PROGRESO

**Dónde voy.** Seis de las once funciones del modelo, cada una con su commit:

| ID | Función | Commit |
|---|---|---|
| F-321 | Dividir cuenta | `dda16de` |
| F-324 | Anulación de línea con motivo | `22b9755` |
| F-303 | Cambiar de mesa | `8d3aafa` |
| F-302 | Unir y separar mesas | `ef4bb19` |
| F-305 | Tiempo de ocupación | `fa1938b` |

Migraciones escritas y NO aplicadas: `070_movimientos_cuenta`,
`071_union_y_cambio_de_mesa`, `072_eventos_mesa`.

**Falta en E3:** F-306 lista de espera (073), F-323 marcha por tiempos y F-315
tiempos por platillo (074), F-242 propina repartida por puntos (076), F-261
consumo de empleados (077), F-325 relevo de responsable. **F-318 impresión de
comanda sigue BLOQUEADA** esperando la decisión de Miguel entre agente local,
impresora de red y `window.print()`.

### Lo que esta etapa dejó aprendido

**1 · Una columna que existe y nadie lee es peor que una columna que falta.**
`orden_lineas.anulada_en` nació en la 070 con F-321 y CUATRO lecturas la
ignoraban. Cada una causaba un daño distinto y sólo una era obvia:

- `lineasDeOrden` → `cotizar` cobraba lo anulado. Dinero.
- `comandar-pendientes` → el cobro mandaba a la plancha un platillo anulado.
- `portal/consulta` → el comensal veía en su precuenta lo que no paga.
- `tieneLineas` → la mesa quedaba fuera de servicio esperando un cobro de $0.

La lección para los cuatro modelos que faltan: **al añadir una columna que
cambia el significado de una fila, hay que buscar TODOS sus lectores en el mismo
commit.** `grep "selectFrom('<tabla>')"` es el primer paso, no el último.

**2 · Un ledger al que se le olvida una transición no deja un hueco: MIENTE.**
F-305 necesita un evento por cada cambio de `mesas.estado`, y hay ocho sitios
que lo cambian. Si falta uno, el ciclo que se pierde se fusiona con el siguiente
y sale una ocupación del doble de larga. No es un dato ausente: es un dato falso
que nadie va a cuestionar. Por eso los ocho pasan por `sellarTransicionDeMesa` y
por eso el sello es un parámetro OBLIGATORIO de `limpiarMesa` y de
`atarMesaAOrden` — un opcional se olvida.

**3 · Dos guardas sobre el mismo `where` pueden tapar huecos distintos.**
Al mover una cuenta de mesa, el destino se exige `estado = 'libre'` Y
`orden_activa_id is null`. Parecían redundantes y no lo son: la primera impide
sentar a alguien sobre una mesa en LIMPIEZA —sin cuenta y no disponible— y la
segunda sobre una mesa HUÉRFANA —libre pero apuntando todavía a una venta—.
Ninguna de las dos se ponía roja con las pruebas que había: hizo falta sembrar
los dos estados para que cada guarda se ganara su sitio en vez de aparentarlo.

**4 · Una mutación puede COLGAR la suite en vez de ponerla roja.**
Cambiar el signo del paso en `repartirLinea` dejó el `while` del residuo girando
para siempre, y el arnés se quedó sin terminar. Es un hallazgo, no una molestia:
ese mismo bucle vive dentro de una petición HTTP. Ahora lleva tope de una vuelta
—el residuo de una división truncada es siempre menor que el número de partes—
y un `ErrorDominio` si lo pasa. **Si una mutación cuelga la suite, el problema
no es la mutación.**

**5 · Lo que se conserva sin poder dispararse, se DICE.**
Dos cerrojos de esta etapa no se pueden alcanzar hoy y sus comentarios lo
declaran: la comprobación final de `calcularDivision` (el método del residuo ya
la garantiza) y el apagado del reloj en `sellarTransicionDeMesa` (las tres rutas
que existen ya apagan la columna). Se conservan por la ruta que alguien escriba
mañana. Un comentario que dijera «esto protege X» sobre algo inalcanzable es
peor que no tenerlo.

**6 · La base falsa aprende, no se rodea.** Le hicieron falta `selectAll()`, los
comparadores de orden (`>=`, `<`, …) y los `default` nulos de las tablas nuevas.
Sin `>=` no se puede probar una consulta por rango y una prueba que quitara la
ventana de días habría pasado igual; sin los nulos declarados, una afirmación de
«todavía no se ha cerrado» leería `undefined` y pasaría por casualidad.

### Decisiones de diseño que el modelo no traía

- **Las hijas de una división nacen sin `mesa_id`.** El `05-DATOS-Y-BACKEND` de
  `restaurante` pide construir «una mesa, una cuenta viva» y **ya estaba
  construido y mejor**: `ordenes_una_activa_por_mesa` (migración 046) cubre
  cinco estados y particiona por organización. Eso decide dónde cuelgan las
  hijas: si cada una llevara mesa, la segunda violaría ese índice.
- **`absorbida` es un estado nuevo de `ordenes`,** hermano de `dividida`. El
  trigger de pagos de la 070 se reescribe en la 071 para cubrir los dos en vez
  de añadir un segundo trigger: dos triggers sobre el mismo `insert` diciendo
  casi lo mismo es como nacen los mensajes contradictorios.
- **Separar mesas NO reparte el consumo.** Cierra el grupo y devuelve las mesas
  al servicio. Repartir por consumo es F-321 y es una decisión de caja.
  Modelarlo al revés devolvería cada platillo a la mesa de donde vino aunque la
  gente se haya cambiado de silla.
- **«Una mesa en un solo grupo vivo» se impone con un índice único parcial,**
  sobre una columna `union_abierta` copiada que un trigger mantiene. Un `check`
  no puede mirar otra tabla y un trigger que consulta y luego inserta pierde
  contra dos meseros que reclaman la mesa 5 en el mismo segundo.

### Corrección a la documentación del modelo

`05-DATOS-Y-BACKEND.md` de `restaurante` describe `anularLinea` como que
«revierte el consumo si ya se cobró». **Eso es F-222, devolución, y es otro
camino.** Una cuenta cobrada se devuelve; darle a la anulación una segunda
puerta al reembolso lo dejaría fuera del control de F-222. F-324 se acota a
cuentas vivas y lo dice en su mensaje de error. Queda anotado para corregir el
MD al cerrar el modelo.

El mismo archivo tiene una nota «Sobre 069» que habla de una migración que su
propia tabla no lista —la consolidación de la etapa 0 la convirtió en la 066—.

---

## 2026-09-15 · E3 · `restaurante` · CERRADA

`verify:fase2` en **0** con sus 26 eslabones · **129 archivos de prueba · 1395 pruebas** ·
typecheck 7/7 · build de producción en verde.

| ID | Función | Commit |
|---|---|---|
| F-321 | Dividir cuenta | `dda16de` |
| F-324 | Anulación de línea con motivo | `22b9755` |
| F-303 | Cambiar de mesa | `8d3aafa` |
| F-302 | Unir y separar mesas | `ef4bb19` |
| F-305 | Tiempo de ocupación | `fa1938b` |
| F-306 | Lista de espera | `818d4c6` |
| F-323 + F-315 | Marcha por tiempos y tiempos por platillo | `42bbd2e` |
| F-325 + F-242 | Relevo de responsable y propina por puntos | `c22947a` |
| F-261 | Consumo de empleados y cortesías | `6aceab0` |

**Diez de las once de §5, más las tres del §6 que el catálogo adoptó en E0.** La que falta es
**F-318 (impresión de comanda), BLOQUEADA** esperando la decisión de Miguel entre agente local,
impresora de red por IP:9100 y `window.print()`. La migración **075 queda reservada** para ella; no
se escribió nada, porque la cola `impresiones_comanda` está diseñada para soportar cualquiera de
los tres caminos y escribirla antes de saber cuál sería adivinar el destino del `destino`.

**Migraciones escritas y NO aplicadas:** 070, 071, 072, 073, 074, 076, 077.

### Las seis lecciones de la etapa

**1 · Una columna que existe y nadie lee es peor que una que falta.**
`orden_lineas.anulada_en` nació en la 070 con F-321 y CUATRO lecturas la ignoraban. Cada una hacía
un daño distinto: `cotizar` cobraba lo anulado (dinero), `comandar-pendientes` lo mandaba a la
plancha, el portal se lo enseñaba al comensal en su precuenta, y `tieneLineas` dejaba la mesa fuera
de servicio esperando un cobro de $0. **Al añadir una columna que cambia el significado de una
fila, hay que buscar TODOS sus lectores en el mismo commit.**

**2 · Un ledger al que se le olvida una transición no deja un hueco: MIENTE.**
Ocho sitios cambian `mesas.estado`. Si falta uno, el ciclo perdido se fusiona con el siguiente y
sale una ocupación del doble de larga: un dato falso que nadie cuestiona. Por eso los ocho pasan
por `sellarTransicionDeMesa` y por eso el sello es parámetro OBLIGATORIO de `limpiarMesa` y de
`atarMesaAOrden` — un opcional se olvida.

**3 · Dos guardas sobre el mismo `where` pueden tapar huecos distintos.**
El destino de un cambio de mesa exige `estado = 'libre'` Y `orden_activa_id is null`. Parecían
redundantes: la primera impide sentar sobre una mesa en LIMPIEZA, la segunda sobre una mesa
HUÉRFANA. Ninguna se ponía roja con las pruebas que había; hizo falta sembrar los dos estados
imposibles para que cada guarda se ganara su sitio en vez de aparentarlo.

**4 · Una mutación puede COLGAR la suite en vez de ponerla roja, y eso es un hallazgo.**
Cambiar el signo del paso en el reparto del residuo dejó un `while` girando para siempre. Ese bucle
vive dentro de una petición HTTP. Ahora lleva tope de una vuelta y un `ErrorDominio` si lo pasa.
**Si una mutación cuelga la suite, el problema no es la mutación.**

**5 · Lo que se conserva sin poder dispararse, se DICE.**
Tres cerrojos de esta etapa no se pueden alcanzar hoy y sus comentarios lo declaran: la suma final
de `calcularDivision`, el apagado del reloj en `sellarTransicionDeMesa`, y el `where` de estado en
el cierre de una espera. Se conservan por la ruta que alguien escriba mañana.

**6 · Las mutaciones cambiaron el CÓDIGO, no sólo las pruebas.** Tres veces:
· el caso «hay mesa libre ⇒ cero» de F-306 estaba escrito como un `if` aparte y no se podía poner
  rojo, porque la división entera ya lo daba: se borró en vez de dejarlo aparentando;
· el docblock de F-242 decía que el orden de reparto lleva el centavo sobrante al de más puntos, y
  eso lo decide el residuo mayor: el comentario ahora dice lo que el orden SÍ aporta;
· el reetiquetado de F-261 se extrajo a función pura porque `aplicarMovimientos` escribe con SQL
  crudo, que la base falsa no observa. Probarlo sobre la función es la diferencia entre una prueba
  y una suposición.

### Reclasificaciones y decisiones que el modelo no traía

- **F-106 toma de inventario físico** la construyó el tronco en E2 (`tomas-inventario.ts`).
  `restaurante` la reutiliza sin una línea propia: queda confirmada como `[=]`.
- **Las hijas de una división nacen sin `mesa_id`.** El modelo pedía construir «una mesa, una
  cuenta viva» y **ya estaba construido y mejor**: `ordenes_una_activa_por_mesa` (046) cubre cinco
  estados y particiona por organización.
- **`absorbida` es un estado nuevo de `ordenes`**, hermano de `dividida`. El trigger de pagos de la
  070 se reescribe en la 071 para cubrir los dos, en vez de añadir un segundo trigger.
- **Separar mesas NO reparte el consumo**: eso es F-321 y es decisión de caja.
- **«Una mesa en un solo grupo vivo» se impone con índice único parcial**, no con trigger: un
  trigger que consulta y luego inserta pierde contra dos meseros en el mismo segundo.
- **F-325 comparte migración con F-242** (la 076). No tenía número asignado y las dos contestan «a
  quién le toca esta propina».
- **La propina de una cuenta relevada se reparte por CONSUMO LEVANTADO, no por minutos.** El
  documento pedía «partir la atribución en el tiempo»; el tiempo es el eje, pero el peso es el
  consumo. Una mesa que estuvo dos horas con el café no le debe propina a quien la relevó.

### Correcciones a la documentación del modelo

1. **`anularLinea` no «revierte el consumo si ya se cobró».** Eso es F-222 y es otro camino: darle
   a la anulación una segunda puerta al reembolso lo dejaría fuera del control de F-222. Corregido
   en `05-DATOS-Y-BACKEND.md §4`, con la explicación de que el stock sale al COBRAR y de que el
   platillo que la cocina sí preparó se registra con F-261 tipo `reposicion`.
2. **«Sobre 069»** hablaba de una migración que su propia tabla no lista: la consolidación de E0 la
   convirtió en la **066**. Corregido.
3. **`liquidacion_propina_beneficiarios` lleva `id` propio.** El documento propone
   `(liquidacion_id, empleado_id)` como clave primaria; se conserva como UNIQUE y se añade un `id`
   porque el puente exige que toda entidad expuesta lo traiga. Anotado dentro de la 076.
4. **La tabla de migraciones realmente escritas** se añadió al §7 del modelo, con la 075 marcada
   BLOQUEADA y la 078 fuera de alcance.

### Lo que esta etapa NO tocó

- Ni un archivo de `apps/web/heredado/` (D-09). Las pantallas de este modelo viven ahí: de E3 sale
  el backend completo, sus rutas de API y las entradas del puente. El acople es una línea por
  pantalla y está anotado en el FILE-MAP.
- Ninguna migración aplicada. Ninguna escritura contra la base viva.

---

## 2026-09-15 · E4 · `cafeteria` · CERRADA con seis funciones de quince

| ID | Función | Commit |
|---|---|---|
| — | §0.1 · el trigger de unidad base que no protegía a cafetería | `4be6d6d` (migración 080) |
| F-328 | Fila de despacho de mostrador | `4be6d6d` |
| F-329 | Llamado por nombre | `4be6d6d` |
| F-331 | Empaque por canal | `4be6d6d` |
| F-156 | Merma de barra | `b21205f` |
| F-157 | Frescura del grano | `b21205f` |
| F-248 | Bote del turno por horas | `b47ee9f` |

**Migraciones escritas y NO aplicadas:** 080, 081, 082, 083, 085, 086, 087.

Son las seis primeras de su §5 por dolor declarado, más el hallazgo §0.1 que la propia carpeta
marcaba como «va primero porque es un error de datos activo, no una función nueva».

### El hallazgo que justificaba ir primero

`insumo_unidad_base_valida()` —de la 054— obliga a que un insumo se mida en `g`, `ml` o `pieza`, y
su condición es `giro = 'restaurante'` **y nada más**. Para una cafetería no validaba nada: hoy se
puede dar de alta la leche con `unidad_base = 'litro'` y el consumo se dividiría entre mil sin que
falle en ningún lado. Es el error de 1000× con la puerta abierta en el insumo más caro del giro.

La 080 lo cierra **y falla enseñando los insumos malos en vez de convertir a ciegas**: un insumo en
litros puede tener existencias capturadas en litros o capturadas en ml por alguien que ya sabía del
problema, y el sistema no puede distinguirlos. Lo arregla una persona mirando su almacén.

### Lo que esta etapa enseñó sobre la herencia

**1 · El tronco funcionó como tronco, y se nota en lo que NO hubo que escribir.**
F-156 (merma de barra) parecía una tabla nueva y no lo es: la merma ya se escribe en
`movimientos_stock` con su motivo tipado desde la 062, y los motivos son una TABLA precisamente
para que cada giro siembre los suyos. F-156 acabó siendo cuatro filas de `insert`, una columna y
una vista. Lo mismo con F-106 (toma física), que `cafeteria` lista como pendiente y que E2 ya
construyó: se reutiliza sin una línea propia.

**2 · Reutilizar la tabla existente en vez de crear la del documento.**
El `05-DATOS-Y-BACKEND` habla de `pedidos_preparacion`, que es el nombre de la entidad en el
frontend de Miguel; en el esquema es `comandas` y el puente ya las traduce. Crear una tabla
paralela para la barra habría dado dos sitios donde vive «lo que se está preparando».

**3 · Un reloj por cada cosa que se mide, y cada uno arranca donde el usuario lo siente.**
Esta etapa acabó con tres: `marchada_en` (cuándo llegó el plato a cocina, F-323), `cobrado_en`
(cuándo el cliente empezó a esperar, F-328) e `iniciado_en`/`listo_en` del item (F-315). Parecen
redundantes y no lo son: medir la espera de barra desde `created_at` de la comanda diría que el
cliente esperó menos, y medir la preparación desde el cobro pondría en rojo a una cocina que
todavía no había recibido nada.

**4 · Lo que la base falsa no ve, se extrae a función pura.** Tercera vez en la fase:
`lineasDelCanal` vive en el dominio y se prueba ahí porque el descuento de stock se escribe con SQL
crudo. La alternativa —afirmar sobre el ledger que la base falsa no registra— habría sido una
suposición con forma de prueba.

### Reclasificaciones

- **«barista» NO es uno de los siete roles del sistema.** Un barista cobra y prepara: los comandos
  de barra los ejecutan `cajero` y `cocina`. El documento del modelo lo nombra como si fuera un rol
  y no lo es.
- **El paquete que declaran es `operativo`, no `cafeteria`.** Ese nombre no existe hasta que se
  aplique la 066, y declararlo ahora dejaría los comandos apagados justo para el cliente que los
  necesita. Cuando se aplique la 066, el conjunto `PAQUETES_OPERATIVOS` cambia en un sitio.
- **F-106 toma de inventario físico:** `cafeteria` la lista como pendiente y el tronco de E2 ya la
  construyó. Pasa a `[=]` reutilizada.
- **F-023 listas de precio es una función de TRONCO, no de `cafeteria`.** Su ID está en el bloque
  F-0xx —catálogo compartido— y su efecto es sobre el precio de CUALQUIER modelo. Ver más abajo.

### Lo que NO se construyó en esta etapa, y por qué

- **F-023 listas de precio.** El dolor es real y caro —cada pedido de plataforma se vende con un
  29 % menos de margen— pero es una función del TRONCO: toca el camino del precio de los cinco
  modelos y de las tres rutas de captura (mostrador, mesa, portal QR). Construirla sólo en una de
  las tres crearía exactamente los «dos sitios donde se calcula un precio» que `04-ARQUITECTURA §9`
  marca como desviación. Necesita su propio hueco de tronco —064 o 065, que están libres— y una
  pasada completa por las tres rutas.
- **F-027 modificadores con receta, F-030 combos, F-930/F-934/F-936 sellos, F-330 pedido
  anticipado, F-235 varias cajas, F-984 cajón de dinero.** Quedan pendientes. El fondo desglosado
  en monedas/chicos/grandes de F-984 sí entró, en la 086, porque F-248 lo necesitaba para que el
  arqueo cuadrara.
- **F-249 segunda pantalla al cliente:** BLOQUEADA por el encargo.

### Correcciones a la documentación del modelo

1. **`pedidos_preparacion` no existe en el esquema**: es `comandas`. La carpeta usa el nombre del
   frontend heredado; se anota para que quien acople no busque una tabla que no está.
2. **El §7 de migraciones dice que «`restaurante` ocupa de la 060 a la 069»** y D-08 le da de la 070
   a la 078. Es un resto de la numeración anterior a E0.
3. **La 080 del documento hace tres cosas de naturaleza distinta** y la propia carpeta lo advierte.
   Lo que se escribió aquí es sólo la primera —ampliar el trigger de unidad base—; el renombre de
   `operativo` y el movimiento de Café Jacaranda siguen en la 066, con su condición P-04 intacta.

---

## 2026-09-15 · E5 · `abarrotes` · CERRADA con ocho funciones

**Commits:** `8ea8846` (F-111 + F-112), `329049c` (F-254 + F-255 + F-256), `9db8a99` (F-149),
`a089046` (F-148), `4cab9e5` (F-107 + F-040), `c8b767c` (F-257).

Es la raíz del arquetipo A1 y de aquí cuelgan dieciocho vecinos. Lo que se construyó es el
esqueleto que `ferreteria`, `farmacia`, `papeleria` y los demás no tienen que volver a escribir:
las presentaciones, el conteo por zonas, el dinero ajeno que pasa por el cajón y el redondeo.

### Lo que esta etapa enseñó

**1 · La extracción de variantes de E2 se pagó sola.** V3 entró como **un `case` y un archivo**:
`consumoDePresentacion` en `variantes/v3-presentaciones.ts` y una rama en `planear()`. La
acumulación del tronco —la que guarda las unidades y el `permiteNegativo`— no se tocó, que era
exactamente el punto de haberla extraído. Si V3 hubiera obligado a editar `calcularConsumo`, la
extracción habría sido un refactor decorativo.

**2 · «Un ledger, cuatro vistas» era verdad.** `05-DATOS-Y-BACKEND.md` §1.5–1.8 propone CUATRO
tablas —`operaciones_comision`, `saldos_comisionista`, `depositos_envase`, `abonos_fiado`— y E0 ya
había decidido que son el mismo objeto. F-254, F-255 y F-256 salieron como **tres comandos sobre la
`pasivos_terceros` de la 063**, sin una tabla nueva. El saldo se deriva sumando el ledger y nunca
hay un `update` de saldo, que es donde viven los descuadres de este tipo.

**3 · El motor de F-106 ya estaba; lo que faltaba era que el conteo volviera mañana.** E2 construyó
`tomas_inventario`, `toma_conteos` con el `esperado` sellado al contar, y su repositorio. F-149 no
es otro motor: es una zona que sabe cada cuántos días toca y cuándo se contó. La `091` asciende
`tomas_inventario.zona` de texto libre a fila por eso: un texto no lleva frecuencia, y «Refrescos»
y «refrescos» parten en dos el historial de un mismo anaquel.

**4 · La lección más cara de la etapa: una mutación que NO se aplica se lee igual que una que no se
pone roja.** Las sustituciones con `perl -0pi -e` cuyo patrón lleva `\n` **no aplican** a través de
esta herramienta. Cuatro mutaciones seguidas salieron «verdes» sin haberse escrito nunca, y la
conclusión falsa —«la prueba no vale»— habría llevado a borrar código bueno. Desde entonces las
mutaciones van por un script que **falla ruidosamente si no encuentra el texto o lo encuentra más
de una vez**. Una mutación ambigua tampoco prueba nada.

**5 · La base falsa no lleva `check`, y ahí se esconden los errores que sólo Postgres ve.** Al
escribir F-257 aparecieron **dos defectos latentes** que ninguna puerta veía:

  - `movimientos_caja.referencia_tipo` seguía con el `check` de la 003 —`('orden','gasto',
    'manual')`— y los comandos de F-254/F-255/F-256 escriben `'pasivo'`. Contra una base con la 003
    aplicada, revientan.
  - `packages/domain/src/inventario/consumo.ts` planea movimientos con
    `tipo = 'salida_consumo_interno'` desde F-261 (E3) y **ninguna migración lo añadió al `check`**.
    La primera cortesía revienta igual.

  Los dos se cierran en la `097`. Es literalmente la pregunta que el propio estándar de contratos
  obliga a hacerse: *¿qué camino de ejecución NO recorre ninguna de mis puertas?* Aquí la respuesta
  era «todos los `check` de la base», porque en la Fase 2 las migraciones no se aplican.

**6 · El servidor pone el factor, igual que pone el precio.** El mostrador manda «nueve de esta
presentación», nunca «nueve por veinticuatro». Con el factor en la entrada se cuadra cualquier
faltante de conteo tecleando, y no falla nada. Es la misma regla que el precio y por el mismo
motivo, aplicada a una función que no habla de dinero.

### Reclasificaciones y decisiones que el modelo no traía

- **F-106 toma física pasa a `[=]` reutilizada**, igual que en `cafeteria`: E2 la construyó entera.
  F-149 es la parte nueva.
- **La zona se cuelga del INSUMO, no del producto.** `05-DATOS-Y-BACKEND.md` §2 pide
  `productos.zona_id`; lo que se cuenta es el insumo —`toma_conteos.insumo_id`—, y con la zona en el
  producto un insumo sin producto (el envase, el granel sin empaquetar) sería invisible en el
  recorrido y un producto con dos insumos no sabría en qué anaquel contarse.
- **`registrarMovimiento` de caja ahora devuelve el id.** Era `void`; `redondeos.movimiento_caja_id`
  necesita apuntar a su gemelo, y buscarlo después por referencia es una consulta más y una forma
  de equivocarse.
- **`compras.sugerir_pedido` va por POST sin parámetro de ruta.** El §6 la propone como
  `compras/sugerencia/[proveedorId]`; necesita tres datos —proveedor, almacén y ventana de venta— y
  meter dos en la cadena de consulta los dejaría fuera de la validación de `definirComando`.

### Correcciones a la documentación del modelo

1. **§1.5–1.8 proponen cuatro tablas que no se crearon.** El ledger de la 063 las cubre. Se anota
   aquí porque quien acople va a buscar `operaciones_comision` y no está.
2. **§1.9 `redondeos` sin `movimiento_caja_id`.** Sin la fila gemela el arqueo sigue descuadrando
   por los mismos veinte centavos que F-257 viene a explicar. Se añadió, y la `097` dice por qué.
3. **§7 numera la migración de presentaciones como `070` en el texto («Sobre `070` y el
   backfill»)** y en el árbol como `090`. La real es la `090`; la `070` es de `restaurante`.
4. **§7 habla de «la 082» y «la 078»** en los pendientes de la carpeta, con la numeración anterior
   a D-08. Son la `092` y la `098` del rango de este modelo.

### Lo que NO se construyó en esta etapa, y por qué

- **F-986 lector como teclado y F-201 atajos.** Son pantalla pura: un `addEventListener` que mide
  el tiempo entre teclas y un índice en memoria. No hay comando que escribir y no hay nada que
  probar por mutación en el servidor. Van con la pasada de interfaz.
- **F-983 báscula conectada.** Depende de hardware y de un puerto serie; F-148 cubre el caso que sí
  se puede cerrar hoy, que es el producto ya pesado y etiquetado.
- **F-011 IVA mixto e IEPS.** Es lo único que se dejó sabiendo que duele, y por una razón: toca el
  camino del precio de las tres rutas de captura y de los cinco modelos. Media función aquí —la
  tasa por producto sin el desglose en el ticket ni en la global— deja el sistema declarando mal
  con la apariencia de que ya está. Necesita su propia pasada, como F-023 en `cafeteria`.
- **F-146 caducidad sin lote, F-058 etiquetas de anaquel, F-980 restricción legal, F-214 vales,
  F-103 kardex por artículo, F-635 cuentas por pagar, F-017 diccionario.** Pendientes, con su hueco
  de migración libre (`092`–`096`, `098`, `100`–`101`).
- **F-988 venta sin conexión** y **F-940…F-945 CFDI**: BLOQUEADAS por el encargo.

### Las pantallas, dicho explícitamente

**Esta etapa no abrió ninguna pantalla en el navegador, y no podía.** Las ocho funciones dependen de
tablas y columnas que sólo existen en las migraciones `090`, `091`, `097` y `099`, y la Fase 2
**escribe migraciones y no las aplica**. Una pantalla de conteo contra una base sin `zonas_anaquel`
no se cae con un error entendible: se cae con un 42P01 de Postgres. Se declara como pendiente en vez
de escribirla y decir que está hecha, que es justo lo que el encargo prohíbe.

---

## 2026-09-15 · E6 · `ferreteria` · CERRADA con nueve funciones

**Commits:** `ba3becf` (F-059 + F-152 + F-201), `5c80fbc` (F-145 + F-150), `66e4d28` (F-638 +
F-639 + F-606), `7d806fa` (F-258).

`ferreteria` hereda de `abarrotes` y lo desborda por tres lados. Lo que NO se volvió a escribir:
presentaciones, conteo por zona, dinero ajeno, redondeo. Lo que sí, porque `abarrotes` no lo tiene:
la medida como eje del catálogo, el material que se corta, y el crédito con autorizados.

### Lo que esta etapa enseñó

**1 · La herencia se comprobó campo por campo, y en tres casos NO era la misma función.**
El modelo marca mucho como `[=]`. Al leerlas con el código delante:

- **F-149 (zona) contra F-152 (ubicación)** parecen lo mismo y son dos tablas. La zona existe para
  CONTAR —una vez al día, por el encargado, agrupando gavetas— y la ubicación para VENDER —sesenta
  veces al día, por el mostradorista, gaveta por gaveta—. Fusionarlas obligaría a que la unidad de
  conteo fuera la gaveta, y contar 400 gavetas es una vuelta de dos años.
- **F-121 (venta en dos unidades) contra F-151 (pieza ↔ kilo).** En `abarrotes` el factor es exacto:
  la caja trae 24. Aquí el factor es el PESO POR PIEZA, medido, con 3 %–8 % de desviación entre
  lotes. La reclasificación que el modelo pedía queda confirmada con el código.
- **F-254 (abono de fiado) contra el pago a crédito.** En `abarrotes` la aplicación es `jsonb`
  porque nadie consulta el detalle; aquí se consulta Y SE DISCUTE, y por eso `repartirPago` existe
  como función pura con su propia prueba.

**2 · Micrómetros, por la misma razón que los centavos.** `1/4"` son 6.35 mm exactos y `1/8"` son
3.175: en milímetros enteros se pierde y con decimales vuelven los flotantes que esta fase prohíbe.
En micras los dos son enteros. Y el valor ORIGINAL se guarda al lado y nunca se deriva: 6,350 podría
presentarse como `1/4"` o como `6.35 mm` y la correcta es la que se capturó.

**3 · La tolerancia pertenece a quien BUSCA, no a quien captura.** Buscar `1/2"` y encontrar la
llave de 13 mm es lo que el mostradorista hace todos los días; darlas de alta como la misma clave
sería fundir dos productos del fabricante. Es la misma distinción que el precio: una cosa es lo que
se muestra y otra lo que se guarda.

**4 · Aviso, no muro.** Las tres puertas del crédito se avisan y dejan pasar. Sólo la mora bloquea,
y siempre con llave del dueño. Un sistema que le impida a Beto surtirle a su mejor cliente en una
emergencia es un sistema que se apaga esa misma tarde, y entonces las otras dos puertas siguen
abiertas de todas formas.

**5 · Lo que se sella no se deriva.** `remisiones.autorizado_estaba_en_lista` se escribe en el
momento de entregar. Derivarlo después de `autorizado_id` mentiría al revés: el autorizado pudo
darse de baja entre la entrega y el pleito, y entonces el sistema diría que no estaba cuando sí
estaba. Misma regla que el precio en la línea de venta.

**6 · Un contrato de E2 cazó un hueco de esta etapa.** `estados-con-columna.contrato.test.ts` falló
con «nadie escribe `cerrada` en `obras`»: la `112` declaraba el `check` y no existía el comando.
Salió `credito.cerrar_obra` —que además no deja cerrar una obra con saldo, que es la forma más
limpia de perder $18,400— y el contrato volvió a verde. Es exactamente para lo que ese contrato se
escribió.

### Correcciones a la documentación del modelo

1. **`05` §6 propone `compras/sugerencia/[proveedorId]`**; se corrigió en E5 y aquí se repite el
   mismo criterio con `credito/*`: los comandos que necesitan más de un dato van por POST con
   cuerpo validado, no con parámetros de ruta que se saltan la validación.
2. **`pagos_credito.sesion_caja_id` nullable** está bien justificado en el documento y no se
   construyó todavía: el comando de pago a crédito queda pendiente. El `check` que lo sustituye
   —todo pago en efectivo exige movimiento de caja— se escribirá con él, no antes.

### Lo que NO se construyó en esta etapa, y por qué

- **F-061 foto de mostrador y búsqueda visual.** Necesita subida de archivos y una pantalla; el
  documento es explícito en que NO es reconocimiento por aprendizaje automático, y eso ya quedó
  escrito. Sin la pantalla no hay nada que probar en el servidor.
- **F-153 listas de trabajo, F-600…F-607 cotización, F-103 kardex, F-051 dinero dormido, F-635
  cuentas por pagar, F-636 comparativo de proveedores, F-054 venta por mostradorista.** Pendientes
  con su hueco de migración libre (`114`–`121`).
- **F-060 equivalencias:** la tabla está escrita con su `declarado_por` —que no es auditoría, es
  producto: cuando Chava se jubile, lo que declaró se queda— pero el comando de alta no. Se declara
  en vez de contarla como construida.
- **El pago a crédito (F-614 en variante) y F-617 bloqueo por mora.** `repartirPago` existe y está
  probado; falta el comando que lo ejecuta contra `pagos_credito` y `aplicaciones_pago`.
- **F-151 sólo está en el dominio.** `piezasDesdePeso` calcula y avisa de la tolerancia; falta
  engancharlo a `venta.cobrar`, que es donde la pesada se convierte en línea.
- **F-940…F-945 CFDI con `ClaveUnidad`:** BLOQUEADAS por el encargo.

### Las pantallas, dicho explícitamente

**Esta etapa tampoco abrió ninguna pantalla en el navegador, y por la misma razón que E5:** las
nueve funciones dependen de tablas y columnas que sólo existen en las migraciones `110`–`113`, y la
Fase 2 escribe migraciones y no las aplica. Una pantalla de búsqueda por atributo contra una base
sin `producto_atributos` no se cae con un error entendible: se cae con un 42P01.

### Un hueco de cobertura, declarado

El `and cantidad >= …` del `update` de existencias en el corte **no se puede poner rojo** con la
base falsa, que no interpreta SQL crudo. La prueba cubre la REACCIÓN —cuando el update no casa
ninguna fila, se lanza `STOCK_INSUFICIENTE`— pero no el predicado. Lo mismo el compare-and-set del
saldo del cliente: meter una escritura ajena entre la lectura y el `update` exigiría dos filas con
el mismo id, que Postgres no permite, y una prueba sobre un estado imposible no prueba nada. Los dos
son contratos con Postgres y necesitan integración con `DATABASE_URL`.

---

## 2026-09-15 · E7 · `estetica-salon` · CERRADA con el motor de A3

**Commits:** `1523813` (el motor puro: duración, huecos, comisión), `b11791d` (la cita, de agendar
a cobrar), `8a0719a` (la liquidación y el puente).

Es el único de los cinco modelos que **no existía en absoluto**: no había plantilla, no había
agenda, MorphiqPOS no tenía ni un calendario. De aquí cuelgan once vecinos de la familia 03.

### Lo que esta etapa enseñó

**1 · La decisión que lo gobierna todo cabe en una frase: la duración de un servicio es una
SECUENCIA, nunca un número.** Un tinte son 120 minutos, pero no son 120 minutos de estilista: son
40 de aplicación, 45 de procesado —la clienta sentada sola—, 25 de terminado y 10 de limpieza. Si
la agenda bloquea al profesional durante el procesado, el salón atiende 6 clientas al día; si lo
libera, 9 **con la misma gente y el mismo local**. Es entre el 25 % y el 40 % de capacidad que
ningún competidor del segmento aprovecha, y sale entero de separar `rango_activo` de
`rango_ocupacion`.

**2 · Y se construye como secuencia AUNQUE la barbería no la necesite.** Con `pasiva = 0` el mismo
modelo sirve para los once vecinos sin una sola rama. Nacer con un entero y meter el tiempo pasivo
después obligaría a reescribir la agenda entera, que es la parte más cara del modelo.

**3 · La restricción de exclusión va sobre el rango ACTIVO, no sobre la ocupación.** Declararla
sobre la ocupación devolvería el procesado a bloquear al profesional, y la función entera se caería
**sin que ninguna prueba lo notara**: las citas se seguirían agendando, sólo que menos. Es el tipo
de regresión que no se ve hasta que alguien cuenta cuántas clientas atendió el mes pasado.

**4 · La comisión no es aritmética: son cinco preguntas contestadas ANTES.** ¿Sobre lo cobrado o
sobre la lista? ¿Sobre el IVA? ¿El material lo pone el salón, se descuenta de la base, o lo paga
ella? Con dos personas, ¿se reparte o se lo lleva quien lo tomó? ¿Rehacer se paga dos veces? Cuando
no están contestadas, cada quien contesta la suya y el pleito del domingo es inevitable **porque
los dos tienen razón con su propia respuesta**.

**5 · Un contrato de E2 cazó un hueco, y el contrato también estaba mal.** Al escribir la `132`,
`estados-con-columna` marcó en rojo que nadie escribía `cobrada`, `no_llego` ni `cancelada` en
`citas`. Eso era cierto y salieron los comandos. Pero al escribirlos, el mismo contrato **falló
señalando código correcto**: leía el archivo entero y le atribuía a `citas` el
`values({ estado: 'cobrada' })` de `ordenes`, que escribe el mismo estado y no tiene por qué llevar
`orden_id`. Se corrigió para que recorte por tabla, y **se comprobó que sigue cazando las
regresiones reales** —quitar `orden_id` del update de citas, quitar la firma del no-show—. Un
contrato que manda a arreglar lo que no está roto es la versión más cara de un contrato que miente.

**6 · Lo que se sella no se recalcula, tercera vez en la fase.** El precio de la cita se congela al
agendar; la comisión guarda con qué regla y con qué VERSIÓN se calculó; la liquidación SUMA el
ledger en vez de recalcularlo. Las tres son la misma regla y las tres existen porque recalcular es
la tercera oportunidad de que el número salga distinto.

### Decisiones que el modelo no traía

- **`profesionales` se declara en `PAQUETES_TODOS`**, no en un paquete `salon` que no existe hasta
  la `066`. Es el mismo criterio que `cafeteria` fijó en E4: declarar un paquete inexistente apaga
  el comando justo para quien lo necesita.
- **La cita lleva serie propia de folio (`CITA-`)** y el ticket la suya. Dos documentos distintos
  en la misma serie hacen que el folio 480 sea a veces una cita y a veces una venta.
- **`liquidarProfesional` no cobra la renta aparte: la resta.** Cobrarla por separado obliga a dos
  movimientos de caja el mismo día con la misma persona, y el arqueo explica dos veces la misma
  conversación.
- **Una liquidación en contra se arrastra, no se paga.** Pasa con anticipos grandes, y sacar dinero
  del cajón al revés no es una operación.

### Lo que NO se construyó en esta etapa, y por qué

- **F-406 recordatorio por WhatsApp:** BLOQUEADA por el encargo — la decisión de proveedor no la
  toma esta carpeta.
- **F-414 anticipo, F-439 paquetes, F-243/F-260 propina V4, F-441 el cobro de la renta, F-416 el
  comando de bloqueo, F-434 el expediente completo con fotos y consentimientos.** Las tablas de
  varias están declaradas en el `05` del modelo y **no se escribieron sus migraciones**: quedan
  libres la `134` y las `136`–`145`. Lo que sí quedó es el motor del que cuelgan.
- **F-409 lista de espera:** el dominio está construido y probado —`aQuienSeLeOfrece`, con el orden
  por antigüedad y el hueco que tiene que caber entero— y **falta su tabla y su comando**.
- **F-428 reparto entre profesionales:** `repartirComision` existe y está probado; falta la tabla
  de participaciones que lo alimente. Hoy `cobrarCita` causa la comisión entera a quien dio el
  servicio, que es el caso de siempre.
- **El material en la base de la comisión.** `calcularComision` sabe descontarlo y cobrarlo aparte;
  `cobrarCita` le pasa cero y **lo dice en un comentario**, porque el costo del producto de cabina
  vive en el ledger de stock y traerlo aquí es la siguiente pasada. Se declara en vez de inventar
  un número.
- **F-017 diccionario de vocabulario.** Tercer modelo que lo pide —`abarrotes` avisó, `ferreteria`
  lo dio por hecho consumado— y aquí ya no es cosmético: «mesa» → «estación», «mesero» →
  «estilista», «comensal» → «clienta» con género. Sigue sin construirse, y **once modelos más
  vienen detrás de éste**.

### Las pantallas, dicho explícitamente

**Esta etapa tampoco abrió ninguna pantalla en el navegador.** No hay una sola pantalla de agenda en
el repositorio, y construirla contra una base sin `citas` ni `profesionales` no se puede: las cinco
migraciones de esta etapa están escritas y sin aplicar, como manda la Fase 2. Es la tercera etapa
seguida en la que esto pasa y por la misma razón; está en el reporte final con su renglón propio.

---

## 2026-09-15 · CIERRE · Los tres componentes de E3 y E4

Al escribir el reporte final me di cuenta de que había declarado como pendiente algo que D-09 SÍ
permite: los componentes nuevos, escritos al lado de los viejos. Se comprobó primero que la
excepción de D-09 no aplica —`carril-b` **no** está fusionada a `main`— y después se escribieron.

| Componente | Función | Dónde |
|---|---|---|
| `DividirCuentaDialog.tsx` | F-321 | `apps/web/src/restaurante/` |
| `AnularLineaDialog.tsx` | F-324 | `apps/web/src/restaurante/` |
| `FilaDeBarra.tsx` | F-328 · F-329 | `apps/web/src/cafeteria/` |

**Van a `apps/web/src/` y no a `heredado/`, a propósito.** D-09 permite crear archivos nuevos
dentro de `heredado/`, pero el verificador de primitivas **no vigila esa carpeta**: un literal de
color ahí no tumba ninguna puerta. En `apps/web/src/` sí, y además los cubren lint, typecheck y
build. Escribir componentes nuevos en la carpeta exenta habría sido elegir la opción sin puerta.

**El cambio de una línea** que hará falta al acoplar está anotado en el `FILE-MAP.md` de cada
modelo, con el archivo exacto y el `import`.

**Ninguno se abrió en el navegador**, y no se puede: los tres llaman a rutas cuyos comandos leen
tablas de las migraciones `070`–`077` y `082`, escritas y sin aplicar.

### Y lo que sigue sin escribirse, con la razón precisa

De las funciones de E5, E6 y E7 no hay pantalla, y hay DOS razones, no una:

1. Dependen de migraciones sin aplicar, igual que éstas.
2. **El `04-INTERFAZ.md` de esos modelos no decide esos diálogos.** Decide las pantallas del modelo
   —mapa de mesas, cobro, precuenta, cocina, agenda— y no un diálogo de conteo cíclico ni uno de
   corte de material. Construirlos habría sido inventar layout, que es justo lo que el encargo
   prohíbe. Que la decisión falte no exime de la función: obliga a decir que falta.

### Cierre de las cinco etapas · `d5d0f68`

`pnpm verify:fase2` corrido **con los tres componentes ya en el árbol** —o sea que
`verify:primitivas`, `format:check`, `lint`, `typecheck` y `build` los vieron— y en verde de punta
a punta: **26 eslabones, 158 archivos de prueba, 1,837 pruebas, 0 fallos, `exit=0`**. La salida
entera, sin recortar, está pegada en el §2 del reporte: `docs/reports/010-claude-code-fase2-cinco-modelos.md`.

Ese reporte es el documento de entrega. Lleva, además de la salida: la Etapa 0 con los IDs que se
añadieron y los solapamientos que se fusionaron; la tabla por modelo con **función · commit ·
prueba · una mutación que la valida**; qué se abrió en el navegador y qué no, con la razón; las
reclasificaciones `[=]`↔`[≠]`; la documentación que se corrigió y por qué estaba mal; y un
**LO QUE NO HICE** que es la sección más larga a propósito.

## 2026-09-15 · E8.0 · La puerta de cobertura, que sustituye a mi opinión

**Lo que falló antes.** La sesión anterior no se quedó sin tiempo ni sin permiso: corrió hasta el
final y escribió «las cinco etapas están cerradas, no queda nada pendiente» con el 40 % hecho. El
error concreto tiene nombre: **contó FILAS DE TABLA en vez de FUNCIONES**. `F-610…F-617` es una
fila y son ocho funciones. Con ese error, ferretería se leía como 13 pendientes cuando son 38.

**Lo que se construye.** `scripts/verificar-cobertura.mjs` → `pnpm verify:cobertura`, enganchada
como último eslabón de `verify:fase2`. Mide tres cosas, y las tres salen de la documentación:

| | De dónde sale | Cuándo cuenta como construida |
|---|---|---|
| FUNCIONES | `01-FUNCIONES.md` §5 de cada modelo, con los rangos **expandidos** | hay un archivo con el ID en su cabecera **y** hay prueba |
| RUTAS | la sección «RUTAS DE API» de cada `05-DATOS-Y-BACKEND.md` | el `route.ts` existe en la ruta declarada |
| PANTALLAS | cada `###` del §4.3 de cada `04-INTERFAZ.md` | hay un archivo con `PANTALLA · <modelo> · <slug>` **y es alcanzable desde una raíz de Next.js** |

Y un cuarto bloque aparte: el **TRONCO**, ocho funciones que no salen de ningún §5 y que heredan
los 73 modelos que faltan. Sin esa lista la puerta daría verde sobre un cimiento a medias, que es
justo el punto ciego de la sesión anterior: sus cinco tablas se veían bien y el tronco no estaba.

**La primera lectura, que es la que valida la puerta.** Salió en ROJO con `62/113 · 26/105 ·
0/61` y el tronco en `3/8`. Sin el archivo de excepciones eran `47/113`. La auditoría decía
`45/113 · 44/106 · 0/61`: las tres cifras caen donde tenían que caer, y las dos diferencias tienen
explicación escrita —abajo—. Si hubiera salido en verde, la puerta estaría mal.

### Las tres mutaciones que la validan

```
Destructivas que FALLAN:
  · borrar las siete etiquetas F-321 de sus implementaciones  →  restaurante 8/8 → 7/8,
    «F-321 sin implementación». Con DOS de las siete borradas NO se pone roja, y eso
    también es correcto: la función sigue implementada en los otros cinco archivos.
  · que los rangos dejen de expandirse (`push(idDe(desde))` en vez del bucle)  →
    el total cae de 113 a 79. Es exactamente el bug que costó la sesión anterior,
    y ahora lo caza la puerta.
Inocuas que PASAN:
  · una línea en blanco al final del script  →  62/113, sin cambio.
```

### Dos diferencias con la auditoría, y por qué no son errores

**RUTAS: 26 contra 44.** No es que falten dieciocho: es que **la sesión anterior escribió las
rutas con nombres distintos a los que la documentación declara**. `apps/web/app/api/agenda/cita`
existe, y el `05-DATOS-Y-BACKEND.md` de estética declara `apps/web/app/api/citas`. Lo mismo con
`cafeteria/llamar` contra `cafeteria/llamar-pedido`, `cafeteria/bote` contra
`propinas/repartir-bote`, y once más. Como el documento es el contrato que van a leer los 73
modelos que faltan, **se corrige el código, no el documento**: las rutas viejas se mueven a la
ruta declarada. La auditoría contó «hay una ruta para esa función»; la puerta cuenta «existe la
ruta que el contrato declara», que es la pregunta que de verdad importa al acoplar.

**Total de rutas: 105 contra 106.** Estética declara `GET` y `PUT` sobre
`/api/clientes/:id/expediente`. Son dos verbos y **un solo archivo** `route.ts`. La puerta cuenta
archivos porque es lo que existe en disco.

### Lo que la puerta NO mide, dicho antes de que parezca que sí

- Que la pantalla **se abra en el navegador**. Casi ninguna se puede abrir: dependen de
  migraciones escritas y sin aplicar. Eso se dice en cada `FILE-MAP.md`, no lo tapa la puerta.
- Que el código sea **correcto**. De eso se encargan las 1 837 pruebas y el arnés de mutación.
  La cobertura mide presencia, no calidad. Son dos puertas distintas y las dos hacen falta.
- Las funciones del tronco que ya existían antes de la Fase 2 (F-100, F-101, F-102, F-104,
  F-107). Se dan por buenas porque ya tienen prueba y ya están en producción.

### El archivo de excepciones

`docs/fase-2/EXCEPCIONES-COBERTURA.md`, once entradas: los seis CFDI (`F-940`…`F-945`, decisión
P-02), `F-318` impresión de comanda y sus dos rutas, `F-249` segunda pantalla, `F-406`
recordatorio por WhatsApp. **Una fila por función, nunca un rango** — la regla del archivo lo dice
con esas palabras, porque el rango es justo lo que rompió la cuenta anterior.

## 2026-09-15 · E8.1 y E8.2 · F-015, F-016 y F-017 dejan de ser código inalcanzable

**El diagnóstico, comprobado.** `plantillaDe()`, `MODULOS_POR_PLANTILLA`, `modulosActivos()` y
`crearVocabulario()` estaban escritas, exportadas, tipadas y con prueba unitaria propia. Un
`grep` de sus nombres sobre todo el repositorio, excluyendo sus propios archivos, devolvió
**cero líneas**. Es el peor estado posible de una función: compila, pasa, se lee como construida
en cualquier inventario, y no gobierna nada.

> Matiz al encargo, comprobado archivo por archivo: el `package.json` de `contracts` exporta sólo
> `.`, `./errores` y `./entorno`, pero `src/index.ts` **sí** reexporta `./comandos/index.ts`, que
> reexporta `plantillas.ts`. O sea que eran alcanzables por `@morphiqpos/contracts` y el problema
> no era el export: era que **no las llamaba nadie**. Se corrige lo segundo, que es lo que había.

**Lo que se construyó para que gobiernen:**

| Pieza | Dónde | Qué hace |
|---|---|---|
| `repoModulos` | `packages/data/src/repos/modulos.ts` | lee giro + columna `paquete` + perillas; `upsert` y borrado de perilla |
| `repoVocabulario` | `packages/data/src/repos/vocabulario.ts` | lee y escribe las excepciones de `vocabulario_negocio` |
| `modulosDelNegocio()` | `packages/app/src/configuracion/modulos.ts` | traduce giro + columna a **plantilla**, y aplica las perillas |
| `fijarModulo` · `restablecerModulo` | ídem | F-016, con motivo obligatorio |
| `vocabularioDelNegocio()` | `packages/app/src/configuracion/vocabulario.ts` | el giro más lo que el negocio cambió a mano |
| `fijarTermino` · `restablecerTermino` | ídem | F-017, con **género declarado** |
| La perilla en el envoltorio | `packages/app/src/comando.ts` | `definicion.modulo` se comprueba en el SERVIDOR, tras el paquete y antes de la entrada |

**Y 25 comandos existentes quedaron colgados de una perilla**: recetas (2), mesas (5), mesero (2),
cocina (3), compras (4), inventario (4) y los cinco del portal… **no**. Los del portal se
revirtieron: son `ComandoPublico`, un tipo distinto sin sesión, y su puerta ya es
`QR_PORTAL_CERRADO`. Quedan 20.

### Tres decisiones que el encargo no traía

1. **`restablecer` no es «apagar»**, y son dos comandos distintos. Apagar escribe `activo=false` y
   ahí se queda aunque el preajuste cambie; restablecer **borra la excepción** y vuelve a seguir a
   la plantilla. Sin las dos, una personalización no se puede deshacer, sólo invertir — que es una
   decisión permanente disfrazada de interruptor.
2. **Los comandos de perillas NO declaran módulo.** Si `configuracion.fijar_modulo` colgara de una
   perilla, apagar esa perilla sería un candado sin llave. Hay una prueba que lo fija.
3. **La decisión pendiente P-01 queda implementada como «plantilla de preajuste + perillas»**, que
   es la recomendación escrita en `05-DECISIONES.md`. Si Miguel prefiere plantilla cerrada, se
   borran dos comandos y una tabla; al revés habría sido rehacer el envoltorio.

### Las mutaciones que validan estas pruebas

```
Destructivas que FALLAN:
  · `plantillaDe` deja de partir por giro (operativo → siempre cafeteria)
       → cae «manda la ferretería en operativo a tienda». Es el caso de La Broca:
         un cliente que paga, con recetas y portal QR donde van presentaciones.
  · `modulosActivos(plantilla, [])` — las perillas dejan de aplicarse
       → caen las dos pruebas de perilla encendida y apagada.
  · `leerPerfil` sin `where activa = true`
       → cae «devuelve null cuando la organización no está activa».
  · `quitarPerilla` apunta a una tabla que no existe
       → cae «restablecer NO es apagar».
  · el doble devuelve todos los módulos cuando no se pudo leer el perfil
       → cae «falla CERRADO si no se pudo leer el perfil». Ésta la encontró la
         prueba ANTES de que yo la escribiera bien: el doble tenía `null` con dos
         significados. Se separó en `undefined` = sin configurar y `null` = ilegible.
Inocuas que PASAN:
  · extraer el giro a una variable intermedia y reasignarlo.
```

**Cuenta:** 1 837 → **1 868 pruebas**. `verify:cobertura` del tronco: 3/8 → **4/8** (F-015, F-016,
F-017 y F-105). Ojo con ese F-105: cuenta porque `tronco-inventario.test.ts` lo nombra, y esa
prueba es una **aserción de texto sobre el SQL**. Es justo el falso verde que la etapa 8.5 va a
cerrar.

## 2026-09-15 · E8.3 a E8.7 · El tronco cerrado: 8/8

**Lo que había, dicho sin adornos.** F-103 kardex, F-105 traspaso, F-108 valuación y F-109 merma
eran **SQL en el disco**. Tenían migración (060, 061, 062) y no tenían repo con prueba, ni comando,
ni ruta. F-260 —la propina como pasivo— ni siquiera eso: el `check` de la 063 admite cuatro
naturalezas y el código escribía **tres**.

### Lo construido

| | Dominio | Comando | Ruta |
|---|---|---|---|
| **F-103** kardex | `inventario/kardex.ts` · `resumirKardex` | `inventario.kardex` (lectura) | `/api/inventario/kardex` |
| **F-105** traspaso | — | `inventario.enviar_traspaso` · `inventario.recibir_traspaso` | `/api/inventario/traspaso` y `…-recibir` |
| **F-108** valuación | `inventario/valuacion.ts` · promedio y PEPS | `inventario.valuar` | `/api/inventario/valuacion` |
| **F-109** merma | `inventario/merma.ts` · tres estrategias | `inventario.registrar_merma` | `/api/inventario/merma` |
| **F-260** propina pasiva | — | `propinas.anotar_pasivo` · `propinas.entregar` | `/api/propinas/pasivo` y `/entregar` |

Y un módulo compartido: `inventario/escala.ts`, con `enEscalaCompleta` y `deEscalaCompleta`. La
primera vivía **privada dentro de `conteo.ts`**; ahora la necesitan el conteo, el kardex, la merma y
la valuación. Tres copias de una conversión de escala es cómo se descubre, seis meses después, que
una de las tres redondeaba distinto.

### Cuatro decisiones que el encargo no traía

1. **El saldo corrido lo calcula Postgres; el resumen lo calcula el dominio.** Una ferretería con
   dos años de movimientos tiene cientos de miles de renglones: traerlos a JavaScript para sumarlos
   es justo el problema que el índice de la 060 existe para evitar. El comando pide **límite + 1**
   para saber si hay más historia sin contar la tabla entera.
2. **PEPS valúa con las capas MÁS NUEVAS.** Suena al revés y no lo es: «primeras entradas, primeras
   salidas» significa que lo viejo ya salió, así que lo que queda en el estante es lo nuevo. Valuar
   con las capas viejas subvalúa el inventario justo cuando los precios suben, que es siempre.
3. **Una existencia negativa vale cero, no un valor negativo.** Restaría del total y haría que el
   almacén valiera menos de lo que hay en el estante. El renglón se queda visible para que se vea.
4. **El retazo es la única merma con recuperación.** Un metro de cable que sobra se vende; ocho
   centímetros no. Tratar los dos igual es lo que hace que el inventario de una ferretería nunca
   cuadre: o sobra cable que no existe, o falta cable que sí está.

### E8.4 y E8.5 · las dos correcciones al encargo, comprobadas

- **`repos/traspasos.ts` NO tenía prueba, y es cierto**: ni una, y tampoco comando que lo llamara.
  Ahora tiene 13 casos en `app/src/inventario/traspaso.test.ts`, a través de sus dos comandos.
- **`repos/tomas-inventario.ts` SÍ estaba probado.** Lo ejercitan los 20 casos de
  `abarrotes/conteo.test.ts` a través de `abrirConteo`, `capturarConteo` y `cerrarConteo`, que lo
  llaman en cuatro puntos. Lo que no tenía era un archivo de prueba **propio**, que es otra cosa.
  Se deja como está: una segunda prueba de lo mismo no añade cobertura, añade mantenimiento.
- **Las aserciones de texto sobre el SQL (`tronco-inventario.test.ts`) se quedan, y dejan de ser lo
  único.** Eran el motivo por el que `verify:cobertura` daba F-103, F-105 y F-108 por construidos:
  una aserción de texto sobre un `.sql` contaba como prueba de la función y no lo es. Ahora cada
  regla de ese archivo tiene su prueba de comportamiento, nombrada una por una en su cabecera, y la
  de texto se queda como segundo cerrojo sobre la decisión de esquema.

### E8.7 · Las cinco eliminaciones, revisadas una por una

El encargo dice cuatro; son **cinco** —el commit `4cab9e5` borró dos cosas—. Cada una se revisó
reintroduciendo la mutación **con el script que falla ruidosamente**, no con `perl`:

| Lo que se borró | ¿Era necesario? | La mutación que lo demuestra |
|---|---|---|
| salida temprana de `alertasDeMinimo` con los dos pisos en cero | **No.** Las dos guardas `> 0n` la hacían | quitar `critico > 0n` → 1 prueba en rojo |
| conversión de domingo 0 → 7 en `diasHastaLaVisita` | **No.** `(dia - hoy + 7) % 7` es invariante: 0 ≡ 7 mod 7 | `getUTCDay() + 1` → **4 pruebas en rojo** |
| comprobación temprana de `obra.estado` antes de cerrar | **No.** El `where estado = activa` es el único cerrojo y funciona | quitar ese `where` → 1 prueba en rojo |
| comprobación temprana de `cita.estado` antes del no-show | **No.** Ídem con `where estado in (…)` | quitar ese `where` → 1 prueba en rojo |
| salida temprana ante una ventana al revés en `huecosDeAgenda` | **No**, y esta vez con demostración | `Math.abs` en la duración **y** `!==` en el cierre → 1 prueba en rojo |

**Ninguna se restituye.** Y lo que importa más que el veredicto: **las cinco conductas ya estaban
pinchadas por una prueba** —«el domingo es el 7, no el 0», «una ventana al revés no produce
huecos», el artículo con los dos pisos en cero—, así que la equivalencia no es la afirmación de un
comentario: es algo que se pone rojo si alguien la rompe.

> La ventana al revés necesitó una mutación DE DOS PARTES para ponerse roja, y eso se dice: la
> conducta está protegida por dos cerrojos —el `<` del cierre y la comprobación de duración de
> `agregar`— y romper uno solo no basta. La guarda borrada era el tercero.

> Y una comprobación que el script hizo por mí: la mutación del no-show salió **AMBIGUA: 2 veces**
> y se negó a aplicarse. Con `perl` habría mutado la primera coincidencia —que es otro comando— y
> el veredicto habría sido sobre un código que no era el que quería probar.

### Un hallazgo del camino: la base falsa no sabía comparar contra un literal

`recibirTraspaso` usa `eb.or([...])` con una comparación contra `null`, y el constructor falso sólo
entendía **columna contra columna**. Reventaba con `Cannot read properties of null`. Se amplió a
tres formas —`columnas`, `literal` y `grupo` con `or`/`and`— y se le enseñó que Postgres compara
nulos con `is` y no con `=`: tratarlos igual haría que `is null` coincidiera con todo, que es como
un filtro deja de filtrar.

**Cuenta:** 1 868 → **1 954 pruebas**. `verify:cobertura`: tronco **8/8 (100 %)**, funciones
64/113, rutas 28/105.
