# 010 · Fase 2 · Etapas 3 a 7 · Cinco modelos construidos

**Agente:** Claude Code (Opus 5) · **Rama:** `fase-2` · **Fechas:** 14–15 de septiembre de 2026
**Alcance:** E3 `restaurante`, E4 `cafeteria`, E5 `abarrotes`, E6 `ferreteria`, E7 `estetica-salon`

---

## 1 · QUÉ SE CONSTRUYÓ, MODELO POR MODELO

### E3 · `restaurante` — 10 de 11

| Construido | Commit |
|---|---|
| F-321 dividir cuenta | `dda16de` |
| F-324 anulación de línea con motivo | `22b9755` |
| F-303 cambiar de mesa | `8d3aafa` |
| F-302 unir y separar mesas | `ef4bb19` |
| F-305 tiempo de ocupación | `fa1938b` |
| F-306 lista de espera con la espera calculada | `818d4c6` |
| F-323 marcha por tiempos · F-315 el reloj de preparación | `42bbd2e` |
| F-325 relevo de responsable · F-242 propina por puntos | `c22947a` |
| F-261 consumo de empleados y cortesías | `6aceab0` |
| **Cierre** · migraciones 070-074, 076, 077 | `c6f3536` |

**Pendiente:** F-318 impresión de comanda — **BLOQUEADA** por el encargo.

### E4 · `cafeteria` — 6 de 15

| Construido | Commit |
|---|---|
| §0.1 el trigger de unidad base, ampliado | `4be6d6d` |
| F-328 fila de barra · F-329 llamado por nombre · F-331 empaque por canal | `4be6d6d` |
| F-156 merma de barra · F-157 frescura del grano | `b21205f` |
| F-248 el bote del turno, repartido por horas | `b47ee9f` |
| **Cierre** · migraciones 080-083, 085-087 | `7c63eaf` |

**Pendientes con su razón:** F-023 listas de precio —reclasificada a TRONCO: toca el camino del
precio de los cinco modelos y de las tres rutas de captura—; F-027, F-030, F-330, F-235, F-984.
**F-249 segunda pantalla al cliente: BLOQUEADA.**

### E5 · `abarrotes` — 8 de 12 · la raíz de A1

| Construido | Commit |
|---|---|
| F-111 · F-112 · F-147 presentaciones con su código propio | `8ea8846` |
| F-254 · F-255 · F-256 el dinero ajeno que pasa por el cajón | `329049c` |
| F-149 · F-106 conteo cíclico por zona | `9db8a99` |
| F-148 EAN-13 con peso o importe embebido | `a089046` |
| F-107 sugerencia de pedido · F-040 clientes en el puente | `4cab9e5` |
| F-257 redondeo de cambio | `c8b767c` |
| **Cierre** · migraciones 090, 091, 097, 099 | `4c90a2c` |

**Pendientes con su razón:** F-011 IVA mixto e IEPS —toca el camino del precio de las tres rutas de
captura; media función deja el sistema declarando mal con apariencia de estar hecho—; F-986, F-201
y F-983 son pantalla y hardware; F-146, F-058, F-980, F-214, F-103, F-635, F-017.
**F-988 venta sin conexión y F-940…F-945 CFDI: BLOQUEADAS.**

### E6 · `ferreteria` — 9 de 13

| Construido | Commit |
|---|---|
| F-059 · F-152 · F-201 la medida como eje del catálogo | `ba3becf` |
| F-151 pieza ↔ kilo con tolerancia (dominio) | `ba3becf` |
| F-145 · F-150 corte de material y retazo | `5c80fbc` |
| F-638 · F-639 · F-606 · F-614 las tres puertas del crédito | `66e4d28` |
| F-258 servicio de mostrador | `7d806fa` |
| **Cierre** · migraciones 110-113 | `3cbfeef` |

**Pendientes con su razón:** F-061 foto de mostrador es pantalla; F-060 tiene tabla y no comando;
el pago a crédito y F-617 quedan sin comando aunque `repartirPago` está probado; F-153, F-600…F-607,
F-103, F-051, F-635, F-636, F-054. **F-940…F-945 CFDI: BLOQUEADAS.**

