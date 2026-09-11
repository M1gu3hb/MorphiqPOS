# 05 — Sistema de diseño y estilos intercambiables

Decisión A-23: **tokens + 4 perillas estructurales.** Un solo juego de componentes que cambia de estilo como cambia de modo oscuro.

---

## 1. Por qué esto importa más de lo que parece

Tres razones, en orden de peso:

1. **Es jugada de venta.** Parado frente al dueño, Miguel le cambia el sistema completo de aspecto y le pregunta cuál le late. Eso convierte una demo pasiva en una conversación de decisión.
2. **Es lo que hace barata la personalización.** Un cliente que quiere "otro look" es Nivel 2 (composición, horas), no Nivel 4 (código, semanas).
3. **Miguel dijo que el diseño actual de tiendita se ve genérico.** Con tokens, arreglarlo es cambiar valores, no reescribir 100 componentes.

---

## 2. Anatomía: tres capas

```
Capa 3 · ESTILO      premium · editorial · industrial · skeuomorfico
                     ↓ define los valores de…
Capa 2 · PERILLAS    densidad · redondeo · elevación · movimiento
                     ↓ junto con los…
Capa 1 · TOKENS      color · tipografía · espacio · sombra · radio · borde
                     ↓ que consumen…
                     COMPONENTES  (uno solo por cada cosa)
```

**Regla dura:** ningún componente contiene un color, un tamaño, un radio o una sombra literal. Todo sale de un token. Un `className="bg-blue-600"` en un componente hace fallar la revisión.

---

## 3. Capa 1 — Los tokens

Se conserva el esquema de shadcn que **ambos sistemas ya usan** (HSL sin `hsl()`), y se le añade lo que faltaba.

### Color

```css
--fondo · --fondo-sutil · --superficie · --superficie-elevada
--texto · --texto-sutil · --texto-tenue
--borde · --borde-fuerte · --anillo
--primario · --primario-texto
--acento · --acento-texto
--exito --advertencia --peligro --info  (+ sus -texto)
--grafico-1 … --grafico-6
--lateral-fondo · --lateral-texto · --lateral-activo · --lateral-borde
```

> Se conservan `--success` y `--warning` que tiendita ya había añadido fuera del set estándar de shadcn — fueron buena decisión y hacen falta en un POS.

### Tipografía

```css
--fuente-ui · --fuente-numeros · --fuente-display
--tamano-xs … --tamano-3xl
--peso-normal · --peso-medio · --peso-fuerte
--interlinea-compacta · --interlinea-normal · --interlinea-amplia
--tracking-compacto · --tracking-normal
```

> **`--fuente-numeros` es obligatoria y debe ser tabular.** En un POS los importes se leen en columna: sin cifras de ancho fijo, los totales bailan y el cajero se equivoca. Ninguno de los dos sistemas lo tenía.

### Espacio, radio, sombra, borde

```css
--espacio-0 … --espacio-16       escala base 4px, multiplicada por la densidad
--radio-sm · --radio-md · --radio-lg · --radio-completo
--sombra-0 … --sombra-4
--borde-ancho · --borde-estilo
--duracion-rapida · --duracion-normal · --duracion-lenta
--curva-entrada · --curva-salida · --curva-resorte
```

---

## 4. Capa 2 — Las cuatro perillas

Son lo que hace que los estilos se sientan **estructuralmente** distintos y no sólo "pintados de otro color".

### Perilla 1 — Densidad

| Valor      | Multiplicador de espacio | Altura de control | Uso                                     |
| ---------- | ------------------------ | ----------------- | --------------------------------------- |
| `comoda`   | 1.25                     | 48 px             | Tablet de mesero, portal QR, dedos      |
| `normal`   | 1.0                      | 40 px             | Escritorio de gestión                   |
| `compacta` | 0.75                     | 32 px             | Caja con teclado, cocina, listas largas |

**Se selecciona automáticamente por layout**, y el usuario puede sobrescribir. `(operacion)` en tablet → `comoda`. `(operacion)` en escritorio → `compacta`. `(gestion)` → `normal`.

> Nota de accesibilidad: `compacta` nunca baja de **44×44 px de objetivo táctil efectivo** en dispositivos con puntero grueso, aunque el control se vea de 32 px (se logra con área de toque extendida). Regla de `morphiq-prs` §06.

