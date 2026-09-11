# 007 · El port del restaurante — T1 y T2

**2026-09-09 · Claude Code · `main`**

## El titular

Miguel abre la URL y ve **su** sistema: su barra lateral negra con el gradiente
del elemento activo, sus dos fuentes, su modo oscuro con la animación de 480 ms,
y su pantalla de acceso con el teclado de cuatro dígitos.

Su código **se copió**. No se leyó como especificación: `index.css` entero,
`ThemeContext`, `brandColors`, `darkPalettes`, `AppLayout`, `Sidebar`,
`BrandedBackground`, `BrandColorsApplier`, `ThemeToggle`, `POSLogin`,
`ConfigContext`, `POSAuthContext`, `permissions`, `packageConfig`, `constants`,
`useRouteCleanup`, `PageHeader`, `EmptyState`, `LoadingState`.

## T1 · Su diseño

Su `index.css` está entero, partido en tres archivos **sólo** por el límite de
300 líneas: `mh-tokens.css`, `mh-oscuro.css` (su PARCHE DARK completo) y
`mh-impresion.css` (el blindaje de tickets y PDFs, las diez reglas numeradas,
el térmico de 80 mm y el `@page`). Ni una declaración cambió.

Tres adaptaciones, y están escritas en la cabecera del archivo:

1. `@tailwind base/components/utilities` (Tailwind 3) → `@import 'tailwindcss'`
   (Tailwind 4), que es la versión de esta aplicación.
2. Sus tokens se declaran además en `@theme inline`, porque Tailwind 4 no lee un
   `tailwind.config.js`. Ahí es donde `bg-sidebar`, `bg-card` y
   `text-muted-foreground` vuelven a existir.
3. Sus fuentes —Inter y DM Sans, las mismas— ya no se piden a
   `fonts.googleapis.com`. La CSP de esta aplicación es `style-src 'self'` y
   `font-src 'self' data:`: ese `@import` lo bloquearía el navegador y la
   tipografía caería al `sans-serif` del sistema. Las sirve `next/font` desde
   nuestro propio origen.

La clase del modo oscuro es la suya, `dark`. Se pone junto a `oscuro` en el
`<html>` para que las 36 primitivas de `@morphiqpos/ui` —que escriben `oscuro:`—
sigan funcionando sin tocarlas: **dos nombres, un solo modo oscuro**.
`next-themes` se retiró; dos sistemas de tema conviviendo es la misma trampa que
los tres sistemas de avisos que ya costó una sesión.

## T2 · Su login

La misma pantalla: el degradado, los dos halos de marca, el logo con su
`drop-shadow`, los cuatro puntos, el teclado con su `<style>` de hover, el panel
de usuarios de abajo con sus tres estados.

**El PIN se comprueba en el servidor.** Su `tryLogin` hacía
`usuarios.find(u => u.pin === pinToUse)` en el navegador, con los PIN de toda la
plantilla descargados en memoria: el agujero P0-01. Ahora es una petición a
`/api/auth/entrar`, que verifica con Argon2id y pimienta contra un hash que no
sale de la base, cuenta intentos y bloquea.

### Se retiró el enrolamiento de terminal

No lo pidió nadie y dejaba una caja nueva sin poder vender hasta que alguien
fuera a gestión a generar un número de seis dígitos. Fuera: la pantalla
`/enrolar`, su ruta de API, el comando `identidad.generar_codigo`, los tres
helpers de código en `pin.ts` y las tres funciones de repositorio.

En su lugar, el dispositivo se da de alta **solo**, y sólo **después** de
verificar el PIN — sin credencial correcta no se crea nada. Hay un contrato de
mutación que lo sostiene: adelantar la creación de la terminal antes de
`verificarPin` pone `la_terminal_se_crea_despues_de_verificar_el_pin` en rojo.

Como la pantalla de acceso lista empleados **antes** de que exista sesión,
alguien tiene que decirle al servidor de qué negocio son. Ese alguien es el
despliegue: `ORGANIZACION=<slug>`, opcional si la base tiene una sola
organización activa, y con varias **falla nombrando la variable que falta** en
vez de enseñar la plantilla de otro negocio.

## Las tres consecuencias visibles, dichas en voz alta

1. **Hay que tocar el nombre antes de teclear.** Su texto decía «Toca tu nombre
   *o* escribe directamente tu PIN»; ahora dice «*y*». El servidor necesita
   saber de quién es el PIN: probarlo contra toda la plantilla sería el barrido
   que el límite por IP existe para frenar. Cuando el negocio tiene una sola
   persona dada de alta, se selecciona sola y el flujo queda idéntico al suyo.
2. **`ensureDefaultAdmin()` no vuelve.** Creaba un administrador con PIN `1234`
   desde el navegador. Un alta de credenciales que puede disparar cualquiera que
   abra la página no tiene sitio. El primer acceso lo da `pnpm db:bootstrap`.
3. **El aviso de «sigues con el PIN 1234» tampoco.** Dependía de leer los PIN
   desde el cliente; con el hash en la base, decírselo al navegador exigiría
   mandarle una pista sobre la credencial.

