# Este plan está SUPERADO — no se consulta

**Archivado el 9 de septiembre de 2026.**

Los 23 documentos de esta carpeta describen un plan que se ejecutó durante tres
días y que resultó ser **el trabajo equivocado**.

## Qué decía

Fusionar dos fuentes —el POS de restaurante de Miguel y el POS de tiendita— en
un sistema nuevo, con su propio sistema de tokens, cinco giros de negocio, un
enrolamiento de terminal por código de seis dígitos y pantallas construidas
desde cero.

## Por qué está superado

Miguel no pidió un POS nuevo. Pidió **revivir el suyo** —cuatro meses de trabajo,
operable de mil maneras, probado en la calle— reemplazando el backend que
desapareció con Base44, y agregarle el escáner de la tiendita.

Durante tres días su código estuvo en `historico/restaurante/` y nadie lo abrió.
La regla que lo impedía —`REGLAS.md` R30, «el ZIP es evidencia, no plantilla; se
lee al lado, no se copian archivos»— era el error de fondo, y **queda derogada**.

## Qué manda ahora

- `docs/fase-1/F1-01-AUDITORIA-DEL-RESTAURANTE.md`
- `docs/fase-1/F1-02-PLAN-DE-RESURRECCION.md`

Si algo de esta carpeta contradice a esos dos, mandan esos dos.

## Qué se salvó de lo que se construyó aquí

No todo fue en balde. El backend es exactamente la mitad que Base44 se llevó, y
se conserva entero:

- El esquema con sus 28 tablas, restricciones reales y llaves foráneas por
  organización.
- `comando()`: transacción, idempotencia, rol, auditoría, errores tipados.
- `cobrarOrden`, con ocho efectos en una transacción y el precio recalculado en
  el servidor.
- El ledger de stock con decremento atómico que falla en vez de silenciar.
- El dominio de dinero en `bigint` de centavos.
- El resolvedor de sesión y el puente HTTP.
- ~79 mutaciones enganchadas a `pnpm verify`.

Lo que se tira son las pantallas, el enrolamiento de terminal, el sistema de
tokens como aspecto principal y el selector de cinco giros.

## La bitácora se movió

`BITACORA.md` **no** está aquí: sigue viva en `docs/fase-1/BITACORA.md`. Es un
registro continuo de lo que se ejecutó, y eso no caduca con el plan.