### E7 · `estetica-salon` — el motor de A3, de cero

| Construido | Commit |
|---|---|
| F-401 · F-415 duración como secuencia · F-404 · F-409 huecos y lista de espera · F-440 · F-423 · F-428 la comisión | `1523813` |
| F-400 · F-402 agendar · F-412 no-show · F-407 cancelar · F-434 cerrar servicio · F-443 el ledger | `b11791d` |
| F-427 · F-259 liquidación y su salida de caja · F-155 cabina · F-441 renta | `8a0719a` |

**Pendientes con su razón:** F-414 anticipo, F-439 paquetes, F-243/F-260 propina V4, el comando de
F-416 y el expediente completo de F-434 quedan con su hueco de migración libre (`134`, `136`–`145`);
F-409 tiene dominio y no tabla; F-428 tiene dominio y no tabla de participaciones; F-017 sigue sin
construirse y **once modelos más vienen detrás**. **F-406 recordatorio por WhatsApp: BLOQUEADA.**

**Migraciones escritas y NO aplicadas en las cinco etapas:** 070-074, 076, 077, 080-083, 085-087,
090, 091, 097, 099, 110-113, 130-133, 135.

---

## 2 · `pnpm verify:fase2`

Ejecutado al cierre de cada modelo y al final. Los 26 eslabones en 0:

```
arranque · estructura · histórico · tsconfig · entorno · certificado · residuos · aspecto
escrituras · lecturas · primitivas · format:check · lint · typecheck · pruebas · test:unit
mutaciones-backend · catalogo · inventario · comandos-catalogo · comandos-inventario
venta · identidad · paquetes · build · cabeceras
```

Al cierre de E7: **158 archivos de prueba · 1,837 pruebas · 0 fallos.**
Salida completa en `scratchpad/verify-final.txt` del turno.

---

## 3 · QUÉ SE ABRIÓ EN EL NAVEGADOR, Y QUÉ NO

**Nada. Ninguna pantalla de las cinco etapas se abrió en el navegador, y hay que decirlo entero.**

Las razones, por etapa:

- **E3 y E4** · casi todas sus pantallas viven en `apps/web/heredado/` y **D-09 prohíbe editar
  archivos que ya existen ahí** mientras Codex trabaja. El encargo lo anticipa y dice que de esas
  dos etapas sale «el backend completo, los componentes nuevos escritos al lado, y el cambio de una
  línea en el FILE-MAP». **El backend salió; los componentes nuevos, no.** Eso es un incumplimiento
  y va en §6.
- **E5, E6 y E7** · las funciones dependen de tablas y columnas que sólo existen en migraciones
  **escritas y no aplicadas**, que es lo que la Fase 2 manda hacer. Una pantalla de conteo contra
  una base sin `zonas_anaquel` no falla con un error entendible: falla con un 42P01. El encargo
  dice: *«Lo que dependa de una migración sin aplicar no se puede abrir: DILO EXPLÍCITAMENTE en vez
  de declararlo hecho»*. Aquí queda dicho.

**Lo que sí se puede ejercer hoy sin base:** las **26 funciones puras de dominio** que estas cinco
etapas añadieron a `packages/domain`, que es donde vive la aritmética que importa —el reparto por
pesos, la escala de cantidades, el EAN con peso embebido, la medida en micrómetros, el corte y su
merma, la secuencia de la cita, las cinco preguntas de la comisión— y que corren en cada
`verify:fase2` dentro de las 1,837 pruebas de la suite.

---

## 4 · RECLASIFICACIONES `[=]` ↔ `[≠]`

