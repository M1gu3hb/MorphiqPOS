# F3 · REGLAS DE ACOPLE

Fecha: 16 de septiembre de 2026
Aplica a: la integración de los cinco modelos de negocio de la Fase 2 al punto de venta vivo.
**Este documento manda.** Si el prompt y este archivo se contradicen, manda este archivo. Si este archivo y una decisión vieja se contradicen, mandan las derogaciones de §2.

---

## 1 · QUÉ SIGNIFICA ACOPLAR

La Fase 2 construyó cinco modelos de negocio **fuera** del punto de venta: 98 funciones, 105 rutas de API, 61 pantallas y 70 migraciones. Todo escrito, nada conectado. Hoy la base viva no tiene ni una tabla de la Fase 2 y el sistema en producción se comporta exactamente igual que antes de empezar.

Acoplar es cerrar esa distancia. Termina cuando Miguel abre la URL de Vercel, entra con su PIN, cambia de plantilla en Configuración, y **ve el punto de venta de ese giro funcionando** — con su vocabulario, sus pantallas, su dashboard y su corte.

No termina antes. No hay entrega parcial.

---

## 2 · LO QUE QUEDA DEROGADO

Estas reglas gobernaron la Fase 2 y **dejan de aplicar ahora**. Están escritas para que nadie se detenga creyendo que sigue prohibido lo que ahora es obligatorio.

| Regla | Estado |
|---|---|
| **D-05 / D-07 · "las migraciones se escriben y NO se aplican"** | **DEROGADA.** Ahora se aplican. Con respaldo y ensayo previos, según §4. |
| **D-09 · "no se editan archivos preexistentes de `heredado/`"** | **DEROGADA.** `carril-b` se fusionó a `main` el 15 de septiembre. Codex ya no trabaja ahí. |
| **"NO toques `scripts/esquema-esperado.json`"** | **DEROGADA**, pero sólo DESPUÉS de aplicar las migraciones. Se regenera al final, nunca antes. |
| **"permisos acotados a lectura"** (prompt 03) | **DEROGADA.** Miguel autoriza escribir en la base de MorphiqPOS, desplegar en Vercel y configurar su entorno. |
| **`verify:fase2` como puerta** | **SUSTITUIDA.** Ahora la puerta es `pnpm verify` completo, con `verify:esquema` y `verify:rls` incluidos, más `verify:acople`. |

| **P-04 · "¿qué pasa con los clientes que ya operan cuando cambie la plantilla?"** | **RESUELTA.** Miguel autoriza el renombre. La respuesta es §4.4: se migra por giro, con respaldo previo y comprobación de los cuatro. |

### 2.1 · Documentos que todavía dicen lo contrario

Vas a leer archivos escritos cuando las prohibiciones de arriba estaban vigentes. **No te frenes con ellos.** Manda esta tabla. Corrige cada uno en el mismo commit en que lo encuentres:

- `packages/data/src/migraciones/sql/058_plantillas_de_negocio.sql` líneas 20-26: *"ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2… condición de la decisión pendiente P-04"*. **Sin efecto.** P-04 está resuelta. Borra ese encabezado.
- `docs/fase-2/BITACORA.md:35` — "D-09 sigue vigente". Ya no.
- `docs/fase-2/00-LEEME-PRIMERO.md:45` y `05-DECISIONES.md:79,111` — "las migraciones se escriben y no se aplican". Ya no.
- `docs/fase-2/F2-PROMPT-01-CINCO-MODELOS.md:283` — "NO toques `scripts/esquema-esperado.json`". Ya no, después de aplicar.
- Los cinco `FILE-MAP.md` — "NO se aplica sin P-04". Ya no.

**Esto importa más de lo que parece:** el ejecutor de migraciones aplica **todas las pendientes o ninguna**, en una sola transacción. No existe forma de saltarse la 058. Si la tratas como excepción, no aplicas nada.

**Lo que NO queda derogado, y sigue siendo inviolable:**

