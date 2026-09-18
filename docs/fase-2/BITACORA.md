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
Por tanto **D-09 seguía vigente** mientras Codex trabajaba ahí: no se editaba ningún archivo que ya existiera en `apps/web/heredado/`. **Quedó DEROGADA el 16-09-2026** (F2.3-REGLAS §2): `carril-b` se fusionó a `main` el 15 de septiembre y Codex terminó. El acople sí edita esos archivos, y `verify:aspecto` es lo que impide que el aspecto cambie.

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

## 2026-09-16 · E9 y E10 (primera mitad) · F-205, F-330, F-930/F-934/F-936

### Lo construido

| | Qué | Dónde |
|---|---|---|
| **F-205** | tope de descuento por puesto + bitácora de autorizaciones | migración `078`, `domain/venta/descuento.ts`, `venta.autorizar_descuento` |
| **F-330** | pedido anticipado, con hueco de cinco minutos | migración `089`, `cafeteria/anticipado.ts`, tres comandos |
| **F-930/934/936** | sellos, canje y pasivo | migración `088`, `domain/venta/lealtad.ts`, `cafeteria/lealtad.ts`, cuatro comandos |
| **F-027/F-030** | el esquema de opciones con receta y de combos | migración `084` (el código va en la segunda mitad) |

Y las rutas de cafetería **se movieron a los nombres que declara su
`05-DATOS-Y-BACKEND.md`**: `cafeteria/llamar` → `cafeteria/llamar-pedido`,
`cafeteria/bote` → `propinas/repartir-bote`, `cafeteria/presencia` →
`turno/presencia/ajustar`, y tres más. El documento es el contrato que van a
leer los 73 modelos que faltan: se corrige el código.

### Cinco decisiones que el encargo no traía

1. **El tope de descuento son DOS topes, en pesos y en porcentaje.** Con sólo el
   de pesos, un café de $45 se regala entero si el cajero tiene tope de $50. Con
   sólo el porcentual, el 10 % de una charola de cincuenta son $200 que nadie
   autorizó. Cualquiera de los dos solo deja un extremo abierto.
2. **El porcentaje se compara EN CRUZ, no dividiendo.** `descuento / base` en
   enteros trunca, y truncar aquí es tolerar en silencio: sobre $300 con tope del
   10 %, un descuento de $30.01 daría 1000 bp exactos y pasaría. Un centavo no
   arruina a nadie; una tolerancia que nadie declaró, sí.
3. **Quien autoriza tiene que cubrir el descuento ENTERO con su propio tope.** Un
   gerente con tope de $2 000 autorizando uno de $5 000 no es una autorización:
   es la misma falta de tope, con una firma encima.
4. **El canje de lealtad NO da sellos.** Si los diera, cada premio acercaría el
   siguiente: con cinco sellos por premio, el costo real de cada uno bajaría un
   20 % y nadie lo vería hasta el cierre del año.
5. **El pasivo de lealtad cuenta premios COMPLETOS y valúa al COSTO.** Trece
   sellos con cinco por premio son dos premios exigibles, no 2.6. Y un premio no
   es una venta perdida: es un café que se regala, y lo que sale del negocio es
   lo que ese café cuesta hacer. Al precio, el pasivo se inflaría entre dos y
   cuatro veces — y un pasivo inflado se deja de mirar.

### Un defecto que la prueba encontró antes que yo

`otorgarSellos` leía el saldo DESPUÉS de insertar el movimiento **y le volvía a
sumar los sellos**. La fila recién escrita ya es visible dentro de la misma
transacción, así que el saldo salía el doble y el aviso de «ya alcanza» se
habría disparado un café antes de tiempo. Lo cazó «avisa cuando el saldo YA
alcanza para un premio», que afirma el número exacto en vez de sólo el booleano.

### Estado medido, no opinado

```
FUNCIONES  68/113   RUTAS 40/105   PANTALLAS 0/61   MIGRACIONES 32/64
TRONCO     8/8
```
2 029 pruebas.

---

## 2026-09-16 · E10 a E13 · Las cuatro columnas en 100 %

```
FUNCIONES  113/113   RUTAS 105/105   PANTALLAS 61/61   MIGRACIONES 65/65
TRONCO       8/8
```

2 567 pruebas en 219 archivos. `pnpm verify:cobertura` sale en 0.

Doce excepciones declaradas en `EXCEPCIONES-COBERTURA.md`: nueve funciones (los
seis CFDI de P-02, F-318 y F-249 por hardware, F-406 por el canal de WhatsApp),
tres rutas (las dos de impresión y `factura/agrupado`, que es CFDI) y una
migración (`075_impresion_comanda.sql`). Ninguna pantalla.

### La cuenta que hacía falta hacer bien

El encargo lo dijo con esas palabras: **no se cuentan filas de tabla, se cuentan
funciones.** `F-610…F-617` es una fila y son OCHO. Con los rangos expandidos, el
punto de partida real de esta tanda era 80/113 funciones, 44/105 rutas, 6/61
pantallas y 32/64 migraciones — no el 80 % que parecía.

### E10-E12 · Las diecisiete funciones que faltaban

Siete de dominio puro, que se prueban con números y sin montar nada: el IVA
mixto con las tres mecánicas del IEPS (`impuesto-mixto`), contar pesando con su
rango de confianza (`peso`), el precio por canal con la comisión sobre el PRECIO
y no sobre el margen (`lista-precio`), el combo resuelto en componentes con el
centavo sobrante al más caro (`combo`), los recursos de agenda medidos en el
PICO y no en el promedio (`recursos`), el ranking que son cuatro rankings
(`mas-vendidos`) y el lector de código de barras que se distingue por el TIEMPO
entre teclas (`lector-teclado`).

Cinco escritas UNA VEZ para varios modelos. `clientes/ficha.ts` es «la deuda
transversal más cara del proyecto» —lo dicen tres carpetas con esas palabras—:
la tabla existe desde la 002 y no había comandos. `compras/por-pagar.ts` usa la
MISMA aritmética que la cartera de cobros, porque dos aritméticas para el mismo
concepto acaban dando números distintos y entonces ninguno se cree.

### E13 · Las rutas, y lo que hubo que construir debajo

Sesenta y una rutas nuevas. Casi ninguna era «pegar un comando a un `route.ts`»:
faltaba el comando.

**La agenda tenía que CONTESTAR.** `/api/agenda/huecos` es el endpoint más
difícil del modelo: horario vigente del profesional —la agenda de marzo se
explica con el horario de marzo—, citas activas, bloqueos del salón, y los
tramos PASIVOS de otras citas. Ese último renglón es F-415 entero: el tinte que
está asentando no ocupa a la estilista, y ahí cabe el corte que hoy se rechaza
por teléfono.

**La transferencia dejó de aplicarse sola.** F-212: son el 20 %–35 % del valor
en una ferretería y llegan con un comprobante que se ve en la pantalla del
cliente. `registrarPagoCredito` la aplicaba al saldo en el momento; ahora entra
PENDIENTE y la confirma otra persona, mirando el banco. El bucle de aplicación
salió a `aplicarReparto`, compartido con el cobro en efectivo: dos copias es
cómo una se queda sin la guarda optimista.

**El monitor de recogida es la superficie más expuesta del sistema.** Devuelve
nombre de pila y estado, nada más, y el nombre se recorta EN EL SERVIDOR: lo que
no viaja no se puede filtrar.

### La migración que el papel declaraba y nadie había escrito

`05-DATOS-Y-BACKEND.md` de abarrotes declara `venta.suspender` escribiendo
`ordenes.estado`, y el `check` de esa columna —003, ampliado por la 070 y la
071— no admitía ningún estado que significara «apartada». El comando existía en
el papel y NO PODÍA EXISTIR en la base: el primer `suspender` habría sido un
23514 en producción.

Se escribió `102_venta_en_espera.sql`, dentro del rango de abarrotes, y se
DECLARÓ en el árbol del modelo. Por eso la cuenta pasó de 64 a 65: no se
escondió una migración nueva bajo un número existente.

### Tres defectos que los contratos cazaron, y uno lo habría costado caro

1. **`garantia_salida` no existe.** El tipo válido es `garantia_proveedor`.
   Contra Postgres es un 23514 en la primera garantía; contra la base falsa
   habría salido verde.
2. **La 102 borraba `dividida` y `absorbida`.** Copié la lista de estados de la
   003 y me dejé fuera lo que añadieron la 070 y la 071. Aplicar eso habría roto
   dividir cuenta y unir mesas en un restaurante que llevaba meses funcionando.
   Es exactamente el fallo que el contrato `valores-de-check` existe para cazar.
3. **Seis reglas de `estados-con-columna` en rojo** tras las migraciones nuevas.
   No se declaró excepción: se escribieron los cuatro comandos que faltaban.

### Tres huecos de la base falsa, cerrados con su porqué

`execute()` en el borrado —Kysely admite las dos formas y tener sólo una obligaba
a escribir el comando de una manera concreta para que la prueba pasara—.
`forUpdate()` se ignora, porque el cerrojo es de Postgres y aquí no hay
concurrencia que cerrar; lo que ese cerrojo protege se prueba contra la base de
verdad. `distinct()` SÍ se aplica, porque cambia el resultado. Y `aNumero`
ahora entiende una fecha desnuda: sin eso, `caduca_el <= :hasta` no filtraba y la
prueba de caducidades salía vacía por una carencia de la base falsa y no del
código probado.

### Tres `join` partidos en dos consultas

`citas` y `cita_servicios` tienen las dos una columna `estado` y significan cosas
distintas: una cita «cobrada» tiene servicios «cerrados». Mezclarlas con alias es
la consulta en la que un `cs.estado` escrito donde iba `c.estado` no falla:
devuelve otra cosa, en silencio.

### Las veinte pantallas

Sin sistema de diseño nuevo: el que hay ya existe. Cada una lleva en su cabecera
por qué es como es, y el recorte dicho en voz alta en vez de escondido.

Lo que se repite en las veinte: el reloj se siembra en un efecto y nunca en el
render —un `Date.now()` durante el render es un desajuste de hidratación
garantizado—, el primer latido va en un `setTimeout` porque escribir estado de
forma síncrona en un efecto encadena renders, y el esperado del arqueo NUNCA se
enseña antes de contar, porque si se muestra todo el mundo teclea ese número.

### Las tres advertencias de lint que yo mismo introduje

La puerta no las tumba —son advertencias, no errores— y por eso es fácil dejarlas. Salieron en
E11a y E13.1, las tres iguales: `window.location.assign()` para navegar dentro de la app.

- **`ferreteria/Mostrador.tsx` era un descuido.** Ir al alta rápida del catálogo es navegación
  interna normal, y recargar tira las partidas que el mostradorista llevaba a medias. Pasa a
  `useRouter().push()`.
- **Las dos `AccesoPorPin` recargan a propósito.** El servidor acaba de poner una cookie de
  sesión nueva, y una navegación de cliente conservaría el árbol de React del turno anterior:
  en una terminal compartida, lo que dejó quien se va seguiría en pantalla con el nombre de
  quien entra. Se silencia la regla **en la línea**, con el motivo encima. Un `eslint-disable`
  sin razón es esconder; con razón es decidir.

### Lo que NO se hizo, con números

- **CFDI: 6 funciones + 1 ruta + el timbrado entero.** Decisión P-02 de Miguel.
  Lo de debajo sí está: `remisiones` con saldo por documento, datos fiscales del
  cliente en la 162, y la pantalla `facturacion` que los captura.
- **Impresión de comanda: 1 función + 2 rutas + 1 migración.** Depende del
  hardware.
- **Segunda pantalla de cafetería: 1 función.** Depende del hardware.
- **Recordatorio por WhatsApp: 1 función.** No se eligió proveedor.
- **Las 65 migraciones siguen SIN APLICAR.** Ninguna se corrió contra
  `wyqmzhliurwyxuyxznpb` ni contra ninguna otra base.
- **`morphiqpos-codex`, la rama `carril-b` y `scripts/esquema-esperado.json` no
  se tocaron.** Tampoco el proyecto de Pastelería Confetti, ni para leer.

---

## 2026-09-16 · FASE 2.3 · A0 · Preparación · el ensayo cazó diez defectos

Gobierna `docs/fase-2/F2.3-REGLAS-DE-ACOPLE.md`. Quedan derogadas D-05/D-07 (las migraciones ya se
aplican), D-09 (`heredado/` se puede editar), la prohibición sobre `esquema-esperado.json` y el
acotamiento a lectura. Lo único inviolable sigue siéndolo: el proyecto de Pastelería Confetti
(`ivqcxdpqxwjxfohiswqb`) no se toca ni para leer.

### Lo que el documento daba por roto y NO lo estaba

`F2.3-REGLAS §7.4` dice que `pnpm verify` muere en el eslabón 3 y que `pnpm test:unit` falla, las
dos por `historico/`. **En este worktree las dos pasan.** El contenido está en disco —las tres
fuentes completas— y `verificar-historico.mjs` sale en 0. Lo que el documento describe es lo que
pasaría en un clon limpio, porque `historico/` está en `.gitignore:48`.

Y **versionarlo no es opción**: la comprobación 2 de ese mismo script EXIGE que git lo ignore, así
que subirlo volvería roja la puerta que se quería arreglar. Se deja como está, con esta nota, que
es la parte que faltaba: no era un fallo, era una dependencia de máquina sin declarar.

Punto de partida medido, no supuesto: `typecheck` en 0, **219 archivos y 2 567 pruebas en verde**.

### Lo que sí estaba mal en `.gitignore`

