# 011 · Fase 2 · Etapas 8 a 13 · Las cuatro columnas en 100 %

**Agente:** Claude Code (Opus 5) · **Rama:** `fase-2` · **Fechas:** 15–16 de septiembre de 2026
**Alcance:** E8 la puerta de cobertura y el tronco · E9–E12 las funciones que faltaban ·
E13 rutas, pantallas y migraciones
**Commits:** de `df16217` a `39fd47a`, empujados a `origin/fase-2`

---

## 1 · LA SALIDA DE LA PUERTA, LITERAL Y SIN CORTAR

Esto es lo que imprime `pnpm verify:cobertura`, copiado tal cual. Va primero porque es lo
único que no es opinión mía.

```
$ node scripts/verificar-cobertura.mjs

COBERTURA DE LA FASE 2 · lo declarado en la documentación contra lo que hay en disco

MODELO           FUNCIONES        RUTAS            PANTALLAS        MIGRACIONES
───────────────  ───────────────  ───────────────  ───────────────  ───────────────
restaurante        8/8   100%   13/13  100%   13/13  100%   10/10  100%
cafeteria         17/17  100%   16/16  100%   13/13  100%   11/11  100%
abarrotes         25/25  100%   20/20  100%   11/11  100%   14/14  100%
ferreteria        38/38  100%   27/27  100%   12/12  100%   13/13  100%
estetica-salon    25/25  100%   29/29  100%   12/12  100%   17/17  100%
───────────────  ───────────────  ───────────────  ───────────────  ───────────────
TOTAL            113/113 100%  105/105 100%   61/61  100%   65/65  100%

TRONCO COMPARTIDO · lo que heredan los 73 modelos que faltan:    8/8   100%

Excepciones declaradas en docs/fase-2/EXCEPCIONES-COBERTURA.md: 12 (9 funciones · 3 rutas · 0 pantallas · 1 migraciones)

✓ Cobertura completa: funciones, rutas y pantallas, o declaradas como excepción.
```

**Código de salida: 0.**

---

## 2 · LA TABLA POR MODELO, DEL MISMO SCRIPT

Los números de abajo son una transcripción del bloque de arriba a formato de tabla. **No los
volví a contar a mano**, que es exactamente el error que esta puerta existe para impedir.

| Modelo | Funciones | Rutas | Pantallas | Migraciones |
|---|---|---|---|---|
| `restaurante` | 8/8 · 100 % | 13/13 · 100 % | 13/13 · 100 % | 10/10 · 100 % |
| `cafeteria` | 17/17 · 100 % | 16/16 · 100 % | 13/13 · 100 % | 11/11 · 100 % |
| `abarrotes` | 25/25 · 100 % | 20/20 · 100 % | 11/11 · 100 % | 14/14 · 100 % |
| `ferreteria` | 38/38 · 100 % | 27/27 · 100 % | 12/12 · 100 % | 13/13 · 100 % |
| `estetica-salon` | 25/25 · 100 % | 29/29 · 100 % | 12/12 · 100 % | 17/17 · 100 % |
| **TOTAL** | **113/113** | **105/105** | **61/61** | **65/65** |
| **TRONCO** | **8/8** | — | — | — |

### La cuenta que hacía falta hacer bien

El encargo lo dijo con esas palabras: **no se cuentan filas de tabla, se cuentan funciones.**
`F-610…F-617` es UNA fila y son **OCHO** funciones. Con los rangos expandidos, el punto de
partida medido al cerrar E8.7 era:

```
funciones 64/113 · rutas 28/105 · pantallas 0/61 · migraciones 27/64
```

y no el «80 % largo» que parecía leyendo filas. El avance de estas seis etapas, medido por la
misma puerta y no por mí:

| | Al cerrar E8.7 | Hoy | Delta |
|---|---|---|---|
| Funciones | 64 | 113 | **+49** |
| Rutas | 28 | 105 | **+77** |
| Pantallas | 0 | 61 | **+61** |
| Migraciones declaradas | 27/64 | 65/65 | **+38**, y el denominador subió a 65 |

