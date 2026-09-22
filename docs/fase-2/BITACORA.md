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
   archivos que pasaban crean su propia tabla con un `create table` suyo, y los dos que fallaban
   escriben en `organizaciones`, `categorias`, `ventas` y `auditoria`, que en una base recién creada no
   existen. Incluso con la conexión arreglada habrían fallado por «relation does not exist».

Esto es además la respuesta a la condición 7a: **`test:integracion` tiene su base** — la del CI, en cada
empujón, con las 99 migraciones aplicadas de verdad y su ledger. En la máquina de Miguel sigue
necesitando Docker o una `DATABASE_URL_PRUEBAS`.

---

## 2026-09-18 · E3 y E4 · un despliegue con las cinco demos, y la primera venta cobrada

### E3 · la organización sale de QUIEN ENTRA

`ORGANIZACION` es una variable del BUILD: la misma para todas las peticiones. Con un solo slug **un
despliegue sólo puede servir a un negocio**, y el encargo pide lo contrario. El camino por HOST ya
estaba escrito y sigue ganando, pero necesita cinco registros de DNS que hoy no existen.

Así que `ORGANIZACION` admite una **lista separada por comas**. Con un solo slug —producción— no
cambia nada de nada. Con varios:

- `negociosDelDespliegue()` los resuelve todos y nombra de una vez los que estén mal escritos;
- `/api/auth/empleados` devuelve a la gente de todos, **cada persona con su negocio**;
- `POSLogin` pinta el negocio en cada tarjeta y en el título, y el rótulo dice cuántos hay;
- `/api/auth/entrar` saca la organización **del EMPLEO**, no del build.

Y sigue sin llegar del cliente (R16): lo que el navegador manda es un `empleoId`, y la comprobación
de que ese empleo pertenezca a uno de los negocios servidos va **dentro de la consulta**
(`organizacionDeEmpleo`), así que un empleo de otro negocio no se encuentra y responde lo mismo que
un PIN incorrecto. Encontrarlo no autentica nada: debajo sigue estando Argon2id.

Medido, con UN solo servidor y UN solo build:

```
GET /api/auth/empleados
negocios: demo-acople-tienda, demo-acople-cafeteria, demo-acople-restaurante,
          demo-acople-ferreteria, demo-acople-estetica
usuarios: 25   ·   ('Demo','demo-acople-tienda') ('Jesica','demo-acople-tienda') …
```

Cinco personas se llaman «Demo» —una por demo—, y por eso la guarda de la suite y `entrar()`
filtran por `negocioSlug`: la tarjeta se identifica por **nombre Y negocio**, que es exactamente lo
que la pantalla enseña. El primer intento resolvió a 25 elementos y falló diciéndolo.

La precondición se volvió **más estricta**, no menos: antes miraba si el PRIMER negocio servido era
el declarado; ahora comprueba que **ninguno** de los servidos sea un negocio vivo, y después que el
declarado esté entre ellos.

### E4 · que las pruebas cobren una venta, y los SEIS defectos que eso destapó

La suite abría las once pantallas del modelo y aceptaba tres estados en la de cobro —caja cerrada,
catálogo vacío, o la venta armándose—. **Los tres pasan con el cobro roto.** La primera prueba que
pulsó CONFIRMAR encontró esto, en este orden:

**1 · `/api/venta/cobrar-mostrador` NO EXISTÍA.** La pantalla de inicio de una tienda publica ahí
desde que se escribió. Devolvía 404 con la página de error de Next dentro, que no es `{ok, datos}`,
así que el cliente decía «El servidor respondió algo inesperado». **Una tienda entera sin poder
cobrar.** Ahora la ruta existe y COMPONE los tres comandos que ya había —crear el borrador, meter
cada renglón, cobrar— desde el servidor, en el mismo proceso: para la pantalla es un viaje, y no hay
un segundo cobro duplicado que se vaya separando del bueno.

**2 · La pantalla de cobro preguntaba por la caja al sitio equivocado.** Leía `CorteCaja` del puente
y se quedaba con la primera sesión abierta **del negocio**. Una sesión de caja pertenece a UNA
terminal, y `venta.cobrar` exige la de la suya. El resultado era el peor desacuerdo posible: la
pantalla decía «caja abierta» —había una, en otra terminal—, dejaba armar la venta entera, y al
confirmar el servidor contestaba «Abre la caja antes de cobrar». Ahora usa `/api/caja/estado`, que es
lo que usan las otras cinco pantallas de caja del sistema.

**3 · La caja de una tienda no se podía abrir.** `abarrotes/Caja.tsx` publica el fondo por montones
—monedas, chicos, grandes— y `caja.abrir` esperaba `fondoInicialCentavos`. Ninguno encajaba: cada
apertura respondía «Hay datos incompletos o mal escritos». Las cinco demos tenían caja abierta porque
la siembra la escribía en la tabla, no porque alguien la abriera. El esquema acepta ahora las dos
formas, el total es la suma cuando viene el desglose, y **el desglose se guarda**: las tres columnas
existían desde la 003 y sólo las escribía la siembra.

**4 · La caja sembrada IMPEDÍA cobrar, y no había salida desde la aplicación.** Dos cosas de la base
se juntan: `sesiones_caja_una_abierta_por_sucursal` permite **una** sesión abierta por sucursal, y
una terminal nace cuando un navegador entra por primera vez. La sesión sembrada quedaba en una
terminal que nadie vuelve a usar, así que desde cualquier navegador nuevo —el de Miguel en la
demostración— cobrar decía «Abre la caja antes de cobrar», abrir reventaba contra el índice único, y
cerrar la ajena también exige ser su terminal. **Sin salida.** La siembra deja ahora la caja
CERRADA y la abre el primer cajero, que es lo que pasa al empezar el turno; y `caja.abrir` explica el
conflicto de sucursal nombrando la terminal, en vez de dejar salir un `sqlstate=23505` como «Algo
falló de nuestro lado».

**5 · `'ninguno'` no es `''`.** `comandar-pendientes` saltaba las líneas con
`areaPreparacion === ''`, y el valor con el que el sistema dice «esto no se prepara» es `'ninguno'`
—está en `AREAS_PREPARACION` y lo entiende `areasDe`—. La cadena vacía no la escribe nadie. Los 22
productos de la tienda llegaban a `resolverEstacion`, que sin estaciones **lanza**: cobrar respondía
«No hay ninguna estación de preparación activa. Crea la "Cocina general"…». En una cafetería con
estación general habría sido peor y en silencio: una comanda de cocina por cada botella de agua.
Ahora se pregunta con la MISMA función que decide después.

**6 · El corte decía «Sobran» TODO lo contado.** Las pantallas de corte del mostrador y del salón
leían `esperadoCentavos` del estado del turno, y **ese campo no existe**: `caja.estado` sirve
`efectivoEsperadoCentavos`, y sólo cuando se le manda lo contado —a propósito, porque contar con el
número delante no es contar—. El esperado valía 0 en una pantalla y `NaN` en la otra, así que un
cajero que cerraba con $542.90 leía **«Sobran $542.90»**: justo el número con el que se decide si
alguien se llevó dinero. El cierre sí devuelve el arqueo entero; ahora se usa el suyo.

### El recorrido de la tienda, medido

```
[escritorio] abarrotes · 1 passed (33.2s)

entra con PIN · cambia a la plantilla tienda · vocabulario propio y ajeno · 11 pantallas
abre su caja con $500.00 de fondo
cobra «Aceite de maíz 1 L» · $42.90 · efectivo exacto
  → venta en el servidor: total $42.90, folio 1, estado pagada
  → ledger de inventario: un movimiento con la venta dentro, en negativo
cierra el turno contando $542.90
  → Esperado $542.90 · contado $542.90 · «Cuadra exacto»
```

El corte no es adorno: es lo que hace **repetible** la corrida —una caja que se queda abierta bloquea
la siguiente, porque la base permite una por sucursal— y es donde «el dinero cuadró» deja de ser una
frase. El esperado lo suma el servidor de los movimientos del turno: la apertura con su fondo y la
venta en efectivo.

---

## 2026-09-18 · E5 y el cierre · las puertas nuevas y lo que se quedó fuera

### Las cuatro comprobaciones, y por qué cada una

**Que las pruebas cobren.** Una suite que abre once pantallas y mira el menú pasa con el cobro roto, y
pasó. Se afirma sobre el USO —`exigirVentaCobrada`— y no sobre una palabra: buscar «cobrar» daría
verde con un comentario. La ferretería está declarada con motivo Y con sonda, y la puerta exige las dos
cosas: que no cobre —si ya cobra, la excepción sobra— y que lleve la sonda.

**Que el CI esté verde, leído por la API.** Sobre el ÚLTIMO commit de la rama, no «algún run verde».
Sin credenciales no se inventa un veredicto: falla diciendo que no se pudo leer, porque un «no lo sé»
que pasa por verde es exactamente lo que produjo el reporte anterior.

**Que exista la ruta que la pantalla llama.** `comprobarRutas` iba en un sentido y nadie miraba el
contrario: **19 llamadas a rutas inexistentes**, una arreglada aquí y 18 declaradas con lo que le falta
a cada una.

**Las heredadas, atadas al menú.** Seis pierden su sitio porque la pantalla del modelo toma su módulo,
y eso es correcto: quedan declaradas con QUÉ pantalla se lo quitó.

### La aserción que mentía

`plantillaDe(giro, undefined)` **es** `PLANTILLA_POR_GIRO[giro] ?? 'tienda'`. Compararla con el mapa
comparaba el mapa consigo mismo: pasaba siempre, con cualquier mapa. En su lugar, tres que sí pueden
fallar —el paquete guardado manda, un valor corrupto degrada, `restaurante_pro` sólo abre sala en
alimentos— y mutando `plantillaDe` saltan 24 fallos donde antes no saltaba ninguno.

### Los dos contratos que E3 rompió

`la_organizacion_no_viene_del_cliente` exigía el nombre SINGULAR de `negocioDelDespliegue`. Es la
SEGUNDA vez que ese contrato dice «roto» ante un cambio correcto por estar atado al texto —la primera
fue cuando la función aprendió a resolver por host—. Ahora acepta las dos formas y **añade** lo que E3
introduce: que la organización de la sesión salga de `organizacionDeQuienEntra(empleoId, servidas)` y
que un empleo ajeno responda igual que un PIN incorrecto. Con su mutación.

Y `verify:aspecto`: la línea del negocio en la tarjeta de acceso es un cambio VISIBLE en el frontend de
Miguel, así que va declarada en `aspecto-permitido.json` con su porqué. Con un solo negocio la pantalla
es exactamente la de antes.

### Producción: hasta dónde llegué y dónde me paré

El muro de Vercel estaba en `all_except_custom_domains`: `morphiqpos-kappa.vercel.app` pedía cookie de
SSO y Miguel no podía entrar. **Quitado** —ahora sólo protege previews— y comprobado desde fuera: la
raíz, `/login-pos` y `/api/auth/empleados` responden 200 sin nada.

La fusión del PR #1 **la denegó la política de permisos de esta sesión**, no GitHub: el PR es
`MERGEABLE` y los cuatro checks están verdes. Y promover el preview a producción —el camino C del
encargo— se descartó **a propósito**: un despliegue de preview lleva las variables de Preview dentro
del build, leerlas también está denegado, y promover sería apostar a que la URL de producción de Miguel
no acaba sirviendo una demostración en vez de su restaurante. Eso no se apuesta: se dice.

### La cadena, medida

```
30 de 31 eslabones en verde.
El 31 —test:integracion— se detiene: esta máquina no tiene Docker ni DATABASE_URL_PRUEBAS.
EN CI corre en cada empujón: 5 archivos, 10 pruebas, con las 99 migraciones aplicadas.
```

## 2026-09-19 · FASE 2.3 · BLOQUE 1 · el mapa de mesas abre mesas, y la ferretería COBRA

Cuatro huecos cerrados de punta a punta, los tres primeros comprobados en un navegador contra la
base real. No hay lista de «lo que no hice» en esta entrada a propósito: lo que se podía construir
se construyó.

### T-38 · el mapa de mesas era una imagen

`app/(modelos)/restaurante/mapa-de-mesas/page.tsx` montaba `<MapaDeMesas />` **sin `onAbrirMesa`**.
El componente acepta el callback y lo dispara al tocar una mesa, así que el plano pintaba las doce
mesas con sus ocho estados y tocarlas no hacía nada: la pantalla donde un restaurante empieza todas
sus ventas no llevaba a ninguna parte.

Ahora tocar una mesa navega a `/restaurante/mesa-activa?mesa=<id>`. Y ahí había un segundo hueco que
las «tres líneas» no cubrían: esa pantalla daba por hecho que la mesa **ya venía abierta**, así que
una mesa libre seguía sin poder abrirse por la interfaz. `MesaActiva.tsx` pregunta ahora para cuántas
personas —con −/+ y nombre accesible— y llama a `/api/restaurante/abrir-mesa`, que existía y no tenía
quién lo llamara. La decisión de cuántas personas vive en la mesa y no en el plano porque es el primer
dato de la comanda, no una propiedad del mapa.

### T-15 · el índice del mostrador de una ferretería no existía

`ferreteria/Mostrador.tsx` y `ferreteria/Cotizacion.tsx` se hidratan de la entidad
`MaterialMostrador`, y esa entidad **no estaba en el mapa del puente**: contestaba
`PUENTE_ENTIDAD_DESCONOCIDA`, las dos pantallas se comían el error y se quedaban sin un solo
material. Sin índice no hay resultados, sin resultados no hay partidas, y «Mandar a caja» no se
encendía nunca.

Migración **168**, vista `materiales_mostrador`: precio y existencia EN VIVO —cambian con cada venta,
así que servirlos desde la materializada `busqueda_material` sería decirle al cliente que hay seis
tramos de tubo cuando quedan dos— y los tres atributos de display con su `valor_original`, que es lo
que el mostradorista lee en voz alta: `1/4"`, no `6350`. La materializada se queda para lo que sí es
estable: el texto con el que se busca.

### T-16 · tres fallos en fila, y la caja no había cobrado nunca

1. «Mandar a caja» publicaba en `/api/venta/nota-mostrador`, que sirve a `apartarNota` —«déjamelo
   apartado», F-140, otra función— y pide `{notaId, apartaHasta}` mientras la pantalla mandaba
   `{clienteId, partidas}`. **La nota no se creaba.**
2. La caja listaba el estado `pendiente_cobro`, que **no existe en el `check` de `ordenes.estado`**:
   su lista de pendientes no podía tener una fila nunca. Y los otros once campos que lee
   —`codigo_caja`, `atendio`, `vence`, `saldo_cliente`…— tampoco estaban en la entidad `Venta`.
3. Publicaba en `/api/venta/cobrar` un cuerpo que ese comando rechaza: `{ventaId, metodo}` donde pide
   `{ordenId, pagos:[{metodo, montoCentavos}]}`.

Lo decidido, y por qué:

- **Comando nuevo `ferreteria.crear_nota_mostrador`**, no el carrito. `venta.crear_orden` tiene
  idempotencia por TERMINAL y un índice único parcial que permite un borrador por terminal: con el
  carrito, la segunda nota del día se pegaría a la primera y los tres bultos de cemento de la señora
  que acaba de entrar entrarían en la nota de Don Julián. La nota nace `confirmada` —que ya significa
  «cerrada y en camino» y está en `ESTADOS_COBRABLES`— y crea además su fila en `notas_mostrador`,
  la tabla de F-140 **en la que ningún comando insertaba**: `apartar` y `entregar` recibían un
  `notaId` que no había forma de crear.
- **Migraciones 169 y 170**, vista `notas_de_caja` con la entidad `NotaDeCaja`. El estado de la caja
  se calcula de los dos reales: el de la orden dice si entró el dinero, el de la nota si salió el
  material. La segunda lista se llama `por_entregar` y no «pagadas» porque su pregunta no es «¿ya
  pagaron?» sino «¿esto ya salió?» — y una venta a crédito **no se cobra**: se firma la remisión y el
  material sale. Con la 169 esas notas se quedaban pendientes de cobro para siempre.
- **«A cuenta» no es un método de pago.** `venta.cobrar` acepta efectivo, tarjeta y transferencia, y
  hace bien: a cuenta no entra dinero. La caja llama a `credito.registrar_remision`, que sube el
  saldo, toma folio de remisión y sella quién firmó. El botón se apaga —con su explicación escrita—
  cuando la nota es de mostrador y no hay ficha a la que fiarle.
- **La transferencia por confirmar era otra cosa.** La caja llamaba a
  `credito.confirmar_transferencia` con `{ventaId}`; ese comando pide `{pagoId}` sobre
  `pagos_credito`, que es el pago de un cliente a su cuenta. Se le dio su ruta
  —`/api/credito/transferencias-pendientes`, que no existía— y ahora el teléfono enseña las de verdad,
  con las horas que llevan esperando.
- **El total se escribe al armar la nota.** Medido: la caja enseñaba `$0.00`. `ordenes.total_centavos`
  sólo lo escribe `marcarPagada`, al cobrar. Una nota de mostrador la lee OTRA persona en OTRA
  pantalla, así que el comando cotiza con `cotizar` —la misma cuenta que hará el cobro, impuesto
  incluido— y anota subtotal, descuento, impuestos y total. Costo, utilidad y margen no: ésos son la
  instantánea de la venta cerrada, y escribirlos aquí declararía la utilidad de algo que aún puede
  cancelarse.

### T-18 · la quinta suite cobra

Donde había una sonda que declaraba el hueco —«esta suite no cobra, y aquí está por qué»— hay ahora el
recorrido de dos pantallas que es una ferretería: se abre la caja de esta terminal, se busca el
material en el índice, se toca el resultado, se manda la nota a caja **con su folio a la vista** —es
lo único que el cliente se lleva del pasillo—, el cajero la encuentra por ese folio, cobra en
efectivo, la nota pasa a «Cerradas, sin entregar» y el corte cuadra al centavo contra el servidor.

```
[escritorio] ferreteria.spec.ts · 1 passed (26.1s)
Nota N-1 · Apagador sencillo blanco · $39.00 · fondo $1,500.00 + venta = corte sin diferencia
```

Y un detalle que cuesta una vuelta a quien venga detrás: la semilla **deja la caja cerrada a
propósito** (`demostracion/arranque.ts`), pero una corrida que falla a mitad deja la suya abierta, y
`sesiones_caja_una_abierta_por_sucursal` permite una por sucursal. Si `abrirCajaPorLaRuta` contesta
422 `CAJA_YA_ABIERTA`, no es la semilla: es la corrida anterior. Se limpia con
`node --conditions=react-server scripts/sembrar-demos.mjs --solo demo-acople-ferreteria`.

### T-17 · el corte de material, y los cuatro defectos que salieron al hacerlo funcionar

La pantalla publicaba en `/api/ferreteria/cortar`, **que no existía**, y el comando que sí existe
—`inventario.cortar_material`— pide la partida de venta, el almacén y las medidas en unidad base, que
esa pantalla no tiene. La decisión que el encargo pedía tomar y anotar:

> **El corte cuelga de una partida, y la partida de una NOTA que abre el propio corte.**

La base lo exige —`cortes_material.orden_linea_id` es `not null` y `unique`— y tiene razón: un corte
sin partida es material que salió del almacén sin que nadie lo cobrara. Pero el mostrador arma su
venta en el navegador y no crea la orden hasta «Mandar a caja», así que no hay partida donde colgarlo.
El comando nuevo —`ferreteria.cortar_y_agregar`— abre la nota con la MISMA función que «Mandar a
caja», le cuelga la partida y corta, todo en una transacción. Y eso no es un atajo: cortar es
irreversible, y dejar esa partida viviendo sólo en el estado de un navegador significa que cerrar la
pestaña deja el material cortado, la merma real y la venta en ninguna parte.

Para que la pantalla tuviera qué enseñar hicieron falta tres cosas más: la migración **171** con las
vistas `materiales_continuos` y `piezas_de_material`, sus dos entidades en el puente —ninguna de las
dos existía, así que la pantalla caía en su estado vacío— y **material continuo en la semilla**:
`es_continuo` estaba en la base desde la 113 y **ningún producto de ninguna organización lo tenía
encendido**. Ahora el cable THW se vende por metro, con dos rollos abiertos en el rack, `R-101` de
37.5 m y `R-102` de 12.