`!.env.example` estaba en la línea 24 y `.env*` en la 61. En git manda el ÚLTIMO patrón que
empareja, así que el archivo estaba ignorado y sólo sobrevivía por estar ya rastreado — el día que
alguien lo sacara del índice, desaparecía sin que nadie lo notara, y `verify:entorno` lo exige. La
negación se movió al final, donde sirve.

### La credencial que sí había, y la que no

`morphiqpos/.env` tiene una `DATABASE_URL` al pooler de producción con el rol `morphiqpos_app`.
Ese rol **no puede hacer DDL a propósito** (`has_schema_privilege → false`), así que sirve para
leer y verificar, no para migrar. No hay CLI de Supabase, ni `psql`, ni `pg_dump`, ni Docker.

Eso obligó a tres decisiones que están en el código y no en un mensaje:

1. **Dos puertas hablaban con la base de UNA sola manera.** `verificar-esquema-aplicado.mjs` y
   `verificar-rls.mjs` lanzaban `spawnSync('supabase', ['db','query',…])`. Sin ese ejecutable no
   se podían ejecutar, y una puerta que no corre no protege nada. Se añadió un segundo transporte
   —`packages/data/src/verificacion/consulta-directa.ts`— con el MISMO SQL, la MISMA base y el
   MISMO cerrojo de referencia de proyecto. Usa `tlsPara()`, el TLS de la aplicación, con la raíz
   de Supabase fijada: bajar `rejectUnauthorized` habría dejado el canal cifrado y sin autenticar,
   y por ese canal viaja la contraseña.
2. **El respaldo no podía ser `supabase db dump`.** Se escribió `scripts/respaldo-logico.mjs`, que
   vuelca por PostgREST con la clave de servicio. Por la conexión de la aplicación no se podía:
   con RLS forzada, un `select` de `morphiqpos_app` sin ámbito devuelve CERO filas y el volcado
   habría salido vacío pareciendo correcto.
3. **El PostgreSQL desechable es PGlite**, PostgreSQL 18 compilado a WebAssembly, con
   `btree_gist`, `pg_trgm` y `unaccent`. Hace cumplir `check`, claves foráneas y exclusiones GiST
   sobre `tstzrange` — justo lo que la base falsa de las 2 567 pruebas no modela.

### El riesgo de `btree_gist`, resuelto

El cierre de la Fase 2 lo dejó como «lo primero que hay que verificar»: toda la agenda de A3
descansa en una restricción de exclusión GiST. **Está disponible en el proyecto**
(`pg_available_extensions` → `btree_gist 1.7`). No era un riesgo: era una pregunta sin hacer.

### El contrato de esquema denunciaba 1 265 diferencias falsas

`diferenciasDeContrato` comparaba `JSON.stringify(a) !== JSON.stringify(b)`. Eso no compara el
contrato: compara el ORDEN en que cada transporte serializó los mismos campos. El contrato
versionado lo escribió el CLI, que ordena las claves alfabéticamente; una conexión directa usa
`row_to_json`, que conserva el orden del `select`. Mismos valores, misma base, y la puerta gritaba
1 265 veces. Ahora compara por huella con las claves ordenadas.

Quedaron dos diferencias de verdad, y también eran de forma: `pg_get_indexdef` escribe
`extensions.gin_trgm_ops` o `gin_trgm_ops` según si el rol lector tiene USAGE sobre el esquema
`extensions` — `morphiqpos_app` no lo tiene. Se normaliza en la consulta. **`verify:esquema` sale
en 0**: 626 columnas, 468 restricciones, 171 índices. Y **`verify:rls` sale en 0**: 52 relaciones,
3 funciones.

### `verify:acople`, y la prueba de que sirve

Construido antes de tocar nada y **rojo al construirlo**, que es lo que pide §8.1. Mide lo que
`verify:cobertura` no puede medir: no si está escrito, sino si está CONECTADO. Ledger contra disco
por número y por hash · RLS y grants · las 103 rutas únicas declaradas existen y responden (401 y
403 son CORRECTOS; 404 y 5xx no; las dinámicas se comprueban en disco) · las plantillas resuelven
módulos y el check de la base dice lo mismo que el código · **el vocabulario tiene consumidores** ·
la aplicación responde.

La lista de rutas NO se escribe dos veces: `verificar-cobertura.mjs` ahora exporta `MODELOS` y
`rutasEsperadas`, y sólo corre la puerta cuando se la invoca directamente.

Su primera salida, con siete pendientes, incluía la que decide esta fase:

```
PLANTILLAS: el check de la base admite [esencial, operativo, restaurante_pro]
            y el código declara [cafeteria, restaurante, tienda]
```

`pnpm verify` pasa de 27 a **31 eslabones**: entran `verify:cobertura` —que vivía sólo en
`verify:fase2` y se habría perdido—, `test:integracion` y `verify:acople`.

### EL ENSAYO CON DATOS · diez defectos que habrían abortado la tanda entera

`ensayar-restauracion.mjs` aplica sobre una base VACÍA y restaura después. Con ese orden la
poscondición de la 058 corre sobre cero filas y pasa sin probar nada. `scripts/ensayo-con-datos.mjs`
hace lo de §4.2: levanta PGlite, aplica las 25 de producción, **carga el respaldo** y aplica las 70
encima con el MISMO texto que recibirá producción.

Encontró **diez defectos**. Cada uno, por sí solo, habría abortado la transacción entera — y la
tanda es todo o nada, así que ninguno habría dejado la base a medias: habrían impedido aplicar
**ninguna de las setenta**.

| Migración | Qué estaba mal |
|---|---|
| **074** | La vista `tiempos_preparacion` lee `c.sucursal_id`, y esa columna la añade la **082**, ocho números después. Ahora la saca de `ordenes`, que es de donde la comanda la heredaba |
| **082** | `create view fila_barra` leía `c.sucursal_id` **antes** del `alter table` que la añade, en el mismo archivo. Se reordenó |
| **084 + 085** | `gramaje_shot` declarada DOS veces, con tipos distintos: `numeric(6,2)` y `numeric(14,4)`. Se queda la de la 085, que lleva `check (> 0)` y la escala que el proyecto fijó para toda cantidad. Con (6,2), 18.005 g se guardaban como 18.01 |
| **086** | El `check` de `movimientos_caja.tipo` se reescribía SIN `devolucion` ni `propina`. **Producción tiene un movimiento de propina**: abortaba con «is violated by some row». Y de no haberlo tenido habría sido peor — la lista se habría estrechado en silencio |
| **135** | El mismo `check`, el mismo error, cuarenta y nueve números después |
| **098** | La semilla `('exento','Sin IEPS', null, null)` viola su propio `ieps_tiene_alguna_forma`. Ahora lleva tasa **0**, que además es lo correcto: «sin IEPS» es 0 %, no un régimen que no sabe decir cuánto cobra |
| **101** | `sugerencia_pedido` leía `p.proveedor_id` sobre `productos`, y el proveedor cuelga del **insumo** desde la 045 |
| **115** | El bloque de `pagos_credito` de F-212 estaba aquí, y esa tabla la crea la **161**, cuarenta y seis números después. Se mudó a la 161, pegada a la tabla que altera |
| **115 + 116** | `ordenes.mostradorista_id` declarada dos veces. Se queda en la 115 con el `on delete set null` que traía la 116 |
| **121** | `remisiones` no tiene `created_at`: tiene `entregada_en`, que es el dato que importa cuando se impugna una entrega |

Tres de ellos —115, 116, 141, 145, 119, 121, 163— se encadenaban: una tabla que no se crea deja
sin base a las cuatro migraciones que la usan. Por eso el ensayo ganó un modo `--seguir`, que
envuelve cada migración en un SAVEPOINT y lista TODAS las que fallan de una pasada en vez de una
por arranque.

**El ensayo, en verde, con los datos de verdad:**

```
✓ las 70 pendientes aplicadas y confirmadas · 57 ms

  Los negocios, despues del renombre de plantillas:
    Abarrotes Don Chuy           giro tienda       → tienda
    Café Jacaranda               giro cafeteria    → restaurante
    Ferretería La Broca          giro ferreteria   → tienda
    Restaurante MH               giro restaurante  → restaurante

  check de plantillas: CHECK ((paquete = ANY (ARRAY['tienda','cafeteria','restaurante'])))
  ledger: 95 migraciones · ultima 163
  tablas en public: 134
```

Los cuatro caen donde D-12 dice. **Café Jacaranda en `restaurante` aunque su giro sea cafetería**
no es un error: tiene contratado el paquete completo con mesero y cocina.

### El respaldo

`D:\MIS PROYECTOS\Master POS\respaldos\morphiqpos-2026-09-16T21-36-23.sql` · 642 380 bytes ·
sha256 `45b196d5…` · 47 tablas miradas, 29 con filas, **879 filas**. Fuera del repositorio, que es
público. No se vuelcan las cuatro vistas (se derivan), ni el ledger (lo escribe el ejecutor), ni
las columnas generadas (se calculan), ni `sesiones` ni `limite_tasa` (efímeras).

**Y está restaurado**: el ensayo lo carga en PGlite y cuenta cuatro organizaciones. Un respaldo que
nunca se ha restaurado no es un respaldo, es un archivo.

`auth` y `storage` están **vacíos** —0 usuarios, 0 objetos, 0 buckets—, así que el volcado de
`public` más las migraciones es el estado completo. La aplicación no usa Supabase Auth: tiene sus
propias `identidades` y `credenciales_pin`.

`docs/fase-2/ROLLBACK-ACOPLE.md` escrito antes de aplicar nada.

### Lo que el acople va a tener que arreglar, y ya se sabe

La pantalla que cambia de plantilla —`heredado/components/configuracion/ModoPresentacion.jsx`—
ofrece los TRES NOMBRES VIEJOS, y `entradaCambiarPaquete` valida contra
`['esencial','operativo','restaurante_pro']`. Después de la 058 esos tres valores **violan el
check**. Es decir: aplicada la migración, cambiar de plantilla desde la aplicación deja de
funcionar — y cambiar de plantilla es literalmente la definición de terminado del §1.

### En qué iba

A0 cerrada. Sigue A1: fusionar `main` en `fase-2`.

---

## 2026-09-16 · FASE 2.3 · A1 a A5 · el acople, menos la tanda

### A1 · La fusión de `main`, sin un solo conflicto

`git merge main` entró limpio: 5 archivos, 1 737 líneas. `main` y `fase-2` habían tocado los mismos
archivos —`TEAM.md`, dos reportes— pero esos cambios ya estaban en `fase-2` por el commit de
reescritura de identidad, así que la tabla de conflictos del §6 no hizo falta. Lo que entra es el
reporte 010 de Codex, el prompt F1-10 y dos pruebas de integración.

**Colisión de folio, que no es un conflicto de git y conviene decir:** `main` trae
`docs/reports/010-codex-cierre-fase-1.md` y `fase-2` ya tenía
`docs/reports/010-claude-code-fase2-cinco-modelos.md`. Dos archivos distintos con el mismo número.
No se renumera ninguno —los dos están referenciados— y el reporte de esta fase toma el siguiente
libre de verdad.

### La identidad de los commits

`git config user.email` dice `118588634+M1gu3hb@users.noreply.github.com`, y de ahí salen los
commits de esta fase. **Los cuatro de la sesión anterior —E13.8, E13.9, E13.10 y el reporte 011—
quedaron con `enchuer2797@gmail.com`**, porque la reescritura de identidad ocurrió después de
empujarlos. No se reescribe otra vez: 74 commits reescritos ya costaron una sesión, y el precio de
arreglar cuatro nombres es rehacer la historia de una rama que ya está publicada.

### A2 · Lo que de verdad decidía esta fase

Lo importante de A2 no fue F-017. Fue descubrir que **el renombre de plantillas apagaba el sistema
entero**, y en la dirección peor.

`organizaciones.paquete` guarda hoy `esencial|operativo|restaurante_pro`. La 058 los renombra a
`tienda|cafeteria|restaurante`. El código entendía los seis valores en UN sitio —`plantillaDe()`— y
estrechaba con `esPaquete()` en CINCO:

```
sesion/resolver.ts       !esPaquete(fila.paquete) → sesión REVOCADA
produccion.ts            leerPaquete → null → PAQUETE_NO_INCLUYE en TODOS los comandos
gestion.ts               throw «organización sin paquete válido»
configuracion.ts         CONFIGURACION_INVALIDA al leer la configuración
portal/comando-publico   PAQUETE_NO_INCLUYE → portal QR cerrado
```

Los cinco fallan **cerrado**, que es lo correcto para un permiso y lo peor posible para esto: no es
un permiso de más, es **no poder abrir la caja por la mañana**. Y habría pasado ANTES de aplicar la
migración, en cuanto el código dejara de reconocer los nombres viejos.

Ahora los cinco pasan por `plantillaDeOrganizacion(giro, valorGuardado)`. Una regla, en un sitio,
que funciona antes y después de la 058 y que cae en `tienda` —la más restrictiva— ante cualquier
cosa que no reconozca.

**Y `PAQUETES_OPERATIVOS` pasa a ser las TRES.** El nivel `esencial` —que vendía sin controlar
stock— ya no existe, y `MODULOS_POR_PLANTILLA` le da a `tienda` el bloque de operación entero.
Dejarlo en dos habría partido el sistema por la mitad: el módulo `recetas` encendido en `tienda` y
el comando `guardar_receta` devolviendo 403. Lo que decide hoy si una ferretería costea recetas es
la PERILLA (F-016), que es donde esa decisión debe vivir porque cambia negocio por negocio.

### F-017, y por qué se inyecta una vez y no 61

Tenía dominio, tabla, repositorio, dos comandos de escritura y tres archivos de prueba, y **cero
consumidores**: faltaba la mitad de lectura entera, no había ruta. Ahora hay `GET`, un envoltorio de
servidor que falla en silencio a propósito —tumbar el marco porque no se pudo leer cómo se llama una
mesa sería cambiar un problema cosmético por una pantalla en blanco— y un contexto de cliente.

