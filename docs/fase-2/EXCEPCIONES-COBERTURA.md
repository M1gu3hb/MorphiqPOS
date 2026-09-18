# EXCEPCIONES DE COBERTURA · Fase 2

Lo que `pnpm verify:cobertura` **no** exige, con su razón escrita al lado.

## Por qué este archivo existe y no un `--skip`

La puerta de cobertura sustituye al juicio de quien la ejecuta: mientras salga en 1, la fase no
está terminada, se sienta como se sienta. Eso sólo funciona si la puerta no se puede ablandar en
silencio. Una función que de verdad no se puede construir —porque la decisión la tiene que tomar
Miguel, o porque depende de hardware que todavía no existe— **no se esconde bajo un umbral**: se
escribe aquí, con su ID y su motivo, y el script la cuenta como declarada.

Así la excepción queda contada en vez de escondida, y el día que Miguel decida, se borra la fila
y la puerta vuelve a pedir la función.

## Las reglas de este archivo

1. Una fila por excepción. Nunca un rango: `F-940…F-945` son **seis** filas.
2. La razón tiene que decir **quién** desbloquea y **qué** hace falta, no «pendiente».
3. Una excepción que se puede construir NO va aquí. Trabajo pendiente ≠ trabajo imposible.
4. Al desbloquearse, se borra la fila. No se marca como resuelta: se borra.

Formato de la primera columna:

| Clave | Significado |
|---|---|
| `F-NNN` | una función del `01-FUNCIONES.md` §5 de algún modelo, o del tronco |
| `RUTA apps/web/app/api/…/route.ts` | una ruta declarada en un `05-DATOS-Y-BACKEND.md` |
| `PANTALLA <modelo>/<slug>` | una pantalla declarada en un `04-INTERFAZ.md` §4.3 |
| `PANTALLA-SIN-MENU <modelo>/<slug>` | una pantalla construida que NO cuelga de ningún menú, con el motivo |
| `PANTALLA-HEREDADA-SIN-MENU <slug>` | una pantalla de `app/(interno)/` que no cuelga de ningún menú, con el motivo |
| `MIGRACION NNN_nombre.sql` | una migración declarada en un `05-DATOS-Y-BACKEND.md` |
| `PUERTA <script>/<comprobacion>` | una comprobación de OTRA puerta que no se puede ejecutar en esta máquina |

---

## FUNCIONES

| Clave | Qué es | Por qué no se construye |
|---|---|---|
| `F-940` | CFDI 4.0 · emisión de factura | **Decisión pendiente P-02.** Mete un PAC, un costo mensual y una obligación fiscal: no es reversible y no la decide un agente. El prompt de la Fase 2 la lista entre lo bloqueado, palabra por palabra. Lo único que se hace es dejar el hueco limpio: RFC, régimen fiscal, uso de CFDI y código postal en `clientes`. |
| `F-941` | CFDI · factura global mensual | Misma decisión P-02. Sin PAC elegido no hay forma de emitirla ni de probar el timbrado. |
| `F-942` | CFDI · complemento de pago | Misma decisión P-02. Depende del formato exacto que exija el PAC. |
| `F-943` | CFDI · cancelación con acuse | Misma decisión P-02. El acuse lo devuelve el PAC; sin proveedor no hay acuse que guardar. |
| `F-944` | CFDI · `ClaveProdServ` y `ClaveUnidad` por producto | Misma decisión P-02. El catálogo del SAT se carga con el PAC; cargarlo antes obliga a migrarlo después. |
| `F-945` | CFDI · descarga y envío del XML y el PDF | Misma decisión P-02. El XML lo devuelve el PAC ya timbrado. |
| `F-318` | Impresión de comanda en cocina | **Depende del hardware que tenga Miguel.** Térmica de red, USB, o servicio local: las tres exigen arquitecturas distintas y una de ellas obliga a instalar un agente en el sitio del cliente. Está en la lista de bloqueados del prompt. La ruta y la entidad quedan escritas para que sólo falte el conector. |
| `F-249` | Segunda pantalla para el cliente en cafetería | **Depende del hardware.** Un segundo monitor por HDMI, una tablet emparejada o un display de cajón son tres productos distintos con tres costos distintos. Está en la lista de bloqueados del prompt. |
| `F-406` | Recordatorio de cita por WhatsApp | **No se elige proveedor.** API oficial de Meta —con su alta, su costo por conversación y su plantilla aprobada— contra un enlace `wa.me` semiautomático. Es la decisión que el `07-ESTADO.md` marca como «la decide Miguel». El resto del no-show (F-412) sí se construye: lo que falta es sólo el canal de salida. |

