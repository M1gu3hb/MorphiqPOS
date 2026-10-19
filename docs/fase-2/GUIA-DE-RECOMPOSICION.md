# GUÍA DE RECOMPOSICIÓN · una pantalla con el lenguaje del sistema

Para recomponer una pantalla de `apps/web/src/<modelo>/` con la biblioteca de `packages/ui`.
Escrita en el cierre de la etapa 2.35, al abrir el bloque 2. Las dos pantallas de ejemplo —las
primeras que pasaron— son **`apps/web/src/cafeteria/Cobrar.tsx`** y
**`apps/web/src/ferreteria/Mostrador.tsx`**: se leen antes de empezar.

## 1 · Qué es «adoptada», y cómo se comprueba

`pnpm verify:adopcion` exige CUATRO condiciones, medidas sobre el árbol de sintaxis:

| | Condición | Qué la rompe |
| --- | --- | --- |
| 1.1 | Cero superficies a mano | Un elemento (o un `Link`) con radio + fondo + (borde o sombra); la `Card` de primitivas |
| 1.2 | Cero tablas ni filas de datos a mano | `<table>`, `<tr>`, `Table*` de primitivas, `role="row"`…, y un `.map()` que pinta `<li>`/`<div>` con `Dinero` o `Cifra` dentro |
| 1.3 | Cero dinero a mano | `Intl.NumberFormat` con moneda, `(x / 100).toFixed`, un `$` pegado a una expresión, un formateador propio (`enPesos`, `PESOS`), o `dineroEnTexto()`/`textoParaCampo()` pintados como contenido |
| 1.4 | Los tres estados del sistema | Tiene que PINTAR `Vacio`, `Esqueleto`/`EsqueletoDeLista` y `ErrorDePantalla` o `Aviso`, importados de `@morphiqpos/ui/sistema`; y ninguno a mano: `Skeleton` de primitivas, `role="alert"`, `animate-spin`, `Loader*`, el texto «Cargando» |

Una pantalla se comprueba sola, con todo lo demás:

```bash
node scripts/comprobar-pantalla.mjs apps/web/src/<modelo>/<Pantalla>.tsx
```

Formatea, y comprueba adopción, tokens (`verify:primitivas`), vocabulario, tipos y lint, filtrado
a ese archivo. Los tipos y el lint van por turno (un candado en disco): puede esperar. **Una
pantalla está terminada cuando esto imprime `✓`.**

## 2 · La biblioteca · `@morphiqpos/ui/sistema`