### Por qué 105 rutas y no 106

El encargo pedía 106. La puerta dice 105, y la diferencia está documentada desde E13:
`estetica-salon` declara `GET` y `PUT` sobre `/api/clientes/:id/expediente`. Son **dos verbos
y un solo archivo `route.ts`**. La puerta cuenta archivos porque es lo que existe en disco.
No es una ruta que falte: es la misma ruta contada dos veces en el papel.

### Por qué 65 migraciones y no 64

Porque E13 escribió una que el papel declaraba y nadie había escrito —`102_venta_en_espera.sql`,
§5— y **se declaró en el árbol del modelo en vez de esconderla bajo un número ya existente.**
El denominador subió con ella.

---

## 3 · LA SALIDA DE `verify:fase2`

27 eslabones, encadenados con `&&`. **Código de salida: 0.** La corrida completa son 683 líneas;
aquí está cada eslabón con su veredicto, y digo abajo qué abrevié.

```
$ node scripts/verificar-arranque.mjs
✓ Correcciones de arranque: guarda viva, Kysely instalado, Postgres 17, cero andamiaje.
$ node scripts/verificar-estructura.mjs
✓ Estructura del monorepo correcta (15 carpetas, 6 manifiestos).
$ node scripts/verificar-historico.mjs
✓ historico/ cumple su contrato: 3 fuentes, aisladas del monorepo.
$ node scripts/verificar-tsconfig.mjs
✓ TypeScript estricto: 12 banderas obligatorias, 5 prohibidas, 7 workspace(s) conformes.
$ node scripts/verificar-entorno.mjs
✓ Entorno local: 3 servicios, imagenes fijadas, 9 variables declaradas.
$ node --conditions=react-server scripts/verificar-certificado.mjs
✓ Raíz de Supabase vigente 1683 día(s) más (hasta 2031-04-26).
$ node scripts/verificar-residuos.mjs
✓ Cero residuos: 8 patrones buscados fuera de historico/, ninguno presente.
$ node scripts/verificar-aspecto.mjs
La estructura NO cambió en los 65 archivos comparados de apps/web/heredado.
$ node scripts/verificar-escrituras.mjs
Miradas 51 escrituras de apps/web/heredado contra el mapa del puente.
Ninguna escritura la rechaza el puente.
$ node scripts/verificar-lecturas.mjs
✓ Lecturas del puente: 44 campos descartados vigilados; 216 lectura(s) justificadas.
$ node scripts/tokenizar-primitivas.mjs --verificar && node scripts/verificar-primitivas.mjs
✓ Las 36 primitivas estan tokenizadas.
✓ Cero literales de color, altura, sombra o variante en componentes.
$ prettier --check .
All matched files use Prettier code style!
$ eslint .
[sólo el aviso de configuración de @next/next sobre pages/; cero hallazgos]
$ turbo run typecheck
 Tasks:    7 successful, 7 total
$ node scripts/verificar-pruebas.mjs
✓ Pruebas: 219 unitarias en la puerta correcta, 5 de integración cubiertas, cero scripts que esquiven la raíz.
$ vitest run
 Test Files  219 passed (219)
      Tests  2567 passed (2567)
   Duration  56.85s
$ node scripts/verificar-mutaciones-backend.mjs
[103 líneas «✓ Mutación rechazada: …»]
$ node scripts/verificar-catalogo.mjs
18 mutaciones detectadas; versión restaurada en verde.
$ node scripts/verificar-inventario.mjs
20 mutaciones detectadas; versión restaurada en verde.
$ node scripts/verificar-comandos-catalogo.mjs
9 mutaciones detectadas; versión restaurada en verde.
$ node scripts/verificar-comandos-inventario.mjs
5 mutaciones detectadas; versión restaurada en verde.
$ node scripts/verificar-venta.mjs
✓ base: 15 contratos y la suite en verde.
[24 destructivas que caen · 3 inocuas que pasan]
$ node scripts/verificar-identidad.mjs
✓ base: 11 contratos y la suite en verde.
[17 destructivas que caen · 3 inocuas que pasan]
$ node scripts/verificar-paquetes.mjs
✓ base: 2 contratos y la suite en verde.
[2 destructivas que caen · 1 inocua que pasa]
$ turbo run build
 Tasks:    1 successful, 1 total
$ node scripts/verificar-cabeceras.mjs
✓ Cabeceras de seguridad: 6 presentes y correctas, nonce por peticion.
$ node scripts/verificar-cobertura.mjs
✓ Cobertura completa: funciones, rutas y pantallas, o declaradas como excepción.
```

