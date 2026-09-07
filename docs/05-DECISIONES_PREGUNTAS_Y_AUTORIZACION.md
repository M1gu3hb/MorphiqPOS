# Decisiones, preguntas y criterios de autorización

---

## 1. Decisiones que debes tomar, en orden de impacto

Las ordeno por cuánto cambia el proyecto si eliges distinto. Las primeras cinco bloquean todo lo demás.

### Nivel 1 — Bloquean la arquitectura completa

> **⚠ RESUELTAS el 6-sep-2026.** A-01, A-03, A-04 y A-05 están decididas; ver `05_ACTA_DE_DECISIONES_01.md` §1. La tabla se conserva como registro de las alternativas evaluadas. Resumen de lo elegido: **ensamblaje por cliente · medio tiempo, solo · Base44 no aplica (erradicación total) · sin piloto, tenant interno · todo local (A-16)**. **A-02 (modelo de orden genérico) sigue abierta** y es ahora la única decisión de Nivel 1 pendiente.

| ID | Decisión | Mi recomendación | Si eliges lo contrario |
|---|---|---|---|
| **A-01** | **Modelo de distribución:** ¿un código configurable por tenant, o un proyecto de código ensamblado por cliente? (contradicción C-01) | **Un código, muchos tenants.** Topología de despliegue variable (compartida / dedicada / local). Fork prohibido | Multiplicas por N el costo de cada parche, cada prueba y cada cliente nuevo. Con equipo pequeño es insostenible a 2 años |
| **A-02** | **Modelo de orden:** ¿`Venta` de restaurante, o `Orden` genérica con estrategias de cumplimiento? (riesgo R-04) | **Orden genérica**, con una sola estrategia implementada en el Corte 0 y la segunda en el corte de restaurante | Las Etapas 5 y 6 exigen reescribir el núcleo de ventas con clientes ya en producción |
| **A-03** | **Capacidad de ejecución:** ¿cuántas horas semanales reales, solo o con ayuda? | — Necesito el dato para calendarizar | Cualquier plan por fechas es ficción sin esto |
| **A-04** | **Sistema actual:** ¿se congela en mantenimiento mientras se construye Master POS? (riesgo R-01) | **Sí, congelar.** Solo correcciones que impidan operar. Por escrito y comunicado a los clientes | El mantenimiento del viejo consume el tiempo del nuevo y no terminas ninguno |
| **A-05** | **Piloto 1:** ¿Confeti o el restaurante? | **Confeti.** Superficie mínima, cliente real, menor riesgo para estrenar | Estrenas la plataforma en el escenario más complejo y menos tolerante a fallos |

### Nivel 2 — Definen el stack y la operación

| ID | Decisión | Mi recomendación | Nota |
|---|---|---|---|
| **A-06** | Backend y lenguaje | TypeScript, API propia versionada | Reutiliza lo que ya sabes; tipos compartidos con el frontend. Requiere ADR con 2 alternativas evaluadas (C-02) |
| **A-07** | Base de datos | PostgreSQL | Transacciones, restricciones, portabilidad alta |
| **A-08** | Proveedor de infraestructura | Postgres y storage gestionados (Supabase u otro) **detrás de contratos propios**; lógica de negocio siempre en tu API | Riesgo R-05. La línea roja: cero reglas de negocio en RLS o Edge Functions |
| **A-09** | Identidad | Propia, con sesión de servidor; empleados/roles/terminales separados de la identidad | Elimina P0-01 y P0-02 de raíz |
| **A-10** | Tenancy | Base compartida con `organizacion_id` + defensa en 3 capas + pruebas de aislamiento generadas | Dedicada disponible sin cambiar código |
| **A-11** | Frontend | React + Tailwind + sistema de diseño con tokens, chunks por capacidad | Aprovecha tu experiencia y el trabajo visual existente |
| **A-12** | Offline v1 | Online-first con idempotencia y reintentos. Offline real se diseña después, con alcance decidido | Un service worker genérico crea más problemas de los que resuelve |
| **A-13** | Impresión v1 | Definir formato obligatorio (ver Q-06). Bridge para térmicas es Etapa 6 | |
| **A-14** | Fiscalidad v1 | México/MXN, con alcance explícito: ¿facturación CFDI dentro o exportación a un tercero? | Ver Q-04 |
| **A-15** | Pagos con tarjeta | Registrar el método primero; integración con adquirente en fase propia | No acoplar el checkout a un proveedor todavía |

