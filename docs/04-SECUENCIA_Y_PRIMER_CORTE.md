# Secuencia de trabajo, primer corte y método de reconstrucción

> **⚠ ACTUALIZADO el 6-sep-2026 — ver `05_ACTA_DE_DECISIONES_01.md`.**
> Cambios que afectan a este documento:
> - **No hay piloto.** No existe cliente próximo de sistema; Confeti opera bien y no se toca. Donde este documento dice "Confeti como piloto 1", léase **tenant interno de prueba**, con Confeti como *validador* (su operación real es el caso de prueba del Corte 0, sin tocar su sistema).
> - **Base44 no aplica.** No hay migración ni erradicación: es construcción desde cero. El entregable F0-6 (mapa de migración, §5) **se elimina**.
> - **Todo local.** Docker, sin proveedores, sin despliegue hasta nuevo aviso.
> - **Medio tiempo, solo** (~2.25 jornadas/semana). Fase 0 recortada a ~9 jornadas ≈ 4–5 semanas; Corte 0 ≈ 7–8 semanas.
> - **Monorepo con paquetes** desde el primer commit (decisión A-01).
> El §3 (alcance del Corte 0), el §4 (método de reconstrucción) y el §7 siguen vigentes tal cual.

---

## 1. Crítica a tu orden de etapas

Tu secuencia (Etapas 0–6) es **correcta en el fondo**. Propongo cuatro cambios, cada uno con una razón concreta —como pediste—, no por gusto.

| Cambio | Tu plan | Propuesta | Razón concreta |
|---|---|---|---|
| **1** | Etapa 1 completa (repo, backend, identidad, tenancy, permisos, módulos, observabilidad, CI, erradicación) antes de tocar el POS | Etapa 1 se reduce a **lo mínimo que exige el primer corte vertical**; el resto se construye cuando el corte lo pide | Una Etapa 1 completa son meses sin nada usable (riesgo R-07). Además, infraestructura construida sin un caso de uso real que la ejercite casi siempre está mal dimensionada: se descubre al primer uso |
| **2** | Etapa 2 = "POS de mostrador sólido" (productos, precios, ventas, pagos, caja, tickets, inventario, compras, reportes) | Insertar antes un **Corte 0: esqueleto vertical**, mucho más angosto pero completo de extremo a extremo | Lo que hay que validar primero no son las funciones: es la **maquinaria** (transacción, idempotencia, tenant, permisos, pruebas, CI, respaldo). Se valida con una venta, no con veinte pantallas |
| **3** | Primer piloto implícito: el restaurante | **Confeti (pastelería) como piloto 1**, restaurante como piloto 2 | Confeti usa el paquete Esencial: superficie mínima, sin mesas, sin KDS, sin QR. Es un cliente real, con dinero real, y el menor riesgo posible para estrenar la plataforma. Estrenar con un restaurante en hora pico es la peor primera vez posible |
| **4** | El modelo genérico de orden se resolvería en Etapa 5 | Decidir el modelo `Orden/Cumplimiento` **en el Corte 0** (aunque solo se implemente una estrategia) | Riesgo R-04: es gratis hoy y carísimo con clientes en producción |

Con esos cambios, la secuencia queda así.

---

## 2. Secuencia revisada

### Etapa 0 — Fase cero (donde estamos)
Cerrar decisiones, escribir el baseline funcional, firmar ADR. **Cero código.** Alcance exacto en §5.

### Etapa 1 — Corte 0: esqueleto vertical "vender y cerrar el día"
Lo mínimo end-to-end con toda la maquinaria puesta. Detalle completo en §3.
**Criterio de salida:** una cajera de Confeti podría trabajar un día entero, aunque le falten funciones.

### Etapa 2 — Mostrador completo → **Confeti en producción**
Se ensancha el corte 0 hasta cubrir la operación real de Confeti: productos variables y por porción, categorías, modificadores, inventario con recetas, compras y proveedores, gastos, cortes con PDF, reportes básicos, importación/exportación, tema e identidad, y migración de sus datos reales con ensayo y reconciliación.
**Criterio de salida:** Confeti opera sobre Master POS. El sistema Base44 se apaga para Confeti. **Primer ingreso que financia la plataforma.**