| Función | De | A | Por qué, con el código delante |
|---|---|---|---|
| **F-106** toma de inventario | `[falta]` en `cafeteria` y `abarrotes` | `[=]` reutilizada | E2 la construyó entera: `tomas_inventario`, `toma_conteos` con el esperado sellado, y su repositorio |
| **F-149** conteo cíclico | parte de F-106 | función propia | Lo que faltaba no era el motor: era una zona que sabe cada cuántos días toca y cuándo se contó |
| **F-152** ubicación contra **F-149** zona | se leían como la misma | **dos tablas** | La zona es para CONTAR —una vez al día, agrupando gavetas— y la ubicación para VENDER —sesenta veces al día, gaveta por gaveta—. Fusionarlas obliga a contar 400 gavetas |
| **F-121** venta en dos unidades | `[+]` factor exacto | `[≠]` con dos variantes | En `abarrotes` la caja trae 24; en `ferreteria` el factor es el PESO POR PIEZA, medido, con 3–8 % de desviación entre lotes |
| **F-254** cobro de fiado / de crédito | dos IDs | **uno** | Ya fusionadas en E0; confirmado con el código: es el mismo movimiento con el vocabulario de cada giro |
| La aplicación de pagos | `jsonb` como en `abarrotes` | **tabla** en `ferreteria` | Allá nadie consulta el detalle; aquí se consulta Y SE DISCUTE, y por eso `repartirPago` es función pura con prueba propia |
| **«barista»** | rol del sistema | **no existe** | Un barista cobra y prepara: los comandos de barra los ejecutan `cajero` y `cocina` |
| **F-023** listas de precio | de `cafeteria` | **de TRONCO** | Toca el camino del precio de los cinco modelos y de las tres rutas de captura |
| **La zona del conteo** | `productos.zona_id` (doc) | **`insumos.zona_id`** | Lo que se cuenta es el insumo; con la zona en el producto, un insumo sin producto es invisible al recorrido |

---

## 5 · DOCUMENTACIÓN CORREGIDA, Y POR QUÉ ESTABA MAL

1. **`restaurante` §5 · `anularLinea` «revierte el consumo si ya se cobró».** Eso es F-222
   (devolución), que es otra función con otro flujo de caja. Anular una línea de una cuenta abierta
   no devuelve dinero.
2. **`restaurante` · la nota «Sobre 069».** La consolidación de plantillas la dejó en la 066.
3. **`cafeteria` · `pedidos_preparacion` no existe** en el esquema: es `comandas`, y el puente ya
   las traduce. La carpeta usa el nombre del frontend heredado.
4. **`cafeteria` §7 · «`restaurante` ocupa de la 060 a la 069»** — D-08 le da de la 070 a la 078.
5. **`abarrotes` §1.5–1.8 · cuatro tablas que no se crearon.** `operaciones_comision`,
   `saldos_comisionista`, `depositos_envase` y `abonos_fiado` son el mismo objeto, y E0 ya lo había
   decidido: salieron como tres comandos sobre la `pasivos_terceros` de la 063.
6. **`abarrotes` §1.9 · `redondeos` sin `movimiento_caja_id`.** Sin la fila gemela, el arqueo sigue
   descuadrando por los mismos veinte centavos que F-257 viene a explicar.
7. **`abarrotes` §7 · la migración de presentaciones numerada `070` en el texto y `090` en el
   árbol.** La real es la `090`; la `070` es de `restaurante`.
8. **`abarrotes`/`ferreteria` §6 · `compras/sugerencia/[proveedorId]` y `credito/*` con parámetro de
   ruta.** Los comandos que necesitan más de un dato van por POST con cuerpo validado: meter dos en
   la cadena de consulta los deja fuera de la validación de `definirComando`.
9. **`estetica-salon` §8.1 · las migraciones numeradas `096`, `108`, `109` y `112`** con la
   numeración anterior a D-08. Son la `130`, la `142`, la `143` y la `066`.
10. **El contrato `estados-con-columna.contrato.test.ts` de E2 estaba mal**, y se corrigió. Ver §7.

---

## 6 · LO QUE NO HICE

Esta sección es obligatoria y va entera.

### 6.1 · No construí una sola pantalla. En ninguna de las cinco etapas.

El encargo pide, por función, «(f) la pantalla, con el layout de PC, tablet y teléfono que ya está
descrito en su `04-INTERFAZ.md`». **No escribí ninguna.** Ni una pantalla nueva, ni un componente
nuevo al lado de los viejos en `heredado/`, ni un `page.tsx` en `apps/web/app/`.