- **El proyecto de Pastelería Confetti (`ivqcxdpqxwjxfohiswqb`) no se toca. Ni para leer.** Es de un cliente que paga y no tiene nada que ver con esto.
- Nunca se edita una migración ya aplicada. El ejecutor valida por hash y aborta.
- Los commits van al usuario de GitHub de Miguel. Ver §9.

---

## 3 · LO QUE CODEX HIZO BIEN Y NO SE ROMPE

Tres pasadas de correcciones dejaron el backend sólido. Al acoplar es fácil pisarlo sin querer. Esta lista es lo que hay que conservar intacto:

1. **`comando()` y `definirComando`.** Rol → paquete → validación → idempotencia → transacción → auditoría, en ese orden, para todos. Un comando que declare `rol`, `organizacion_id`, `sucursal_id`, `empleo_id`, `identidad_id` o `terminal_id` en su entrada **no compila**. No es una prueba que se pueda olvidar: el módulo no carga.
2. **Un solo sitio donde nace un ámbito.** El token lleva a QUIÉN; organización, sucursal y rol se releen de la base en cada petición.
3. **`rolesLectura` obligatorio a nivel de tipo** en toda entidad del puente. Una entidad nueva sin declararlo no compila.
4. **La vista `ordenes_pagos_resumen`** (migración 057, ya aplicada) y `propinaDerivada` como fuente única. Así se arregló de raíz que las propinas salieran en cero. No vuelvas a leer `propina_monto` crudo en ninguna pantalla.
5. **Precios y totales siempre en el servidor.** El endpoint no acepta importes del cliente.
6. **Dinero en bigint de centavos.** Nunca flotantes.
7. **Las propinas no entran en ventas, utilidad, costo ni margen.** El desglose por método es exacto, jamás proporcional.
8. **RLS + FORCE en las 52 relaciones**, cero SELECT para `anon` y `authenticated`, cero EXECUTE público en las tres funciones.
9. **La revocación de sesión falla cerrado.** La resolución ocurre fuera del `try`: un error de base da 500, nunca sesión válida.
10. **Cero SQL concatenado.** Cero `sql.raw`, cero `sql.lit`.
11. **`verify:lecturas` lee los campos descartados por AST**, no de una lista a mano. **`verify:escrituras` falla** con escrituras sin analizar en vez de informar y salir en verde.
12. **Idempotencia con huella canónica**: misma clave + otra entrada da conflicto, no la respuesta guardada.

Si al acoplar algo de esto estorba, **el que cambia es tu código nuevo**, no el de Codex.

---

## 4 · LA BASE VIVA · la parte peligrosa

Cuatro negocios operan hoy sobre `wyqmzhliurwyxuyxznpb`: Restaurante MH, Café Jacaranda, Abarrotes Don Chuy y Ferretería La Broca. Vas a aplicar 70 migraciones sobre esa base. El orden de abajo no es una sugerencia.

### 4.1 · Respaldo · y OJO, porque aquí había un error grave

**`scripts/ensayar-restauracion.mjs` NO ES UN RESPALDO.** Vuelca el esquema `public` a una carpeta temporal, lo restaura en un Postgres desechable, y en su `finally` **borra la carpeta**. No deja archivo. No cubre `auth`, ni políticas, ni storage. Es un ENSAYO. Si lo usas como respaldo, no tienes respaldo.

El respaldo de verdad, antes de la primera migración:

```
supabase db dump --linked --file "D:\MIS PROYECTOS\Master POS\respaldos\<fecha>.sql"
```

Completo: roles, esquema y datos. **Fuera del repositorio** — es público. Y comprobado: restáuralo en un Postgres desechable y confirma que las tablas y las filas cuadran. Un respaldo que no se ha restaurado nunca no es un respaldo, es un archivo.

Deja en la bitácora: la ruta, la fecha, el tamaño, cuántas tablas y cuántas filas.

### 4.2 · Ensayo · sobre una copia CON DATOS, no sobre una base vacía

