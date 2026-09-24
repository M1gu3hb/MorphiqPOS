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
| `PANTALLA-SIN-VOCABULARIO <modelo>/<slug>` | una pantalla que no consume el diccionario del giro, con el motivo |
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

`verify:acople` exige que las pantallas de los cinco modelos cuelguen del menú de **alguna**
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

### Las que NO consumen el diccionario del giro

`verify:acople` exige que **cada una de las 62 pantallas de modelo** lea su sustantivo del
diccionario (F-017). Hasta el 20-09-2026 esa comprobación contaba «cuántos archivos de `apps/web/src`
mencionan el vocabulario» y decía 55, un número que sonaba bien y no medía nada: contaba los tres
`Tablero.tsx`, dos diálogos y el propio módulo, y entre ellos se colaban **trece pantallas de modelo
que no lo consumían** —con la agenda del salón, que es su pantalla de inicio, entre ellas—.

Ahora se mide una por una, contra la misma lista del §4.3 que usan las demás puertas. Seis no lo
consumen, y no es un olvido: **no nombran ninguna entidad del diccionario**. Traerles el gancho sería
importar algo que no se usa para que una puerta se ponga verde.

| Clave | Qué es | Por qué no nombra ninguna entidad |
|---|---|---|
| `PANTALLA-SIN-VOCABULARIO restaurante/acceso-por-pin` | La entrada con PIN | Dice «¿Quién está operando?» y pinta nombres de personas. Ni mesa, ni cuenta, ni platillo: nada del diccionario. |
| `PANTALLA-SIN-VOCABULARIO cafeteria/acceso-por-pin` | La misma, en la barra | Igual. |
| `PANTALLA-SIN-VOCABULARIO restaurante/inventario` | Las existencias de la cocina | Habla de INSUMOS y de almacenes, que no son entidades del diccionario: el `producto` de un restaurante es el platillo, y eso se vende, no se cuenta aquí. |

**La puerta también falla al revés**: si una de estas seis acaba consumiendo el diccionario, la fila
sobra y hay que borrarla. Una lista de excepciones que incluye lo que ya funciona deja de leerse.

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
| `PUERTA verify:entorno/comprobacion-en-vivo` | Las dos mitades en vivo de A-27: que el esquema completo aplique en un Postgres 17 ajeno, y que el `docker-compose` del entorno offline levante de verdad | La puerta ya no depende de Docker para ninguna de las dos. La mitad del **esquema** corre contra cualquier Postgres 17 que no sea el de la aplicación: basta apuntar `DATABASE_URL_PRUEBAS` a una rama del proyecto con las migraciones aplicadas (receta completa en [BASE-DE-PRUEBAS.md](BASE-DE-PRUEBAS.md)), y la puerta comprueba el motor, el ledger contra el disco y que la cadena NO sea la de la aplicación. La mitad del **empaquetado** sigue necesitando un motor de contenedores, y cuando sólo una de las dos corre la puerta dice **qué mitad falta**. Esta fila sólo cubre el caso en que no corre NINGUNA; si no existe, la puerta falla en vez de aprobar A-27 sin haberlo probado. |
