# 07 · ESTADO · qué está hecho y qué falta

**Actualiza este archivo EN EL MISMO TURNO en que termines un modelo.**
Una carpeta terminada que no está marcada aquí es una carpeta que alguien va a volver a hacer.

```
⬜ no empezado    🟨 en progreso    ✅ terminado    🔵 revisado en 2ª pasada
```

Un modelo está **✅ terminado** cuando existen sus siete archivos, cumplen `02-ESTANDAR-DE-CARPETA.md`, y las cuatro preguntas de cierre están contestadas al final de su `FILE-MAP.md`.

---

## CIMIENTOS

| Archivo | Estado |
|---|---|
| `00-LEEME-PRIMERO.md` | ✅ |
| `01-MAPA-GENERAL.md` | ✅ |
| `02-ESTANDAR-DE-CARPETA.md` | ✅ |
| `03-CATALOGO-DE-FUNCIONES.md` | ✅ **363 IDs canónicos** · reconciliado el 14-09-2026 (D-11) |
| `04-SISTEMA-DE-DISENO.md` | ✅ |
| `05-DECISIONES.md` | ✅ **13 tomadas** (D-01…D-13), 4 pendientes de Miguel (P-01…P-04) |
| `06-FILE-MAP-GENERAL.md` | ✅ |
| `07-ESTADO.md` | ✅ este archivo |

---

## FASE 2 · CONSTRUCCIÓN · rama `fase-2`

Worktree: `D:\MIS PROYECTOS\Master POS\morphiqpos-fase2`, partido de `carril-b` en `3a4623b`.
La copia canónica de esta documentación es `docs/fase-2/` **dentro del worktree** (D-13).

| Etapa | Qué | Estado |
|---|---|---|
| **E0** | Reconciliar el catálogo | ✅ **50 IDs añadidos · 2 colisiones · 1 fusión · 7 reclasificaciones** |
| **E1** | Worktree y puerta `verify:fase2` | ✅ **26 eslabones en 0** · 110 archivos · 1086 pruebas |
| **E2** | Tronco compartido (plantilla, vocabulario, inventario, variantes) | ✅ **058-063 + 066** · 115 archivos · 1164 pruebas · verify:fase2 en 0 |
| **E3** | `restaurante` | ✅ **10 de 11** · F-321, F-324, F-303, F-302, F-305, F-306, F-323, F-315, F-325, F-242, F-261 · migraciones 070-074, 076, 077 · **F-318 BLOQUEADA** (decisión de impresión pendiente de Miguel) · **componentes nuevos al lado (D-09): `DividirCuentaDialog`, `AnularLineaDialog`**, con su enganche de una línea en el FILE-MAP · verify:fase2 en 0 · 129 archivos · 1395 pruebas |
| **E4** | `cafeteria` | ✅ **6 de 15** · §0.1 (trigger de unidad base), F-328, F-329, F-331, F-156, F-157, F-248 · migraciones 080-083, 085-087 · F-249 BLOQUEADA · **componente nuevo al lado (D-09): `FilaDeBarra`** · F-023 reclasificada a TRONCO · el resto en la bitácora con su porqué |
| **E5** | `abarrotes` · raíz de A1 | ✅ **8 de 12** · F-111, F-112, F-147, F-148, F-149, F-107, F-254, F-255, F-256, F-257, F-040 · migraciones 090, 091, 097, 099 · **F-988 y F-940…F-945 BLOQUEADAS** · F-011 (IVA/IEPS) declarada pendiente por tocar el precio de los cinco modelos · F-986, F-201 y F-983 son pantalla y hardware · **dos `check` latentes de E2/E3 cerrados en la 097** · ninguna pantalla abierta: dependen de migraciones sin aplicar |
| **E6** | `ferreteria` | ✅ **9 de 13** · F-059, F-152, F-201, F-145, F-150, F-151, F-638, F-639, F-606, F-614, F-258 · migraciones 110-113 · **F-940…F-945 BLOQUEADAS** · F-061 es pantalla · F-060 con tabla y sin comando · el pago a crédito y F-617 pendientes · **un contrato de E2 cazó el hueco de `cerrar_obra`** · ninguna pantalla abierta: dependen de migraciones sin aplicar |
| **E7** | `estetica-salon` · A3 de cero | ✅ **el motor de A3** · F-401, F-415, F-404, F-409, F-440, F-423, F-428, F-400, F-402, F-412, F-407, F-434, F-443, F-427, F-259, F-155, F-441 · migraciones 130-133, 135 · **F-406 BLOQUEADA** (WhatsApp) · anticipo, paquetes, propina V4 y expediente completo pendientes con su hueco (134, 136-145) · **el contrato `estados-con-columna` de E2 cazó el hueco Y estaba mal: se corrigió para recortar por tabla** · **RIESGO: la 130 necesita `btree_gist` en Supabase** · ninguna pantalla abierta |
| **E8** | La puerta `verify:cobertura` · tronco compartido | ✅ **8/8** · F-015, F-016, F-017, F-103, F-105, F-108, F-109, F-260 · la puerta cuenta FUNCIONES por etiqueta `F-NNN` y no filas de tabla — y fue ella la que enseñó que el avance real iba por el 40 %, no por el 80 % que parecía |
| **E9–E12** | Las funciones que les faltaban a los cinco modelos | ✅ **113/113** · siete de dominio puro (IVA con IEPS mixto, conteo por peso con su rango de confianza, precio por canal, combo resuelto en componentes, recursos de agenda medidos en el PICO, los cuatro rankings, lector de código por tiempo entre teclas) y las transversales escritas UNA vez para varios modelos (ficha de cliente, cuentas por pagar) · **9 declaradas en `EXCEPCIONES-COBERTURA.md`**, ninguna relajando la puerta |
| **E13** | Rutas, pantallas, y lo que hubo que construir debajo | ✅ **105/105 rutas · 61/61 pantallas · 65/65 migraciones** · 61 rutas nuevas y 20 pantallas nuevas · la transferencia a crédito deja de aplicarse sola y entra PENDIENTE DE CONFIRMAR · `102_venta_en_espera.sql` escrita y declarada, porque el `check` de `ordenes.estado` no admitía «apartada» y el comando del papel no podía existir en la base · **3 rutas declaradas como excepción** (las dos de impresión y la factura agrupada, que es CFDI) |

**Rangos de migración tras la reconciliación** (D-08, verificado contra el disco: la última real es
la `057` de Codex):

```
058 – 069   tronco compartido      (066 = semilla de las cinco plantillas, consolidada)
070 – 078   restaurante            (079 libre)
080 – 089   cafeteria              (cabe exacto)
090 – 102   abarrotes              (103-109 libres)  ← la 102 la añadió E13
110 – 121   ferreteria             (122-129 libres)
130 – 145   estetica-salon         (146-159 libres)
160 – 163   transversales          (164-199 libres)
```

**Orden de aplicación: el numérico, sin saltos.** Cada archivo depende sólo de
números menores, y las que amplían un `check` de otra etapa reescriben la lista
VIGENTE completa —no la de la migración original—, que es lo que impide que la
102 borre el `dividida` que añadió la 070.

**Cobertura MEDIDA por `pnpm verify:cobertura`, no contada a mano** (los rangos
`F-610…F-617` se expanden: es una fila y son OCHO funciones):