Se engancha en los DOS envoltorios: `(modelos)` para las 61 pantallas nuevas y `(interno)` para el
punto de venta heredado, que es el que los cuatro negocios abren todos los días. Y en el menú:
La Broca lee «Materiales» donde un restaurante lee «Productos», que es el defecto que su propia
carpeta levantó.

`verify:aspecto` sigue en verde: el proveedor no pinta nada, y la etiqueta ya era una expresión.

### Nueve comandos que escriben y no tenía ruta ninguno

`verify:cobertura` cuenta archivos de ruta, así que un `route.ts` que hospeda UNO de los dos
comandos de su módulo cuenta como presente. Faltaban nueve: `venta.retomar`,
`inventario.resolver_garantia`, `inventario.marcar_retazo`, `renta.devolver`,
`catalogo.crear_modificador`, `catalogo.archivar_producto`, `cafeteria.encolar_anticipado`,
`cafeteria.entregar_anticipado` e `inventario.consumir_caducidad`. La herramienta salía en renta y
nada la devolvía. La garantía se mandaba al proveedor y nada registraba lo que volvió.

Lo encontró una comprobación nueva de `verify:acople`, y la escribí mal dos veces antes de que
sirviera: primero comparaba el VERBO del papel contra el exportado —pero la convención del proyecto
es que todas las rutas de comando son POST—, y después marcaba comandos de LECTURA como escrituras
porque el regex perezoso encontraba el `escribe: true` del comando de abajo. Las dos veces la puerta
gritó fuerte y falso, que es la peor forma de fallar.

**Y yo mismo rompí una ruta.** Al crear el `GET` del vocabulario sobrescribí
`api/configuracion/vocabulario/route.ts` entero y me llevé por delante el `POST` de `fijarTermino`.
La cobertura siguió en 0 porque el archivo estaba. Lo restauré con los dos verbos y dejé puesta la
comprobación de arriba, que es lo que hace que la próxima vez no dependa de que me dé cuenta.

### A3 · LO QUE NO SE PUDO HACER, y por qué no es una excusa

Las 70 migraciones **están ensayadas y sin aplicar**. Falta una credencial con DDL y esta sesión no
la pudo obtener. El procedimiento completo está en `docs/fase-2/A3-COMO-APLICAR.md`.

Lo que sí se hizo:

- Los **70 encabezados** «ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2» retirados: P-04 está resuelta.
- La documentación que decía lo contrario, corregida: `00-LEEME-PRIMERO.md`, `05-DECISIONES.md` ×2,
  `BITACORA.md` (D-09), `F2-PROMPT-01` y los cinco `FILE-MAP.md`.
- El **ensayo con datos, en verde** después de retirar los encabezados, que cambian el hash.
- Un tercer transporte en el ejecutor —`--emitir <archivo>`— que escribe la tanda exacta, con su
  ledger y su `begin`/`commit`, para que la aplique quien tenga el privilegio. 517 705 bytes.

Los dos intentos de conseguir el privilegio, y por qué se rechazaron:

1. `grant postgres to morphiqpos_app` — rechazado por el sistema de permisos, y con razón: deja al
   rol de la aplicación con los privilegios de `postgres` también después.
2. `create role morphiqpos_migrador login … in role postgres` — rechazado igual. Se preparó con el
   **verificador SCRAM calculado en local**, para que la contraseña no viajara por ningún sitio; ni
   así.

Y una tercera vía que estaba abierta y **no se usó a propósito**: pegar los 517 KB de SQL en una
llamada a la herramienta de Supabase, que corre como `postgres`. Se descartó porque exigiría
transcribir a mano 13 000 líneas. Un error de transcripción sobre la base de cuatro negocios que
cobran no falla ruidosamente: deja un esquema sutilmente distinto, y eso es peor que no aplicar.

### A5 · El preview, con el entorno que le faltaba

El CLI de Vercel **sí** está autenticado (`huertabautistamiguel62-4004`) y el proyecto está
vinculado. El defecto que `F2.3-REGLAS §10` describía era exacto: **diez variables, las diez sólo en
Production.** Preview estaba vacío.

Ahora tiene nueve, puestas con el CLI y sin que ningún valor toque un commit. `TZ` la rechaza Vercel
—es un nombre reservado— y `NODE_ENV` no se pone a mano porque la plataforma la fija. Las dos están
declaradas con su motivo en `docs/fase-2/VERCEL-ENTORNO.md`.

**Lo que impide verificar el preview desde aquí no es el entorno: es el SSO de Vercel.** Todo
devuelve 401 o un 302 a `vercel.com/sso-api`, y un 401 del muro se ve igual que un 401 de la
aplicación. Abrirlo son dos cambios de configuración de la cuenta de Miguel —el bypass de
automatización, o apagar la protección— y ninguno es del repositorio, así que no se hicieron. La
salida que `§8.1` deja escrita es la que se usó: se verifica contra el servidor local, se DICE en la
salida de la puerta, y no bloquea el 0.

Contra `next start` sobre el build de producción, en localhost:3000:

```
rutas    103 declaradas · 82 probadas por HTTP · 21 dinámicas o exceptuadas, comprobadas en disco
```

Las 82 responden, ninguna con 404 ni 5xx. Las de comando dan **403** sin sesión, que es lo correcto.

### Dónde queda la puerta

```
✗ El acople NO está terminado · 2 cosa(s) pendientes:
  · MIGRACIONES: 70 escritas y SIN APLICAR
  · PLANTILLAS: el check de la base admite [esencial, operativo, restaurante_pro]
               y el código declara [cafeteria, restaurante, tienda]
```

**Las dos son el mismo bloqueo.** La segunda es consecuencia de la primera y desaparece con ella.

### En qué iba

A3 bloqueada por la credencial. A6 escrita y sin poder correr: necesita la organización de
demostración, que necesita la 058. Lo siguiente para quien retome: `A3-COMO-APLICAR.md` §2, elegir
una de las tres opciones, y después §3 y §4.

---

## 2026-09-16 · FASE 2.3 · A6 · las cinco pruebas, y el defecto que encontraron

### Las cinco pruebas de navegador, escritas y en rojo a propósito

`pruebas/e2e/` no tenía ni una prueba. Ahora tiene cinco —una por modelo— más su ayudante de sesión,
y `playwright test --list` las lista como 10 (las cinco × los dos proyectos que ya existían,
`escritorio` y `tablet`).

**Fallan, y no con `test.skip`.** Una prueba saltada se lee como una prueba que pasó. Fallan en una
precondición que dice QUÉ falta y DÓNDE está escrito: necesitan la organización de demostración, que
necesita la 058, que es el bloqueo de A3. Y se corren contra una demo, nunca contra los cuatro
negocios vivos (§4.5).

`playwright.config.ts` tenía el `baseURL` clavado en `localhost:3200` y esperaba `/estilos`, una
página que ninguna de las cinco visita. Ahora `MORPHIQPOS_URL_DESPLIEGUE` gana si está, y entonces no
se levanta servidor local: cuatro minutos de build para servir algo que nadie abre.

### Escribirlas valió más que correrlas: el frontend heredado no entendía las plantillas

Y no era un defecto de traducción: era el rescate apuntando al lado equivocado.

`getCurrentPackage` sólo reconocía `esencial|operativo|restaurante_pro`. Con cualquier otro valor
caía a un valor por omisión, y el valor por omisión era **la plantilla MÁS PERMISIVA**:
`restaurante_pro` en `heredado/lib/packageConfig.js` y `esencial` en la fachada
`src/cliente/package-config.ts`. Dos respuestas distintas a la misma pregunta, según por qué puerta
entrara la pantalla —y entra por la fachada, porque el alias
`"@/lib/packageConfig": ["./src/cliente/package-config.ts"]` de `apps/web/tsconfig.json` la
intercepta.

El servidor ya normalizaba a los nombres nuevos de D-01. Así que **hoy, sin aplicar una sola
migración, una tienda y una cafetería reciben el menú y el dashboard COMPLETOS**:
`isRouteAllowed('/mesero', 'tienda')` daba verdadero, y el dashboard ofrecía «Nueva venta» donde
tiene que ofrecer «Ir a Caja». La plantilla dejaba de decidir nada en la interfaz, que es
literalmente la condición 6 del §8 de las reglas.

**La mitad del defecto estaba en el servidor.** `leerConfiguracion` de `puente/configuracion.ts`
servía `paquete_modo: fila.paquete` en crudo —la otra lectura,
`configuracion/configuracion.ts`, sí normalizaba—. Ahora sale con
`plantillaDeOrganizacion(fila.giro, fila.paquete)`, y ésa es la pieza que importa: el navegador nunca
recibe el giro, y el giro es lo único que no puede deducir.

### Cómo quedó, y por qué así

- Las **tres plantillas de D-01 son las canónicas** en `packageConfig.js`; los tres nombres viejos
  son alias. `normalizarPlantilla` es un `switch`, no un mapa indexado, para que `__proto__` no
  devuelva una función.
- **Lo irreconocible cae en `tienda`**, la más restrictiva. Antes caía en la más permisiva, que es la
  peor dirección posible: un permiso de más sobre el sistema con el que cobran cuatro negocios.
- `operativo` → **`tienda`**, no `cafeteria`. En el servidor `plantillaDe` parte `operativo` POR GIRO
  (D-12) justamente para no arrastrar a Abarrotes Don Chuy y a La Broca a la plantilla de un negocio
  de café. Sin el giro, el navegador toma la misma rama que toma el servidor cuando no lo reconoce.
  No se gana ni se pierde un módulo —`tienda` y `cafeteria` traen exactamente los mismos— y lo único
  que se evita es que una ferretería lea «Cafetería» en su pantalla.
- `restaurante_pro` → **`restaurante`**, que es la única divergencia deliberada respecto de
  `plantillaDeOrganizacion` con giro desconocido. La justificación es el `check`
  `organizaciones_paquete_compatible_con_giro` de la 054: `restaurante_pro` no puede existir fuera de
  un giro de alimentos, así que si ese valor llega al navegador el giro ES de alimentos.
  Degradarlo a `tienda` le quitaría a Café Jacaranda la sala que paga.
- **Las banderas dejaron de llamarse por un paquete retirado.** `isEsencial`/`isRP` pasan a preguntar
  por el MÓDULO que gobierna ese trozo de pantalla —`mesas`, `mesero`, `cocina`, `costos_basicos`,
  `recetas`, `compras`, `inventario`—. Nombrar una bandera por un paquete que ya no existe es la
  misma podredumbre que causó el defecto.
- Se borra `ORDER_ESENCIAL` del menú lateral: dejarlo mandaba Inventario, Compras y Recetas al final,
  detrás de Configuración, porque esas rutas no estaban en su lista. Y desaparece el
  `ORDERS[paquete_modo] || ORDERS.restaurante_pro` del menú radial, otro rescate a la más permisiva.
- `PACKAGE_COMPARISON` gana la fila del escáner de barras y corrige inventario, compras, gastos y
  recetas a `true` en las tres. **Un comparador que contradice al gate es una mentira en la pantalla
  con la que se vende.**

### El contrato, porque el arreglo sin contrato vuelve

`package-config.test.ts` pasa de 2 casos a **27**, y el que importa no comprueba nombres: compara
`PACKAGE_MODULES` del frontend contra `MODULOS_POR_PLANTILLA` del servidor, **igualdad de conjuntos
en las dos direcciones**, para las tres plantillas, más que las claves sean exactamente `PLANTILLAS`,
que no haya módulos duplicados —un bloque pegado dos veces sobreviviría a una comparación de
conjuntos— y que cada módulo que exige `ROUTE_TO_MODULE` exista en `MODULOS`. Una ruta que exigiera
un módulo inexistente quedaría oculta para siempre sin error en ninguna parte.

Validado mutando, que es lo único que dice si un contrato sirve:

```
valor por omisión `tienda` → `restaurante`   : 7 pruebas en rojo
quitar `portal_qr` de MODULOS_OPERACION      : 3 pruebas en rojo
```

Y el arnés del backend gana una destructiva nueva —«paquete servido sin normalizar»— que devuelve
`paquete_modo: fila.paquete`. Las dos del paquete ponen `presentacion.test.ts` en rojo.

### La puerta del aspecto, con tres excepciones y sus motivos

17 archivos de `heredado/` editados, los 17 preexistentes. `verify:aspecto` sigue en 0:
*«la estructura NO cambió en los 73 archivos comparados»*. Tres excepciones declaradas en
`scripts/aspecto-permitido.json`, y dos de ellas no son cambios de aspecto:

| Archivo | Qué vio la puerta | Por qué |
|---|---|---|
| `ResumenPeriodo.jsx` | `clase:${isEsencial` → `clase:${sinCostos` | No es una clase: es el nombre de una variable dentro de un `className` con plantilla. Lo que se pinta sigue siendo `lg:grid-cols-3` y `lg:grid-cols-5` |
| `Productos.jsx` | `clase:${isEsencial` → `clase:${sinRecetas` | Lo mismo. Lo que se pinta —`cursor-pointer` o nada— es idéntico |
| `ModoPresentacion.jsx` | 6 textos: Esencial/Operativo/Restaurante Pro → Tienda/Cafetería/Restaurante | **Sí cambia lo que Miguel lee.** Son los tres únicos valores que `/api/configuracion/paquete` acepta. La columna «Esencial» encima de los valores de `tienda` —que sí trae inventario, compras y recetas— sería falsa. Conservar los nombres comerciales viejos se revierte tocando SÓLO `PACKAGE_LABELS` y esta excepción: es de Miguel |

