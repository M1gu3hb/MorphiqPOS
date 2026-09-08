# 13 — Pruebas y definición de terminado

Decisión A-29: **pirámide mínima obligatoria en el núcleo, ~20–25 % del tiempo.**

---

## 1. La regla que hace que las pruebas sirvan

> **Una prueba que pasa igual con y sin la corrección no prueba nada.**

Por eso, cada corrección de defecto lleva un campo obligatorio en `BITACORA.md`:

```
Verificado con: se quitó la transacción → SALE-02 falló ✅
```

Se quita la corrección temporalmente, se confirma que la prueba **falla**, y se restaura. Si la prueba sigue pasando, está mal escrita y hay que rehacerla.

Es mutación aplicada a mano sobre las correcciones críticas. La skill `contratos-por-mutacion` cubre el método completo.

---

## 2. Las cinco capas de prueba

| Capa | Qué prueba | Contra qué corre | Velocidad | Cuánto |
|---|---|---|---|---|
| **Unitaria** | Reglas puras de `packages/domain` | Nada. Sin I/O | ms | Mucha. Es donde vive el dinero y las máquinas de estado |
| **Integración** | Comandos y repositorios | **Postgres real** en contenedor. Nunca mocks | segundos | Todo comando crítico |
| **Concurrencia** | Carreras entre operaciones | Postgres real, **hilos en paralelo de verdad** | segundos | Los 6 escenarios de carrera |
| **Fallo** | Atomicidad | Postgres real + inyección de fallos | segundos | Los 4 escenarios de fallo |
| **E2E** | Flujos completos de usuario | App levantada + Playwright | minutos | Sólo el guion de demostración |

**Prohibido:** mockear la base de datos en pruebas de integración. Un mock no reproduce restricciones únicas, transacciones ni carreras — que es exactamente lo que se está probando.

**Prohibido:** `sleep` para "esperar a que termine". Las pruebas de concurrencia deben ejecutarse realmente en paralelo, y las de fallo deben interrumpir pasos internos.

---

## 3. Pruebas generadas automáticamente

Tres familias se generan del registro de comandos y consultas, no se escriben a mano. Una escrita a mano se olvida en el comando 40.

| Familia | Qué verifica | Se genera de |
|---|---|---|
| `PERM-*` | Cada comando × cada rol sin permiso → 403 y cero escrituras | El registro de comandos y `permisos_rol` |
| `TEN-*` | Cada comando y consulta: organización A no toca nada de B | El registro de comandos y consultas |
| `LEAK-*` | Ninguna respuesta de ningún endpoint contiene campos sensibles (`pin_hash`, costos en API pública) | Los esquemas de respuesta |

**Si se agrega un comando y se olvida declarar su permiso, la prueba generada falla.** Es la red de seguridad que evita que crezca el agujero de autorización que tienen los dos sistemas fuente.

---

## 4. Las dos matrices — separadas a propósito

Contradicción C-03 de la Fase 0: la matriz de la auditoría mezclaba dos cosas y por eso no podía responder ninguna de las dos preguntas.

### Matriz de conservación — `docs/baseline/conservacion.md`
> Responde: **¿perdí una función?**

Comportamiento válido de las dos fuentes que debe sobrevivir intacto. Si un escenario falla, **se perdió algo que costó meses descubrir** — es tan grave como un defecto nuevo.

Cubre lo listado en `06-DEFECTOS` §6: propinas por método, productos variables y por porción, estaciones, exclusiones "SIN", precuenta que no marca como pagada, modificadores, mapa de mesas, escáner de tres vías, báscula, mayoreo, fiado, conteos, historial de precios, devoluciones, combos, compras con conversión de unidades, vista cliente.

### Matriz de corrección — `docs/baseline/correccion.md`
> Responde: **¿copié un defecto?**

Comportamiento nuevo obligatorio. Cada escenario **falla contra el sistema viejo y pasa contra el nuevo**. Cubre los 8 P0, los 15 P1 y los 6 de seguridad.

Ambas corren en CI. Fallan por razones distintas y se leen distinto.

---

## 5. Escenarios de concurrencia — los seis que importan

Ejecutados con hilos reales en paralelo, no simulados.