```
MODELO           FUNCIONES        RUTAS            PANTALLAS        MIGRACIONES
restaurante        8/8   100%   13/13  100%   13/13  100%   10/10  100%
cafeteria         17/17  100%   16/16  100%   13/13  100%   11/11  100%
abarrotes         25/25  100%   20/20  100%   11/11  100%   14/14  100%
ferreteria        38/38  100%   27/27  100%   12/12  100%   13/13  100%
estetica-salon    25/25  100%   29/29  100%   12/12  100%   17/17  100%
TOTAL            113/113 100%  105/105 100%   61/61  100%   65/65  100%
TRONCO COMPARTIDO · lo que heredan los 73 modelos que faltan:    8/8   100%
```

La puerta sale en **0**. Doce excepciones declaradas en
`EXCEPCIONES-COBERTURA.md`: 9 funciones, 3 rutas, 0 pantallas, 1 migración.

**Las 65 migraciones están ESCRITAS y SIN APLICAR.** Ninguna se corrió contra
`wyqmzhliurwyxuyxznpb` ni contra ninguna otra base.

2 567 pruebas en 219 archivos, todas en verde.

---

## FASE 2.3 · ACOPLE · conectar los cinco modelos al punto de venta vivo

Gobierna `docs/fase-2/F2.3-REGLAS-DE-ACOPLE.md`. La puerta es `pnpm verify:acople`, y
`pnpm verify` pasa de 27 a 31 eslabones: entran `verify:cobertura` —que vivía sólo en
`verify:fase2`—, `test:integracion` y `verify:acople`.

| Etapa | Qué | Estado |
|---|---|---|
| **A0** | Preparación · respaldo, ensayo y la puerta | ✅ respaldo **comprobado restaurándolo** · `verify:acople` construido y **rojo al construirlo** · `verify:esquema` y `verify:rls` con transporte directo, los dos en 0 · **el ensayo con datos cazó 10 defectos** que habrían abortado la tanda entera |
| **A1** | Fusión de `main` en `fase-2` | ✅ **sin un solo conflicto** · 5 archivos, 1 737 líneas · colisión de folio 010 anotada, no renumerada |
| **A2** | Los seis huecos · F-017 enganchado | ✅ **F-017 con consumidores**: ruta `GET`, los dos envoltorios y el menú heredado · el renombre de D-01 en el código, que apagaba el sistema entero por cinco `esPaquete()` · **9 comandos de escritura sin ruta**, encontrados y conectados · `verify:entorno` deja de aprobar un chequeo sin hacer · `traspasos` y `tomas-inventario` con prueba propia · §7.5 comprobado: la premisa era falsa |
| **A3** | Migraciones aplicadas | ✅ **72 aplicadas** (las 71 pendientes + la `165` de seguridad). Ledger: **97 migraciones, última 165**. No faltaba una credencial: faltaba `supabase link` en ESTE worktree, porque el vínculo vive en `supabase/.temp/linked-project.json`, está en `.gitignore` y es local a cada uno. Respaldo de HOY comprobado, ensayo con datos en verde y ensayo contra producción con `rollback` antes de aplicar. Ver `A3-COMO-APLICAR.md` |
| **A4** | Contrato · `pnpm verify` completo | ✅ `esquema-esperado.json` regenerado **después** de aplicar: de 626/468/171 a **1 702 columnas, 1 329 restricciones y 429 índices**. Y aquí saltó lo grave: `verify:rls` pasó a **404 problemas** —la 050 y la 055 cierran la superficie pública y corrieron en las versiones 50 y 55, antes de que existieran las 60 tablas y las 100 funciones nuevas—. Los cierra la `165`, que además **comprueba dentro de la propia transacción** que no queda nada abierto |
| **A5** | Despliegue · preview de Vercel | ✅ **verificado DESDE FUERA**, que era lo que faltaba. El muro de Vercel se pasa con un enlace compartido —sin encender ni apagar la protección, que es un cambio persistente de seguridad—, y `verify:acople` y la suite de navegador aprendieron a llevar la credencial. Contra el despliegue: la raíz en 200, login con PIN en 200, las APIs devolviendo datos, 401 sin sesión, **las 82 rutas probadas por HTTP** y dos suites de navegador en verde. El `ORGANIZACION` del Preview apuntaba a un NEGOCIO VIVO y ahora apunta a una demo (§4.5). **No se promovió nada a producción.** Ver `VERCEL-ENTORNO.md` |
| **A6** | Verificación en el navegador | ✅ **las diez pasan** — cinco modelos × los dos proyectos—, cada una contra SU demo y ninguna contra un negocio vivo. Cinco defectos que sólo se ven corriéndolas: el `Origin` contra `APP_URL`, el «Ir a Caja» duplicado, el techo de 30 s mal puesto, `complementary` en vez de `region` con su panel plegado en tablet, y **el pooler en modo sesión**, que es el que importa fuera de las pruebas |
| **A7** | Cierre | ✅ `verify:acople` **en 0**, contra el despliegue de Vercel. Reporte 013 |

**La puerta, hoy:**

```
  migraciones   98 en disco = 98 en el ledger
  seguridad     RLS y grants cerrados en 162 relaciones y 15 funciones
  plantillas    5 resuelven módulos · los 6 giros de GIROS caen en una
  navegacion    59 rutas en los menús · 57 de 61 pantallas de modelo alcanzables · 4 declaradas sin menú
  vocabulario   ruta + los dos envoltorios + el menú heredado · 3 pantalla(s) lo consumen
```

**Y `test:integracion` ya no la tapa.** Estaba ANTES de `verify:acople` en la cadena de
`pnpm verify`: exige Docker, esta máquina no lo tiene, abortaba, y el `&&` cortaba, así que la
puerta de la fase **no llegaba a correr nunca**. Ahora va detrás.

> **CORRECCIÓN (2026-09-17, etapa E3).** Este párrafo decía además que `verify:fase2` «también la
> lleva», y era falso: esa cadena terminaba en `verify:cobertura` y no llevaba ni
> `test:integracion`, ni `verify:esquema`, ni `verify:rls`, ni `verify:acople`. Se arregló de la
> única forma que no deja dos verdades: **`verify:fase2` ya no existe.** Hay UNA cadena,
> `pnpm verify`, con 31 eslabones, y la puerta de la fase va dentro.

---

## FASE 2.3 · CIERRE · los cinco defectos que el acople dejó abiertos

El acople quedó ✅ en A7 con la puerta en 0, y la puerta **no servía**: aprobaba un sistema donde
las 61 pantallas de los cinco modelos no colgaban de ningún menú y donde dos de las tres plantillas
eran la misma. Estas siete etapas cierran eso.

