# Archivo — plan y auditoría superados

Fecha de archivo: 9 de septiembre de 2026

Todo lo que estaba en `docs/fase-1/` con numeración `00-` a `21-` quedó **superado** y no debe consultarse para trabajar. Se conserva sólo como historia.

## Por qué se archivó

El plan anterior decidió **reimplementar** los dos sistemas de Miguel sobre una arquitectura nueva, usando su código únicamente como especificación. Durante tres días eso produjo un POS nuevo con un diseño genérico, mientras el POS de restaurante que Miguel construyó en cuatro meses seguía sin tocarse en `historico/restaurante/`.

La decisión de fondo —reconstruir en vez de reemplazar sólo el backend— nunca se le puso a Miguel para que la tomara él. Se metió en una tabla de opciones y se siguió adelante.

## Qué manda ahora

- `docs/fase-1/F1-01-AUDITORIA-DEL-RESTAURANTE.md`
- `docs/fase-1/F1-02-PLAN-DE-RESURRECCION.md`
- `docs/fase-1/F1-03-PROMPT.md`

**Si algo de este archivo contradice esos tres documentos, mandan los tres.**

## Cambio de regla más importante

`REGLAS.md` **R30** decía que el ZIP histórico es evidencia y que no se copian archivos de ahí. **Queda derogada.** `historico/restaurante/` es la fuente del frontend y **se copia**.

## Qué sí sobrevive del trabajo anterior

El backend: el esquema de 28 tablas con sus restricciones, el envoltorio `comando()` con transacción e idempotencia, `cobrarOrden`, el ledger de stock con decremento atómico, el dominio de dinero y de catálogo, el resolvedor de sesión y el puente HTTP. Eso es exactamente la mitad que Base44 se llevó, y es mejor que la que había.