**Lo que abrevié, y sólo esto:** las 103 líneas individuales de
`verificar-mutaciones-backend`, los 52 renglones de mutación por nombre de los cuatro arneses
de catálogo e inventario, los 50 renglones de destructivas/inocuas de venta, identidad y
paquetes, y el listado de rutas que imprime `next build`. Ninguna línea omitida es un fallo:
todas son `✓`. La corrida íntegra se reproduce con `pnpm verify:fase2`.

### Las tres advertencias de lint que yo mismo introduje, y cómo quedaron

La primera corrida de esta tanda salió con **0 errores y 3 advertencias**, las tres iguales:
`window.location.assign()` para navegar dentro de la app, en `cafeteria/AccesoPorPin.tsx`,
`ferreteria/Mostrador.tsx` y `restaurante/AccesoPorPin.tsx`. **Las tres las escribí yo**, en
E11a y E13.1 —no venían de antes—, y la puerta no las tumba porque son advertencias. Se
revisaron una por una antes de dar esto por terminado:

- **`ferreteria/Mostrador.tsx` era un descuido.** Ir al alta rápida del catálogo es una
  navegación interna normal, y recargar la página tira las partidas que el mostradorista
  llevaba a medias. Pasa a `useRouter().push()`.
- **Las dos `AccesoPorPin` recargan a propósito, y ahora lo dicen.** El servidor acaba de
  poner una cookie de sesión nueva; una navegación de cliente conservaría el árbol de React
  del turno anterior, y en una terminal compartida eso significa que lo que dejó quien se va
  sigue en pantalla con el nombre de quien entra. La regla se silencia **en la línea**, con el
  motivo escrito encima: un `eslint-disable` sin razón es esconder; con razón es decidir.

Tras esos tres cambios, `eslint .` sale **limpio**. La salida de arriba es la de la corrida
final, ya con ellos dentro.

## 4 · LAS ELIMINACIONES DE 8.7, UNA POR UNA

**El encargo decía cuatro; son cinco** —el commit `4cab9e5` borró dos cosas en uno—. Cada una
se revisó reintroduciendo la mutación con el script que falla ruidosamente, no con `perl`.

| # | Lo que se borró | ¿Era necesario? | La mutación que lo demuestra | ¿Restaurada? |
|---|---|---|---|---|
| 1 | Salida temprana de `alertasDeMinimo` con los dos pisos en cero | **No.** Las dos guardas `> 0n` ya la hacían | quitar `critico > 0n` → 1 prueba en rojo | **No** |
| 2 | Conversión de domingo `0 → 7` en `diasHastaLaVisita` | **No.** `(dia - hoy + 7) % 7` es invariante: `0 ≡ 7 mod 7` | `getUTCDay() + 1` → **4 pruebas en rojo** | **No** |
| 3 | Comprobación temprana de `obra.estado` antes de cerrar | **No.** El `where estado = activa` es el único cerrojo y funciona | quitar ese `where` → 1 prueba en rojo | **No** |
| 4 | Comprobación temprana de `cita.estado` antes del no-show | **No.** Ídem con `where estado in (…)` | quitar ese `where` → 1 prueba en rojo | **No** |
| 5 | Salida temprana ante una ventana al revés en `huecosDeAgenda` | **No**, y esta vez con demostración de dos partes | `Math.abs` en la duración **y** `!==` en el cierre → 1 prueba en rojo | **No** |