### Etapa 3 — Restaurante completo → segundo piloto
Mesas y zonas, Mesero, Cocina/KDS por estación, comandas, modificadores y exclusiones "SIN", entrega, propinas y liquidación, precuenta, ajuste auditable de cuenta, portal QR seguro.
**Criterio de salida:** un restaurante real opera. La segunda estrategia de cumplimiento (`preparación`) valida la abstracción de la Etapa 1.

### Etapa 4 — Operación avanzada y multisucursal
Múltiples almacenes y transferencias, órdenes de compra con aprobación, mermas y producción, conteos cíclicos, costeo, conciliaciones, reportes ejecutivos, consolidación multisucursal, supervisión remota del dueño.
**Disparador:** un cliente que lo pague o dos que lo pidan. No antes.

### Etapa 5 — Nuevos giros
CRM, servicios y citas, retail avanzado, e-commerce, delivery, membresías, lealtad, empleados y turnos.
**Disparador:** el mismo. Cada giro nuevo empieza por su **perfil certificado**, no por capacidades sueltas.

### Etapa 6 — Ecosistema
Hardware, offline, escritorio, API pública, webhooks, MCP e IA, automatizaciones, herramientas de ensamblaje, catálogo de plantillas.

### Regla que gobierna todas las etapas

> **Ninguna etapa avanza sin un cliente que la financie o una necesidad de núcleo demostrada.**
> Etapas 1–3 son inversión propia justificada (Confeti y el restaurante son reales). De la 4 en adelante, el catálogo modular se mantiene como mapa de ventas, no como backlog.

---

## 3. El primer corte funcional, exacto

**Nombre:** Corte 0 — *Vender y cerrar el día.*
**Alcance:** 1 organización, 1 sucursal, 1 terminal, 3 roles, productos de precio fijo. Nada más.

### Qué incluye

**Núcleo**
- Organización, sucursal, terminal en el esquema y en **cada** consulta.
- Identidad: login de empleado con PIN hasheado en servidor, sesión `HttpOnly`, límite de intentos, enrolamiento inicial de un solo uso.
- Persona / Empleo / Rol separados de la identidad.
- Permisos por acción verificados en servidor, con pruebas negativas generadas.
- Configuración activa única por ámbito, con restricción de unicidad en base de datos.
- Política monetaria: enteros en unidad menor, moneda explícita, redondeo definido y probado.
- Folios: consecutivo atómico por sucursal y serie.
- Auditoría inmutable de acciones sensibles.
- Registry de capacidades funcionando con 3 capacidades reales.

**Capacidades**
- `catalogo`: categoría + producto de precio fijo. Sin variantes, sin modificadores, sin recetas.
- `ventas`: `createOrResumeCart` → `quoteCart` (precio e impuesto **calculados en servidor**) → `completeSale` transaccional e idempotente. Cumplimiento `inmediato`. Ticket en carta/PDF.
- `caja`: `openCashSession`, movimientos, `closeCashSession` con corte y diferencia auditada.
- `inventario` (mínimo): ledger inmutable de movimientos + saldo proyectado. Sin recetas todavía.

**Calidad — puertas de CI desde el primer commit**
- Formato, lint y tipos en **cero** errores. Sin excepciones desde el día uno; después nunca se recupera.
- Unitarias de dominio (dinero, redondeo, máquinas de estado, cotización).
- Integración contra PostgreSQL real, no mocks.
- E2E de la venta completa.
- **Concurrencia real:** dos ventas simultáneas contra el mismo stock; dos aperturas de caja simultáneas.
- **Inyección de fallos:** interrumpir el cobro a la mitad y verificar que no queda venta pagada, ni movimiento, ni folio consumido.
- **Idempotencia:** el mismo comando repetido tres veces produce un solo resultado.
- **Aislamiento:** organización A no ve nada de B, en todos los comandos y consultas.
- **Escaneo de residuos** de la plataforma origen (pasa trivialmente en repo nuevo — el objetivo es instalar la puerta desde el inicio).
- Auditoría de dependencias sin vulnerabilidades altas explotables.