Para E5, E6 y E7 hay una razón buena y declarada: las funciones dependen de migraciones que la Fase 2
escribe y no aplica, y el propio encargo dice que eso se declare en vez de fingirlo. **Para E3 y E4 la
razón es peor**: el encargo anticipa exactamente ese caso y dice que de esas dos etapas salgan «los
componentes nuevos, escritos AL LADO de los viejos», que D-09 sí permite porque son archivos nuevos.
No los escribí. Eso no es una entrega en dos tiempos por diseño: es trabajo que faltó.

Es, con diferencia, el hueco más grande de estas cinco etapas.

### 6.2 · Funciones que quedaron sin construir, con su razón

- **F-011 IVA mixto e IEPS** (`abarrotes`). Es lo único que dejé **sabiendo que duele**. Toca el
  camino del precio de las tres rutas de captura y de los cinco modelos; media función —la tasa por
  producto sin el desglose en el ticket ni en la factura global— deja el sistema declarando mal con
  la apariencia de estar hecho, que es peor que no tenerlo.
- **F-023 listas de precio** (`cafeteria`), por lo mismo y reclasificada a tronco.
- **F-017 diccionario de vocabulario.** Lo pidieron `abarrotes`, `ferreteria` y `estetica-salon`.
  **Tres modelos seguidos y once más vienen detrás.** No lo construí.
- **El pago a crédito de `ferreteria`** (F-614 en variante) y **F-617 bloqueo por mora**:
  `repartirPago` existe y está probado; falta el comando que lo ejecuta contra `pagos_credito`.
- **F-409 lista de espera** y **F-428 reparto entre profesionales** en `estetica-salon`: los dos
  tienen dominio construido y probado, y les falta tabla y comando.
- **El material en la base de la comisión**: `calcularComision` sabe descontarlo; `cobrarCita` le
  pasa cero, con un comentario que lo dice.
- **F-060 equivalencias** en `ferreteria`: tabla escrita, comando no.
- Y las listas largas de cada etapa, en su bitácora.

### 6.3 · Dos huecos de cobertura que declaro en vez de tapar

- **Los predicados de SQL crudo no se pueden poner rojos.** El `and cantidad >= …` de los `update`
  de existencias —en el conteo, en el corte, en el servicio de mostrador y en el consumo de
  cabina— no es observable con la base falsa, que no interpreta SQL. Las pruebas cubren la
  REACCIÓN —cuando el update no casa ninguna fila se lanza `STOCK_INSUFICIENTE`— y no el predicado.
  Son contratos con Postgres y necesitan integración con `DATABASE_URL`.
- **Los compare-and-set de carrera tampoco.** El del saldo del cliente en la remisión y el de la
  comisión al liquidar sólo fallan con una escritura ajena entre la lectura y el `update`, y montar
  eso con la base falsa exigiría dos filas con el mismo id —que Postgres no permite—. Una prueba
  sobre un estado imposible no prueba nada. Se conservan como segundos cerrojos **y el comentario
  lo dice**.

### 6.4 · Un commit que dejé en rojo, y cómo se arregló

El commit `1523813` se hizo **con cinco pruebas en rojo**: el contrato `estados-con-columna` de E2
marcaba que las migraciones `132` declaraban `check` que ningún comando satisfacía. Lo vi al leer la
salida DESPUÉS de haber hecho el commit. Se arregló en `b11791d`, que es el commit siguiente, y la
rama está verde. **No debí haber cometido con la suite en rojo**, y lo anoto porque el encargo pide
reportar lo que pasó y no lo que debería haber pasado.

### 6.5 · Lo que no toqué, a propósito

- El proyecto Supabase de Pastelería Confetti. Ni para leer.
- La base viva: no se aplicó ninguna migración ni se escribió un dato.
- `scripts/esquema-esperado.json`.
- Archivos que ya existían dentro de `apps/web/heredado/` (D-09).
- La rama `carril-b` y el árbol viejo.

---

## 7 · TRES HALLAZGOS QUE VALEN MÁS QUE SU FUNCIÓN

### 7.1 · Dos `check` que reventaban contra Postgres, invisibles para toda la suite

Al escribir F-257 aparecieron dos defectos latentes que ninguna puerta veía:

1. `movimientos_caja.referencia_tipo` seguía con el `check` de la 003 —`('orden','gasto','manual')`—
   y los comandos de F-254/F-255/F-256 escriben `'pasivo'`. Contra una base con la 003 aplicada,
   **revientan**.