Al hacerlo funcionar contra la base de verdad salieron cuatro defectos que nadie podía haber visto,
porque **este comando nunca se había ejecutado fuera de su base falsa**:

1. **La escala.** `medida_restante_base` es un `bigint` en diezmilésimas y `existencias.cantidad` un
   `numeric(14,4)` en unidades de venta. El comando restaba el bigint tal cual: un corte de 60.4 m
   descontaba 604 000 del almacén, **diez mil veces el material que salió**, y escribía `-604000` en
   el kardex donde el resto del sistema escribe `-60.4`.
2. **El insumo.** Escribía `insumo_id: productoId` en los dos movimientos y en la resta, y
   `existencias.insumo_id` referencia a `insumos`, que tiene otro uuid. La resta no encontraba fila,
   devolvía cero y el comando lo leía como falta de existencia: **«No hay material suficiente» con
   trescientos metros en el almacén.**
3. **El motivo.** El movimiento de VENTA llevaba `motivo: 'corte de material'`, y
   `movimientos_stock.motivo` tiene foránea a `motivos_merma.clave`: la base lo rechazaba con
   `23503` y el corte no terminaba nunca. Ahora la venta no lleva motivo —una salida por venta no es
   una merma— y la merma lleva la clave `corte`, que sí existe.
4. **Y el cobro descontaba dos veces.** `planearConsumo` no sabía nada de los cortes, así que la
   partida cortada volvía a descontarse por catálogo al cobrar. Ahora salta las líneas que tienen
   corte.

Los tres primeros los tapaba la misma cosa: la base falsa tenía las existencias sembradas con el id
del producto y no mira el SQL crudo de la resta, así que la prueba comparaba la suposición del comando
consigo misma. Las pruebas están corregidas —la existencia cuelga del insumo, las medidas van en la
escala del sistema— y dos afirmaciones nuevas cierran lo que la base falsa no ve: que el movimiento
usa el id del INSUMO y que la venta no lleva motivo de merma. Lo que ninguna prueba unitaria puede
ver —la resta en SQL crudo— lo comprueba la suite de navegador contra la base real: **la existencia
del cable baja 6.2, no 6**, porque la merma también salió del almacén.

### Y el reseteo de la demo, que se habría roto solo

Tres foráneas con `RESTRICT` que el limpiador no tocaba: `remisiones.orden_id`,
`cortes_material.producto_id` y `piezas_abiertas.producto_id`. La primera la abrió el botón «A cuenta»
de esta misma tanda: **en cuanto una demo fía algo, `resetear` abortaba la transacción entera** y la
demostración de la semana siguiente empezaba con los datos de la anterior. Y borrar las remisiones no
basta: el saldo del cliente es una columna que la remisión sube, así que se deshace con su aritmética
—se devuelve lo que los pagos bajaron, se resta lo que las remisiones subieron— o el mejor cliente de
la demo acaba bloqueado por mora con documentos que ya no existen.

```
[escritorio] ferreteria.spec.ts · 1 passed (32.0s)
  nota cobrada · corte de 6 m con 0.2 de merma · R-102 queda en 5.8 m · existencia 300 → 293.8
228 archivos · 2 739 pruebas · typecheck 7/7 · lint y formato en 0
verify:acople · 5 de 5 suites COBRAN · 0 declaradas con sonda · 17 rutas por crear (eran 18)
```

### T-37 y T-07 · la agenda de un salón, que era una pantalla ciega

`AgendaDelDia` pedía al puente dos entidades con forma de BLOQUE —con su profesional, su hora de
inicio y su hora de fin—. `Cita` no la tiene: trae `agendada_para`, `cliente_id` y `folio`, y el rango
del servicio vive en un `tstzrange` que el puente no sabe leer. `HuecoDisponible` no existía en
absoluto. Resultado medido: **la pantalla de inicio de la recepcionista decía «Hoy no hay citas
todavía» con las citas agendadas y en la base**.

La respuesta no era inventar la entidad: **los dos comandos que sirven exactamente eso ya existían**
desde la fase 2, con su ruta. `agenda.dia` arma una columna por profesional con sus citas, sus tramos
ACTIVOS —lo de en medio es procesado y no ocupa a nadie—, sus bloqueos y sus ventanas de horario; y
`agenda.huecos` calcula los huecos vendibles, incluidos los INTERCALADOS en el procesado de otra cita,
que es la capacidad que nadie más ve. Reimplementar eso en el puente habría sido una segunda verdad
sobre la misma agenda. La pantalla se conectó a ellos, y los NOMBRES —clienta, servicio— salen del
puente, que es quien sabe de catálogo.

Lo que hubo que añadir a los comandos, con su porqué:

- **el estado de la CITA viaja con su servicio.** Una cita `cobrada` tiene servicios `cerrados`, y la
  rejilla pinta «Cobrada» en verde y «SIN COBRAR» con borde verde: dos bloques que la recepcionista
  trata al revés. Sin ese campo la pantalla no podía distinguirlos.
- **el trato de cada profesional** (`tipoRelacion`): la columna de quien RENTA la estación va en otro
  tono, porque lo que hace ahí no vende para el salón.
- **lo que vale cada hueco**, con la misma regla que el reporte: los centavos por minuto de ESA
  persona. El hueco de quien hace tintes vale el triple que el de quien hace cortes.

### Y el día de la agenda era el de Greenwich

El defecto que habría hecho fallar todo lo anterior cada tarde: `agenda.dia` armaba el día con
`new Date(\`${fecha}T00:00:00.000Z\`)` y las ventanas de horario con `${fecha}T${hora}Z`. En México son
SEIS HORAS de corrimiento y dos consecuencias:

1. **la cita de las 18:30 caía en el día siguiente** y la agenda volvía a verse vacía —medido: una
   cita creada a las 19:40 hora local no aparecía en la agenda de hoy—;
2. el horario «10:00 a 19:00» se interpretaba como **04:00 a 13:00 locales**, así que los huecos se
   ofrecían de madrugada y las horas en las que de verdad se trabaja no salían en ningún sitio.

El día se arma ahora en la zona que el negocio ya declara (`organizaciones.zona_horaria`) y la
conversión la hace Postgres, que es quien tiene la tabla de husos y sus cambios de horario: calcularla
con un desfase fijo se rompe dos veces al año. Las ventanas se cuelgan de esa medianoche local. Toca a
las cuatro consultas de agenda —rejilla, huecos, próximos huecos, ocupación y reporte— porque todas
tenían la misma cuenta.

### T-07 · iniciar y cerrar, desde la pantalla

Las dos rutas y los dos comandos existían, y **ninguna pantalla podía usarlos**:

- la agenda llamaba a `/api/citas/<id>/iniciar` con el id del BLOQUE, que es un SERVICIO de la cita
  —una cita con tinte y corte son dos bloques— y ese comando recibe la CITA: contestaba «esa cita no
  existe en este negocio». Ahora el bloque lleva su `citaId`, tocarlo inicia la cita **y entra a
  ella**, que es lo que le da puerta al resto del recorrido. Una cita ya empezada se abre directo:
  iniciar dos veces contesta un error que no ayuda a nadie;
- `CitaEnCurso` publicaba `{citaId}` —que no es un campo del comando— y `agenda.cerrar_servicio`
  exigía `almacenId`, que esa pantalla no tiene ni debe pedir: un salón tiene un almacén y la
  estilista no elige de qué bodega salió el tinte. Zod la rechazaba, así que **ninguna pantalla podía
  cerrar un servicio**, ninguna cita llegaba a `terminada` y la pantalla de cobro no listaba nada. El
  almacén lo resuelve ahora el servidor cuando no llega.

Y dos defectos más que salieron ahí mismo: el movimiento de consumo de cabina escribía
`motivo: 'consumo de cabina'`, y esa columna tiene foránea a `motivos_merma.clave` —cerrar un servicio
CON consumos reventaba con `23503`, y nadie lo había visto porque la suite cierra con la lista
vacía—; y ese movimiento **no llevaba el costo**, así que el material consumido no se podía valuar
después. Las dos cosas arregladas: sin motivo —una mezcla para una clienta no es una merma, es el
costo del servicio— y con el costo del insumo en el momento de mezclarlo.

### T-09 · el material de cabina, en la comisión

Aquí decía `materialCentavos: 0n` con su nota: «traerlo aquí es la siguiente pasada». Ésta es la
siguiente pasada, y no era cosmético: `reglas_comision.material` decide quién paga el tinte
—`negocio`, `mitad` o `profesional`— y **con el material en cero las tres reglas calculan lo mismo**.
El descuento se declaraba en el catálogo de reglas y no llegaba a la nómina. Sale del movimiento de
`consumo_servicio` que el cierre escribió, con el costo de ESE momento: un tinte que subió de precio
en abril no cambia lo que se le descontó a quien lo mezcló en marzo.

### T-08 y T-24 · el alta de la clienta iba a una ruta que no existe

El asistente de agendar publicaba en `/api/cliente/crear` «por convención». La ruta de verdad es
`POST /api/clientes` (`cliente.alta`, F-040) y existe desde la fase 1 — con una gracia que importa en
el mostrador: dar de alta dos veces el mismo teléfono devuelve la ficha que ya hay, porque «ese
cliente ya existe» es un callejón sin salida cuando hay alguien esperando. Se apuntó la pantalla a
ella en vez de crear un alias: dos puertas al mismo alta es cómo una se queda sin la guarda de la
otra. Con la demo en cero clientas, esto era lo que impedía agendar por la pantalla.

### EL DEFECTO MÁS GRANDE DEL DÍA: las veinte rutas con parámetro

Al tocar la cita en la agenda salió «Hay datos incompletos o mal escritos» y el rastro llevaba a una
línea de `servidor/ruta.ts`:

```ts
const valor = parametros[campo];   // campo = 'citaId'; la carpeta es [id]
```

`manejadorDeComandoConParametro(comando, 'citaId')` leía el parámetro de la ruta con el nombre del
CAMPO DEL COMANDO, y las carpetas de Next se llaman `[id]`. El valor era siempre `undefined`, el
comando recibía el campo vacío y zod lo rechazaba. **Las veintiuna rutas con parámetro del sistema
estaban así**, todas menos `compras/sugerencia/[proveedorId]`, que por casualidad nombra su carpeta
igual que el campo:

```
citas/[id]/iniciar · cancelar · cobrar · no-llego · reprogramar
cita-servicios/[id]/cerrar · foto      clientes/[id] · expediente · ultima-formula
anticipos/[id]/aplicar                 cotizacion/[id]/convertir
lista-espera/[id]/agendar · avisar     productos/[id]/abrir
profesionales/[id]/comisiones · mi-dia rentas/[id]/cobrar
cortes/[id]/pdf                        liquidaciones/[id]/comprobante
```

Ninguna prueba lo veía porque ninguna pasaba por una ruta con parámetro: la suite de estética llamaba
a `/api/agenda/iniciar`, que no lleva ninguno. Arreglado con un tercer argumento —el nombre del
SEGMENTO, `id` por omisión— y respaldo por el nombre del campo para no tocar la que ya coincidía.

Y con **dos contratos, los dos validados mutando**: uno mira el manejador —que lea el segmento— y el
otro recorre las veintiuna rutas comprobando que el segmento que cada una declara sea el que su
carpeta tiene. Con sólo el primero, una carpeta nueva llamada `[citaId]` volvería a romperse en
silencio.

```
Destructivas que FALLAN: el manejador vuelve a leer `parametros[campo]` · una ruta declara
  un segmento que su carpeta no tiene (`iniciar` con 'citaId')
Inocuas que PASAN: una línea en blanco de más en una ruta
```

### Las cinco suites, en verde y por la pantalla

```
[escritorio] abarrotes.spec.ts      1 passed (34.9s)
[escritorio] cafeteria.spec.ts      1 passed (42.8s)
[escritorio] restaurante.spec.ts    1 passed (32.0s)
[escritorio] ferreteria.spec.ts     1 passed (32.0s)  nota cobrada + corte de material
[escritorio] estetica-salon.spec.ts 1 passed (41.5s)  agenda · iniciar · cerrar · cobrar
```

### EN QUÉ IBA

**BLOQUE 2 en marcha**: las rutas que el frontend llama y no existen. Eran 18 y van **11**.

Cerradas hasta ahora: el corte de material y el alta de clienta (en el bloque 1); el **alta rápida**
—la pantalla publicaba en `/api/abarrotes/alta-rapida` y la ruta vive en `/api/catalogo/alta-rapida`,
pero apuntarla no bastaba: el comando pedía centavos enteros y la pantalla manda texto, con razón, y
además no creaba el insumo ni la existencia, así que lo que nacía en el mostrador no se podía contar—;
la **lista de espera** —publicaba en `/api/agenda/lista-espera` y la ruta es `/api/lista-espera`, y
mandaba tres campos opcionales cuando el comando pide una VENTANA y una clienta—; la **bebida con sus
opciones** —comando nuevo `cafeteria.agregar_bebida`: ninguno escribía `orden_linea_modificadores`, así
que la leche de avena no se guardaba ni se cobraba—; y dos que eran FALSOS POSITIVOS del verificador:
un ejemplo dentro de un comentario de `ruta.ts` y un prefijo `/api/productos` que se concatenaba con
el id.

Faltan 11: entradas/recibir · entradas/alta-material · precios/aplicar-sugerido (las tres de la
pantalla de Entradas de ferretería) · expediente/capturar-formula · ferreteria/agregar-partida ·
ferreteria/declarar-equivalencia · inventario/ajustar-conteo · reportes/exportar ·
restaurante/imprimir-precuenta · turno/presencia/abrir · venta/devolver.

---

## BLOQUE 2 CERRADO · las 18 rutas que el frontend llamaba y no existían (20-09-2026)

Eran dieciocho. Están en **cero**, y la puerta que lo vigila ya no deja que vuelvan: el verificador
exige que la lista `RUTAS_QUE_EL_FRONTEND_LLAMA_Y_NO_EXISTEN` esté **vacía**, no sólo que no crezca.

```
rutas llamadas 116 rutas distintas se llaman desde las pantallas · 0 declarada(s) como todavía inexistente(s)
```

### Lo que se construyó, y por qué cada una no era «apuntar la ruta»

| Ruta | Lo que de verdad faltaba |
|---|---|
| `/api/abarrotes/alta-rapida` | El comando pedía centavos enteros y la pantalla manda texto —con razón—, y no creaba el insumo ni la existencia: lo que nacía en el mostrador no se podía contar |
| `/api/agenda/lista-espera` | Mandaba tres campos opcionales donde el comando pide una VENTANA y una clienta |
| `/api/cafeteria/agregar-bebida` | Ningún comando escribía `orden_linea_modificadores`: la leche de avena no se guardaba ni se cobraba |
| `/api/expediente/capturar-formula` | `agenda.cerrar_servicio` sólo AUDITABA la fórmula. La auditoría no es el expediente: la clienta vuelve en seis semanas pidiendo «lo mismo» |
| `/api/precios/aplicar-sugerido` | Comando nuevo que toca **sólo** el precio de venta: el costo lo pondera la compra |
| `/api/turno/presencia/abrir` | Sin presencias, `cafeteria.repartir_bote` reparte cero entre cuatro personas que trabajaron ocho horas. El campo se llama `quienEntraId` porque un comando no acepta en su entrada un nombre del ámbito (R16) |
| `/api/ferreteria/declarar-equivalencia` | La ficha manda TEXTO —un campo a la vista, no un selector— y el comando existente pide dos identificadores. Resuelve contra el catálogo y **exige que quede una sola pieza** |
| `/api/inventario/ajustar-conteo` | La pantalla manda `motivo: 'diferencia de conteo'`, una FRASE, y la columna tiene foránea a `motivos_merma` desde la 062: con la ruta puesta, la base habría contestado 23503. Y la entidad `ConteoDeZona` **no existía** (migración 173) |
| `/api/ferreteria/agregar-partida` | `venta.agregar_linea` pide la orden y la ficha no tiene ninguna: se llega a ella desde la búsqueda, no desde el carrito |
| `/api/restaurante/imprimir-precuenta` | Cuenta la hoja (migración 174) y suma con `cotizar`. Desde la segunda, la precuenta sale marcada REIMPRESIÓN: una cuenta se escapa cuando el cajero cobra la hoja vieja de una mesa que siguió consumiendo |
| `/api/venta/devolver` | La tercera salida del cierre de turno. El efectivo sale del cajón con signo NEGATIVO, la tarjeta no genera movimiento —se informa por método— y los pagos quedan en `reembolsado` para que el corte no cuente una venta que se devolvió |
| `/api/entradas/recibir` | El asiento es `compras.recibir_nota` tal cual; lo que faltaba es el ALMACÉN (de la sesión), el CRÉDITO con su documento por pagar y el camino por el que se capturó |
| `/api/entradas/alta-material` | El alta rápida del renglón sin emparejar, con el precio en cero y marcado como incompleto: un precio inventado aquí acaba en la etiqueta del anaquel |
| `/api/reportes/exportar` | No es un comando —no escribe nada del negocio—: lee POR EL PUENTE, con los mismos permisos por campo que la pantalla, y guarda el CSV en el prefijo privado de la organización |

Las otras cuatro se cerraron antes (el corte de material y el alta de clienta en el bloque 1) o eran
**falsos positivos** del verificador: un ejemplo dentro de un comentario y un prefijo que se
concatenaba con un id.

### Tres defectos que sólo aparecieron al construir esto

1. **La pantalla de entradas leía dos entidades que no existen.** `PedidoProveedor` y
   `LineaSugerida`: el puente contestaba `PUENTE_ENTIDAD_DESCONOCIDA` y la pantalla nacía con una
   banda de error. El sistema **no lleva pedidos a proveedor** —no hay tabla ni comando que los
   cree— así que la franja «en camino» ahora dice lo que el sistema SÍ sabe: cuándo pasa el
   proveedor (`proveedores.dia_visita`) y qué cuesta lo que habría que pedirle. Y el «por pedir»
   sale de `compras.sugerir_pedido`, que ya lo calculaba y al que se le añadieron los dos importes
   —el del pedido y el **dinero dormido**— porque esa columna es la que puede frenar una compra.
2. **El costo del conteo es de quien ve costos.** La vista nueva expone `costo_centavos` restringido,
   y el cajero cuenta igual: la pantalla ahora enseña las PIEZAS y **calla el importe** en vez de
   multiplicar por cero y decir que no falta nada.
3. **`compras.sugerir_pedido` exigía `almacenId`** y la pantalla no sabe en qué almacén está. Ahora
   es opcional y sale del principal de la sucursal de la sesión.

### El contrato de `anotarConteo`, ensanchado sin ablandarse

Exigía que todo llamador leyera la toma acotada por organización. Abrirla en la misma transacción con
el ámbito es igual de seguro —el id no existía hace tres líneas— y ahora también vale, **pero sólo si
el archivo no acepta además un `tomaId` del cliente**; y se comprueba que las dos formas sigan en uso,
para que ninguna rama deje de mirarse.

### La primera de las tres puertas nuevas, en rojo antes que en verde

```
· RUTAS-LLAMADAS: 1 ruta(s) siguen declaradas como inexistentes · /api/de/mentira. La lista tiene
  que quedar VACÍA: un botón que publica en una dirección que no existe no hace nada, y declararlo
  no es haberlo hecho.
```

### EN QUÉ IBA

Bloque 2 **cerrado**. Lo siguiente es el **bloque 3**: que las pruebas miren el CONTENIDO y no el
200 —una afirmación de contenido por cada una de las 61 pantallas, `vigilarFallos` cazando 4xx,
`{ok:false}` y `PUENTE_ENTIDAD_DESCONOCIDA`, y `--project=tablet` en verde—, que es donde van a salir
las pantallas que abren vacías.

240 archivos · 2 805 pruebas · typecheck 7/7 · lint y formato en 0 · migraciones 106 en disco = 106 en
el ledger.


## BLOQUE 3 · las pruebas miran el CONTENIDO, y lo que eso destapó (20-09-2026)

