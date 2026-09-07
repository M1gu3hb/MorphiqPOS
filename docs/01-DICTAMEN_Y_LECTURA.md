# Dictamen de lectura — Fase 0 Master POS

Fecha: 6 de septiembre de 2026
Estado: **planeación. Cero código escrito. Cero cambios en sistemas remotos.**

---

## 1. Confirmación de lectura

Leí completo el paquete `POSMH_FASE_0_CLOUD_COWORK_2026-09-06` en el orden indicado:

| Bloque | Archivos leídos |
|---|---|
| Inicio | `LEEME_PRIMERO`, `REGLAS_NO_NEGOCIABLES`, `CONTEXTO_Y_VISION`, `PROMPT_MAESTRO` |
| Auditoría | `AUDITORIA_EJECUTIVA`, `DIFERENCIAS_CONFIRMADAS`, `ERRORES_Y_RIESGOS_CONFIRMADOS`, `security_best_practices_report`, `LIMITACIONES_Y_NIVEL_DE_CERTEZA` |
| Mapas | `INVENTARIO_FUNCIONAL_ACTUAL`, `MAPA_ENTIDADES_Y_DATOS`, `CATALOGO_MODULAR_INICIAL`, `MAPA_DEPENDENCIAS_PLATAFORMA` |
| Plan | `PLAN_MAESTRO_FASE_0`, `ARQUITECTURA_OBJETIVO_REQUISITOS`, `PLAN_ERRADICACION_PLATAFORMA_ORIGEN`, `MATRIZ_REGRESION_BASELINE`, `DECISIONES_PENDIENTES`, `CRITERIOS_DE_TERMINADO` |
| Evidencias | `VALIDACION_TECNICA`, `INTEGRIDAD_FUENTE`, `MANIFEST.json`, `esquemas_plataforma_actual_snapshot.json`, `diff_esquemas_profundo.json`, `configuraciones_actuales_sanitizadas.json`, `inventario_acoplamiento_por_archivo.tsv` |

El ZIP original **no fue abierto, extraído ni modificado**. Se trató como evidencia inmutable.

### Verificación de integridad: pendiente, con causa

No pude calcular el SHA-256 del ZIP en esta sesión: el entorno Linux del espacio de trabajo no arrancó (`VM service not running`). El `MANIFEST.json` declara el hash esperado y coincide con lo que afirman `INTEGRIDAD_FUENTE.md`, `AUDITORIA_EJECUTIVA.md` y el prompt maestro — es decir, las tres fuentes internas son consistentes entre sí, pero **eso no es una verificación independiente**.