Esto también estaba mal planteado. `ensayar-restauracion.mjs` aplica las migraciones sobre una base **vacía** y restaura los datos **después**. Con eso, la poscondición de la 058 —la que comprueba que los cuatro negocios quedaron en su plantilla— se ejecuta sobre cero filas y pasa sin probar nada.

El ensayo correcto, en este orden:

1. Levanta un Postgres desechable.
2. **Restaura ahí el volcado del §4.1.** Ahora tienes una copia de producción.
3. Aplica las 70 migraciones encima, con el ejecutor.
4. Comprueba los cuatro negocios y su plantilla, en esa copia.

Sólo así el ensayo prueba lo que va a pasar de verdad. Esto caza lo que las 2 500 pruebas no ven, porque la base falsa no modela `check`, ni claves foráneas, ni exclusiones GiST. Ya pasó una vez: dos `check` de `movimientos_caja` y `movimientos_stock` reventaban y ninguna prueba lo vio.

**Si el ensayo falla, se arregla la migración y se reensaya. A producción no va nada que no haya pasado el ensayo con datos.**

### 4.3 · Aplicar a producción · en UNA sola tanda

**El ejecutor corre las 70 en una sola transacción. Es todo o nada por diseño, y no admite bloques.** No busques un flag `--hasta`: no existe. Eso es bueno — significa que no puede quedarse a medias en la migración 40 — pero significa también que "aplica por bloques verificando entre ellos" es imposible. No lo intentes.

`pnpm db:migrate`, una vez. **Nunca a mano por la consola de Supabase**: eso fue lo que dejó ocho tablas sin RLS en la Fase 1 y costó una pasada entera de correcciones.

Existe `pnpm db:migrate --ensayo`, que aplica y revierte. Úsalo como último ensayo contra producción antes de la tanda real.

`verify:rls` se corre **una vez al terminar la tanda**, no entre bloques.

**Cuidado con el destino por omisión:** si `MORPHIQPOS_SUPABASE_PROJECT_REF` está en el `.env`, `db:migrate` apunta a producción sin pedir confirmación. Confirma contra qué base estás apuntando antes de cada ejecución, y escríbelo en la bitácora.

### 4.4 · El renombre de plantillas · lo único que toca datos de clientes

La decisión D-12 fija cómo se migran los cuatro negocios vivos:

```
giro restaurante|cafeteria + paquete restaurante_pro  →  restaurante
giro restaurante|cafeteria + paquete operativo        →  cafeteria
giro tienda|ferreteria     + paquete operativo        →  tienda
cualquier giro             + paquete esencial         →  tienda
```

Resultado esperado: Restaurante MH y Café Jacaranda en `restaurante`; Don Chuy y La Broca en `tienda`.

**Café Jacaranda se queda en `restaurante` aunque su giro sea cafetería.** Tiene contratado el paquete completo con mesero y cocina; bajarlo a `cafeteria` le quitaría módulos que paga.

Después de aplicarlo, **consulta la tabla y comprueba los cuatro, uno por uno.** Si alguno quedó en la plantilla equivocada, revierte y corrige antes de seguir.

### 4.5 · Nunca pruebes contra los cuatro negocios vivos

Restaurante MH, Café Jacaranda, Abarrotes Don Chuy y Ferretería La Broca **son clientes que cobran**. Sus datos son reales: sus ventas, sus cortes, su inventario.

**Toda prueba de extremo a extremo, todo recorrido de Playwright y toda comprobación manual se hace sobre una organización de demostración**, creada para eso.

`packages/app/bin/alta-negocio.mjs` sirve, con dos avisos:
- Necesita `DATABASE_URL` **directa, con contraseña**. No usa la ruta vinculada del CLI. Si no tienes la contraseña de Postgres, crea la demo con `supabase db query` y documenta el alta.
- Su valor por omisión es `--paquete restaurante_pro`, que **después de la 058 ya no existe** y viola el check. Pásale `tienda`, `cafeteria` o `restaurante`.

Si al terminar quedan ventas de prueba, cortes de prueba o mesas abiertas en cualquiera de los cuatro negocios vivos, el acople **está mal hecho aunque todo lo demás esté bien**.

