# F2 · Prompt 01 · Construir los cinco primeros modelos

Fecha: 14 de septiembre de 2026
Ejecuta: **Claude Code**
Alcance: código de `restaurante`, `cafeteria`, `abarrotes`, `ferreteria` y `estetica-salon`

Pégalo tal cual en una sesión nueva de Claude Code, abierta en `D:\MIS PROYECTOS\Master POS`.

---

```
Fase 2 de MorphiqPOS. Trabajas SOLO, con AUTONOMÍA TOTAL, y no te detienes
hasta terminar. No me preguntes nada: decide, documenta en la bitácora y
sigue. Todo lo que necesitas saber ya está escrito en archivos; si dudas de
algo, la respuesta está en un MD, no en mi cabeza.

═══════════════════════════════════════════════════════════════════════
CARGA ESTAS SKILLS ANTES DE NADA
═══════════════════════════════════════════════════════════════════════

/morphiq-prs                    ← el estándar de entrega. Es la definición
                                  de terminado, no una sugerencia
/full-output-enforcement        ← prohibido truncar código o poner
                                  "resto del componente aquí"
/contratos-por-mutacion         ← una prueba que pasa con y sin el arreglo
                                  no prueba nada
/supabase-vercel-produccion     ← reglas del stack
/vercel-react-best-practices
/vercel-composition-patterns
/ui-ux-pro-max
/web-design-guidelines
/impeccable

OJO CON ui-ux-pro-max: su primera instrucción es generar un sistema de
diseño antes de escribir código. NO LO HAGAS. El sistema de diseño ya
existe: son los tokens de packages/ui y el index.css de Miguel, y están
descritos en 04-SISTEMA-DE-DISENO.md. Usa esa skill para la CALIDAD de
cada pantalla —jerarquía, densidad, estados, responsive— no para inventar
una paleta nueva. Si generas un sistema de diseño, rompes los 78 modelos
de golpe.

═══════════════════════════════════════════════════════════════════════
LEE ESTO, COMPLETO, EN ESTE ORDEN. ES TU CONTEXTO ENTERO.
═══════════════════════════════════════════════════════════════════════

Todo vive en D:\MIS PROYECTOS\Master POS\fase-2\

  1. 00-LEEME-PRIMERO.md         quién es Miguel, en qué fase vamos, las
                                 reglas que no se negocian, el stack
  2. 05-DECISIONES.md            ★ EMPIEZA AQUÍ SI TIENES PRISA. Las once
                                 decisiones tomadas. D-07 a D-11 son las
                                 que gobiernan ESTE trabajo
  3. 01-MAPA-GENERAL.md          78 modelos, 10 arquetipos, 6 ejes
  4. 03-CATALOGO-DE-FUNCIONES.md los IDs canónicos F-XXX
  5. 04-SISTEMA-DE-DISENO.md     qué se mantiene igual y qué cambia por
                                 modelo, y por qué
  6. 02-ESTANDAR-DE-CARPETA.md   el contrato de documentación
  7. 07-ESTADO.md                qué está hecho

Y después, los CINCO modelos, sus siete archivos cada uno:

  fase-2/modelos/01-alimentos/restaurante/
  fase-2/modelos/01-alimentos/cafeteria/
  fase-2/modelos/02-retail/abarrotes/
  fase-2/modelos/02-retail/ferreteria/
  fase-2/modelos/03-servicios-cita/estetica-salon/

Son casi 20 000 líneas y NO te caben de una sentada. Léelas por etapas:

  AHORA        los seis MD de cimientos, completos
               + los cinco `01-FUNCIONES.md`, completos
  AL ENTRAR    los otros cinco archivos de ESE modelo (ficha, dinero,
  A CADA       inventario, interfaz, datos) — no antes
  ETAPA

Si intentas leerlo todo en la etapa 0, llegas a la etapa 3 sin contexto.

DÓNDE ESTÁ TU LISTA DE TRABAJO, y esto importa porque es fácil
equivocarse de archivo:

  `01-FUNCIONES.md` §5 · LO QUE FALTA     ← la lista de pendientes
  `05-DATOS-Y-BACKEND.md`                 ← comandos, rutas y migraciones
                                            de cada pendiente
  `FILE-MAP.md` §2                        ← SÓLO las rutas de destino

El FILE-MAP **no es la lista de pendientes**: mezcla archivos nuevos con
otros marcados «YA EXISTE», y delega. Abarrotes manda sus 20 rutas de API
al 05 §6, ferretería sus 27, y cafetería delega su interfaz entera al 05
§9. Si trabajas sólo del FILE-MAP, pierdes más de setenta rutas y ocho
archivos de UI.

═══════════════════════════════════════════════════════════════════════
QUÉ VAS A CONSTRUIR
═══════════════════════════════════════════════════════════════════════

Código real, que compila, tipa y pasa pruebas, para los cinco modelos.
No documentación: la documentación ya está hecha. CÓDIGO.

Los números que siguen son **filas de la tabla §5**, no funciones: varias
filas son rangos. `F-610…F-617` son ocho funciones en una fila; `F-940…
F-945` son seis. La cuenta real es de dos a cuatro veces mayor. Cuéntalas
tú al entrar a cada etapa y anótalo en la bitácora, para que el plan sea
tuyo y no mío.

El tamaño de cada uno es MUY distinto y eso es a propósito:

  restaurante      ~8 funciones pendientes. Ya está construido al 90%.
                   Es tu banco de pruebas: valida el tronco contra código
                   que YA funciona en un negocio real.
  cafeteria        ~15 pendientes. Primer heredero. Demuestra que la
                   herencia funciona: si acabas duplicando restaurante,
                   algo salió mal.
  abarrotes        ~11 pendientes + ES LA RAÍZ DEL ARQUETIPO A1. Lo que
                   construyas aquí lo heredan 18 modelos de retail.
  ferreteria       ~13 pendientes. Hereda de abarrotes: el 70% de su
                   árbol va [=]. Si escribes dos inventarios, fallaste.
  estetica-salon   ~12 pendientes + TODO EL ARQUETIPO A3, QUE NO EXISTE.
                   El bloque F-4xx del catálogo está a cero: agenda,
                   profesional, comisión, expediente. Es el más grande de
                   los cinco y el de mayor valor comercial: desbloquea 22
                   modelos.

═══════════════════════════════════════════════════════════════════════
LO MÁS IMPORTANTE QUE TIENES QUE ENTENDER
═══════════════════════════════════════════════════════════════════════

NO construyes cinco sistemas. Construyes UN sistema con cinco plantillas.

Concretamente, el inventario de estos cinco modelos NO son cinco
inventarios. Es:

  UN TRONCO           F-100 a F-109: existencia por almacén, ledger
                      inmutable, decremento atómico al cobrar, kardex,
                      ajuste con motivo, traspaso, toma física,
                      valuación, alertas.
                      Se escribe UNA vez. Idéntico en los 78 modelos.

  TRES VARIANTES      V6 receta y peso  → restaurante, cafeteria  (YA EXISTE)
                      V3 presentaciones → abarrotes, ferreteria   (construir)
                      V1 tiempo + V6/V2 → estetica-salon          (construir)

  CINCO PANTALLAS     ahí sí son cinco, y ahí vive la diferencia que
                      Miguel quiere. Pero se arman con los MISMOS
                      componentes de packages/ui. Cambia cómo se acomodan
                      y qué se pone grande, no de qué están hechas.

El agente que documentó abarrotes ya demostró que V2 (stock simple) es V3
con factor de conversión 1. No construyas V2 aparte.

La regla, en una línea: si dos modelos hacen lo mismo, UN código con una
perilla. Si hacen algo distinto aunque se llame igual, tronco compartido
más estrategia. NUNCA dos copias.

Y el riesgo, también en una línea: el error caro no es duplicar, es
marcar algo como [=] cuando en realidad diverge. Antes de reutilizar,
compara campo por campo contra la tabla de tres columnas que ya está
escrita en el 01-FUNCIONES.md del modelo.

═══════════════════════════════════════════════════════════════════════
ETAPA 0 · RECONCILIAR EL CATÁLOGO · antes de una sola línea de código
═══════════════════════════════════════════════════════════════════════

Decisión D-11. Los cinco modelos se documentaron EN PARALELO y cada uno
propuso IDs de función nuevos por su cuenta: unas 50 propuestas.

LAS COLISIONES REALES SON DOS, verificadas archivo por archivo, y las dos
son entre cafeteria y abarrotes:

    F-146    cafeteria: merma de barra   ·  abarrotes: caducidad sin lote
    F-148    cafeteria: frescura del grano · abarrotes: EAN-13 con peso

`estetica-salon` NO colisiona con nadie: leyó lo que propuso abarrotes y
arrancó en F-154 a propósito. Está escrito en su §6. Verifícalo antes de
reasignarle un solo ID — si lo "arreglas", rompes algo que ya estaba bien.

Ojo con el arrastre: `estetica-salon/FILE-MAP.md` §3 ya cita F-146 con la
acepción de abarrotes. Al asignar el ID definitivo, arrastra esa cita.

  0.1  Lee los cinco 01-FUNCIONES.md y recoge TODA la sección
       "FUNCIONES QUE FALTAN EN EL CATÁLOGO" de cada uno.
  0.2  Recoge también las reclasificaciones propuestas (hay al menos 8:
       F-815 deja de ser exclusiva de A9, F-029 deja de ser [=], y las
       3 de ferreteria y 3 de estetica).
  0.3  Resuelve colisiones. Asigna IDs definitivos en el bloque que le
       toca a cada función según su familia (F-1xx inventario, F-2xx
       venta y caja, F-4xx agenda, etc.).
  0.4  Si dos modelos propusieron la MISMA función con distinto nombre,
       fúndelas en una. Eso es trabajo ahorrado y hay que cazarlo ahora.
  0.5  Actualiza 03-CATALOGO-DE-FUNCIONES.md: añade, reclasifica,
       recalcula el conteo del final.
  0.6  CORRIGE los cinco 01-FUNCIONES.md y FILE-MAP.md para que citen el
       ID definitivo. Si no lo haces, cuarenta carpetas futuras van a
       citar números equivocados.
  0.7  Renumera las migraciones de los cinco 05-DATOS-Y-BACKEND.md a su
       rango de la decisión D-08. Hoy están solapadas.
       ANTES DE NUMERAR, lista packages/data/src/migraciones/sql/ y mira
       cuál es el último real: en carril-b ya existe
       057_resumen_pagos_por_orden.sql, de Codex. Tu tronco arranca en
       058, y si Codex escribió más mientras tanto, más arriba.
       Y ARREGLA LAS REFERENCIAS CRUZADAS: cafeteria/FILE-MAP.md dice que
       su migración 077 depende de la 066 de restaurante. Si renumeras
       una y no la otra, la dependencia apunta al vacío.

  AVÍSAME AL TERMINAR LA ETAPA 0, con el número de IDs añadidos, las
  colisiones que encontraste y las funciones que fusionaste.

═══════════════════════════════════════════════════════════════════════
ETAPA 1 · EL WORKTREE
═══════════════════════════════════════════════════════════════════════

Decisión D-07. Codex está trabajando AHORA MISMO en
D:\MIS PROYECTOS\Master POS\morphiqpos-codex sobre la rama carril-b,
cerrando la Fase 1. NO TOQUES ESE DIRECTORIO NI ESA RAMA.

DÓNDE CORRER EL COMANDO, porque no es obvio: el repositorio de verdad
está en D:\MIS PROYECTOS\Master POS\morphiqpos. `morphiqpos-codex` no es
un clon, es un WORKTREE suyo — su .git es un archivo de una línea que
apunta allá. Y la raíz `D:\MIS PROYECTOS\Master POS` no tiene .git.

Así que el comando se corre DESDE `morphiqpos`:

  cd "D:\MIS PROYECTOS\Master POS\morphiqpos"
  git worktree add "D:\MIS PROYECTOS\Master POS\morphiqpos-fase2" -b fase-2 carril-b

Eso NO contradice la prohibición de más abajo. Leer el índice de git de
`morphiqpos` y colgarle un worktree nuevo no es tocar ese árbol: lo
prohibido es editar sus archivos o su rama. Si la rama `fase-2` o el
directorio destino ya existen, usa otro nombre y anótalo en la bitácora.

LO PRIMERO, ANTES DE CUALQUIER CÓDIGO (decisión D-13): copia
`D:\MIS PROYECTOS\Master POS\fase-2\` dentro del worktree como
`docs/fase-2/` y haz commit. Desde ese momento **ésa es la copia
canónica**: ahí editas el catálogo, el estado y la bitácora, y se empuja
con cada etapa. La carpeta de fuera no está bajo control de versiones y
todo lo que produzcas ahí vive en un solo disco sin respaldo — que es
exactamente el fallo que costó cuatro días en la Fase 1.

Después:

  pnpm install
  pnpm typecheck        debe pasar antes de que escribas nada
  pnpm test:unit        debe pasar antes de que escribas nada

Si algo viene roto de carril-b, NO LO ARREGLES: es territorio de Codex.
Anótalo en la bitácora y sigue. Lo único que te importa es que tu punto
de partida sea reproducible.

Cada vez que Codex publique en carril-b, haz `git merge carril-b` y
resuelve en caliente. No acumules divergencia.

CREA TU PROPIA PUERTA DE CALIDAD. Añade a package.json:

  verify:fase2 = `pnpm verify` COMPLETO, MENOS DOS ESLABONES:
                 quita `verify:esquema` y `verify:rls`. Nada más.

Ésas dos son las ÚNICAS que consultan la base viva. Todas las demás son
análisis estático y tienen que correr, porque son justo las que vigilan
lo que este encargo te exige: `verify:primitivas` y `verify:aspecto`
obligan a que los componentes salgan de packages/ui; `verify:pruebas`
impide escribir una prueba de integración que nunca corre;
`verify:escrituras` y `verify:lecturas` vigilan el puente. Tirarlas para
ir más rápido es desarmar las puertas que te protegen.

DOS AVISOS SOBRE ESA CADENA:

· `verify:mutaciones-backend` aplica mutaciones buscando CADENAS DE TEXTO
  LITERALES en archivos concretos. Si refactorizas el inventario a
  estrategias, algunas de esas cadenas dejan de existir y el arnés falla
  con "no se pudo aplicar la mutación" — que NO es lo mismo que un
  defecto. Cuando pase: actualiza la mutación para que apunte al texto
  nuevo, conservando lo que la mutación probaba. NUNCA la borres para
  poner la cadena en verde.

· `pnpm build` en la Fase 1 falló con el NODE_ENV no estándar que hereda
  el archivo de entorno. Córrelo con NODE_ENV=production.

POR QUÉ NO USAS `pnpm verify` COMPLETO, y esto es importante:
`verify:esquema` y `verify:rls` comparan el código contra la base VIVA.
Tú vas a escribir migraciones que NO se aplican (ver etapa 2). Si tocas
scripts/esquema-esperado.json esas dos puertas se ponen rojas y no es un
defecto tuyo, es que la base todavía no tiene tus tablas.

  → NO toques scripts/esquema-esperado.json. Ni una línea.
  → Tu puerta es verify:fase2 y tiene que salir en 0.
  → verify:esquema y verify:rls se regeneran al acoplar, no ahora.

═══════════════════════════════════════════════════════════════════════
ETAPA 2 · EL TRONCO COMPARTIDO · de esto depende todo lo demás
═══════════════════════════════════════════════════════════════════════

Migraciones en el rango 058–069. ESCRITAS, NO APLICADAS.
(057 ya la usó Codex. Comprueba el directorio antes de numerar.)

  2.1  F-015 · Plantilla de negocio
       El selector de arquetipo y paquete.

       LO QUE YA HIZO CODEX, verificado por mí en la base viva: las
       columnas organizaciones.giro y organizaciones.paquete YA están
       separadas (migración 054). Los cuatro negocios vivos tienen
       valores coherentes: restaurante/restaurante_pro,
       cafeteria/restaurante_pro, tienda/operativo, ferreteria/operativo.
       LÉELO en el código antes de tocar nada.

       LO QUE TE TOCA A TI: el renombre de la decisión D-01, y OJO
       PORQUE AQUÍ SE ROMPEN DOS CLIENTES SI LO HACES PLANO.

       Un `update` directo de `operativo → cafeteria` arrastra a Abarrotes
       Don Chuy y a Ferretería La Broca —que hoy están en `operativo`— a
       la plantilla de un negocio de café. Dos clientes que pagan.

       LA MIGRACIÓN PARTE POR GIRO, no por paquete (decisión D-12):

         giro restaurante|cafeteria + paquete restaurante_pro → restaurante
         giro restaurante|cafeteria + paquete operativo       → cafeteria
         giro tienda|ferreteria     + paquete operativo       → tienda
         cualquier giro             + paquete esencial        → tienda

       Resultado sobre los cuatro vivos: Restaurante MH y Café Jacaranda
       quedan en `restaurante`; Don Chuy y La Broca en `tienda`.

       Café Jacaranda se queda en `restaurante` AUNQUE SU GIRO SEA
       CAFETERÍA: tiene contratado el paquete completo con mesero y
       cocina, y bajarlo a `cafeteria` le quitaría módulos que paga. El
       giro dice qué NEGOCIO es; el paquete dice qué COMPRÓ. Por eso Codex
       los separó en la 054.

       Se escribe, se prueba, y NO SE APLICA. Anota en el FILE-MAP que el
       acople exige aplicarla con los negocios cerrados y respaldo hecho.

       Y ojo con lo que el renombre arrastra: `tienda` no es sólo un
       nombre nuevo. Una tienda sin inventario no es una tienda. Le
       faltan stock, presentaciones, código de barras y mínimos. Eso lo
       resuelve la etapa E5 (abarrotes); aquí sólo dejas el renombre.
       Incluye F-016 perillas por módulo, pero léete primero la decisión
       pendiente P-01 en 05-DECISIONES.md: la recomendación es plantilla
       como preajuste + perillas detrás de una pantalla de administrador.
       Impleméntalo así. Si al construirlo descubres que no se sostiene,
       cámbialo y escribe la razón en la bitácora.

  2.2  F-017 · Diccionario de vocabulario
       Una entidad interna, N nombres visibles. Singular, plural Y
       GÉNERO — el español lo exige y "el bahía" mal conjugado delata el
       sistema en tres segundos. Ver 04-SISTEMA-DE-DISENO.md §3.
       Aplica también a mensajes de error y estados vacíos. Ahí es donde
       más se nota el descuido.

  2.3  Tronco de inventario · F-100 a F-108
       OJO: el tronco idéntico llega hasta F-108, no hasta F-109. La
       F-109 (merma con motivo) está marcada [≠] en el catálogo y va
       como estrategia, porque la merma de una cocina, la de un lote
       caducado y la de un corte de cable no se registran igual.

       Lo que ya existe se REUTILIZA, no se reescribe. Hoy hay
       existencia, ledger, decremento atómico, ajuste y alertas
       funcionando en packages/. Falta construir kardex (F-103),
       traspaso (F-105), toma física (F-106) y la merma como estrategia
       (F-109), y completar valuación (F-108), que está parcial.
       El tronco no sabe NADA de variantes. Si el tronco tiene un `if`
       que pregunta por el giro, está mal hecho.

  2.4  Las variantes como estrategias
       packages/domain/inventario/variantes/
       V6 ya existe: extráela a estrategia sin cambiar su comportamiento,
       y demuéstralo con las pruebas que ya pasan hoy.
       V3 presentaciones y V1 tiempo se construyen en sus etapas.

  AVÍSAME AL TERMINAR LA ETAPA 2. Es el cimiento: si está mal, los cinco
  modelos salen mal.

═══════════════════════════════════════════════════════════════════════
ETAPAS 3 A 7 · LOS CINCO MODELOS, EN ESTE ORDEN
═══════════════════════════════════════════════════════════════════════

El orden no es negociable y tiene razón:

  E3  restaurante      valida el tronco contra código que YA funciona
  E4  cafeteria        primer heredero: prueba que la herencia sirve
  E5  abarrotes        raíz de A1 + variante V3 de inventario
  E6  ferreteria       hereda de abarrotes: demuestra el 70% de [=]
  E7  estetica-salon   A3 de cero: agenda, profesional, comisión,
                       expediente. El más grande.

AVISO SOBRE E3 Y E4, para que no te estrelles a mitad de camino:
casi todas las pantallas de restaurante y cafeteria viven en
apps/web/heredado/, y por la decisión D-09 NO puedes editar archivos que
ya existen ahí mientras Codex trabaje. Así que de esas dos etapas sale:
· el backend completo (comandos, entidades, migraciones, puente),
· los componentes nuevos, escritos AL LADO de los viejos,
· y en el FILE-MAP, el cambio exacto de una línea que hará falta al
  acoplar para engancharlos.
Eso es lo correcto y es lo esperado. No lo declares como incompleto: es
una entrega en dos tiempos, por diseño. Lo que sí sería un error es
editar Caja.jsx o Mesero.jsx y chocar con Codex justo en el código que
maneja dinero.

Para cada modelo, la lista de trabajo EXACTA está en su FILE-MAP.md.
Trabaja de ahí. Para cada función:

  a) Lee su entrada en el 01-FUNCIONES.md del modelo. Si está marcada
     [=], ve al modelo del que hereda, comprueba campo por campo que de
     verdad es idéntica, y REUTILIZA. Si difiere aunque sea un campo,
     reclasifícala a [≠] y anótalo en la bitácora.
  b) Lee las reglas de dinero en su 02-DINERO-Y-CAJA.md ANTES de
     escribir el comando. Es el archivo que más importa.
  c) Escribe la prueba primero en todo lo que toque dinero, stock,
     caja, agenda o comisión.
  d) Escribe el código.
  e) Mutación: quita el arreglo, confirma que la prueba se pone ROJA,
     restaura. Si no se pone roja, la prueba no vale y la reescribes.
  f) La pantalla, con el layout de PC, tablet y teléfono que ya está
     descrito en su 04-INTERFAZ.md. No lo reinventes, está decidido.

  Commit por función o por grupo pequeño, con el ID:
     "F-321: dividir cuenta en restaurante"

═══════════════════════════════════════════════════════════════════════
LAS COSAS QUE MÁS FÁCIL SE ROMPEN · aprendidas a golpes en la Fase 1
═══════════════════════════════════════════════════════════════════════

DINERO
· bigint de centavos SIEMPRE. Nunca flotantes. Nunca Math.round(x*100):
  usa el parser de texto que ya existe.
· Precios y totales SIEMPRE en el servidor. El endpoint no acepta
  importes del cliente. Ni uno.
· Las propinas NO entran en ventas, utilidad, costo ni margen. Nunca.
· El desglose de propina por método es EXACTO, jamás proporcional.
· En estetica-salon, comisión y propina son DOS dineros de naturaleza
  contraria —gasto contra pasivo— que salen del mismo cajón la misma
  noche. Su 02-DINERO-Y-CAJA.md explica cómo se separan. Respétalo.
· En abarrotes, la mitad de lo que pasa por el cajón NO ES DEL NEGOCIO:
  recargas, recibos de luz, abonos de fiado, cascos. Si no los separas,
  el cajón no cuadra nunca. Está resuelto en su MD; impleméntalo tal cual.

AUTORIZACIÓN
· Server-side, por sesión. NUNCA por un campo del cuerpo.
· Un comando que declare rol, organizacion_id, sucursal_id, empleo_id,
  identidad_id o terminal_id en su entrada NO COMPILA. Es a propósito.
· Toda entidad nueva del puente declara rolesLectura. Es obligatorio a
  nivel de tipo: si no lo declaras, no compila.

DATOS
· Cobro, caja, stock, cita y pedido: transaccionales e idempotentes.
· Stock: ledger inmutable, decremento atómico, falla en vez de silenciar.
· Migraciones NUEVAS en tu rango (D-08). NUNCA edites una aplicada: el
  ejecutor valida por hash y aborta.
· btree_gist para el solape de citas: está DISPONIBLE en el Supabase de
  Miguel (lo verifiqué: versión 1.7, disponible, sin instalar). La
  carpeta de estetica-salon lo marcó como riesgo bloqueante. NO LO ES.
  Pero constrúyelo en DOS CAPAS, siempre las dos, no una u otra:
    1. La restricción de exclusión GiST en la base. Es la que de verdad
       impide que dos citas se encimen bajo concurrencia.
    2. La comprobación en el comando, ANTES de escribir. Es la que
       devuelve un error entendible al usuario, y la única que puedes
       probar sin base de datos — que es tu situación durante toda esta
       fase, porque las migraciones no se aplican.
  La migración sigue el patrón que Codex dejó con pg_cron: si la
  extensión no está disponible, avisa y continúa. Nunca `create
  extension` a pelo, porque eso rompió el ensayo de restauración en un
  Postgres pelón y costó una sesión entera averiguarlo.
· Cero SQL concatenado. Cero sql.raw, cero sql.lit.
· CUIDADO con comparar dos parámetros interpolados sin columna tipada de
  por medio: Postgres los resuelve como TEXTO. Eso ya pasó en la Fase 1
  con la cuota de archivos y se saltaba el límite en silencio. Castea
  siempre.

CÓDIGO
· Cero any, cero @ts-ignore, cero catch vacío en packages/.
· Ningún archivo nuevo sobre 300 líneas.
· Los componentes salen de packages/ui. Si necesitas uno nuevo, va a
  packages/ui, no dentro de una pantalla.
· NO inventes diferencias visuales. La diferencia entre modelos sale de
  los seis ejes del 04-SISTEMA-DE-DISENO.md, y cada uno está justificado
  en el 04-INTERFAZ.md del modelo. Diferenciar por diferenciar es tan
  malo como no diferenciar.

═══════════════════════════════════════════════════════════════════════
LO QUE NO PUEDES TOCAR
═══════════════════════════════════════════════════════════════════════

1. D:\MIS PROYECTOS\Master POS\morphiqpos-codex — el worktree de Codex.
2. La rama carril-b. Sólo la lees para fusionarla hacia ti.
3. Los ARCHIVOS de D:\MIS PROYECTOS\Master POS\morphiqpos — el árbol
   viejo. Su .git sí lo usas: es el repositorio real y de ahí cuelga tu
   worktree. Lo prohibido es editar sus archivos o su rama.
4. ARCHIVOS QUE YA EXISTEN dentro de apps/web/heredado/ (decisión D-09).
   Codex está arreglando ahí las propinas, el bucle de cobro y qr_token.
   Editar los mismos archivos en dos ramas garantiza conflictos en el
   peor sitio posible: el que maneja dinero.
   · Lo nuevo va a packages/ y a apps/web/app/. Archivos nuevos: cero
     conflicto.
   · Si una pantalla vieja de heredado/ tiene que cambiar, ESCRIBE EL
     COMPONENTE NUEVO AL LADO (por ejemplo
     heredado/components/caja/DividirCuentaDialog.jsx) y anota en el
     FILE-MAP.md del modelo el cambio exacto de UNA LÍNEA que hará falta
     al acoplar.
   · Crear un archivo nuevo dentro de heredado/ SÍ se permite. Modificar
     uno que ya existía, NO.
5. scripts/esquema-esperado.json. Ni una línea.
6. El proyecto Supabase de Pastelería Confetti (ivqcxdpqxwjxfohiswqb).
   Ni para leer. Es de un cliente que paga.
7. La base viva wyqmzhliurwyxuyxznpb: puedes LEERLA para verificar cómo
   quedó algo, pero NO apliques migraciones ni escribas datos.

═══════════════════════════════════════════════════════════════════════
DECIDES TÚ, SIN PREGUNTAR
═══════════════════════════════════════════════════════════════════════

Nombres de archivos, funciones y tablas · cómo partir un componente ·
qué librería usar y en qué versión · el orden dentro de una etapa si
encuentras una dependencia que el plan no vio · cómo escribir cada
prueba · qué mutación usar · errores que encuentres en la documentación,
incluidos los míos · cualquier cosa reversible.

Si dudas entre preguntar y decidir: DECIDE, y escríbelo en
docs/fase-2/BITACORA.md con la razón — dentro del worktree, que es la
copia canónica (D-13). Créala si no existe.

Permisos, acotados: Supabase CLI y la base viva **en modo lectura**, para
verificar cómo quedó algo. GitHub con `push` a tu rama. El .env local lo
lees, no lo mueves ni lo copias a ningún sitio. No escribas en la base, no
despliegues, no cambies configuración de Vercel ni rotes ninguna
credencial. El repositorio es público.

═══════════════════════════════════════════════════════════════════════
LO QUE ESTÁ BLOQUEADO ESPERANDO A MIGUEL · no lo inventes
═══════════════════════════════════════════════════════════════════════

Hay cinco cosas que las carpetas marcaron como "la decisión la toma
Miguel". NO las construyas y NO inventes una arquitectura para ellas.
Déjalas documentadas como pendientes y sigue:

  · F-940…F-945 · CFDI 4.0. Es la decisión pendiente P-02 y ferretería la
    marca como bloqueante suya. Ningún PAC, ningún timbrado, ningún
    complemento de pago en esta pasada.
  · F-988 · el lector de código de barras con peso embebido de abarrotes.
  · Los avisos por WhatsApp (estética §6.3): no elijas proveedor.
  · F-318 · impresión de comanda en restaurante (§5.2): depende de qué
    hardware tenga Miguel.
  · F-249 · segunda pantalla para el cliente en cafetería (§5.5).

Lo ÚNICO que haces con ellas: dejar el hueco limpio. Que la entidad tenga
los campos que van a hacer falta —RFC y régimen fiscal en el cliente, por
ejemplo— para que meterlo después no obligue a migrar todo. Eso sí, y
nada más.

La diferencia entre "decide tú" y "esto está bloqueado" es simple: decides
todo lo reversible. Esto no lo es — mete un proveedor externo, un costo
mensual o una obligación fiscal.

Si al construir descubres que la documentación está equivocada —y va a
pasar, son 22 000 líneas escritas sin código delante— CORRIGE EL MD y
anótalo. La documentación sirve al código, no al revés.

═══════════════════════════════════════════════════════════════════════
GIT
═══════════════════════════════════════════════════════════════════════

· TODOS los commits a nombre de:  M1gu3hb <enchuer2797@gmail.com>
  Configúralo en el worktree antes del primer commit:
      git config user.name "M1gu3hb"
      git config user.email "enchuer2797@gmail.com"
  Y verifica con `git log --format='%an <%ae>'` que salga así. En la
  Fase 1 esto se revisó y tiene que seguir saliendo bien.

· EMPUJA A origin/fase-2 AL TERMINAR CADA ETAPA. No al final.
  En la Fase 1 se acumularon 41 commits de trabajo de seguridad en un
  solo disco durante cuatro días. No lo repitas.

· El repositorio es PÚBLICO. Cero secretos en commits, en reportes o en
  código. El .env está en .gitignore y ahí se queda.

· Commits pequeños, con el ID de la función.

═══════════════════════════════════════════════════════════════════════
CÓMO SE SABE QUE UN MODELO ESTÁ TERMINADO
═══════════════════════════════════════════════════════════════════════

Las cinco, obligatorias:

  1. Todas las funciones de su FILE-MAP.md están construidas, o
     declaradas pendientes con su razón escrita.
  2. pnpm verify:fase2 sale en 0.
  3. Cada función que toca dinero, stock, caja, agenda o comisión tiene
     prueba, y la mutación la pone en rojo. Si la prueba pasa igual con
     y sin el arreglo, no cuenta.
  4. Las pantallas se abren en el navegador. Lo que dependa de una
     migración sin aplicar no se puede abrir: DILO EXPLÍCITAMENTE en vez
     de declararlo hecho. Una pantalla que nadie abrió no está
     terminada, sólo escrita.
  5. Su FILE-MAP.md quedó actualizado con las rutas reales del código y
     con los cambios de una línea que hará falta hacer en heredado/ al
     acoplar.

Y las cuatro preguntas del estándar §4 se vuelven a contestar CON EL
CÓDIGO DELANTE. La respuesta puede cambiar respecto a la que dio el
agente que sólo documentó. Si cambia, dilo.

═══════════════════════════════════════════════════════════════════════
REPORTE
═══════════════════════════════════════════════════════════════════════

En docs/reports/, con el siguiente folio libre que encuentres. El último
que existe hoy es `009-codex-cierre-backend.md`, pero Codex está a mitad
de su cierre y puede haber publicado el 010 antes que tú: LISTA EL
DIRECTORIO, no supongas. Nombre: `NNN-claude-code-fase2-cinco-modelos.md`,
en la rama fase-2.

  1. Etapa 0: IDs añadidos, colisiones encontradas, funciones fusionadas.
  2. Tabla por modelo: funciones construidas · pendientes · commit ·
     prueba · mutación que la valida.
  3. Salida completa de pnpm verify:fase2.
  4. Qué pudiste abrir en el navegador y qué no, y por qué.
  5. Qué documentación corregiste y por qué estaba mal.
  6. Reclasificaciones: funciones que estaban marcadas [=] y resultaron
     [≠], o al revés. Esto es lo más valioso para los 73 modelos que
     faltan.
  7. "LO QUE NO HICE" — obligatorio, y es lo que más me importa.

Actualiza también docs/fase-2/07-ESTADO.md y docs/fase-2/BITACORA.md —
los del worktree, que son los canónicos y los que se empujan.

AVÍSAME al terminar la ETAPA 0 y al terminar la ETAPA 2.

Y que quede claro qué significa "avísame", porque arriba te dije que no
preguntaras nada y las dos cosas conviven: **avisas y SIGUES**. No es una
puerta de aprobación, es un punto de control para que Miguel sepa dónde
vas. No esperes respuesta. No te detengas. Nunca.

Arranca por la ETAPA 0: reconciliar el catálogo. Cincuenta IDs propuestos
por cinco agentes que no se hablaron entre sí, con colisiones seguras. Si
eso entra al código sin reconciliar, lo arrastran los 73 modelos que
faltan.
```