### Perilla 2 — Escala de redondeo

`nula` (0) · `sutil` (4px) · `media` (8px) · `amplia` (14px) · `pastilla` (999px)

### Perilla 3 — Tipo de elevación

| Valor         | Cómo se separa una superficie de otra                                               |
| ------------- | ----------------------------------------------------------------------------------- |
| `plana`       | Sólo borde. Cero sombra                                                             |
| `sombra`      | Sombra suave difusa                                                                 |
| `doble-bisel` | Luz interior arriba + sombra interior abajo + sombra exterior (el look de tiendita) |
| `linea-dura`  | Borde grueso, offset sólido sin difuminar                                           |

### Perilla 4 — Intensidad de movimiento

`nula` · `sutil` · `normal` · `expresiva`

**Siempre respeta `prefers-reduced-motion`**, sin importar la perilla.

---

## 5. Capa 3 — Los estilos

Un estilo es un archivo que fija tokens y perillas. Nada más. **No hay componentes alternos por estilo.**

### `premium` — Apple / Linear

Neutros fríos con un acento saturado · sans geométrica · **densidad normal · redondeo amplio · elevación doble-bisel · movimiento expresivo** · transiciones con curva de resorte.
**Para:** login, dashboard, reportes, pantallas del dueño. Es el que vende en una demo.

### `editorial` — Notion / Craft

Monocromo cálido con acentos pastel · contraste tipográfico fuerte, títulos grandes · **densidad normal · redondeo sutil · elevación plana · movimiento sutil** · mucho aire.
**Para:** clientes que quieren algo serio y sobrio. Es el más rápido de construir y el que mejor envejece.

### `industrial` — terminal / blueprint

Alto contraste, casi monocromo con un acento de señal · mono o grotesca condensada · **densidad compacta · redondeo nulo · elevación línea-dura · movimiento nulo** · rejilla rígida visible.
**Para:** operación pura, cocina, almacén, y clientes a los que "bonito" les da desconfianza.

### `skeuomorfico` — el look actual de tiendita

Gradientes verticales suaves, botones con hundido al presionar · **densidad normal · redondeo medio · elevación doble-bisel · movimiento sutil**.
**Para:** conservar lo que ya conocen la ferretería y la tienda.

> **Las clases `skeu-*` de tiendita no se copian como CSS plano.** Se traducen a este estilo, con sus valores como tokens. Así el look sobrevive como una opción en vez de quedarse hardcodeado en `globals.css`.

### Modo claro y oscuro

**Es ortogonal al estilo.** Cada estilo define su paleta clara y su paleta oscura. `premium claro`, `premium oscuro`, `industrial oscuro` — 4 estilos × 2 modos = 8 combinaciones, todas del mismo juego de componentes.

Se conserva `next-themes` con `attribute="class"`, como en tiendita. El estilo se aplica con `data-estilo="premium"` en `<html>`.

---

## 6. Marca del cliente encima del estilo

El estilo es la **forma**; la marca es el **color y el logo**. Se aplican en ese orden:

```
estilo (premium)  →  marca del cliente (color primario, logo, tipografía)  →  pantalla final
```

De `configuracion.apariencia`: `color_primario · color_acento · logo_url · logo_ticket_url · fondo_url · opacidad_fondo · fuente_ui`.

> Se hereda de (A) el trabajo de `brandColors.js` (4.6 KB) y `darkPalettes.js` (9.5 KB): ya resuelven derivar una paleta completa y accesible desde un color primario. Es material portable de valor real.

**Validación obligatoria:** al guardar un color de marca, el servidor verifica contraste AA contra el fondo del estilo activo. Si no pasa, ajusta el tono automáticamente y avisa. Un cliente no puede dejar su POS ilegible por elegir amarillo.

---

## 7. Densidad por contexto: quién ve qué

