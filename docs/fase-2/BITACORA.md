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