| ID | Escenario | Resultado esperado |
|---|---|---|
| `CONC-01` | Dos ventas simultáneas del mismo SKU con stock justo | Una vende, la otra recibe stock insuficiente. **Nunca stock negativo** |
| `CONC-02` | Dos aperturas de caja en la misma terminal | Una gana, la otra recibe conflicto tipado |
| `CONC-03` | Dos dispositivos abren la misma mesa | Una sola orden activa; la otra recibe conflicto |
| `CONC-04` | Doble toque al enviar comanda | Una sola comanda, por idempotencia |
| `CONC-05` | 100 cobros simultáneos | 100 folios consecutivos, sin colisión ni hueco |
| `CONC-06` | Diez pedidos QR simultáneos del mismo token | Una sola orden |

---

## 6. Escenarios de inyección de fallos — los cuatro que importan

Se interrumpe un paso **interno** de la transacción y se verifica que no queda nada a medias.

| ID | Dónde se interrumpe | Verificar |
|---|---|---|
| `FAULT-01` | En `cobrarOrden`, después del pago y antes del stock | Cero orden pagada, cero movimiento, folio no consumido |
| `FAULT-02` | En `enviarComanda`, a mitad de las líneas | Cero comanda parcial, totales sin cambiar |
| `FAULT-03` | En `recibirCompra`, entre la compra y la entrada de stock | Cero compra registrada, cero stock agregado |
| `FAULT-04` | En `devolverOrden`, entre el reembolso y el retorno a inventario | Cero devolución registrada |

**Verificación obligatoria de cada uno:** quitar la transacción hace que la prueba falle. Si no falla, la prueba no vale.

---

## 7. Datos sintéticos mínimos

Los mismos que definió la auditoría de Fase 0, ampliados:

- Dos organizaciones, dos sucursales por organización, dos terminales por sucursal.
- Los siete roles.
- Productos: precio fijo · variable por medida · porción de contenedor · servicio · combo · con modificadores obligatorios y opcionales · con receta · con ingrediente excluible.
- Stock: suficiente · exacto · insuficiente · con venta sin stock permitida.
- Mesas: libre · ocupada · en preparación · con cuenta solicitada.
- Pagos: individuales · mixtos · con y sin propina · a crédito.
- Archivos: válidos · disfrazados · fuera de límites.
- Reloj y zona horaria controlados.
- **Nombres con caracteres peligrosos:** HTML, comillas, emojis, saltos de línea, unicode largo.

---

## 8. Definición de terminado — la lista universal

Un corte no se cierra sin las diez. Aplica a los seis cortes.

- [ ] `pnpm verify` verde desde un **clon limpio** (format · lint · typecheck · unit · integration · build).
- [ ] **Cero** errores de lint y de tipos.
- [ ] Todos los escenarios del corte pasan, incluidos concurrencia y fallo.
- [ ] Cada defecto cerrado tiene su campo **"verificado con"** lleno.
- [ ] Ningún archivo supera 300 líneas.
- [ ] Cero BLOCKERS de `morphiq-prs` aplicables al corte.
- [ ] Los CRITICAL abiertos están documentados y aceptados por escrito.
- [ ] `BITACORA.md` con una entrada por tarea.
- [ ] El cuadro de estado de `00-INDICE-Y-COMO-USAR.md` actualizado.
- [ ] **Miguel lo abrió en su máquina y lo usó.**

### Lo que NO cuenta como terminado

Tomado de `/CONTEXTO_MAESTRO.md` y del estándar `morphiq-prs`:

- "El build pasó" con lint o tipos rojos.
- "La pantalla está oculta" sin autorización en el backend.
- "Hay respaldo" sin restauración probada.
- "El doble toque está bloqueado" sin idempotencia distribuida.
- "Es multiempresa" sin pruebas de aislamiento.
- "Ya no se importa el SDK" mientras existan URLs, servicios o artefactos dependientes.
- "La función existe" sin prueba de regresión, auditoría y manejo de fallo.
- "Se ve bien" sin revisión de contraste, foco y teclado.

---

## 9. Presupuesto de tiempo

~20–25 % del esfuerzo del corte. En jornadas:

| Corte | Jornadas totales | De pruebas |
|---|---:|---:|
| F1.0 | 5–7 | 1.5–2 |
| F1.1 | 12–16 | 3–4 |
| F1.2 | 15–20 | 4–5 |
| F1.3 | 12–16 | 3–4 |
| F1.4 | 20–28 | 5–7 |
| F1.5 | 10–14 | 2–3 |

**No es tiempo perdido:** es el tiempo que los dos sistemas fuente no invirtieron, y por eso hoy tienen el cobro sin transacción, los permisos rotos y el stock que se pisa. Ese es el costo real de haberlo ahorrado.
