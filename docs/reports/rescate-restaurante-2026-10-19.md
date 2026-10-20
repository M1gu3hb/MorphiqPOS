# Acceso y recorrido del restaurante · 19 de octubre de 2026

Encargo de Miguel: integrar el trabajo aprovechable a `main`, recuperar el recorrido del
restaurante anterior, crear una sola cuenta nueva de dueño general y permitir presentar los
cinco modelos sin mezclar sus datos. Producción estaba en `25c0fdd`; el trabajo de Claude
estaba en `167f9eb`, incluyendo las etapas de diseño y estabilización todavía no publicadas.

## Comportamiento

- Dueño y administrador abren `/`. El mesero abre `/mesero`, cocina `/cocina` y caja `/caja`.
- El menú principal del restaurante vuelve a las pantallas heredadas completas. El dueño
  conserva además acceso a las pantallas nuevas; los operadores conservan el menú de su puesto.
- La navegación deja de crear una función distinta en cada render. Entrar con PIN consulta
  la sesión real y recarga el árbol del servidor con su cookie y plantilla actuales.
- El dashboard ofrece accesos directos a mesas, caja, cocina, distribución, apariencia y
  presentación. Configuración admite `?tab=mesas`, `?tab=apariencia` y `?tab=presentacion`.
- Los ocho estilos existentes se exponen también en Configuración → Apariencia. El cambio
  visual deliberado en el heredado está motivado en `scripts/aspecto-permitido.json`.
- Se conserva el mapa original con posiciones libres en escritorio, lista móvil y colores
  semánticos por estado. El editor existente sigue en Configuración → Mesas.
- Salir revoca la sesión del servidor, su acceso de presentación y limpia el árbol del cliente.
- En la comprobación visual se encontró otro defecto del PIN: el campo real tenía
  `value=""` y un `onChange` vacío. Pegar o autocompletar no hacía nada. Ahora es un campo
  password controlado por el PIN y acepta los cuatro dígitos completos, además del teclado.

## Dueño general y presentación

Se creó una única cuenta Miguel mediante `identidad.guardar_empleado`, con Argon2id y la
credencial solicitada por su titular. No se modificaron las contraseñas de cuentas existentes.
Su entrada está en `demo-acople-restaurante`. Los identificadores y credenciales no se
incorporan al código ni a esta documentación.

La concesión del servidor vive en dos campos protegidos de la configuración del negocio de
origen: `presentacion_dueno_empleo` y `presentacion_destinos`. Cada destino declara la pareja
exacta empleo/organización. Los campos no se devuelven por el puente ni se pueden editar
mediante sus comandos genéricos. Otros dueños de la demostración no pueden modificar ni
rotar el PIN de esta cuenta general.

`/api/presentacion` comprueba el PIN para desbloquear y emite una cookie HttpOnly. Cambiar
contexto sólo acepta destinos concedidos que también sirve el despliegue. Emite una sesión
del negocio elegido, ligada a la sesión revocable del dueño original. Relee la concesión en
cada petición y conserva el actor original en la auditoría. No cambia el giro, el paquete ni
los datos del negocio de origen. Una recarga completa descarta las cachés del contexto anterior.

Se concedieron los cinco negocios `demo-acople-*` y Restaurante MH, no todos los negocios
que existan o puedan crearse en la base.

## Base de datos

Aplicadas y comprobadas las migraciones existentes 181 y 182, con sus hashes registrados en
`public._migraciones`. Amplían métodos de pago/devolución y añaden la referencia de una
devolución a su documento de crédito. No borran operaciones.

## Verificación y límites

La suite unitaria completa pasó 4,118 casos (3 omitidos) en `America/Mexico_City` antes de la
comprobación final de despliegue. Incluye pruebas nuevas de navegación por puesto, concesión
explícita por empleo/organización, protección de la cuenta general y revocación de contextos.
Se ejecutaron además TypeScript, ESLint y la comparación del aspecto heredado.

