# 02 · ESTÁNDAR DE CARPETA DE MODELO

**Este documento es el contrato. Toda carpeta de modelo de negocio lo cumple, sin excepción.**
Existe por una razón: sin él, 78 carpetas salen genéricas, se parecen entre sí y el trabajo no vale nada.

---

## 1 · LA REGLA QUE MANDA SOBRE TODAS

> Cada modelo de negocio se documenta **como si fuera el único punto de venta que existe en el mundo.**

No se documenta "el POS con la plantilla de veterinaria puesta". Se documenta **el punto de venta para veterinarias**. La diferencia no es de tono: es de fondo. Si al leer una carpeta se nota que por debajo hay un sistema genérico, esa carpeta está mal y se rehace.

**Prohibido explícitamente:**

- Copiar y pegar una sección de otro modelo cambiando las palabras.
- Escribir "igual que en restaurante pero con X". Si es igual, se cita el ID de función y se dice **por qué** es igual. Si no es igual, se describe entero.
- Dejar una pantalla descrita como "listado estándar con filtros". Eso no es una descripción, es una excusa.
- Decidir algo "porque así quedó". Toda decisión de interfaz lleva su razón, y la razón viene del negocio, no del sistema.
- Inventar una diferencia para que no se parezca a otro modelo. Diferenciar por diferenciar es tan malo como no diferenciar. **La diferencia sale de cómo trabaja ese negocio, o no va.**

---

## 2 · LOS SIETE ARCHIVOS

Cada carpeta `modelos/<familia>/<modelo>/` tiene **exactamente** estos siete archivos. Ni más ni menos.

```
00-FICHA-Y-EJES.md        quién es, cómo es su día, los seis ejes con su valor
01-FUNCIONES.md           el árbol completo con IDs canónicos y marcas
02-DINERO-Y-CAJA.md       cómo cuadra el dinero, la caja, el corte y su PDF
03-INVENTARIO.md          qué variante, qué unidades, qué se descuenta y cuándo
04-INTERFAZ.md            pantallas, layouts por dispositivo, dashboard, vocabulario
05-DATOS-Y-BACKEND.md     entidades, comandos, migraciones, dependencias
FILE-MAP.md               índice de la carpeta y dónde vivirá el código
```

---

## 3 · QUÉ LLEVA CADA ARCHIVO

### `00-FICHA-Y-EJES.md`

**Propósito:** que quien lo lea entienda el negocio antes que el software.

1. **Qué es este negocio.** Dos párrafos. Cómo gana dinero, qué vende, quién entra por la puerta.
2. **Quién lo compra.** El perfil real del dueño en México: cuántos empleados, si sabe de computación, qué usa hoy (cuaderno, Excel, otro sistema), cuánto puede pagar al mes.
3. **El día completo.** Hora por hora, desde que abre hasta que cierra. Qué hace cada persona. Dónde toca el sistema y dónde no. **Este apartado es el que desbloquea todo lo demás:** las pantallas salen de aquí, no al revés.
4. **Los seis ejes**, con su valor y una frase de por qué.
5. **Arquetipo base + deltas.** Qué arquetipo es y qué se le añade.
6. **Lo que este negocio NO necesita.** Tan importante como lo que necesita. Un sistema que enseña lo que no usas es un sistema difícil.
7. **Los tres dolores.** Las tres cosas que más le duelen hoy a ese dueño. El sistema tiene que resolverlas o no se vende.

### `01-FUNCIONES.md`

**Propósito:** el inventario exacto de qué se construye.