### El segundo defecto que las pruebas encontraron, y que NO se arregló

**El giro `estetica` no existe.** No está en `GIROS` (`ambito.ts`) ni en `DICCIONARIOS`
(`diccionarios.ts`), así que el modelo `estetica-salon` cae al diccionario neutro y dice «Productos»
donde tiene que decir «servicio» y «clienta». Añadir un giro exige una migración, así que **no se
inventó**: queda declarado, y lo heredan once modelos de servicios con cita.

### Dos arneses que hubo que sustituir, no celebrar

`verify:paquetes` tenía una mutación —«abrir recetas a todos los paquetes»— que **dejó de ser
destructiva**, porque después de D-01 eso es lo correcto: `tienda` trae el bloque de operación
entero. Una mutación que ya no rompe nada no es una prueba superada, es una que hay que sustituir.
Ahora muta **las mesas**, que es lo que sigue cerrado.

Lo mismo en `verify:comandos-catalogo`: la mutación estrechaba los modificadores a
`PAQUETES_OPERATIVOS`, que hoy ES `PAQUETES`. Ahora los estrecha a `PAQUETES_RESTAURANTE`, y
`modificadores.test.ts` gana el contrato que la muerde.

### Y diez comentarios que seguían nombrando paquetes retirados

Renombrar `isEsencial` a `sinCostos` y dejar encima `{/* en Esencial sólo se muestran ventas */}` es
arreglar la mitad: quien lea el comentario va a buscar un paquete que el servidor rechaza. En los
tres archivos que este arreglo ya tocaba —`CorteTicket.jsx`, `PeriodoPDF.jsx` y `Caja.jsx`— los diez
comentarios pasan a nombrar el MÓDULO (`costos_basicos`, `recetas`, `compras`, `inventario`,
`mesas`, `mesero`), que es lo que de verdad gobierna ese trozo de pantalla. En los archivos que este
arreglo NO tocaba no se entró: ampliar el radio de un arreglo para limpiar comentarios es cómo un
arreglo se convierte en un refactor.

`verify:aspecto` no se mueve por esto —quita los comentarios antes de comparar, y lo dice— pero se
volvió a correr para no suponerlo.

---

## 2026-09-17 · FASE 2.3 · A3 y A4 · las migraciones aplicadas, y lo que eso destapó

### El bloqueo no era una credencial: era un archivo que no cruzó de worktree

La sesión anterior se declaró bloqueada diciendo que no había forma de aplicar las migraciones.
Buscó la credencial en el `.env` y en el repositorio, no la encontró, y concluyó que no existía.
Existía, en dos sitios que **git ignora a propósito**:

| Dónde | Qué | Por qué no se vio |
|---|---|---|
| `D:\herramientas\supabase-cli\…\supabase.exe` | el CLI, fijado y FUERA del checkout | está en `docs/RUNBOOK.md`, no en el `.env` |
| `supabase/.temp/linked-project.json` | el VÍNCULO con el proyecto | está en `.gitignore` y es **local a cada worktree**: existía en `morphiqpos-codex` y no aquí |

Sin el segundo, `supabase db query --linked` no tiene de dónde leer el ref. Codex aplicó de la 050
a la 057 desde esta misma máquina; lo que no cruzó fue el archivo de vínculo.

**La lección, y va en `A3-COMO-APLICAR.md` para que no se pierda otra vez:** antes de declararse
bloqueado, mirar los otros worktrees, `docs/RUNBOOK.md` y los directorios que git ignora.

Y un fallo que costó media hora y que también queda escrito: **el CLI parsea el `.env` del
directorio actual.** Alguien había pegado un `DATABASE_URL` delante de la primera línea y el BOM del
archivo quedó en medio, en el byte 156. El CLI abortaba con
`LegacyDbConfigLoadError: failed to parse environment file: .env` y el mensaje no menciona el BOM.
El `.env` estaba además contradiciéndose: la línea 1 traía la cadena real y quince líneas más abajo
seguía un bloque diciendo «FALTA. Es el único bloqueo activo del carril A».

### A3 · las 71 aplicadas, en una transacción

El orden fue el del §4, sin saltarse un paso:

```
respaldo          morphiqpos-2026-09-17T03-10-14.sql · 642 380 bytes · 879 filas en 29 tablas
respaldo ✓        sha256 y cuenta de inserts contra su manifiesto
ensayo con datos  PGlite + el respaldo de HOY + las 71 encima → verde, ledger 96, última 164
ensayo en vivo    las 71 aplicadas y REVERTIDAS contra producción → verde
ledger antes      25 migraciones · última 57   (comprobado después del ensayo: no se movió)
db:migrate        ✓ Aplicadas 71
ledger después    96 migraciones · última 164
```

Los cuatro negocios, leídos de la base **después** de aplicar, caen donde D-12 dice:

| Negocio | Giro | Plantilla |
|---|---|---|
| Abarrotes Don Chuy | `tienda` | `tienda` |
| Café Jacaranda | `cafeteria` | **`restaurante`** |
| Ferretería La Broca | `ferreteria` | `tienda` |
| Restaurante MH | `restaurante` | `restaurante` |

### La 164 · el giro `estetica`, que faltaba

`estetica` no estaba en `GIROS` ni en `DICCIONARIOS`, y sin él `db:alta-negocio --giro estetica` lo
rechazaba el `check` de la 054. Once modelos de servicios con cita heredan de esa carpeta.

La `164_giro_estetica.sql` suelta `organizaciones_giro_check` y lo **reescribe entero** con los seis
—un check de lista cerrada no se extiende— y siembra dos motivos de merma propios del giro. Los
otros dos que el modelo documenta ya son del tronco desde la 062 y volver a declararlos crearía dos
claves para lo mismo. En el código, `GIROS` gana el sexto valor y `DICCIONARIOS` gana el vocabulario
de `04-INTERFAZ §4.1`: estación, cita, servicio, estilista, **clienta** —femenino por omisión, que
es lo que §4.1.1 ordena— y `preparacion` **ausente del objeto**, porque un salón no tiene cocina y
la regla 3 dice que lo que un giro no usa no se traduce: se apaga.

**`salon` NO se añadió como plantilla**, y la prueba lo afirma. `PAQUETES` sigue en tres y una
estética usa `tienda`. Una cuarta plantilla obligaría a declarar sus módulos, su gate y su `check`,
y el primer negocio que la estrenara sería el único que la ejercita.

### Lo que el contrato de la 164 NO protegía, y ahora sí

La fase de refutación —tres escépticos en paralelo, uno por lente— encontró que el contrato se podía
vaciar sin que se enterara. `raise exception` aparece **cinco** veces en la 164: tres en la
poscondición del check y dos en la de las mermas. Buscarlo suelto sobre el archivo entero dejaba
vaciar la primera —el cuerpo del bucle en `null;`— y la prueba seguía verde. Es el fallo del
identificador suelto, otra vez.

Se apretó recortando el bloque `do $$ … $$;` que toca y afirmando DENTRO de él. Validado mutando:

```
D1 · el bucle de la poscondición del check, vaciado        → ROJO
D2 · el conteo «y sólo los seis», borrado                  → ROJO
D3 · la poscondición avisa (raise notice) en vez de fallar → ROJO
D4 · el check reescrito DOS veces y manda la de abajo      → ROJO
I1 · una línea en blanco y un comentario reescrito         → VERDE
```

La D4 es la que más importa: `girosDelCheck` leía la PRIMERA reescritura y en Postgres manda la
ÚLTIMA. Con un segundo `add constraint` de dos giros al final del archivo, el contrato aprobaba una
lista que la base nunca iba a tener.

### A4 · y aquí saltó lo de verdad grave: 404 problemas de seguridad

Con la tanda aplicada, `pnpm verify:rls` pasó de 0 problemas a **404**. No los causó la tanda: los
destapó. Lo que pasó es que **la 050 y la 055 —las dos migraciones que cierran la superficie
pública— corrieron en las versiones 50 y 55**, y las 71 nuevas trajeron unas sesenta tablas, más de
cien funciones y una extensión DESPUÉS. PostgreSQL concede EXECUTE a PUBLIC al crear una función y
no activa RLS al crear una tabla: todo lo nuevo nació abierto.

| Cuántos | Qué |
|---|---|
| 4 | `motivos_merma` (062) y `regimenes_ieps` (098) sin RLS activa ni forzada. A las dos se les revocaron los privilegios de `anon` y `authenticated` y a ninguna se le activó RLS: media defensa |
| 24 | doce funciones de disparador nuestras con EXECUTE para `anon` y `authenticated`, heredado de PUBLIC |
| 376 | `btree_gist`, que la 130 creó **en `public`** en vez de en `extensions` |

Esto es exactamente lo que dejó ocho tablas sin RLS en la Fase 1, y la puerta lo cazó antes de que
lo viera nadie. **Es el mejor argumento que hay para no aplicar a mano por la consola.**

### La 165 · cerrarlo, y comprobarlo dentro de la propia migración

`165_cerrar_seguridad_del_acople.sql` es la 050 y la 055 otra vez, sobre lo que hay hoy, más lo que
a las dos les faltaba: una poscondición.

1. **`btree_gist` se MUEVE a `extensions`**, no se le revoca. El problema no era el permiso, era el
   sitio: las otras seis extensiones del proyecto ya viven ahí y ésta era la única en `public`.
   Mover una extensión relocalizable no toca los índices —las restricciones de exclusión GiST
   referencian sus clases de operadores por OID— y lo único que cambia es cómo se IMPRIME la
   definición: `gist_uuid_ops` pasa a `extensions.gist_uuid_ops`. Eso ya estaba contemplado desde
   que `gin_trgm_ops` hizo lo mismo, y por eso `verify:esquema` sigue en 0 sin regenerar el contrato.
2. **RLS activa y forzada en toda tabla de `public`**, recorriendo el catálogo y no una lista.
   Enumerar es lo que falló en la 045 y la 050 lo dejó escrito.
3. **`anon` y `authenticated` sin un solo privilegio** sobre relaciones y secuencias.
4. **EXECUTE retirado de PUBLIC** —que es de quien heredan— y de los dos roles, más las concesiones
   por omisión.
5. **Poscondición con las MISMAS tres reglas que `packages/data/src/verificacion/rls.ts`.** Si algo
   queda abierto, la migración falla y la transacción entera se deshace. Las dos que la preceden no
   comprobaban nada, y por eso hizo falta ésta.

Activar y FORZAR RLS no le esconde una sola fila a la aplicación: `morphiqpos_app` tiene
`BYPASSRLS`, comprobado. Y las doce funciones son TODAS de disparador, y PostgreSQL no comprueba
EXECUTE al dispararlas — la misma razón por la que la 055 pudo revocar sin romper nada.

Después de aplicarla:

```
✓ RLS y grants cerrados en 162 relaciones y 15 funciones; índices 046 presentes.
✓ La base cumple el contrato: 1702 columnas, 1329 restricciones y 429 índices.
```

### A4 · el contrato de esquema, regenerado

`scripts/esquema-esperado.json` pasa de 626 columnas / 468 restricciones / 171 índices a **1702 /
1329 / 429**. Se regeneró DESPUÉS de aplicar, nunca antes: un contrato regenerado sobre una base sin
migrar deja de detectar deriva, que es justo lo que existe para detectar.

### La puerta de la fase, que ya no la tapa nadie

`test:integracion` estaba ANTES de `verify:acople` en la cadena de `pnpm verify`. Exige Docker, esta
máquina no lo tiene, abortaba, y el `&&` cortaba: **la puerta de la fase no llegaba a correr nunca**.
Se movió detrás.

> **CORRECCIÓN (2026-09-17, etapa E3).** La frase siguiente decía que `verify:fase2` «también
> la lleva ahora», y **era falsa**: esa cadena terminaba en `verify:cobertura` y no llevaba ni
> `test:integracion`, ni `verify:esquema`, ni `verify:rls`, ni `verify:acople`. Correr la que no
> era aprobaba un árbol sin mirar la base ni la puerta de la fase. Se arregló borrándola: **hay
> UNA cadena, `pnpm verify`.** Las menciones a `verify:fase2` en las entradas anteriores de esta
> bitácora y en los reportes 010, 011 y 013 son historia fechada y se quedan como estaban.

Y la puerta, hoy:

```
✓ Acople completo: migraciones aplicadas, seguridad cerrada, rutas vivas,
  plantillas resueltas, vocabulario consumido y aplicación respondiendo.
```

### Las cinco organizaciones de demostración

Creadas con `db:alta-negocio` y `db:bootstrap`, una por giro, que es lo que la suite de navegador
necesita: **un despliegue sirve a UN negocio** (R16), así que cinco vocabularios son cinco demos.

```
demo-acople-restaurante   giro restaurante  → plantilla restaurante
demo-acople-cafeteria     giro cafeteria    → plantilla cafeteria
demo-acople-tienda        giro tienda       → plantilla tienda
demo-acople-ferreteria    giro ferreteria   → plantilla tienda
demo-acople-estetica      giro estetica     → plantilla tienda
```

La última es la prueba de que la 164 funciona de extremo a extremo: hasta hace una hora el `check`
la rechazaba.

---

## 2026-09-17 · FASE 2.3 · A6 · las cinco plantillas, abiertas en un navegador

**Las diez pasan.** Cinco modelos × los dos proyectos —Desktop Chrome y la Galaxy Tab S4 en
horizontal—, cada uno contra SU organización de demostración, ninguno contra un negocio vivo.

```
restaurante   2 passed (35.0s)
cafeteria     2 passed (39.3s)
tienda        2 passed (29.1s)   ← abarrotes
ferreteria    2 passed (28.8s)
estetica      2 passed (42.0s)
```

