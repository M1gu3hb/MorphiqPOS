# Respuesta Cloud CoWork — Fase 0 Master POS

Fecha: 6 de septiembre de 2026
Autor: sesión de planeación Cloud CoWork
Estado: **planeación. Cero código escrito. Cero cambios en sistemas remotos.**

---

## Por qué está aquí y no dentro del paquete

`POSMH_FASE_0_CLOUD_COWORK_2026-09-06` tiene `MANIFEST.json` con hash por archivo y `file_count: 34`. Escribir dentro lo invalidaría y rompería la regla no negociable #2 (preservar la fuente). Esta respuesta es una capa nueva sobre evidencia congelada.

## Orden de lectura

| # | Documento | Qué contiene | Puntos de tu brief que responde |
|---|---|---|---|
| 1 | `00_DICTAMEN_Y_LECTURA.md` | Confirmación de lectura, interpretación de la visión, riesgos y contradicciones, bloqueos | 1, 3, 12 · entregables 1, 3 |
| 2 | `01_MODELO_MASTER_POS.md` | Master POS / núcleo / módulos / proyectos de cliente; sostenibilidad del ensamblaje; niveles de personalización; versiones entre clientes; organización de código y docs | 2, 3, 4, 10, 11 · entregable 1 |
| 3 | `02_ARQUITECTURA_CONCEPTUAL.md` | Arquitectura recomendada, modelo de orden genérico, tenancy, transacciones, registry de capacidades, proveedores, seguridad, diseño, IA/MCP | 4 · entregable 4 |
| 4 | `03_SECUENCIA_Y_PRIMER_CORTE.md` | Crítica y revisión de tus etapas, primer corte funcional exacto, método de reconstrucción sin copiar defectos, alcance de Fase 0, apertura de giros nuevos | 6, 7, 8, 9, 13 · entregables 5, 6 |
| 5 | `04_DECISIONES_PREGUNTAS_Y_AUTORIZACION.md` | Decisiones por nivel de impacto, preguntas para ti, criterios de autorización | 5, 14 · entregables 2, 7, 8 |
| 6 | `05_ACTA_DE_DECISIONES_01.md` | Decisiones tomadas y plan ajustado. Manda sobre 00–04 | — |
| 7 | **`06_ACTA_DE_DECISIONES_02.md`** | **El propósito real de MorphiqPOS: herramienta de venta primero, fábrica después. Reordena la secuencia. Manda sobre 00–05** | — |

> **Lee el 06 primero, luego el 05.** Los documentos 00–04 se escribieron antes de tus decisiones y conservan recomendaciones superadas; llevan avisos en las secciones afectadas.

## Estado al 6 de septiembre de 2026

**El producto se llama MorphiqPOS.** "Master POS" es el nombre interno del proyecto.

**Qué es:** primero la herramienta de venta que hoy te falta para cerrar tratos (el prospecto necesita *ver*); después la fábrica de features que evita que te ahogues cuando los clientes se multipliquen. Meta que ordena la arquitectura: **firmar el viernes y entregar el sistema del cliente en 2–3 semanas.**

**Decidido:** ensamblaje por cliente (monorepo con paquetes, nunca copiar código) · medio tiempo, solo · Base44 erradicado, sin migración · sin piloto externo, tenants de demostración · todo local, sin despliegue.

**Secuencia:** Fase 0 → Corte 0 mostrador (desbloquea demos de tienda, ferretería y farmacia) → Corte 1 restaurante → Corte 2 QR y panel del dueño → Corte 3 costos y reportes → Corte 4 multisucursal/franquicias.

**Pendiente de tu lado:**

1. **Copiar el proyecto de la tiendita** a `01_FUENTES_TIENDITA/`. Máxima prioridad: valida la abstracción del núcleo y es la especificación del Corte 0.
2. **Verificar el hash del ZIP** (comando en `00_DICTAMEN_Y_LECTURA.md` §1).
3. **Decidir A-02** (modelo de orden genérico) — mejor después de ver la tiendita.
4. **Confirmar** la secuencia de cortes y responder Q-06 y Q-13 (`06_ACTA` §8).

Con eso escribo los ADR, el baseline del mostrador, las matrices y el backlog del Corte 0.

## Lo que NO hice, a propósito

- No escribí código.
- No creé repositorios.
- No abrí, extraje ni modifiqué el ZIP.
- No toqué ningún sistema remoto.
- No copié PINs, contraseñas, tokens ni datos de clientes.
- No traté el catálogo modular como backlog aprobado.