Lo único que se toca de los cuatro es el renombre de plantilla del §4.4, y eso se comprueba leyendo, no escribiendo.

### 4.6 · Rollback

Antes de aplicar, deja escrito en `docs/fase-2/ROLLBACK-ACOPLE.md`: qué comando restaura, cuánto tarda, y en qué orden se revierte. Si algo sale mal a mitad, no es momento de improvisar.

---

## 5 · EL ORDEN DE TRABAJO

No se salta ni se reordena.

```
A0  Preparación      sincronizar ramas · respaldo · ensayo en Postgres desechable
A1  Fusión           main → fase-2, conflictos resueltos, pruebas en verde
A2  Huecos           F-017 enganchado, pruebas que faltan, backend pendiente
A3  Migraciones      ensayo verde → producción, en orden, con el ejecutor
A4  Contrato         regenerar esquema-esperado.json · pnpm verify COMPLETO en verde
A5  Despliegue       Vercel: PREVIEW de la rama, con su entorno configurado
A6  Verificación     Playwright por modelo · las cinco plantillas en el navegador
A7  Cierre           verify:acople en 0 · reporte
```

---

## 6 · CÓMO SE RESUELVEN LOS CONFLICTOS DE FUSIÓN

`main` y `fase-2` tocaron los mismos archivos: `mapa.ts`, `package.json`, el directorio de migraciones. Va a haber conflictos. La política, para que no haya que pensarla en caliente:

| Zona en conflicto | Gana | Por qué |
|---|---|---|
| Correcciones de seguridad de la Fase 1 | **`main`** | Son tres pasadas de auditoría. No se pierden. |
| Entidades nuevas del puente | **`fase-2`** | Es lo que se viene a acoplar. |
| Campos de una entidad que ambos tocaron | **fusión manual** | Se conservan los dos. Si hay choque real, gana `main` y se anota. |
| `package.json` scripts | **fusión manual** | Se conservan todos los eslabones de ambas cadenas. |
| Numeración de migraciones | **se renumera `fase-2`** | Nunca se toca una aplicada. |
| `heredado/` | **`main`** para lo preexistente; `fase-2` añade archivos nuevos | Codex arregló propinas, cobro y qr_token ahí. |

**Ningún conflicto justifica detenerse.** Se resuelve con esta tabla, se anota en la bitácora qué se decidió y por qué, y se sigue.

---

## 7 · LOS HUECOS CONOCIDOS · lo que hay que cerrar sí o sí

Salieron de las auditorías. Están medidos y son concretos:

1. **F-017, el vocabulario.** Tiene dominio, repositorio, comando y pruebas — y **cero consumidores** en ruta o pantalla. Sin esto, "mesa / cabina / bahía / habitación" no cambia en ningún sitio, y el vocabulario era la mitad de lo que hace que cada plantilla se sienta propia. Engánchalo a las 61 pantallas.
2. **`repos/traspasos.ts` y `repos/tomas-inventario.ts` sin prueba propia.** Están probados indirectamente. Dales su prueba.
3. **`test:integracion` no está en `pnpm verify`.** Por eso la única prueba que demuestra el cast de la cuota de archivos no corre nunca. Métela a la cadena.
4. **`historico/` está prácticamente vacío y dos puertas dependen de él. Esto te bloquea el primer día si no lo resuelves primero.**
   - En disco sólo hay `historico/README.md`. Está en `.gitignore:48`, así que el contenido real lo tiene Miguel en su máquina y no viaja.
   - `verify:historico` exige tres marcadores que no existen: `historico/tiendita/package.json`, `historico/restaurante/base44/config.jsonc` y `historico/auditoria-fase-0/LEEME_PRIMERO.md`. **Hoy `pnpm verify` muere en el eslabón 3.**
   - `packages/app/src/puente/cobertura.test.ts:34` hace `readdirSync` sobre `historico/restaurante/base44/entities`. **Hoy `pnpm test:unit` también falla.**

   Qué hacer, en este orden: si el contenido está en la máquina, cópialo y versiona **lo mínimo** que las dos puertas necesitan. Si no está, haz que `cobertura.test.ts` tolere su ausencia **sin dejar de comprobar el contrato del puente** (que es lo que de verdad protege), saca `verify:historico` de la cadena, y anota las dos cosas en `EXCEPCIONES-COBERTURA.md`.

   Lo que NO vale: dejarlo roto y declarar `pnpm verify` en verde.