**Ninguna de las cinco se restituyó.** Y lo que importa más que el veredicto: las cinco
conductas ya estaban pinchadas por una prueba con nombre —«el domingo es el 7, no el 0», «una
ventana al revés no produce huecos», el artículo con los dos pisos en cero—, así que la
equivalencia no es la afirmación de un comentario: es algo que se pone rojo si alguien la rompe.

Dos honestidades sobre ese ejercicio:

- **La #5 necesitó una mutación DE DOS PARTES para ponerse roja.** La conducta está protegida
  por dos cerrojos —el `<` del cierre y la comprobación de duración de `agregar`— y romper uno
  solo no basta. La guarda borrada era el tercero. Se dice porque una mutación de una parte
  habría salido verde y yo habría concluido lo contrario.
- **La mutación de la #4 salió AMBIGUA: 2 coincidencias, y el script se negó a aplicarla.** Con
  `perl` habría mutado la primera —que es otro comando— y el veredicto habría sido sobre un
  código que no era el que quería probar.

---

## 5 · RECLASIFICACIONES `[=]` ↔ `[≠]`

Un `[=]` dice «esta función es la misma que la del modelo raíz y se reutiliza sin una línea
propia». Un `[≠]` dice «se parece y NO es la misma». Equivocarse en cualquiera de las dos
direcciones es caro: un `[=]` falso produce una función que no hace lo que su modelo necesita;
un `[≠]` falso produce dos implementaciones del mismo concepto que acaban dando números
distintos.

### De `[≠]` (o de «pendiente») a `[=]` — se reutiliza lo que ya existía

| Función | Dónde | Qué se descubrió |
|---|---|---|
| **F-106** toma de inventario físico | `restaurante` | La construyó el tronco en E2 (`tomas-inventario.ts`). Se reutiliza sin una línea propia |
| **F-106** | `cafeteria` | El modelo la listaba como pendiente. Ya estaba entera |
| **F-106** | `ferreteria` | Ídem. Lo nuevo era F-149, no F-106 |
| **F-023** listas de precio | de `cafeteria` a **TRONCO** | Su ID está en el bloque F-0xx —catálogo compartido— y su efecto es sobre el precio de CUALQUIER modelo. No era una función de cafetería |

### De `[=]` a `[≠]` — parecen la misma y no lo son

Las tres salieron de leer `ferreteria` con el código de `abarrotes` delante:

| Par | Por qué NO son la misma |
|---|---|
| **F-149 zona** contra **F-152 ubicación** | Dos tablas. La zona existe para CONTAR —una vez al día, por el encargado, agrupando gavetas— y la ubicación para VENDER —sesenta veces al día, por el mostradorista, gaveta por gaveta—. Fusionarlas obligaría a que la unidad de conteo fuera la gaveta, y contar 400 gavetas es una vuelta de dos años |
| **F-121 venta en dos unidades** contra **F-151 pieza ↔ kilo** | En `abarrotes` el factor es exacto: la caja trae 24. En `ferreteria` el factor es el PESO POR PIEZA, medido, con 3 %–8 % de desviación entre lotes. Un factor medido no es un factor declarado |
| **F-254 abono de fiado** contra el **pago a crédito** de ferretería | En `abarrotes` la aplicación se guarda en `jsonb` porque nadie consulta el detalle; en `ferreteria` se consulta Y SE DISCUTE, y por eso `repartirPago` existe como función pura con su propia prueba |

### Una fusión, no una reclasificación

