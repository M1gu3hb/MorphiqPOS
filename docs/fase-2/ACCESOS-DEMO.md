# ACCESOS DE DEMOSTRACIÓN

Con qué entrar a cada uno de los cinco modelos, qué puede hacer cada persona y qué mirar primero.
Escrito el 17 de septiembre de 2026 al cerrar la etapa 2.3 de la Fase 2.

> **Estos PIN no son secretos de producción.** Son datos de demostración de un sistema privado,
> puestos a propósito para que cualquiera pueda abrir cada modelo y ver de qué habla. Están
> escritos aquí tal cual porque el documento sirve para eso. **Ninguno de los cuatro negocios que
> cobran aparece en este archivo**, y ninguno de estos PIN abre uno.
>
> Los PIN de esta página **se comprobaron uno por uno contra su hash Argon2id** el 17-09-2026, no
> se copiaron de la semilla. Si uno deja de funcionar, lo que cambió es la base, no este archivo.

---

## 1 · Los cinco negocios

| Slug | Nombre | Giro | Plantilla | Catálogo | Caja |
| ---------------------- | ---------------------------- | ------------ | ------------- | ------------------------------ | ---------------- |
| `demo-acople-restaurante` | Demo del acople · restaurante | `restaurante` | `restaurante` | 27 vendibles · 33 insumos · 12 mesas | abierta, $3 000 |
| `demo-acople-cafeteria` | Demo del acople · cafeteria | `cafeteria` | `cafeteria` | 18 vendibles · 16 insumos | abierta, $1 000 |
| `demo-acople-tienda` | Demo del acople · tienda | `tienda` | `tienda` | 22 vendibles | abierta, $1 200 |
| `demo-acople-ferreteria` | Demo del acople · ferreteria | `ferreteria` | `ferreteria` | 25 vendibles | abierta, $2 000 |
| `demo-acople-estetica` | Demo del acople · estetica | `estetica` | `estetica` | 24 vendibles · 16 servicios · 2 profesionales | abierta, $1 500 |

La **caja está abierta** en las cinco a propósito: sin ella no se puede cobrar, y una demostración
que empieza pidiendo «abre la caja» enseña un trámite en vez del producto. El fondo va desglosado en
monedas, billetes chicos y grandes (F-984): «$1 500» no dice si se puede dar cambio.

---

## 2 · CON QUÉ SE ENTRA

El PIN es **el mismo para el mismo rol en los cinco modelos**, a propósito: así al revisar se sabe
con quién se entró sin mirar dos veces.

| Rol | PIN | Qué es esa persona |
| --------------- | -------- | ------------------------------------------------ |
| Dueño | **1234** | Lo puede todo. Es el único que cambia la plantilla |
| Gerente | **2345** | Ve lo mismo que el dueño en el menú; el servidor le cierra lo que no le toca |
| Cajero | **3456** | Cobra, abre y cierra caja, ve ventas |
| Mesero / estilista | **4567** | La sala o la agenda. No ve costos ni configuración |
| Cocina / barista | **5678** | Sólo lo que hay que preparar |
| Almacén | **6789** | Recibe mercancía, cuenta y traspasa. No toca la caja |

### Las personas, por negocio

| | Dueño | Gerente | Cajero | Atiende | Prepara | Almacén |
| ------------- | ----- | ---------------- | ----------------- | -------------------- | ------------------ | ---------------- |
| restaurante | Demo | Beatriz Salgado | Rosa Miranda | Lupita Ramírez | Toño Barrera | Nacho Peralta |
| cafeteria | Demo | Fernanda Lozano | Diana Arreola | — | Emilio Cázares | Sergio Pineda |
| tienda | Demo | Laura Beltrán | Jesica Ovalle | — | — | Poncho Mendoza |
| ferreteria | Demo | Elena Zúñiga | Karla Estrada | — | — | Rubén Garza |
| estetica | Demo | Paty Villalobos | Nayeli Cortés | Karla Domínguez (**4567**) y Dany Robles (**4568**) | — | Sandra Ochoa |