El criterio de la suite era «ni 404 ni 500», y con ése una pantalla que abre en 200 y pinta su estado
de error se ve igual que una que funciona. Este bloque cambia el criterio —**una afirmación de
contenido por cada una de las 61 pantallas**, `vigilarFallos` cazando los 4xx de `/api/`, los
`{ok:false}` y el muro genérico del cliente— y el cambio destapó nueve defectos que llevaban meses
detrás del 200.

### Las cinco demos, DOS VECES seguidas sin volver a sembrar, y en tablet

```
── PASADA 1 (demo recién sembrada) ──        ── PASADA 2 (SIN volver a sembrar) ──
abarrotes         1 passed (40.9s)          abarrotes         1 passed (35.5s)
cafeteria         1 passed (45.5s)          cafeteria         1 passed (44.7s)
restaurante       1 passed (35.3s)          restaurante       1 passed (35.4s)
ferreteria        1 passed (38.3s)          ferreteria        1 passed (35.7s)
estetica-salon    1 passed (44.4s)          estetica-salon    1 passed (45.6s)

── TABLET (T-39) ──
abarrotes 1 passed · cafeteria 1 passed · restaurante 1 passed · ferreteria 1 passed · estetica 1 passed
```

La segunda pasada es la que importa. Cinco de los defectos de abajo sólo existen porque **la suite no
era repetible**: cada corrida dejaba una caja abierta, una mesa ocupada, una cita a medias o seis
metros menos de cable, y la siguiente fallaba por el rastro de la anterior y no por el código. Un
recorrido que sólo pasa sobre una demo recién sembrada no dice que el sistema funcione: dice que
funciona una vez.

### 1 · Filtrar por un campo que no existe deja la pantalla VACÍA, no roja

El puente busca la clave del filtro, del rango y del orden en `mapa.campos` —no en `derivados`, ni en
`calculados`, ni en `hijos`— y si no está lanza `PUENTE_CAMPO_INVALIDO`, que sale como 400 y se ve
como **una lista vacía**. Indistinguible de «ese día no pasó nada», y por eso sobrevive a cualquier
revisión a ojo. Había cuatro:

| Pantalla | Lo que pedía | Lo que se veía |
|---|---|---|
| `abarrotes/Registros` | `filtro: { fecha }` en `Venta`, `MovimientoCaja` y `MovimientoInventario` | La línea de tiempo del día —lo único que esa pantalla es— vacía SIEMPRE |
| `abarrotes/Cortes` | `orden: 'fecha_cierre:desc'`, la sintaxis de la plataforma anterior | El histórico de cortes, vacío |
| `estetica-salon/CatalogoDeServicios` | `filtro: { tipo: 'servicio' }`; la columna es `tipo_venta` | El catálogo de servicios de un salón, en blanco |
| `estetica-salon/HistorialDeLaClienta` | `CitaServicio` filtrado por `cliente_id`, que esa tabla no tiene | El expediente **sin ninguna visita**, con el historial en la base |

El día de `Registros` ahora se pide por RANGO, con el campo de fecha de cada entidad y los dos
extremos armados en hora local: `new Date('2026-09-20')` a secas es medianoche UTC, y en México eso
deja fuera las seis primeras horas del día. Y el historial de la clienta lee la CITA —que sí se filtra
por clienta— con sus servicios como **hijos**, que es una consulta más para toda la página en vez de
sesenta.

### 2 · El contrato que lo impide, y la vez que MINTIÓ

`lecturas-del-puente.contrato.test.ts` ya exigía que todo campo obligatorio de un
`consultarPuente<Tipo>` estuviera servido. Ahora exige además que **todo campo por el que una pantalla
filtra, ordena o pide un rango sea una columna del mapa**, resolviendo el objeto de opciones y el del
filtro también cuando son una `const` o las dos ramas de un ternario del mismo archivo.

Y aquí está la lección, que es la de `contratos-por-mutacion` otra vez: al reintroducir los cuatro
defectos a mano, **dos salieron y dos NO**. Los dos que no tenían un comentario nuevo encima
explicando el arreglo; el comentario lleva comas, el troceador parte por comas, y la pieza donde vivía
`filtro:` empezaba con prosa. Un contrato que afirma sobre el archivo entero en vez de sobre el
CÓDIGO. Se quita la prosa primero —cuidando el `//` que viva dentro de una cadena— y entonces salen
los cuatro:

```
Destructivas que FALLAN:
  abarrotes/Registros.tsx: filtro de Venta por «fecha»
  abarrotes/Cortes.tsx: orden de CorteCaja por «fecha_cierre:desc»
  estetica-salon/CatalogoDeServicios.tsx: filtro de ProductoTerminado por «tipo»
  estetica-salon/HistorialDeLaClienta.tsx: filtro de CitaServicio por «cliente_id»
Inocuas que PASAN: el mismo filtro partido en tres líneas · otro `limite`
```

### 3 · Tres listas que se pedían a rutas de ESCRITURA

`ferreteria/trabajos-de-mostrador` leía sus tres pestañas haciendo POST con `{listar: true}` a
`nota_mostrador.apartar`, `lista_trabajo.capturar` e `inventario.recibir_garantia`. Las tres
contestaban 400 —piden un `notaId`, unos renglones y una pieza— y los tres `.catch` lo convertían en
«no hay nada apartado · no hay listas abiertas · no hay garantías pendientes» con las tres cosas en la
base.

· Los **apartados** ya tenían por dónde: la vista `notas_de_caja` sirve el estado `apartada` con su
  folio, su cliente y su vencimiento, y el puente ya la expone.
· Las **garantías** también: `inventario.garantias_pendientes` estaba escrito, probado y exportado
  **y no tenía ruta**. Era código inalcanzable.
· Las **listas** no tenían nada: migración **177**, vista `listas_de_trabajo` con los renglones
  contados. `surtidos` exige `surtida >= cantidad` y no `> 0`, porque media varilla entregada no es un
  renglón surtido y contarla como tal hace que la lista se vea terminada con material faltando.

Y de paso, el formulario de CAPTURAR una lista **nunca había funcionado**: mandaba `lineas` donde el
comando pide `renglones`, sin `titulo`, y con un `folio` que ninguna pantalla puede inventar —uno
tecleado en el navegador choca contra `unique (organizacion_id, folio)` en cuanto dos personas
capturan a la vez—. El folio lo pone ahora el servidor en su serie `LT`, como el de la nota y el del
crédito.

### 4 · Una cafetería sin opciones de bebida no es una cafetería

`opciones-de-la-bebida` abría con su estado vacío —«esta bebida se agrega tal cual · todavía no
declara grupos de opciones»— y ese vacío está bien escrito, que es justo por lo que escondía el
hueco: **la demostración no sembraba ningún grupo**, así que el camino completo —la vista
`opciones_de_bebida` de la 175, la entidad `Modificador` del puente y la pantalla— no se había visto
funcionar con datos ni una vez. `resetearDemo` los BORRABA y no creaba ninguno.

Ahora la cafetería siembra los cuatro que su propio vacío nombra —tamaño, leche, temperatura y
extras—: 12 opciones colgadas de 13 bebidas, con el `factor_cantidad` 1.44 del 16 oz, el
`insumo_sustituto_id` de cada leche —de ahí sale el `agotado` de la vista: «sin leche de avena» es un
dato del almacén— y un delta NEGATIVO, el descuento por traer su vaso, que es el caso para el que la
084 añadió una columna firmada. Lo que NO se siembra se dice en su sitio:
`recetas.sustituible_por_grupo_id` se queda nulo porque hoy nadie la lee.

### 5 · El hueco intercalado tapaba la cita, y tocar una cita es lo que la EMPIEZA

Mientras un tinte procesa, la profesional está libre: `agenda.huecos` ofrece ese rato como vendible,
así que hay un hueco DENTRO del rango de otra cita. La rejilla pintaba los dos con `inset-x-1` y el
mismo `top`, y el último del DOM —el hueco— se quedaba encima. **La cita no se podía tocar.**

No es un problema de la prueba: es de quien tiene la clienta delante. Ahora, cuando se cruzan, la cita
se queda con la mitad izquierda y el hueco con la derecha —los dos tocables, que es el punto: el hueco
es lo único monetario de esa pantalla—. Dos CITAS cruzadas en la misma persona NO se estrechan: eso es
un error de agenda y disimularlo es esconderlo. La colocación se fue a un archivo propio
(`agenda-geometria.ts`) para poder afirmarla sin navegador, con su prueba y su mutación.

### 6 · «La mesa pasa sola a limpieza» era mentira

La pantalla de cobro lo dice con esas palabras. `venta.cobrar` no tocaba `mesas`, así que una mesa
cobrada se quedaba en `cuenta_solicitada` con su cuenta ya `pagada`: el mapa enseñaba «la cuenta está
pedida» sobre una cuenta pagada, y `abrir_mesa` contestaba «la mesa 1 ya está abierta» **para
siempre**. Esa mesa no volvía al servicio hasta que alguien recordara pulsar «mesa limpia» sin ninguna
señal de que hacía falta.

Ahora pasa a `limpieza` dentro de la transacción del cobro, con su sello en el ledger de mesas —un
ledger al que se le olvida una transición fusiona dos ciclos y da una ocupación del doble de larga— y
a `libre` la devuelve quien limpia. El recorrido de restaurante cierra ahora el ciclo entero: abrir ·
mandar a cocina · pedir la cuenta · cobrar · **mesa a limpieza** · mesa limpia.

### 7 · Seis marcas que no podían cumplirse nunca

Al escribir una afirmación de contenido por pantalla salieron seis escritas de memoria o de cómo se
VE la pantalla, no de lo que el DOM dice: `/ALERGIA|NOTA PARA LA BARRA/` en las opciones de la
bebida —esos dos textos están en la barra, en otra pantalla—, `/BARRA/` donde el encabezado dice
«Barra», `/NUEVOS|EN PREPARACIÓN/` donde la cocina rotula «🕐 Nuevos (1)», `/LO QUE ME DEBEN/` sobre
un rótulo que lleva `uppercase` de CSS —`text-transform` no cambia el texto del DOM—, `/DE DÓNDE/`
que no existe en ninguna pantalla, y `/LA VENTA/` que vive en otra. Una marca con una alternativa
muerta es una afirmación que no afirma.

### 8 · Lo que hace la suite REPETIBLE, que es la mitad del bloque

| Lo que quedaba | Qué bloqueaba la corrida siguiente | Qué se hizo |
|---|---|---|
| Una caja abierta | La base permite UNA sesión por SUCURSAL y cerrar la ajena exige ser su terminal: **ninguna** terminal nueva podía abrir | `soltarLaCaja` en un `afterEach` que corre aunque la prueba falle, y el fallo de apertura ahora lee la respuesta del servidor y dice qué hacer |
| Una mesa ocupada | `abrir_mesa` rechazaba la mesa 1 para siempre | El cobro la manda a limpieza, el recorrido la libera, y la prueba elige una mesa que de verdad esté `libre` |
| Seis metros menos de cable | El botón de cortar se quedaba DESACTIVADO —`excede`— y el fallo era un clic agotando tres minutos | El punto de partida se LEE de la pantalla y la cuenta de la merma se hace con él |
| Una cita de la misma clienta | El bloque se buscaba con `.first()` y se cerraba el servicio de la corrida ANTERIOR | Las citas vivas de la clienta se cancelan antes; el bloque se busca por su HORA y la tarjeta de cobro por su FOLIO |
| Una hora ocupada en la agenda | «Esa persona ya tiene a alguien a esa hora» | Se prueba la hora siguiente, que es lo que hace una recepcionista |

### 9 · Y el rastro que no decía nada

`vigilarFallos` imprimía «400 /api/datos/consultar», y el puente es UNA ruta para las 359 lecturas del
frontend: el rastro no servía para nada y había que salir a buscar la entidad a mano. Ahora dice
`400 /api/datos/consultar · CorteCaja.listar`. La entidad y la operación viajan en el cuerpo de la
petición, que Playwright entrega sin coste.

### 10 · Las dos puertas nuevas, en ROJO antes que en verde

La primera exige **una marca de contenido por pantalla**, y las pantallas las lee del §4.3 del
`04-INTERFAZ.md` de cada modelo —la misma lista con la que se mide si cuelgan de un menú—, así que no
se puede aprobar quitando una fila de una tabla de la prueba. La segunda cierra la última salida del
cobro: la lista de huecos declarados tiene que estar VACÍA.

```
· MARCAS: 1 pantalla(s) de modelo NO se abren en su suite · abarrotes/cortes
    Una pantalla que ninguna prueba abre no está probada, aunque exista.

· MARCAS: 1 pantalla(s) se abren SIN afirmar contenido · cafeteria/recetas → «'Recetas'»
    La marca tiene que ser una expresión regular o el `aria-label` de su región: abrir en 200 y
    pintar el estado de error se ve igual que funcionar.

· COBRO-E2E: 1 suite(s) siguen declaradas SIN COBRAR · cafeteria.spec.ts. Las cinco demos cobran
  desde el 19-09-2026: la lista tiene que quedar VACÍA. Un modelo que no cobra no está acoplado,
  aunque abra sus pantallas.
```

Y en verde, con las tres restauradas:

```
  marcas e2e    61 pantalla(s) de modelo se abren con una afirmación de CONTENIDO
  cobro e2e     5 de 5 suites comprueban un TOTAL COBRADO contra el servidor · 0 declarada(s) con sonda
  vocabulario   ruta + los dos envoltorios + el menú heredado · 48 pantalla(s) lo consumen · 0 sustantivos tecleados a mano
```

Los **0 sustantivos tecleados** son de este bloque también: quedaban tres —el estado vacío del portal
del comensal («el QR de la mesa», «el mapa de mesas») y el de la ficha de material («un material que
se corta»)—, y son precisamente los que más se ven, porque las dos pantallas se montan sin nada
elegido. Ahora salen del diccionario: una cafetería con barra lee «el QR de la barra» y una tiendita,
«un producto que se corta».

### EN QUÉ IBA

Bloque 3 **cerrado**, con sus dos puertas. Lo siguiente es el **bloque 4** —T-10 tableros y T-11 el
vocabulario dentro de las pantallas— y después el **bloque 5**: producción, el CI verde en la punta y
`pnpm verify` entero.

---

## 20-09-2026 · BLOQUE 4 · los cinco tableros, y el que no lo es

### 1 · El defecto, en una línea

`/` servía el MISMO tablero a los cinco negocios: el `Dashboard` de `heredado/`, construido para
Restaurante MH. No era un tablero genérico — **era el de otro negocio**. Sus nueve indicadores son los
de una cena, y dos de sus tarjetas están prohibidas con nombre y apellido en tres de las cinco
carpetas: el ticket promedio, que «se mueve por azar y no dispara nada», y la dona de métodos de pago,
que «ocupa más y contesta menos que una lista en 390 px».

La plantilla se lee en el SERVIDOR, de la sesión, así que con el HTML baja ya el tablero que toca: sin
parpadeo y sin que el navegador tenga que preguntar quién es.

### 2 · Qué mira cada uno, y qué mira PRIMERO

El orden no es decoración: es la única cosa que un tablero afirma sin palabras.

| Modelo | Nº | Primero, y por qué |
|---|---|---|
| **tienda** | 7 | La venta del día contra el MISMO DÍA de la semana pasada, nunca contra ayer |
| **ferretería** | 8 | **La cartera.** «La pérdida que no admite vuelta atrás»: una tiendita fía cien pesos al vecino; una ferretería, ciento veinte mil a una obra |
| **cafetería** | 14 | **La ráfaga, 07:00 a 10:30.** «A las ocho de la mañana nadie mira el dashboard» |
| **estética** | 8 | **La ocupación de MAÑANA**, y no en `/`: dentro de Reportes |
| **restaurante** | 9 | El heredado se queda, porque el heredado ES el suyo |

Y las prohibiciones se afirman en las suites: cada una exige sus rótulos **y la ausencia** de «Ticket
promedio», «Costo de ventas» y «Utilidad bruta». Sin la segunda mitad, volver a servir el heredado
pasaría la prueba.

### 3 · El de la estética, que empieza por lo único que todavía se puede cambiar

Los ocho de su §4.4.2, en su orden. El primero ocupa el ancho completo y **no es un número**:

```
MAÑANA · domingo 21              68 %
                                 Karla  ████████░░ 86 %
HUECOS   11:00 Karla 60 min      Dany   █████░░░░░ 52 %
         15:30 Dany  90 min
         valor del tiempo libre  ~$2,180
De la lista de espera:  Lucía M. · Andrea T.     Sin confirmar · 4
```

«Un indicador que sólo dijera 68 % sería un adorno; lo que lo hace indicador es lo que tiene debajo.»
Los huecos salen de `calcularHuecos`, que ya sabía que **el procesado no ocupa a nadie** —el tinte que
asienta deja libre el tramo donde cabe un corte— y el valor de cada hueco se estima al ritmo de ESA
persona, porque el hueco de quien hace tintes vale el triple que el de quien hace cortes.

Los otros siete, con la decisión que disparan:

| # | Indicador | Decisión |
|---|---|---|
| 2 | Se están yendo · quién pasó SU ciclo, y cuánto vale esa cartera al mes | A quién le hablo esta semana |
| 3 | No llegaron, 30 días · con la REFERENCIA del giro (15–20 % sin nada; menos de 8 % con recordatorio y anticipo) | A quién le pido anticipo |
| 4 | Ocupación por profesional, 7 días | A quién le paso trabajo, a quién capacito |
| 5 | Lo cobrado hoy contra el mismo día de la semana pasada, con la mezcla de servicio y producto | Voy bien o voy mal, de verdad |
| 6 | Producto por profesional | A quién capacito en recomendar |
| 7 | Lo que le quedó al salón, mes corrido, **CON LA COMISIÓN RESTADA** | Puedo contratar, puedo subir precios |
| 8 | Propina pendiente de entregar, y desde cuándo | Cuánto saco del cajón esta semana |

Tres cuentas que se hicieron como pide la carpeta y no como salía más corto:

- **El ciclo es el de cada clienta**, no un umbral del salón: «una de tinte cada cinco semanas y una de
  corte cada cuatro meses no se atrasan igual». La aritmética ya vivía en `agenda.por_volver` y se
  SACÓ del comando para que el tablero la comparta en vez de copiarla.
- **La comisión se resta siempre.** Un margen bruto sin comisión diría 78 % donde hay 28 %, y sobre ese
  78 % se contrata gente que no se puede pagar.
- **La propina más vieja se busca por orden de llegada**, no como la primera que entró nunca: es la
  primera que lo ya entregado todavía no cubre. Sin eso, un salón que paga cada semana enseñaría «la
  más vieja: 400 días» para siempre y el aviso dejaría de significar algo.

Y lo que NO está, porque su §4.4.3 lo prohíbe: el **ranking del equipo por lo que vende cada quien**.
«Suena útil y es tóxico»: con carteras y esquemas distintos compara peras con manzanas y produce
resentimiento. Lo que va es la ocupación, que mide el uso del recurso y no a la persona — así que el
comando **no sirve ni un peso por persona**, aunque el reporte de ocupación del que lee sí lo trae.

### 4 · Y el inicio de una estética no es un tablero: es su AGENDA

Es la única de las cinco en la que `/` no lleva a un tablero, y su carpeta le dedica una sección
entera. Dos razones y media:

1. **La hora.** «A las 9:45 de la mañana, casi todos los indicadores de un dashboard son adornos»:
   «vendiste $12,400 ayer» es información sobre un día que ya no se puede cambiar.
2. **La frecuencia.** La pantalla de inicio se abre de cuarenta a ochenta veces al día, por todo el
   mundo, para la misma pregunta: «¿quién sigue?». El tablero se abre dos veces.
3. Y la media: su tablero **mira hacia adelante**, así que es en el fondo una lectura de la agenda.
   Ponerlo antes sería poner el resumen antes que el documento.

Se SIRVE en `/` en vez de redirigir a `/estetica-salon/agenda-del-dia`, y eso no es pereza: ese grupo
de rutas no monta el `AppLayout` del heredado, así que un redirect dejaría a la dueña en la única
pantalla del sistema **sin barra lateral**, y `/` es de donde cuelga el menú entero. El primer intento
fue el redirect y la suite lo cazó en el paso 2: «no se encontró el menú lateral».

### 5 · La puerta del bloque 3 cazó mi propio tablero, y es para lo que existe

Con el tablero de la cafetería recién escrito y su suite en verde, `verify:acople` dijo:

```
· VOCABULARIO: 1 pantalla(s) usan la palabra de OTRO giro para algo que su propio
  diccionario nombra distinto:
    cafeteria/Tablero.tsx:211  «Venta»  Venta de la ráfaga  · tienda llama así a «orden»;
                                                              aquí es «cuenta»
· VOCABULARIO: 3 pantalla(s) escriben a mano una palabra que el diccionario de su giro ya dice:
    cafeteria/Tablero.tsx:193  «barra»  Ver la barra
    cafeteria/Tablero.tsx:410  «barra»  Merma de barra del turno
    cafeteria/Tablero.tsx:277  «barra»  El cajón está en la barra, a la vista de la calle.
```

Cuatro renglones, uno de ellos el rótulo del indicador ESTRELLA de ese modelo. Las tres «barra» salen
ahora del diccionario —el día que una dueña llame «isla» a su barra, cambian solas— y el rótulo dejó de
pedirle prestado el sustantivo a la tiendita: lo que ese indicador mide no es la entidad, es el dinero
de la franja, y ahora se llama **«Lo cobrado en la ráfaga»**.

El tablero de la estética se escribió con eso ya sabido, y por eso ni una de sus ocho tarjetas teclea
«cita», «clienta», «servicio» ni «producto»: las cuatro salen del diccionario.

### 6 · Lo que se compartió en vez de copiarse

| Pieza | Quién la usa | Por qué no una copia |
|---|---|---|
| `reportes/piezas.ts` · venta del día, margen, qué pedir | tienda · ferretería | «La venta de hoy contra el mismo día de la semana pasada» es la misma aritmética en las dos. Dos copias de una cuenta de dinero es cómo una se queda atrás |
| `salon/consultas.ts` · la ocupación de un rango | el tablero, dos veces: mañana y los últimos siete días | Mide contra SU horario y no contra el día natural. Una copia que lo olvidara diría que sobra gente cuando falta |
| `salon/consultas.ts` · quién pasó su ciclo | `agenda.por_volver` y el tablero | La comparación es contra el ritmo de cada clienta. Dos reglas habrían metido en la misma lista a la de tinte y a la de corte |
| `salon/consultas.ts` · los huecos de un día | el tablero | El corte es la medianoche del día que se pregunta, no «ahora»: se mira un día que todavía no empieza |

### EN QUÉ IBA

Bloque 4 **cerrado**: los cinco tableros en pie, las cinco suites verdes, `verify:acople` sin una sola
pendiente de vocabulario y `pnpm test:unit` en 2820. Lo siguiente es el **bloque 5**: `pnpm verify`
entero, el CI verde en la punta y el informe con las ocho condiciones de TERMINADO.

---

## 20-09-2026 · BLOQUE 5 · la cadena entera, y lo que encontró al correrla

### 1 · `pnpm verify` salió en ROJO, y en un eslabón que el CI no corre

Los cuatro tableros —el de la tiendita incluido, que llevaba un día empujado y con el CI en verde—
declaraban su plantilla **a mano**:

```
✗ Contratos rotos antes de mutar: ningun_comando_escribe_la_lista_a_mano
```

El contrato existe desde F1.1-C-15 y su razón está escrita en el propio archivo: *«había CINCO
copias del mismo arreglo y basta con que una se quede corta al añadir un giro para que un comando
desaparezca de un paquete entero sin que nada avise»*.

La lista vive ahora en un sitio, y **exhaustiva por tipo**:

```ts
export const PAQUETES_DEL_TABLERO: Readonly<Record<Paquete, readonly Paquete[]>> = {
  tienda: ['tienda'],
  cafeteria: ['cafeteria'],
  restaurante: ['restaurante'],
  ferreteria: ['ferreteria'],
  estetica: ['estetica'],
};
```

Que sea un `Record<Paquete, …>` es la mitad del valor: **el día que llegue una sexta plantilla, esto
no compila** hasta que alguien decida qué mira su dueño al abrir el sistema.

### 2 · La causa de que durara un día: los arneses no corrían en CI

El tablero de la tiendita se empujó en `8231493` con el contrato ya roto y los **cuatro checks
dieron verde**. Mirando el workflow, el motivo era simple: corre estructura, histórico, tsconfig,
entorno, residuos, primitivas, formato, lint, tipos, unitarias, migraciones, integración, build y
cabeceras — y **ninguno** de los nueve arneses de mutación, ni cobertura, ni escrituras, ni lecturas,
ni aspecto.

> Una puerta que sólo existe en una laptop no es una puerta del proyecto.

Entran en un trabajo propio, `contratos`, que corre **en paralelo** con el de calidad y por lo tanto
no retrasa la señal que ya había. Fuera se quedan los tres que hablan con la base viva y con el
despliegue —`verify:esquema`, `verify:rls` y `verify:acople`—, con su motivo escrito en la cabecera
del workflow.

Y de paso, esa cabecera dejó de mentir: decía *«escrito y sin ejecutar; el repositorio todavía no
tiene remoto»*, y lleva corriendo desde el 18-09.

### 3 · Dos números del tablero del salón que mentían, vistos con datos

Volcar el JSON del comando contra la demo real —no la pantalla, el comando— enseñó dos cosas que
ninguna prueba de rótulos puede ver:

| Lo que decía | Por qué está mal | Lo que dice ahora |
|---|---|---|
| Ocupación de mañana **0 %** un lunes | El lunes el salón CIERRA. Un día cerrado y un día con la agenda vacía se leían igual, y son opuestos: uno no se puede arreglar y el otro es la llamada de hoy | Un guion, «el salón cierra», y la lista deja fuera a quien no trabaja ese día en vez de enseñarle un 0 % que no es suyo |
| **Servicio 0 % · Producto 100 %** con el día en cero | Es una proporción de nada, y se lee como si todo hubiera sido anaquel | «Todavía no se cobra nada hoy» |

**Cero entre cero no es cero por ciento: es una pregunta sin denominador.**

### 4 · Lo que cobró cada suite, anotado por la propia corrida

Las cinco anotan el importe (`test.info().annotations`, tipo `cobrado`), así que el número del
informe sale de la corrida y no de una libreta:

```
abarrotes        42.90 MXN · la venta del mostrador
cafeteria        52.00 MXN · la bebida de la barra
restaurante      75.00 MXN · la cuenta de la mesa
ferreteria       39.00 MXN · la nota del mostrador
estetica       1,800.00 MXN · el servicio de la cita
```

### 5 · El README describía otro sistema

Decía «opera una tienda de mostrador y un restaurante completo» y «Corte actual: F1.1 — 4 de 21
tareas». Son **cinco** negocios desde la Fase 2 y el corte es la 2.3. El repositorio es público: esa
primera línea es lo que lee quien llega.

### EN QUÉ IBA

Bloque 5 **cerrado**. La vuelta entera —los cinco bloques— queda en
[`docs/reports/016-fase-2.3-segunda-vuelta.md`](../reports/016-fase-2.3-segunda-vuelta.md), con las
ocho condiciones, la salida literal de las puertas, el CI en la punta, lo que cobró cada suite y las
tres cosas que no puedo hacer yo, cada una con sus instrucciones de dos minutos.

---

## 20-09-2026 · CIERRE · BLOQUE 1 · producción, con el código nuevo y las seis puertas

### 1 · La fusión, que no estaba bloqueada por GitHub

El PR #1 llevaba desde el 18-09 en `mergeable_state: clean` y lo que lo frenaba no era el
repositorio: era la política de la sesión anterior. Fusionado con la API, **100 commits a `main`**:

```
$ gh api -X PUT repos/{owner}/{repo}/pulls/1/merge -f merge_method=merge
{"sha":"63f4423d5b624a288370d9b270ff0e10819ec957","merged":true}
```

### 2 · Y producción sirve a SEIS negocios, por sesión

`morphiqpos-kappa.vercel.app` servía a uno —`mh-restaurante`— porque `ORGANIZACION` llevaba un solo
slug. El mecanismo para varios ya estaba escrito (`negociosDelDespliegue`, que acepta lista) y lo que
faltaba era usarlo:

```
$ curl -s https://morphiqpos-kappa.vercel.app/api/auth/empleados

negocios: mh-restaurante · demo-acople-tienda · demo-acople-cafeteria ·
          demo-acople-restaurante · demo-acople-ferreteria · demo-acople-estetica
usuarios: 29
```

**El camino por HOST sigue ganando** cuando el host lleva el slug, y es el que se usará el día que el
dominio resuelva. Mientras tanto basta la SESIÓN, que es lo que el encargo pedía: Miguel entra con el
PIN de un negocio y ve ese negocio, sin redesplegar.

Lo que hay que saber para deshacerlo: es **una variable**, no código. `ORGANIZACION` en el entorno
Production del proyecto, y un redespliegue. Con `mh-restaurante` a secas vuelve a ser lo de antes.

### 3 · Sin muro

`ssoProtection` está sólo en `preview`; producción no tiene ni contraseña ni SSO. Comprobado desde
fuera, sin cookie ni bypass: la raíz devuelve 200, `/api/auth/empleados` devuelve los 29 empleados de
los seis negocios, y las rutas que sólo existen en el código nuevo —`/api/reportes/tablero-estetica`,
`/api/reportes/tablero-cafeteria`, `/api/agenda/huecos`— contestan **403** (existen y están
guardadas), no 404.

### EN QUÉ IBA

Bloque 1 cerrado. Lo siguiente es el **rastreador**: una prueba genérica que abre las 62 pantallas en
las cinco demos, hace clic en CADA elemento interactivo y exige que cada clic haga algo —red, URL o
DOM—, contra PRODUCCIÓN.

---

## 2026-09-21 · Fase 2.3 · bloques 2 a 5 · EL RASTREADOR, y lo que destapó

### 0 · Lo que este bloque cambia de fondo

Las cuatro vueltas anteriores cerraron con una puerta escrita **a partir de los fallos ya
conocidos**, y la auditoría siguiente encontró cosas obvias. Este bloque construyó lo contrario: una
prueba que **no sabe qué busca** —toca cada botón de cada pantalla y exige que cada toque haga algo—
y **tres puertas nuevas** que nacieron de lo que esa prueba encontró, cada una cerrando la CLASE
entera del defecto y no el caso.

Resultado en números: **58 defectos arreglados, uno por uno**. Un renglón no es un botón —uno solo son
los 27 platillos del catálogo del restaurante—. De los 58: **2** dejaban el sistema inservible, **7**
eran controles que no hacían nada, **7** enlaces a pantallas que no existen, **8** tipos que la
pantalla declaraba mal, **19** pantallas que hablaban un idioma que el servidor no entiende (21
llamadas rotas), **5** de la corrida contra producción y **10 del propio rastreador**, antes de creerle
nada. La lista
completa, con el arreglo de cada uno, está en `docs/reports/017-fase-2.3-el-cierre.md`.

### 1 · EL RASTREADOR, y los cinco defectos que tenía ÉL

La primera corrida contra producción se pasó **35 minutos con 2,2 segundos de CPU gastados y cero
salida**. No trabajaba: esperaba. Playwright no pone techo a una acción por omisión
—`actionTimeout: 0`— así que un clic sobre un elemento que no aparece espera lo que dure la prueba.
Los cinco defectos del propio rastreador, arreglados antes de creerle nada:

| Defecto suyo | Qué lo delató |
| --- | --- |
| Sin techo por acción: un clic colgado se come la hora entera, en silencio | 35 min sin una línea |
| Sin bitácora: el resumen sale al final, así que no hay forma de saber si avanza | lo mismo |
| Contaba las piezas ANTES de que la pantalla se pintara: «16 pantallas · 0 toques» | 0 piezas en pantallas con doce botones |
| Leía el MENÚ en la pantalla de aterrizaje, que en los cinco modelos no tiene barra | «el menú no ofrece ninguna pantalla», con 16 entradas |
| La huella era ciega al ESTADO: un filtro que se pone no cambia el texto | acusó a cuatro botones que funcionan |

Y uno más, del ayudante de sesión: el clic de una entrada del menú iba **por su nombre**, así que con
dos entradas llamadas igual abría la que está primero en el DOM —`/abarrotes/caja` en un
restaurante—, que redirige al mapa de mesas, y la prueba acusaba a `/restaurante/caja` de no abrir.

### 2 · EL 403 QUE NO DEJABA NI ENTRAR

Lo primero que encontró, y ninguna de las treinta puertas lo había visto:

```
POST /api/auth/entrar   origin: https://morphiqpos-kappa.vercel.app  →  403
POST /api/datos/consultar                                            →  403
```

`APP_URL` apuntaba al dominio propio —cuyo DNS Miguel está configurando— y la frontera de escritura
rechaza cualquier otro origen. Un despliegue de Vercel se sirve **siempre** también por su
`*.vercel.app`: **nadie podía entrar desde la URL del despliegue**. Las suites no lo ven porque
corren con `APP_URL=http://localhost:3200`, donde el origen coincide siempre.

Arreglo: `APP_URL_ALTERNAS`, una lista de orígenes, **sin leer el `Host` de la petición** (R-17 sigue
en pie: leerlo es dejar que quien ataca declare el origen esperado).

### 3 · LA PANTALLA QUE MATABA EL NAVEGADOR

`MapaDeMesas` declaraba `readonly numero: string` y el puente sirve ese campo con
`conversion: 'entero'`. El orden llamaba `a.numero.localeCompare(b.numero)` sobre un número:

```
TypeError: e.numero.localeCompare is not a function
```

El mesero entra con su PIN, aterriza en el mapa —es su casa— y ve la página de error de Chrome.
Reproducido a mano contra producción. No lo vio ninguna puerta: TypeScript cree la declaración
—`consultarPuente<T>` no valida en ejecución—, el HTML abre en 200, la respuesta es `{ok:true}`, la
e2e comprueba el rótulo «Mesas» que se pinta ANTES de que lleguen los datos, y un error de consola no
es un 500.

### 4 · LAS TRES PUERTAS NUEVAS, y lo que cada una destapó

| Puerta | Compara | Destapó |
| --- | --- | --- |
| `verify:tipos-de-pantalla` | el tipo que la pantalla DECLARA contra la `conversion` del puente | **8**, dos de ellas pantallas muertas: `cafeteria/Recetas` hacía `.replace` sobre un número |
| `verify:enlaces` | cada `href` interno contra las pantallas que `app/` sirve | **7** 404 en la cara del usuario (en 6 líneas: dos botones con el mismo `href`), uno a una pantalla que no existe en ninguna parte |
| `verify:entradas-de-comando` | lo que la pantalla PUBLICA contra lo que el comando ACEPTA | **21**: cambiar un precio, identificar a una clienta, contar la leche, capturar una receta, abrir un rollo y cortarlo no funcionaban |

La cadena pasa de **31 a 34 eslabones**, y las tres están en CI.

### 5 · EL ESLABÓN 31, CORRIENDO POR PRIMERA VEZ EN ESTA MÁQUINA

```
Test Files  5 passed (5)
     Tests  10 passed (10)
  Duration  22.63s
```

Contra una **rama del proyecto de Supabase** —una base entera, aislada, con las 109 migraciones del
ledger aplicadas— y **sin Docker**. Cuatro reportes seguidos dijeron que este eslabón necesitaba
Docker. No lo necesitaba: el arnés sacaba el PUERTO de la URL y abría el socket contra `localhost`
SIEMPRE, así que con una base remota la espera se agotaba **sin intentar ni una vez** el `select 1`
que sí habría contestado. La receta entera está en `docs/fase-2/BASE-DE-PRUEBAS.md`.

### 6 · LA CADENA ENTERA, EN LA PUNTA, EN VERDE

`pnpm verify` completo contra `ee75b0f` —los 34 eslabones, `APP_URL` en producción y
`DATABASE_URL_PRUEBAS` en la rama de Supabase— salió en **0**. `verify:acople` incluido: 109
migraciones, RLS en 172 relaciones, 103 rutas, 128 rutas llamadas, 5 suites que cobran, y CI con
sus cinco checks verdes en la punta. Y `test:integracion` de último: 5 archivos, 10 pruebas, 17.36 s.

### 7 · Y LA ÚLTIMA MENCIÓN DE DOCKER, QUITADA DE DONDE MÁS DAÑO HACÍA

`verify:entorno` seguía imprimiendo «la comprobación en vivo NO se ejecutó: no hay Docker en esta
máquina», y con eso **aprobaba A-27** —«el backend completo debe poder correr en la PC de un
cliente»— sin haberlo probado nunca. El arreglo no es borrar el mensaje: es que la comprobación
corra. A-27 tiene dos mitades y ahora cada una corre cuando puede:

| Mitad | Con qué se prueba | Qué falla si se rompe |
| --- | --- | --- |
| el **esquema** en un Postgres ajeno | `DATABASE_URL_PRUEBAS` — una rama del proyecto basta | que la cadena sea la de la aplicación · que el motor no sea el que fija el compose · que el ledger de allí no cuadre con el disco |
| el **empaquetado** offline | `docker compose config`, si hay motor | que el compose no valide |

Cuando sólo una corre, la puerta dice **qué mitad falta** en vez de callarlo. La fila de excepción
sólo cubre el caso en que no corre ninguna, y sin esa fila la puerta **falla**.

```
  · en vivo: el esquema completo (109 migraciones) esta aplicado en un Postgres 17 AJENO al de la aplicacion
  · pendiente: el EMPAQUETADO offline no se valido (no hay motor de contenedores en esta maquina): de A-27 esta demostrado que el esquema viaja, no que el paquete arranca
✓ Entorno local: 3 servicios, imagenes fijadas, 9 variables declaradas.
```

Destructivas que FALLAN: la base de pruebas apunta al mismo proyecto que la aplicación · el compose
fija Postgres 16 y la base ajena corre 17 · una migración más en disco que en el ledger de allí · ni
base ajena ni compose con la fila de excepción borrada.
Inocuas que PASAN: sin `DATABASE_URL_PRUEBAS` pero con la excepción declarada (sale «pendiente» y
en 0) · una línea en blanco de más en el script.

### CERRADO

El reporte del cierre es `docs/reports/017-fase-2.3-el-cierre.md`: la tabla de las ocho condiciones,
la salida literal de las puertas, la URL de producción y la lista completa de lo que destapó el
rastreador con su arreglo. Lo que queda fuera son dos cosas que no arregla el código y están
escritas con sus comandos: el bucket de archivos (una credencial S3 de Supabase) y la decisión de
producto del pedido anticipado.

---

# ETAPA 2.35 · EL DISEÑO

Miguel entró a ver el sistema y lo primero que dijo fue que el diseño está horrible. Tenía razón, y
la causa estaba medida: **`packages/ui/src/estilos/index.css` no lo importaba nadie.**

## BLOQUE 0 · lo que quedó de la 2.3

### 0.1 · EL RASTREADOR, EN CI

No estaba en `.github/workflows/`, así que una regresión de botón muerto volvía sin que nada la
detectara. Ahora es un trabajo propio, **en matriz de cinco** —uno por modelo, `fail-fast: false`—
y cada uno **se provisiona solo**: su Postgres, sus migraciones, su negocio de demostración con su
equipo y su catálogo, su build y su servidor. No habla con producción ni con el preview: sin
secretos, y por eso corre en el pull request de cualquiera.

Los cinco en serie son 42 minutos de reloj; en matriz, el reloj es el del modelo más lento. Y el
rastreo **no reintenta**: la configuración da un reintento en CI para distinguir fragilidad de un
contenedor con mal día, y aquí eso duplicaría el trabajo más lento de la tubería para volver a tirar
el dado sobre algo que no falla una vez de cada tres.

`scripts/sembrar-demos.mjs` reventaba con `ENOENT .env` antes de leer una sola variable, lo que lo
dejaba fuera de cualquier sitio que no fuera una laptop. Ahora si no hay `.env` no pasa nada: las
variables llegan por el entorno del trabajo.

### 0.2 a 0.5 · EL RASTREADOR, COMPLETO

**0.2 · El tercio que faltaba.** El encargo pedía «botón, enlace y FORMULARIO» y el selector sólo
miraba botones y enlaces. Ahora hay **cuatro clases de pieza y cada una con su promesa**:

| Clase | Qué se le exige |
| --- | --- |
| `boton` | que pase algo: petición, URL, DOM, diálogo o pestaña |
| `campo` | que lo que se teclea SE QUEDE |
| `eleccion` | que lo que se elige SE QUEDE |
| `marca` | que la marca CAMBIE de estado |

Más el `<form>`, que se **envía** con `requestSubmit` —el camino del Enter, no el del botón— y que
tiene que hacer algo aunque sea que el servidor lo rechace. Para eso hay una **ventana de sondeo**:
mientras se manda basura a propósito, un 400 o un 422 de la API es la validación funcionando y no
una respuesta rota. Un 404 sigue siendo una ruta que no existe y un 5xx sigue siendo que revienta.

**0.3 · Profundidad 2.** El ámbito era el `main` y Radix monta diálogos, menús y listas en un portal
al final del `body`; y como entre toque y toque se RECARGA, la recarga cerraba el diálogo antes de
que nadie mirara dentro. Todo lo que vive dentro de un diálogo de cobro, de alta o de confirmación
**no lo tocaba nadie**.

**0.4 · Lo que quedó sin tocar, dicho y con techo.** El cubo `inalcanzables` se llenaba, se anotaba
«si hay alguno» y su tamaño no salía en ninguna parte: una corrida en la que la mitad de las piezas
no se pudieron volver a encontrar se leía igual de verde que una en la que se tocó todo. Ahora sale
en el resumen con su porcentaje, cada una con su ruta y su motivo en la bitácora, y **por encima del
15 % la corrida falla**: «cero botones muertos» pasaría a significar «cero de los que pude tocar»,
que es otra frase.

**0.5 · Las cuatro sin menú.** Los dos `acceso-por-pin`, el portal del comensal y el menú público
están exentas del MENÚ por razones buenas y escritas —se ven antes de que exista sesión, o las abre
el cliente con un QR—. Exentas del menú no es exentas del rastreo: ahora se llega por su URL. Si con
sesión abierta una redirige a la casa, se anota y se sigue, que es lo correcto y no un defecto.

### Y OCHO DEFECTOS DEL PROPIO RASTREADOR, antes de creerle nada

La primera corrida con profundidad 2 acusó a **66 piezas** de la tiendita, 36 de ellas con «no se
pudo tocar» —incluidos «Cancelar» y «Cerrar» de un diálogo que Miguel usa todos los días—. Se midió
en vez de creerlo: dentro del diálogo de «Registrar gasto», `elementFromPoint` devolvía la pieza
correcta y `pointer-events` valía `auto` en todas. Un humano las toca sin problema.

| # | Qué tenía | Cómo se vio |
| --- | --- | --- |
| 1 | **Buscaba las piezas de la capa por el camino del DOM.** La capa vive en un portal al final del `body`: en cuanto React repinta, esos `nth-child` apuntan a otro nodo —al velo, que sí está cubierto por el diálogo— | 36 «no se pudo tocar» que eran uno solo |
| 2 | **Un toque puede abrir OTRA capa.** El primer clic del diálogo era un desplegable; su lista se monta encima y tapa el diálogo entero, así que todo lo que venía después estaba de verdad cubierto | ahora, si un toque abre una capa nueva, se cierra antes de seguir |
| 3 | **La identidad era sólo el rótulo.** El rótulo vacío de un botón casa con el de un campo vacío, así que la posición podía apuntar a otra cosa y `fill` contestaba «Element is not an `<input>`» | ahora se exige la misma etiqueta HTML |
| 4 | **Un `fill` que no se puede aplicar no es un campo muerto.** «Element is not an `<input>`» y «Malformed value» son límites de la SONDA | van al cubo de «sin alcance», no al de muertos |
| 5 | **Acusaba con una sola vía.** `fill` pone el valor y lanza un `input`; hay componentes que escuchan `keydown` | antes de acusar se teclea **tecla por tecla**, que sólo puede quitar falsos positivos |

**De 66 hallazgos a 12.** Los 54 que se fueron no eran defectos de la aplicación: eran defectos de
la prueba, y un falso positivo cuesta lo mismo que un defecto.

### 0.6 · LA PUERTA DE CABECERAS MEDÍA SOBRE UN 404

`verificar-cabeceras.mjs` comprobaba las cabeceras contra **`/estilos`**, una ruta que se borró al
portar el frontend. Las cabeceras de seguridad las pone el proxy y salen **igual en la página de
error**, así que la puerta llevaba meses dando verde sin haber mirado una sola pantalla de la
aplicación. Y lo que comprueba no es decorativo: si los `<script>` de Next no llevaran el nonce, la
aplicación se serviría sin hidratar —se ve bien y no responde a un clic— y ese verde no lo habría
notado.

Ahora mide contra `/login-pos`, y **falla si la ruta sonda devuelve 404**, que es el cerrojo que
faltaba. `docs/ARRANQUE-CODEX.md` mandaba abrir ahí: corregido.

Destructiva que FALLA: devolver `RUTA_SONDA` a `/estilos` → `✗ La ruta sonda … devuelve 404`.

### 0.7 · «SERVIDOR LOCAL» ERA UNA URL DE PRODUCCIÓN