- Árbol completo en formato `tree`, con **IDs canónicos** del catálogo (`03-CATALOGO-DE-FUNCIONES.md`).
- Cada función marcada: `[=]` idéntica · `[≠]` variante · `[+]` exclusiva · `[⚙]` ya existe · `[◐]` parcial.
- **Para cada `[=]`:** el modelo de donde se reutiliza y la confirmación de que el comportamiento es idéntico. Si hay la más mínima diferencia, deja de ser `[=]` y pasa a `[≠]`.
- **Para cada `[≠]`:** una tabla de tres columnas — qué hace en el otro modelo · qué hace aquí · por qué la diferencia.
- **Para cada `[+]`:** por qué ningún otro modelo la necesita.
- **Dependencias:** qué función no se puede construir sin cuál. Con flechas.
- **Orden de construcción** sugerido, derivado de las dependencias.

### `02-DINERO-Y-CAJA.md`

**Propósito:** que el dinero cuadre. Es el archivo más importante de la carpeta.

1. **Qué cuenta como venta y qué no.** Anticipos, depósitos, propinas, envío, comisiones de terceros, vales, cortesías. Uno por uno, con su tratamiento.
2. **Impuestos.** IVA extraído o sumado, tasa, exentos, cómo se muestra.
3. **Descuentos.** Quién puede darlos, hasta cuánto, si requieren autorización, cómo afectan al margen.
4. **Propinas.** Qué variante, quién las recibe, cómo se reparten, cómo se liquidan. Si no hay, se dice y se explica por qué.
5. **Métodos de pago** de este giro en concreto, y cuál es el más común.
6. **Anticipos y crédito**, si aplican: cuándo se reconocen, cómo se aplican, qué pasa si se cancela.
7. **Comisiones**, si aplican: a quién, sobre qué base, cuándo se causa.
8. **La caja de este negocio.** Cómo se abre, qué movimientos tiene, quién la opera, cuántas hay. **La caja cambia por modelo y esto no es cosmético:** en una estética el arqueo separa comisión del estilista; en un taller, el anticipo de la orden abierta; en un hotel, la caja del turno de noche.
9. **El corte y su PDF.** Qué lleva y qué NO lleva el corte de ESTE negocio. Un corte de restaurante lleva propinas por mesero; uno de abarrotes lleva faltantes por producto; uno de citas lleva ocupación de agenda y comisión por profesional. **Escribe el contenido del PDF sección por sección, en orden.**
10. **Los cinco descuadres típicos** de este giro y cómo el sistema los previene o los detecta.

### `03-INVENTARIO.md`

**Propósito:** que el control cuadre.

- **Qué variante** del catálogo de inventario (V1 a V10), y por qué esa.
- Si no lleva inventario: se dice, se explica, y el archivo es corto. No se inventa.
- **Unidades** que maneja este giro, con ejemplos reales de productos.
- **Qué se descuenta, cuándo y con qué disparador.** El "cuándo" es crítico: al cobrar, al entregar, al producir, al reservar.
- **Entradas:** compra, producción, devolución, ajuste, traspaso.
- **Salidas:** venta, merma, consumo interno, traspaso, caducidad, robo.
- **Cómo se toma el inventario físico** en este giro y cada cuánto.
- **Las mermas propias del giro** y cómo se registran.
- **Alertas** que importan aquí y cuáles serían ruido.
- **Los tres errores de inventario** que más comete este negocio.

### `04-INTERFAZ.md`

**Propósito:** que se vea y se opere como ese negocio. Es el archivo más largo.

**4.1 · Vocabulario del giro.** Tabla completa. La entidad interna, cómo se llama en pantalla en este modelo, y el plural. Ejemplo: `mesa` → "bahía" en taller, "cabina" en spa, "habitación" en hotel, "cancha" en deportivo.

**4.2 · Navegación.** Qué secciones existen, en qué orden en la barra lateral, y **por qué ese orden**. El orden es el del día de trabajo, no el alfabético ni el del sistema.

**4.3 · Cada pantalla, una por una.** Para cada una:

- **Propósito en una frase.** Para qué se abre.
- **Cuántas veces al día se abre** y por quién. Esto decide cuánto merece la pantalla.
- **La acción principal.** Una sola. La que se hace el 80% de las veces. Debe ser lo más grande, lo más accesible y alcanzable sin pensar.
- **Qué se ve primero** sin hacer scroll ni clic.
- **Jerarquía visual:** qué es primario, secundario y terciario, y por qué.
- **Layout en PC** (≥1280px): estructura en columnas, qué va dónde.
- **Layout en tablet** (768–1279px): qué se reacomoda. La tablet es el dispositivo real del mesero, del recepcionista y del almacenista.
- **Layout en teléfono** (<768px): qué sobrevive y qué se esconde. En muchos giros el teléfono es el dispositivo principal del dueño.
- **Estados:** vacío, cargando, error, sin permiso, sin conexión. El estado vacío es una oportunidad de enseñar, no un hueco.
- **Atajos de teclado**, si la pantalla se usa mucho con teclado.
- **Qué NO va en esta pantalla** aunque el sistema lo tenga.

**4.4 · El dashboard.** Completo y distinto para cada modelo.
- Qué indicadores, en qué orden, en qué tamaño.
- **Por qué esos y no otros.** Cada indicador se justifica por una decisión que el dueño toma al verlo.
- Qué gráfica, si alguna, y qué pregunta contesta.
- Qué se ve al abrir a las 8 de la mañana contra a las 10 de la noche, si cambia.
- **Qué NO va en el dashboard de este negocio** aunque exista el dato.

**4.5 · Multi-sucursal.** Cómo cambia todo lo anterior cuando hay dos o más sucursales. Qué se consolida, qué se separa, qué ve un gerente de sucursal contra el dueño.

**4.6 · Accesibilidad y condiciones reales.** Este giro opera con guantes, con las manos mojadas, con poca luz, con ruido, de pie, con prisa. Lo que aplique, y qué implica para los tamaños de toque y el contraste.

### `05-DATOS-Y-BACKEND.md`

**Propósito:** que se pueda construir sin volver a pensar.

- **Entidades nuevas** que este modelo necesita, con sus campos, tipos y restricciones.
- **Entidades existentes** que hay que extender, y con qué campos.
- **Reglas de integridad** que la base debe garantizar (no la aplicación).
- **Comandos** que hay que crear: nombre, entrada, roles, paquetes, qué escribe, si es idempotente.
- **Entradas del puente**: qué entidades se exponen a lectura, con qué `rolesLectura` y qué campos se descartan.
- **Rutas de API** nuevas.
- **Migraciones**: numeradas, en orden, con lo que crean. Escritas, **no aplicadas**.
- **Dependencias externas:** librerías, con versión y por qué esa. Integraciones con terceros (PAC de facturación, pasarela, WhatsApp, mapas).
- **Qué se reutiliza tal cual** del código que ya existe, con la ruta del archivo.

### `FILE-MAP.md`

**Propósito:** que nadie se pierda y nada se pierda.

- Índice de los seis archivos anteriores con una línea de qué hay en cada uno.
- **Dónde vivirá el código** cuando se acople: la ruta exacta dentro del monorepo, archivo por archivo.
- Qué funciones de este modelo ya están construidas en otro modelo y dónde.
- Estado: no empezado / en progreso / terminado / revisado.

---

## 4 · LAS CUATRO PREGUNTAS DE CIERRE

Al terminar cada modelo, se contestan por escrito **al final de `FILE-MAP.md`**. No es un trámite: si alguna respuesta es floja, el modelo no está terminado.

**P1 · ¿Es fiel al negocio?**
¿Alguien que lleva veinte años en este giro leería esto y diría "sí, así trabajamos"? ¿O diría "esto lo escribió alguien que nunca ha estado en uno"?

**P2 · ¿Da control total?**
¿Puede el dueño contestar, con este sistema, cualquier pregunta que se haga sobre su negocio? Cuánto vendí, cuánto gané, qué me falta, quién me está robando, qué se está echando a perder, quién trabaja mejor.

