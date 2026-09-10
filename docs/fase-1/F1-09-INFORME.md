# F1-09 · Informe de Fase 1

**Para Miguel. 10 de septiembre de 2026.**

---

## Cómo abrirlo

```bash
pnpm --filter @morphiqpos/web dev
```

`http://localhost:3000` · entra con tu PIN. Tú eres **Miguel** (dueño); están
también Lupita (mesera), Toño (cocina) y Rosa (caja).

---

## Qué hay hoy

**Tu sistema, entero.** Tus 18 pantallas y sus componentes viven en
`apps/web/heredado/`, copiados literal: tu diseño, tus rutas, tus textos. Lo que
cambió está DEBAJO.

Antes, tu POS decidía en el navegador lo que cuesta la comida, quién puede
borrar el negocio y cuánto queda en el almacén. Ahora eso lo decide el servidor,
y tus pantallas se lo piden.

**El circuito completo, ejecutado y abierto en el navegador contra la base real:**
abrir la mesa 3 con «Familia Ramírez» y «Alergia al cacahuate» → añadir una
arrachera y dos cervezas → «Enviar a Cocina» → la comanda aparece en Cocina **con
el banner rojo de la alergia**, y la cerveza se va a barra por separado →
«Preparar» la mueve de columna → precuenta impresa con tu formato y su código
M03‑7840 → cobro mixto → folio A‑3 → mesa libre.

### Las reglas que tu sistema rompía, comprobadas contra Postgres

Cobro de $439.00 con propina de $50 en efectivo y $30 en tarjeta:

| Regla | Lo que dice la base |
|---|---|
| El total de la venta **no** incluye propina | 43 900 centavos; los $80 viven en `pagos` |
| La propina por método es **exacta** | efectivo 5 000 · tarjeta 3 000. No el reparto proporcional, que habría dado 5 467 / 2 533 |
| La propina no entra en costo, utilidad ni margen | 43 900 − 14 840 = 29 060, margen 66,19 % |
| El inventario se mueve **sólo al cobrar** | −280 g arrachera, −150 g frijol, −150 g arroz, −4 tortillas, −2 cervezas |
| Cocina no ve costos ni márgenes | su ficha lleva producto, cantidad, notas y la alergia |

### El peor defecto, cerrado

Tus cinco funciones de mantenimiento aceptaban `{"rol":"administrador"}` en el
cuerpo de la petición: cualquiera podía borrar el negocio entero desde la
consola del navegador. Ahora el rol sale de la sesión, y el envoltorio de
comandos **rechaza al cargar el módulo** cualquier comando que se atreva a
declarar `rol`, `organizacion_id` o `empleo_id` en su entrada. No es disciplina:
no compila.

Probado en vivo: mandar `{"rol":"dueno"}` → **400**. Un cajero borrando un corte
de caja → **403**. Ese mismo cajero limpiando avisos antiguos → **200**.

---

## Tres fallos que sólo aparecieron al ejecutarlo

Los tres pasaban las pruebas en verde. Los tres habrían llegado a tu
restaurante.

1. **Ningún cobro pasaba.** `marcarPagada` no escribía la fecha de cierre que mi
   propia migración exige. Todo cobro abortaba con un 23514.
2. **Ninguna caja se podía cerrar.** El mismo defecto, en `cerrarSesion`: ponía
   el estado y dejaba el folio en nulo. El cajero leía «Algo falló de nuestro
   lado» y nada más.
3. **Las cinco purgas fallaban.** Una tabla de la lista no tiene
   `organizacion_id`, y la consulta tumbaba la transacción entera.

Los tres se escapaban por lo mismo: **los dobles en memoria de las pruebas no
modelan la base**. Por eso los contratos nuevos no son del fallo de ayer:
`estados-con-columna` **lee los `check` de las migraciones** y deriva la regla;
`acotacion` **lee el esquema** y comprueba tabla por tabla. El siguiente de cada
familia ya está vigilado sin tocar nada.

---

## La puerta que faltaba

Las dos puertas del repositorio son **ciegas** a `apps/web/heredado/`:
`checkJs: false` hace que `tsc` no mire ni un `.jsx`, y el `include` de vitest no
llega a esa carpeta. Cinco agentes las presentaron como prueba de su trabajo y
las dos salieron en verde sobre una tanda que había borrado tarjetas enteras de
tu interfaz.