| Contexto                | Layout        | Estilo por defecto     | Densidad     | Por qué                                      |
| ----------------------- | ------------- | ---------------------- | ------------ | -------------------------------------------- |
| Login                   | `(auth)`      | el del negocio         | normal       | Primera impresión. Es la escena 1 de la demo |
| Dashboard del dueño     | `(gestion)`   | el del negocio         | normal       | Lo ve quien decide la compra                 |
| Venta / caja escritorio | `(operacion)` | el del negocio         | **compacta** | Velocidad. Diez horas seguidas               |
| Mesero tablet           | `(operacion)` | el del negocio         | **cómoda**   | Dedos, de pie, con prisa                     |
| Cocina KDS              | `(operacion)` | **industrial** forzado | compacta     | Se lee a 2 metros, con las manos ocupadas    |
| Portal QR               | `(publico)`   | el del negocio         | cómoda       | Teléfono del comensal                        |
| Vista cliente           | `(publico)`   | el del negocio         | cómoda       | Segundo monitor, se lee de lejos             |

> Cocina es el único caso donde el estilo se fuerza: ahí manda la legibilidad a distancia, no la marca.

---

## 8. Reglas de no-slop

De `morphiq-prs` §03, aplicadas a este sistema:

1. **Cero gradiente azul-morado** salvo dirección visual explícita del cliente.
2. **Cero glassmorphism** por defecto.
3. **Cero radio uniforme en todo**: la escala de redondeo tiene tres niveles y se usan los tres.
4. **Ritmo deliberado**: cambios reales de escala, densidad y composición entre secciones. Nada de "todo son tarjetas del mismo tamaño".
5. **Microcopy específico.** Nada de "Ocurrió un error". Un vacío dice "Todavía no hay ventas hoy — la primera aparecerá aquí".
6. **Animación con propósito.** Si no comunica estado o continuidad, no va.
7. **Cero componente de scaffold visible.** Nada de favicon de framework ni "Get Started".
8. Revisión obligatoria a **100 %, 125 % y 200 % de zoom**.

---

## 9. Accesibilidad como puerta, no como intención

Se verifica en CI, no en la revisión final:

- Contraste AA: 4.5:1 texto normal, 3:1 texto grande. **En los cuatro estilos y en ambos modos.**
- Foco visible siempre, nunca oculto por barras fijas ni modales.
- Navegación completa por teclado en venta, cobro, caja y comanda.
- Objetivo táctil ≥ 44 px efectivos en pantallas de operación.
- El color nunca es el único indicador de estado — siempre hay icono o texto.
- Los modales manejan foco, `Escape` y devolución del foco.
- Texto a 200 % sin pérdida de contenido.

**Justificación práctica, no normativa:** un POS lo usa un empleado diez horas al día, a veces con poca luz, a veces de reojo mientras cobra. La accesibilidad aquí es velocidad y menos errores de cobro.

---

## 10. Cómo se construye, y en qué orden

| Corte    | Qué se construye del diseño                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1.0** | Tokens completos · las 4 perillas · `premium` y `editorial` en claro y oscuro · las 49 primitivas de shadcn en `.tsx` tokenizadas · página `/estilos` para verlas todas |
| **F1.1** | Layouts `(auth)` y `(gestion)` · componentes de formulario y tabla                                                                                                      |
| **F1.2** | Layout `(operacion)` · densidad compacta · componentes de venta y cobro                                                                                                 |
| **F1.3** | Componentes de inventario y compras · gráficas tokenizadas                                                                                                              |
| **F1.4** | Estilo `industrial` · KDS · densidad cómoda para tablet · mapa de mesas                                                                                                 |
| **F1.5** | Estilo `skeuomorfico` · layout `(publico)` · el selector de estilos en configuración · auditoría de contraste de los 4 estilos                                          |

**La página `/estilos` se construye en F1.0 y se mantiene siempre.** Muestra todas las primitivas en los 4 estilos × 2 modos × 3 densidades. Sirve para tres cosas: detectar regresiones visuales, revisar contraste, y **enseñársela a un cliente en la demo**.

---

## 11. Lo que este sistema NO hace

Para que no crezca sin control:

- **No permite layouts alternos por estilo.** Un estilo cambia tokens y perillas, no reorganiza la pantalla. Eso multiplicaría el QA por cuatro (riesgo R-03).
- **No permite CSS suelto en componentes.** Todo por tokens y utilidades.
- **No permite que un cliente edite CSS.** Elige estilo, colores, logo y tipografía. Nada más.
- **No incluye un editor visual de temas** en Fase 1. Se evalúa después, si algún cliente lo paga.