**Acción requerida antes de cualquier trabajo posterior** (30 segundos, en tu PowerShell):

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath "D:\MIS PROYECTOS\Master POS\POSMH_FASE_0_CLOUD_COWORK_2026-09-06\POSMH_FASE_0_CLOUD_COWORK_2026-09-06\01_FUENTES_ORIGINALES\pos-mh completo.zip"
```

Debe devolver `1BF6FC7C26E460B7FE763E80074716BA7FA231B999870CB0EF6174102B72BFF3`.

Marco esto como **bloqueo formal Fase 0.1**, no como trámite: si el hash no coincide, toda la auditoría queda en duda.

### Por qué escribí esta respuesta fuera del paquete

`MANIFEST.json` declara `file_count: 34` con hash por archivo. Escribir dentro del paquete lo invalidaría y rompería la regla no negociable #2. Por eso esta respuesta vive en `D:\MIS PROYECTOS\Master POS\00_RESPUESTA_COWORK_FASE_0\`, como capa nueva sobre evidencia congelada.

---

## 2. Mi interpretación de la visión

### En una frase

Master POS no es un producto que vendes. Es **la fábrica con la que fabricas los productos que vendes**, y su primer producto terminado resulta ser un POS de restaurante.

### En cuatro afirmaciones

1. **El activo no es el POS. Es la biblioteca de capacidades probadas.** Un POS de restaurante ya lo tienes; te tomó meses y funciona. Lo que no tienes es la capacidad de decirle *sí* al siguiente cliente sin volver a gastar esos meses. Master POS es la inversión que convierte "meses por cliente" en "días por cliente".

2. **Tu diferenciador comercial es una restricción técnica.** Prometer "el sistema se adapta al negocio" significa que la personalización debe ser barata **para ti**. Si personalizar cuesta un fork del código, la promesa es insostenible con un equipo pequeño: te vuelves rehén de N sistemas distintos. Toda la arquitectura de Master POS existe para hacer que adaptar sea barato sin fragmentar.

3. **El ZIP no es la base. Es el acta de un descubrimiento.** Lo valioso ahí no es el código —está acoplado, sin transacciones y con autenticación en el navegador— sino el **conocimiento de operación** que solo se obtiene construyendo: qué necesita un mesero a las 9 de la noche, cómo se cobra una cuenta mixta con propina, qué pasa cuando la cocina recibe un pedido huérfano. Eso vale más que las 244 líneas de `src/`.

4. **Base44 no fue un error. Fue el prototipo que te enseñó qué construir.** Descartarlo no es tirar trabajo; es graduarse. Pero el precio de la graduación es real: 359 operaciones directas en 68 archivos significa que no hay migración incremental posible. Es reimplementación, con el viejo como especificación viva.

### Lo que la visión implica y no está escrito

- **Master POS será tu producto más caro y el único que nadie te paga directamente.** Todo lo que construyas ahí lo financian los proyectos de cliente. Eso obliga a una regla de negocio, no técnica: *ninguna capacidad entra a Master POS si no la está pagando un cliente real o es infraestructura del núcleo.* Sin esa regla, el catálogo de ~150 capacidades se convierte en el "monstruo" que tú mismo temes.
- **Los cuatro roles que le asignas a Master POS entran en conflicto.** Producto estable, laboratorio inestable, demo llena de datos y catálogo de ventas pulido son requisitos opuestos. Se resuelven (ver `01_MODELO_MASTER_POS.md`), pero hay que resolverlos a propósito, no por accidente.

---

## 3. Riesgos y contradicciones que observo

Separo tres cosas: lo que la auditoría ya detectó y suscribo, lo que la auditoría **no** detectó, y las contradicciones internas del propio material.

### 3.1 Riesgos técnicos de la auditoría — suscritos sin cambios

Los 8 P0 y 11 P1 están bien identificados, bien evidenciados y correctamente priorizados. No tengo correcciones. El orden de remediación propuesto en `security_best_practices_report.md` (auth → frontera pública → transacciones → XSS/uploads → dependencias → pruebas negativas) es el correcto.

Refuerzo solo dos:

- **P0-01 + SEC-CREDS-003 son más graves juntos que por separado.** La combinación de credenciales por defecto en el cliente con validación de credenciales en el navegador hace que el control de acceso sea efectivamente inexistente. *(Detalle técnico completo en el paquete de auditoría local `02_AUDITORIA/`; no se publica mientras los sistemas afectados sigan operando con clientes.)* Cuando migres, **ningún PIN heredado se importa como credencial válida**; todos se rotan con enrolamiento nuevo.
- **P1-02 (sin aislamiento por organización) es el que define si Master POS existe o no.** Los otros son bugs. Este es la diferencia entre "una app por negocio" y "una plataforma". No se puede parchear después: cambia el esquema, los índices, cada consulta, cada prueba y el modelo de autorización.

### 3.2 Riesgos que la auditoría no cubre

Estos son de proyecto y de negocio, y en mi experiencia matan más reescrituras que los bugs.

| # | Riesgo | Por qué importa | Mitigación propuesta |
|---|---|---|---|
| **R-01** | **Impuesto de sistema doble.** Confeti (pastelería) opera hoy sobre la base Base44. Mientras construyes Master POS, sigues soportando y arreglando el viejo. | Es el modo de falla clásico de la "segunda versión": el mantenimiento del viejo consume el tiempo del nuevo, y a los 8 meses no hay ninguno de los dos terminado. | **Congelar el sistema actual en modo mantenimiento**: solo correcciones que impidan operar. Cero funciones nuevas ahí, sin excepción, por escrito y comunicado a los clientes. Toda petición nueva se convierte en backlog de Master POS. |
| **R-02** | **El catálogo modular tiene ~150 capacidades y ningún costo estimado.** | Una capacidad bien hecha (comando de servidor + permisos + migraciones + pruebas + UI + docs) son días o semanas. 150 capacidades son años-persona. El catálogo, leído sin costo, se siente como un plan; es una lista de deseos. | Regla de admisión: **una capacidad entra al roadmap solo si (a) un cliente la paga, o (b) es núcleo obligatorio.** El catálogo se queda como mapa de conversación de ventas, marcado explícitamente como *no comprometido*. |
| **R-03** | **Explosión combinatoria de configuraciones.** Con N capacidades activables independientemente hay 2^N combinaciones. No se pueden probar. | La promesa "cada cliente una combinación distinta" es exactamente la promesa de una matriz de pruebas infinita. Es el riesgo real de "modularidad de verdad", y el paquete no lo menciona. | **Perfiles de giro certificados**: combinaciones nombradas y probadas en CI (`restaurante_completo`, `mostrador_esencial`, `servicios_citas`…). Un cliente recibe *perfil + deltas*. Solo perfiles y deltas comunes entran a la matriz de regresión. Combinaciones libres se permiten pero se marcan *no certificadas*. |
| **R-04** | **El núcleo actual está modelado como restaurante, no como comercio genérico.** `ProductoTerminado.area_preparacion`, `Venta.mesa_id`, `RecetaEscandallo`. | Si la Etapa 1 congela este modelo, las Etapas 5 y 6 (citas, servicios, e-commerce) exigen reescribir el núcleo, justo lo que quieres evitar. | Decidir **ahora** la abstracción `Orden / LíneaDeOrden / Cumplimiento / Pago / MovimientoStock`, donde cocina, cita y envío son *estrategias de cumplimiento*. No construir citas hoy; solo no cerrarles la puerta. Detalle en `02_ARQUITECTURA_CONCEPTUAL.md`. Es la decisión más barata hoy y la más cara dentro de un año. |
| **R-05** | **Sustituir un proveedor por otro.** Tienes Supabase y Vercel conectados. Supabase no es Base44, pero sí es un proveedor. | La regla no negociable #1 dice "nunca más depender de una plataforma que controle nuestro código o infraestructura". Adoptar Supabase sin criterio repite el patrón con otro nombre. | Distinguir **portabilidad de datos** (Postgres: alta) de **portabilidad de plataforma** (Auth, Storage, Edge Functions, RLS-como-lógica: baja). Recomendación: usar Postgres de Supabase y su storage **detrás de contratos propios**, y mantener la lógica de negocio en **tu propia API**, no en RLS ni Edge Functions. Detalle y ADR en `02_ARQUITECTURA_CONCEPTUAL.md`. |
| **R-06** | **Ninguna evidencia de capacidad de ejecución.** El paquete no dice si trabajas solo, medio tiempo o completo, ni con qué presupuesto. | Es la variable que más cambia el plan. El mismo alcance es 4 meses para 3 personas y 18 para una a medio tiempo. Un plan por etapas sin capacidad declarada es ficción. | Pregunta bloqueante Q-03 en `04_DECISIONES_PREGUNTAS_Y_AUTORIZACION.md`. |
| **R-07** | **Reescritura sin entregas intermedias.** Etapa 1 completa (repo, CI, identidad, tenancy, permisos, módulos, observabilidad) no produce nada que un cliente pueda usar. | Meses sin ingreso ni retroalimentación real. La moral y el flujo de caja son riesgos de proyecto legítimos. | **Cada corte debe ser vendible o usable por un cliente real.** Si un corte no se le puede entregar a alguien, es demasiado grande. Ver `03_SECUENCIA_Y_PRIMER_CORTE.md`. |
| **R-08** | **1,592 diagnósticos de tipos y 36 de lint en el ZIP.** | No es deuda a migrar: es evidencia de que el código fuente **no puede reutilizarse por copia**, ni siquiera para componentes. Cada archivo requiere revisión. | Política: **cero copy-paste de páginas.** El ZIP se abre al lado como referencia, nunca se copia. Excepción evaluable: primitivas visuales `src/components/ui/*` (shadcn), que son neutrales respecto al proveedor. |

### 3.3 Contradicciones internas del material

Estas necesitan tu decisión; no las puedo resolver solo.

**C-01 — Plataforma multiempresa compartida vs. proyecto por cliente.**
`DECISIONES_PENDIENTES.md` D-07 recomienda base compartida con `tenant_id`. Tu visión dice "se creará su proyecto con el núcleo necesario y los módulos que correspondan… solo las piezas requeridas". Son dos modelos de distribución distintos y opuestos. El primero implica **un código, una plataforma, capacidades por tenant**. El segundo implica **N bases de código ensambladas**, que con equipo pequeño es inmanejable (cada parche de seguridad se aplica N veces). Es la decisión #1 de todo el proyecto. Mi recomendación y su fundamento están en `01_MODELO_MASTER_POS.md` §2.

**C-02 — "No decide todavía el proveedor" vs. D-03/D-04/D-05 ya deciden.**
El paquete afirma no elegir stack y a la vez recomienda TypeScript, PostgreSQL y monolito modular. Coincido con las tres, pero deben adoptarse como **ADR firmado con alternativas evaluadas**, no heredarse por omisión. Si no, en seis meses nadie recuerda por qué y la decisión no se puede revisar.

**C-03 — La "matriz de regresión" no es una matriz de regresión.**
De los 56 escenarios, la mayoría están marcados *Corrección*: describen cómo **debe** comportarse el sistema nuevo, no cómo se comporta el actual. Una regresión verifica que no rompiste lo que funcionaba; aquí el objetivo explícito es romper lo que estaba mal. Mezclarlos bajo un nombre hace imposible responder "¿perdí una función?". Hay que partirla en dos:
- **Matriz de conservación** — comportamiento actual válido que debe sobrevivir intacto (es lo que protege contra pérdida de funciones).
- **Matriz de corrección** — comportamiento nuevo obligatorio (es lo que protege contra copiar defectos).
Ambas se ejecutan en CI, pero responden preguntas distintas y fallan por razones distintas.

**C-04 — El "baseline funcional canónico" se declara terminado pero no existe.**
`CRITERIOS_DE_TERMINADO.md` lo exige firmado; lo que hay son 56 escenarios contra ~17 rutas con decenas de flujos cada una. Escribir el baseline real (Given/When/Then por flujo, con invariantes, estados y permisos) **es la pieza más grande de Fase 0 y no está estimada**. Mi estimación en `03_SECUENCIA_Y_PRIMER_CORTE.md` §5.

**C-05 — Los cuatro roles de Master POS son incompatibles sin diseño explícito.**
Producto estable / laboratorio inestable / demo poblada / catálogo comercial. Se resuelven, pero por diseño. Ver `01_MODELO_MASTER_POS.md` §5.

---

## 4. Bloqueos reales para cerrar Fase 0

| ID | Bloqueo | Quién lo resuelve |
|---|---|---|
| B-01 | Hash del ZIP sin verificar de forma independiente | Miguel, 30 segundos |
| B-02 | Modelo de distribución sin decidir (C-01) | Miguel, con la recomendación de `01_` |
| B-03 | Capacidad de ejecución no declarada (R-06) | Miguel |
| B-04 | Estado real de clientes en producción no documentado (R-01) | Miguel |
| B-05 | Baseline funcional v0 inexistente (C-04) | Trabajo conjunto, semanas 2–5 |
| B-06 | Stack sin ADR firmado (C-02, R-05) | Trabajo conjunto tras B-02 y B-03 |

**Nada de esto justifica escribir código todavía.** B-01 a B-04 se resuelven en una conversación. B-05 y B-06 son el grueso de Fase 0.

---

## 5. Continúa en

1. `01_MODELO_MASTER_POS.md` — qué es Master POS, el núcleo, los módulos y los proyectos de cliente; si el ensamblaje es sostenible.
2. `02_ARQUITECTURA_CONCEPTUAL.md` — la arquitectura recomendada y por qué.
3. `03_SECUENCIA_Y_PRIMER_CORTE.md` — etapas revisadas, el primer corte funcional exacto, y cómo reconstruir el POS de restaurante sin copiar sus defectos.
4. `04_DECISIONES_PREGUNTAS_Y_AUTORIZACION.md` — decisiones, preguntas para ti y criterios para autorizar desarrollo.