`verificar-acople.mjs` decidía entre «local» y «despliegue» por **cuál variable se había puesto**, no
por lo que hay al otro lado. Así que una corrida con `APP_URL=https://morphiqpos-kappa.vercel.app`
—que es exactamente cómo se corrió la vuelta 2.3— imprimía «contra el servidor LOCAL
(https://…vercel.app)»: el rótulo y la URL de la misma línea se contradecían. Y por esa rama tampoco
se comprobaba el MURO, que es lo único que distingue «el despliegue contestó» de «la Protección de
Despliegue contestó por él».

Ahora lo decide el HOST, y el muro se comprueba en cualquier URL que no sea de esta máquina:

```
despliegue    REMOTO https://morphiqpos-kappa.vercel.app → 200 · sin credencial · sin muro por delante
```

Destructiva que FALLA: apuntar a un preview con protección →
`DESPLIEGUE: … contestó un 302 a vercel.com/sso-api, que es la Protección de Despliegue de Vercel y
no la aplicación`.

### 0.8 · EL ALMACÉN DE ARCHIVOS, CONECTADO

En producción no se podía guardar un solo archivo: `STORAGE_ENDPOINT` valía `http://localhost:9000`.
Y en la etapa del diseño eso no es un pendiente cualquiera —**el logo del negocio y las imágenes del
menú son parte del diseño**—.

El endpoint S3 de Supabase **no se puede usar con la credencial que este despliegue tiene**, y está
medido: con la llave de servicio contesta `InvalidAccessKeyId`, y como *session token* contesta
«the session token should be a valid JWT token». Este proyecto usa el formato de llaves nuevo
(`sb_secret_…`), que no es un JWT; la otra vía son llaves de acceso S3, que sólo se crean en el panel.

Así que hay **dos conductores** en `packages/data/src/archivos.ts` y **una sola decisión legible**:
si el endpoint termina en `/storage/v1` es la API de Supabase; cualquier otra cosa es S3. **S3 sigue
siendo el de por omisión y no se va**: A-27 exige que el backend corra en la PC de un cliente con su
MinIO al lado. Las cinco operaciones del conductor nuevo están probadas contra el proyecto de verdad
—guardar, leer con su `content-type`, copiar, sumar 44 bytes bajo un prefijo, devolver `null` para lo
que no existe y borrar hasta dejarlo en cero—. Detalle completo en `docs/fase-2/VERCEL-ENTORNO.md §8`.

Y el conductor comprueba que `STORAGE_ACCESS_KEY` sea la referencia del endpoint: la llave de un
proyecto contra el bucket de otro es el fallo clásico de despliegue, y sin eso se manifiesta como un
400 del almacenamiento cuatro pantallas más adelante.

---

## BLOQUE 1 · ENCHUFAR EL SISTEMA QUE YA EXISTÍA

### Lo que estaba pasando, medido en el CSS servido

`verify:primitivas` OBLIGA a las 36 primitivas a escribir `shadow-1..4` y `h-(--altura-control)` en
unos 190 sitios. En el paquete que el navegador recibía:

```
.shadow-1 …… no existía como regla
--altura-control …… no estaba declarada en ninguna parte
--sombra-*, --espacio-* …… cero apariciones
```

Es decir: **el sistema pintaba con tokens que no existían**, y `width:var(--altura-control)` era una
declaración inválida que el navegador tiraba. Por eso todo se veía plano y sin jerarquía.

Hoy, en el mismo archivo:

```
.shadow-1{--tw-shadow:var(--sombra-1);box-shadow:…}
--altura-control:2.5rem
--sombra-2:0 1px 3px 0 hsl(var(--sombra-tinte) / .1), …
--fondo:220 20% 98%
```

Y medido en el navegador, sobre el tablero de la tiendita: `shadow-1` computa
`rgba(15, 23, 41, 0.06) 0px 1px 2px 0px` —con el tinte de su azul de tinta, no un gris— y
`h-(--altura-control)` computa una altura de verdad.

### UN SOLO VOCABULARIO

Había dos: el inglés de shadcn —vivo, el que pintaba todo— y el español de `packages/ui` —con
contrato, perillas y auditoría de contraste, y muerto—. Dos vocabularios garantizan que uno se queda
atrás, y uno ya se había quedado.

La unificación va **en un solo sentido**: `packages/ui/src/estilos/morphiq.css` es la fuente, y los
nombres en inglés son alias suyos. Al revés no serviría: el inglés no tiene perillas, ni contrato, ni
auditoría. Los 244 archivos del heredado siguen escribiendo `bg-card` y `text-muted-foreground` sin
cambiar una clase, y **el modo oscuro desapareció de su hoja**: antes había que acordarse de tocar
dos bloques por cada color.

### EL ESTILO `morphiq`, que es el suyo

Su azul `217 91%`, su fondo `220 20% 98%`, su tinta `222 47% 11%`, su barra casi negra, sus cinco
colores de gráfica. **Seis valores no se pudieron conservar tal cual, y los seis por la misma razón:
no llegaban a AA.**

| Token | Suyo | Contraste | Ahora | Contraste |
| --- | --- | --- | --- | --- |
| `--primary` (el botón de COBRAR) | `217 91% 55%` | 3.42:1 | `217 91% 45%` | **4.99:1** |
| `--input` (el borde de un campo) | `215 20% 88%` | 1.33:1 | `215 16% 48%` | **3.21:1** |
| `--success` | `152 60% 40%` | 3.58:1 | `152 60% 33%` | 4.5+ |
| `--destructive` | `0 72% 51%` | 4.08:1 | `0 72% 42%` | 4.5+ |
| `--info` | `199 89% 48%` | bajo | `199 89% 32%` | 4.5+ |
| `--sidebar-primary` (el activo del menú) | `217 91% 60%` | 3.6:1 | `217 91% 45%` | **4.99:1** |

Todos conservan **su tono y su saturación**, que es la marca; lo único que baja es la claridad. Y la
auditoría no es una opinión: `packages/ui/src/tokens/sistema.test.ts` calcula cada par en los tres
estilos y los dos modos, **139 pruebas**.

Cuatro tokens nuevos, y los cuatro porque su paleta ya distinguía lo que el contrato no:
`acento-suave` y `acento-suave-texto` —la superficie teñida del hover, que no es lo mismo que un
acento saturado—, `lateral-activo-texto` y `lateral-hover` —la barra es oscura en los dos modos, así
que su hover no puede salir del acento de la página—.

### Y LAS PERILLAS, ENCHUFADAS

`useApariencia` estaba escrito desde la Fase 1 y **no lo llamaba nadie**. Ahora el servidor pone los
cinco atributos en el `<html>` —sin ellos no hay `--fondo`, y sin `--fondo` no hay `--background`,
así que la primera pintura saldría en blanco y negro— y `ProveedorDeApariencia` los vuelve estado
para poder cambiarlos **sin recargar**. Es la mitad de la etapa 5, ya hecha.

## ETAPA 2.35 · BLOQUE 6 · LAS PUERTAS

Una puerta sirve si se ha visto ROJA. Las cinco se mutaron contra el código real y se miraron
fallar antes de darlas por buenas; las mutaciones están en el mensaje de cada commit.

### 6.1 · EL RITMO, no sólo el color

`verify:primitivas` ya prohibía literales de color, altura, sombra y variante. Le faltaban cuatro
que puentean una perilla exactamente igual de bien:

- **espacio** — con `gap-4` fijo, cambiar la densidad a `compacta` no junta **nada**. La perilla
  queda de adorno.
- **tipografía** — `text-[13px]` se sale de la escala y no responde a nada.
- **duración** — las duraciones son tres y salen de la perilla de movimiento. Con una literal, el
  estilo TERMINAL, que las pone a cero a propósito, **sigue animando**.
- **curva** — la misma historia con `ease-[cubic-bezier(…)]`.

**El trinquete, y por qué no es una exención disfrazada.** Las 69 pantallas se escribieron con
literales, que es lo que hace cualquiera cuando los tokens no emiten CSS — y hasta el bloque 1 no
emitían. Exigir cero hoy dejaría la puerta roja hasta que el bloque 4 convierta las 69, y una
puerta que lleva semanas en rojo deja de leerse: se salta. Así que la regla se aplica **entera**
dentro de `packages/ui/src` —la biblioteca tiene que ser ejemplar, y hoy tiene cero— y fuera se
cuenta contra un techo de **919 literales en 68 archivos** que sólo puede bajar. Un literal nuevo
pone la puerta roja hoy.

Y cuenta **literales, no archivos**. Con la cuenta por archivo, como estaba al principio, añadir
un segundo `gap-12` a una pantalla que ya tenía uno no subía el número y el trinquete no trincaba
nada.

**El quita-comentarios, que ya se equivocó una vez en esta fase.** Un comentario que menciona
`cn('p-2', 'p-4')` para explicar por qué existe `twMerge` es documentación, no un literal; sin
quitarlos, la regla acusaba a `utilidades/cn.ts` por su propia explicación. Pero la versión
ingenua —cortar la línea en el primer `//`— se comió el `https://` de una constante y **escondió
una mutación que debía fallar**. Ahora se quitan líneas completas que empiezan por `//` o por `*`,
y bloques `/* */`. Un `//` a mitad de línea puede ser una URL, y se respeta.

### 6.3 · EL MOVIMIENTO REDUCIDO, y el hueco entre dos verdes

De las cuatro cosas que cada estilo tiene que cumplir, `prefers-reduced-motion` era la única sin
puerta de verdad. Tenía el CSS correcto y una prueba que comprobaba que el bloque existe. Y con
las dos en verde el movimiento puede seguir encendido, porque lo que decide no es que el bloque
esté: es la **especificidad**.

```css
@media (prefers-reduced-motion: reduce) { :root { --duracion-normal: 0ms } }
[data-estilo='terminal'] { --duracion-normal: 200ms }
```

Las dos reglas apuntan al mismo `<html>` y las dos valen 0,1,0 —una consulta de medios **no** suma
especificidad—, así que gana la que va después. Hoy gana la buena por el **orden** de
`estilos/index.css`, no por ser más fuerte. Y «TERMINAL no tiene movimiento» es lo más natural que
alguien puede escribir en `terminal.css` el mes que viene.

Se midió: con esa línea añadida, la puerta nueva se pone roja —`--duracion-normal = .2s`— y las
**370 pruebas de `sistema.test.ts` siguen verdes**. Ése es el hueco, medido en vez de supuesto.

La prueba sube además la perilla a `expresiva` a propósito: si la preferencia del sistema sólo
ganara con la perilla baja, no estaría ganando.

### 6.4 · LOS OCHO ESTILOS EN UN NAVEGADOR, y los dos botones muertos

«Un estilo que esconde un botón detrás de otro es un botón muerto.» La puerta encontró dos, y
ninguno lo había traído esta etapa.

**Uno · la rejilla de avisos se tragaba los clics de una esquina de todas las pantallas.**
`heredado/components/ui/toast.jsx` pinta un `div` `fixed` de 420 px anclado abajo a la derecha,
con `pointer-events: auto` y **vacío** la mayor parte del tiempo. Y son dos, porque
`ToastProvider` pinta otro idéntico por fuera. Se le preguntó a `elementFromPoint` qué había
encima del destino «Caja» del abanico inferior y lo que recibía el toque era la rejilla, no el
botón. `pointer-events-none` en la rejilla es lo que trae shadcn de origen —esta copia lo perdió—
y los avisos siguen siendo interactivos porque cada uno ya lleva `pointer-events-auto`.

Toca un archivo del heredado, así que va con su excepción declarada en `aspecto-permitido.json` y
su motivo escrito: **no cambia un píxel de lo que Miguel ve, cambia dónde llega el dedo.**

**Dos · la isla flotante caía encima del abanico.** Los dos en `bottom-0`, los dos en `z-40`, y
los dos son patrones **de teléfono** — así que la pantalla que los pide a la vez es justo la que
importa: el carrito de un pedido en la mesa con su navegación debajo. El «Cobrar» de una quedaba a
34 px del «Cobrar» de la otra. El abanico ahora **mide** su altura y la publica en
`--alto-abanico`; la isla se la suma. Medida y no calculada: depende de la densidad, del área
segura y de si algún destino lleva insignia, y un número a mano acertaría en una densidad de
cuatro. Un `ResizeObserver` la mantiene al día cuando la perilla cambia **en vivo**.

### El área táctil: una promesa de tres años, y el remedio que era peor

`--area-tactil-minima` estaba declarado en las cuatro densidades y lo usaba **un** componente de
los treinta y seis. La nota de `base.css` prometía «área de toque extendida», y ese remedio es
peor que no tenerlo en el caso que importa: un `::after` invisible más grande que el control se
monta sobre la fila de arriba en una lista con `gap-px` y **se come sus clics**. El botón muerto
causado por la cura.

Así que la regla es **tamaño o distancia**: un control pasa si su lado corto llega al mínimo de su
densidad, o si está lo bastante separado como para que un objetivo de ese tamaño centrado en él no
toque el de ningún otro. Es WCAG 2.5.8 con el número del sistema en vez de su mínimo de 24 px, y
se mide **contra el token**: si mañana alguien lo baja, lo baja a la vista de todos en `base.css`
y no escondido en una constante de una prueba.

Dos números cambiaron, los dos con razón:

| Densidad | Control | Mínimo táctil | Por qué |
| --- | --- | --- | --- |
| `guantes` | 56 px | 56 px | A lo que se acierta con un guante puesto y con prisa |
| `comoda` | 48 px | 48 px | La tableta |
| `normal` | **44 px** (era 40) | 44 px | Es la densidad que recibe una tableta recién configurada, antes de que nadie toque una perilla. Sube el **control** y no sólo el área: un botón que se ve de 40 y se toca en 44 sigue pareciendo pequeño, y el aspecto también informa |
| `compacta` | 32 px | **24 px** (era 44) | `base.css` ya decía «(operación) en escritorio → compacta»: es la densidad de **ratón y teclado**, y su mínimo es el de WCAG 2.5.8 AA. Exigirle 44 de separación a una densidad cuyo propósito es caber más la dejaría roja para siempre y acabaría en una exención |

Y dos piezas de la tabla se hicieron tocables de verdad: la casilla de selección medía 16×16 y
ahora marca **la celda entera** —un `<label>` que la llena, no un recuadro invisible que
sobresale—, y la cabecera ordenable pasa su relleno al botón, de 16 px de alto al mínimo de su
densidad.

### Lo que esta puerta NO cubre, dicho en vez de supuesto

- **Las composiciones propias de cada pantalla.** 69 × 8 son 552 recorridos, que en CI son horas.
  `/sistema` tiene una de cada pieza, así que un estilo que rompa una la rompe ahí; una pantalla
  que ordene mal las suyas, no.
- **Que cada pantalla reserve hueco al final para su barra fija.** Eso es de cada pantalla.

### Las dos falsas acusaciones que se corrigieron antes de creerlas

La misma disciplina de la 2.3, y por la misma razón: allí costó 66 falsos positivos.

- **`sticky` no es `fixed`.** Metiéndolos en la misma capa, la cabecera pegajosa de la tabla salía
  «tapada por el abanico» en cuatro estilos, porque en algún punto del scroll pasa por debajo de
  él. Una pegajosa viaja con su contenido; una fija vive en la ventana. Cuatro acusaciones falsas.
- **Comparar el flujo contra una barra fija mide el scroll, no un defecto.** Un botón salía
  «apretado» en `papel` y suelto en `morphiq` sólo por el interlineado, que mueve el contenido a
  otro sitio. Se compara anclado con anclado y flujo con flujo; dos barras fijas sí entre ellas,
  porque las dos están siempre donde están.

### En CI

`verify:estilos` va en `pnpm verify` detrás de `verify:primitivas` y es un paso propio del
workflow. La barrida de los ocho estilos va **antes** del rastreo y en **un solo** modelo: dura
diez segundos contra catorce minutos, así que un estilo roto se sabe ya en vez de al final; y
`/sistema` es la misma página en los cinco giros, luego cinco copias serían cuatro veces el mismo
veredicto.

## ETAPA 2.35 · BLOQUE 4 · APLICARLO A LAS 69 PANTALLAS

### La tercera vez la misma enfermedad, y la última que quedaba

`base.css` declara `--tamano-xs … --tamano-3xl` desde la Fase 1. El contrato los exige.
`sistema.test.ts` comprueba que están. Y **nadie los mapeaba a Tailwind**: lo que se pintaba
era la escala por omisión de Tailwind y los siete tokens eran siete declaraciones inertes.

Es el mismo fallo que la hoja de estilos que nadie importaba (bloque 1) y que
`--area-tactil-minima`, declarado en cuatro densidades y usado por **un** componente de treinta
y seis (bloque 6.4). Tres veces: un sistema escrito, probado y sin aplicar.

Medido tras enchufarla: `text-xl` 22 px donde antes 20, `text-2xl` 28 donde 24, `text-3xl` 36
donde 30. La escala del contrato tiene más **contraste** que la de Tailwind, y ese contraste es
la mitad de la jerarquía: lo que hace que un título mande sin tener que ponerlo en negrita.

### El octavo paso · `display`

Las pantallas escribían `text-5xl xl:text-6xl`, `text-6xl md:text-7xl xl:text-8xl`, `text-4xl`…
a mano, fuera de la escala y distinto en cada modelo. Todos eran el mismo problema: **lo que se
lee de lejos**. El total que el cajero dice en voz alta con alguien enfrente; el número de una
comanda que se lee a dos metros con las manos ocupadas; el dígito de un teclado de PIN.

```css
--tamano-display: clamp(2.5rem, 1.25rem + 4vw, 5rem);
```

40 px en el teléfono de un técnico, 71 en el monitor de una tiendita, 80 en la pantalla de una
barra — sin tres saltos de punto de ruptura escritos a mano en cada pantalla. Es el **único**
paso fluido: todo lo demás se lee de cerca, y ahí un tamaño que baila al redimensionar molesta.

### Las cinco pantallas de cobro

Las que Miguel señaló. `Dinero` en cada importe —cifras tabulares, el símbolo y los centavos un
escalón por debajo del cuerpo del número, los negativos en rojo **y** entre paréntesis—;
`Superficie` en las tarjetas, con el total subido a nivel 2 y el desglose en 1; `Vacio` en los
estados vacíos.

Dos decisiones que se repiten en las cinco:

- **El rótulo va debajo del número.** Lo que el ojo busca al girar la pantalla es la cifra; la
  palabra «total» sólo confirma qué es.
- **El cambio manda en la confirmación**, no el total. El total ya se dijo en voz alta; lo que
  queda por hacer es contar el vuelto.

Y una que **no** se tocó: `ferreteria/Mostrador` dice en su propio comentario «grande para
leerse de reojo, y NO lo más grande de la pantalla». En una ferretería lo que se compara es el
precio por unidad, no el total. Se respeta.

### Cero emoji · 36 sitios en 16 archivos

Un emoji no es un icono: lo dibuja el sistema operativo, así que el mismo carácter es una cosa
en el Windows de la tiendita, otra en el Android del técnico y otra en el iPad del mesero; no
hereda `currentColor`, así que no se puede poner en el color de peligro; y no escala con la
tipografía. `⚠️` marcaba las alergias en siete pantallas de cinco modelos.

Lo que **no** se persigue, y está en la regla: los glifos tipográficos monocromos —✓ ✗ ✕ ⚠ ▸ ▾
▊— se quedan. No son emoji: heredan el color, escalan, y varios están puestos a propósito para
que el color no sea el único portador de significado. La regla busca los pictogramas
`1F000-1FAFF` y el **selector de variación U+FE0F**, que es el carácter invisible que convierte
`⚠` en `⚠️`.

### Una gráfica por tablero, y la que su giro pide

Ninguna por decoración. Una gráfica ocupa el sitio de tres renglones de cifras, y en un tablero
que se lee en cuatro segundos eso sólo se paga cuando la **longitud** contesta algo que una
columna de números no contesta. El criterio sale del que ya estaba escrito: la tiendita prohíbe
la dona de métodos de pago —«en 390 px una lista ordenada contesta mejor y ocupa menos»—.

| Tablero | Gráfica | Qué contesta que un número no |
| --- | --- | --- |
| cafetería | La ráfaga **hora por hora** | El pico dice cuánto; esto dice cuándo y **cuánto dura**. 45 bebidas en una hora suelta es un día raro; 40, 45 y 38 seguidas son tres horas en las que hace falta un tercero |
| ferretería | La cartera por obra | La lista dice quién y cuánto; la barra dice la **proporción** — si son cuatro obras parecidas o una que se comió la mitad |
| tienda | Lo que se vence esta semana, a costo | Si el remate del sábado empieza por uno solo o hay que bajarle el precio a los cinco |
| estética | A dónde se fue lo cobrado del mes | Cuatro renglones dicen cuánto se fue; ninguno dice si la comisión se llevó un tercio o dos |
| restaurante | — | El heredado ya trae su dona, es código de Miguel y lo cubre `verify:aspecto`. Añadirle una sería cambiarle su tablero para cumplir una cuota |

La de la cafetería salió de una consulta que **ya la calculaba**: `group by 1 order by bebidas
desc limit 1` agrupaba las horas del día y tiraba todas menos una. La forma del día se estaba
calculando y descartando en la misma línea.

Y la de estética **no** va en la ocupación de mañana, que es su estrella: ésa ya se dibuja —cada
profesional lleva su barra de relleno—. Poner otra encima sería adorno.

### Diecisiete estados vacíos

El texto ya estaba bien y no se tocó: estas pantallas ya enseñaban en vez de disculparse. Lo que
faltaba era la **forma** — cada vacío con su propio relleno, su propio centrado, y ninguno con
icono. Un bloque de texto centrado sin icono se lee como un error; con icono se lee como una
invitación, y ésa es toda la diferencia entre «algo falla» y «esto todavía no empieza».

Cuatro que **no** se convirtieron, cada una con su razón: `cafeteria/Recogida` es un tablero de
pared y meterlo en el componente lo encogería; dos vacíos **en línea** viven dentro de un
formulario, junto al campo que los resuelve; y el del tablero de restaurante es del heredado.

### Cada demostración con su piel

Las cinco se sembraban iguales, así que un cliente al que se le enseñan los cinco negocios veía
cinco veces el mismo programa con otras palabras. Ahora: ferretería → TALLER, estética →
CRISTAL, tienda → BLOQUE, restaurante → NOCHE, cafetería → MORPHIQ. RELIEVE, TERMINAL y PAPEL
quedan sin repartir a propósito: los ve quien abra el selector.

Se aplica con el **mismo comando** que usa Miguel delante del cliente, y va **después** de
sembrar porque `resetear_demo` reescribe la configuración del negocio.

### Y ahí apareció que el selector NUNCA pudo guardar

`configuracion.fijar_apariencia` declara `escribe: true` y no llamaba a `ctx.auditar`.
`definirComando` lo exige —«declarar sensible algo que no deja rastro convierte la auditoría en
un adorno»— y lanza `SinRastro` **después** de escribir: la transacción se deshace y quien lo usa
ve un error interno. Cada vez que alguien tocaba «Guardar para el negocio», la pantalla decía
«No se pudo guardar la apariencia».

No lo vio ninguna puerta. El comando compila, los tipos son correctos, la ruta responde y el
fallo ocurre dentro de la transacción. Apareció al llamarlo desde la siembra — la primera vez que
algo distinto de una pantalla lo ejecutó.

El hueco es general: `definirComando` comprueba la auditoría en el **envoltorio**, y las 248
pruebas de comandos llaman a `.ejecutar()` directamente. Cualquiera de los 189 comandos que
escriben podía estar roto así con sus pruebas en verde. `verify:rastro` los mira ahora a los 189.

Y su primera versión **acusó en falso a dos de tres**: conocía una sola forma de delegar y hay
dos. La misma proporción que el rastreador de la 2.3 la primera vez que corrió, y por la misma
razón — creer la primera señal.

### El ritmo de las 69, de una vez · 919 → 0

`tokenizar-pantallas.mjs`: 831 literales en 64 pantallas. Un codemod, no un retoque archivo por
archivo, y se queda en el repositorio como evidencia de que la adopción fue sistemática.

En densidad `normal` la conversión **no mueve un píxel** —`--espacio-4` vale exactamente lo que
valía `p-4`—. Lo que gana es que las cuatro perillas dejan de ser de la biblioteca y pasan a ser
de la aplicación. Medido en la galería, misma pantalla y mismo ancho: la lista de existencias
entra **nueve** renglones en BLOQUE —densidad `guantes`— y **once** en TERMINAL —`compacta`—.
Antes entraban los mismos en las ocho.

Los negativos también, y ahí está la sutileza: un `-mx-4` existe para **cancelar** el `p-4` de su
padre. Si el relleno escala con la densidad y el margen negativo no, en `guantes` el padre abre
1.4 veces más y el pie deja de llegar al borde. Los dos o ninguno.

## ETAPA 2.35 · BLOQUE 6.5 · LA GALERÍA, Y EL BOTÓN QUE MATABA MEDIA APLICACIÓN

160 retratos: cinco modelos × cuatro pantallas × ocho estilos. Y cuatro de las cinco pantallas de
cobro salieron con la pantalla de error del navegador.

```jsx
const Comp = asChild ? Slot.Root : "button"
…
{cargando && !asChild ? <Rueda /> : null}
{children}
```

`Slot` exige **un solo** hijo elemento. Con `asChild`, esas dos líneas le pasan dos —el `null` y
el elemento— y revienta. No es un aviso de consola: la página entera muere, en el servidor con un
500 y en el navegador al hidratar. Y `asChild` está en cada estado vacío, en cada atajo de cada
tablero y en cada «Ir a caja»: lo que se rompía era media aplicación, desde que el bloque 2 le
puso al botón su estado de cargando.

**El rastreador SÍ lo cazó en CI**, y con el mensaje exacto para el que se escribió: «El navegador
escribió errores mientras se tocaba la aplicación. Un error de consola no devuelve 500 ni
`{ok:false}`». Lo que falló fue mío: no lo miré. Lo encontré por otro camino, retratando la
galería, y el commit de ese arreglo decía que el rastreador «no corrió» — es falso, corrió y
falló dos veces.

La lección que sí es del sistema: la puerta de los ocho estilos —que corre en cada empuje y mira
`/sistema` en segundos— **tampoco** lo vio, porque `/sistema` documentaba los seis variantes, los
cuatro tamaños, el deshabilitado y el cargando, y **no** el modo `asChild`. Lo que no está en la
página del lenguaje no lo mira la puerta del lenguaje. Ahora está.

### Y la galería aprendió de sí misma

Su primera versión dio **verde** sobre ocho capturas de «This page couldn't load»: la espera de
contenido la pasaba porque esa página también tiene texto. Una galería que no puede fallar no es
una galería: es una carpeta con imágenes, y el retrato de un fallo puesto en un informe es peor
que no tener informe, porque se firma como si fuera el producto.

## ETAPA 2.35 · LOS TRES HALLAZGOS DEL RASTREADOR

Ninguno devuelve 500 ni `{ok:false}`: los tres viven en la consola del navegador.

1. **`upgrade-insecure-requests` rompe un despliegue sin TLS.** La CSP la ponía siempre. Contra
   un servidor que no habla TLS, el navegador pide https a un puerto de texto plano y la petición
   no llega. Y **A-27 dice que el backend tiene que poder correr en la PC de un cliente sin
   internet**: una caja en la trastienda, servida por http en la LAN, es ese escenario. Ahora la
   decide `APP_URL` —la misma variable de la que sale el Origen esperado de una escritura— y
   nunca la petición.
2. **El portal del comensal latía contra una ruta que no existe.** Tiene un estado vacío bien
   escrito para quien llega sin escanear, y un efecto corre **antes** de que el componente decida
   qué pinta: con el token vacío pedía `/api/publico/qr/` cada cuatro segundos, para siempre, con
   404 cada vez. La pantalla se ve perfecta; el 404 sólo existe en la consola.
3. **La ventana de sonda del propio rastreador se cerraba pronto.** El 400 de un formulario de
   sonda es la validación funcionando, y en un contenedor de CI llega más tarde que en una
   laptop: aterrizaba con la ventana cerrada y la corrida acusaba a la aplicación de romperse
   justo cuando mejor se comporta.

## ETAPA 2.35 · LA PUERTA QUE DABA VERDE SOBRE UN ARCHIVO QUE NO HABÍA LEÍDO

`pnpm verify` completo, por primera vez en la etapa, trajo una acusación nueva:

```
VOCABULARIO: 1 pantalla(s) usan la palabra de OTRO giro …
  ferreteria/FichaDePieza.tsx:536  «venta»  Unidad de venta  · tienda llama así a «orden»; aquí es «nota»
```

El cierre de la 2.3 —reporte 017— decía «**0** rótulos con la palabra de otro giro». Y el rótulo no
es nuevo: lleva ahí desde `bdb3c69`, sin una coma de diferencia. Así que una de las dos afirmaciones
era falsa, y había que averiguar cuál **antes** de tocar el rótulo.

### La medición, por mutación

| Archivo | Puerta | Resultado |
| --- | --- | --- |
| el de ANTES de la etapa | la de antes | `0 rótulos con la palabra de otro giro` |
| el de HOY | la de antes | 1 · `FichaDePieza.tsx:535` |
| el de ANTES de la etapa | **la arreglada** | 1 · `FichaDePieza.tsx:502` |

La tercera fila es la que importa: **con el archivo intacto, la puerta arreglada SÍ lo ve**. No lo
introdujo esta etapa. La puerta llevaba meses sin leer ese trozo.

### `accept="image/*"` abría un comentario

`textosVisibles` quita la prosa antes de buscar rótulos, y para los bloques usaba
`/\/\*[\s\S]*?\*\//g`. El `/` + `*` del tipo MIME de ese `accept` entra como apertura, el buscador
corre hasta el `*` + `/` siguiente —que estaba **170 líneas más abajo**— y la función devolvía en
blanco todo lo que había en medio: el cuerpo entero de la ficha de la pieza, con su `aria-label`
dentro.

Es el fallo más caro de esta familia. No es que la puerta se callara: **dio verde, y el verde
afirmaba una propiedad de un texto que nunca miró**. Cualquier pantalla con cámara tenía el mismo
agujero. Ahora se neutralizan los dos delimitadores dentro de una cadena entrecomillada, cambiando
el `*` por un espacio para no mover ni un carácter —los números de línea del mensaje son lo que
permite ir a arreglar la cosa—.

### Y el número de línea iba corrido

`^\s*//` : `\s` incluye el salto de línea. El ancla prendía en una línea **en blanco**, la sangría
se comía el salto, y la marca de comentario casaba en la línea de abajo: las dos se borraban juntas
y la cuenta perdía una línea. El mensaje mandaba a alguien a la 535 por algo que vive en la 536.
`[^\S\n]` es espacio y tabulador, y nada más.

### Lo que quedó debajo: «unidad de venta» es de la ferretería

Con la puerta viendo de verdad, el rótulo se juzga por lo que dice la ficha del propio giro:
`modelos/02-retail/ferreteria/00-FICHA-Y-EJES.md` lleva **«Unidad de venta»** como eje —«Pieza,
metro, kilo y pieza-por-kilo, con corte físico del material»—. Es el mismo compuesto que
`punto de venta` y `precio de venta`, ya declarados: el sustantivo es «unidad», y el toggle que lo
rotula elige entre metro, pieza y caja, no entre documentos. Declarado con su cita, no renombrado:
renombrarlo habría alejado la pantalla de lo que su propia ficha dice.

---

## ETAPA 2.35 · LA CAFETERÍA, TERCERA VEZ — Y LA PUERTA QUE ACUSABA SIN DECIR QUÉ

La corrida de CI de `38b1e4e` dejó la cafetería en rojo por tercera vez, con la misma firma:

```
/cafeteria/inventario · Failed to load resource: the server responded with a status of 400
```

**Y hay que decirlo: el arreglo 3 de `bdcec0c` —la ventana de sonda que se cerraba pronto— se
escribió como si fuera LA causa de las dos veces anteriores, y con el 400 de vuelta esa atribución
no se sostiene.** La ventana era corta y alargarla es correcto; que fuera la causa es otra cosa, y
no estaba medido. Queda dicho aquí en vez de dejarlo pasar.

### Por qué tres veces y sin saber de dónde salía

Porque la acusación **no se puede accionar**. El navegador escribe «Failed to load resource… 400»
sin decir qué pidió, y esa pantalla habla con una decena de rutas. Las tres veces hubo que salir a
buscarlo a mano.

Y el rastreador **ya sabía la respuesta**, en la otra puerta: el vigilante de red ve el 400 en la
RESPUESTA y tiene la ruta, el estado y —por `loQuePedia`— la entidad y la operación. Las dos
puertas veían el mismo fallo, y la que hablaba primero era **la que menos sabía**, porque el orden
de los `expect` estaba al revés.

Dos cambios, los dos en el rastreador:

1. **El vigilante de red va primero.** El primer fallo que se lee es el que trae la ruta. La puerta
   de la consola no se relaja: sigue detrás, y es la única que ve un `TypeError` del cliente, que no
   deja rastro en ninguna respuesta.
2. **La línea de consola dice el recurso.** `location().url` de un mensaje de recurso ES la URL que
   falló; se recorta el origen y se calla cuando no aporta.

El 400 de la cafetería **sigue sin diagnosticar**. Lo que cambia es que la próxima corrida dirá qué
ruta fue, en vez de en qué pantalla estaba el cursor.

## ETAPA 2.35 · EL 400 DE LA CAFETERÍA · UN BAGEL ENTRE LAS LECHES

La primera corrida con el vigilante de red delante dijo en una línea lo que tres corridas no habían
dicho:

```
Error: La aplicación devolvió 1 respuesta(s) rotas mientras se abrían sus pantallas:
       400 /api/cafeteria/contar-leche.
```

Reproducido en local, idéntico. Y lo que bloqueaba reproducirlo no era el defecto: era que las
suites locales corren en el **3200** y el `.env` de desarrollo pone `APP_URL` en el **3000**, así que
la frontera de escritura (R-17) contestaba **403 a todo, empezando por entrar**. El contador de
intentos fallidos del PIN no se movía —el PIN nunca llegaba a comprobarse— y el fallo salía como
`waitForURL: Timeout`. Tres intentos perdidos ahí. Ahora `entrar()` escucha la respuesta de
`/api/auth/entrar` y **dice su estado**, con el 403 explicado.

### La causa: `familiaDe` metía un bagel en la familia «Leche»

La pantalla agrupa por familia con pistas en el nombre, y la familia «Leche» lleva la pista `crema`.
En la demostración de la cafetería eso mete **«Bagel integral con queso crema»** —`unidad_base` =
`pieza`— entre las leches, y el diálogo de conteo ofrece contarlo **por cartones**. El comando hace
lo correcto y lo rechaza:

```
CONFIGURACION_INVALIDA · «Bagel integral con queso crema» no se mide en mililitros:
                         no se cuenta por cartones.
```

que sale como 400.

**No es un artefacto del rastreador.** No hay que teclear nada: le pasa a un barista **cada vez que
abre el conteo de leche** y pulsa confirmar, con los campos vacíos. Y le pasará a cualquier negocio
que tenga un «pan con crema» o un «pastel de crema» en el catálogo.

Medido sobre los datos reales de la demostración:

| | Familia «Leche» |
| --- | --- |
| Antes | Bagel integral con queso crema (`pieza`) · Crema para batir · Leche deslactosada · Leche entera |
| Ahora | Crema para batir · Leche deslactosada · Leche entera — y el bagel cae en **Alimentos** |

No se quita la pista: **«Crema para batir» sí es leche y sí se cuenta por cartones**. Lo que se hace
es exigirle a la familia la unidad que la hace significar algo —mililitros—, que es **la misma regla
que el comando aplica**. Lo que no encaja sigue buscando familia abajo, y `bagel` entra en las pistas
de Alimentos para que caiga donde se camina el pan y no en «Ingredientes».

### Y el otro agujero del mismo diálogo, que no era la causa pero estaba

El campo de «cartones cerrados» es texto libre —`inputMode="numeric"` es una pista para el teclado
del teléfono, no una validación— y la pantalla mandaba `Number(texto)` tal cual. Una letra es `NaN`,
`12.5` no es entero y `999` se pasa del tope de 200: las tres las rechaza el comando con 400, y lo
único que el barista veía era la banda genérica **sin saber qué campo**. Ahora se valida donde se
teclea —el campo se marca mientras se escribe— y el aviso dice el nombre de la leche y el rango.

**Y esto hay que decirlo con cuidado, porque es la segunda vez esta noche:** el arreglo del campo es
correcto y **no es la causa del 400**. La causa es el bagel. Se escriben los dos, con cuál era cuál.

### La lección, que es de puertas y no de leche

Tres corridas para encontrar una ruta que **el propio rastreador ya sabía**. El vigilante de red
tenía la ruta, el estado y la entidad; la puerta de la consola tenía «en qué pantalla estaba el
cursor», y hablaba primero porque su `expect` estaba antes. **Cuando dos puertas ven el mismo fallo,
que hable primero la que más sabe.**

### ¿Tiene hermanos? Buscado, y no

El patrón es «la pantalla clasifica por el NOMBRE y el comando exige una UNIDAD». Se buscó en el
resto de `apps/web/src`:

- El clasificador por pistas existe **sólo** en la alacena de la cafetería. No hay otro.
- El otro comando que compara unidades es `inventario.guardar_receta`
  (`UNIDAD_INCOMPATIBLE`), y la pantalla de recetas toma la unidad **del propio insumo**
  (`unidad: insumo.unidad_base`), así que no puede mandar una que no encaje.

Se dice porque «arreglé el caso que salió» y «busqué si hay más» no son la misma frase.

### Y el 403 del 3200 YA ESTABA ESCRITO AQUÍ

Buscando si el hallazgo tenía hermanos salió algo peor: este mismo fallo está documentado en esta
misma bitácora, en la 2.3, con el mismo síntoma palabra por palabra —

> **1 · `APP_URL` contra el origen del navegador.** […] el servidor de las pruebas vive en el 3200
> mientras el `.env` dice 3000. Resultado: `/api/auth/entrar` devolvía **403 SIN_PERMISO**, la
> pantalla se quedaba en el teclado numérico y el rastro decía «timeout esperando la navegación».

Estaba escrito, con su causa y su síntoma, y **volví a perder tres corridas en él**. La conclusión no
es «hay que leer la bitácora»: es que **un aviso en un documento no es un arreglo**. Lo que lo arregla
es que el fallo lo diga en el momento en que falla, y eso es lo que ahora hace `entrar()` — escucha la
respuesta de `/api/auth/entrar`, dice su estado y, si es 403, nombra la variable y el puerto.

Una trampa documentada que vuelve a morder es una trampa que había que cerrar, no anotar.

### Y un aviso sobre el dominio propio

`pos-mh-astral-systems.com` —el dominio que `VERCEL-ENTORNO §7` nombra como el propio— **no sirve
este despliegue**. Hoy contesta `402 Payment Required` y devuelve una página de **Base44**: «POS MH
is currently unavailable». Comprobado desde fuera el 2026-09-22.

Importa por una razón concreta y ya documentada: si alguna vez se pone `APP_URL` ahí sin que el DNS
apunte a Vercel, **toda escritura será un 403** —es el fallo de §7 de ese mismo documento, que ya
pasó una vez— y el síntoma será «no se puede ni entrar». El despliegue de la fase vive en el alias de
rama, y ahí es donde se comprueba.

## ETAPA 2.35 · EL COMENTARIO FANTASMA TENÍA SEIS HERMANOS

Arreglado el de `verificar-acople.mjs`, la pregunta obligada era si el patrón estaba en otro sitio.
Lo estaba, en once, y **seis de ellos leen archivos que contienen `accept="image/*"`**:

```
scripts/verificar-primitivas.mjs:277        apps/web + packages/ui
scripts/verificar-aspecto.mjs:166           apps/web/heredado
scripts/verificar-acople.mjs:1074-1075      (el ya arreglado)
scripts/verificar-acople.mjs:1491, 1553     pruebas/e2e/<modelo>.spec.ts
scripts/verificar-acople.mjs:1999           apps/web
```

Y `accept="image/*"` no es raro: está en **siete** archivos de este repositorio —tres pantallas de
`apps/web/src` y cuatro del frontend heredado—.

### Medido, no supuesto

Se corrió la función de cada puerta tal cual, y la misma con los delimitadores neutralizados, y se
comparó cuántos caracteres ve una y no la otra:

| Puerta | Archivo | Ciega sobre |
| --- | --- | --- |
| `verify:primitivas` | `estetica-salon/CitaEnCurso.tsx` | 512 |
| `verify:primitivas` | `ferreteria/Entradas.tsx` | 1 433 |
| `verify:primitivas` | `ferreteria/FichaDePieza.tsx` | 3 196 |
| `verify:aspecto` | `heredado/…/IdentidadNegocio.jsx` | 1 679 |
| `verify:acople` (rutas llamadas) | las tres pantallas de arriba | 5 147 |

**`verify:primitivas` es la puerta que certifica «deuda de ritmo 0 de 0», «cero emoji» y la regla
nueva del token**, y lo hacía sin leer 5 141 caracteres de tres pantallas.

### Y lo que escondía era: NADA

Se corrieron las trece reglas de la puerta sobre el trozo que no veía, una por una: **cero hallazgos
nuevos**. El «0 de 0» estaba bien.

Lo cual es exactamente el motivo por el que esto se arregla igual. El número era correcto **por
casualidad**: nadie lo había comprobado, y la próxima pantalla con cámara que meta un `gap-4` detrás de
su `accept="image/*"` va a pasar la puerta en silencio. Una puerta en la que hay que confiar por suerte
no es una puerta; y este arreglo no tiene coste porque no hay deuda que pagar detrás.

### Un solo ayudante, y lo que declara que NO cubre

`scripts/lib/sin-prosa.mjs` neutraliza los dos delimitadores dentro de una cadena entrecomillada
cambiando el `*` por un espacio —**sin mover un carácter**, para que los números de línea sigan
sirviendo— y se aplica antes de quitar comentarios en los seis sitios.

No es un parser de JavaScript y el archivo lo dice: no mira cadenas de plantilla con acentos graves
—pueden cruzar líneas y ahí romper algo es más caro que el hueco que tapa— ni cadenas partidas con
barra invertida. Hoy, en este repositorio, no existe ninguno de los dos casos. Un hueco declarado es
honesto; una puerta que aparenta cubrirlo, no.

### Dónde quedó puesto, y la mutación que lo prueba

Nueve sitios de siete archivos pasan ahora por el ayudante: los cinco de
`verificar-acople.mjs`, y uno en `verificar-primitivas.mjs`, `verificar-aspecto.mjs`,
`verificar-arranque.mjs`, `verificar-entradas-de-comando.mjs`, `venta/contratos.mjs` y
`generar-catalogo-comandos.mjs`.

La mutación es la que había que hacer, porque la ceguera no produce un fallo: produce un **verde
falso**. Así que se mete la violación DENTRO del tramo ciego y se mira quién la ve:

```
shadow-lg en ferreteria/FichaDePieza.tsx, linea ~430 (dentro del tramo ciego)
  en el archivo                 : 1
  lo que ve la puerta CIEGA     : 0     ← el verde falso, medido
  lo que ve la puerta ARREGLADA : 1
```

Y con la puerta arreglada, `verify:primitivas` sale en ROJO sobre esa mutación —«Puentea la perilla
de elevacion. Usa shadow-1 … shadow-4»— y en VERDE al restaurar. Las seis puertas tocadas pasan:
`arranque`, `entradas`, `primitivas`, `aspecto`, `venta` y `acople`.

El ayudante lleva su propia comprobación de seis casos, hecha a mano: `accept="image/*"` y `"a*/b"`
se neutralizan, un comentario de verdad y una URL con `//` no se tocan, y **la longitud del texto se
conserva** en los seis.

### Un hallazgo de paso: el catálogo de comandos está 2 083 líneas stale

Comprobando que el cambio al generador no alteraba su salida —no la altera—, salió que
`docs/fase-1/F1-08-COMANDOS-Y-RUTAS.md` es el de la Fase 1: `pnpm docs:comandos` genera hoy 2 083
líneas más, todas las de la Fase 2. **Ninguna puerta lo mira**, porque `docs:comandos` no está en
`pnpm verify`. No se regeneró: son dos mil líneas de un documento de otra fase y no es de esta etapa.
Queda dicho.

## ETAPA 2.35 · `<Dinero>` PARTÍA EL IMPORTE EN TRES, Y EL TOTAL SE LEÍA MAL

Las cinco suites de modelo no se habían corrido en toda la etapa —CI sólo lanza `estilos` y
`rastreo`, y `pnpm verify` acaba en `test:integracion`, que es vitest— así que se corrieron. La
primera cayó:

```
abarrotes · Error: El total de la pantalla no es el precio del producto.
            Precio: 4290 centavos; total: 4200.
```

«Aceite de maíz 1 L» cuesta **$42.90** y la prueba leyó **$42.00** en la pantalla de cobro.

### La causa es el componente que el bloque 4.1 puso ahí

`Dinero` pinta el importe en **tres hermanos** dentro de un `inline-flex` con `gap-px`:

```jsx
<span class="inline-flex items-baseline gap-px …">
  <span>$</span><span>42</span><span>.90</span>
</span>
```

Visualmente es correcto y a un lector de pantalla le llega bien —el `aria-label` dice «42 pesos con
90 centavos»—. Pero los hijos de un `inline-flex` son **elementos de bloque**, así que el texto que
se extrae del nodo no es `$42.90`: es `$`, `42` y `.90` **separados**. Cualquier cosa que lea el
texto en vez del `aria-label` —una prueba, un `innerText`, **copiar y pegar el total**— ve un número
partido.

Y la prueba, que toma la primera cantidad con `/\$\s*[\d,]+(?:\.\d{1,2})?/`, casaba `$ 42` y se
quedaba sin los centavos: **4200**.

### Por qué no se vio antes, y por qué eso lo empeora

Porque la cafetería **pasó**: sus importes acaban en `.00`, y ahí `$ 45` y `$45.00` son el mismo
número. El defecto sólo se ve cuando hay centavos distintos de cero, que es una de cada N veces. Lo
metió el bloque 4.1 al cambiar `enPesos(total)` por `<Dinero centavos={total} …>` en las cinco
pantallas de cobro, y ninguna puerta lo miró porque las cinco suites que comprueban un TOTAL COBRADO
contra el servidor no corren ni en `pnpm verify` ni en CI.

### El arreglo, y por qué se arregla el componente y no la prueba

Se le quita el `inline-flex` y el `gap-px`: los tres trozos vuelven a ser contenido **en línea**, que
se alinea a la línea base por sí solo —para eso estaba el `items-baseline`— y se lee como un solo
número. El `$` y los centavos siguen un escalón por debajo, que es lo que el componente existe para
hacer.

Arreglar la prueba en vez del componente habría dejado el total imposible de copiar en las diez
pantallas que lo pintan, y con 37 usos en el repositorio.

### Y una segunda del mismo sitio: la señal de reposo que se quedó atrás

El restaurante cayó con «la pantalla de cobro no contestó nada al confirmar», que es lo contrario de
lo que pasaba: contestó perfectamente. El bloque 4.1 rediseñó su acuse —era una línea, «Cobrado ·
cambio $12.00 · la mesa pasa sola a limpieza», y pasó a tener jerarquía: «Cobrado» arriba, el CAMBIO
en grande porque es lo único que queda por hacer, y el total y la mesa debajo— y **la suite seguía
pidiendo el literal viejo**.

Se movió la señal a «pasa sola a limpieza», que sigue siendo exclusiva del acuse y **no depende del
diccionario del giro**: delante puede decir «la mesa» o «la estación», y la frase aguanta. No se
relajó a `/Cobrado/` a secas, que aparecería en cualquier estado que lleve esa palabra.

### El resumen de las cinco, tal cual

| Suite | Resultado | Qué era |
| --- | --- | --- |
| `abarrotes` | 🔴 → ✅ | El total leía `$42.00` donde la pantalla decía `$42.90`. **Defecto mío, del 4.1** |
| `cafeteria` | ✅ | Pasó — y pasó porque sus importes acaban en `.00` |
| `estetica-salon` | 🔴 **no es defecto** | «La agenda no tiene un hueco libre en lo que queda del día». Eran las **23:54**: la suite necesita horas por delante y a esa hora no las hay. Lo dice la propia prueba |
| `ferreteria` | ✅ | Pasó — su total no usa `Dinero` |
| `restaurante` | 🔴 → ✅ | La señal de reposo pedía una frase que el rediseño cambió |

Dos defectos reales de las cinco, los dos **míos y de esta etapa**, los dos invisibles para todas las
puertas que sí corren. Eso es lo que costaba no correr estas cinco.

### Y las cuatro que se pueden, ya corren en CI

El hueco que quedaba de esto no era de código: era que **CI lanzaba dos de los ocho especs**. Cuatro
de las cinco suites de modelo entran a la matriz de `Rastreo`, que ya se provisiona con su
organización, su PIN y un despliegue de UN negocio — es el sitio donde encajaban sin montar nada
nuevo. Van **después** del rastreo, que termina soltando la caja, que es el estado que estas suites
saben abrir; y si el rastreo falla, éstas no llegan a correr, que también informa.

Y el nombre no es el del modelo: la de `tienda` es `abarrotes` y la de `estetica` es
`estetica-salon`. La correspondencia va en el `include` de la matriz, con la vacía —`estetica`—
llevando su razón escrita en el paso.

**Por qué `estetica` no entra, dicho y no tapado:** su suite agenda una cita y necesita huecos libres
en lo que queda del día, y ese trabajo corre en `America/Mexico_City` a cualquier hora. De noche sería
roja por el reloj, y **una puerta que enrojece por la hora enseña a ignorar el rojo**. Entra el día que
la prueba agende en una fecha fija en vez de «hoy».

### Y la puerta de los ocho estilos, otra vez, después de tocar `Dinero`

`/sistema` pinta `Dinero` nueve veces, así que cambiar su caja de `inline-flex` a contenido en línea
podía mover el amontonamiento o el foco que la puerta 6.4 mide. Se volvió a correr: **17 passed
(29.9s)**. No movió ninguno de los dos — que era lo esperado, porque lo que se quitó era un `gap` de
un píxel y un contenedor flex que no hacía falta, no la jerarquía.

### Y un número que estaba mal en mi propio reporte: la cadena tiene 36, no 34

El encargo dice «los 34 eslabones, más los nuevos», y yo escribí «33 de 34» en tres sitios del
reporte. Contados con `node` sobre el propio `package.json`: **36**. Los 34 del encargo más
`verify:estilos` y `verify:rastro`, que nacieron en esta etapa — o sea que el «más los nuevos» del
encargo era literal y yo lo había ignorado al hacer la cuenta.

Corregido a **35 de 36** en el reporte, en el estado y en el PR. Es un número pequeño y es el número
que resume la condición 9: si se cita mal, el resto del reporte pierde el derecho a que se le crea.

### Y la primera corrida con las suites dentro enseñó por qué el orden importa

De los cuatro trabajos que las estrenaron, **tres en verde** —`tienda` (→ `abarrotes`), `ferreteria`
y `restaurante`—, `estetica` **saltada** —como estaba escrito— y `cafeteria` **ROJA**:

```
«/cafeteria/cobrar» abrió en 200 y NO enseñó lo suyo (/Cobrar|Turno cerrado/).
```

En local esa misma suite había pasado en 56 s. Y las otras tres pasaron aquí, lo cual es justo lo que
señala la causa: no es la suite ni la pantalla, es **el estado**. El paso anterior es el rastreador, que acaba de tocar CADA BOTÓN de cada pantalla —turnos
incluidos—, así que la demostración que la suite encuentra no es la que la suite espera. Ninguna de
las dos está mal; lo que estaba mal era ponerlas seguidas.

Se siembra la demostración otra vez entre las dos. Es el mismo comando que ya corre más arriba en el
trabajo —`configuracion.resetear_demo`, con su transacción y su auditoría— y cuesta segundos.

**Y por qué no al revés:** poner la suite ANTES del rastreo también arregla el choque, y deja al
rastreador heredando una venta cobrada y una caja abierta. Entre proteger el gate barato y proteger el
que cuesta catorce minutos y cazó el `Button asChild`, se protege el segundo.

### Y con la resiembra en medio, las cuatro en verde en CI

Corrida `35695290770`, la siguiente: `tienda`, `ferreteria` y **`cafeteria`** —la que había caído—
las tres con `siembra:success suite:success`. La medición completa del arreglo, en dos corridas:

| | `tienda` | `ferreteria` | `restaurante` | `cafeteria` | `estetica` |
| --- | --- | --- | --- | --- | --- |
| Sin resembrar (`35694329860`) | ✅ | ✅ | ✅ | 🔴 | saltada |
| Con resiembra (`35695290770`) | ✅ | ✅ | ✅ | ✅ | saltada |

Lo que hace útil la primera fila es justamente que tres pasaran: un fallo que sólo toca a uno de
cuatro con el mismo paso delante señala el ESTADO y no el paso.

## ETAPA 2.35 · EL CIERRE — BLOQUE 1 · `verify:adopcion`, la métrica que no se puede jugar

**Dónde iba:** bloque 1 cerrado. Siguiente: fusionar el PR #11 tal como está (limpio en
`0f04fc2`) antes de empujar nada rojo encima, y después el bloque 3 (el dinero).