**Operación**
- Migraciones versionadas, aplicadas por CI.
- `correlation_id` e `idempotency_key` en cada comando; logs estructurados.
- Respaldo automático + **una restauración ensayada de verdad**, documentada en un runbook.
- Despliegue reproducible desde un clon limpio.

### Qué NO incluye (y hay que decirlo en voz alta)

Mesas, mesero, cocina, QR, recetas, compras, proveedores, gastos, productos variables, modificadores, clientes, propinas, devoluciones, descuentos, multisucursal, offline, hardware, reportes avanzados.

**Todo eso llega en las Etapas 2 y 3.** La tentación de meter "solo una cosita más" en el Corte 0 es exactamente cómo un corte de semanas se vuelve de meses.

### Criterios de salida del Corte 0

1. Un empleado inicia sesión, vende, cobra en efectivo, imprime ticket y cierra caja.
2. Los totales del corte cuadran con el ledger, sin excepción, en 200 ventas sintéticas.
3. Las 12 pruebas de regresión del corte están verdes.
4. Concurrencia, fallo e idempotencia demostradas con pruebas que fallan si quitas la transacción.
5. Aislamiento probado con dos organizaciones sembradas.
6. Un entorno nuevo se levanta desde cero: clonar → instalar → migrar → sembrar → probar → construir → desplegar.
7. Restauración de respaldo ejecutada al menos una vez, con evidencia.
8. Lint y tipos en cero.

**Si un solo criterio falla, el corte no está terminado.** Aunque la pantalla se vea bien. Es literalmente tu principio no negociable ("no se declaran funciones terminadas si solo existe la interfaz") convertido en lista verificable.

---

## 4. Cómo reconstruir el POS de restaurante sin copiar sus defectos

Respondo a tu punto 8. Este es el método, flujo por flujo.

### El principio

> **El ZIP se lee, no se copia.** Se abre en una ventana al lado como referencia de comportamiento. Ningún archivo se arrastra al repositorio nuevo.

Única excepción a evaluar: primitivas visuales de `src/components/ui/*` (shadcn/ui), que son neutrales respecto al proveedor y no contienen lógica de negocio. Se revisan una por una y se adoptan solo si están limpias.

### El procedimiento, por flujo

**Paso 1 — Ficha de flujo.** Para cada flujo (abrir mesa, enviar comanda, cobrar cuenta mixta, hacer corte…) se escribe un documento en `docs/baseline/` con:

```
FLUJO: cobrar cuenta de mesa con pago mixto y propina
  Actores y permisos
  Precondiciones
  Given / When / Then (varios escenarios, incluidos los de error)
  Invariantes que deben mantenerse
  Máquina de estados afectada
  Datos de entrada y salida
  Efectos: stock, caja, comanda, mesa, auditoría, eventos
  Clasificación: CONSERVAR | CORREGIR | RETIRAR | PENDIENTE
  Evidencia: archivo y líneas del ZIP, campo del esquema, o "sin evidencia"
```

**Paso 2 — Clasificar cada comportamiento observado.** Los cuatro cubos, con ejemplos reales de este sistema:

| Clasificación | Significa | Ejemplos confirmados |
|---|---|---|
| **CONSERVAR** | Regla de negocio válida y aprendida. Se reimplementa igual | Propina separada por método · productos por medida y porción · estaciones de preparación · exclusiones "SIN" · precuenta que no marca la venta como pagada · corte con diferencia |
| **CORREGIR** | El comportamiento visible se conserva, el mecanismo cambia | Cobro (ahora transaccional) · envío de comanda (ahora idempotente) · apertura de mesa (ahora con unicidad) · precio variable (ahora recalculado en servidor) · pedido QR (ahora sin carrera) |
| **RETIRAR** | No debe existir en la base nueva | Detalles "shadow" no persistidos · PIN comparado en el navegador · usuario completo en `sessionStorage` · admin por defecto con PIN embebido · `catch(() => {})` · `list()[0]` para configuración · `document.write` en impresión · `Barra.jsx` sin ruta · redirects legados |
| **PENDIENTE** | No hay evidencia suficiente; requiere tu decisión | Detalle exacto de ajustes de cuenta · equivalencias exactas de impresión entre borrador y En vivo · alcance real del módulo `Cliente` · qué contiene realmente la versión En vivo |