`pnpm verify:aspecto` compara los testigos de aspecto de cada archivo tocado
—cada clase de CSS, el texto de los nodos, los iconos, los avisos— contra la
referencia. La estructura tumba la puerta; los textos de aviso se listan siempre
y sólo tumban con `--estricto`. Las excepciones exigen un motivo escrito.

**Medido: 40 archivos tocados —11 de ellos pantallas—, tres excepciones
escritas, cero cambios de estructura.**

---

## Lo que NO hice

Esto es lo importante de este informe.

### No funciona

- **Subir imágenes.** `/api/archivos/subir` no existe y tres pantallas lo
  llaman: el logo del negocio, la identidad y las imágenes del menú QR. El
  `.env` ya tiene `STORAGE_*` configurado; falta la ruta, la validación del tipo
  real del archivo y el límite de tamaño. **Es el hueco más visible que queda.**
- **Modificadores con precio.** Los que elige el comensal («sin cebolla») ahora
  llegan a la cocina dentro de la nota. Los que SUMAN al precio necesitan su
  columna y su cálculo en el servidor. No están (E9-3).
- **`pages/Barra.jsx` no tiene ruta.** Nadie la importa y tu propio
  `constants.js` dice que «Barra deja de ser rol principal, ahora es una
  estación de la cocina». La cableé para no dejar una trampa en el árbol, pero
  no se puede llegar a ella.

### Funciona distinto, y hay que saberlo

- **Caja no se refresca si la ventana no tiene el foco.** Su consulta usa
  `refetchInterval` sin `refetchIntervalInBackground`: en un segundo monitor sin
  foco, una cuenta solicitada no aparece hasta que alguien toca la pantalla. Es
  de tu código original y no lo cambié — cambiarlo es una decisión tuya.
- **Tras cobrar, la mesa queda `libre` y no en `limpieza`.** Perdiste ese paso
  intermedio en el tablero.
- **Los textos de error cambiaron.** Donde antes leías «No se pudo abrir la
  mesa», ahora lees «esa mesa ya está abierta». Es a propósito: el mensaje viene
  del servidor y dice qué pasó. Son 72 avisos, todos en caminos de error, y
  `pnpm verify:aspecto` los lista uno a uno.
- **La propina escrita a mano en el portal QR viaja al servidor.** Roza la regla
  «el endpoint no acepta importes del cliente». Lo hice porque esa regla protege
  lo que se COBRA y aquí no se cobra nada: el importe real lo teclea la caja. Es
  criterio mío y puedes revocarlo.

### No comprobado

- **Sin pruebas de extremo a extremo.** No hay Playwright. Lo que está
  verificado, lo verifiqué yo abriendo el navegador — que es mejor que nada y
  peor que una suite.
- **`apps/web/heredado/` no tiene NINGUNA prueba automática.** 843 pruebas y
  ninguna toca tus pantallas: `tsconfig` no comprueba `.jsx` y el `include` de
  vitest no llega a esa carpeta. `verify:aspecto` cubre el aspecto; la lógica de
  esos 40 archivos sólo la cubre haberla ejecutado yo en el navegador.
- **Tiempo real.** Cocina y Caja se refrescan por sondeo cada 2‑8 s, no por
  suscripción.
- **Un solo restaurante, un solo día.** No probé varios turnos, ni dos cajas a
  la vez, ni un mes de datos.

### Reparos menores que dejé anotados y no cerré

De los informes de revisión: el carrito del POS puede perder clics rápidos por
falta de guarda de vuelo; «Limpiar» en POS son N peticiones sin atomicidad; la
fecha del ticket es la de creación del borrador; guardar una compra como
plantilla descarta las líneas de insumos nuevos; abrir corte desde `CorteCaja`
manda fondo cero. Ninguno pierde dinero ni datos; todos están en
`docs/fase-1/veredictos/`.

---

## Lo único que no toqué

El proyecto **Pastelería Confetti** de Supabase (`ivqcxdpqxwjxfohiswqb`). Ni
para leer.

---

## Números

843 pruebas en 59 archivos · **62 comandos** · **27 entidades** en el puente ·
40 archivos de tu frontend cableados, **cero escrituras bloqueadas**.

Las puertas: `tsc` · `eslint` · `vitest` · `verify:aspecto`. El catálogo de
comandos (`F1-08`) se genera del código con `pnpm docs:comandos`, no se escribe
a mano: un documento que miente sobre quién puede borrar el negocio es peor que
no tener documento.
