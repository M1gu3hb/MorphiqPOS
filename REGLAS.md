# Reglas no negociables — MorphiqPOS

Si una propuesta viola una de estas reglas, se rechaza. No se debaten caso por caso: se debate la regla, y si cambia, se registra en `DECISIONES.md`.

---

## Producto

**R1 — El sistema se adapta al negocio, no al revés.**
El valor de Morphiq es entregar algo que parezca construido específicamente para ese cliente. Toda decisión que empuje al cliente a cambiar su operación para caber en el software va en contra del producto.

**R2 — Personalizar debe ser barato para nosotros.**
Toda petición se resuelve en el nivel más bajo posible: configuración → composición → extensión → núcleo. Si el Nivel 4 se usa seguido, el modelo de capacidades está mal diseñado.

**R3 — El fork está prohibido.**
Un proyecto de cliente **declara dependencias, nunca copia código**. La primera vez que se forkee, MorphiqPOS deja de existir y vuelven a ser N sistemas sueltos.

**R4 — Cada corte debe agregar un capítulo al guion de demostración**, o ser cimentación obligatoria de algo que sí lo hace.

**R5 — Nada entra al corte actual si no es lo que un negocio real necesitaría para operar un día completo sin Miguel presente.**

---

## Independencia

**R6 — Base44 desaparece por completo de la implementación.**
Sólo puede aparecer en evidencia histórica y en documentos de auditoría que expliquen la retirada. Cero SDK, plugins, servicios, dominios, variables, identificadores o activos remotos.

**R7 — Cero lógica de negocio en RLS, Edge Functions o cualquier servicio propietario.**
El backend completo debe poder desplegarse con Docker en el servidor privado de un cliente, sin internet. Esta es la regla que impide repetir el error de Base44 con otro proveedor. RLS existe sólo como defensa en profundidad.

**R8 — Ninguna tecnología entra por estar de moda.**
Ni microservicios sin necesidad medible, ni dependencias sin uso demostrado.

---

## Corrección técnica

**R9 — Los precios, impuestos y descuentos se calculan y verifican en el servidor.**
Nunca se confía en el total que envía el cliente.

**R10 — Cobro, comanda, stock, caja, mesa y compra son transaccionales e idempotentes.**
O confirma todo, o no persiste nada. Un reintento produce el mismo resultado, no un duplicado.

**R11 — Los permisos se aplican en el servidor, por acción y recurso.**
Ocultar un botón o una ruta no es autorización. Toda regla de permiso tiene prueba negativa por rol.

**R12 — Ningún error crítico se silencia.**
Nada de `catch(() => {})`. Si el paso falla, la transacción falla.

**R13 — El stock es un ledger inmutable.**
Se insertan movimientos y el saldo se deriva. Nunca leer-calcular-escribir un total.

**R14 — Los estados cambian por máquina de estados explícita.**
No existe el `update` libre de un campo `estado`. Una transición no declarada es un error del sistema.

**R15 — El dinero se maneja en unidades menores enteras o decimal exacto, con moneda explícita.**
Los folios son consecutivos atómicos por ámbito, no fecha más aleatorio.

**R16 — Toda entidad operativa pertenece a una organización y, cuando aplique, a una sucursal.**
El ámbito viene de la sesión del servidor, jamás de un parámetro del cliente.

---

## Calidad

**R17 — Ninguna función se declara terminada sin su prueba.**
La prueba se escribe antes que el código. "Compila", "abre" o "la pantalla se ve" no son criterios de terminado.

**R18 — Cada corte pasa el estándar `morphiq-prs` antes de abrir el siguiente.**
Es el "zero vibe coding" y es la defensa contra fingir la demo en vez de construirla.

**R19 — Lint y tipos en cero errores, desde el primer commit.**
Después nunca se recupera. El POS de restaurante llegó a 1,592 diagnósticos de tipos por no aplicar esto.

**R20 — Un respaldo sin restauración ensayada no cuenta.**

**R21 — Se trabaja un corte a la vez.**
Se termina y se entrega antes de abrir el siguiente. Con una persona a medio tiempo, dos frentes en paralelo son cero frentes terminados.

---

## Modularidad

**R22 — Activar o desactivar una capacidad debe afectar coherentemente la interfaz, el backend, los permisos, los procesos automáticos, los eventos y la configuración.**
Ocultar rutas no es modularidad.

**R23 — Cada capacidad declara** clave y versión, ámbito, dependencias, incompatibilidades, permisos que introduce, migraciones y datos que crea, eventos que publica y consume, configuración por defecto, cómo se activa y desactiva, qué pasa con su histórico al desactivarse, y cómo se prueba aislada y conectada.

**R24 — Desactivar un módulo no corrompe datos ni deja flujos inconclusos.**
El histórico permanece legible según permiso; nunca se borra en silencio.

**R25 — Los módulos colaboran por contrato, nunca importando código entre sí.**

**R26 — Los entitlements comerciales (qué compró el cliente) son distintos de los permisos de usuario (qué puede hacer una persona).**
Nunca se mezclan.

---

## Evidencia y decisiones

**R27 — Toda afirmación se marca como confirmada, inferida, propuesta o pendiente.**
La falta de acceso a algo no se rellena inventando.

**R28 — Ninguna decisión estructural se toma sin registrar alternativas y consecuencias en `DECISIONES.md`.**
Si no está escrita, no existe.

**R29 — Una decisión superada no se borra: se marca y se apunta a la nueva.**

**R30 — El ZIP histórico y los repositorios fuente son evidencia, no plantilla.**
Se leen al lado; no se copian archivos. No se conservan defectos por conservar comportamiento.

---

## Seguridad y privacidad

**R31 — Cero secretos en el cliente, en documentos o en repositorios.**
Ningún PIN, contraseña, token, cookie, correo de usuario o dato de cliente. Los valores sensibles descubiertos en auditoría se marcan `[REDACTADO]` y se rotan en la migración.

**R32 — Ninguna credencial heredada se importa como válida.**
Todo PIN y contraseña del sistema anterior se rota con enrolamiento nuevo.

**R33 — La frontera pública (portal QR, tienda en línea) es una API separada y estrecha.**
Token con alcance y caducidad, rate limit, catálogo público mínimo, precio recalculado en servidor, comandos idempotentes, cero acceso a entidades internas.

**R34 — Nada de este proyecto se publica en un repositorio público si describe vulnerabilidades de sistemas que hoy operan con clientes reales.**