**Paso 3 — Escribir las pruebas antes que el código.** Cada CONSERVAR genera una prueba de conservación. Cada CORREGIR genera una prueba de corrección **que falla contra el comportamiento viejo y pasa contra el nuevo**. Cada RETIRAR genera, cuando aplica, una prueba negativa (ej.: "un total nunca puede incluir una línea no persistida").

**Paso 4 — Implementar sobre contratos propios.** El caso de uso primero, la UI después. La UI puede parecerse mucho a la actual —ese trabajo visual es valioso y hay que aprovecharlo— pero cableada a los casos de uso nuevos y sin una sola llamada a datos.

**Paso 5 — Verificar contra la realidad.** El flujo se prueba con el mismo escenario que lo originó en el negocio real, no solo con datos sintéticos.

### Resolución de la contradicción C-03

La matriz de 56 escenarios se parte en dos, con nombres distintos:

- **`docs/baseline/conservacion.md`** — comportamiento actual válido. Responde: *¿perdí una función?*
- **`docs/baseline/correccion.md`** — comportamiento nuevo obligatorio. Responde: *¿copié un defecto?*

Ambas corren en CI. Fallan por razones distintas y se leen distinto. Hoy están mezcladas y por eso ninguna de las dos preguntas se puede contestar.

### Las decisiones que necesito de ti para el baseline

Estas están marcadas PENDIENTE y no se pueden resolver leyendo código, porque el código está en tres versiones divergentes:

1. **Ajustes de cuenta:** ¿qué puede modificar un cajero antes de cobrar (quitar líneas, cambiar cantidades, cambiar precio, aplicar descuento)? ¿Requiere autorización de un superior? ¿A partir de qué monto?
2. **Impresión:** ¿carta, 80 mm, 58 mm o combinación en v1? El historial muestra migración hacia carta/iframe y corte en A4.
3. **Exclusiones "SIN":** confirmado que se capturan y muestran. ¿Deben además **no descontar** el ingrediente del inventario? El esquema dice que era el "PASO B" planeado. ¿Se implementa en Master POS?
4. **Módulo Cliente:** existe la entidad, no la pantalla. ¿Qué debía hacer?
5. **Diferencias borrador vs. En vivo:** ¿qué comportamiento es el "bueno" cuando difieren? Tú operaste ambos; es información que solo tú tienes.

---

## 5. Alcance exacto de la Fase 0 (respuesta a tu punto 6)

Fase 0 **no** incluye escribir código. Incluye siete entregables, con este orden y esta estimación de esfuerzo (en jornadas de trabajo efectivo, no en calendario — el calendario depende de tu disponibilidad, que es la pregunta Q-03).

| # | Entregable | Contenido | Esfuerzo |
|---|---|---|---|
| **F0-1** | Custodia verificada | Hash del ZIP confirmado, paquete respaldado, repositorio de planeación creado, fuentes marcadas solo lectura | 0.5 j |
| **F0-2** | Decisiones de producto | Modelo de distribución (C-01), piloto 1 y 2, giros objetivo, país/moneda/fiscalidad, nivel de offline, hardware de v1, capacidades de v1 aprobadas/pospuestas/rechazadas | 1–2 j (conversación + acta) |
| **F0-3** | ADR de arquitectura | Stack con 2–3 alternativas evaluadas, base de datos, identidad, storage, despliegue, tenancy, modelo `Orden/Cumplimiento`, registry, offline futuro. Cada uno con consecuencias y salida de reversa | 3–4 j |
| **F0-4** | **Baseline funcional v0** | Fichas Given/When/Then de todos los flujos actuales, clasificados CONSERVAR/CORREGIR/RETIRAR/PENDIENTE, con invariantes, estados y permisos. **Es el entregable más grande de la fase** | **10–15 j** |
| **F0-5** | Matrices de conservación y corrección | La matriz actual partida en dos y ampliada desde F0-4, con datos sintéticos definidos | 3 j |
| **F0-6** | Mapa de migración de datos | Entidad→entidad, campo→campo, enum→enum, regla para las 7 configuraciones, reconciliación, dry-run, qué datos demo se excluyen | 3–4 j |
| **F0-7** | Backlog del Corte 0 + go/no-go | Tareas pequeñas con criterios de aceptación, pruebas y rollback; estrategia de ramas y releases; autorización explícita | 2 j |