| Etapa | Qué | Estado |
|---|---|---|
| **E1** | «Fase 3» → «Fase 2.3 · Acople» | ✅ **26 archivos · 61 apariciones · 3 renombrados** (`F2.3-REGLAS-DE-ACOPLE.md`, reportes 012 y 013). Las ~85 cabeceras SQL del rango 058-166 **NO se tocaron**: son comentarios, el ejecutor valida cada archivo por hash FNV-1a y cambiar una coma abortaría la tanda entera. Queda dicho en `00-LEEME-PRIMERO.md` |
| **E2** | Que cada modelo se vea como su negocio | ✅ **5 plantillas** (`tienda`, `cafeteria`, `restaurante`, `ferreteria`, `estetica`) con **62 módulos** —24 nuevos: agenda, cita, comisión, expediente, profesional, cotización, corte de material, crédito— y **ningún par idéntico**. Migración **166** aplicada. **F-018**: el menú vive en el SERVIDOR (`packages/contracts/src/comandos/navegacion.ts`), en orden de día de trabajo, y de ahí lo leen el lateral Y el abanico móvil. Pantalla de inicio por plantilla y por rol. Guarda `exigirPlantilla()` en las cinco carpetas de `app/(modelos)/`. Vocabulario: **3 consumidores, pendiente E2.4** |
| **E3** | Puertas que muerden | ✅ **E3.1 demostrado en ROJO antes de arreglar nada**, que era la condición. La tautología de `verificar-acople.mjs:406-410` —`plantillaDe()` tiene `default: return 'tienda'`, así que «todo giro cae en una plantilla» era cierto por construcción— sustituida por `PLANTILLA_POR_GIRO`: claves = `GIROS` en las DOS direcciones, valores ∈ `PLANTILLAS`, y **un giro inventado NO es clave**. Nueva `comprobarNavegacion()`. `verify:fase2` **borrado**; una sola cadena de 31 eslabones. Las dos afirmaciones falsas del reporte 013 §3 y de esta bitácora, corregidas donde estaban escritas |
| **E2.4** | El vocabulario se VE | ✅ **48 pantallas lo consumen · 0 sustantivos tecleados a mano** (eran 3 de 65). Cuatro formas nuevas en el diccionario, porque sin ellas no se puede: `titulo` (el encabezado), `enFrase` (el artículo en minúscula, para un mensaje), `conDeterminante`/`enFraseCon` (**el determinante concuerda**: «Ninguna mesa» y «Ningún pedido») y `terminacion` (**el adjetivo también**: «Cuentas cobradas» y «Pedidos cobrados»). Se tocó sólo lo que el usuario LEE; ni un identificador, ni un campo de la base, ni un nombre de entidad del puente. Y la puerta, que pedía «al menos dos pantallas» —y pasaba con tres de 65—, ahora exige la propiedad: ninguna pantalla escribe a mano una palabra que su diccionario ya dice |
| **E2.5** | Tres defectos que E2 metió en el menú | ✅ Los tres commiteados y aprobados por la puerta, porque comprobaba RUTAS y estaban mal en lo que el dueño LEE. **1**: las entradas de los cinco modelos sustituyeron a las doce heredadas y el punto de venta de todos los días se quedó sin menú —las diez pantallas que llevan meses cobrando—; vuelven en un grupo `HEREDADO`, con la regla de una entrada por módulo y sólo ENTRE grupos. **2**: la `entidad` de una entrada borraba su etiqueta —«Mi día» se leía «Estilistas», y «Agendar» y «Cita en curso» se leían «Citas» las dos—; quitada de las trece entradas cuya etiqueta es una frase. **3**: la guarda mandaba al login a quien estaba mirando el login; el middleware pone la ruta en una cabecera y la guarda salta las cuatro pantallas sin sesión, atadas por la puerta a las cuatro `PANTALLA-SIN-MENU`. Contrato nuevo: `menu-que-se-lee.test.ts` |
| **E4** | Datos y usuarios de demostración | ✅ Las cinco sembradas: **18-27 vendibles** por modelo con precios de México, **3-5 empleados** con nombre de persona y PIN distinto por rol, proveedor con día de visita y **caja ABIERTA con su fondo desglosado**. La estética tenía tortillas —caía en la semilla de abarrotes— y ahora trae 16 servicios con los cuatro tramos de F-401, dos estilistas con horario y sus muebles. La guarda de §4.5 compara por IDENTIDAD de organización y no por nombre. **Y destapó que desde la 121 ninguna organización podía guardar un producto** (42501): la 167 lo cierra y un contrato nuevo lo caza |
| **E5** | Producción | ⚠️ **casi**: `DATABASE_URL` de Production **en el 6543** (era el quinto defecto), las diez variables completas, y `negocioDelDespliegue(slug, host)` —con una variable del build un despliegue sólo puede servir a UN negocio y Miguel tiene cuatro—. **La fusión a `main` NO está hecha**: empujar a `main` dispara un despliegue de producción, se pidió permiso y se denegó. Está en el [PR #1](https://github.com/M1gu3hb/MorphiqPOS/pull/1), que es una decisión de Miguel |
| **E6** | `ACCESOS-DEMO.md` | ✅ los cinco negocios, las 24 personas con su PIN **comprobado contra su hash Argon2id**, el menú de cada plantilla, qué ve cada rol y un recorrido de veinte minutos. Y destapó que **el almacén veía la pantalla vacía** |
| **E7** | Cierre con siete condiciones | ⚠️ **5 de 7**. `verify:acople` en 0 contra un servidor vivo · las cinco plantillas en Modo presentación, derivadas · **10/10 en el navegador** · ACCESOS-DEMO · cero datos de prueba de esta sesión en los cuatro vivos. Faltan las dos que no son código: `pnpm verify` completo —`test:integracion` necesita un Postgres que esta máquina no tiene— y el despliegue, que espera la fusión. Reporte **014** |

**Al cerrar E2.4**, en 0: `verify:cobertura`, `verify:esquema`, `verify:rls`, `verify:paquetes`,
`verify:aspecto`, `verify:entorno`, `verify:primitivas`, `verify:mutaciones-backend`, `lint`,
`prettier --check`, `typecheck` (7/7) y **2 697 pruebas en 223 archivos**. `verify:acople` pasa sus
seis comprobaciones de código y pide un servidor al que preguntar por las rutas — eso es E5.

> **Al cerrar E1-E3 esto decía que `lint` salía en 0, y no era cierto**: quedaban 5 errores de
> `no-unnecessary-condition` en código de esa misma etapa. Se vieron al correr la cadena de E2.4 y
> están cerrados con `segunElDato(tabla, clave)`. El porqué, en la bitácora.

**El ensayo con datos, en verde** (`node scripts/ensayo-con-datos.mjs`):

```
  ✓ las 70 pendientes aplicadas y confirmadas · 57 ms

  Los negocios, despues del renombre de plantillas:
    Abarrotes Don Chuy           giro tienda       → tienda
    Café Jacaranda               giro cafeteria    → restaurante
    Ferretería La Broca          giro ferreteria   → tienda
    Restaurante MH               giro restaurante  → restaurante

  ledger: 95 migraciones · ultima 163 · tablas en public: 134
```

**`btree_gist` ESTÁ disponible** en `wyqmzhliurwyxuyxznpb` (versión 1.7). El riesgo que la
Fase 2 dejó marcado como bloqueante de A3 no era un riesgo: era una pregunta sin hacer.

**La pantalla que cambia de plantilla, arreglada.** Ofrecía los tres nombres VIEJOS
(`esencial`, `operativo`, `restaurante_pro`), que después de la 058 violan el `check`.
Ahora ofrece `tienda`, `cafeteria` y `restaurante`, que es lo único que
`/api/configuracion/paquete` acepta, y `leerConfiguracion` del puente sirve `paquete_modo`
**normalizado** para que el navegador entienda tres valores y no seis. Queda una sola cosa por
ejercitar, y depende de A3: **pulsar el botón**, porque hasta que la 058 esté aplicada la base
rechaza el valor nuevo. Cambiar de plantilla sigue siendo la definición de terminado.

17 archivos de `heredado/` se editaron para eso —todos preexistentes— y `verify:aspecto` sigue
en 0 sobre los 73 que compara, con **3 excepciones declaradas** en
`scripts/aspecto-permitido.json`: dos son nombres de variable dentro de un `className` con
plantilla, no clases, y la tercera son las seis etiquetas de «Modo presentación», que tenían que
cambiar porque nombraban paquetes que el servidor ya rechaza.


---

## FASE 2.3 · CIERRE DEFINITIVO · el día que las pruebas cobraron (18-09-2026)

La suite de navegador salía 10/10 abriendo las pantallas de los cinco modelos, y **la pantalla de
cobro de una tienda publicaba en una ruta que no existía**: `/api/venta/cobrar-mostrador`. Una tienda
entera sin poder cobrar, con la puerta en verde. Ésta es la etapa que hizo que las pruebas cobraran, y
lo que encontró al hacerlo.

| Etapa | Qué | Estado |
|---|---|---|
| **E1** | Los checks del CI | ✅ **los cuatro en verde** sobre `ef57f4d`. Eran **cuatro causas distintas** y ninguna la que el encargo suponía —clonar en limpio y `pnpm install --frozen-lockfile` pasó en 44 s—: `verify:historico` exigía lo que el contrato prohíbe versionar, dos vulnerabilidades altas de `sharp`, un `export` que sólo el build ve, y una prueba unitaria que lee `historico/`. Y una quinta al arreglarlas: **`test:integracion` nunca había corrido en CI** —el arnés leía `DATABASE_URL_PRUEBAS` y el workflow definía `DATABASE_URL`, la espera de Postgres sólo abría un socket, nadie aplicaba las migraciones y el rol `morphiqpos_app` no existe en una base nueva—. Ahora: **5 archivos, 10 pruebas, en cada empujón** |
| **E3** | Un despliegue, las cinco demos | ✅ `ORGANIZACION` admite una **lista de slugs**; con uno —producción— no cambia nada. La organización sale del **EMPLEO** de quien entra, resuelto en el servidor y filtrado por la lista servida **dentro de la consulta** (R16 intacto). Medido: **un build, un servidor, 5 negocios, 25 personas**, y las cinco suites en verde seguidas sin redesplegar |
| **E4** | Que las pruebas cobren | ⚠️ **4 de 5**. `abarrotes` $42.90 · `cafeteria` $52.00 · `restaurante` $75.00 · `estetica-salon` $1,800.00, cada una comprobando contra el SERVIDOR la venta con su folio, el movimiento de inventario por ESA venta, y el corte cuadrado al centavo. La `ferreteria` **no puede**: su mostrador se hidrata de una entidad que el puente no tiene, «Mandar a caja» publica en una ruta que sirve a otro comando, y `pendiente_cobro` no lo escribe nadie. Declarado con **sonda** que falla el día que se arregle |
| **E5** | Puertas nuevas y la que mentía | ✅ Cuatro comprobaciones en `verify:acople`, **las cuatro validadas mutando**: que cada suite compruebe un TOTAL COBRADO, que los checks de GitHub estén verdes leídos por la API, **que exista la ruta que la pantalla llama** —18 declaradas— y que las 14 pantallas heredadas cuelguen de un menú o estén declaradas. Y fuera la aserción circular de `plantillaDe(giro, undefined)`: comparaba el mapa consigo mismo |
| **E2** | Producción | ⚠️ **el muro sí, el código no**. La Protección de Despliegue estaba en `all_except_custom_domains` y Miguel no podía entrar; ahora protege **sólo los previews** y la URL de producción responde 200 sin cookie, comprobado desde fuera. La **fusión del PR #1 la denegó la política de permisos de la sesión** («Merge Without Review»), no GitHub: los cuatro checks están verdes y el PR es `MERGEABLE`. Promover el preview a producción se descartó a propósito: lleva las variables de Preview dentro del build y leerlas también está denegado — promover sería apostar a que la URL de Miguel no acaba sirviendo una demostración |
| **DNS** | El dominio | ✗ `DNS-PENDIENTE.md` con los valores exactos. El apex **no tiene registro A** y `www` sigue apuntando a **`base44.onrender.com`**, la plataforma erradicada: de ahí sale el 402 |

**Los veinte defectos** están contados uno por uno en el reporte **015** §3.1. Ocho estaban en el
camino del dinero —la tienda no podía cobrar, la cafetería no podía cerrar el turno, el corte decía
«Sobran» todo lo contado, cobrar una cita no tocaba la caja— y seis en la demostración: sin estación
de cocina, sin servicios marcados como servicios, sin saber quién hace qué, sin regla de comisión, sin
transición a «terminada» y con un reseteo que se rompía en cuanto el salón cobraba.

**Al cerrar esta etapa**, en 0: `verify:acople` con sus diez comprobaciones, `verify:aspecto` (con la
línea del negocio en la tarjeta de acceso declarada), `verify:identidad` (11 contratos · 12
destructivas de contrato · 6 de prueba · 3 inocuas), `lint`, `prettier --check`, `typecheck` 7/7 y
**2 739 pruebas en 228 archivos**. `test:integracion` corre **en CI**; en esta máquina sigue
necesitando Docker o `DATABASE_URL_PRUEBAS`.

**Cero datos de prueba en los cuatro negocios vivos**, medido: 0 órdenes, 0 cajas y 0 citas en las
últimas 12 horas en Restaurante MH, Café Jacarandá, Abarrotes Don Chuy y Ferretería La Broca.

---

## FASE 2.3 · SEGUNDA VUELTA · los 45 huecos (19-09-2026)

Lo grande estaba hecho —99 migraciones, 162 relaciones con RLS, cinco plantillas, cinco demos, el CI
verde— y lo que quedaba eran huecos: pantallas que abren y no hacen, rutas que el frontend llama y no
existen, y una suite que no cobraba. **45 tareas en cinco bloques.** Esta tabla se actualiza al cerrar
cada bloque; el detalle de cada decisión está en la bitácora del día.

| Bloque | Qué | Estado |
|---|---|---|
| **1** | Que los cinco modelos hagan su trabajo | ✅ **cerrado** · T-38, T-15, T-16, T-18, T-17, T-37, T-07, T-08/T-24 y T-09 |
| **2** | Las 18 rutas que el frontend llama y no existen | ✅ **cerrado** · 0 declaradas. La puerta exige que la lista quede VACÍA, no sólo que no crezca |
| **3** | Que las pruebas miren el CONTENIDO, no el 200 | ✅ **cerrado** · una marca de contenido por pantalla —61 entonces, 62 hoy con el tablero del salón—, `vigilarFallos` cazando 4xx y `{ok:false}` con la ENTIDAD nombrada, las cinco demos verdes **dos veces seguidas sin volver a sembrar** y en `--project=tablet` (T-39). Nueve defectos destapados: cuatro filtros por un campo que no existe —que dejan la lista VACÍA, no roja—, tres listas pedidas a rutas de ESCRITURA, una cafetería sin opciones de bebida y una mesa que no volvía al servicio. **Dos puertas nuevas**, las dos demostradas en rojo: una marca de contenido por pantalla (62 de 62 hoy) y la lista de huecos de cobro VACÍA |
| **4** | Tableros y vocabulario | ✅ **cerrado** · T-10 y T-11. `/` servía a los cinco modelos el tablero HEREDADO, que es el del RESTAURANTE, con dos tarjetas que tres carpetas PROHÍBEN. Ahora cada modelo tiene el suyo —siete indicadores la tiendita, ocho la ferretería, catorce la cafetería, ocho el salón— y la estética no tiene tablero en la casa: tiene AGENDA, porque su §4.4.1 dedica una sección a defender que a las 9:45 un dashboard es un adorno. **Una puerta nueva de vocabulario**, demostrada en rojo contra mi propio tablero de cafetería: rotulaba «Venta de la ráfaga» —la palabra de la TIENDA para `orden`— y escribía «barra» a mano tres veces |
| **5** | Producción y la cadena entera | ✅ **cerrado** · `pnpm verify` de punta a punta destapó un contrato ROTO que el CI no veía —los cuatro tableros declaraban su plantilla a mano, y `ningun_comando_escribe_la_lista_a_mano` lo prohíbe desde F1.1-C-15—. La lista vive ahora en un `Record<Paquete, …>` que **no compila** si llega una sexta plantilla sin decidir su tablero, y **los nueve arneses de mutación entraron al CI** en un trabajo propio que corre en paralelo: una puerta que sólo existe en una laptop no es una puerta del proyecto. El informe de la vuelta entera es [`016-fase-2.3-segunda-vuelta.md`](../reports/016-fase-2.3-segunda-vuelta.md) |

### CIERRE · producción con el código nuevo (20-09-2026)

`main` tiene los 100 commits de la fase (`63f4423`) y **`morphiqpos-kappa.vercel.app` sirve el código
nuevo sin ningún muro**: la raíz en 200, `/api/auth/empleados` con los 29 empleados y las rutas del
código nuevo en 403 —existen y están guardadas—, no en 404.

Y **un solo despliegue sirve a SEIS negocios por sesión**: `mh-restaurante` y las cinco
`demo-acople-*`. `ORGANIZACION` admite lista desde la 166 y ahora la lleva; el camino por HOST sigue
ganando cuando el host trae el slug, para el día que el dominio resuelva. Se deshace cambiando **una
variable de entorno**, no código.

### Bloque 4 · los cinco tableros, y el que no lo es

`/` resolvía UN tablero para los cinco negocios: el `Dashboard` de `heredado/`, construido para
Restaurante MH, con los nueve indicadores de una cena —ventas, costo, utilidad, ticket promedio, la
dona de métodos de pago, propinas—. No es que fuera genérico: **era el de otro negocio**, y dos de sus
tarjetas están prohibidas con nombre y apellido en tres de las cinco carpetas.

| Modelo | Indicadores | Qué va PRIMERO, y por qué |
|---|---|---|
| **tienda** | 7 | La venta del día contra el mismo día de la semana pasada. Su §4.4 prohíbe el ticket promedio —«se mueve por azar y no dispara nada»— y la dona —«ocupa más y contesta menos que una lista en 390 px»— |
| **ferretería** | 8 | **La cartera.** «Es la pérdida que no admite vuelta atrás»: una tiendita fía cien pesos al vecino, una ferretería fía ciento veinte mil a una obra que puede no volver. Y el sexto es LÍNEAS POR VENTA, que mide la asesoría y que en la tiendita está prohibido |
| **cafetería** | 14 | **La ráfaga de 07:00 a 10:30.** «A las ocho de la mañana nadie mira el dashboard»: se mira a las 10:30, cuando baja, y a las 20:40 al cerrar. Todo lo del dinero es del TURNO abierto, porque es el que se va a cortar |
| **estética** | 8 | **La ocupación de MAÑANA**, y el tablero vive dentro de Reportes. Es el único número sobre el que todavía se puede actuar, y por eso no es un número solo: trae los huecos con su hora, de la lista de espera quién los quería, y las que siguen sin confirmar |
| **restaurante** | 9 | El heredado se queda, porque el heredado **ES** el suyo: sus nueve indicadores son uno por uno los de su §4.4 |

Y la decisión que no es un tablero: **el inicio de una estética es su agenda.** Su §4.4.1 lo defiende
con una hora —«a las 9:45 de la mañana, casi todos los indicadores de un dashboard son adornos»— y con
una frecuencia: la agenda se abre de cuarenta a ochenta veces al día para la misma pregunta, «¿quién
sigue?», y el tablero dos. Se SIRVE en `/` en vez de redirigir a su ruta, porque `app/(modelos)/` no
monta la barra lateral del heredado y un redirect dejaría a la dueña en la única pantalla sin menú.

La puerta de vocabulario del bloque 3 cazó el tablero de la cafetería recién escrito —cuatro renglones,
uno de ellos el rótulo del indicador estrella— y eso es exactamente para lo que existe: la palabra
«venta» es la que la TIENDA usa para `orden`, y en una barra una orden es una cuenta.

### Bloque 2 · las catorce que se construyeron

Ninguna era «apuntar la ruta»: en trece de las catorce faltaba el comando, la entidad del puente o la
columna. El detalle de cada una está en la bitácora del 20-09-2026; lo que hay que saber de un golpe:

| Ruta | Lo que faltaba de verdad |
|---|---|
| `abarrotes/alta-rapida` | El comando no creaba el insumo ni la existencia: lo que nacía en el mostrador no se podía contar |
| `agenda/lista-espera` | La pantalla mandaba tres campos opcionales donde el comando pide una ventana y una clienta |
| `cafeteria/agregar-bebida` | **Ningún** comando escribía `orden_linea_modificadores`: la leche de avena no se cobraba |
| `expediente/capturar-formula` | `cerrar_servicio` sólo AUDITABA la fórmula, y la auditoría no es el expediente |
| `precios/aplicar-sugerido` | Comando nuevo que toca sólo el precio de venta; el costo lo pondera la compra |
| `turno/presencia/abrir` | Sin presencias, el bote se reparte entre cero minutos trabajados |
| `ferreteria/declarar-equivalencia` | La ficha manda TEXTO y el comando pide dos ids: se resuelve contra el catálogo y se exige que quede UNA pieza |
| `inventario/ajustar-conteo` | La entidad `ConteoDeZona` no existía (migración **173**) y la pantalla mandaba una FRASE donde la base pide una clave |
| `ferreteria/agregar-partida` | La ficha no tiene orden: se llega a ella desde la búsqueda, y la venta es la de la terminal |
| `restaurante/imprimir-precuenta` | Cuenta la hoja (migración **174**): desde la segunda sale marcada REIMPRESIÓN |
| `venta/devolver` | El efectivo sale del cajón con signo negativo; la tarjeta se informa por método; los pagos quedan en `reembolsado` |
| `entradas/recibir` | El almacén (de la sesión), el crédito con su documento por pagar, y el camino de captura |
| `entradas/alta-material` | El alta rápida del renglón sin emparejar, con precio en cero y marcada incompleta |
| `reportes/exportar` | No es un comando: lee por el PUENTE —permisos por campo incluidos— y guarda el CSV en el prefijo privado del negocio |

Y tres defectos que sólo aparecieron al construirlas: la pantalla de entradas leía **dos entidades
inexistentes** (el sistema no lleva pedidos a proveedor, así que la franja ahora dice cuándo pasa el
proveedor y qué pedirle), el costo del conteo **no lo ve quien cuenta** (la pantalla enseña piezas y
calla el importe en vez de multiplicar por cero), y `compras.sugerir_pedido` exigía un almacén que la
pantalla no puede saber.

### Bloque 1 · lo cerrado, con su comprobación

| Tarea | Qué era | Qué quedó |
|---|---|---|
| **T-38** | El mapa de mesas pintaba doce mesas y tocarlas no hacía nada: la página montaba `<MapaDeMesas />` sin `onAbrirMesa` | Tocar una mesa lleva a la mesa. Y `MesaActiva` **abre** una mesa libre —pregunta para cuántas personas y llama a `/api/restaurante/abrir-mesa`, que no tenía quién lo llamara—, porque sin eso una mesa libre seguía sin poder abrirse por la interfaz |
| **T-15** | `MaterialMostrador` no existía en el puente: el mostrador de una ferretería se quedaba sin un solo material | Migración **168**, vista `materiales_mostrador` con precio y existencia EN VIVO y los atributos con su valor original (`1/4"`, no `6350`) |
| **T-16** | Tres fallos en fila: la nota no se creaba, la caja listaba un estado inexistente y el cobro mandaba un cuerpo que el comando rechaza. **La caja de una ferretería no había cobrado nunca** | Comando `ferreteria.crear_nota_mostrador` —que crea también su fila en `notas_mostrador`, la tabla de F-140 en la que nadie insertaba—, migraciones **169** y **170** con la vista `notas_de_caja`, «A cuenta» por `credito.registrar_remision` y la transferencia por confirmar con su ruta propia |
| **T-18** | La suite de ferretería no cobraba, y lo declaraba con una sonda | Cobra: nota armada en el pasillo con su folio a la vista, cobrada en la caja por su folio, y el corte cuadrado al centavo contra el servidor |
| **T-37** | La agenda del día leía dos entidades con forma de BLOQUE que el puente no tiene: la pantalla de inicio de la recepcionista decía «Hoy no hay citas todavía» con las citas en la base | Sale de los dos comandos que YA servían eso —`agenda.dia` y `agenda.huecos`—, con los nombres del puente y `ExpedienteBelleza` para la bandera de alergia. Y **el día se arma en la zona del negocio**: con el día en UTC, la cita de las 18:30 caía en el día siguiente y el horario «10:00 a 19:00» se leía como 04:00 a 13:00 |
| **T-07** | `iniciar` y `cerrar-servicio` tenían ruta y comando, y ninguna pantalla podía usarlos | Tocar el bloque inicia la cita **y entra a ella**; el servicio se cierra en su pantalla. El almacén del consumo lo resuelve el servidor, el movimiento de cabina ya no revienta contra la foránea de motivos, y lleva su costo |
| **T-08/T-24** | El alta de clienta publicaba en `/api/cliente/crear`, que no existe: con la demo en cero clientas no se podía agendar por la pantalla | Apuntada a `POST /api/clientes` (`cliente.alta`), que ya existía y devuelve la ficha si el teléfono está repetido |
| **T-09** | `materialCentavos: 0n` en la comisión: las tres reglas de material calculaban lo mismo y el descuento no llegaba a la nómina | Valuado del movimiento de `consumo_servicio` con el costo del momento en que se mezcló |
| **T-17** | El corte de material publicaba en una ruta que no existía, y la pantalla no tenía ni material ni piezas que enseñar | Comando `ferreteria.cortar_y_agregar` —**el corte abre su propia nota**, porque cortar es irreversible y esa partida no puede vivir en el estado de un navegador—, migración **171** con `materiales_continuos` y `piezas_de_material`, cable continuo en la semilla con dos rollos abiertos, y **cuatro defectos** que salieron al ejecutarlo contra la base real: la escala (descontaba diez mil veces), el insumo (descontaba de un id que no existe), el motivo de merma (foránea que rechazaba el movimiento) y el cobro, que volvía a descontar lo ya cortado |

---

## LOS 78 MODELOS

Prioridad: **P0** = los tres que ya tienen cliente vivo · **P1** = alto rendimiento comercial · **P2** = resto.

### F1 · ALIMENTOS Y BEBIDAS — `modelos/01-alimentos/`

| # | Carpeta | Arquetipo | Prioridad | Estado |
|---|---|---|---|---|
| 01 | `restaurante` | A2 | **P0** | ✅ 7/7 · 4 preguntas contestadas · 8 funciones pendientes de código |
| 02 | `cafeteria` | A2 mostrador | **P0** | ✅ 7/7 · 4 preguntas contestadas · 15 funciones pendientes de código · 9 funciones nuevas propuestas al catálogo |
| 03 | `bar-cantina` | A2 | P1 | ⬜ |
| 04 | `comida-rapida` | A1+A2 | P1 | ⬜ |
| 05 | `taqueria` | A1+A2 | P1 | ⬜ |
| 06 | `food-truck` | A1 | P2 | ⬜ |
| 07 | `fonda-cocina-economica` | A1 | P1 | ⬜ |
| 08 | `pizzeria` | A2+delivery | P1 | ⬜ |
| 09 | `dark-kitchen` | delivery puro | P2 | ⬜ |
| 10 | `bufet-por-peso` | A1 | P2 | ⬜ |
| 11 | `panaderia-pasteleria` | A8+A1 | **P1** | ⬜ |
| 12 | `heladeria-paleteria` | A1 | P2 | ⬜ |
| 13 | `jugueria` | A1+A2 | P2 | ⬜ |
| 14 | `catering-banquetes` | A5+A7 | P2 | ⬜ |

### F2 · RETAIL Y MOSTRADOR — `modelos/02-retail/`

| # | Carpeta | Arquetipo | Prioridad | Estado |
|---|---|---|---|---|
| 15 | `abarrotes` | A1 | **P0** | ✅ 7/7 · 4 preguntas contestadas · **raíz del arquetipo A1**, la heredan 18 modelos de retail · 11 funciones pendientes de código · 10 funciones nuevas propuestas al catálogo + 2 reclasificaciones |
| 16 | `ferreteria` | A1 + deltas A5 | **P0** | ✅ 7/7 · 4 preguntas contestadas · **hereda de `abarrotes`: 70% de sus funciones van `[=]`** · 13 funciones pendientes de código · 10 funciones nuevas propuestas al catálogo + 3 reclasificaciones · **P4 demuestra que NO se fusiona con `abarrotes`** y abre dos fronteras nuevas a vigilar: `materiales-construccion` y `refaccionaria` |
| 17 | `papeleria` | A1 | P1 | ⬜ |
| 18 | `farmacia` | A1 | **P1** | ⬜ |
| 19 | `boutique-ropa` | A1 | P1 | ⬜ |
| 20 | `zapateria` | A1 | P2 | ⬜ |
| 21 | `muebleria` | A1+A5 | P2 | ⬜ |
| 22 | `electronica-celulares` | A1+A4 | P1 | ⬜ |
| 23 | `refaccionaria` | A1 | P1 | ⬜ |
| 24 | `agroveterinaria` | A1 | P2 | ⬜ |
| 25 | `vinateria` | A1 | P2 | ⬜ |
| 26 | `floreria` | A1+A5 | P2 | ⬜ |
| 27 | `tienda-mascotas` | A1+A3 | P2 | ⬜ |
| 28 | `joyeria` | A1 | P2 | ⬜ |
| 29 | `optica` | A1+A3+A4 | P2 | ⬜ |
| 30 | `materiales-construccion` | A1+A5+A9 | P2 | ⬜ |
| 31 | `merceria-telas` | A1 | P2 | ⬜ |
| 32 | `dulceria` | A1 | P2 | ⬜ |
| 33 | `vapes-tabaqueria` | A1 | P2 | ⬜ |

### F3 · SERVICIOS CON CITA — `modelos/03-servicios-cita/`

| # | Carpeta | Arquetipo | Prioridad | Estado |
|---|---|---|---|---|
| 34 | `estetica-salon` | A3 | **P1** | ✅ 7/7 · 4 preguntas contestadas · **RAÍZ DEL ARQUETIPO A3**, que no existía: de las 35 funciones catalogadas del bloque F-4xx, **cero estaban construidas**. La heredan 11 modelos de servicios con cita (22 contando los que llevan A3 como delta) · 12 funciones pendientes de código · **15 funciones nuevas propuestas al catálogo + 3 reclasificaciones** · **1 riesgo técnico bloqueante: `btree_gist` en Supabase** |
| 35 | `barberia` | A3 | **P1** | ⬜ |
| 36 | `nail-salon` | A3 | P2 | ⬜ |
| 37 | `spa-masajes` | A3 | P2 | ⬜ |
| 38 | `clinica-dental` | A3 | P1 | ⬜ |
| 39 | `consultorio-medico` | A3 | P2 | ⬜ |
| 40 | `veterinaria` | A3+A1 | **P1** | ⬜ |
| 41 | `fisioterapia` | A3 | P2 | ⬜ |
| 42 | `estudio-tatuajes` | A3 | P2 | ⬜ |
| 43 | `gimnasio` | A6+A3 | P1 | ⬜ |
| 44 | `escuela-academia` | A6+A3 | P2 | ⬜ |
| 45 | `estudio-fotografia` | A3+A5 | P2 | ⬜ |

### F4 · TALLER Y REPARACIÓN — `modelos/04-taller/`

| # | Carpeta | Arquetipo | Prioridad | Estado |
|---|---|---|---|---|
| 46 | `taller-mecanico` | A4+A1 | **P1** | ⬜ |
| 47 | `taller-celulares` | A4+A1 | P1 | ⬜ |
| 48 | `lavanderia-tintoreria` | A4 | P1 | ⬜ |
| 49 | `autolavado` | A1+A3 | P2 | ⬜ |
| 50 | `reparacion-electrodomesticos` | A4 | P2 | ⬜ |
| 51 | `carpinteria-herreria` | A4+A5 | P2 | ⬜ |

### F5 · ESPACIO Y TIEMPO — `modelos/05-espacio/`

| # | Carpeta | Arquetipo | Prioridad | Estado |
|---|---|---|---|---|
| 52 | `hotel-motel` | A7+A1 | P1 | ⬜ |
| 53 | `rentas-cortas` | A7 | P2 | ⬜ |
| 54 | `salon-eventos` | A7+A5 | P2 | ⬜ |
| 55 | `coworking` | A7+A6 | P2 | ⬜ |
| 56 | `estacionamiento` | A7 | P2 | ⬜ |
| 57 | `canchas-deportivas` | A7 | P2 | ⬜ |
| 58 | `self-storage` | A7+A6 | P2 | ⬜ |

### F6 · DISTRIBUCIÓN Y MAYOREO — `modelos/06-distribucion/`

| # | Carpeta | Arquetipo | Prioridad | Estado |
|---|---|---|---|---|
| 59 | `distribuidora-mayorista` | A5+A9 | P1 | ⬜ |
| 60 | `purificadora-agua` | A9 | P1 | ⬜ |
| 61 | `gas-lp` | A9 | P2 | ⬜ |
| 62 | `panaderia-industrial` | A8+A9 | P2 | ⬜ |

### F7 · PRODUCCIÓN — `modelos/07-produccion/`

| # | Carpeta | Arquetipo | Prioridad | Estado |
|---|---|---|---|---|
| 63 | `tortilleria` | A8+A1 | P1 | ⬜ |
| 64 | `cerveceria-artesanal` | A8+A2 | P2 | ⬜ |
| 65 | `imprenta-serigrafia` | A8+A4+A5 | P2 | ⬜ |
| 66 | `fabrica-muebles` | A8+A5 | P2 | ⬜ |

### F8 · PROFESIONAL Y CRM — `modelos/08-profesional/`

| # | Carpeta | Arquetipo | Prioridad | Estado |
|---|---|---|---|---|
| 67 | `agencia-marketing` | A10 | P1 | ⬜ |
| 68 | `despacho-contable` | A10+A6 | P2 | ⬜ |
| 69 | `despacho-legal` | A10 | P2 | ⬜ |
| 70 | `inmobiliaria` | A10 | P2 | ⬜ |
| 71 | `constructora` | A10+A5 | P2 | ⬜ |
| 72 | `consultoria` | A10 | P2 | ⬜ |

### F9 · CASOS ESPECIALES — `modelos/09-especiales/`

| # | Carpeta | Arquetipo | Prioridad | Estado |
|---|---|---|---|---|
| 73 | `ecommerce` | A1+portal V6 | P2 | ⬜ |
| 74 | `casa-empeno` | A5 | P2 | ⬜ |
| 75 | `gasolinera` | A1 | P2 | ⬜ |
| 76 | `funeraria` | A5+A7 | P2 | ⬜ |
| 77 | `agencia-viajes` | A5+A10 | P2 | ⬜ |
| 78 | `renta-equipo` | A7 | P2 | ⬜ |

---

## RESUMEN

```
Total ................... 78
Terminados .............. 5   restaurante · cafeteria · abarrotes · ferreteria ·
                              estetica-salon
En progreso ............. 0
Sin empezar ............. 73

P0 (cliente vivo) ....... 4   restaurante · cafeteria · abarrotes · ferreteria
                              ✅ LOS CUATRO NEGOCIOS VIVOS TIENEN SU MODELO DOCUMENTADO

Arquetipos con carpeta raíz terminada:
  A2 Mesa y comanda ..... restaurante      (la heredan 12 de alimentos)
  A1 Mostrador .......... abarrotes        (la heredan 18 de retail)
  A3 Cita y profesional . estetica-salon   (la heredan 11 de servicios con cita,
                                            22 contando los que lo llevan como delta)
                                            ⬅ NUEVO. Era el módulo de mayor
                                            rendimiento comercial que NO EXISTÍA:
                                            el bloque F-4xx completo estaba a cero.

Primer modelo HEREDERO terminado:
  ferreteria ← abarrotes  · 70% de sus funciones citadas por ID, no reconstruidas.
                            Es la prueba de que D-02 funciona: el segundo modelo
                            de un arquetipo cuesta la mitad que el primero.

P1 (alto rendimiento) ... 19
P2 (resto) .............. 54
```

**Lectura de cobertura, según `01-MAPA-GENERAL.md` §5:**

```
Con A2 (restaurante) ........................  6 modelos vendibles
+ A1 completo (abarrotes, ferreteria) ....... 15
+ A3 documentado (estetica-salon) ........... 22   ⬅ AQUÍ ESTAMOS EN DOCUMENTACIÓN

Los tres arquetipos con raíz documentada cubren 22 de los 78 modelos.
Faltan siete raíces: A4 orden de trabajo · A5 cotización y pedido ·
A6 suscripción · A7 espacio y tiempo · A8 producción · A9 ruta ·
A10 proyecto y CRM.
```

## DEUDA TRANSVERSAL DETECTADA POR LOS MODELOS TERMINADOS

Lo que dos o más carpetas señalaron y que **no se arregla modelo por modelo**:

| Deuda | Quién la señaló | Por qué urge |
|---|---|---|
| **F-017 diccionario de vocabulario** | `abarrotes` (aviso) · `ferreteria` (hecho consumado) · **`estetica-salon` (lo exige)** | **TERCER modelo y TERCER arquetipo.** Ya no es un aviso: "mesa"→"estación", "mesero"→"estilista", "comensal"→"clienta" **con género**. Y hay **once herederos de A3 esperando detrás**. Se construye ya |
| **F-040 `Cliente` no está en el puente** | `abarrotes` · `ferreteria` · **`estetica-salon` (BLOQUEANTE)** | La tabla existe desde `002_catalogo.sql`. Sin ella no hay fiado ni crédito — y en A3 **no hay cita, ni expediente, ni recordatorio, ni cartera**. No se puede empezar A3 sin esto. **Es la deuda más cara del proyecto** |
| **Estacionalidad** | `abarrotes` · `ferreteria` · **`estetica-salon`** | **TRES familias distintas señalando el mismo hueco ⇒ es deuda del PROYECTO, no de un arquetipo.** En retail es la sugerencia de pedido; en A3 es la proyección de ocupación y de producto (mayo, diciembre, 15 años, graduaciones). Resolver una vez |
| **F-635 cuentas por pagar** | `abarrotes` (tanda 5, reconocido como error) · `ferreteria` (tanda 2) · `estetica-salon` (tanda 6) | Tercer modelo. Sube de prioridad |
| **P-02 CFDI** | `ferreteria` lo vuelve bloqueante | Un ferretero sin facturación en el POS no compra |
| **`btree_gist` en Supabase** | `estetica-salon` | **Riesgo técnico BLOQUEANTE de A3.** Toda la arquitectura de agenda descansa en una restricción de exclusión GiST sobre `tstzrange`. Si la extensión no está disponible en `wyqmzhliurwyxuyxznpb`, el plan B (slots discretos de 5 min) es mucho peor. **Verificar ANTES de escribir código de agenda** |
| **Decisión de WhatsApp** | `estetica-salon` | Enlace `wa.me` semiautomático contra API oficial de Meta. De esto depende la función que más dinero mueve de A3 (bajar el no-show de ~18% a <8%) y un argumento de folleto frente a AgendaPro. **La decide Miguel** |
| **44 funciones nuevas propuestas al catálogo + 8 reclasificaciones** | `cafeteria` 9 · `abarrotes` 10 + 2 · `ferreteria` 10 + 3 · **`estetica-salon` 15 + 3** | **Añadirlas a `03-CATALOGO-DE-FUNCIONES.md` antes de construir nada.** El catálogo pasa de 232 a **más de 280 funciones** y ya hay solapamientos que hay que consolidar en una sola pasada, no modelo por modelo |

## SEGUNDA PASADA

Pendiente. Se hace cuando los 78 estén ✅. Consiste en releer sólo `00-FICHA-Y-EJES.md` y `FILE-MAP.md` de cada uno, en orden, y volver a contestar las cuatro preguntas. Ver `02-ESTANDAR-DE-CARPETA.md` §7.

| Familia | Revisada |
|---|---|
| F1 Alimentos | ⬜ |
| F2 Retail | ⬜ |
| F3 Servicios con cita | ⬜ |
| F4 Taller | ⬜ |
| F5 Espacio | ⬜ |
| F6 Distribución | ⬜ |
| F7 Producción | ⬜ |
| F8 Profesional | ⬜ |
| F9 Especiales | ⬜ |

---

## FASE 2.3 · EL CIERRE · el rastreador y las tres puertas nuevas (21-09-2026)

Cuatro vueltas cerraron «terminadas» y la auditoría siguiente encontró cosas obvias, porque la puerta
se escribía **a partir de los fallos ya conocidos** y porque **nadie hacía clic en cada botón**. Esta
vuelta construyó la prueba que no sabe qué busca, la corrió contra producción, y de lo que encontró
salieron tres puertas que cierran la CLASE y no el caso.

| Bloque | Qué | Estado |
|---|---|---|
| **1** | Producción sirviendo el código nuevo y las cinco demos | ✅ PR #1 fusionado; `ORGANIZACION` con los seis negocios; `/api/auth/empleados` devuelve 6 negocios y 29 personas |
| **2** | El rastreador, contra producción, y arreglar lo que saque | ✅ `pruebas/e2e/rastreo.spec.ts`. **58 defectos arreglados** uno por uno (la lista completa, en el reporte 017) |
| **3** | Los dos agujeros de la puerta de rutas llamadas | ✅ plantillas visibles y segmentos dinámicos que ya no aprueban un verbo; salió ROJA y nombró las tres |
| **4** | Los seis defectos conocidos | ✅ los seis, y nueve más del mismo linaje |
| **5** | Todas las puertas verdes, con `test:integracion` corriendo | ✅ `pnpm verify` completo en **0** en la punta (`ee75b0f`): los 34 eslabones, el 31 contra una rama de Supabase |

### Las tres puertas nuevas

| Eslabón | Puerta | Qué compara | Destapó |
|---|---|---|---|
| 13 | `verify:tipos-de-pantalla` | el tipo DECLARADO contra la `conversion` del puente | **8**, dos pantallas muertas |
| 14 | `verify:enlaces` | cada `href` interno contra las pantallas que `app/` sirve | **7** 404 |
| 15 | `verify:entradas-de-comando` | lo que la pantalla PUBLICA contra lo que el comando ACEPTA | **21** |

La cadena pasa de **31 a 34 eslabones**. Las tres están en CI y las tres se validaron mutando.

### Lo que NO se arregló, y por qué

**El pedido anticipado del menú público de la cafetería.** Publicaba en un comando que exige una orden
PAGADA —«sin cobro es una reserva y las reservas no llegan», lo dice su propio código— por una ruta que
exige SESIÓN, desde el teléfono de una clienta que no tiene ninguna. Tres imposibilidades a la vez, y
la cabecera de la pantalla prometiendo «se aparta y se paga en la barra». Hace falta decidir **si se
cobra en línea o si se aceptan reservas sin prenda**, y eso no lo decide una pantalla. Mientras tanto
la pantalla REDACTA el pedido y lo copia —la regla del fiado: el sistema redacta, la persona lleva— en
vez de fingir que aparta.

**El dominio** `pos-mh-astral-systems.com` es tarea de Miguel y no un pendiente de esta fase. Lo que
esta vuelta sí arregló es que el despliegue funcione **por las dos URLs**: con `APP_URL` en el dominio
propio, toda escritura desde `morphiqpos-kappa.vercel.app` contestaba 403 y nadie podía ni entrar.