7. **`.gitignore` ignora `.env.example` sin querer.** La línea 24 lo rescata con `!.env.example` y la 61 vuelve a ignorarlo con `.env*`. El orden manda, así que gana la 61. Y `verify:entorno` lo exige. Invierte el orden.

8. **Playwright está configurado y no tiene ni una prueba.** `playwright.config.ts` existe; `pruebas/e2e/` sólo tiene `.resultados/`. Vas a escribir las cinco desde cero, no a reutilizar. Y su `baseURL` está fijo en `http://localhost:3200` con `webServer.url` en `/estilos`: tal cual **no puede correr contra el preview de Vercel**. Parametriza el `baseURL` por variable de entorno.
5. **`propina_liquidada` tiene `rolesLectura: [...DIRECCION]`.** Un cajero que abra el panel de propinas verá todo como "Pendiente": el mismo síntoma que se acaba de arreglar, entrando por otra puerta. Comprueba qué roles alcanzan ese panel y ajusta.
6. **`verify:entorno` imprime "pendiente" y sale en 0.** Una puerta que aprueba declarando un chequeo sin hacer no es una puerta.

---

## 8 · QUÉ SIGNIFICA TERMINADO

Siete condiciones. La primera manda sobre todas porque es la única que no depende de una opinión.

1. **`pnpm verify:acople` sale en 0.** Ver §8.1.
2. **`pnpm verify` COMPLETO sale en 0**, con `verify:esquema`, `verify:rls` y `test:integracion` dentro.
3. Las 70 migraciones aplicadas. El ledger coincide con el disco en número y en hash.
4. Los cuatro negocios vivos en su plantilla correcta, comprobado consultando la tabla.
5. **Desplegado en Vercel y respondiendo.** No "el build pasó": la URL abre, se entra con PIN, y las APIs devuelven datos.

   **Es el PREVIEW de la rama `fase-2`, no producción.** Vercel lo genera solo en cada push. Ahí es donde se configura el entorno, se verifica y se deja funcionando. Miguel ve exactamente lo mismo que vería en producción, y la promoción a producción la decide él con un clic cuando esté conforme. No la hagas tú: producción es lo que usan cuatro negocios para cobrar todos los días.
6. **Las cinco plantillas probadas en el navegador**, cada una mostrando su propio vocabulario, sus pantallas y su dashboard.
7. Los `FILE-MAP.md` actualizados con las rutas reales.

### 8.1 · `verify:acople`

Constrúyelo en A0, antes de nada, y engánchalo a `pnpm verify` como último eslabón. Tiene que comprobar, contra la base viva y contra el despliegue:

- Migraciones en `_migraciones` = migraciones en disco, por número **y por hash**.
- RLS + FORCE en toda tabla; cero SELECT para `anon`/`authenticated`; cero EXECUTE público en funciones.
- Las 105 rutas declaradas existen y **responden**. Tres avisos sobre el criterio, porque mal puesto hace la puerta inalcanzable:
  - Un **401 o un 403 es CORRECTO**: la ruta existe y está guardada. Lo que no se admite es **404** (no existe) ni **500** (revienta).
  - Las rutas **dinámicas** — `[token]`, `[id]`, `[...ruta]` — devuelven 404 legítimamente con un parámetro inventado. Compruébalas por **existencia del módulo en disco**, no por respuesta HTTP.
  - La lista de rutas esperadas ya la sabe derivar `rutasEsperadas()` en `scripts/verificar-cobertura.mjs`. Reutilízala, no la escribas otra vez.