| Pieza | Para qué | Lo esencial |
| --- | --- | --- |
| `Superficie` | Toda caja: tarjeta, panel, franja, tesela | `nivel` 0–4 · `radio` sm/md/lg/completo · `relleno` 0/3/4/6 · `conBorde` · `como="section"\|"aside"\|"button"\|"label"\|"li"\|"form"…` con TODOS los atributos de esa etiqueta · `interactiva` (la tesela que se toca: sube, se hunde, foco en dos capas) · `activa` (la elegida de un grupo) · `ref` · `className` para el layout y el tinte (`border-peligro bg-peligro/10`) |
| `Isla`, `BarraFija` | Lo flotante y la cabecera pegajosa | |
| `Tabla` | TODA lista de filas de datos | `columnas: ColumnaDeTabla[]` (`clave`, `titulo`, `celda(fila)`, `numerica`, `orden`, `desde: 'sm'\|'md'\|'lg'`) · `filas` · `claveDe` · `alActivar` (fila como control, Enter/espacio) · `seleccion` · `vacio` · `alto` · `etiqueta` (nombre para el lector) · `pie` (totales POR columna: `{ importe: <Dinero …/> }`) · `tonoDeFila(fila) → 'advertencia'\|'peligro'\|'exito'\|'tenue'` (nunca solo: la celda dice por qué) · `viajeDeFila` · `activa` (la elegida: `aria-current` + seminegritas) · `etiquetaDeFila(fila)` (el NOMBRE de una fila que se toca: «Cobrar la mesa 4») |
| `TablaAdaptable` | La misma tabla en PC y tarjetas de dos renglones por debajo de `desde` (xl por omisión) | Las props de `Tabla` + `principal` (la columna que va grande en la tarjeta) + `columnasDeTarjeta` (`'dos'`\|`'una'`\|`'adaptable'`: una en el teléfono, dos desde `sm`). Pinta UNA de las dos, no las dos, y a las tarjetas les pasa `activa`, `tonoDeFila`, `viajeDeFila`, `etiquetaDeFila` y `pie` |
| `ListaDeTarjetas` | Sólo tarjetas | `columnas`, `filas`, `claveDe`, `principal`, `alActivar`, `vacio`, `activa`, `tonoDeFila`, `viajeDeFila`, `etiquetaDeFila`, `columnasDeTarjeta`, `pie` |
| `Dinero` | TODO importe | `centavos` · `tamano` xs/sm/base/lg/**xl** (la cifra de un tablero o resumen)/total (SÓLO el total y el cambio del cobro) · `conSigno` (movimientos y diferencias: «+» y verde; negativos entre paréntesis) · `sinSimbolo` |
| `Cifra` | Existencias, piezas, kilos, minutos | `valor` (acepta `null`: pinta «—») · `unidad` · `decimales` (`'auto'` por omisión: los que tiene, hasta dos) · `conSigno` · `tamano` |
| `dineroEnTexto(c)` | El importe como TEXTO, para un `aria-label`, el portapapeles, un mensaje de WhatsApp o el `formato` de una gráfica | Nunca entre dos `<span>`: ahí es `<Dinero>` |
| `CampoDeDinero` | El campo donde se teclea dinero | `centavos: number \| null` · `alCambiar(c \| null, { vacio, valido })` (el segundo dice si `null` es «vacío» o «no es un importe») · `tamano` base/grande/enorme (NUNCA `[&_input]:` desde fuera) · lee «12,50» como 12.50 y «1,250» como mil doscientos cincuenta · el resto, como un `<input>` (`id`, `aria-label`, `disabled`…). Sustituye al `Input` + `parseFloat` + `(c/100).toFixed(2)`. `centavosDeTexto` y `textoParaCampo` son sus dos conversiones |
| `Vacio` | El vacío que enseña qué hacer | `titulo` · `explicacion` · `icono` (lucide) · `accion` · `children` · `tamano` pantalla/compacto (dentro de una tarjeta o un paso)/protagonista (el vacío que ES la pantalla: «la fila está vacía») · `tono="exito"` (buena noticia) · `nivelDeTitulo` 2/3 (encabezado) · `idDelTitulo`. NUNCA `[&>p:first-of-type]:` desde fuera |
| `Esqueleto`, `EsqueletoDeLista`, `EsqueletoDeTabla` | Cargando, con la forma de lo que viene | `className` para el tamaño · `filas` · `columnas` (la de tabla, sin círculo de avatar) |
| `ErrorDePantalla` | La pantalla no pudo leer lo suyo | `titulo` · `queHacer` (la frase accionable) · `detalle` · `reintentar` (un `Button`) |
| `Aviso` | Un aviso dentro de la pantalla | `tono` info/exito/atencion/peligro · `titulo` (puede llevar `<Dinero>`) · `children` · `accion` · `icono` · `id` · `anuncio`: por omisión `peligro` es alerta y lo demás estado; `'alerta'` para una validación que tiene que oírse ya, `'ninguno'` para lo que está desde que se pinta (la franja de alergia) o cambia solo (una cuenta atrás) |
| `ConfirmacionDestructiva`, `IndicadorDeGuardado`, `Progreso` | Lo irreversible, lo guardado, lo que avanza | |
| `GraficaDeBarras`, `GraficaDeLineas`, `GraficaDeAreaApilada`, `GraficaDeDona`, `MapaDeCalorPorHora` | Los tableros | `formato={dineroEnTexto}` cuando los valores son centavos |
| `VIAJE`, `viaje`, `conTransicion` | Transiciones de vista | Ver §5 |

**Dos trampas que la revisión adversarial encontró en varias pantallas:**

- **El puente sirve en PESOS los campos con `conversion: 'dinero'`** (`packages/app/src/puente/mapa.ts`
  → `haciaEl` divide entre 100), aunque se llamen `…_centavos`. Antes de dárselos a `<Dinero>` o de
  mandarlos en un comando, se pasan a centavos con `centavosDelPuente` de `~/cliente/dinero-del-puente`.
  Los de `conversion: 'entero'` ya vienen en centavos.
- **`Button` con `cargando`** queda deshabilitado aunque se le pase `disabled={false}`; aun así, la
  función que manda el comando empieza con `if (ocupado) return;`: un doble toque llega antes que el
  re-pintado.

Las primitivas (`@morphiqpos/ui/primitivas/<pieza>`) siguen siendo las piezas: `Button`, `Input`,
`Label`, `Select`, `Dialog`, `Tabs`, `Badge`… Lo que ya NO se usa en una pantalla: `Card`, `Table*`
y `Skeleton` de primitivas.

## 3 · El vocabulario · un nombre por color, en español

`verify:primitivas` rechaza el alias en inglés y los literales. Se escribe:

| Se escribe | No |
| --- | --- |
| `bg-fondo` `bg-fondo-sutil` `bg-superficie` `bg-superficie-elevada` | `bg-background` `bg-muted` `bg-card` `bg-popover` |
| `text-texto` `text-texto-sutil` `text-texto-tenue` | `text-foreground` `text-muted-foreground` |
| `border-borde` `border-borde-fuerte` `ring-anillo` | `border-border` `border-input` `ring-ring` |
| `bg-primario` `text-primario-texto` `text-acento` `bg-acento-suave` | `bg-primary` `text-primary-foreground` `bg-accent` |
| `text-peligro` `bg-exito` `bg-advertencia/15` `text-info` | `text-destructive` `bg-success` `bg-warning/15` |
| `oscuro:` | `dark:` |
| `p-(--espacio-4)` `gap-(--espacio-3)` (tokens 0–6, 8, 10, 12, 16) | `p-4` `gap-3` (de 3 en adelante es ritmo: puentea la densidad) |
| `text-xs` … `text-3xl`, `text-display` | `text-4xl`, `text-[15px]` |
| `duration-(--duracion-rapida\|normal\|lenta)` `ease-(--curva-entrada)` | `duration-200` |
| `h-(--altura-control)` | `h-10`, `h-[var(--altura-control)]` |
| `shadow-0` … `shadow-4` (o `Superficie nivel`) | `shadow-md` |

Cero emoji: los iconos son de `lucide-react`. `✓ ✕ ▴ ▾` también son iconos: `Check`, `X`,
`ChevronUp`, `ChevronDown`.

## 4 · Los patrones que se repiten

**Cargar y reintentar.** El estado se limpia EN EL CLIC, no en el efecto (la regla de lint
`react-hooks/set-state-in-effect` rechaza un `setState` síncrono dentro de un efecto):

```tsx
const [intento, setIntento] = useState(0);
useEffect(() => {
  let vivo = true;
  leer().then((d) => { if (vivo) setDatos(d); })
        .catch((f: unknown) => { if (vivo) setFallo(f instanceof Error ? f.message : '…'); });
  return () => { vivo = false; };
}, [intento]);
// … <ErrorDePantalla … reintentar={<Button onClick={() => { setFallo(null); setDatos(null); setIntento((i) => i + 1); }}>Volver a intentar</Button>} />
```

**Qué estado es cuál.** No leyó nada → `ErrorDePantalla`. Leyó, y un comando falló →
`Aviso tono="peligro"` con lo que pasó y lo que NO pasó («No se cobró nada»). Un muro de negocio —la
caja cerrada, el turno cerrado— es un `Aviso tono="atencion"` con su `accion`, no una caja a mano.

**Si una pantalla de verdad NO tiene uno de los tres estados** —un diálogo que recibe lo que va a
mostrar y no lee nada—, no se inventa: se dice en el informe con la razón, y la fila va a
`SIN_ESTADO` de `scripts/verificar-adopcion.mjs` (la pone quien integra, no la pantalla).

**Una lista con un control por fila** (quitar, cantidad) sigue siendo `Tabla`: los botones van en
una celda y no activan la fila. **Una rejilla de cosas que se tocan** —los productos del cobro, las
mesas— no es una tabla: es un `<ul>` de `<li>` con UNA `Superficie como="button" interactiva`.

## 5 · El movimiento · sólo el que explica algo

`conTransicion(cambio)` envuelve un cambio en una transición de vista; lo que lleva el mismo nombre
de `VIAJE` antes y después, viaja. En el cobro de la cafetería la tesela vuela al renglón del
pedido: la tesela lleva el nombre, y dentro del cambio (con `flushSync`) se lo pasa a la fila
(`viajeDeFila`). La página no se funde, y en `movimiento: nula` o con la preferencia del sistema
dura cero. Se usa donde el encargo lo pidió: el producto que salta al carrito, la mesa que se
expande a la cuenta, la fila que se convierte en panel. **Ninguna animación decorativa.**

## 6 · Cada modelo sigue siendo suyo

El layout en PC, tableta y teléfono ya está decidido en el `04-INTERFAZ.md` de su modelo
(`docs/fase-2/modelos/<familia>/<modelo>/04-INTERFAZ.md`, su «PANTALLA · …»): se lee su sección
antes de tocar la pantalla. La densidad, la pantalla de inicio, qué va grande y el vocabulario
(`useVocabulario()`) son del modelo (`04-SISTEMA-DE-DISENO.md §2`). Se pone al lado de la misma
pantalla del modelo más parecido: si no se distinguen, falta trabajo.

## 7 · Lo que no se hace

- Degradados, cristal por todas partes, todo a `rounded-xl`, sombras sin lógica de luz, bordes
  laterales de color como acento, texto de relleno. Cada etiqueta dice lo que ese giro dice.
- Cambiar el comportamiento: los mismos comandos, las mismas rutas, los mismos datos. Esto es
  lenguaje visual, no lógica.
- Cambiar sin necesidad un texto visible, un `id`, un `aria-label` o el nombre de un botón: las
  suites de navegador los usan. Si hace falta, se cambia y **se dice en el informe**.
- Tocar `packages/ui`, `apps/web/heredado`, las pruebas u otra pantalla. Si a la biblioteca le falta
  algo, se dice en el informe.