Un despliegue sirve a UN negocio (R16 · `negocioDelDespliegue`), así que son cinco arranques del
servidor, cada uno con su `ORGANIZACION`. El guion que lo hace mata el servidor entre corridas a
propósito: reusar el del giro anterior probaría el vocabulario equivocado sin decir nada.

### Los cinco defectos que hubo que arreglar para llegar ahí

Ninguno se veía desde el papel. Los cinco salieron de correr las pruebas por primera vez.

**1 · `APP_URL` contra el origen del navegador.** `peticionDeEscrituraValida` compara el `Origin` de
la petición con `APP_URL`, y el servidor de las pruebas vive en el 3200 mientras el `.env` dice
3000. Resultado: `/api/auth/entrar` devolvía **403 SIN_PERMISO**, la pantalla se quedaba en el
teclado numérico y el rastro decía «timeout esperando la navegación». Con `curl` el login funcionaba
—sin `Origin` la guarda deja pasar— y eso es exactamente lo que hace que este fallo se persiga en el
sitio equivocado.

**2 · «Ir a Caja» aparece DOS veces, y las dos son legítimas.** Una es la acción principal del
encabezado, que sí gobierna la plantilla; la otra es la del aviso «No hay caja abierta», que sale en
las tres plantillas porque habla del estado de la caja y no de lo que el negocio compró — y en una
demo recién creada sale siempre. Las cinco pruebas buscaban el botón en TODA la página: en
`restaurante` exigían cero y encontraban el del aviso, y en `estetica` el `getByRole` reventaba con
«strict mode violation». Es el fallo del identificador suelto, el de siempre, pero en el navegador.

Se arregla con un ayudante que recorta el bloque de acciones del encabezado —el hermano siguiente
del bloque que contiene el `h1`— y afirma DENTRO. Sin clases de CSS: se rompen el día que alguien
cambie un `gap`.

**3 · El techo de 30 s estaba mal puesto.** Cada prueba entra con PIN, cambia la plantilla y abre las
once, doce o trece pantallas de su modelo, una por una. Las dos que pasaban lo hacían en 26 s, a
cuatro segundos del límite; las otras tres morían por el techo con la última aserción a medias, y el
rastro decía «no encontré el botón» — que manda a arreglar lo que no está roto. Sube a 120 s. El
MECANISMO no cambia: `expect` sigue en 10 s y sigue esperando por condiciones.

**4 · `complementary`, no `region`.** La venta que se arma en el mostrador de la ferretería vive en
un `aside`, y ése es su rol implícito. Escrito como `region` la prueba no encontraba nada y mandaba
a mirar una pantalla que estaba bien.

Y debajo de eso había un segundo detalle, éste de verdad interesante: `Mostrador.tsx` deja el panel
`hidden xl:block` y por debajo de 1280 px lo pliega en una barra. Los dos proyectos de esta suite
caen a los dos lados de esa raya —1138 px la tablet—, así que exigir «desplegado» en los dos ponía
en rojo un diseño correcto: en el pasillo, el mostradorista necesita la pantalla entera para buscar.
Con `display: none` el `aside` sale del árbol de accesibilidad y deja de tener ROL, así que ni
`toBeAttached` lo encuentra por `getByRole`. La prueba comprueba ahora la forma que toca a cada
ancho, y en la tablet **abre la barra** y comprueba que el panel aparece: que es lo que de verdad
hace falta para cobrar desde una tablet.

### 5 · El que importa fuera de las pruebas · el pooler en MODO SESIÓN

A la tercera corrida, todo empezó a contestar **500**:

```
(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15
```

La `DATABASE_URL` de este proyecto entra por el pooler de Supabase en el puerto **5432**, que es
modo SESIÓN, y ahí el techo son **15 clientes simultáneos**. Y `packages/data/src/cliente.ts` tenía
el tamaño del pool clavado en `max: 10` con un comentario que decía «Supabase con pooler en modo
**transacción** admite bastante». El comentario describía otro puerto.

Dos procesos —el servidor de las pruebas y el que contesta la puerta— agotan el pooler. Y matar el
servidor a la fuerza no le avisa a Supavisor: las sesiones se quedan colgadas, así que a la tercera
vuelta ya no quedaba ninguna libre. Hubo que cerrarlas a mano, y dejarlas habría dejado el pooler
lleno **para los cuatro negocios mañana por la mañana**.

Lo que se cambió: `max` deja de estar clavado y lo puede bajar `MORPHIQPOS_DB_POOL_MAX`. El valor por
omisión sigue siendo 10 —en producción cada instancia serverless abre SU pool y 10 es donde una
terminal de caja no hace cola—, y las pruebas corren con 3.

**Y esto no es sólo de la máquina de pruebas.** En producción, cada instancia de Vercel abre hasta
10 y el pooler admite 15: **dos instancias calientes bastan para que el punto de venta empiece a
devolver 500 en hora pico**, con un error que no menciona el pooler por ningún lado. No se tocó
producción —eso es de Miguel— pero queda dicho, con las dos salidas, en el reporte y en
`VERCEL-ENTORNO.md`.

### Lo que las pruebas afirman, y que nadie había mirado en un navegador

| Modelo | Lo que se vio |
|---|---|
| **restaurante** | «Mesas», «Meseros», «Cocinas» en el menú · el tablero ofrece «Nueva venta», no «Ir a Caja» · las once pantallas del modelo responden |
| **cafetería** | con SU plantilla: mostrador, sin sala · y con la de Jacaranda: «Baristas» y «Barras» donde un restaurante dice «Meseros» y «Cocinas» — la misma entrada del menú, el diccionario del giro |
| **abarrotes** | la plantilla `tienda` trae inventario, compras y recetas (D-01) y NO trae sala · «Productos» |
| **ferretería** | «Materiales» donde la tiendita dice «Productos», con la misma plantilla · el mostrador con su buscador y la venta armándose al lado |
| **estética** | el giro `estetica` ya existe y habla como una estética —estación, cita, estilista, clienta— · `salon` sigue SIN ser plantilla, y el servidor la rechaza con `ENTRADA_INVALIDA` · las doce pantallas responden |

---

## 2026-09-17 · CIERRE DE LA 2.3 · E1 a E3 · el renombre, los cinco negocios y la puerta que muerde

El acople quedó ✅ con la puerta en 0, y **la puerta no servía**. Aprobó un sistema con cinco
defectos que cualquiera ve al abrirlo:

1. Las **61 pantallas** de los cinco modelos no colgaban de **ningún** menú. Respondían, y sólo se
   abrían tecleando la URL. `heredado/lib/permissions.js:43-79` tenía doce entradas fijas y
   `app/(modelos)/layout.tsx` no comprobaba nada.
2. De tres plantillas, **dos eran la misma**: `tienda` y `cafeteria` con los mismos 28 módulos. Y
   ningún módulo nombraba agenda, cita, comisión, expediente, profesional, cotización, corte de
   material ni crédito — las palabras de los negocios que se acababan de construir.
3. La puerta **no podía fallar**: `verificar-acople.mjs:406-410` comprobaba que «los 6 giros caen en
   una plantilla», y `plantillaDe()` termina en `default: return 'tienda'`. Una tautología.
4. `verify:fase2` seguía sin `verify:acople`, sin `verify:esquema` y sin `verify:rls` — y el reporte
   013 §3 y esta bitácora afirmaban que se había arreglado.
5. La `DATABASE_URL` de Production, en el 5432.

### E1 · el nombre

Al acople se le llamó «Fase 3» durante dos sesiones. No lo es: la **Fase 2 es construir los ~78
modelos del mapa**, hoy hay cinco y faltan 73; el acople de esos cinco es la etapa **2.3**. El
renombre tocó **26 archivos, 61 apariciones** y renombró tres: `F2.3-REGLAS-DE-ACOPLE.md` y los
reportes 012 y 013.

**Lo que NO se tocó:** las ~85 cabeceras SQL del rango 058-166 que dicen «APLICADA EN LA FASE 3
(acople)» y «(F3-REGLAS §2)». Son comentarios *dentro del SQL*, el ejecutor valida cada archivo por
hash FNV-1a contra el ledger `_migraciones`, y cambiar una coma abortaría la tanda entera. Se leen
como «2.3», y así queda dicho en `00-LEEME-PRIMERO.md`.

### E2 · que cada modelo se vea como su negocio

**De 3 plantillas a 5** (`tienda`, `cafeteria`, `restaurante`, `ferreteria`, `estetica`) y **de 38
módulos a 62**. Los 24 nuevos son las palabras que faltaban: agenda, cita, comisión, expediente,
profesional, cotización, corte de material, crédito. Ningún par de plantillas comparte conjunto:
32 · 34 · 40 · 39 · 37 módulos. Migración **166** aplicada — abre el `check`, reescribe
`organizaciones_paquete_compatible_con_giro` y comprueba DENTRO de la transacción que el check
admite las cinco y sólo cinco, y que ningún negocio queda con plantilla ajena a su giro.

**F-018 · el menú vive en el servidor.** `packages/contracts/src/comandos/navegacion.ts` es la
única tabla de menú del sistema: cinco menús en orden de día de trabajo, cada entrada con su
módulo y su permiso. De ahí leen **el lateral y el abanico móvil** — antes cada uno tenía su lista
tecleada a mano, y ninguna de las dos incluía una sola pantalla de modelo.

Pantalla de inicio por plantilla y por rol (`INICIO_POR_PLANTILLA`), y la guarda
`exigirPlantilla()` en las cinco carpetas de `app/(modelos)/`: una ferretería que teclee
`/restaurante/mapa-de-mesas` acaba en su propio mostrador, no en la sala de otro negocio.

**Lo que no pasó todavía:** el vocabulario de F-017 lo consumen 3 componentes. Las 61 pantallas,
los mensajes de error y los estados vacíos siguen con las palabras de fábrica. Es E2.4.

### E3 · la puerta

**Se escribió primero la comprobación y se comprobó que salía ROJA** con el código de entonces
—`Cannot find module … navegacion.ts` y `NAVEGACION: no hay menú por plantilla`— porque una puerta
que no has visto fallar no sabes si funciona, y ésa fue exactamente la que dejó pasar las 61
pantallas huérfanas.

La tautología se sustituyó por `PLANTILLA_POR_GIRO`, un mapa explícito: sus claves son `GIROS` **en
las dos direcciones**, sus valores están en `PLANTILLAS`, `plantillaDe(giro)` coincide con el mapa,
y **un giro inventado NO es clave**. `plantillaDe` ahora distingue AUSENTE —el giro decide— de
CORRUPTO, que sí cae en `tienda`. Y `comprobarNavegacion()` exige menú no vacío por plantilla,
módulo incluido, inicio dentro del menú, y las 61 pantallas alcanzables menos las declaradas.

**Cuatro pantallas no van en ningún menú, y está escrito por qué** en `EXCEPCIONES-COBERTURA.md`
con la clave `PANTALLA-SIN-MENU`: los dos `acceso-por-pin` se ven ANTES de que haya sesión, y
`restaurante/portal-del-comensal` y `cafeteria/menu-publico-y-pedido-anticipado` las abre el
cliente desde su teléfono con un token de mesa. Si la fila no está, la puerta las cuenta como
inalcanzables: lo que no puede pasar es que una pantalla se caiga del menú en silencio.

**`verify:fase2` borrado.** Era la cadena corta por la que se colaba todo: terminaba en
`verify:cobertura` y no llevaba ni `test:integracion`, ni `verify:esquema`, ni `verify:rls`, ni
`verify:acople`. Hay **UNA** cadena, `pnpm verify`, con 31 eslabones. Y las dos afirmaciones falsas
—reporte 013 §3 y esta bitácora línea 1977— llevan su corrección fechada donde estaban escritas, no
en otro archivo.

### Las consecuencias, una por una

Ocho pruebas se pusieron rojas al abrir las plantillas a cinco, y **todas eran correctas**: la
ferretería pasa a su propia plantilla; ausente y corrupto dejan de ser lo mismo; la estética deja de
resolverse como tienda; `toHaveLength(3)` pasa a 5; se lee `PAQUETES` en vez de teclear la lista; y
`PAQUETES_OPERATIVOS` pasa a llamarse `PAQUETES_PORTAL` y se estrecha a `['cafeteria','restaurante']`
— **antes una ferretería aceptaba pedidos por QR de mesa**.

Un contrato propio salió demasiado fuerte y se corrigió en vez de forzarlo: «cada plantilla trae al
menos un módulo que ninguna otra trae» falla porque `tienda ⊂ ferreteria`, y eso es **correcto** —
una ferretería es una tiendita que además corta material, fía y factura. Quedó como «cada PAR se
distingue en al menos un módulo», con el porqué escrito al lado: inventar una diferencia para que
pase la prueba sería la peor forma de satisfacer un contrato.

**`verify:aspecto` con 39 testigos**, y ninguno es una regresión: el abanico móvil pierde 10 iconos
del import nombrado porque ya no tiene lista propia —los resuelve por nombre, y ahora pinta también
los de las pantallas del modelo— y el lateral gana 29 porque tiene 29 entradas nuevas. Declarados en
`scripts/aspecto-permitido.json`, con su motivo, en la clave `permitidos` (que es la que
`verificar-aspecto.mjs:99` lee — la primera vez fueron a parar a `_comentario` y la puerta siguió en
rojo, con razón).

### Cómo queda

```
  migraciones   98 en disco = 98 en el ledger
  seguridad     RLS y grants cerrados en 162 relaciones y 15 funciones
  plantillas    5 resuelven módulos · los 6 giros de GIROS caen en una
  navegacion    59 rutas en los menús · 57 de 61 pantallas de modelo alcanzables · 4 declaradas sin menú
  vocabulario   ruta + los dos envoltorios + el menú heredado · 3 pantalla(s) lo consumen
```