**F-254.** `abarrotes` la llamaba «cobro de fiado en caja» y `ferreteria` «cobro de crédito en
caja». Es la misma cosa: dinero que entra al cajón y NO es venta. Quedó un solo ID.

Y el hallazgo hermano, que ahorró tres implementaciones: **F-254, F-255, F-256 y F-260 no se
fusionan** —sus operaciones y pantallas difieren— **pero son el mismo objeto de datos**: dinero
que entra al cajón, no es del negocio, y hay que devolverlo o entregarlo. Van sobre **un solo
ledger** (`pasivos_terceros`, migración 063) con cuatro naturalezas. Escribirlos cuatro veces
habría producido cuatro formas distintas de descuadrar.

---

## 6 · TRES DEFECTOS QUE LOS CONTRATOS CAZARON

Se dicen porque son la única prueba de que los contratos no son decoración.

1. **`garantia_salida` no existe.** Yo lo escribí en el comando de garantías de ferretería. El
   tipo válido de `movimientos_stock` es **`garantia_proveedor`**. Contra Postgres eso es un
   **23514 en la primera garantía real**; contra la base falsa habría salido verde para siempre.
   Lo cazó `valores-de-check.contrato.test.ts`, que compara **lo que el código escribe** contra
   **lo que el `check` admite**.
2. **La migración 102 borraba `dividida` y `absorbida`.** Reescribe el `check` de
   `ordenes.estado` completo —no lo parchea— y yo copié la lista de la 003, dejándome fuera lo
   que añadieron la 070 y la 071. Aplicar eso habría roto **dividir cuenta y unir mesas** en un
   restaurante que llevaba meses funcionando. Lo cazó `estados-con-columna.contrato.test.ts`.
3. **Seis reglas de `estados-con-columna` en rojo** tras escribir las migraciones nuevas: había
   estados admitidos por un `check` que ningún comando sabía escribir. **No se declaró excepción:
   se escribieron los cuatro comandos que faltaban.**

El nº 2 es el que mejor resume la etapa: el contrato no me dijo «te falta algo». Me dijo «lo que
estás a punto de aplicar destruye una función que ya funciona», y tenía razón.

---

## 7 · LO QUE NO HICE, CON NÚMEROS

Obligatorio, y con el número delante en todos los casos.

### Bloqueado por una decisión de Miguel

| Qué | Cuánto | Por qué |
|---|---|---|
| **CFDI 4.0** | **6 funciones** (`F-940`…`F-945`) **+ 1 ruta** (`/api/factura/agrupado`) + el timbrado entero | **P-02 sin decidir.** Mete un PAC, un costo mensual y una obligación fiscal. Lo de debajo SÍ está construido: `remisiones` con saldo por documento (115), datos fiscales del cliente (162) y la pantalla `ferreteria/facturacion` que los captura. El día que se elija PAC, falta el timbrado y nada más |
| **Impresión de comanda** | **1 función** (`F-318`) **+ 2 rutas + 1 migración** (`075_impresion_comanda.sql`) | **Depende del hardware.** Una cola para térmica de red, una para agente local y una para `window.print()` no se parecen: la primera necesita IP y puerto, la segunda un identificador de agente y un canal, la tercera ninguna. Escribir una a ciegas obliga a migrar las otras dos |
| **Segunda pantalla de cafetería** | **1 función** (`F-249`) | Depende del hardware |
| **Recordatorio de cita por WhatsApp** | **1 función** (`F-406`) | No se eligió proveedor. De esto depende la función que más dinero mueve de A3: bajar el no-show de ~18 % a <8 % |

**Total declarado en `EXCEPCIONES-COBERTURA.md`: 12** — 9 funciones, 3 rutas, 0 pantallas,
1 migración. **Ninguna se declaró para hacer pasar la puerta relajándola**: cada una está en el
archivo con su motivo, y la puerta las resta del denominador a la vista.

### Lo que está escrito y NO ejecutado