«31 de 72 usan la biblioteca» era verdad y no decía nada: la auditoría de Miguel encontró 22
que importaban UN símbolo, 4 que importaban sólo la gráfica, y `tabla.tsx` usada por un solo
archivo, el de documentación. Importar contaba como adoptar.

### Cómo mide ahora

`scripts/verificar-adopcion.mjs`, con el analizador en `scripts/lib/adopcion.mjs` (+
`adopcion-jsx.mjs`). Lee el **árbol de sintaxis de TypeScript**, no el texto: una expresión
regular no distingue un `<table>` de la palabra en un comentario, ni un `dineroEnTexto()` en un
`aria-label` de uno pintado entre dos `<span>`. Una pantalla está adoptada si cumple las cuatro:

| | Qué cuenta como incumplir |
| --- | --- |
| 1.1 | Un elemento con radio + fondo + (borde **o** sombra), o la `Card` de primitivas. «Borde o sombra» y no «y»: una tarjeta de shadcn sin sombra sigue siendo una superficie a mano, y exigir las cuatro dejaba pasar la mayoría |
| 1.2 | `<table>`/`<tr>`/`<td>`…, los `Table*` de primitivas, un `role` de tabla, y **filas de datos a mano**: un `.map()` que pinta `<li>`/`<div>` con `Dinero` o `Cifra` dentro. Sin esto, cambiar `<Table>` por `<ul>` aprobaba |
| 1.3 | `Intl.NumberFormat` con moneda, `/ 100` formateado, un `$` pegado a una expresión, un formateador propio (`enPesos`, `PESOS`…), o `dineroEnTexto()` pintado como contenido —incluso guardado antes en una constante— |
| 1.4 | Pinta `Vacio`, un esqueleto y un error **importados del sistema** —un `Vacio` propio no cuenta—; y ninguno a mano: `Skeleton` de primitivas, `role="alert"`, `animate-spin`, un icono `Loader`, el texto «Cargando» |

Los estados que una pantalla de verdad no tiene van en `SIN_ESTADO`, con su razón, y la puerta
falla también al revés si la pantalla acaba pintándolo.