El build local no pudo descargar Inter y DM Sans desde Google Fonts; la compilación real
debe comprobarse en Vercel. Esto no equivale a una compilación local aprobada.

La CI heredada tiene pendientes ajenos a este recorrido: falta el archivo del día completo
de restaurante y hay fallos conocidos en el día completo de estética y en capturas de galería.
Este rescate no certifica que cada función de cada modelo esté terminada ni que exista paridad
visual exacta con la aplicación externa de Base44.

## Continuación · 20 de octubre · acceso central del maestro

Miguel aclaró que el enlace central debe servir a su equipo y sus demostraciones, sin
una dirección obligatoria por negocio. A-52 / D-42 superan esa interpretación de la
estabilización y la prohibición de extraer/copiar módulos para clientes independientes.

`/login-pos` muestra el teclado y las cuentas. La lista enumera únicamente contextos
servidos por el despliegue; distingue la concesión general de los roles de demostración.
La interfaz abre Equipo Morphiq para que la cuenta general no se confunda con los dueños
de cada modelo; permite escoger otra demo y su puesto sin cambiar de dirección. Cookies
recordadas y terminal no ocultan el acceso general. Los enlaces por slug se conservan
como atajos acotados, sin ampliar destinos ni privilegios.

Se agrega `/presentacion` y un enlace del dueño general en el menú de todos los giros.
El backend de cambio de contexto conserva las comprobaciones anteriores. No hay nuevas
migraciones, cambios de contraseña ni eliminación/movimiento de cuentas en esta continuación.

La prueba del acceso central se escribió primero: tres casos fallaron contra la ruta
anterior (entrada inicial 404, encierro por cookie y encierro por terminal). Después de la
corrección pasaron los ocho casos, incluyendo enlaces acotados y rechazo de slugs no servidos.
La suite completa volvió a pasar 4,118 pruebas con 3 omisiones preexistentes, y tipos en
los siete paquetes. Se comprobó visualmente la sesión de Miguel, Apariencia con sus ocho
estilos y Mesas con mapa por zonas y posiciones guardadas al arrastrar. No se movieron
mesas ni se modificaron operaciones para esta comprobación de interfaz.

El encargo de continuación para Claude está en
[CONTINUAR-CLAUDE-2026-10-20.md](CONTINUAR-CLAUDE-2026-10-20.md).

El menú principal conserva «Mesas y pedidos» y «Cocina» en vez de pluralizar puestos.
Las pantallas nuevas del restaurante se agrupan bajo Vistas adicionales, sin retirar
rutas. Una prueba que antes recibía «Meseros» acredita la corrección de la etiqueta.
El primer ESLint completo agotó el heap predeterminado; se ejecutó con 6 GiB de heap y
pasó sin errores, conservando las mismas reglas.

La verificación final de esta continuación pasó 4,119 pruebas (3 omitidas preexistentes),
tipos de los siete paquetes, ESLint y la comparación del aspecto con los cambios de UX
explícitos registrados. La comprobación de enlaces encontró 86 pantallas servidas y
66 enlaces válidos, sin enlaces interpolados.

## Comprobación en producción · c9028da

Vercel compiló y publicó la corrección central. Se verificó por HTTP sin cookies el
teclado en `/login-pos`, seis contextos servidos y una cuenta general Miguel. Su login
resolvió dueño general/restaurante; configuración, mesas, productos terminados,
categorías y ventas respondieron. Se desbloqueó la presentación y se recorrieron los
seis contextos comprobando organización, modelo y privilegio general en cada uno.
Salir revocó la sesión y devolvió el mismo login central con la cuenta general disponible.

En navegador se verificaron el dashboard con el menú principal corregido, despliegue
/ocultación de vistas adicionales, enlace permanente a Modelos de negocio y regreso al
login central al salir. El selector muestra Equipo Morphiq y permite acceder a los
puestos de cada demostración. Se ajustó un último detalle: si sólo hay una cuenta general
se preselecciona, y su rótulo no incluye el nombre técnico del contexto de origen.