## RUTAS

| Clave | Qué es | Por qué no se construye |
|---|---|---|
| `RUTA apps/web/app/api/restaurante/imprimir-comanda/route.ts` | El disparo de impresión | Es la ruta de `F-318`. Sin decidir el hardware no hay cuerpo que definir: el de una térmica de red y el de un agente local no se parecen. |
| `RUTA apps/web/app/api/restaurante/impresion/resultado/route.ts` | El acuse del impresor | Es la otra mitad de `F-318`. Un acuse de una cola de impresión que no existe no se puede ni probar. |
| `RUTA apps/web/app/api/factura/agrupado/route.ts` | La factura que junta varias remisiones del mes en un CFDI | Es CFDI, y por tanto **decisión pendiente P-02**: lo mismo que bloquea `F-940` a `F-945`. Sin PAC elegido no hay timbrado que agrupar, y el formato exacto de la agrupación —una factura con N conceptos o una factura con un complemento— lo fija el proveedor. Lo que sí está construido es lo de debajo: `remisiones` con su saldo por documento (115) y los datos fiscales del cliente en `162_clientes_y_por_pagar.sql`. El día que se elija PAC, sólo falta el timbrado. |

## MIGRACIONES

| Clave | Qué es | Por qué no se escribe |
|---|---|---|
| `MIGRACION 075_impresion_comanda.sql` | `impresiones_comanda`, el destino de impresora y el disparo automático | Es el esquema de `F-318`, y **su forma depende del hardware que Miguel elija**. Una cola para una térmica de red, una para un agente local instalado en el sitio del cliente y una para `window.print()` no se parecen en nada: la primera necesita IP y puerto, la segunda un identificador de agente y un canal, y la tercera ninguna de las dos. Escribir una de las tres a ciegas obliga a migrar las otras dos. |

## PANTALLAS

*(ninguna sin construir: una pantalla que depende de una migración sin aplicar SÍ se construye, y
se dice en el `FILE-MAP.md` que no se puede abrir. Eso es trabajo pendiente de acople, no trabajo
imposible.)*

### PANTALLAS SIN MENÚ

`verify:acople` exige que las 61 pantallas de los cinco modelos cuelguen del menú de **alguna**
plantilla. No hace falta que estén en las cinco —el mapa de mesas no es de una ferretería— pero sí
que exista un negocio desde el que se pueda LLEGAR. Se puso esa comprobación porque hasta el
17-09-2026 no colgaba **ninguna**: las 61 respondían y sólo se abrían tecleando la URL.

Cuatro no van en ningún menú, y no es un olvido:

| Clave | Qué es | Por qué no puede estar en el menú |
|---|---|---|
| `PANTALLA-SIN-MENU restaurante/acceso-por-pin` | La entrada con PIN del modelo | Es lo que se ve ANTES de que exista sesión, y el menú lateral se pinta DESPUÉS. Ponerla en el menú sería ofrecerle a alguien que ya entró la pantalla de entrar. |
| `PANTALLA-SIN-MENU cafeteria/acceso-por-pin` | La misma, en la cafetería | Igual. |
| `PANTALLA-SIN-MENU restaurante/portal-del-comensal` | El portal que abre el COMENSAL con el QR de su mesa | No la abre Miguel ni su personal: la abre el cliente, desde su teléfono, con un token de mesa. No hay sesión de negocio ni menú lateral en esa pantalla. |
| `PANTALLA-SIN-MENU cafeteria/menu-publico-y-pedido-anticipado` | El menú público y el pedido anticipado, por QR | Lo mismo: es del cliente. Lo que sí está en el menú del negocio es `/cafeteria/recogida`, que es donde el personal ve lo que ese QR pidió. |

**La puerta FALLA si una de estas cuatro filas no existe**, igual que con las demás excepciones: lo
que no se puede es que una pantalla desaparezca del menú sin que nadie lo diga.

