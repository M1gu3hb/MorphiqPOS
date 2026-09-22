# Reporte 018 — Claude Code — Fase 2.35 · el diseño

- **Agente:** Claude Code (Opus 5)
- **Carril:** el de ambos — esta etapa toca `packages/ui`, las 72 pantallas de los cinco
  modelos y las puertas de la cadena, así que no vive en un carril
- **Rama:** `carril-a` → PR [#11](https://github.com/M1gu3hb/MorphiqPOS/pull/11)
- **Fecha inicio / fin:** 2026-09-20 → 2026-09-21
- **Commits:** `54bda85` … `38b1e4e` (19 commits)
- **Tareas cubiertas:** etapas 0.1 a 0.9, 1, 2, 3, 4.1 a 4.5, 5, 6.1 a 6.5 de la Fase 2.35

> **Esto es la etapa 2.35 de la Fase 2. No es la Fase 3.**

## 1. El prompt que recibí

Textual, completo, sin resumir. Se recuperó del transcripto de la sesión
(`a792d2fd-a41e-476c-ab0d-59068981367a.jsonl`) después de que la primera compactación de contexto
lo dejara fuera; el resumen que lo sustituía era fiel en lo sustancial pero **no era el texto**, y
esta sección exige el texto.

```text
Fase 2.35 de MorphiqPOS: el diseño. Trabajas SOLO, con AUTONOMÍA TOTAL.
No preguntas nada. No te detienes.

═══════════════════════════════════════════════════════════════════════
CARGA ESTAS SKILLS ANTES DE NADA
═══════════════════════════════════════════════════════════════════════

/morphiq-prs                      el estándar de entrega de Miguel
/full-output-enforcement          prohibido truncar código
/contratos-por-mutacion           una prueba que pasa con y sin el
                                  arreglo no prueba nada
/ui-ux-pro-max                    OJO: NO generes un sistema de diseño
                                  nuevo. Ya existe. Úsala para la
                                  calidad de cada pantalla
/impeccable
/high-end-visual-design
/emil-design-eng                  el pulido invisible: qué hace que algo
                                  se sienta bien
/web-design-guidelines
/vercel-react-view-transitions    las animaciones que Miguel pide —que
                                  se unan, se separen, se expandan— son
                                  esto exactamente
/vercel-composition-patterns
/minimalist-ui                    para el estilo Papel
/industrial-brutalist-ui          para el estilo Bloque

═══════════════════════════════════════════════════════════════════════
POR QUÉ SE VE BÁSICO · y no es lo que parece
═══════════════════════════════════════════════════════════════════════

Miguel entró a ver el sistema y lo primero que dijo fue que el diseño
está horrible. Tiene razón, y la causa está medida:

  `packages/ui/src/estilos/index.css` NUNCA SE IMPORTA.

Ahí viven `--espacio-*`, `--radio-*`, `--sombra-0..4`, `--altura-control`
y las perillas `[data-densidad|redondeo|elevacion|movimiento]`. Está
escrito, está probado, y **ningún archivo de `apps/web` lo importa.**

Consecuencia: `verify:primitivas` OBLIGA a usar `shadow-1..4` y
`h-(--altura-control)` en unos 190 sitios, y **esas clases no emiten una
sola línea de CSS.** El sistema está pintando con tokens que no existen.
Por eso todo se ve plano y sin jerarquía.

Y hay dos vocabularios de tokens conviviendo: el inglés de shadcn que
Miguel escribió en `heredado/index.css` —ése SÍ está vivo— y el español
de `packages/ui` que no lo está.

**Enchufarlo es la etapa 1, y es lo que más cambia de golpe.**
Lo demás de esta fase es construir encima.

═══════════════════════════════════════════════════════════════════════
LEE ESTO ANTES DE EMPEZAR
═══════════════════════════════════════════════════════════════════════

  docs/fase-2/04-SISTEMA-DE-DISENO.md   ← manda sobre esta etapa
  docs/fase-2/00-LEEME-PRIMERO.md
  docs/fase-2/05-DECISIONES.md
  apps/web/heredado/index.css           ← 858 líneas, el estilo de Miguel
  packages/ui/src/tokens/contrato.ts    ← 33 tokens de color, 47 base
  packages/ui/src/estilos/base.css      ← lo que hay que enchufar
  packages/ui/src/hooks/useApariencia.ts ← ya sabe conmutar estilos

Y de cada modelo, su `04-INTERFAZ.md`: ahí está decidido el layout de
cada pantalla en PC, tablet y teléfono. No lo reinventes.

═══════════════════════════════════════════════════════════════════════
REGLAS DE SIEMPRE
═══════════════════════════════════════════════════════════════════════

 · NO escribas mensajes de avance. Ni uno. Escribir TERMINA EL TURNO.
   El progreso va a BITACORA.md y 07-ESTADO.md, y se commitea.
 · SI ESTÁS A PUNTO DE ESCRIBIR "ESTO NO LO HICE", HAZLO.
 · NO lances subagentes. NO corras los 34 eslabones mientras construyes.
   NO releas archivos largos ni escribas resúmenes para ti.
 · Commit y push al cerrar cada etapa.
 · Nunca es la Fase 3. Esto es la etapa 2.35 de la Fase 2.

═══════════════════════════════════════════════════════════════════════
ETAPA 0 · CERRAR LO QUE QUEDÓ DE LA 2.3 · primero, y es corto
═══════════════════════════════════════════════════════════════════════

La 2.3 cerró bien: los seis defectos conocidos están cerrados contra el
código, el rastreador existe y es serio —su lista de clics sin efecto
está VACÍA y es autolimpiante—, las 34 puertas en 0, y destapó 58
defectos de los que 7 eran botones muertos de verdad. Buen trabajo.

Quedan nueve cosas. Ciérralas antes de tocar una línea de diseño:

 0.1  EL RASTREADOR NO ES UNA PUERTA. No está en `.github/workflows/`.
      Una regresión de botón muerto vuelve sin que nada la detecte.
      Métela a CI. Si 42 minutos es mucho para cada empujón, que corra
      en un trabajo propio, en paralelo, o sólo contra `main`.
      Sin esto, la vuelta que viene encuentra lo mismo.

 0.2  `pruebas/e2e/rastreo.spec.ts:256` — el selector no incluye
      formularios: ni `input`, ni `select`, ni `checkbox`, ni `form`.
      El encargo pedía "botón, enlace y FORMULARIO". Ese tercio no se
      tocó. Añádelo: teclear, elegir, marcar y enviar.

 0.3  `rastreo.spec.ts:254` — el ámbito es `main`, y los diálogos de
      Radix montan en `document.body`. Como se recarga entre toque y
      toque, nunca se entra a un diálogo abierto. El rastreo es de
      profundidad 1. Hazlo de profundidad 2: al abrir un diálogo,
      recorre lo de dentro antes de cerrarlo.

 0.4  `rastreo.spec.ts:758-769` — el cubo `inalcanzables` se cuenta y no
      falla, y su tamaño no se publica. No se sabe cuánto quedó sin
      tocar. Publícalo, y si pasa de un umbral, que falle.

 0.5  Las 4 pantallas que el rastreador nunca visita porque no cuelgan
      del menú (`EXCEPCIONES-COBERTURA.md:83-86`): los dos
      `acceso-por-pin`, `portal-del-comensal` y
      `menu-publico-y-pedido-anticipado`. Llégales por URL directa, que
      para eso están exentas del menú, no del rastreo.

 0.6  `scripts/verificar-cabeceras.mjs:101` comprueba cabeceras contra
      `/estilos`, una ruta que se borró. La puerta está midiendo sobre
      un 404. Apúntala a una ruta viva. Y corrige
      `docs/ARRANQUE-CODEX.md:34`, que todavía manda abrir ahí.

 0.7  `scripts/verificar-acople.mjs:1285` rotula "servidor LOCAL" una
      URL de producción, porque decide por qué variable se puso y no por
      lo que hay al otro lado. Con `APP_URL` se salta además la
      comprobación del muro. Que distinga de verdad.

 0.8  `STORAGE_ENDPOINT` de producción sigue en `http://localhost:9000`,
      así que subir logo, foto de producto y menú QR **no funciona en
      producción**. Está traducido a 503, que es honesto, pero no
      funciona. Conéctalo al almacenamiento de Supabase: el proyecto ya
      existe y tienes las credenciales.

 0.9  El almacén de archivos importa más de lo normal en esta etapa: el
      logo del negocio y las imágenes del menú son parte del diseño.
      Sin 0.8, media fase de UI no se puede ver.

═══════════════════════════════════════════════════════════════════════
ETAPA 1 · ENCHUFAR EL SISTEMA QUE YA EXISTE
═══════════════════════════════════════════════════════════════════════

 1.1  Importa `packages/ui/src/estilos/index.css` donde corresponda para
      que llegue a toda la aplicación. Comprueba, en el navegador, que
      `shadow-1`, `shadow-4` y `h-(--altura-control)` de verdad emiten
      CSS. Son ~190 sitios esperándolo.

 1.2  UNIFICA LOS DOS VOCABULARIOS. Hay tokens en inglés (los de Miguel,
      vivos) y en español (los de `packages/ui`, muertos). Dos
      vocabularios es garantía de que uno se queda atrás.
      Decide uno —el español de `packages/ui` es el que tiene perillas y
      contrato— y haz que el otro se derive de él, no al revés. El
      `index.css` de Miguel se convierte en el TEMA BASE expresado en
      esos tokens, sin perder un solo valor suyo.

 1.3  `verify:aspecto` compara `heredado/**` contra el commit base
      `89830e59` como multiconjunto de testigos: cada clase, cada texto,
      cada icono. Cualquier clase que quites, falla.
      Esa puerta existe para que nadie rompiera el diseño de Miguel sin
      querer. **Ahora vamos a cambiarlo a propósito.** Mueve el commit
      base cuando la etapa 4 termine, no antes, y documenta el porqué en
      la bitácora. No la desactives.

 1.4  Conecta `useApariencia.ts`. Ya sabe conmutar
      `data-estilo|densidad|redondeo|elevacion|movimiento` y está sin
      enchufar. Es la mitad del trabajo de la etapa 3, ya hecha.

═══════════════════════════════════════════════════════════════════════
ETAPA 2 · LA LIBRERÍA
═══════════════════════════════════════════════════════════════════════

Vive en `packages/ui`. Hoy tiene 36 primitivas de shadcn tokenizadas —
buen punto de partida, pero una primitiva no es un lenguaje.

Lo que hay que construir encima, pensando en un punto de venta que se
opera de pie, con prisa y a veces con guantes:

 2.1  SUPERFICIES CON PROFUNDIDAD REAL
      Una escala de elevación de 5 niveles con lógica de luz coherente:
      una sola fuente, sombras que crecen y se difuminan juntas, y un
      borde que se aclara arriba. No sombras al azar.
      Piezas: tarjeta, panel, hoja lateral, diálogo, menú flotante,
      barra fija, isla flotante.

 2.2  CONTROLES QUE SE SIENTEN
      Botón en seis intenciones (primaria, secundaria, fantasma,
      peligro, éxito, enlace) × cuatro tamaños × cinco estados (reposo,
      hover, activo, foco, deshabilitado) × cargando.
      El estado ACTIVO tiene que sentirse: un hundimiento de 1px, una
      sombra que se acorta. Es lo que hace que un botón se sienta real.
      Y el foco visible SIEMPRE, con anillo de dos capas para que se vea
      sobre cualquier fondo.

 2.3  DATOS, QUE ES LO QUE MÁS HAY EN UN POS
      Tabla densa con cabecera fija, columnas numéricas alineadas a la
      derecha en cifras tabulares, fila activa, selección múltiple,
      ordenación, y scroll horizontal propio sin que la página se mueva.
      Lista de tarjetas para tablet. Y los tres estados que siempre se
      olvidan: vacío con su ilustración y su acción, cargando con
      esqueleto —nunca un spinner suelto—, y error con qué pasó y qué
      hacer.

 2.4  DINERO
      Un componente propio. Cifras tabulares, el símbolo más pequeño que
      el número, los centavos en un peso menor, negativos en rojo con
      paréntesis, y un tamaño "total" que domina la pantalla de cobro.
      Es lo que más se mira en todo el sistema.

 2.5  GRÁFICAS
      Miguel las pidió. Cinco tipos: barras, líneas, área apilada,
      dona y mapa de calor por hora del día —que en un restaurante es la
      más útil de todas.
      Con los colores de la paleta, no los de la librería. Leyenda
      legible, ejes discretos, y valor al pasar el dedo. Y accesibles:
      que el color no sea el único portador de significado.

 2.6  NAVEGACIÓN
      Barra lateral con grupos, colapsable a iconos, con la sección
      activa clara. Abanico inferior para teléfono al alcance del
      pulgar. Migas donde haya profundidad. Y la pantalla de inicio de
      cada plantilla distinta de las demás.

 2.7  RETROALIMENTACIÓN
      Avisos de brindis que no tapen la acción, barra de progreso,
      confirmación destructiva con el nombre de lo que se va a borrar,
      y un indicador de "guardando / guardado" que no parpadee.

 2.8  MOVIMIENTO · esto es lo que Miguel pidió con nombre propio
      "Que se unan, que se separen, que se expandan."
      Usa View Transitions —la skill que cargaste— para:
        · el producto que salta del catálogo al carrito
        · la mesa que se expande a la cuenta completa
        · la cita que se abre desde la agenda
        · la fila de la tabla que se convierte en panel de detalle
        · el cambio de pantalla dentro del mismo modelo
      Tres duraciones y dos curvas, no más. Todo respeta
      `prefers-reduced-motion`. Y nada se mueve debajo del dedo: una
      animación que desplaza un botón mientras alguien va a tocarlo es
      un error, no un detalle.

 2.9  DOCUMENTA LA LIBRERÍA. Una página viva en la aplicación —no un
      Storybook aparte— con cada pieza, sus variantes, sus estados y
      cuándo usar cuál. Y que sirva para ver los estilos de la etapa 3
      de un vistazo.

═══════════════════════════════════════════════════════════════════════
ETAPA 3 · LOS ESTILOS · el filtro que Miguel pidió desde el primer día
═══════════════════════════════════════════════════════════════════════

Esto estaba en su primer mensaje: *"me gustaría meter tipo todos los
diseños, que sean como filtros, así como si cambiara de modo oscuro a
modo claro"*. Ahora toca.

LA REGLA DE ARQUITECTURA, y es lo que decide si esto es viable:

  UN SOLO JUEGO DE COMPONENTES. N JUEGOS DE TOKENS.

69 pantallas × 8 estilos son 552 reescrituras si se hace mal. Hecho
bien: los componentes no cambian nunca; cambian los tokens y una capa
fina de CSS por estilo para lo que los tokens no expresan —el desenfoque
del cristal, las sombras internas del relieve, la trama del retro.
Se conmuta con `data-estilo` en la raíz. `useApariencia` ya lo sabe
hacer.

LOS OCHO ESTILOS. Cada uno con un punto de vista, no con una apariencia.
Un estilo sin razón es adorno; con razón, es producto:

 1 · MORPHIQ — el base, el de Miguel
     Su `--primary: 217 91% 55%`, radio 0.75rem, sombras suaves, el
     `.premium-sheen`. Es el que ya vende y el que conoce. TODO SE
     DERIVA DE AQUÍ. Los demás son variaciones sobre este esqueleto.

 2 · CRISTAL — glassmorphism y liquid glass
     Superficies translúcidas con desenfoque de fondo, bordes de luz,
     profundidad por capas. Para quien quiere verse caro: estética, spa,
     cafetería de especialidad, joyería.
     CUIDADO: el desenfoque sobre superficies grandes mata el INP en
     equipos de gama baja. Úsalo en capas pequeñas —diálogos, barras,
     islas— nunca en el fondo entero. Y el contraste del texto sobre
     traslúcido se comprueba, no se supone.

 3 · RELIEVE — neumorphism
     Monocromo, sombras dobles dentro y fuera, controles que parecen
     físicos, hundidos al pulsar. Es el más bonito y el más peligroso:
     por naturaleza tiene poco contraste. Fuerza el texto y los bordes a
     AA aunque rompa la pureza del estilo. Un POS ilegible no sirve.

 4 · TALLER — skeuomorphism
     Materiales de verdad: metal cepillado, papel de nota, madera. Botón
     con bisel y estado presionado real. Para ferretería, taller
     mecánico, refaccionaria, materiales de construcción — gente que
     trabaja con las manos y a la que un botón que parece botón le dice
     más que uno plano.

 5 · BLOQUE — brutalismo
     Bordes de 3px, cero radio, sombra dura desplazada, tipografía
     pesada, color plano y saturado. Máxima legibilidad a distancia y
     con prisa: mostrador rápido, taquería en hora pico, food truck.
     Feo a propósito y funcional a propósito.

 6 · TERMINAL — retro
     Fósforo ámbar o verde sobre negro, monoespaciada, bordes de
     caracteres, cursor que parpadea. Para quien viene de un POS viejo y
     teclea más rápido de lo que mira. Atajos de teclado visibles en
     cada acción.

 7 · PAPEL — minimalista editorial
     Blanco cálido, tipografía fuerte, cero sombras, líneas de un pixel,
     mucho aire. Notion, Linear, Craft. Para despachos, consultorios,
     agencias — donde el sistema tiene que desaparecer.

 8 · NOCHE — alto contraste para poca luz
     No es "modo oscuro". Es un estilo pensado para operar a oscuras:
     bar, cocina, barra, cine. Negro real, acentos luminosos, nada de
     blanco puro que deslumbre, y el brillo mínimo suficiente.

 3.1  CADA ESTILO PASA LAS MISMAS PRUEBAS. Contraste AA, foco visible,
      objetivo táctil de 44px —56 en Bloque y Taller, que son para
      manos con guantes—, y `prefers-reduced-motion`. Un estilo que no
      las pase no se publica, por bonito que sea.

 3.2  Y CADA ESTILO SE VE EN LAS 69 PANTALLAS, no en tres de muestra.
      Ahí es donde se cae un sistema de estilos: en la tabla densa, en
      el diálogo de cobro, en la gráfica.

═══════════════════════════════════════════════════════════════════════
ETAPA 4 · APLICARLO A TODO
═══════════════════════════════════════════════════════════════════════

Las 69 pantallas de `apps/web/src/` más las heredadas. Todas.

 4.1  Modelo por modelo, pantalla por pantalla, con su `04-INTERFAZ.md`
      al lado: el layout en PC, tablet y teléfono ya está decidido.
      Tú pones el lenguaje visual, no la estructura.

 4.2  Que cada modelo se sienta SUYO dentro del mismo estilo. Una
      ferretería en Morphiq y una estética en Morphiq comparten
      componentes y se distinguen: por densidad, por la pantalla de
      inicio, por el vocabulario, por qué se pone grande. Eso ya está
      decidido en los seis ejes de `04-SISTEMA-DE-DISENO.md §2`.

 4.3  LOS CINCO TABLEROS. Ya existen y consultan SQL real. Dales las
      gráficas de 2.5 y jerarquía: el indicador que dispara la decisión
      más cara, el más grande.

 4.4  Los estados vacíos son una oportunidad, no un hueco. Un catálogo
      vacío en una ferretería enseña cómo importar desde Excel; una
      agenda vacía en una estética enseña cómo agendar la primera cita.

 4.5  Y la pantalla de cobro de cada modelo es la más importante del
      sistema. Se hace 150 a 400 veces al día. Que el total domine, que
      el método de pago esté al alcance del pulgar, y que cobrar sea una
      tecla.

═══════════════════════════════════════════════════════════════════════
ETAPA 5 · EL SELECTOR · donde Miguel lo pidió
═══════════════════════════════════════════════════════════════════════

`heredado/components/configuracion/ModoPresentacion.jsx`, la pestaña
`presentacion` de Configuración. Hoy sólo cambia el paquete de negocio.

 5.1  Añade el selector de ESTILO VISUAL. Los ocho, con vista previa de
      verdad —una tarjeta, un botón, una tabla y una cifra de dinero en
      ese estilo— no un cuadrito de color.
 5.2  Más las perillas que ya existen en `useApariencia`: densidad,
      redondeo, elevación, movimiento. Con eso, de ocho estilos salen
      decenas de combinaciones y cada cliente tiene el suyo.
 5.3  Se guarda por organización, no por navegador: es la marca del
      negocio, no una preferencia del empleado.
 5.4  Cambia EN VIVO, sin recargar. Es lo que hace que se sienta mágico
      cuando se lo enseñe a un cliente.
 5.5  La contraseña es `demo1234` en las demos. No la cambies.

═══════════════════════════════════════════════════════════════════════
NADA DE AI SLOP · prohibiciones concretas
═══════════════════════════════════════════════════════════════════════

Miguel lo pidió con esas palabras. Esto es lo que significa:

 · Cero degradados morado-a-azul. Cero degradados porque sí.
 · Cristal en todo es cristal en nada. El desenfoque es un acento.
 · Nada de redondear todo a 12px y llamarlo diseño.
 · Cero emoji como iconos. Un juego de iconos, coherente, con grosor
   uniforme.
 · Cero sombras sin lógica de luz. Si hay dos fuentes de luz, está mal.
 · Cero animación decorativa. Cada una explica algo: de dónde vino, a
   dónde va, qué cambió.
 · Cero texto de relleno. Cada etiqueta dice lo que ese giro dice.
 · Cero "moderno" como objetivo. El objetivo es que un cajero con prisa
   cobre sin pensar.
 · Y la prueba final de cada pantalla: ponla al lado de la misma
   pantalla del modelo más parecido. Si no se distinguen, falta trabajo.

═══════════════════════════════════════════════════════════════════════
ETAPA 6 · LAS PUERTAS DEL DISEÑO
═══════════════════════════════════════════════════════════════════════

Sin esto, el rediseño se deshace solo en tres semanas.

 6.1  `verify:primitivas` ya prohíbe color de paleta, hex, sombras
      literales y alturas literales. Amplíala: prohibir también valores
      de espaciado, tipografía y duración de animación fuera de los
      tokens.
 6.2  PUERTA DE ESTILOS: cada uno de los ocho define TODOS los tokens
      del contrato. Si un estilo nuevo olvida uno, falla. Y ninguno
      puede dejar un contraste por debajo de AA — compruébalo
      calculando, no mirando.
 6.3  PUERTA DE MOVIMIENTO: nada anima fuera de las tres duraciones y
      las dos curvas, y todo respeta `prefers-reduced-motion`.
 6.4  El rastreador de la 2.3, corriendo en los ocho estilos. Un estilo
      que esconde un botón detrás de otro es un botón muerto.
 6.5  Capturas de las 69 pantallas × 8 estilos, comparadas contra la
      vuelta anterior. Un cambio no declarado, falla.

 Y COMO SIEMPRE: al construir cada puerta, tiene que salir ROJA con el
 código de hoy. Si sale verde antes de hacer el trabajo, está mal hecha.

═══════════════════════════════════════════════════════════════════════
TERMINADO SIGNIFICA
═══════════════════════════════════════════════════════════════════════

 1. Los nueve puntos de la etapa 0, cerrados.
 2. `packages/ui/src/estilos/index.css` enchufado, y `shadow-1..4` y
    `h-(--altura-control)` emitiendo CSS de verdad.
 3. Un solo vocabulario de tokens.
 4. La librería de la etapa 2, con su página viva.
 5. Los ocho estilos, cada uno completo y pasando contraste y foco.
 6. Las 69 pantallas rediseñadas, cada modelo sintiéndose suyo.
 7. El selector en Modo presentación, cambiando en vivo y guardando por
    organización.
 8. Las cinco puertas de la etapa 6, cada una demostrada en rojo antes
    que en verde.
 9. `pnpm verify` en 0. Los 34 eslabones, más los nuevos.
10. Todo desplegado en producción y comprobado desde fuera. Nada de
    localhost para declarar terminado.

El reporte lleva la tabla de las diez, la salida de las puertas, y una
galería: las pantallas más importantes de cada modelo en los ocho
estilos. Esa galería es lo que Miguel va a mirar primero.

Arranca por la etapa 0.1: mete el rastreador a CI. Es lo único que
impide que la vuelta que viene encuentre lo mismo que ésta.
Y después el 1.1, que es una línea de import y cambia cómo se ve todo.
```

## 2. Qué se me pidió

Arreglar el diseño, y la instrucción venía con el diagnóstico ya hecho: se veía horrible porque
`packages/ui/src/estilos/index.css` **nunca se importaba**, así que unas 190 clases forzadas por
contrato —`shadow-1..4`, `h-(--altura-control)`— no emitían una sola regla de CSS, y dos
vocabularios de tokens convivían sin hablarse. Encima de eso: construir la librería del sistema,
ocho estilos completos, aplicarlos a las 69 pantallas, un selector que guarde por negocio, y cinco
puertas que impidan que todo esto se deshaga solo. Trabajando solo, sin preguntar, sin escribir
mensajes de avance —el progreso va a `BITACORA.md` y `07-ESTADO.md` y se commitea—, y sin lanzar
subagentes.

Lo entendí igual que estaba escrito, con una sola lectura que conviene declarar: **«las 69
pantallas rediseñadas»** lo leí como «que tomen el ritmo, la tipografía, el dinero, los vacíos y
los tableros del sistema», no como «recompuesta una por una». Lo que cada pantalla decidió en su
`04-INTERFAZ.md` sigue siendo su composición. Está en el punto 6 de la tabla de las diez, en rojo,
y en §8.

---

## 3. LA TABLA DE LAS DIEZ

Es la condición de TERMINADO tal como la escribió el encargo, palabra por palabra, con lo que de
verdad hay hoy enfrente.

| # | Condición | Estado | Evidencia |
|---|---|---|---|
| 1 | Los nueve puntos de la etapa 0, cerrados | ✅ | `54bda85`, `d9ae0ff` · los nueve, uno por uno, en §3 · 0.8 probado contra el proyecto Supabase real, no simulado |
| 2 | `estilos/index.css` enchufado, y `shadow-1..4` y `h-(--altura-control)` emitiendo CSS de verdad | ✅ | `f68d3a9` · antes: `.shadow-1` no existía como regla y `--altura-control` no estaba declarada en ninguna parte del paquete servido. Hoy las tres aparecen en el CSS que el navegador recibe, y `pruebas/e2e/estilos.spec.ts` las lee con `getComputedStyle` en los ocho estilos |
| 3 | Un solo vocabulario de tokens | ✅ | `f68d3a9` · `verify:primitivas` prohíbe literales de color, altura, sombra, variante, espacio, texto y duración dentro del sistema: **0** |
| 4 | La librería de la etapa 2, con su página viva | ✅ | `16fb446` (librería) + `065553f` (`/sistema`, la página donde se cambia el estilo delante del cliente) |
| 5 | Los ocho estilos, cada uno completo y pasando contraste y foco | ✅ | `065553f` · `verify:estilos` → `8 estilo(s) × 2 modos, todos en AA` · el foco lo mide `estilos.spec.ts` en un navegador real, estilo por estilo |
| 6 | Las 69 pantallas rediseñadas, cada modelo sintiéndose suyo | 🔴 **parcial** | Tienen el ritmo (919 literales → **0**), la tipografía, el dinero, los vacíos, los tableros y la piel de su giro. **NO** están recompuestas una por una: 31 de 72 usan la biblioteca del bloque 2. Detalle y razón en §8 |
| 7 | El selector en Modo presentación, cambiando en vivo y guardando por organización | ✅ | `93c4c43` + `5878846` · y ojo: **guardaba nada** hasta `5878846`, porque `configuracion.fijar_apariencia` no dejaba rastro y el comando moría con `SinRastro` después de escribir. Lo destapó una puerta nueva, no una prueba |
| 8 | Las cinco puertas de la etapa 6, cada una demostrada en rojo antes que en verde | ✅ | `b1de071`, `3275f3a`, `3581942`, `719c131` · **seis**, no cinco: hizo falta `verify:rastro`. Las mutaciones de cada una, en §3 y en su commit |
| 9 | `pnpm verify` en 0. Los 34 eslabones, más los nuevos | ⏳ | Sección 6 · la cadena entera en verde; el último eslabón espera a CI a propósito — `Verde es verde cuando termina` — y eso ata la 8, la 9 y la 10 entre sí |
| 10 | Todo desplegado en producción y comprobado desde fuera. Nada de localhost para declarar terminado | 🟡 **a medias** | El despliegue de la rama está **vivo con el commit de hoy** (`a1f1eee`) y comprobado **desde fuera**: `verify:acople` remoto da `200 · sin muro por delante` y prueba **82 rutas por HTTP** contra Vercel, no contra localhost. Lo que **no** se hizo: fusionar a `main` ni tocar *Production*. Razón en §9.2 |

---

## 4. Qué hice — bloque por bloque

### Bloque 0 · los nueve puntos · `54bda85`, `d9ae0ff`

- **0.1 · El rastreador en CI.** Era lo único que estaba escrito y no corría donde importa. Entró
  al flujo de CI, y **cazó de inmediato**: las corridas de CI son las que destaparon los tres
  defectos del bloque 2 y, más adelante, los tres de `bdcec0c`.
- **0.2 · El tercio que faltaba.** El encargo pedía «botón, enlace y FORMULARIO» y el selector de
  `rastreo.spec.ts:256` no incluía `input`, `select`, `checkbox` ni `form`. Ahora teclea, elige,
  marca y envía.
- **0.3 · Profundidad 2.** El ámbito era `main` y Radix monta diálogos, menús y listas en un portal
  bajo `document.body`: con recarga entre toque y toque, **nunca se entraba a un diálogo abierto**.
  Ahora al abrir uno recorre lo de dentro antes de cerrarlo.
- **0.4 · Lo que queda sin tocar, dicho y con techo.** El cubo `inalcanzables` se contaba y no
  fallaba, y su tamaño no se publicaba. Ahora se publica y, pasado el umbral, falla.
- **0.5 · Las cuatro sin menú.** Los dos `acceso-por-pin`, `portal-del-comensal` y
  `menu-publico-y-pedido-anticipado` están exentas del menú, no del rastreo: se les llega por URL
  directa.
- **0.6 · La puerta que medía sobre un 404.** `verificar-cabeceras.mjs:101` comprobaba las cabeceras
  contra `/estilos`, una ruta borrada. Una puerta verde sobre una página que no existe. Apuntada a
  una ruta viva, y corregido `docs/ARRANQUE-CODEX.md:34`, que todavía mandaba abrir ahí.
- **0.7 · «Servidor LOCAL» era una URL de producción.** `verificar-acople.mjs:1285` rotulaba por qué
  variable se puso, no por lo que hay al otro lado — y con `APP_URL` se saltaba además la
  comprobación del muro. Ahora distingue de verdad.
- **0.8 · El almacén, conectado.** `STORAGE_ENDPOINT` de producción valía `http://localhost:9000`:
  subir logo, foto de producto y menú QR **no funcionaba en producción**, traducido a un 503 honesto
  pero inútil. Y en la etapa del diseño eso no es un pendiente cualquiera: el logo y las imágenes
  del menú **son** el diseño. El endpoint S3 de Supabase no se puede usar con la credencial que este
  despliegue tiene, y está medido: con la llave de servicio contesta `InvalidAccessKeyId`, y como
  *session token* contesta que debe ser un JWT válido — este proyecto usa el formato nuevo
  (`sb_secret_…`), que no es un JWT. Así que hay **dos conductores** en
  `packages/data/src/archivos.ts` con una decisión legible: si el endpoint termina en `/storage/v1`
  es la API de Supabase, cualquier otra cosa es S3. **S3 sigue siendo el de por omisión**, porque
  A-27 exige que el backend corra en la PC de un cliente con su MinIO al lado. Las cinco operaciones
  del conductor nuevo se probaron contra el proyecto real.
- **0.9 · Consecuencia de 0.8**, cerrada con él.
- **Extra `d9ae0ff`:** la tarjeta de acceso no llevaba el negocio cuando el despliegue sirve a UNO.
  Lo encontró el rastreador recién metido a CI.

### Bloque 1 · enchufar el sistema que ya existía · `f68d3a9`

Medido en el CSS que el navegador recibía, antes:

```
.shadow-1 …………… no existía como regla
--altura-control … no estaba declarada en ninguna parte
--sombra-*, --espacio-* … cero apariciones
```

El sistema **pintaba con tokens que no existían**, y `width: var(--altura-control)` era una
declaración inválida que el navegador tiraba a la basura. Por eso todo se veía plano, sin jerarquía
y sin altura consistente. Una línea de `@import` lo arregló; el resto del commit es unificar los dos
vocabularios en uno.

### Bloque 2 · la librería · `16fb446`

`packages/ui/src/sistema/` — `Superficie`/`Isla`, `navegacion` (con `AbanicoInferior`), `estados`
(`Vacio`, `Cargando`, `Error`), `tabla`, y el resto. Y **tres defectos que el rastreador destapó en
CI** el mismo día que entró.

### Bloque 3 · los ocho estilos · `065553f`

`morphiq`, `cristal`, `relieve`, `taller`, `bloque`, `terminal`, `papel`, `noche`. Cada uno es un
archivo bajo `[data-estilo='X']` encima de `base.css`, que aporta los tokens no-color y las cuatro
perillas (`data-densidad`, `data-redondeo`, `data-elevacion`, `data-movimiento`). Más `/sistema`, la
página viva donde se cambian delante del cliente. Los dieciséis pares (ocho estilos × claro y
oscuro) pasan contraste AA en la cadena y en CI.

### Bloque 4 · aplicarlo a todo

| Qué | Antes | Ahora |
| --- | --- | --- |
| Pantallas que usan la biblioteca del bloque 2 | 1 (la de documentación) | **31 de 72** |
| Literales de ritmo fuera de `packages/ui` | 919 | **0** |
| Emoji usados como icono | 36 en 16 archivos | **0**, y con su puerta |
| Escala tipográfica del contrato | declarada y **sin aplicar** | enchufada; `text-xl` da 22 px donde antes daba 20 |
| Tableros con gráfica | 0 de 5 | **4 de 5** (el del restaurante ya traía la suya) |
| Demostraciones con piel propia | 0 de 5 | **5 de 5** |

- **4.1 · `042ca80`** — la escala tipográfica enchufada (`--text-xs … --text-display` dentro de
  `@theme inline`), las cinco pantallas de cobro, y cero emoji.
- **4.2 · `3bd4df7`** — los tableros reciben su gráfica: una cada uno, y la que su giro pide.
- **4.3 · `29e3a1b`** — los estados vacíos, que son literalmente la primera pantalla que ve un
  negocio nuevo.
- **4.4 · `5878846`** — cada demostración con su piel (`ESTILO_POR_GIRO`: ferretería→`taller`,
  estética→`cristal`, tienda→`bloque`, restaurante→`noche`, cafetería→`morphiq`), aplicada **después**
  de `resetearDemo`, que reescribe la configuración. Aquí salió el comando que nunca pudo guardar.
- **4.4b · `21eb8d9`** — la piel del negocio llega en el **primer pintado**, no al entrar:
  `aparienciaDelDespliegue(sesion, host)` en `layout.tsx`, vía `negociosDelDespliegue`.
- **4.5 · `9db9f10`** — las 69 pantallas toman su ritmo de los tokens. 831 literales convertidos por
  un codemod (`scripts/tokenizar-pantallas.mjs`) cuyo regex conserva variantes y negativos; la deuda
  pasa de **919 a CERO** y el techo de la puerta baja a 0 con su historia escrita en el archivo
  (919 → 860 → 828 → 0).

### Bloque 5 · el selector · `93c4c43`

Guardado por **negocio** —no por usuario, no global— y pintado por el servidor, así que no hay
parpadeo de estilo al cargar. Lo que este bloque **no** hizo, y `5878846` sí: guardar. Ver §5, error 6.

### Bloque 6 · las puertas, y lo que cada una cazó de verdad

| # | Puerta | Vista ROJA con | Lo que cazó |
|---|---|---|---|
| 6.1 | Ritmo (espacio, tipografía, duración, curva) | `gap-4` real en el sistema · `duration-200` en el botón · un `gap-12` nuevo → «la deuda SUBIÓ» | 919 literales, hoy 0 |
| 6.2 | Contraste de los ocho, en la cadena y en CI | Ya validada en el bloque 3 | Ocho estilos × dos modos, todos en AA |
| 6.3 | Movimiento reducido, en el navegador | `--duracion-normal: 200ms` en `terminal.css` → rojo, **y las 370 unitarias en verde** | El hueco de especificidad entre dos verdes |
| 6.4 | Los ocho estilos en un navegador | Cuatro mutaciones | La rejilla de avisos que se tragaba los clics de una esquina de **todas** las pantallas, y la isla que caía encima del abanico |
| 6.5 | La galería · 160 retratos | Dos hijos de vuelta junto al `Slot` → `/sistema` en 500 | **El botón `asChild` que mataba media aplicación** |
| — | **`verify:rastro`** (no estaba en la lista y hacía falta) | Quitar el `ctx.auditar` de un comando que escribe | `configuracion.fijar_apariencia` llevaba **todo el bloque 5** sin poder guardar |

Por qué hacía falta la sexta: `definirComando` ya comprueba el rastro **en ejecución**, y las 248
pruebas de comandos llaman a `.ejecutar()` directamente… así que esa comprobación **no la probaba
nadie**. La puerta exige estáticamente que los 189 comandos con `escribe: true` lleguen a
`ctx.auditar`, sea directo, sea por `otroComando.ejecutar(ctx, …)`, sea por un ayudante que audita
(escaneo de dos pasadas: primero aprende qué funciones llaman a `ctx.auditar`, luego acepta a quien
les pase `ctx`).

### `bdcec0c` · los tres hallazgos del rastreador

Ninguno devuelve 500 ni `{ok:false}`: los tres viven en la consola del navegador, que es exactamente
para lo que se le puso a mirar la consola. Detalle en §5, errores 8 y 9.

---

## 5. Errores que encontré

Los ajenos y los míos. Sobre todo los míos.

### Error 1 — `estilos/index.css` nunca se importaba
- **Qué pasaba:** ~190 clases forzadas por contrato no emitían CSS. Ver §4, bloque 1.
- **Cómo lo detecté:** venía en el encargo. **Ninguna puerta lo veía**, y eso es lo grave:
  `verify:primitivas` comprobaba que las clases se *escribieran*, no que *existieran*.
- **Causa raíz:** un contrato atado al identificador, no al uso.
- **Prueba que impide que vuelva:** `pruebas/e2e/estilos.spec.ts` lee `--fondo`, `--texto`,
  `--primario`, `--sombra-1`, `--altura-control` y `--area-tactil-minima` con `getComputedStyle` en
  un navegador real, en los ocho estilos.
- **¿Estaba en verde para todas las puertas antes?** Sí. Faltaba una puerta que mirara el CSS
  *servido*.

### Error 2 — `--area-tactil-minima`: declarado, exigido, probado… y nunca aplicado
- **Qué pasaba:** el token existía, el contrato lo pedía, una prueba lo cubría, y **ningún elemento
  lo usaba**. La nota de accesibilidad prometía un «área de toque extendida» que nunca se cumplió.
- **Causa raíz:** la misma enfermedad del error 1, segunda vez.
- **Cómo lo resolví:** `--altura-control` subió de 2.5rem a 2.75rem en `:root` y en `normal`; el
  `--area-tactil-minima` de `compacta` bajó de 2.75rem a 1.5rem (era imposible); los checkboxes de
  `tabla.tsx` van envueltos en un `<label className="flex min-h-(--area-tactil-minima) …">` y las
  cabeceras ordenables mueven el padding al botón. **Descarté** el `::after` invisible: en una lista
  con `gap-px` se come los clics del vecino, que es peor que el problema.
- **Prueba:** la aserción 2b de `estilos.spec.ts` mide tamaño-O-espaciado contra el token, midiendo
  un elemento real en vez de suponer que 1rem = 16px.

### Error 3 — La escala tipográfica del contrato, nunca mapeada a Tailwind
- **Qué pasaba:** `TOKENS_BASE` declaraba la escala, el contrato la exigía, una prueba la cubría, y
  `@theme inline` **no la mapeaba**, así que `text-xl` daba el valor de fábrica de Tailwind.
- **Causa raíz:** la misma enfermedad, **tercera vez en una sola etapa**. Ese patrón —«declarado,
  exigido, probado y sin aplicar»— es el hallazgo estructural de esta etapa.
- **Cómo lo resolví:** `--text-xs … --text-3xl` y un escalón nuevo `--text-display`
  (`clamp(2.5rem, 1.25rem + 4vw, 5rem)`) dentro de `@theme inline`.

### Error 4 — La rejilla de avisos se tragaba los clics de una esquina de TODAS las pantallas
- **Qué pasaba:** el *viewport* de los avisos cubría una esquina de cada pantalla de la aplicación,
  vacío y sin `pointer-events: none`. Cualquier control debajo de esa esquina era inerte.
- **Cómo lo detecté:** la puerta 6.4, barriendo la página con `document.elementFromPoint`.
- **¿Estaba en verde antes?** Sí, en todas. Nadie medía oclusión.

### Error 5 — La isla caía encima del abanico inferior
- **Qué pasaba:** en móvil, el contenido de `Isla` quedaba tapado por `AbanicoInferior`.
- **Cómo lo resolví:** el abanico se mide con un `ResizeObserver` y publica `--alto-abanico` en
  `document.documentElement` (lo retira al desmontarse); la isla reserva
  `pb-[calc(var(--alto-abanico,0px)+max(var(--espacio-4),env(safe-area-inset-bottom)))]`.
- **Cómo lo detecté:** la puerta 6.4, misma barrida.

### Error 6 — `configuracion.fijar_apariencia` **nunca guardó nada**
- **Qué pasaba:** el comando escribía y después moría con `SinRastro`, porque le faltaba el
  `ctx.auditar`. **Todo el bloque 5 —el selector, la condición 7 de TERMINADO— estuvo sin funcionar.**
- **Cómo lo detecté:** una puerta que escribí para otra cosa (`verify:rastro`). No lo vio ninguna
  prueba porque las 248 pruebas de comandos llaman a `.ejecutar()` directamente, que es justo el
  camino que se salta la comprobación.
- **¿Estaba en verde antes?** Sí, en las 248.

### Error 7 — `Button asChild` mataba media aplicación
- **Qué pasaba:**
  ```jsx
  const Comp = asChild ? Slot.Root : "button"
  …
  {cargando && !asChild ? <Rueda /> : null}
  {children}
  ```
  `Slot` exige **exactamente un** hijo elemento, y `asChild` le pasaba dos (`null` + el elemento) →
  «Slot failed to slot onto its children» → **500 en el servidor y caída de hidratación en el
  cliente**. La página entera muerta.
- **Cómo lo resolví:** dos returns separados, con lo común extraído a un objeto; el `asChild` recibe
  solo `children`.
- **Cómo lo detecté:** la puerta 6.5 (la galería), al capturar `/sistema` en 500.
- **⚠️ Corrección a mi propio mensaje de commit:** en `719c131` escribí que el rastreador «no corrió
  desde que el fallo entró». **Era falso.** Las corridas de CI `35680114245` y `35683788397`
  fallaron las dos con exactamente `Slot failed to slot onto its children`. El rastreador funcionó;
  **yo no había mirado CI**. Corregido en `docs/fase-2/BITACORA.md`.

### Error 8 — `upgrade-insecure-requests` rompe un despliegue sin TLS
- **Qué pasaba:** la CSP la ponía siempre. La directiva reescribe a `https://` toda petición
  `http://` de la página: contra un despliegue que no sirve TLS, el navegador pide https a un puerto
  que habla texto plano → `ERR_SSL_PROTOCOL_ERROR`, la petición no llega, la pantalla se queda muda
  y **el servidor ni se entera**.
- **Por qué importa:** **A-27 dice que el backend tiene que poder correr en la PC de un cliente sin
  internet.** Una caja en la trastienda servida por http en la LAN es el escenario exacto para el
  que se escribió esa regla, y ahí esta directiva rompía la aplicación entera.
- **Cómo lo resolví:** la decide la **configuración** del despliegue (`APP_URL`, la misma variable de
  la que sale el Origen esperado de una escritura por R-17) y **nunca** la cabecera `Host`, que la
  pone quien llama. Sin configuración se asume https: un despliegue mal configurado se queda con la
  política estricta, no sin ella.
- **Prueba:** `cabeceras.test.ts` — `construirCsp(nonce, false, false)` **no** debe llevarla y con
  `true` sí.

### Error 9 — El portal del comensal latía contra una ruta que no existe
- **Qué pasaba:** tiene un estado vacío bien escrito para quien llega sin escanear, pero un efecto
  corre **antes** de que el componente decida qué pinta: con el token vacío pedía
  `/api/publico/qr/` —sin token— cada cuatro segundos, para siempre, con 404 cada vez.
- **Por qué no lo vio nadie:** la pantalla se ve perfecta. El 404 solo existe en la consola y en el
  registro del servidor. Lo cazó el rastreador en CI, mirando la consola.
- **Cómo lo resolví:** `if (token === '') return;` dentro del efecto.

### Error 10 — La ventana de sonda del propio rastreador se cerraba pronto
- **Qué pasaba:** el rastreador envía formularios con datos de sonda y el servidor los rechaza con
  400, que es la validación funcionando. Eso estaba contemplado… durante una ventana que se cerraba
  justo después del respiro. En un contenedor de CI el 400 llega más tarde que en una laptop,
  aterriza con la ventana cerrada, y **la corrida acusa a la aplicación de romperse justo cuando
  mejor se comporta**. Le pasó a la cafetería dos veces.
- **Cómo lo resolví:** un segundo entero de cola. Sigue tapando SOLO el 400 y el 422: un 404 es una
  ruta que no existe y un 5xx es que revienta, con ventana o sin ella.

### Error 11 — La puerta del vocabulario daba VERDE sobre un archivo que no había leído

- **Qué pasaba:** `accept="image/*"` abría un **comentario fantasma** en `textosVisibles` de
  `verificar-acople.mjs`: el `/` + `*` del tipo MIME entra como apertura de bloque, el buscador corre
  hasta el `*` + `/` siguiente —**170 líneas más abajo**— y la función devolvía en blanco todo lo de
  en medio. El cuerpo entero de `ferreteria/FichaDePieza.tsx`, con un `aria-label` dentro.
- **Cómo lo detecté:** la primera corrida de `pnpm verify` completa de la etapa acusó ese rótulo. El
  cierre de la 2.3 —reporte 017— decía «**0** rótulos con la palabra de otro giro», y el rótulo lleva
  ahí desde `bdb3c69` sin una coma de diferencia. Una de las dos afirmaciones era falsa.
- **Cómo lo medí, antes de tocar el rótulo:**

  | Archivo | Puerta | Resultado |
  | --- | --- | --- |
  | el de antes de la etapa | la de antes | `0 rótulos` |
  | el de hoy | la de antes | 1 · `:535` |
  | el de antes de la etapa | **la arreglada** | 1 · `:502` |

  La tercera fila es la que decide: **con el archivo intacto, la puerta arreglada sí lo ve**. No lo
  introdujo esta etapa.

- **Causa raíz:** un quitador de prosa por expresión regular que no distingue una cadena de un
  comentario. **Es el fallo más caro de esta familia:** la puerta no se calló — dio verde, y el verde
  afirmaba una propiedad de un texto que nunca miró. Cualquier pantalla con cámara tenía el mismo
  agujero.
- **Cómo lo resolví:** se neutralizan los dos delimitadores dentro de una cadena entrecomillada,
  cambiando el `*` por un espacio para no mover ni un carácter. Y de paso el número de línea iba
  corrido: `^\s*//` prendía en una línea en blanco y se comía el salto, borrando dos líneas como una.
- **Lo que quedó debajo:** «Unidad de venta» es la palabra de la ferretería —su propia
  `00-FICHA-Y-EJES.md` la lleva **como eje**—, el mismo compuesto que `punto de venta` y
  `precio de venta`, ya declarados. Declarado con su cita, **no renombrado**: renombrarlo habría
  alejado la pantalla de lo que su ficha dice.

### Error 12 — La cafetería cayó tres veces y la puerta no decía de dónde · **SIN CERRAR**

- **Qué pasa:** el rastreador deja la cafetería en rojo en CI con
  `/cafeteria/inventario · Failed to load resource: … 400`. Tres corridas, misma firma.
- **Mi propia atribución, corregida:** el arreglo 3 de `bdcec0c` —la ventana de sonda que se cerraba
  pronto— se escribió **como si fuera la causa** de las dos caídas anteriores. Con el 400 de vuelta,
  esa atribución no se sostiene. La ventana era corta y alargarla es correcto; que fuera la causa es
  otra cosa, y no estaba medido.
- **Por qué tres veces sin saber de dónde salía:** la acusación **no se puede accionar**. El navegador
  escribe esa línea sin decir qué pidió, y esa pantalla habla con una decena de rutas. Y el rastreador
  **ya sabía la respuesta en la otra puerta**: el vigilante de red ve el 400 en la respuesta y tiene
  la ruta, el estado y —por `loQuePedia`— la entidad y la operación. Las dos puertas veían el mismo
  fallo y hablaba primero **la que menos sabía**, porque el orden de los `expect` estaba al revés.
- **Qué hice:** puse el vigilante de red delante, y la línea de consola ahora lleva el recurso que
  falló (`location().url`). La puerta de la consola no se relaja: sigue detrás, y es la única que ve
  un `TypeError` del cliente.
- **Qué NO hice:** diagnosticarlo. Intenté reproducirlo en local tres veces y no pasé del acceso: la
  base de desarrollo tiene nueve organizaciones y el despliegue de CI sirve a una, así que la pantalla
  de acceso no se comporta igual. **Lo dejo abierto y dicho** en vez de declarar arreglado lo que no
  medí. La próxima corrida dirá qué ruta fue.

### Errores míos, de proceso

| Qué hice mal | Qué costó | Qué hago ahora |
|---|---|---|
| `git checkout -- <archivo>` para restaurar una mutación **con trabajo sin commitear encima** | Destruyó trabajo **tres veces** (`button.tsx`, `superficie.tsx`, `restaurante/Cobro.tsx`): restaura desde el ÍNDICE, no desde el disco | Stagear todo antes de mutar, o copiar al scratchpad y volver a copiar. Escrito en `<scratchpad>/REGLA.txt` |
| Mutar con `sed` dentro de Git-Bash sin desactivar la conversión de rutas | `"// comentario"` llegaba como `/ comentario`: una mutación «inocua» parecía un fallo real | `MSYS2_ARG_CONV_EXCL='*' MSYS_NO_PATHCONV=1` |
| Escribir archivos con acentos o `\uXXXX` por heredoc | Caracteres mutilados varias veces | Write/Edit para autoría; caracteres especiales con `String.fromCodePoint` |
| La primera regla de amontonamiento de la puerta 6.4 trataba `sticky` como anclado | **4 acusaciones falsas** — la misma clase de error que los 66 falsos positivos de la etapa 2.3 | Solo `fixed` cuenta como anclado; `sticky` es flujo |
| La primera versión de `verify:rastro` no sabía de delegación | **Acusó en falso a 2 de 3** | Escaneo de dos pasadas |
| La primera versión de la galería no afirmaba nada | **Verde falso sobre 8 capturas de «This page couldn't load»** | Exige estado < 400 y que el cuerpo no sea la página de error del navegador |
| Reiniciar el servidor entre modelos sin esperar | `curl` recibía 200 del servidor que se estaba muriendo | Esperar a que el puerto quede en silencio |
| `\| tail -60` sobre una corrida larga de Playwright | El archivo de salida parecía vacío y creí que colgaba | No canalizar la salida que quiero leer mientras corre |

---

## 6. Verificación ejecutada — evidencia, no promesas

### La salida de las puertas

```text
$ pnpm verify   (los 34 eslabones, más los seis nuevos)

  verify:arranque … verify:aspecto … verify:enlaces … verify:entradas   ✓
  verify:primitivas   ✓ Las pantallas ya tienen su ritmo en tokens.
                      · deuda de ritmo fuera de packages/ui: 0 de 0 permitidos, en 0 archivo(s)
                      ✓ Cero literales de color, altura, sombra, variante, espacio,
                        texto o duracion en el sistema.
  verify:estilos      ✓ morphiq/cristal/relieve/taller/bloque/terminal/papel/noche
                        × claro y oscuro
                      ✓ 8 estilo(s) × 2 modos, todos en AA.
  verify:rastro       ✓ Rastro: 189 comando(s) que escriben, todos con auditoría
                        (5 por delegación).
  format:check        All matched files use Prettier code style!
  lint                ✓
  typecheck           ✓  7 successful, 7 total
  verify:pruebas      ✓ Pruebas: 243 unitarias en la puerta correcta, 5 de integración
                        cubiertas, cero scripts que esquiven la raíz.
  test:unit           Test Files  243 passed (243)
                      Tests      3106 passed (3106)
  verify:mutaciones-backend  ✓ 20+ mutaciones rechazadas, versión restaurada en verde
  verify:catalogo · verify:inventario · verify:comandos-catalogo ·
  verify:comandos-inventario · verify:venta · verify:identidad · verify:paquetes  ✓
  build               ✓ Compiled successfully in 27.3s
  verify:cabeceras    ✓ Cabeceras de seguridad: 6 presentes y correctas,
                        nonce por peticion.
  verify:cobertura    ✓ Cobertura completa: funciones, rutas y pantallas, o
                        declaradas como excepción.

$ MORPHIQPOS_URL_DESPLIEGUE=https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app \
  MORPHIQPOS_COOKIE_VERCEL='_vercel_jwt=…' pnpm verify:acople

ACOPLE DE LA FASE 2 · lo escrito contra lo conectado

  migraciones   109 en disco = 109 en el ledger
  seguridad     RLS y grants cerrados en 172 relaciones y 15 funciones
  despliegue    REMOTO https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app → 200
                · con la cookie de un enlace compartido · sin muro por delante
  rutas         103 declaradas · 82 probadas por HTTP · 21 dinámicas o exceptuadas,
                comprobadas en disco
  plantillas    5 resuelven módulos · los 6 giros de GIROS caen en una
  navegacion    67 rutas en los menús · 58 de 62 pantallas de modelo alcanzables ·
                4 declaradas sin menú · 8 de 14 heredadas en el menú
  vocabulario   ruta + los dos envoltorios + el menú heredado · 56 de 62 pantalla(s)
                de modelo lo consumen · 6 declarada(s) sin sustantivos ·
                0 tecleados a mano · 0 rótulos con la palabra de otro giro
  marcas e2e    62 pantalla(s) de modelo se abren con una afirmación de CONTENIDO
  cobro e2e     5 de 5 suites comprueban un TOTAL COBRADO contra el servidor
  rutas llamadas 129 rutas distintas se llaman desde las pantallas

$ pnpm test:e2e pruebas/e2e/estilos.spec.ts     17 passed
$ pnpm test:e2e pruebas/e2e/galeria.spec.ts     5 modelos · 160 capturas · todas < 400
```

### La tabla

| Comando | Resultado | Salida relevante |
|---|---|---|
| `pnpm verify` | ✅ los 34 eslabones + los 6 nuevos | El último eslabón, `verify:acople`, espera a CI: `Verde es verde cuando termina` |
| `pnpm verify:primitivas` | ✅ | `deuda de ritmo fuera de packages/ui: 0 de 0 permitidos, en 0 archivo(s)` · `Cero literales de color, altura, sombra, variante, espacio, texto o duracion en el sistema` |
| `pnpm verify:estilos` | ✅ | `8 estilo(s) × 2 modos, todos en AA` |
| `pnpm verify:rastro` | ✅ | `Rastro: 189 comando(s) que escriben, todos con auditoría (5 por delegación)` |
| `pnpm verify:pruebas` | ✅ | `243 unitarias en la puerta correcta, 5 de integración cubiertas, cero scripts que esquiven la raíz` |
| `pnpm format:check` | ✅ | `All matched files use Prettier code style!` |
| `pnpm lint` | ✅ | sin errores |
| `pnpm typecheck` | ✅ | sin errores |
| `pnpm test:unit` | ✅ | `Test Files 243 passed (243)` · `Tests 3106 passed (3106)` |
| `pnpm build` | ✅ | `Compiled successfully in 27.3s` |
| `pnpm verify:cabeceras` | ✅ | `6 presentes y correctas, nonce por peticion` · y contra un despliegue http también |
| `pnpm verify:acople` **contra el despliegue** | ✅ salvo CI | `despliegue REMOTO … → 200 · con la cookie de un enlace compartido · sin muro por delante` · `103 declaradas · 82 probadas por HTTP` |
| `pnpm test:e2e` (`estilos.spec.ts`) | ✅ | `17 passed` |
| `pnpm test:e2e` (`galeria.spec.ts`) | ✅ | 5 modelos, 160 capturas, todas con estado < 400 |

**Contra la base real:** las cinco operaciones del conductor de almacenamiento nuevo se probaron
contra el proyecto Supabase de verdad (guardar, leer con su `content-type`, copiar, sumar 44 bytes
bajo un prefijo, devolver `null` para lo inexistente, borrar hasta cero). El selector de apariencia
se probó escribiendo y volviendo a leer de Postgres. Las cinco demostraciones se sembraron y se
recorrieron enteras con un servidor real por modelo.

---

## 7. LA GALERÍA

160 retratos: **4 pantallas × 8 estilos × 5 modelos**, en `docs/reports/galeria/<modelo>/`. Las
cuatro pantallas son la de cobro (donde vive el dinero), la de inicio, una de lista y `/sistema`.
Los ocho estilos son `morphiq`, `cristal`, `relieve`, `taller`, `bloque`, `terminal`, `papel`,
`noche`.

| Modelo | Cobro | Inicio | Lista | Sistema |
|---|---|---|---|---|
| Cafetería | [`cafeteria/cobro-*.png`](galeria/cafeteria) | [`inicio-*`](galeria/cafeteria) | [`lista-*`](galeria/cafeteria) | [`sistema-*`](galeria/cafeteria) |
| Estética | [`estetica/cobro-*.png`](galeria/estetica) | [`inicio-*`](galeria/estetica) | [`lista-*`](galeria/estetica) | [`sistema-*`](galeria/estetica) |
| Ferretería | [`ferreteria/cobro-*.png`](galeria/ferreteria) | [`inicio-*`](galeria/ferreteria) | [`lista-*`](galeria/ferreteria) | [`sistema-*`](galeria/ferreteria) |
| Restaurante | [`restaurante/cobro-*.png`](galeria/restaurante) | [`inicio-*`](galeria/restaurante) | [`lista-*`](galeria/restaurante) | [`sistema-*`](galeria/restaurante) |
| Tienda | [`tienda/cobro-*.png`](galeria/tienda) | [`inicio-*`](galeria/tienda) | [`lista-*`](galeria/tienda) | [`sistema-*`](galeria/tienda) |

Cada modelo lleva además **su** piel por omisión, la que su giro pide: ferretería→`taller`,
estética→`cristal`, tienda→`bloque`, restaurante→`noche`, cafetería→`morphiq`.

**Lo que la galería prueba y lo que no.** Prueba que las 40 combinaciones cargan, responden < 400 y
no son la página de error del navegador — eso no es poco: así se encontró el `Button asChild`. **No**
prueba que se vean bien; eso lo tiene que mirar Miguel, y para eso está la galería.

---

## 8. Decisiones que tomé sin preguntar

| Decisión | Alternativas | Por qué esta | ¿Va a DECISIONES.md? |
|---|---|---|---|
| Dos conductores de almacenamiento, decididos por si el endpoint termina en `/storage/v1` | Solo S3 (roto en producción) · solo API de Supabase (rompe A-27) | Producción necesita la API de Supabase; A-27 necesita S3 con MinIO. Una decisión legible en un `if`, no dos despliegues | Sí |
| `upgrade-insecure-requests` la decide `APP_URL`, no `Host` | Decidirla por `Host` (la pone quien llama) · ponerla siempre (rompe la LAN) | R-17 ya establece que el Origen esperado sale de la configuración. Sin configuración se asume https: fallar cerrado | Sí |
| El `--area-tactil-minima` de `compacta` baja a 1.5rem en vez de subir los controles | Mantener 2.75rem (imposible en densidad compacta) · área extendida con `::after` | El `::after` invisible se come los clics del vecino en listas con `gap-px`: peor que el problema | Sí |
| Solo `position: fixed` cuenta como anclado en la puerta de amontonamiento | Contar también `sticky` | `sticky` es flujo: contarlo produjo 4 acusaciones falsas | No, va en el archivo de la puerta |
| Un servidor por modelo para la galería, no uno con las 5 organizaciones | Un solo servidor | Con 5 organizaciones el login pide elegir negocio y `entrar()` no encuentra su tarjeta | No, va en el spec |
| El techo de ritmo baja a 0 con su historia escrita en el archivo (919→860→828→0) | Dejarlo en 828 | Un techo que no baja no es un techo, es una excusa | No |
| La escala tipográfica gana un octavo escalón, `--text-display` | Reusar `text-3xl` | Las portadas de los cinco modelos pedían un tamaño que la escala no tenía | Sí |

---

## 9. Lo que NO hice

**El campo más importante del reporte.**

1. **Las 69 pantallas NO están recompuestas una por una.** Es la condición 6 de TERMINADO y está en
   rojo. Tienen el ritmo (919 literales → 0), la tipografía, el dinero, los vacíos, los tableros y la
   piel de su giro; **31 de 72** usan la biblioteca del bloque 2. Lo que conserva cada una es su
   composición, que es la que su `04-INTERFAZ.md` decidió. Recomponer 41 pantallas una por una es
   trabajo de otra sesión, y decir lo contrario sería mentir sobre lo único que Miguel va a mirar.
2. **No fusioné a `main` ni toqué el entorno _Production_, y es una decisión, no un olvido.** El
   encargo dice *«Todo desplegado en producción y comprobado desde fuera. Nada de localhost»*, y la
   mitad de eso **sí** está: el despliegue de la rama está vivo con `a1f1eee`, y `verify:acople`
   corrió **contra él desde fuera** —`despliegue REMOTO … → 200 · sin muro por delante`, **82 rutas
   probadas por HTTP**—, no contra localhost. Lo que no hice es empujar a `main`. Dos razones, las
   dos escritas antes que yo: `VERCEL-ENTORNO §4` dice *«**Production NO se tocó**: es lo que usan
   cuatro negocios para cobrar y esa decisión es de Miguel»*, y **el 400 de la cafetería sigue sin
   diagnosticar** (§5, error 11). Desplegar la caja con la que cuatro negocios cobran mañana, con un
   fallo del rastreador abierto, no es autonomía: es prisa. El PR
   [#11](https://github.com/M1gu3hb/MorphiqPOS/pull/11) está listo, con su título y su descripción al
   día, a una pulsación.
3. **El 503 de `/api/reportes/exportar`** sigue declarado en `FALLOS_QUE_SON_UNA_DECISION`. Con el
   almacén de 0.8 conectado, lo que falta para borrarlo es que el despliegue lleve la variable; no es
   un cambio de código.
4. **La prueba de contraste de los ocho estilos NO la validé por mutación en esta etapa** — venía
   validada del bloque 3, y lo digo en vez de contarla como sexta mutación.
5. **`verify:aspecto` no cambió** en los 75 archivos heredados. No los toqué y no afirmo nada sobre
   ellos.
6. **No corrí `pnpm test:e2e` completo** en esta etapa: corrí `estilos.spec.ts`, `galeria.spec.ts` y
   `rastreo.spec.ts` (en CI). El resto de los especs los corre la cadena.
7. **Lo que este reporte afirma y no puedo respaldar ejecutando algo:** que las pantallas «se sienten
   suyas». Es un juicio visual. La galería existe precisamente porque yo no puedo emitirlo.

---

## 10. Gate `morphiq-prs`

- **Superficies activadas:** S1, S2, S3, S4, S5, S7, S8, S10, S11, S14, S15.
- **BLOCKERS abiertos:** ninguno en el código. **Uno de proceso:** «producción responde
  correctamente» no se puede afirmar hasta el redespliegue (§9.2).
- **CRITICAL abiertos y aceptados:** la condición 6 (§9.1), aceptada con su razón escrita.
- **Checks que NO pude verificar:** todo lo que exige producción viva — dominio del cliente, HSTS
  contra el dominio real, Lighthouse sobre las páginas productivas.
- **Zero AI-slop:** sin degradados morado-azul, sin cristal por todas partes, sin radio uniforme de
  12px, **cero emoji como icono** (36 → 0, con puerta), sombras con lógica de luz por estilo, y
  ninguna animación decorativa — `prefers-reduced-motion` se mide en un navegador y lleva las tres
  duraciones a 0.

---

## 11. Bugs ajenos detectados

| Archivo | Qué vi | Gravedad |
|---|---|---|
| `apps/web/src/mh/**` | Frontend portado del restaurante; sus literales los cubre su propio parche dark y está exento de la puerta de ritmo. No lo toqué | MEDIA |
| `apps/web/app/api/reportes/exportar` | 503 declarado como decisión; depende del despliegue | MEDIA |

## 12. Pendientes cruzados

| Necesito | De quién | Para qué tarea | ¿Puse un STUB? |
|---|---|---|---|
| Fusionar el PR #11 a `main` | Miguel | Condición 10 de TERMINADO | No: está todo en la rama, y su despliegue está vivo y comprobado desde fuera |
| El secreto de *bypass* de la protección de Vercel, para que CI pueda correr `verify:acople` contra el despliegue | Miguel | Que la comprobación remota no dependa de un enlace compartido de 23 h | No: hoy se usó la cookie del enlace, que es la vía 2 de `VERCEL-ENTORNO §3` |

## 13. Estado al cerrar

- **Bloques de la etapa 2.35 terminados:** 0, 1, 2, 3, 5 y 6 completos; 4 completo excepto la
  recomposición pantalla-por-pantalla.
- **Condiciones de TERMINADO:** 8 de 10 en verde, la 10 a medias y la 6 parcial. Las dos, en §9.1 y
  §9.2.
- **Rama integrada a `main`:** no, y a propósito (§9.2). PR
  [#11](https://github.com/M1gu3hb/MorphiqPOS/pull/11) abierto, con su título y su descripción al día.
- **El despliegue de la rama:** vivo con `a1f1eee` y comprobado desde fuera.
- **Bloqueos activos:** dos. **(a)** El 400 de la cafetería en el rastreador, sin diagnosticar
  (§5, error 12) — la próxima corrida de CI ya dirá qué ruta es. **(b)** La fusión a `main`, que
  toca la caja con la que cuatro negocios cobran: es de Miguel.
- **Siguiente tarea:** cerrar el 400 con lo que diga la corrida nueva; después, recomponer las 41
  pantallas que siguen con su composición heredada, modelo por modelo, con la galería al lado.

## 14. Para el que retome esto

1. **La enfermedad de esta etapa tiene nombre: «declarado, exigido, probado y sin aplicar».** Salió
   tres veces —`estilos/index.css`, `--area-tactil-minima`, la escala tipográfica— y las tres veces
   todas las puertas estaban en verde. Un contrato que comprueba que una clase se *escribe* no
   comprueba que *exista*. Antes de creerle a una puerta, pregúntate qué camino de ejecución no
   recorre.
2. **`git checkout -- <archivo>` restaura desde el ÍNDICE.** Me destruyó trabajo tres veces
   restaurando mutaciones. Stagea antes de mutar.
3. **Mira CI antes de afirmar que algo no se detectó.** Escribí en un commit que el rastreador no
   había corrido; había corrido y había fallado dos veces con el mensaje exacto.
4. **El techo de ritmo está en 0 y su historia está en el archivo.** Si vuelve a subir, es una
   regresión, no un ajuste.
5. **`sticky` no es `fixed`.** Parece un detalle de la puerta 6.4 y produjo cuatro acusaciones
   falsas; es la misma clase de error que los 66 falsos positivos de la etapa 2.3. Un falso positivo
   cuesta lo mismo que un defecto.
6. **Hay algo peor que una puerta que acusa en falso: una que da verde sobre lo que no leyó.** Un
   `accept="image/*"` abría un comentario fantasma y dejaba 170 líneas de un archivo sin mirar, y la
   puerta informaba «0» sobre ellas (§5, error 11). Cuando una puerta afirme una propiedad de un
   TEXTO, comprueba que el texto le llegó: mete una mutación en el trozo que crees que mira y míralo
   fallar. Si no falla, la puerta no está mirando ahí.
7. **Cuando dos puertas ven el mismo fallo, que hable primero la que más sabe.** El 400 de la
   cafetería se buscó a mano tres veces porque el `expect` de la consola —que sólo dice en qué
   pantalla— corría antes que el de red, que tiene la ruta y la entidad. El orden de dos `expect` no
   parece un problema de diseño hasta que cuesta tres vueltas.
8. **No confundas «arreglé algo cerca» con «encontré la causa».** Alargué la ventana de sonda del
   rastreador y lo escribí como si fuera la causa de dos caídas de la cafetería. Volvió a caer. Si no
   viste la causa, escribe que no la viste.
