# MorphiqPOS

Plataforma madre de puntos de venta y sistemas de negocio de **Morphiq**.

**Fase actual: 1 — ejecución. El corte F1.0 está construido y a una tarea de firmarse.**

El código vive en un repositorio aparte: `morphiqpos` (local, sin remoto todavía — decisión A-35).
Lo que queda de F1.0 es levantar el entorno con Docker; todo lo demás está verificado.

---

## ⚠️ Antes que nada: este repositorio es público

Contiene la planeación de sistemas que **hoy operan con clientes reales que pagan** (una pastelería, una ferretería y una tienda). Parte del material de origen describe defectos de seguridad concretos de esos sistemas en producción.

Por eso, en este repositorio:

- **Sí está** toda la estrategia, arquitectura, decisiones y catálogo de capacidades.
- **No está** la auditoría de seguridad detallada, con archivos y líneas de los sistemas en producción. Publicarla equivale a repartir el mapa para atacar a los clientes de Miguel.
- Tampoco está el ZIP histórico del POS de restaurante ni ningún dato de clientes.

**Recomendación: cambiar este repositorio a privado.** Un repositorio privado funciona igual para conversar con los agentes desde la nube y no tiene ninguna desventaja para este proyecto. Una vez privado, se sube la auditoría completa. Decisión pendiente **A-33**.

---

## Empieza aquí

> **¿Vienes de un chat nuevo o vas a abrir Claude Code?**
> Usa uno de los dos prompts de arranque de [`docs/fase-1/14-PROMPT-CLAUDE-CODE.md`](docs/fase-1/14-PROMPT-CLAUDE-CODE.md). No improvises el contexto: ese archivo existe precisamente porque una sesión nueva sin él se pierde.

| Archivo | Qué es |
|---|---|
| **[`CONTEXTO_MAESTRO.md`](CONTEXTO_MAESTRO.md)** | **Léelo completo antes de responder nada.** Quién es Miguel, qué es MorphiqPOS, de dónde sale, la arquitectura acordada, la secuencia y los riesgos vivos |
| [`DECISIONES.md`](DECISIONES.md) | Registro de decisiones con fecha, alternativas y consecuencias. Incluye las superadas y las pendientes |
| [`REGLAS.md`](REGLAS.md) | 34 reglas no negociables. Si una propuesta las viola, se rechaza |
| **[`docs/fase-1/`](docs/fase-1/00-INDICE-Y-COMO-USAR.md)** | **El plan de ejecución.** Estrategia de fusión, modelo de datos, arquitectura, diseño, defectos, y los 6 cortes con sus tareas |
| [`docs/fase-1/BITACORA.md`](docs/fase-1/BITACORA.md) | Dónde quedó la última sesión. **Primer lugar donde mira un agente nuevo** |
| [`docs/`](docs/) | Los documentos de Fase 0 — el análisis que llevó a este plan |

## Estado

**Fase 0 — cerrada.** Auditoría, decisiones, arquitectura y catálogo de capacidades.
**Fase 1 — planeada, lista para ejecutar.** Fusionar los dos sistemas fuente en una sola aplicación, erradicar Base44 y corregir los defectos. Seis cortes, ~74–101 jornadas, la ejecuta Claude Code.
**Código escrito hasta hoy: cero.**

---

## Qué es MorphiqPOS en una frase

> Primero es la herramienta de venta que hoy falta para cerrar tratos —el prospecto necesita **ver**— y después la fábrica de capacidades que evita ahogarse cuando los clientes se multipliquen.

**No es un SaaS.** Morphiq es boutique: no vende sacos, toma medidas.

**La meta que ordena toda la arquitectura:** firmar el viernes y **entregar el sistema del cliente en 2–3 semanas.**

---

## Estado del proyecto

**De dónde sale:** de dos sistemas reales ya construidos y vendidos, no de cero.

- **POS MH Restaurante** (Base44, se erradica) → aporta las **features y las reglas de negocio**: mesas, mesero, cocina/KDS, comandas, propinas, recetas, portal QR.
- **[POS-MH-Tiendita](https://github.com/M1gu3hb/POS-MH-Tiendita)** (Next.js + Supabase) → aporta la **arquitectura**: repositorios, RLS multi-tenant, sesión de servidor, y features fuertes como el escáner de tres vías y la báscula.

**El hallazgo que define el núcleo:** comparando ambos, los giros sólo divergen en dos cosas — **cómo se llena el carrito** (escaneo vs. mesa) y **qué se descuenta al cobrar** (el SKU mismo vs. una receta). Todo lo demás coincide. Ese núcleo está validado por dos implementaciones reales, no inventado.

---

## Secuencia

| Corte | Qué construye | Qué desbloquea |
|---|---|---|
| **Fase 0** | ADR, baseline, matrices, backlog | — |
| **Corte 0** | Núcleo endurecido + motor de diseño | Demos de tienda, ferretería y farmacia |
| **Corte 1** | Restaurante: mesas, mesero, cocina, comandas | La demo más fuerte |
| **Corte 2** | Completar retail: variantes, lotes, series | Farmacia, boutique, calzado, celulares |
| **Corte 3** | Servicios y citas | Estéticas, barberías, spas, dentistas |
| Posteriores | Espacios · producción · omnicanal · membresías · franquicias · hardware · IA y MCP | |

**Regla que ordena el roadmap:** cada corte debe agregar un capítulo al guion de demostración, o ser cimentación obligatoria de algo que sí lo hace.

---

## Para agentes de IA (Claude Code · Codex · Antigravity)

Este repositorio es la **fuente de verdad compartida**. No dependas de memoria de conversación.

1. Lee `CONTEXTO_MAESTRO.md`, `DECISIONES.md` y `REGLAS.md` **antes** de proponer nada.
2. **No escribas código.** Fase 0. El desarrollo requiere autorización expresa de Miguel.
3. Registra toda decisión nueva en `DECISIONES.md` con fecha, alternativas, elección y consecuencia. Si no está escrita, no existe.
4. Una decisión superada **no se borra**: se marca y se apunta a la nueva.
5. Responde en **español**, conciso y directo.
6. Miguel habla por **voz a texto**: ante una frase ambigua, pregunta antes de asumir.
7. Marca siempre qué es **confirmado por evidencia**, qué es **inferido**, qué es **propuesta** y qué es **decisión pendiente**.
8. Nunca copies PINs, contraseñas, tokens ni datos de clientes a este repositorio.

Al cerrar una sesión con acuerdos nuevos, **actualiza `DECISIONES.md` y `CONTEXTO_MAESTRO.md`** y anota la sesión en el registro del final de `DECISIONES.md`.