**La estética tiene DOS estilistas y no es un adorno:** su agenda se lee por columna, una por
persona, y con una sola no se puede ver el solape, ni el hueco de las 3 pm, ni la comisión por
persona — que son el negocio de ese modelo. Karla es *senior* y Dany *estilista*, con nivel distinto
también a propósito: el mismo servicio puede costar y durar distinto según quién lo haga.

Una tiendita y una ferretería **no tienen** quien atienda ni quien prepare, y eso también es el
producto: en un mostrador quien cobra es quien entrega.

---

## 3 · CÓMO SE ABRE CADA UNA

Un despliegue sirve a **un** negocio, y desde la etapa E5 lo decide, en este orden:

1. **el HOST de la petición**, si su primera etiqueta es el slug: `demo-acople-tienda.<dominio>`;
2. **`ORGANIZACION`**, la variable del entorno del servidor;
3. la única organización activa, si hubiera una sola.

### En local, una por una

```bash
ORGANIZACION=demo-acople-estetica APP_URL=http://localhost:3200 MORPHIQPOS_DB_POOL_MAX=3 \
  pnpm --filter @morphiqpos/web exec next start -p 3200
```

Abre `http://localhost:3200/login-pos`, toca el nombre y teclea el PIN.

`APP_URL` tiene que ser la del PROPIO servidor: el servidor compara el `Origin` del navegador contra
ella, y con otra puesta el login devuelve **403 SIN_PERMISO** — y el rastro dice «timeout esperando
la navegación», que manda a buscar el defecto donde no está.

### En el despliegue

Poniendo `ORGANIZACION` al slug de la demo y **redesplegando**: las variables se aplican al
construir, no en caliente.

> **Lo que falta para que las cinco se abran a la vez.** El paso 1 —el host— ya está en el código y
> con él un solo despliegue serviría a las nueve organizaciones. Falta lo que no es código: un
> **comodín de DNS** (`*.<dominio>` apuntando a Vercel) y esos hosts añadidos al proyecto. Hoy el
> dominio `pos-mh-astral-systems.com` **no tiene ni el registro A** que Vercel pide, así que ni el
> principal resuelve. Mientras eso no esté, cada demo se abre con `ORGANIZACION` y un redespliegue,
> o en local.

---

## 4 · QUÉ VE CADA PLANTILLA

El menú lo decide la plantilla; los nombres, el giro. Las entradas del **punto de venta de todos los
días** —`/mesero`, `/caja`, `/ventas`, `/compras`, `/registros`, `/portal-qr`— van detrás de las del
modelo, y sólo donde el modelo no cubre ese módulo.

### restaurante — 16 entradas

Mesas · Mesa activa · Precuenta · **Cocinas** · Cobro · Caja · Cierre y arqueo · **Platillos** ·
Recetas · Inventario · Registros · **Meseros** · Compras · Portal QR · Tablero · Configuración

*En negrita, lo que el diccionario del giro renombra: «Productos» se lee «Platillos», «Cocina» se
lee «Cocinas», y la entrada `/mesero` se lee «Meseros».*

### cafeteria — 17 entradas

Cobrar · Opciones de la bebida · Cobro y propina · **Barras** · Recogida · Turno · Cierre de turno ·
Clientes y sellos · Productos · Recetas · Inventario · Ventas · Compras · Registros · Portal QR ·
Tablero · Configuración

*No tiene «Meseros»: su plantilla no incluye el módulo `mesero`, porque en un mostrador quien cobra
es quien prepara y quien entrega. Sí tiene «Barras», que es su fila esperando.*

### tienda — 17 entradas

Cobrar · Caja · Fiado · Servicios · Productos · Alta rápida · Existencias · Entradas · Conteo ·
Cortes · Registros · Ventas · Recetas · Compras · Portal QR · Tablero · Configuración