- **La cobertura de la Fase 2 sigue vigilada.** `verify:cobertura` vive hoy sólo dentro de `verify:fase2`; al sustituir esa cadena por `pnpm verify`, **muévelo a `pnpm verify`** o pierdes la única puerta que cuenta las 98 funciones, las 105 rutas y las 61 pantallas.
- La aplicación desplegada devuelve 200 y sirve la aplicación.
  **Si no hubo token de Vercel** y existe `docs/fase-2/VERCEL-ENTORNO.md`, esta comprobación se hace contra el servidor local (`APP_URL`), lo dice en su salida, y **no bloquea el 0**. Sin esta salida, el encargo sería imposible de cerrar y a la vez estaría prohibido detenerse.
- Las cinco plantillas resuelven su lista de módulos.
- **Sale con código 1 mientras falte algo.**

**La prueba de que sirve: al construirlo tiene que salir ROJO.** Si sale verde antes de aplicar las migraciones, está mal y se reescribe. Una puerta que no puede fallar no es una puerta — eso ya lo aprendimos con `verify:escrituras`, que informaba ocho escrituras sin analizar y aprobaba igual.

---

## 9 · GIT

- **Los commits van al usuario de GitHub de Miguel, y el correo ya está configurado.** Está en `user.email` del `.git/config` del repositorio padre (`morphiqpos`), que los tres worktrees heredan, con `useConfigOnly = true`. Léelo así:

  ```
  git config user.email
  ```

  **NO lo leas de `git log`.** `main` mezcla cuatro identidades distintas de commits viejos, y `git log -1` te devolvería cualquiera de ellas. Ése es exactamente el error que obligó a reescribir 74 commits.
- Verifica con `git log --format='%an <%ae>'` que todos los tuyos salen bien, **antes** de empujar.
- Empuja al cerrar cada etapa. No acumules.
- El repositorio es público: cero secretos en commits, en reportes o en código.

---

## 10 · SI ALGO SALE MAL

**Nada de esto justifica detenerse.** Todo tiene salida escrita:

| Situación | Qué haces |
|---|---|
| Un conflicto de fusión ambiguo | Aplicas la tabla de §6, anotas, sigues |
| Una migración falla en el ensayo | La arreglas, reensayas. No la aplicas hasta que pase |
| Una migración falla en producción | La tanda es una sola transacción: **revierte sola, la base queda intacta**. Arreglas, reensayas con datos (§4.2), reaplicas. Si aun así quedara estado parcial, restauras el volcado del §4.1 siguiendo `ROLLBACK-ACOPLE.md` (§4.6) |
| `pnpm verify` muere en `verify:historico` | §7.4. Lo resuelves o lo sacas de la cadena con la excepción escrita. No dejas la puerta roja y declaras verde |
| Vercel sin variables de entorno | Las configuras con el CLI. Tienes permiso. Si el CLI no tiene token y no puedes obtenerlo, **no te detienes**: dejas escrito en `docs/fase-2/VERCEL-ENTORNO.md` la lista exacta de variables con su valor de origen, sigues con A6 contra un servidor local, y lo declaras en el reporte |
| Una migración tarda o bloquea una tabla | Casi todas son aditivas (tablas nuevas) y no bloquean nada en uso. La única que toca filas existentes es el renombre de plantillas, y son cuatro filas. Aplica en bloques y verifica entre bloques |
| Una prueba falla | La arreglas. Si el defecto es del código de Codex, lo arreglas conservando lo de §3 |
| Un documento está equivocado | Lo corriges y lo anotas |
| Algo depende de una decisión de Miguel | Lo declaras en `EXCEPCIONES-COBERTURA.md` y sigues con lo siguiente |
| Te quedas sin sesión | Commit, push, bitácora. Otra sesión retoma desde `07-ESTADO.md` |

**Lo único que justifica escribir y parar:** una credencial que no tienes y no puedes obtener, o un daño a los datos de un cliente que no puedes revertir. Nada más.
