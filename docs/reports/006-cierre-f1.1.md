# 006 · Cierre de F1.1 — el POS vende de verdad

**2026-09-08 · Claude Code · `main` (`27cde7e`)**

## El titular

```sql
select count(*) from auditoria;   -- 36, y subiendo
```

Llevaba tres sesiones en cero. Hoy la cadena completa —sesión, comando,
transacción, Kysely, Postgres— corrió de punta a punta: en local, y desde el
despliegue de Vercel.

**20 de 20 tareas.** Todas ejecutadas, ninguna declarada terminada por leerse
bien.

## Los cinco fallos que sólo aparecen ejecutando

1. **Nadie podía entrar.** `hash()` de `@node-rs/argon2` acepta un Buffer;
   `verify()` decodifica UTF-8. Le pasábamos el HMAC crudo de la pimienta, así
   que `verify` lanzaba y el `catch` lo devolvía como «PIN incorrecto». Ni
   siquiera un hash recién creado se verificaba contra sí mismo. Había pruebas
   alrededor del PIN; ninguna hacía el viaje redondo.
2. **Las 17 rutas de gestión no tenían sesión.** Colgaban de un puente de
   desarrollo que lanzaba en producción y en local le daba a cualquier visitante
   el ámbito del dueño. No era un atajo pequeño: era la autorización entera.
3. **`resetearDemo` orfanaba ventas cobradas.** La clave foránea de
   `orden_lineas` es `on delete set null`, así que borrar el catálogo dejaba las
   líneas de órdenes ya pagadas con `producto_id` en nulo, en silencio.
4. **El buscador le robaba el foco a los diálogos.** El fondo de caja se
   escribía en la búsqueda y la caja no se abría nunca. Lo encontró el E2E.
5. **102 imports sin extensión.** TypeScript los resolvía y Node no: ningún
   script podía cargar la cadena de servidor.

## Lo que hay ahora

| | |
|---|---|
| **Entrar** | `db:bootstrap` rompe el bucle del primer PIN. `/accesos` da de alta cajeros y genera códigos sin volver a la consola. |
| **Vender** | Buscar, agregar, cobrar en efectivo, tarjeta o **mixto**, ticket con folio. Todo por teclado. |
| **Caja** | Abrir con fondo, gastos y retiros, corte con **conteo a ciegas**. |
| **Negocio** | El IVA sale de `/configuracion` y cambia el total de la siguiente venta. |
| **Datos** | Tres organizaciones sembradas por el comando real. Cero atrezzo. |
| **Seguridad** | Límite por IP en auth, validación de origen en TODAS las rutas de comando, TLS verificado contra la raíz fijada de Supabase, rol de base sólo-DML. |
| **Puertas** | 395 pruebas · 7 arneses · 79 mutaciones · E2E DIA-01 contra base real. |

## Lo que Miguel tiene que hacer — DNS

El dominio está agregado en Vercel y espera los registros. Van en el registrador
donde se compró (hoy apunta a `ns8/ns9.wixdns.net`). **Opción A, recomendada:**

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| `A` | `@` | `76.76.21.21` | automático |
| `A` | `www` | `76.76.21.21` | automático |

**Opción B** — mover el dominio entero a Vercel, cambiando los nameservers a
`ns1.vercel-dns.com` y `ns2.vercel-dns.com`. Sólo si nada más usa ese dominio.

Vercel verifica y emite el certificado solo. Después:

```bash
node scripts/humo-venta.mjs <código> --base https://pos-mh-astral-systems.com
```

## Lo que NO hice

- **El dominio no resuelve todavía.** Los registros DNS no los puedo poner yo.
  Lo verificado en producción fue contra la URL de despliegue de Vercel, con un
  bypass que revoqué al terminar.
- **`www` no redirige al apex.** Los dos están agregados; falta decidir cuál es
  el canónico y configurar la redirección (`morphiq-prs §02`).
- **Las migraciones no se aplican solas.** El rol de aplicación no tiene DDL —a
  propósito— así que hoy se aplican por la consola de Supabase y se registran a
  mano en `_migraciones`. Documentado en `docs/RUNBOOK.md §2`.
- **Restaurar la base nunca se ensayó.** Sin eso no hay RTO ni RPO reales, sólo
  la promesa de Supabase (`morphiq-prs §23A`).
- **`PIN_PEPPER` no se puede rotar.** Cambiarla invalida todos los PIN a la vez.
  Haría falta un doble hash de transición y no existe.
- **Sin CSP con nonce probada en producción.** Las cabeceras están y
  `verify:cabeceras` pasa, pero no se revisó la consola del navegador en el
  dominio real.
- **`resetearDemo` borra ventas.** Es lo correcto para una demostración y sería
  catastrófico en un negocio de verdad. Sólo lo puede ejecutar un dueño con la
  palabra `RESETEAR`, pero **no distingue una organización de demostración de
  una real**. Antes del primer cliente que cobre en serio, eso tiene que
  cambiar.
- **El E2E corre en un solo navegador.** Existe el proyecto `tablet` en
  Playwright y DIA-01 no se ejecutó ahí.
- **Sin revisión de accesibilidad con lector de pantalla**, ni Lighthouse, ni
  medición de Core Web Vitals.
- **El consumo por receta sigue sin descontar al vender.** `planearConsumo`
  descarta todo lo que no sea `sku`. Es de F1.2 y está dicho en el plan.
- **Devoluciones, reimpresión y escáner**: fuera de alcance, no se tocaron.
- **Todo el restaurante**: cero líneas, como estaba planeado.

## Acta de sign-off

| | |
|---|---|
| Proyecto | MorphiqPOS · corte F1.1 |
| Commit | `27cde7e` en `main` |
| Base | Supabase `wyqmzhliurwyxuyxznpb`, 12 migraciones, cero drift |
| Despliegue | Vercel `morphiqpos` (mh-astral-systems), build en verde |
| Resultado | **READY WITH ACCEPTED RISKS** |

**Cero BLOCKERS.** Riesgos aceptados y documentados arriba: el dominio pendiente
de DNS, la restauración sin ensayar, la pimienta sin rotación y `resetearDemo`
sin distinguir demo de producción.

No se tocó `Pasteleria Confetti`.

## Para probarlo ahora mismo

```bash
pnpm dev
```

Luego `http://localhost:3000/venta`. Si pide PIN, corre antes:

```bash
pnpm db:bootstrap --org demo-ferreteria-la-broca --persona "Elena" --pin 4821
```

y teclea el código de seis dígitos en `/enrolar`.