**Total: ~23–31 jornadas de trabajo efectivo.**

Es mucho, y quiero ser honesto sobre por qué: F0-4 es el 50 % de la fase, y es la parte que la gente siempre quiere saltarse. Sin baseline, "reconstruir sin perder funciones" es imposible de verificar — solo se descubre lo que falta cuando el cliente lo reclama en producción.

**Atajo legítimo si la disponibilidad es limitada:** hacer F0-4 **por corte**, no completo de entrada. Escribir el baseline del mostrador (Corte 0 + Etapa 2) ahora —unas 4–5 jornadas— y el del restaurante justo antes de la Etapa 3. Se pierde visión de conjunto, se gana arranque. Es un intercambio aceptable y lo recomiendo si trabajas solo. Lo que **no** es aceptable es empezar a programar sin el baseline del corte que estás construyendo.

---

## 6. Cómo se abre un giro nuevo (respuesta a tu punto 9)

El procedimiento, una vez que la plataforma existe:

1. **Cliente real primero.** Ningún giro se abre en abstracto. Se abre porque alguien paga.
2. **Mapear su operación** contra las capacidades existentes. Normalmente el 60–80 % ya está: catálogo, ventas, pagos, caja, inventario, clientes, reportes y permisos son transversales.
3. **Identificar el hueco real.** Para servicios suele ser solo agenda + recursos + comisiones. Para retail, variantes + códigos de barras + lotes.
4. **Diseñar el hueco como capacidad**, con su ficha de 12 declaraciones y sus contratos.
5. **Construirlo con el cliente como piloto**, cobrando el desarrollo.
6. **Certificar un perfil de giro** con su matriz de regresión.
7. **A partir del segundo cliente del giro, el margen sube**, porque ya solo es configuración.

El giro número 1 de cada vertical cuesta caro y lo paga el cliente. El giro número 5 casi no cuesta. **Ese es el modelo de negocio de Master POS**, y explica por qué vale la pena la disciplina de contratos: sin ella, el cliente 5 cuesta lo mismo que el 1 y no hay negocio.

---

## 7. Cómo evitar que la ambición destruya la calidad (respuesta a tu punto 13)

Seis mecanismos concretos, no consejos:

1. **Definición de terminado escrita y verificada por CI.** Ya la tienes en `CRITERIOS_DE_TERMINADO.md`; hay que volverla puertas automáticas. Lo que no bloquea el merge, no se cumple.
2. **Regla de admisión al roadmap.** Ninguna capacidad entra si no la paga un cliente o es núcleo. El catálogo de 150 se queda como mapa comercial.
3. **Un corte a la vez.** Nada de dos frentes en paralelo con un equipo pequeño. Se termina y se entrega antes de abrir el siguiente.
4. **Todo corte debe ser entregable.** Si no se le puede dar a un cliente, es demasiado grande. Pártelo.
5. **Congelar el sistema viejo.** Solo correcciones que impidan operar (riesgo R-01). Sin esto nada de lo demás importa.
6. **Revisión mensual de deriva.** Media hora contra las siete señales de alarma de `01_MODELO_MASTER_POS.md` §4 y `ARQUITECTURA_OBJETIVO_REQUISITOS.md`. Si aparecen dos, se para y se corrige antes de seguir. La deuda arquitectónica compuesta es la que mata plataformas, y siempre avisa antes.