- **Las 65 migraciones están ESCRITAS y SIN APLICAR.** **0** se corrió contra
  `wyqmzhliurwyxuyxznpb` ni contra ninguna otra base. En disco hay 95 archivos `.sql` en total;
  las 65 de estos cinco modelos son las que la puerta cuenta.
- **Casi ninguna de las 61 pantallas se puede ABRIR en un navegador**, porque su servidor
  depende de esas migraciones. Compilan —`next build` pasa—, están probadas en su lógica pura, y
  no han hablado con una base de verdad ni una vez. Eso lo dice cada `FILE-MAP.md` y no lo tapa
  la puerta.
- **0 pruebas de integración nuevas.** Las 5 que hay son las de antes. Lo que aquí llamo «prueba»
  son las **2 567 unitarias en 219 archivos**, contra la base falsa.

### Lo que la puerta NO mide, dicho antes de que parezca que sí

- Que una pantalla se vea bien. Mide que exista su cabecera `PANTALLA · modelo · slug` y que sea
  alcanzable desde una raíz de Next. **No mide diseño.**
- Que el código sea correcto. De eso responden las 2 567 pruebas y los arneses de mutación, no
  la cobertura.
- Que la base falsa se parezca a Postgres. Se le cerraron **4 huecos** en estas etapas
  (`execute()` en el borrado, `forUpdate()`, `distinct()`, fechas desnudas en `aNumero`) y sigue
  siendo una imitación. Lo que depende del cerrojo real de Postgres **no está probado aquí**.

### Lo que no toqué, a propósito

- **`apps/web/heredado/`: 0 archivos existentes modificados** (D-09). Verificado con
  `git diff df16217..HEAD -- apps/web/heredado`: vacío. Y `verificar-aspecto` lo confirma desde
  el otro lado: «la estructura NO cambió en los 65 archivos comparados».
- **`scripts/esquema-esperado.json`: 0 líneas.** Verificado con el mismo `git diff`: vacío.
- **`morphiqpos-codex`, la rama `carril-b` y los archivos de `morphiqpos`: 0 cambios.**
- **El proyecto de Supabase de Pastelería Confetti (`ivqcxdpqxwjxfohiswqb`): 0 accesos.** Ni
  para leer.
- **Secretos en commits, reportes o código: 0.** El repositorio es público.

### Lo que sigue pendiente del proyecto, no de estas etapas

- **73 de los 78 modelos siguen sin construir.** Los cinco terminados cubren 22 modelos
  *documentados* por herencia de arquetipo, pero de código construido son cinco.
- **7 de los 10 arquetipos no tienen raíz**: A4 orden de trabajo · A5 cotización y pedido ·
  A6 suscripción · A7 espacio y tiempo · A8 producción · A9 ruta · A10 proyecto y CRM.
- **La segunda pasada de documentación: 0 de 9 familias revisadas.**
- **`btree_gist` en Supabase: sin verificar.** Toda la agenda de A3 descansa en una restricción
  de exclusión GiST sobre `tstzrange`. Si la extensión no está disponible en la base viva, el
  plan B —slots discretos de 5 min— es mucho peor. **Verificarlo es lo primero que hay que hacer
  antes de aplicar la 130.**

---

## 8 · CÓMO REPRODUCIR ESTO

```bash
pnpm verify:cobertura   # la tabla del §1, en 0
pnpm verify:fase2       # los 27 eslabones del §3, en 0
```

Ambos desde `D:\MIS PROYECTOS\Master POS\morphiqpos-fase2`, en la rama `fase-2`, commit
`39fd47a` —que es donde se corrieron las dos salidas de este reporte—.

El detalle de por qué cada pieza es como es no está aquí: está en `docs/fase-2/BITACORA.md`
—entrada «E10 a E13»— y, pieza por pieza con su ruta real en disco, en la sección
«LO QUE LAS ETAPAS 10-13 AÑADIERON» de los cinco `FILE-MAP.md`.