**P3 · ¿Parece hecho a la medida?**
Si alguien que sólo conoce este giro recorriera un día completo con el sistema, ¿creería que se construyó exclusivamente para su negocio? ¿O notaría que es un sistema genérico con una máscara?

**P4 · ¿Se distingue de sus vecinos?**
Pon este modelo al lado del más parecido de su familia. ¿Un extraño notaría la diferencia sólo viendo las pantallas? Si no, uno de los dos está mal documentado — **o los dos deberían ser el mismo modelo**, y eso también hay que decirlo.

---

## 5 · CÓMO SE MARCA UNA FUNCIÓN COMPARTIDA

Éste es el punto donde más fácil se pierde el trabajo. Reglas exactas:

**Si la función es idéntica** — mismo comportamiento, mismos campos, mismas reglas:
```
F-042 Arqueo a ciegas [=] ← reutiliza de: restaurante
      Idéntica. Mismo flujo, mismos campos, misma regla de no
      mostrar el esperado antes de contar.
      NO SE VUELVE A CONSTRUIR.
```

**Si se llama igual pero cambia** — aunque sea un solo campo:
```
F-018 Inventario [≠] variante V3 (presentaciones)
      ┌─────────────────┬──────────────────────┬─────────────────────┐
      │ En restaurante  │ Aquí                 │ Por qué             │
      ├─────────────────┼──────────────────────┼─────────────────────┤
      │ gramos y ml     │ pieza y caja         │ no se cocina, se    │
      │ receta explota  │ factor de conversión │ revende empaquetado │
      │ al cobrar       │ al cobrar            │                     │
      └─────────────────┴──────────────────────┴─────────────────────┘
      SE CONSTRUYE EL TRONCO UNA VEZ + ESTA VARIANTE.
```

**Si es exclusiva:**
```
F-091 Control volumétrico [+] exclusiva de: gasolinera
      Ningún otro modelo mide despacho por litro contra tanque.
      Obligación fiscal, no comodidad.
```

**La trampa a evitar:** marcar algo como `[=]` porque *suena* igual. Antes de marcar `[=]`, compara campo por campo y regla por regla. Una función mal marcada como idéntica es un bug garantizado, y es el error más caro de este proyecto.

---

## 6 · ORDEN DE TRABAJO POR MODELO

1. Leer `01-MAPA-GENERAL.md` y localizar el modelo: su arquetipo y sus deltas.
2. **Investigar el negocio de verdad.** Cómo opera en México, qué software usa hoy, qué le duele. Sin esto, todo lo demás sale genérico.
3. Escribir `00-FICHA-Y-EJES.md`. El día completo es lo que desbloquea el resto.
4. Escribir `01-FUNCIONES.md` contra el catálogo de IDs.
5. Escribir `02-DINERO-Y-CAJA.md`. Con calma. Es el que más importa.
6. Escribir `03-INVENTARIO.md`.
7. Escribir `04-INTERFAZ.md`. Es el más largo y el que más se nota.
8. Escribir `05-DATOS-Y-BACKEND.md`.
9. Escribir `FILE-MAP.md` y contestar las cuatro preguntas.
10. Actualizar `07-ESTADO.md` en la raíz de `fase-2/`.

## 7 · LA SEGUNDA PASADA

Cuando estén los 78, se da **una pasada de revisión** leyendo sólo `00-FICHA-Y-EJES.md` y `FILE-MAP.md` de cada uno, en orden, y se vuelven a contestar las cuatro preguntas. Lo que se busca en esa pasada:

- Modelos que quedaron demasiado parecidos entre sí → o se fusionan o se diferencian de verdad.
- Funciones marcadas `[=]` que en realidad divergen → se reclasifican a `[≠]`.
- Funciones marcadas `[≠]` que en realidad son iguales → se consolidan, y eso es trabajo ahorrado.
- Vocabulario inconsistente entre modelos de la misma familia.
- Huecos: algo que un modelo necesita y no se documentó.

**La Fase 2 no está lista sin esa segunda pasada.**