### ferreteria — 19 entradas

Mostrador · Caja · Cotización · Cuentas · Corte de material · Trabajos de mostrador ·
**Materiales** · Ficha de pieza · Existencias · Entradas · Conteo · Facturación · Ventas · Recetas ·
Compras · Registros · Portal QR · Tablero · Configuración

*«Materiales» donde la tiendita dice «Productos», con la MISMA entidad del diccionario y otro giro.
Es la demostración de que el vocabulario no sale de la plantilla: sale del giro.*

### estetica — 20 entradas

Agenda · Agendar · Cita en curso · Mi día · Cobrar · Caja y corte · Liquidación · **Clientas** ·
Historial · **Servicios** · **Estilistas** · Productos · Ventas · Recetas · Inventario · Compras ·
Registros · Portal QR · Tablero · Configuración

*Cuatro sustantivos de su giro en el menú: «Clientas» con el femenino por omisión —«el clienta
llegó» delata el sistema en el primer segundo—, «Servicios» por lo que se vende, «Estilistas» por
quien atiende, y «Productos» por lo del anaquel. No tiene «Cocina» ni «Mesas»: su plantilla no trae
el bloque de sala.*

---

## 5 · DÓNDE ABRE CADA PERSONA

No es una preferencia: está decidido en `04-SISTEMA-DE-DISENO §2 eje A`. Se abre en la **primera
entrada del menú que esa persona puede tocar**, y el orden del menú es el del día de trabajo de su
giro.

| Plantilla | El dueño abre en | Por qué |
| ------------- | ------------------------------- | ---------------------------------------------------------- |
| restaurante | `/restaurante/mapa-de-mesas` | Lo primero que se hace es ver quién está sentado |
| cafeteria | `/cafeteria/cobrar` | La fila no espera |
| tienda | `/abarrotes/cobrar` | Con el foco en el escáner |
| ferreteria | `/ferreteria/mostrador` | El cliente trae un tornillo en la mano y dice «uno como éste» |
| estetica | `/estetica-salon/agenda-del-dia` | El hueco de las 3 pm no se recupera mañana |

Y cada rol cae en la primera que le toca: el de cocina de un restaurante abre en la cocina, y su
cajero en el cobro. Sin una segunda tabla que se quede atrás.

---

## 6 · QUÉ PUEDE HACER CADA ROL

**Ocultar un botón no es autorización.** Lo que sigue es lo que cada persona VE; lo que puede
ESCRIBIR lo comprueba el servidor en cada comando, y ahí un cajero que mande la petición a mano
recibe `SIN_PERMISO` igual.

| | Dueño / Gerente | Cajero | Mesero / estilista | Cocina / barista | Almacén |
| ------------------------- | :-------------: | :----: | :----------------: | :--------------: | :-----: |
| Tablero | ✅ | | | | |
| Cobrar, caja y cortes | ✅ | ✅ | | | |
| Ventas | ✅ | ✅ | | | |
| Mesas, mesero, precuenta | ✅ | | ✅ | | |
| Cocina / barra / recogida | ✅ | | | ✅ | |
| Catálogo y recetas | ✅ | | | | ✅ |
| Existencias, entradas, conteo | ✅ | | | | ✅ |
| Compras | ✅ | | | | ✅ |
| Registros y Portal QR | ✅ | | | | |
| Configuración | ✅ | | | | |
| **Cambiar de plantilla** | sólo el DUEÑO | | | | |

**El almacén no tenía menú hasta hoy.** Su rol es del servidor y no se traduce al del frontend
heredado —darle el de administrador «para que no se quede sin nada» sería regalarle configuración,
costos y accesos— así que `hasPermission('almacen', …)` no encontraba ninguna entrada y quien entraba
como almacén veía la pantalla **vacía**. Nadie lo había visto porque hasta que cada demo tuvo un
usuario por rol, nadie había entrado como almacén. Ahora ve lo suyo: existencias, entradas, conteo,
compras y el catálogo que necesita para recibir.