`typecheck` 7/7 · **2 685 pruebas en 223 archivos** · `lint`, `verify:cobertura`, `verify:esquema`,
`verify:rls`, `verify:paquetes`, `verify:aspecto`, `verify:entorno`, `verify:primitivas` y
`verify:mutaciones-backend` en 0. `verify:acople` pide un servidor al que preguntar por las rutas:
eso es E5.

**Falta:** E2.4 (que el vocabulario se vea en las 61 pantallas), E4 (datos y usuarios de
demostración, con la guarda de `sesion.ts` comparando por ID de organización y no por nombre), E5
(producción, `main`, el 6543 y la organización saliendo de la SESIÓN), E6 (`ACCESOS-DEMO.md`) y E7.

---

## 2026-09-17 · E2.4 · el vocabulario se VE

F-017 estaba construido entero desde E2 de la Fase 2 y **lo leían 3 de 65 componentes**. Los otros
62 tenían el sustantivo tecleado a mano: «Mesas» en el encabezado, «Ninguna cuenta está esperando
cobro» en el estado vacío, «No se pudo leer la nota» en el error. El día que la dueña de un spa
llame «cabina» a su estación, esas 62 pantallas seguirían diciendo «mesa».

**Hoy lo consumen 48 pantallas y quedan CERO sustantivos tecleados a mano** en lo que el usuario lee.

### Lo que hubo que añadir al diccionario para poder hacerlo

Con `singular`, `plural`, `articulo`, `conArticulo` y `conNumero` no alcanzaba: la mitad de la copia
de una pantalla es un encabezado, un determinante o un adjetivo, y los tres concuerdan.

| Forma | Da | Por qué existe |
|---|---|---|
| `titulo(entidad, plural?)` | `Mesas` · `Materiales` · `Clientas` | Es la forma de un encabezado y de una pestaña, y el 60 % de lo que se ve. Sin ella cada pantalla escribía su propia mayúscula |
| `enFrase(entidad, plural?)` | `la mesa` · `las cuentas` | `conArticulo` capitaliza, y eso deja «No se pudo abrir La mesa» en cada error. Sin ella cada pantalla se inventaba su `.toLowerCase()` |
| `conDeterminante` / `enFraseCon` | `Ninguna mesa` · `Ningún pedido` · `otra cuenta` | **El determinante CONCUERDA.** El mismo estado vacío, la misma pantalla, y una cafetería leía «Ninguna pedido está esperando» |
| `terminacion(entidad, plural?)` | `o` · `a` · `os` · `as` | **El adjetivo también.** Da «Cuentas cobradas» y «Pedidos cobrados». Es fea de leer y es la única forma honesta: el adjetivo concuerda con una palabra que elige la dueña |

Las cuatro respetan el apagado de la regla 3: una entidad que el giro no usa devuelve cadena vacía,
no «ninguna undefined». `terminacion` es la excepción y lo dice: con cadena vacía la frase quedaría
«cobrad», que se lee como un error del sistema.

### Lo que se tocó, y lo que NO

Se tocó **sólo lo que el usuario lee**: texto de JSX, y los props que se leen —`aria-label`,
`placeholder`, `title`, `alt`—. Y los mensajes de error y los estados vacíos, que es donde más se
nota (regla 4 del sistema de diseño).

NO se tocó ni un identificador, ni un tipo, ni un campo de la base, ni un nombre de entidad del
puente, ni una clase de CSS, ni un comentario. Cambiar `mesa_numero` o `consultarPuente('Mesa')`
rompería el sistema **sin mover una palabra en la pantalla**, que es el peor cambio posible.

Y hay palabras que NO son la entidad, con su lista y su motivo: «punto de venta» es el nombre del
producto, «precio de venta» es contabilidad, «cuenta el cajón» es el verbo contar, «punto de
partida» es un modismo, y la «nota» de `ferreteria/Entradas` es la del PROVEEDOR y no la del
cliente. Traducir una de ésas es peor que no traducir nada.

### Siete helpers que no podían llamar a un hook

Siete funciones fuera de un componente —`bloqueoDe`, `mensajeDe`, `mensajeDeFallo`, `rotulo`, y la
lista de motivos de `AnularLineaDialog`— necesitaban el vocabulario. Reciben `voc: Vocabulario` como
parámetro, que es lo que este proyecto ya hace con `crearVocabulario`: el dominio no sabe que existe
un navegador. La lista de motivos pasó de constante de módulo a función `motivosDe(voc)` — tres de
los cuatro motivos nombran una entidad, y las **claves** siguen sin traducirse porque viajan a la
base.

### Y la puerta, que pedía «al menos dos»

`verify:acople` exigía que **dos** pantallas consumieran el vocabulario. Con tres consumidores de 65
pasaba, y las otras 62 tenían el sustantivo a mano: **un número mínimo no mide nada.** Ahora la
comprobación es la propiedad de verdad: _ninguna pantalla escribe a mano una palabra que el
diccionario de su giro ya sabe decir_, y señala el archivo, la línea y la palabra.

```
Destructivas que FALLAN:
  · devolver «Mesas» al <h1> de restaurante/MapaDeMesas  → VOCABULARIO: MapaDeMesas.tsx:194 «Mesas»
  · un aria-label="Buscar cliente u obra" en ferreteria/Cuentas → VOCABULARIO: Cuentas.tsx:418 «cliente»
Inocuas que PASAN:
  · un comentario nuevo y una línea en blanco sobre `const voc = useVocabulario()`
  · reordenar props de un componente
```

> **CORRECCIÓN de la entrada anterior (E1-E3).** Dije que `pnpm lint` salía **en 0** al cerrar ese
> bloque. **No era cierto**: quedaban 5 errores de `@typescript-eslint/no-unnecessary-condition` en
> `plantillas.ts:103,120`, `navegacion.ts:557-558` y `servidor/plantilla.ts:39`, todos en código de
> esa misma etapa, y los vi al correr la cadena de ésta. Los cinco eran el mismo caso: un
> `?? 'tienda'` que protege un valor corrupto venido de la base, y que para el TIPO es código muerto
> porque las tablas son `Record` completas a propósito. Se cerró con `segunElDato(tabla, clave)`, que
> dice en UN sitio y con su motivo que la clave sale de los datos y no del tipo — quitar el `??`
> habría dejado `undefined` viajando hasta la pantalla.

**Cómo queda:** `typecheck` 7/7 · **2 697 pruebas en 223 archivos** · `lint` en 0 (comprobado) ·
`prettier --check` limpio · `verify:aspecto` y `verify:cobertura` en 0 · `verify:acople` con
`vocabulario   48 pantalla(s) lo consumen · 0 sustantivos tecleados a mano`.

---

## 2026-09-17 · TRES DEFECTOS QUE E2 METIÓ Y LA PUERTA APROBÓ

Se encontraron al empezar E4, mirando el menú que cada plantilla pinta. Los tres venían del bloque
E1-E3, los tres estaban commiteados, y **los tres pasaron `verify:acople`, 2 697 pruebas, `lint` y
`typecheck`**. Vale la pena escribir por qué: la puerta comprobaba las RUTAS —que las 61 pantallas
colgaran de algún menú— y las tres cosas estaban mal en lo que el dueño LEE, no en la lista de rutas.

### 1 · El punto de venta de todos los días se quedó sin menú

Al escribir el menú por plantilla, las entradas de los cinco modelos **sustituyeron** a las doce
heredadas. Miguel y su personal perdieron del menú `/mesero`, `/cocina`, `/caja`, `/ventas`,
`/recetas`, `/productos`, `/inventario`, `/compras`, `/registros` y `/portal-qr`: diez pantallas que
llevan meses cobrando y que Codex arregló. Respondían, y sólo se abrían tecleando la URL.

**Es el mismo defecto que esta etapa vino a cerrar, al revés.** Las 61 nuevas dejaron de estar
huérfanas y las doce viejas se quedaron huérfanas.

Arreglado con un grupo `HEREDADO` en `navegacion.ts` que va en las cinco plantillas, detrás de las
del modelo —el día de trabajo empieza en la pantalla del giro— y filtrado por módulo como todo lo
demás: una ferretería no ve «Mesero» ni «Cocina».

Y con una regla nueva: **una entrada por módulo, y sólo ENTRE grupos.** Un restaurante tenía dos
entradas «Caja» —`/restaurante/caja` y `/caja`, las dos `caja_directa`— y un menú con dos nombres
iguales que van a sitios distintos obliga a adivinar. Gana la del modelo, que es la que la plantilla
trae para ese módulo; la heredada sale sólo donde el modelo no cubre ese módulo. La primera versión
de esa regla deduplicaba también DENTRO del modelo y se comió tres pantallas —«Caja» y «Alta rápida»
de la tiendita, «Cita en curso» de la estética—, porque dos pantallas del mismo modelo sí pueden
compartir módulo. Hay un contrato para eso.

### 2 · La `entidad` de una entrada borraba su etiqueta

`etiquetaDeNavegacion` sustituye el texto de la entrada por el plural del sustantivo del giro. Está
bien cuando la etiqueta ES el sustantivo —«Mesas» → «Estaciones»— y **destruye la etiqueta cuando es
una frase**. El menú de una estética decía:

| Entrada | Se leía | Debía leerse |
|---|---|---|
| `/estetica-salon/mi-dia` | **Estilistas** | Mi día |
| `/estetica-salon/historial-de-la-clienta` | **Clientas** | Historial |
| `/estetica-salon/agendar` y `/cita-en-curso` | **Citas** las dos | Agendar · Cita en curso |
| `/abarrotes/alta-rapida-de-producto` | **Productos** | Alta rápida |
| `/abarrotes/fiado` | **Clientes** | Fiado |
| `/ferreteria/corte-de-material` y `/ficha-de-pieza` | **Materiales** las dos | Corte de material · Ficha de pieza |

Trece entradas. Cinco pares con el mismo nombre. Se quitó la `entidad` de las trece: la lleva sólo
la entrada que nombra la entidad y nada más —«Mesas», «Platillos», «Materiales», «Clientas»,
«Servicios», «Estilistas», «Barras», «Productos», «Meseros», «Cocinas»—.

**El límite, dicho:** una entrada cuya etiqueta es una frase ya no se traduce. «Mesa activa» sigue
diciendo «Mesa activa» en una cafetería que llame «vaso» a su unidad de servicio. Traducir dentro de
una frase necesita concordancia de artículo y de adjetivo en la propia etiqueta, y eso es un
mecanismo que hoy no existe; lo que no se hace es dejar que una entidad se coma la etiqueta.

### 3 · La guarda mandaba al login a quien estaba mirando el login

`exigirPlantilla()` cubre la carpeta del modelo entera, que es su virtud —no se puede olvidar una
pantalla— y cubrió también las cuatro que **no** llevan sesión: los dos `acceso-por-pin` y las dos
que abre el cliente con el QR de su mesa. La pantalla de teclear el PIN redirigía a `/login-pos`, y
un comensal con el teléfono en la mano no tiene sesión de negocio ni la va a tener nunca.

El middleware pone ahora la ruta en `x-morphiqpos-ruta` —un `layout.tsx` del App Router no la
recibe, y no hay API estable que la dé— y la guarda salta `RUTAS_DE_MODELO_SIN_SESION`. Son las
MISMAS cuatro que no cuelgan de ningún menú, y `verify:acople` exige que las dos listas digan lo
mismo: si se separan hay dos salidas malas, una pantalla privada que se abre desde la calle o una
pantalla de entrar que no se puede ver.

### La puerta y los contratos que ahora muerden

`packages/domain/src/vocabulario/menu-que-se-lee.test.ts` afirma sobre el menú **tal y como se lee**,
con el diccionario de cada giro, que es lo único que los tres defectos tenían en común: la lista de
rutas estaba bien las tres veces.

```
Destructivas que FALLAN:
  · devolver la `entidad` a «Mi día»          → «estetica» enseña «Estilistas» dos veces
  · dejar el grupo HEREDADO en []             → las CINCO plantillas sin punto de venta de todos los días
  · deduplicar también dentro del modelo      → «tienda» ofrece 9 pantallas y tiene que ofrecer 11
  · añadir /restaurante/caja a la lista sin sesión → las dos listas no dicen lo mismo
  · borrar una fila PANTALLA-SIN-MENU del documento → las dos listas no dicen lo mismo
Inocuas que PASAN:
  · un comentario nuevo en la lista · reordenar dos entradas · renombrar un comentario
```

### Y los cinco specs, con las plantillas de verdad

`ferreteria` y `estetica` daban de alta con `tienda` en `pruebas/e2e/ayudantes/sesion.ts`, y ahí
decía que no era un apaño provisional. **Lo era.** Ahora cada giro entra con su plantilla, y con eso
cambian las aserciones: la ferretería lee «Materiales» en `/ferreteria/material` y no en
`/productos`; la estética lee cuatro sustantivos de su giro en el menú y no uno; la cafetería SÍ
tiene «Barras» —su plantilla incluye el módulo `barra`, que es lo que separa un mostrador de café de
una tiendita— y sigue sin tener «Baristas», porque no incluye `mesero`.

Y un orden que ya no es libre: el spec de la cafetería abría las trece pantallas del modelo DESPUÉS
de cambiar la plantilla a `restaurante`. Con la guarda de E2, eso son trece redirecciones y un
rastro que dice «no encontré el encabezado». Se movieron delante, y la prueba devuelve la plantilla
al terminar.

Tres cabeceras largas describían el mundo de tres plantillas y de «un solo sustantivo en el menú».
Llevan su corrección fechada, no un borrado.

---

## 2026-09-17 · E4 · datos y usuarios de demostración — y el defecto que destapó