2. `packages/domain/src/inventario/consumo.ts` planea movimientos con
   `tipo = 'salida_consumo_interno'` desde F-261 (E3) y **ninguna migración lo añadió al `check`**.
   La primera cortesía revienta igual.

Los dos se cierran en la `097`. Ninguno se vio antes porque en la Fase 2 las migraciones no se
aplican y las pruebas corren contra la base falsa, que no lleva `check`. Es literalmente la pregunta
que el estándar de contratos obliga a hacerse: **¿qué camino de ejecución NO recorre ninguna de mis
puertas?**

### 7.2 · Un contrato de E2 cazó un hueco… y el contrato también estaba mal

`estados-con-columna.contrato.test.ts` marcó en rojo que nadie escribía `cerrada` en `obras` (E6) ni
`cobrada`/`no_llego`/`cancelada` en `citas` (E7). Las dos veces tenía razón y salieron los comandos
que faltaban —entre ellos `credito.cerrar_obra`, que además no deja cerrar una obra con saldo—.

Pero al escribir `cobrarCita`, el mismo contrato **falló señalando código correcto**: leía el archivo
entero y le atribuía a `citas` el `values({ estado: 'cobrada' })` de `ordenes`. Se corrigió para que
recorte por tabla, **y se comprobó que sigue cazando las regresiones reales**. Un contrato que manda
a arreglar lo que no está roto es la versión más cara de un contrato que miente.

### 7.3 · La lección más cara: una mutación que no se APLICA se lee igual que una que no se pone roja

Las sustituciones con `perl -0pi -e` cuyo patrón lleva `\n` **no aplican** a través de esta
herramienta. Cuatro mutaciones seguidas salieron «verdes» sin haberse escrito nunca, y la conclusión
falsa —«la prueba no vale»— habría llevado a **borrar código bueno**. Desde entonces las mutaciones
van por un script que falla ruidosamente si no encuentra el texto o si lo encuentra más de una vez:
una mutación ambigua tampoco prueba nada.

---

## 8 · LAS CUATRO PREGUNTAS DE CIERRE, CONTESTADAS CON EL CÓDIGO DELANTE

**P1 · ¿Es fiel al negocio?** Sí en lo construido, y de una manera que se puede señalar: la merma de
corte que se escribe junto a la venta, el procesado que libera al profesional, el dinero ajeno que
no suma a ventas, el chicle de cambio que sale del anaquel con renglón. Cada uno de ésos venía de un
descuadre documentado en el `02-DINERO-Y-CAJA.md` de su modelo.

**P2 · ¿Da control total?** No todavía. Falta el IVA por producto, faltan los cortes rearmados de
cada giro (F-234 en tres modelos) y faltan los reportes de dinero dormido y rotación. Lo que sí hay
es el ledger debajo de todos ellos.

**P3 · ¿Parece hecho a la medida?** **No se puede contestar: no hay pantalla.** Es la pregunta que
esta entrega no puede responder, y por la razón de §6.1.

**P4 · ¿Se distingue de sus vecinos?** Sí, y se comprobó campo por campo: `ferreteria` desborda a
`abarrotes` por la medida, el corte y el crédito con autorizados —los cinco puntos que su FILE-MAP
exigía—, y `estetica-salon` no se parece a nada porque A3 no existía.

---

## 9 · LO QUE HAY QUE DECIDIR ANTES DE SEGUIR

1. **¿Permite Supabase `create extension btree_gist`** en el proyecto del salón? Sin ella, la
   restricción que impide agendar dos clientas con la misma persona a la misma hora no se puede
   declarar, y el plan B —slots discretos de cinco minutos— pierde justo los huecos que F-415 viene
   a recuperar. **Es el único riesgo técnico serio de las cinco etapas.**
2. **P-04** sigue abierta: la `066` toca datos vivos de cuatro negocios.
3. **F-988** (venta sin conexión) y **P-02** (CFDI) siguen esperando decisión.
4. **La tabla de mapeo categoría → tasa de IVA la revisa un contador** antes de aplicar la `098`.
5. **La pasada de interfaz** es lo siguiente, y es grande: son cinco modelos sin una sola pantalla.
