# EXCEPCIONES DE COBERTURA · Fase 2

Lo que `pnpm verify:cobertura` **no** exige, con su razón escrita al lado.

## Por qué este archivo existe y no un `--skip`

La puerta de cobertura sustituye al juicio de quien la ejecuta: mientras salga en 1, la fase no
está terminada, se sienta como se sienta. Eso sólo funciona si la puerta no se puede ablandar en
silencio. Una función que de verdad no se puede construir —porque la decisión la tiene que tomar
Miguel, o porque depende de hardware que todavía no existe— **no se esconde bajo un umbral**: se
escribe aquí, con su ID y su motivo, y el script la cuenta como declarada.

Así la excepción queda contada en vez de escondida, y el día que Miguel decida, se borra la fila
y la puerta vuelve a pedir la función.

## Las reglas de este archivo

1. Una fila por excepción. Nunca un rango: `F-940…F-945` son **seis** filas.
2. La razón tiene que decir **quién** desbloquea y **qué** hace falta, no «pendiente».
3. Una excepción que se puede construir NO va aquí. Trabajo pendiente ≠ trabajo imposible.
4. Al desbloquearse, se borra la fila. No se marca como resuelta: se borra.

Formato de la primera columna:

| Clave | Significado |
|---|---|
| `F-NNN` | una función del `01-FUNCIONES.md` §5 de algún modelo, o del tronco |
| `RUTA apps/web/app/api/…/route.ts` | una ruta declarada en un `05-DATOS-Y-BACKEND.md` |
| `PANTALLA <modelo>/<slug>` | una pantalla declarada en un `04-INTERFAZ.md` §4.3 |

---

## FUNCIONES

| Clave | Qué es | Por qué no se construye |
|---|---|---|
| `F-940` | CFDI 4.0 · emisión de factura | **Decisión pendiente P-02.** Mete un PAC, un costo mensual y una obligación fiscal: no es reversible y no la decide un agente. El prompt de la Fase 2 la lista entre lo bloqueado, palabra por palabra. Lo único que se hace es dejar el hueco limpio: RFC, régimen fiscal, uso de CFDI y código postal en `clientes`. |
| `F-941` | CFDI · factura global mensual | Misma decisión P-02. Sin PAC elegido no hay forma de emitirla ni de probar el timbrado. |
| `F-942` | CFDI · complemento de pago | Misma decisión P-02. Depende del formato exacto que exija el PAC. |
| `F-943` | CFDI · cancelación con acuse | Misma decisión P-02. El acuse lo devuelve el PAC; sin proveedor no hay acuse que guardar. |
| `F-944` | CFDI · `ClaveProdServ` y `ClaveUnidad` por producto | Misma decisión P-02. El catálogo del SAT se carga con el PAC; cargarlo antes obliga a migrarlo después. |
| `F-945` | CFDI · descarga y envío del XML y el PDF | Misma decisión P-02. El XML lo devuelve el PAC ya timbrado. |
| `F-318` | Impresión de comanda en cocina | **Depende del hardware que tenga Miguel.** Térmica de red, USB, o servicio local: las tres exigen arquitecturas distintas y una de ellas obliga a instalar un agente en el sitio del cliente. Está en la lista de bloqueados del prompt. La ruta y la entidad quedan escritas para que sólo falte el conector. |
| `F-249` | Segunda pantalla para el cliente en cafetería | **Depende del hardware.** Un segundo monitor por HDMI, una tablet emparejada o un display de cajón son tres productos distintos con tres costos distintos. Está en la lista de bloqueados del prompt. |
| `F-406` | Recordatorio de cita por WhatsApp | **No se elige proveedor.** API oficial de Meta —con su alta, su costo por conversación y su plantilla aprobada— contra un enlace `wa.me` semiautomático. Es la decisión que el `07-ESTADO.md` marca como «la decide Miguel». El resto del no-show (F-412) sí se construye: lo que falta es sólo el canal de salida. |

## RUTAS

| Clave | Qué es | Por qué no se construye |
|---|---|---|
| `RUTA apps/web/app/api/restaurante/imprimir-comanda/route.ts` | El disparo de impresión | Es la ruta de `F-318`. Sin decidir el hardware no hay cuerpo que definir: el de una térmica de red y el de un agente local no se parecen. |
| `RUTA apps/web/app/api/restaurante/impresion/resultado/route.ts` | El acuse del impresor | Es la otra mitad de `F-318`. Un acuse de una cola de impresión que no existe no se puede ni probar. |

## PANTALLAS

*(ninguna: una pantalla que depende de una migración sin aplicar SÍ se construye, y se dice en el
`FILE-MAP.md` que no se puede abrir. Eso es trabajo pendiente de acople, no trabajo imposible.)*