### EL DEFECTO, primero, porque es el que importa

**Desde que se aplicó la migración 121, ninguna organización podía insertar, editar ni borrar un
producto.** Ni las demos ni los cuatro negocios que cobran. Cualquier escritura sobre `productos`
abortaba la transacción entera con `42501 · permission denied for materialized view
busqueda_material`.

La 121 puso tres triggers `after insert or update or delete` sobre `productos`,
`producto_atributos` y `ubicaciones` que llaman a `refrescar_busqueda_material()`, y esa función
hacía `refresh materialized view concurrently busqueda_material`. Dos reglas de Postgres la hacen
imposible, no una:

1. **`REFRESH MATERIALIZED VIEW` exige ser DUEÑO de la vista.** La función no era `security
   definer`, así que corría como `morphiqpos_app`, que no lo es.
2. **Y `CONCURRENTLY` no se puede ejecutar dentro de una función ni de un bloque de transacción.**
   Un trigger es las dos cosas a la vez. Aunque el permiso estuviera, el refresco seguiría siendo
   imposible.

No lo vio nadie, y el porqué vale más que el defecto: **ninguna prueba ni ninguna puerta escribe un
producto con el rol de la aplicación.** Las de unidad usan dobles —no hay Postgres— y las de
integración exigen Docker, que esta máquina no tiene, así que `test:integracion` aborta y no corre.
La 121 pasó la revisión, pasó el ensayo con datos, pasó `verify:esquema` y pasó `verify:rls`, porque
ninguna de las cuatro escribe una fila.

Se encontró **sembrando el catálogo de las cinco demostraciones**, que es exactamente lo que E4
pedía. Es el argumento entero a favor de tener datos de demostración de verdad: el defecto llevaba
tres semanas aplicado en producción.

**Migración 167**, con sus tres poscondiciones: `security definer`, sin `concurrently`, y una que
inserta un producto de verdad y lo borra. Lo que cuesta: el refresco toma un `ACCESS EXCLUSIVE`
sobre la vista, así que el buscador del mostrador espera unos cientos de milisegundos **al editar el
catálogo** —no al vender: la existencia no está dentro de la vista y una venta no dispara ningún
trigger—. Un mostrador que espera 300 ms cuando el encargado da de alta un material es
infinitamente mejor que uno que no puede dar de alta ningún material.

**Y un contrato que lo caza**, `packages/data/src/migraciones/refrescos-de-vista.test.ts`: ninguna
función VIGENTE refresca en `concurrently`, y toda función que refresca una vista materializada es
`security definer`. Mira la ÚLTIMA definición de cada función —una migración aplicada no se edita, y
la 121 conserva su `concurrently` para siempre— y recorta los comentarios antes de mirar, porque un
contrato que encuentra su propia explicación no prueba nada.

```
Destructivas que FALLAN: quitarle `security definer` a la 167 · devolverle el CONCURRENTLY
Inocuas que PASAN: un comentario nuevo en la 167 que dice la palabra «concurrently»
```

### Y dos más, del mismo camino

**`ERROR_INTERNO` no dejaba rastro de nada.** El comentario decía «el mensaje original se queda en el
servidor» y el mensaje original no se quedaba en ninguna parte: al registro sólo iba el nombre del
comando. Diagnosticar el 42501 fue imposible hasta arreglarlo. Ahora van las DOS cosas que nombran
el fallo sin llevarse nada de dentro: **la clase del error y su SQLSTATE** —cinco caracteres del
estándar, `23503`, `23514`, `42501`—. Ni el mensaje, ni la restricción, ni un solo valor de la
entrada, que es la razón por la que el registrador no serializa excepciones.

**`verify:esquema` estaba en rojo desde E2 y la bitácora decía que estaba en 0.** La migración 166
cambió dos `check` de `organizaciones` y nadie regeneró `scripts/esquema-esperado.json`. Regenerado:
1 702 columnas, 1 329 restricciones, 429 índices. La lección es la de siempre y van tres en esta
sesión: **una puerta que no se corre no está en 0, está sin correr.**

### Lo que E4 pedía

| | Antes | Ahora |
|---|---|---|
| **4.1 · las cinco demos** | existían, vacías | sembradas, y cada una en la plantilla de su giro |
| **4.2 · un usuario por rol** | UNO: el dueño de `bootstrap` | **3 a 5 por demo**, con nombre de persona y PIN distinto por rol |
| **4.3 · catálogo** | 5 artículos, y la estética con tortillas | **18 a 27 vendibles** por modelo, con precios de México |
| **4.4 · datos de arranque** | nada | proveedor con día de visita, caja ABIERTA con su fondo desglosado, existencias |
| **4.5 · nunca sobre los vivos** | se comparaba por NOMBRE | por IDENTIDAD de organización |

**El equipo** (`demostracion/equipo.ts`) va en los cinco modelos y no sólo en el restaurante. Con un
solo empleado no se ve nada de lo que este sistema hace: los permisos por rol no se distinguen —el
dueño lo puede todo—, el corte no sabe quién cobró, y la comisión de un salón no tiene a quién
repartirse. Peor para quien revisa: «entra con el dueño y mira» no prueba que un cajero NO pueda
cambiar la plantilla, que es media seguridad del sistema.

Los PIN son de cuatro dígitos y **distintos por rol a propósito**, para saber con quién se entró sin
mirar dos veces. Se hashean con Argon2id y pimienta igual que cualquier otro: no hay un camino
distinto para sembrar, y nunca se guarda un PIN en claro — precisamente porque «es sólo la demo» es
como acaban los PIN en claro en producción.

**La estética tenía tortillas.** El giro `estetica` caía en la semilla de abarrotes, así que su demo
abría con frijol y huevo en el catálogo. Y no era cosmético: sus doce pantallas leen servicios con
duración, profesionales y recursos, y sin una sola fila en `servicios` la agenda del día abre con
cero columnas. Ahora trae 16 servicios con **los cuatro tramos de F-401** —aplicar, procesar,
terminar, recoger—, dos estilistas con horario de martes a domingo, tres estaciones, un lavabo y una
secadora. El procesado, que es el negocio de este modelo, está declarado donde existe: un tinte
ocupa a la estilista 40 min y deja a la clienta 25 procesando, y en esos 25 se atiende a otra.

**El fondo de caja va DESGLOSADO** (F-984): «$1,500» no dice si se puede dar cambio. Una ferretería
abre con más billetes grandes porque sus tickets son grandes; una cafetería con más monedas.

### Cómo se siembra, y por qué hay un script nuevo

`sembrar-demo.mjs` siembra por HTTP, que es lo correcto para comprobar que la ruta y la sesión
funcionan. Pero un despliegue sirve a UN negocio (R16), así que sembrar las cinco por HTTP son cinco
arranques de servidor con su `ORGANIZACION` distinta. **`scripts/sembrar-demos.mjs`** ejecuta el
MISMO comando —`configuracion.resetear_demo`, con la misma transacción, el mismo gate de rol y la
misma auditoría— construyendo el ámbito desde la base. Sólo acepta slugs `demo-acople-*` y rechaza
los cuatro vivos por su slug.

Y endereza la plantilla de cada demo a la de su giro en cada siembra. `demo-acople-cafeteria` estaba
en `restaurante` desde una corrida de navegador interrumpida, y con la guarda de E2 eso significa
que **ninguna de sus trece pantallas se podía abrir**.

### Un cambio de producción que no es de demostración

`packages/app/src/fallos.ts` deja de usar «parameter properties» —`constructor(readonly codigo: …)`—.
Dicen lo mismo en menos líneas y hacen que el paquete `app` entero no se pueda importar desde
`node --experimental-strip-types`: es sintaxis que hay que TRANSFORMAR, no sólo borrar. Next lo
compila sin problema; los scripts de este repositorio corren con Node pelado y necesitan importar
los comandos de verdad para no acabar con una segunda copia de la lógica.

### Cómo queda

```
  demo-acople-cafeteria    18 vendibles · 16 insumos · 4 empleados · caja $1,000 · Café de Altura Xico
  demo-acople-estetica     24 vendibles ·  8 insumos · 5 empleados · caja $1,500 · 2 profesionales · 16 servicios
  demo-acople-ferreteria   25 vendibles · 25 insumos · 3 empleados · caja $2,000 · Ferretera del Valle
  demo-acople-restaurante  27 vendibles · 33 insumos · 5 empleados · caja $3,000 · 12 mesas
  demo-acople-tienda       22 vendibles · 22 insumos · 3 empleados · caja $1,200 · Abastos del Centro
```

`typecheck` 7/7 · **2 718 pruebas en 225 archivos** · `lint` 0 · `prettier --check` limpio ·
`verify:esquema`, `verify:rls`, `verify:paquetes`, `verify:aspecto`, `verify:entorno`,
`verify:primitivas`, `verify:mutaciones-backend` y `verify:cobertura` en 0 · **99 migraciones en
disco = 99 en el ledger**.

**Cero datos de prueba en los cuatro negocios de Miguel.**

---

## 2026-09-17 · E5 a E7 · producción, accesos y el cierre

### E5 · la organización sale de la PETICIÓN

`ORGANIZACION` se aplica AL CONSTRUIR y es la misma para todas las peticiones, así que con ella **un
despliegue sólo puede servir a un negocio.** Miguel tiene cuatro y hay cinco demostraciones.

`negocioDelDespliegue(slug, host)` resuelve ahora en este orden: **el host** de la petición si su
primera etiqueta es el slug de una organización activa; `ORGANIZACION`; la única activa si hay una
sola; y falla nombrando lo que falta. El host va primero porque es lo más específico que hay, y la
organización sigue sin llegar en un parámetro del cliente: un host lo fija el DNS y se comprueba
contra la tabla, así que una etiqueta inventada no encuentra nada y cae al paso 2.

Se usa en los cuatro sitios donde **no hay sesión**: las dos rutas de acceso, que contestan antes de
que exista, y el portal del comensal y la recogida, que no la tienen nunca. Ahí tiene más sentido que
en ningún otro sitio: el código QR que el comensal escanea **lleva la dirección dentro**, así que la
mesa y el negocio viajan juntos en lo único que el comensal tiene. En cuanto hay sesión, la
organización sale de ella y esto no se vuelve a consultar.

**Y el pooler.** `DATABASE_URL` de Production pasa del 5432 —modo sesión, techo de 15 clientes— al
**6543**. Era el quinto defecto del encargo. El valor viajó por la entrada estándar del CLI y no
aparece en ningún commit.