### Las HEREDADAS que pierden su sitio en el menú

Las pantallas de `app/(interno)/` son las del punto de venta que lleva meses cobrando. El menú las
ofrece en su propio grupo, con una regla: **una entrada por módulo**. Cuando un modelo trae su
propia pantalla para ese módulo, la del modelo gana el sitio y la heredada se queda fuera del menú
—sigue respondiendo por su ruta, pero nadie llega a ella desde el menú—.

Eso es correcto y es deliberado: `/abarrotes/caja` cuenta el fondo por montones y `/caja` no. Lo que
no puede pasar es que una heredada se caiga del menú **sin que nadie lo diga**, que es lo que ocurrió
cuando la navegación pasó a ser por plantilla. Por eso las seis están declaradas, con qué pantalla le
quitó el sitio.

| Clave | Qué es | Por qué no cuelga de ningún menú |
|---|---|---|
| `PANTALLA-HEREDADA-SIN-MENU caja` | La caja del POS heredado | Su módulo `caja_directa` lo toman las pantallas de caja de los modelos: `/abarrotes/caja`, `/restaurante/caja` y `/ferreteria/caja`. Cada una cuenta su fondo y su corte como lo cuenta ese negocio. |
| `PANTALLA-HEREDADA-SIN-MENU corte-caja` | El corte heredado | Ya estaba **deprecada en su propio sistema**: su `App.jsx` la resolvía con un `Navigate to="/caja"`, y aquí es una redirección de servidor. No se ofrece lo que redirige. |
| `PANTALLA-HEREDADA-SIN-MENU cocina` | La cocina heredada | Su módulo `cocina` lo toma `/restaurante/cocina`, que es la que tiene las estaciones, los tiempos y el marchado. En la cafetería el equivalente es `/cafeteria/barra`, con su propio módulo. |
| `PANTALLA-HEREDADA-SIN-MENU mesas` | El mapa de mesas heredado | Su módulo `mapa_mesas` lo toma `/restaurante/mapa-de-mesas`, que es la que trae los ocho estados y la alergia. |
| `PANTALLA-HEREDADA-SIN-MENU productos` | El catálogo heredado | Su módulo `productos_basicos` lo toman `/abarrotes/producto`, `/cafeteria/productos`, `/restaurante/productos` y `/estetica-salon/productos`, cada uno con el vocabulario de su giro. |
| `PANTALLA-HEREDADA-SIN-MENU pos` | El punto de venta heredado | Es la pantalla de cobro de la plataforma anterior, y **cada modelo trae la suya**: `/abarrotes/cobrar`, `/cafeteria/cobrar`, `/restaurante/cobro`, `/ferreteria/mostrador` y `/estetica-salon/cobrar`. Se conserva viva porque es la que ha cobrado hasta hoy y el acople no la apaga de golpe. |

**La puerta FALLA si una de estas seis filas no existe, y también si sobra una** —una excepción para
una pantalla que ya no está hace creer que la lista está al día—.

## PUERTAS

Una comprobación que una puerta declara y no ejecuta. Va aquí por la misma razón que todo lo
demás: **una puerta que imprime «pendiente» y sale en 0 no es una puerta**, y el arreglo no es
borrar el mensaje —sería peor— sino sacar la comprobación de la penumbra y ponerla donde se
cuenta.

| Clave | Qué no se comprueba | Por qué, y qué hace falta para comprobarlo |
|---|---|---|
| `PUERTA verify:entorno/comprobacion-en-vivo` | Levantar el `docker-compose` de verdad y conectarse a Postgres y al almacenamiento | **No hay Docker en la máquina donde se hizo el acople**, y `verify:entorno` lo declaraba como «pendiente» saliendo en 0 —es decir, aprobando A-27 sin haberlo probado nunca—. Lo demás del contrato SÍ se comprueba estáticamente: los servicios, las imágenes fijadas, los volúmenes, las nueve variables de `.env.example` y que `.env` esté ignorado. Lo que falta es la mitad en vivo, y la desbloquea instalar Docker Desktop: `pnpm verify:entorno` la ejecuta sola en cuanto el motor responda. Mientras no esté, la puerta lo dice con estas palabras y **falla** si esta fila no existe. |