### Nivel 3 — Se pueden decidir más tarde sin costo

Escritorio y hardware · IA y MCP · API pública y webhooks · marketplaces · multipaís · app móvil nativa · data warehouse · automatizaciones de marketing · franquicias.

Ninguna bloquea el primer baseline correcto. **No las decidas ahora**; anótalas y sigue.

---

## 2. Preguntas que necesito de ti

### Bloqueantes — sin respuesta no puedo cerrar Fase 0

**Q-01 · Distribución.** ¿Aceptas el modelo de un solo código con capacidades por tenant, sabiendo que "solo las piezas necesarias" se cumple por carga diferida, guardias de servidor y migraciones por tenant, y no porque el repositorio del cliente carezca físicamente del código? (Decisión A-01.)

**Q-02 · Clientes en producción hoy.** ¿Quién está operando con dinero real sobre el sistema Base44 en este momento? ¿Confeti, algún restaurante, otros? ¿Desde cuándo y con qué volumen? El paquete de auditoría no lo documenta y cambia por completo la urgencia y el riesgo.

**Q-03 · Capacidad real.** ¿Cuántas horas semanales le puedes dedicar de forma sostenida? ¿Trabajas solo o hay alguien más? ¿Hay presupuesto para infraestructura y herramientas?

**Q-04 · Fiscalidad.** ¿La facturación fiscal mexicana (CFDI 4.0, PAC, timbrado) entra en v1, o el sistema exporta a un sistema externo de facturación? Es la diferencia entre semanas de trabajo especializado y cero.

**Q-05 · Hardware del piloto 1.** ¿Qué debe funcionar el primer día en Confeti: impresora (¿cuál, exactamente?), cajón de dinero, báscula, escáner de códigos, terminal bancaria? "Ninguno, solo navegador e impresora de hojas" es una respuesta perfectamente válida y la más rápida.

**Q-06 · Formato de ticket.** ¿Carta, 80 mm, 58 mm o combinación en v1? El historial muestra que migraste hacia carta con iframe y corte en A4; ¿esa fue una decisión definitiva o un rodeo por limitaciones de la plataforma?

**Q-07 · Datos reales.** ¿Qué se puede exportar del sistema actual y bajo qué autorización de los clientes? ¿Confeti necesita conservar su histórico de ventas, o basta arrancar limpio con catálogo e inventario?

**Q-08 · Disponibilidad.** ¿Qué pasa si el sistema se cae 30 minutos en hora pico? ¿Hay procedimiento manual? Esto define cuánto invertir en alta disponibilidad y offline desde el inicio.

### Para el baseline funcional — las puede contestar F0-4 sobre la marcha

**Q-09** Ajustes de cuenta: ¿qué puede modificar un cajero antes de cobrar y con qué autorización?
**Q-10** Exclusiones "SIN": ¿deben además excluir el ingrediente del descuento de inventario (el "PASO B" que quedó planeado)?
**Q-11** Módulo Cliente: existe la entidad, no la pantalla. ¿Qué debía hacer?
**Q-12** Cuando el borrador y la versión En vivo difieren, ¿cuál comportamiento es el correcto? Solo tú lo sabes; operaste ambos.
**Q-13** Los tres paquetes comerciales (Esencial / Operativo / Restaurante Pro): ¿se conservan como perfiles certificados con esos nombres, o se rediseñan ahora que hay capacidades reales?

### Estratégicas — no bloquean, pero cambian prioridades