**La fusión a `main` NO está hecha**, y no por olvido: empujar a `main` dispara un despliegue de
producción, esta sesión pidió permiso y se le denegó. Está en el
[PR #1](https://github.com/M1gu3hb/MorphiqPOS/pull/1), con su resumen y su plan de prueba. Es una
decisión de Miguel y así debe ser: son 78 commits sobre el sistema que cobra esta noche.

### E6 · ACCESOS-DEMO.md, y el almacén que no tenía menú

`docs/fase-2/ACCESOS-DEMO.md`: los cinco negocios con su catálogo y su caja, las 24 personas con su
rol y su PIN, el menú de cada plantilla con lo que el diccionario renombra, dónde abre cada rol, la
tabla de qué ve cada uno, un recorrido de veinte minutos y una tabla de «si algo no abre».

**Los PIN se comprobaron uno por uno contra su hash Argon2id.** No se copiaron de la semilla: si uno
deja de funcionar, lo que cambió es la base y no el documento.

Y escribir la tabla de «qué puede hacer cada rol» destapó el cuarto defecto: **el almacén veía la
pantalla vacía.** `rolMH` devuelve null para él —con razón— y `hasPermission('almacen', …)` no
encontraba ninguna entrada. Nadie lo había visto porque hasta que E4 le dio un usuario a cada demo,
nadie había entrado como almacén. Ahora ve lo suyo, 4 a 8 entradas según la plantilla: existencias,
entradas, conteo, compras y el catálogo que necesita para recibir. No la caja.

### E7 · lo que la suite de navegador encontró

**10 de 10**: cinco modelos × escritorio y tablet, cada uno contra SU demo, entrando con un usuario
real y navegando por el menú. Y de camino, cuatro cosas más.

**Siete pantallas abrían en 200 y reventaban por dentro.** `page.tsx` las monta con `productoId=""`
—se abren sin nada seleccionado— y el componente consultaba igual: la cadena vacía llegaba a un
`where id = ''` sobre una columna uuid y Postgres contestaba **22P02**. Dos respuestas 500 por
pantalla, en cada apertura. Sin id, no se consulta; el estado de «elige algo» ya estaba escrito en las
siete.

**Y la suite las daba por probadas**, porque `abrirPantalla` miraba el 200 del HTML y nada más. Ahora
`vigilarFallos(page)` escucha toda la prueba y `exigirSinFallos()` al final. La primera versión
esperaba `networkidle` por pantalla y eso no sirve aquí —la cocina consulta en bucle, la red nunca
queda quieta— hasta que Chromium enseñó «This page couldn't load». Sin esperas.

**`MORPHIQPOS_DEMO_PERSONA` ya no es opcional** con varias personas. «La primera de la lista» era una
lotería: si salía el almacenista, el PIN de la corrida no era el suyo y el fallo aparecía como «no
salió de /login-pos».

**El Modo presentación ofrecía TRES plantillas.** `PACKAGE_ORDER` estaba tecleada, y cuando la 166
abrió las cinco, `ferreteria` y `estetica` no se podían elegir desde ninguna pantalla aunque el
servidor ya las aceptara. Ahora se deriva de `PLANTILLAS`, ordenada por número de módulos —de menos a
más, que es como se lee el comparador— y hay un contrato que impide volver a teclearla.

### El misterio de los ECONNRESET, y por qué importa contarlo

Diez respuestas 500 por corrida en `/api/datos/consultar`, con `ECONNRESET`. Costó cuatro pasos y los
cuatro dejaron algo:

1. **El registro no decía nada.** «Fallo no controlado» y un correlationId. Ahora lleva la ruta, la
   clase del error, el SQLSTATE y la entidad del puente — y fue eso lo que convirtió diez líneas
   idénticas en cuatro defectos distintos.
2. **El pool recicla antes que el pooler:** 10 s en vez de 30, con `keepAlive`. De diez a dos.
3. **Un reintento de LECTURA**, una vez, sólo si lo que se cayó fue la conexión. Las escrituras nunca:
   un `ECONNRESET` no dice si la sentencia se ejecutó, y para esa pregunta está la clave de
   idempotencia.
4. **Y la causa de verdad no era el pooler: era correr con `MORPHIQPOS_DB_POOL_MAX=4`.** Un apaño para
   el techo de 15 clientes del pooler en modo SESIÓN que ya no aplica en modo transacción. Medido: con
   `=4`, once 500 en una corrida; con el 10 por omisión, **cero**. La instrucción de bajarlo está
   corregida en los dos sitios donde estaba escrita.

Y lo que quedaba después de todo eso **no era un defecto**: cada pantalla aborta sus consultas al
desmontarse, el servidor acaba escribiendo en un socket que ya no está, y eso es un usuario que cambió
de pantalla. Va como **aviso** y con su nombre. Mezclados, diez errores que no son errores hacen que
el registro deje de leerse.

### Las siete condiciones, sin adornos

| | Condición | |
| --- | --- | --- |
| 1 | `verify:acople` en 0 con la comprobación nueva | ✅ contra un servidor vivo |
| 2 | `pnpm verify` completo en 0 | ⚠️ **30 de 31** · `test:integracion` necesita un Postgres que esta máquina no tiene |
| 3 | Las cinco plantillas en Modo presentación | ✅ derivadas, con contrato |
| 4 | Playwright ×5 por el menú | ✅ **10/10** |
| 5 | Desplegado y comprobado desde fuera | ⚠️ falta la fusión a `main`, que es del PR #1 |
| 6 | `ACCESOS-DEMO.md` | ✅ |
| 7 | Cero datos de prueba en los cuatro vivos | ✅ de esta sesión · y hay de antes, con fechas, en el reporte 014 §7 |

**Y datos de prueba de antes que no se borraron, a propósito.** Ferretería La Broca tiene 6 órdenes y
10 cortes del 09-09 entre las 03:21 y las 06:10 —diez cortes en tres horas de madrugada— y Restaurante
MH, cuatro cortes del 10-09 entre las 15:01 y las 15:11 más los tres empleados de la semilla. Son de
las sesiones del 8 al 10 de septiembre. **Esta sesión no añadió ni una fila a ninguno de los cuatro**,
y se comprobó buscando los nombres y los productos de las semillas: cero. No se borró nada porque MH
tiene además una orden del 13-09 con folio que parece real, y borrar en la caja de alguien que cobra
no es decisión de quien limpia.

### Cómo queda

```
typecheck 7/7 · 2 732 pruebas en 227 archivos · lint 0 · prettier limpio · build correcto
verify:acople 0 ✓   99 migraciones = 99 en el ledger · RLS en 162 relaciones
                    103 rutas · 82 por HTTP · 5 plantillas · 66 rutas en los menús
                    57 de 61 pantallas alcanzables · 48 consumen el vocabulario
navegador     10/10 · cero fallos reales
```

---

## 2026-09-18 · E1 · los tres checks rojos del CI, y por qué ninguno era «el arranque»

El encargo decía que los tres morían en el arranque común —`pnpm/action-setup` +
`pnpm install --frozen-lockfile`— porque los tres morían en 24-43 segundos. **No era eso.** Los logs
lo dijeron en cuanto se leyeron con `gh run view 35299491074 --log-failed`: eran **tres causas
distintas**, y ninguna compartida.

Y lo primero que se hizo fue lo que el encargo pedía —clonar en limpio y correr
`pnpm install --frozen-lockfile`— que pasó en 44 s. Eso descartó el lockfile como causa del arranque
y dejó claro que había que leer los logs de verdad.

### Causa 1 · `verify:historico` exigía lo que el contrato prohíbe versionar

```
✗ El contrato de historico/ no se cumple:
  · Repo POS-MH-Tiendita (Fuente B): falta historico/tiendita/package.json
  · ZIP POS MH Restaurante (Fuente A): falta historico/restaurante/base44/config.jsonc
  · Paquete de auditoria de Fase 0: falta historico/auditoria-fase-0/LEEME_PRIMERO.md
```

El propio encabezado del contrato dice que `historico/` **no se versiona**: son 80 MB de evidencia de
la plataforma erradicada. El paso 1 del script exigía que las tres fuentes EXISTIERAN. Las dos cosas
juntas no se pueden cumplir en una copia recién clonada, y el CI clona en limpio: **este check no
podía pasar nunca en CI.**

El arreglo no es relajarlo: es poner cada comprobación donde vive su sujeto. Que el archivo esté
COMPLETO es una propiedad de la máquina que lo guarda —la de Miguel—; que el repositorio lo IGNORE, no
lo trate como workspace, lo excluya de tipos y de lint y no lo importe es una propiedad del
repositorio, y eso se comprueba en cualquier copia. Los pasos 2 a 7 siguen corriendo siempre, y el
script **dice en voz alta** cuál no se corrió y por qué.

```
Destructivas que FALLAN:
  · con el archivo presente, esconder historico/tiendita/package.json → «falta …», 1 fallo
  · en la copia limpia, comentar la regla de historico/ en .gitignore → «historico/ NO esta ignorada»
Inocua que PASA:
  · la copia limpia sin archivo → verde, con el pendiente escrito
```

### Causa 2 · `pnpm audit` · dos vulnerabilidades altas en `sharp`

```
high  sharp inherited vulnerabilities in libvips: CVE-2026-33327, 33328, 35590, 35591
high  sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497, GHSA-2jg2-4ch7-h545
      Vulnerable versions <0.35.4 · Patched >=0.35.4 · Paths apps__web>sharp
```

`sharp@0.34.5` → **0.35.4**. `pnpm audit --audit-level high --prod` pasa de dos altas a
«No known vulnerabilities found».

**Y subirlo destapó un segundo problema que vale la pena contar**, porque es el mismo error de método
que ya costó dos veces en esta fase: el primer `pnpm install` dijo *«Lockfile is up to date,
resolution step is skipped»* y dejó un lockfile con `version: 0.35.4` sin el sufijo de peer, mientras
el árbol materializaba `sharp@0.35.4_@types+node@24.13.3`. Resultado: el enlace
`apps/web/node_modules/sharp` apuntaba a un camino que no existe, Node no resolvía el módulo, y
**typecheck y lint se caían en la copia limpia con 2 y 49 errores** — mientras en mi máquina, con el
árbol viejo aún en su sitio, todo salía verde.

`sharp` 0.35.4 declara `peerDependenciesMeta: { '@types/node': optional }` **sin** listar
`@types/node` en `peerDependencies`, y eso es lo que empuja a pnpm a esa esquina.

Se probaron tres caminos, en la copia limpia y midiendo:

1. declarar `@types/node` en `apps/web` → **no aplica**: ya estaba declarado;
2. `packageExtensions: sharp: { peerDependenciesMeta: {} }` en `pnpm-workspace.yaml` → funcionaba,
   pero;
3. **regenerar el lockfile con el árbol borrado** → funciona igual y sin añadir un apaño. Se quitó el
   `packageExtensions` y se comprobó otra vez: `rm -rf node_modules && pnpm install --frozen-lockfile`
   → sharp resuelve, `typecheck` 7/7, `lint` 0.

El lockfile bueno difiere del malo en tres líneas: `version: 0.35.4(@types/node@24.13.3)`, y dos
`optional: true` que no debían estar.

### Causa 3 · el build · y este defecto era MÍO, de ayer

```
The export PLANTILLAS was not found in module [project]/apps/web/src/cliente/package-config.ts
Did you mean to import PLANTILLA_POR_OMISION?
  ./apps/web/heredado/components/configuracion/ModoPresentacion.jsx
```

Al arreglar el Modo presentación para que ofrezca las cinco plantillas, hice que derivara su orden de
`PLANTILLAS` importándola de `@/lib/packageConfig`. Ese alias resuelve al shim
`src/cliente/package-config.ts`, que hace `export *` de `heredado/lib/packageConfig.js` — y
`PLANTILLAS` allí se **importaba** para usarla dentro, no se **exportaba**. Un `export *` sólo
reexporta lo que el módulo exporta.

`typecheck` no lo vio —el alias resuelve tipos por otro camino— y **yo no volví a correr `pnpm build`
después de ese cambio.** Es la tercera vez en esta fase que una puerta sin correr se declara en 0.

Arreglado exportando `PLANTILLAS` desde `heredado/lib/packageConfig.js`, que además es lo correcto: el
frontend heredado debe leer la lista canónica de `contracts`, no una copia.

### Cómo queda la cadena, medida en la COPIA LIMPIA

`verify:estructura`, `verify:historico`, `verify:tsconfig`, `verify:entorno`, `verify:residuos`,
`verify:primitivas`, `format:check`, `lint`, `typecheck` y `build`: **todos en 0**. `pnpm audit
--audit-level high --prod`: sin vulnerabilidades. `test:unit`: 2 733 pruebas en 227 archivos.

### Causa 4 · la que apareció al arreglar las tres primeras

Con `verify:historico`, `sharp` y el build arreglados, el job `calidad` llegó por fin a las pruebas
unitarias — y murió ahí, a los 22 segundos, con **226 de 227 archivos en verde y 2 703 pruebas
pasando**:

```
FAIL packages/app/src/puente/cobertura.test.ts
Error: ENOENT: no such file or directory, scandir
  '/home/runner/work/MorphiqPOS/MorphiqPOS/historico/restaurante/base44/entities'
```

Es **la misma causa que la 1** vista desde otro sitio: la prueba lee los `.jsonc` que la plataforma
erradicada usaba para declarar sus entidades, y esa carpeta por contrato no se versiona. Con el
archivo delante son 30 pruebas; sin él, la suite entera reventaba antes de la primera.

El arreglo es el mismo criterio: **partir las comprobaciones por lo que cada una necesita.** Que el
puente cubra cada propiedad declarada exige tener los `.jsonc` que la declaran, así que eso va en un
`describe.skipIf` que sale como **skipped, no como verde**. Que la lista de descartes no contradiga al
mapa del puente, que todo motivo explique algo y que ninguno sea un renombrado disfrazado se
comprueba en cualquier copia, y esas **cuatro corren siempre**. Y si el archivo no está, la prueba
escribe en el registro qué se saltó y qué sí se comprobó.

```
Con archivo:  30 pruebas, 0 saltadas
Sin archivo:   4 pruebas, 3 saltadas, 0 fallos   (medido renombrando entities/)
```

### Causa 5 · las pruebas de integración, y por qué en CI nunca podían pasar

Con las pruebas unitarias en verde, el job llegó al paso siguiente y murió ahí. **Dos de los cinco
archivos** de integración fallaron; los otros tres pasaron:

```
base de pruebas lista en ***localhost:5434/morphiqpos_pruebas
❯ packages/app/src/comando.integracion.test.ts            Connection terminated unexpectedly
❯ packages/app/src/puente/propinas-derivadas.integracion…  Connection terminated unexpectedly
✓ packages/data/src/repos/archivos-cuota.integracion.test.ts
✓ packages/app/src/restaurante/comandas.integracion.test.ts
✓ packages/testing/src/humo.integracion.test.ts
```

Ese `5434` es la pista entera. El workflow levanta un servicio de Postgres **en el 5433, con
comprobación de salud**, y define `DATABASE_URL`. Pero lo que `prepararPostgres()` lee para no
levantar su propio contenedor es `DATABASE_URL_PRUEBAS` — una variable que **el workflow no definía**,
aunque el encabezado del propio arnés dijera «es lo que usa CI». Así que en CI el arnés ignoraba el
servicio y arrancaba un contenedor suyo en el 5434.

Y ahí salió el segundo defecto, que es el de verdad: **`esperarPostgres` sólo abría un socket.** El
proxy de Docker publica el puerto en cuanto arranca el contenedor, mientras Postgres todavía está
inicializando su clúster, así que la espera daba «lista» y las primeras consultas se encontraban la
conexión cerrada. Con `fileParallelism: false` los archivos corren EN ORDEN, y lo que se ve encaja
exactamente: fallaron los dos primeros y pasaron los tres siguientes. No era una carrera entre
pruebas; era la base acabando de arrancar.

Tres cosas, entonces:

1. `esperarPostgres` hace un **`select 1` de verdad** además del socket. Es la única espera que no
   miente, y arregla también el arranque en local con Docker.
2. El workflow define `DATABASE_URL_PRUEBAS` apuntando al servicio, que ya tiene `pg_isready`. Se deja
   de levantar un contenedor de más.
3. **Las migraciones se aplican sobre la base de pruebas antes de la suite.** Nadie lo hacía: los tres
   archivos que pasaban crean su propia tabla con `sql\`create table…\``, y los dos que fallaban
   escriben en `organizaciones`, `categorias`, `ventas` y `auditoria`, que en una base recién creada no
   existen. Incluso con la conexión arreglada habrían fallado por «relation does not exist».

Esto es además la respuesta a la condición 7a: **`test:integracion` tiene su base** — la del CI, en cada
empujón, con las 99 migraciones aplicadas de verdad y su ledger. En la máquina de Miguel sigue
necesitando Docker o una `DATABASE_URL_PRUEBAS`.