## Puertas

| | |
|---|---|
| `pnpm verify` | Las 22 puertas en verde |
| Pruebas | 391 unitarias · 7 arneses · 79 mutaciones |
| E2E | **16 de 16**, en escritorio y tablet, contra Postgres real |
| Arnés de identidad | 11 contratos · 11 destructivas · 6 contra pruebas · 3 inocuas |

Dos contratos cambiaron porque cambió la propiedad, no porque estorbaran:

- `la_terminal_decide_la_organizacion` → `la_organizacion_no_viene_del_cliente`.
  Ahora mira el esquema zod de la ruta y el origen del id. Se validó mutando:
  meter `organizacion: z.string()` en el cuerpo lo pone en rojo.
- `generar_codigo_suelta_el_dispositivo` → `el_token_del_dispositivo_se_guarda_hasheado`.
  Guardar el token en claro lo pone en rojo.

Y uno nuevo: `la_terminal_se_crea_despues_de_verificar_el_pin`.

```
Destructivas que FALLAN: dejar que el cliente diga en qué negocio entra ·
  dar de alta la caja ANTES de comprobar el PIN · guardar el token en claro
Inocuas que PASAN: línea en blanco de más en pin.ts · partir el where en
  cuatro líneas · renombrar un local del arranque
```

## Dos fallos que sólo aparecieron ejecutando

1. **La barra lateral salía sin un solo botón.** Los roles de la base son
   `dueno`/`cajero`; los de su `permissions.js` son `administrador`/`caja`.
   `getNavForRole('dueno')` devolvía lista vacía. Se traduce en un solo sitio
   (`mh/lib/roles.ts`), y la etiqueta que se enseña es la real: un dueño dice
   «Dueño», no «Administrador». `almacen` no tiene equivalente y se queda sin
   menú a propósito — darle el de administrador sería regalarle configuración.
2. **Dos navegadores entrando a la vez chocaban.** `terminales_nombre_unico` es
   `(sucursal_id, lower(nombre))`: los dos contaban las mismas cajas y proponían
   el mismo «Caja 3». Lo encontró el E2E corriendo escritorio y tablet en
   paralelo. Ahora el conflicto —y **sólo** ese código, `23505`— se reintenta con
   el siguiente número.

Y uno más, de caché: la configuración se pedía en la pantalla de acceso, moría
con 401 y se quedaba en caché, así que después de entrar el negocio se llamaba
«MH Astral Systems» y la barra lateral enseñaba menús de un paquete que ese
negocio no tiene. Ahora la consulta no se lanza sin sesión y se invalida al
entrar; al salir se limpia entera, para que la siguiente persona no vea los
datos de la anterior.

## Lo que NO hice

- **Sus pantallas de T3 a T6 no están.** POS, Productos, Caja, Inventario y
  Recetas siguen en `historico/`. La raíz enseña, con su diseño, qué pieza está
  y cuál falta.
- **Las pantallas provisionales siguen vivas** en `/venta`, `/corte`,
  `/productos`, `/inventario`, `/recetas`, `/accesos` y `/configuracion`, y con
  su layout viejo. Se retiran una por una el día que la suya ocupa su lugar
  —primero lo aditivo, luego se despliega, y sólo entonces se quita lo viejo—.
  Mientras tanto, los enlaces de su barra lateral a `/mesero`, `/cocina`,
  `/ventas`, `/compras`, `/registros` y `/portal-qr` **dan 404**.
- **Cuatro componentes de su `AppLayout` no se portaron**:
  `NotificationsWatcher`, `SolicitudesQRWatcher`, `PedidoListoWatcher` y
  `MobileAdminRadialMenu`. Los tres primeros escuchan entidades que este backend
  no tiene todavía —notificaciones, solicitudes del portal QR, órdenes de mesa—.
- **La ficha de empleado no guarda foto.** Su panel de usuarios dibuja la
  inicial, que es lo que su propio componente hacía cuando no había foto.
- **`sembrar-demo.mjs` ya no siembra las tres organizaciones.** Un despliegue
  sirve a un negocio; sembrar tres por HTTP exigiría tres servidores. Ahora
  siembra la que se le diga.
- **No hay una organización de restaurante.** Las tres sembradas son ferretería,
  abarrotes y cafetería. El paquete de su sistema se deriva del giro
  (`restaurante`/`cafeteria` → `restaurante_pro`, el resto → `operativo`), y esa
  traducción vive en un solo sitio esperando a que la base guarde el nivel
  contratado de verdad.
- **`verify:primitivas` exime `apps/web/src/mh`.** Su código usa literales de
  Tailwind a propósito y su `index.css` trae una capa entera —el PARCHE DARK—
  para resolverlos en modo oscuro. Aplicarle esa puerta sería reescribir su
  diseño para pasar una regla escrita para otro sistema de tokens. La regla
  sigue viva para todo lo demás.
- **Sin revisión con lector de pantalla, sin Lighthouse, sin Core Web Vitals**
  sobre las pantallas nuevas.