**Q-14** ¿Master POS tendrá una demo pública accesible desde tu sitio, o solo demos que tú presentas? Afecta el diseño de tenants de demostración y su seguridad.
**Q-15** ¿Piensas vender Master POS como SaaS de autoservicio en algún momento, o siempre será venta consultiva boutique? Cambia el diseño del alta de clientes y la facturación de suscripciones.
**Q-16** ¿Cuál es el segundo giro que ya tienes en la mira? Saberlo permite dejar los ganchos correctos preparados sin construir de más.

---

## 3. Criterios para autorizar el inicio de desarrollo

No autorices el primer commit hasta que **los diez** estén cumplidos. Si uno falla, se sigue en Fase 0.

| # | Criterio | Evidencia que lo demuestra |
|---|---|---|
| 1 | Hash del ZIP verificado independientemente | Salida de `Get-FileHash` coincidiendo con `1BF6FC…BFF3` |
| 2 | Decisiones A-01 a A-05 cerradas | Acta firmada con fecha |
| 3 | ADR de stack, datos, identidad, tenancy, despliegue y modelo de orden aprobados | Archivos en `docs/adr/` con contexto, alternativas evaluadas, decisión, consecuencias y salida de reversa |
| 4 | Baseline funcional del Corte 0 escrito | Fichas Given/When/Then en `docs/baseline/`, cada comportamiento clasificado CONSERVAR / CORREGIR / RETIRAR / PENDIENTE |
| 5 | Matrices de conservación y corrección separadas, con datos sintéticos definidos | Dos documentos distintos, no uno mezclado |
| 6 | Cada P0 tiene diseño, prueba y responsable | Tabla P0 → comando/mecanismo → escenario de prueba |
| 7 | Estrategia de calidad definida: puertas de CI, entornos, secretos, respaldos, RPO/RTO | Documento de operación + configuración de CI redactada |
| 8 | Backlog del Corte 0 en tareas pequeñas | Cada tarea: alcance, criterio de aceptación, prueba y rollback |
| 9 | Sistema actual formalmente congelado | Comunicación enviada a clientes; política escrita |
| 10 | Autorización explícita tuya | Un mensaje que diga "aprobado, empieza" |

**Criterio adicional para la primera tarea de código**, tomado de tu propio `CRITERIOS_DE_TERMINADO.md`: la primera tarea debe tener alcance, prueba, rollback y dueño claros antes de escribirse. Si no cabe en una descripción de diez líneas, es demasiado grande.

---

## 4. Qué haré cuando me autorices

En orden, sin adelantarme:

1. Resolver A-01 a A-05 contigo en conversación y dejar el acta.
2. Escribir los ADR con alternativas reales evaluadas, no con la recomendación ya asumida.
3. Escribir el baseline funcional del Corte 0 (mostrador), con las fichas clasificadas.
4. Partir y ampliar las matrices de conservación y corrección.
5. Redactar el backlog del Corte 0 en tareas pequeñas y verificables.
6. Presentarte el go/no-go.
7. **Detenerme y esperar tu autorización expresa** antes de crear el repositorio o escribir una sola línea.

---

## 5. Lo que quiero dejarte claro antes de cerrar

Tres cosas, dichas directo:

**La visión es buena y es alcanzable.** No es demasiado ambiciosa como concepto. Master POS como fábrica de capacidades reutilizables es exactamente el modelo correcto para un estudio boutique que quiere crecer sin volverse una fábrica de proyectos desechables.

**El riesgo no está en la ambición. Está en el calendario.** El catálogo de ~150 capacidades no es peligroso como mapa; es peligroso como plan. La regla de admisión —solo entra lo que un cliente paga o el núcleo exige— es lo que convierte esa lista de una amenaza en un activo comercial.

**La parte más difícil de este proyecto no es técnica.** Es sostener la disciplina de terminar el Corte 0 completo, con sus pruebas de concurrencia y su restauración de respaldo ensayada, cuando la tentación de saltar a las mesas y la cocina va a ser enorme —porque esa parte es más divertida y se ve más. La calidad de Master POS se decide en las primeras seis semanas. Todo lo que se construya después heredará esa cimentación, buena o mala.

**No he escrito ni una línea de código y no lo haré hasta que lo apruebes.**