---

## 7 · RECORRIDO SUGERIDO · veinte minutos, los cinco modelos

1. **restaurante, con el dueño (1234).** Abre en el mapa de mesas: doce mesas en tres zonas.
   Toca una → se abre. Agrega dos platillos → van a **Cocinas**. Entra con **Toño (5678)** en otra
   pestaña y verás la comanda. Vuelve, pide la precuenta y cobra con **Rosa (3456)**.
2. **cafeteria, con el dueño.** Cobra un latte en `/cafeteria/cobrar` y mira `Barras`: el pedido
   espera con su cronómetro. Fíjate en el diccionario — dice «pedido» donde el restaurante dice
   «mesa», y «bebida» donde dice «platillo».
3. **tienda.** `/abarrotes/cobrar` con el foco en el escáner. Teclea un código de los 22 productos.
   Luego `Fiado`, que es lo que una tiendita hace y un restaurante no.
4. **ferreteria.** `/ferreteria/mostrador`: busca «cable» y mira que la entrada del catálogo se
   llama **Materiales**, no «Productos». Y `Corte de material`, que es su función propia.
5. **estetica, con Karla (4567).** `Mi día` enseña sólo SUS citas. `Agenda` las de las dos, por
   columna. Abre un tinte en `Servicios` y mira los cuatro tramos: 40 min de aplicación, 25 de
   procesado —en los que la estilista atiende a otra—, 15 de terminado y 10 de limpieza. Ahí está el
   25-40 % de capacidad que un salón no aprovecha.
6. **Y la prueba que más dice:** entra en cualquiera con **almacén (6789)**. El menú es distinto y
   más corto, y no lleva a la caja.

---

## 8 · QUÉ NO ESTÁ EN ESTAS DEMOS

- **Ventas históricas.** El catálogo, el equipo, el proveedor y la caja abierta sí; el historial no.
  Un reseteo de demostración devuelve el negocio a su punto de partida, y eso incluye las ventas.
- **Los cuatro negocios que cobran.** Restaurante MH, Café Jacaranda, Abarrotes Don Chuy y Ferretería
  La Broca no se tocan ni para leer. La guarda de las pruebas de navegador compara por **identidad de
  organización** —no por nombre— y se niega a seguir si el despliegue está sirviendo a uno de ellos.
- **Las funciones bloqueadas** que cada modelo declara en su `FILE-MAP.md`: impresión, CFDI, WhatsApp
  y las que esperan una decisión de Miguel.

---

## 9 · SI ALGO NO ABRE

| Lo que se ve | Lo que es |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| La lista de personas sale vacía | El despliegue no apunta a esta demo. `ORGANIZACION` tiene que valer su slug **en el servidor** |
| El PIN no entra y no dice por qué | Son cuatro dígitos exactos: la pantalla manda en cuanto hay cuatro y no deja teclear un quinto |
| **403** al entrar | `APP_URL` no es la del propio servidor. El `Origin` se compara contra ella |
| Entra y el menú sale vacío | El rol no tiene ninguna entrada en su plantilla. Con `almacen` era así hasta el 17-09-2026 |
| Una pantalla del modelo redirige a otra | La guarda de plantilla: esa pantalla es de otro modelo. Es correcto |
| **500** con `EMAXCONNSESSION` en el registro | El pooler en modo sesión, no la aplicación. Puerto **6543**, no 5432 |
| Todo responde pero sin datos | Faltó sembrar: `node --conditions=react-server scripts/sembrar-demos.mjs` |

Para volver a dejar las cinco como están descritas aquí:

```bash
node --conditions=react-server scripts/sembrar-demos.mjs
```

Sólo acepta slugs `demo-acople-*` y **rechaza por slug** los cuatro negocios que cobran.