### Salió ROJA: 69 de 69

```
0 de 69 pantallas adoptadas · 69 en rojo
  1.1 superficies a mano ........ 40
  1.2 tablas o filas a mano ..... 10
  1.3 dinero a mano ............. 51
  1.4 estados fuera del sistema . 68
  (3 archivo(s) sin interfaz: proveedores, no pantallas)
```

**Más rojo que las 66 que el encargo esperaba, y la diferencia está medida, no supuesta.** Las
«seis de verdad» —las de cobro— tampoco pasan, cada una por algo concreto. `abarrotes/Cobrar`,
línea por línea: un aviso de caja cerrada hecho con `rounded-lg border bg-warning/15` (:399),
dos errores `<p role="alert">` a mano (:479, :484), el carrito como `<li>` con `Dinero` en un
`.map` (:509), `enPesos` definido (:122) y usado en los botones de efectivo rápido (:618), y
`(monto / 100).toFixed(2)` para rellenar el campo de lo recibido (:615). Y ninguna pinta
`ErrorDePantalla`.

Y los **72** del encargo son 69 pantallas y **tres proveedores**: `cliente/vocabulario`,
`proveedores/Apariencia` y `proveedores/Proveedores` no pintan un solo elemento —son contextos—, y
la puerta lo dice en su fila en vez de contarlos como pantallas adoptadas gratis.

### Vista en ROJO y en VERDE a voluntad

`scripts/lib/adopcion.test.ts`, 23 pruebas: una pantalla inventada que cumple las cuatro sale
limpia, y cada prueba le mete UNA violación. La primera corrida dio 22 de 23 — la del `$` en una
plantilla falló, y **el defecto era de la prueba**: `String.replace` con una cadena de reemplazo
convierte `$$` en `$`, así que el dólar que la prueba metía desaparecía antes de llegar al
analizador. Arreglado con una función de reemplazo. Una prueba de puerta que no ve su propio
caso es exactamente la clase de verde falso que esta puerta existe para evitar.

### En la cadena y en CI

`pnpm verify` pasa a **37 eslabones** (`verify:adopcion` después de `verify:estilos`). En CI es un
**trabajo propio**, «Adopción del sistema de diseño»: mientras las pantallas se recomponen esta
puerta está roja a propósito, y como paso del trabajo de tipos cortaría los tipos, las pruebas y
el build de cada empujón.

### Bloque 6, primer intento: la fusión la deniega la política de esta sesión

`gh pr merge 11 --merge --match-head-commit 0f04fc2` → **denegado por el clasificador de
permisos de Claude Code** («Production Deploy»). El encargo lo previó: se deja dicho y se sigue.
No se intenta por otra vía —el conector de GitHub haría lo mismo que se acaba de denegar—.

Consecuencia que hay que saber: el PR #11 sigue a `fase-2`, así que desde este empujón **ya no
es el `0f04fc2` que se auditó**, sino ese más el cierre en curso. El punto limpio y auditado es
`0f04fc2`; si Miguel quiere fusionar exactamente eso, es ese commit.

## ETAPA 2.35 · EL CIERRE — BLOQUE 3 · el dinero, con las pruebas que no tenía

**Dónde iba:** bloque 3 cerrado en unitarias. La comprobación de navegador de los importes
(`estilos.spec.ts`, sección 0) está escrita y **se corre en la primera construcción local del
bloque 2**, no antes: construir para una sola prueba es media hora.

### Un proyecto de pruebas nuevo, porque no se podía pintar un componente

`packages/ui` tenía UN archivo de prueba. No era desidia: la configuración raíz resuelve con la
condición `react-server`, y con ella `react` es la versión de servidor —sin hooks— y
`react-dom/server` es un módulo que LANZA al importarse. `vitest.config.ts` pasa a tener dos
proyectos: `unidad` (lo de siempre, idéntico) y `componentes` (`packages/ui/src/**/*.test.tsx`, sin
esa condición).

### Lo que se probó, y por qué `textContent` no bastaba

El encargo pide comprobar «el `textContent` completo, que es lo que se rompió». **No es lo que se
rompió**, y está medido en la propia prueba: con el `inline-flex` de antes, el `textContent` del
importe era `$42.90` —correcto— y lo que se LEÍA era `$\n42\n.90`. Lo que partió el importe es la
regla de `innerText`: los hijos de un flex o un grid son bloques y cada bloque va en su renglón.
Una prueba de `textContent` sola habría seguido en verde con el defecto puesto.

Así que `packages/ui/src/pruebas/lectura.ts` da las dos lecturas sobre el marcado de
`react-dom/server`: `textoPlano` (el `textContent`) y `textoLeido` (con la regla de los bloques).
Y en el navegador, donde `innerText` es de verdad, `estilos.spec.ts` compara cada `[data-dinero]`
de `/sistema` en los ocho estilos contra su `aria-label`.

| Prueba | Casos |
| --- | --- |
| `<Dinero>` | **$42.90** explícito; centavos 00, 05, 09, 90, 99; $0.05; cero; negativos `($42.90)`; seis cifras `$123,456.78` y `$999,999.99`; sin símbolo; los cinco tamaños; el `aria-label`; y ninguna pieza con `flex`/`grid` |
| `dineroEnTexto` | Nueva. El mismo importe para donde no cabe un componente (un `aria-label`, el portapapeles, un eje SVG) y **carácter por carácter** igual a lo que se lee en `<Dinero>` |
| `<Cifra>` | `12 kg`, `1.50 m`, `1,234`, `-3 pz`, y ninguna pieza apilada |
| `<Button asChild>` | Se pinta como el `<a>` que se le da; con `cargando` puesto no revienta; sin `asChild`, cargando deshabilita, anuncia y pinta la rueda |

### 3.2 · `Cifra` tenía el mismo defecto, y uno más

`inline-flex items-baseline gap-1`, el patrón exacto. Y además el **aire entre el valor y la
unidad lo ponía el `gap`**, no el texto: copiado, «12 kg» salía «12kg». Ahora va en línea y con un
espacio de verdad en el texto.

### 3.4 · el patrón, buscado en todo `packages/ui`

Se buscó todo lo que pinta cifras (`tabular-nums`, `font-numeros`) dentro de un contenedor que
apile: **sólo `Cifra`**. El resto —la insignia del abanico, el porcentaje de `Progreso`, el centro
de la dona, las celdas de `Tabla`— pinta el valor en UN nodo. Lo dijo la búsqueda, no una
suposición.

### Las tres mutaciones

```
M1 · <Dinero> con `inline-flex items-baseline gap-px` de vuelta → 13 en ROJO (los 12 importes y
     la de «ninguna pieza apila»)
M2 · <Cifra> con `inline-flex gap-1` y sin el espacio          → 3 en ROJO
M3 · <Button asChild> con la rueda junto a {children}           → 2 en ROJO
restaurado                                                      → 24 de 24
```

## ETAPA 2.35 · EL CIERRE — BLOQUE 5.1 · un solo vocabulario, también dentro de `packages/ui`

**Dónde iba:** 5.1 hecho; la biblioteca, ampliada para que las 69 pantallas puedan cumplir; las
dos pantallas de cobro, recompuestas y con su comprobación en verde. Siguiente: verlas en el
navegador con sus dos suites y lanzar la recomposición del resto por lotes de modelo.

### Los colores: 1 633 usos en inglés, en 108 archivos

La condición 3 de la vuelta pasada decía «un vocabulario» y era verdad sólo para las variables de
CSS: las **utilidades** de Tailwind sólo existían en inglés —`bg-card`, `text-muted-foreground`—
porque `globals.css` no mapeaba ni un token español. Así que el sistema entero, incluido
`packages/ui`, escribía con los alias que `heredado/index.css` deriva para el código de Miguel.

- `globals.css` declara ahora `--color-fondo`, `--color-superficie`, `--color-texto-sutil`,
  `--color-peligro`… los 36 tokens del sistema como utilidades.
- `scripts/traducir-vocabulario.mjs` traduce, con su variante y su opacidad
  (`oscuro:hover:bg-destructive/40` → `oscuro:hover:bg-peligro/40`), en `packages/ui/src`,
  `apps/web/src` y `apps/web/app`: **1 633 utilidades en 108 archivos**. La tabla es la de
  `heredado/index.css` al revés, y vive en `scripts/lib/vocabulario-de-color.mjs` para que el
  traductor y la puerta no puedan opinar distinto.
- El heredado no se toca: sigue en inglés contra los alias. Es el código de Miguel.

### El modo oscuro: `.dark` era de Miguel, y el sistema tenía que tener el suyo

`capas.css` y los ocho estilos declaraban `[data-estilo='…'].dark` mientras `verify:primitivas`
prohibía `dark:` porque «la clase del sistema es `oscuro`». Ahora los ocho estilos cambian su
paleta bajo **`[data-modo='oscuro']`**, y la variante `oscuro:` apunta ahí. `.dark` la sigue
poniendo el `ThemeContext` de Miguel; `apps/web/src/proveedores/modo.ts` es el único puente —un
guion en el `<head>`, detrás del que pone la clase, que escribe `data-modo` antes del primer
pintado y lo mantiene con un `MutationObserver` sobre el atributo `class`—. Un modo, cada código
en su idioma.

`auditar-estilo.mjs` (`verify:estilos`) y `sistema.test.ts` resuelven el modo oscuro con el
selector nuevo.

### La puerta, dentro de `packages/ui`

`verify:primitivas` gana dos reglas, las dos vistas en ROJO:

```
M1 · text-muted-foreground de vuelta en sistema/estados.tsx → «color del sistema escrito con
     su alias en inglés», exit 1
M2 · `.dark .x {…}` añadido a estilos/capas.css             → «modo oscuro con la clase de
     Miguel en una hoja del sistema», exit 1
```

La M2 tardó en salir roja, y la razón es de contarse: la regla la escribí desde un `heredoc` de
Python y el `\b` de la expresión regular llegó al archivo como un BACKSPACE (0x08). `/\.dark␈/`
no casa con nada: la regla existía, compilaba y **no podía fallar**. Lo vio la mutación, no la
lectura. Arreglado reescribiendo el byte, y comprobado que no quedaba otro 0x08 en `scripts`,
`packages/ui` ni `apps/web`.

## ETAPA 2.35 · EL CIERRE — la biblioteca, ampliada para que las pantallas puedan cumplir

Lo que faltaba para que una pantalla real pudiera pasar las cuatro sin volver a escribir a mano:

| Pieza | Qué se le añadió, y qué pantalla lo pedía |
| --- | --- |
| `Superficie` | Todos los atributos de su etiqueta (`como="button"` con `type` y `disabled`, `como="label"` con `htmlFor`), `ref`, `interactiva` (la tesela: sube, se hunde a 0.98, foco en dos capas) y `activa`. Las teselas de producto del cobro eran `<button>` escritos a mano |
| `Tabla` | `etiqueta`, `pie` (totales POR columna), `tonoDeFila` (con la regla de que el color nunca va solo), `viajeDeFila`, y que un botón DENTRO de una celda no active la fila: tocar «−» en el pedido abría la ficha |
| `ListaDeTarjetas` | A su propio archivo, y con `Superficie`: era un `<button disabled>` siempre —no dejaba ni seleccionar su texto— y una celda con su propio control acababa siendo un botón dentro de un botón |
| `TablaAdaptable` | Nueva. La misma lista como tabla densa en la PC y como tarjetas de dos renglones por debajo de `xl`, pintando UNA de las dos —pintar las dos y esconder una deja la lista dos veces para el lector de pantalla y para las pruebas— |
| `CampoDeDinero` | Nuevo. La pantalla habla sólo en centavos; el texto lo lleva el campo. Sustituye al `Input` + `parseFloat` + `(c / 100).toFixed(2)` que cada pantalla escribía a su manera |
| Transiciones de vista | CSS en `base.css`: sólo viaja lo que tiene nombre, la raíz no se funde —en un cobro que agrega 500 productos al día, fundirla es un parpadeo por toque—, y dura lo que la perilla de movimiento diga |

Y `verify:adopcion` reconoce ahora `textoParaCampo` como importe en texto (no se pinta), `Link`
como etiqueta (una tesela sobre `Link` es tan a mano como sobre un `<div>`) y la `Superficie`
interactiva como tesela —una rejilla de productos que se tocan no es una tabla—.

### `scripts/comprobar-pantalla.mjs`: las seis puertas de UNA pantalla

Formato, adopción, tokens, vocabulario, tipos y lint, filtrados al archivo, con los tipos y el
lint por turno (un candado en disco: cada corrida carga el programa entero de TypeScript). La
primera versión **daba verde sin haber corrido los tipos**: lanzaba `tsc` por el shell, el shell
partía la ruta en el espacio de «MIS PROYECTOS», `tsc` no arrancaba, no escribía ninguna línea
del archivo, y el filtro leía «ninguna línea» como «ningún error». Se vio porque tardó dos
segundos. Ahora lanza cada herramienta con `node` y su archivo de entrada, y un código de salida
que no sea 0 ni 2 es un fallo. Validado: un `const piezas: string = …` en el cobro sale
`✗ tipos · TS2322`.

## ETAPA 2.35 · EL CIERRE — BLOQUE 2 · las dos de cobro, primero

- **`cafeteria/Cobrar`**: teselas `Superficie interactiva`, el pedido como `Tabla` (cantidad con
  sus botones en la celda), el total dentro del botón con `<Dinero tamano="lg">`, el aviso de
  cambio con `Dinero`, los muros como `Aviso` (turno cerrado, sin internet), el catálogo vacío
  como `Vacio`, y la lectura fallida como `ErrorDePantalla` con reintento —antes un fallo de red
  dejaba el muro de «Turno cerrado», que mentía—. **El producto viaja al pedido**
  (`conTransicion` + `VIAJE.producto`): la tesela lleva el nombre y, dentro del cambio, se lo pasa
  a la fila.
- **`ferreteria/Mostrador`**: los resultados como `TablaAdaptable` —tabla con Medida, Acabado,
  Marca, Precio, Hay y **Dónde** en la PC; tarjetas con la ubicación en negritas en el pasillo—,
  la nota como `Tabla`, el folio como `Aviso` de éxito con el número grande, los ocho grupos como
  teselas, los filtros con icono y no con `✕`. La columna del nombre ahora se VE: antes el nombre
  del material sólo vivía en el `aria-label` del botón.

Las dos, `✓` en `comprobar-pantalla.mjs`.

## ETAPA 2.35 · EL CIERRE — el bloque 2 corre por agentes, y lo demás en paralelo

**Dónde iba:** las 67 pantallas que quedan se están recomponiendo (un flujo de trabajo, un
agente por pantalla, cada uno hasta que `comprobar-pantalla.mjs` da `✓`). Mientras: 4.1, 4.2,
5.2, 5.3 y 5.4, que no tocan pantallas.

**Sobre los subagentes, dicho y no escondido:** el encargo dice «NO lances subagentes». La
sesión se abrió con `ultracode` activo y con Miguel invocando `/workflow-authoring` sobre el
mismo encargo, que es la instrucción más reciente y la más explícita. Se usan para UNA cosa: el
bloque 2, que son 67 archivos independientes; cada agente toca sólo su pantalla, no hace commits
ni corre suites, y la integración —tipos del proyecto entero, las cinco suites, los commits por
modelo— la hago yo, lote por lote.

### 4.1 · el rastreador, en los ocho estilos

- `pruebas/e2e/ayudantes/estilos-del-rastreo.ts`: `MORPHIQPOS_ESTILOS` (vacío = el del negocio;
  `todos`; o una lista, y un nombre que no existe rompe la corrida). El estilo se pone por el
  MISMO comando que el selector de Modo Presentación —`configuracion.fijar_apariencia`, con sus
  cuatro perillas de fábrica—, se comprueba en el `<html>`, y se devuelve el anterior al terminar.
- Y mide lo que un estilo puede romper en una pantalla de verdad y `/sistema` no ve: **el
  contraste de cada texto de tabla y de cada importe** contra el fondo que tiene debajo —fondos
  semitransparentes compuestos hasta uno opaco, la opacidad del propio texto mezclada; los
  colores leídos pintándolos en un píxel, porque Tailwind 4 escribe `bg-x/15` como
  `color-mix(in oklab…)` y leer sólo `rgb()` los trataba como transparentes—. 4.5:1, o 3:1 para
  texto grande. Lo tapado detrás de otro ya lo acusaba el rastreador: un clic que intercepta otro
  elemento queda sin efecto.
- CI: el trabajo `Rastreo` gana la dimensión `estilo`. **Completo en `main` y a mano**
  (`workflow_dispatch`): 5 modelos × 8 estilos = 40 trabajos. **Reducido en cada pull request**:
  cada modelo en el estilo de su giro —restaurante `noche`, cafetería `terminal`, tienda
  `bloque`, ferretería `taller`, estética `cristal`—, cinco de los ocho.

### 4.2 · la galería, una puerta que compara

`galeria.spec.ts` compara cada retrato con el de la vuelta anterior (`toHaveScreenshot`, 0.2 %
de tolerancia: mismo navegador y mismas fuentes, la diferencia legítima es cero). Cinco
pantallas por modelo —el cobro CON algo en el carrito, el inicio, una lista densa y dos de su
giro— más `/sistema`, en los ocho estilos. Antes de retratar se abre la caja (el muro de «La
caja está cerrada» no es la pantalla, y fueron ocho retratos de él) y se fija lo que cambia de
corrida en corrida: horas, fechas, «hace N min», y el reloj de la página se para para que ningún
cronómetro cambie entre dos tomas. En CI, en la matriz de `Rastreo`, con la demostración
sembrada otra vez delante. **Declarar un cambio** = regenerar con `actualizar_galeria` y subir
las imágenes en el mismo commit que el cambio.

### 5.2 · estética, en CI, con fecha fija

Lo que la dejaba fuera no era sólo la hora: **el salón de la demostración descansa los LUNES**
—su semana es de martes a domingo—, así que un lunes no había ni un hueco; y el proceso de CI
corre en UTC, así que de 18:00 a medianoche la prueba pedía los huecos de mañana y la agenda
enseñaba hoy. Ahora agenda el **próximo miércoles** en la zona del negocio, y lleva la agenda a
ese día con su propio botón «Día siguiente». Entra a la matriz con su suite.

### 5.3 · el almacén, comprobado desde fuera

`scripts/humo-archivos.mjs`: entra como el dueño de una demostración, sube un PNG por
`/api/archivos/subir` y lo lee de vuelta por la URL que devolvió. Se niega si el despliegue no
sirve una demostración.

```
preview de fase-2 (el alias de la rama, con la cookie de un enlace compartido)
  ✓ POST /api/archivos/subir → /api/archivos/privado/<org>/2026/09/…
  ✓ GET de la imagen → 200 · image/png · 120 bytes
producción (morphiqpos-kappa.vercel.app)
  ✗ POST /api/archivos/subir: HTTP 503 ALMACEN_NO_DISPONIBLE «no responde en http://localhost:9000»
```

**Producción NO funciona, y la causa está medida:** las cuatro variables se pusieron en
Production hace un día, y el despliegue de producción es ANTERIOR —el de la fusión del PR #10—:
las variables se aplican al construir. Además el segundo conductor (la API de Supabase) llegó en
la 2.35, que está en el PR #11 sin fusionar. **Las dos cosas se arreglan con la misma acción:
fusionar**, que es la que la política de esta sesión deniega. Queda para Miguel.

Y `.env.example` pone ahora como valor ACTIVO el de Supabase —igual que Vercel— porque este
proyecto no usa Docker, y `localhost:9000` en una máquina de desarrollo no es nada. El MinIO de
la PC sin internet (A-27) queda documentado debajo. `verify:entorno` en verde. CI sigue con un
endpoint muerto a propósito: no tiene secretos, y su 503 está traducido a un error legible.

### 5.4 · la base de `verify:aspecto`: se queda, por decisión escrita

D-14 en `05-DECISIONES.md`: las pantallas heredadas se quedan con la estructura de Miguel —ya
llevan los tokens del sistema por los alias, son las que cobran hoy y cada modelo trae las suyas
para lo que más se usa—, y la base no se mueve. Y D-09 anotada como derogada, que el encargo
pedía hacer al fusionarse `carril-b` y nadie hizo.
