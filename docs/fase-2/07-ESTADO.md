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

## FASE 3 · ACOPLE · conectar los cinco modelos al punto de venta vivo

Gobierna `docs/fase-2/F3-REGLAS-DE-ACOPLE.md`. La puerta es `pnpm verify:acople`, y
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
  migraciones   97 en disco = 97 en el ledger
  seguridad     RLS y grants cerrados en 162 relaciones y 15 funciones
  rutas         103 declaradas · 82 probadas por HTTP · 21 dinámicas o exceptuadas
  plantillas    3 resuelven módulos · los 6 giros de GIROS caen en una
  vocabulario   ruta + los dos envoltorios + el menú heredado · 3 pantalla(s) lo consumen

✓ Acople completo: migraciones aplicadas, seguridad cerrada, rutas vivas,
  plantillas resueltas, vocabulario consumido y aplicación respondiendo.
```

**Y `test:integracion` ya no la tapa.** Estaba ANTES de `verify:acople` en la cadena de
`pnpm verify`: exige Docker, esta máquina no lo tiene, abortaba, y el `&&` cortaba, así que la
puerta de la fase **no llegaba a correr nunca**. Ahora va detrás, y `verify:fase2` —que no la
incluía— también la lleva, para que no quede una cadena corta por la que colarse.

Lo que sale en 0 hoy: `verify:acople`, `verify:cobertura`, `verify:esquema`, `verify:rls`,
`verify:paquetes`, `verify:aspecto`, `verify:entorno`, `verify:primitivas`, `typecheck` y
**2 650 pruebas en 223 archivos**.

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
