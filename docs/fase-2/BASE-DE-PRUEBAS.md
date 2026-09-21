# La base de las pruebas de integración · sin Docker

`pnpm test:integracion` es el eslabón 31 de `pnpm verify` y el único que necesita
**un Postgres de verdad**: prueba transacciones, restricciones únicas y carreras,
que son exactamente las tres cosas que un mock no reproduce (`13-PRUEBAS §2`).

Durante cuatro vueltas este eslabón se reportó como «necesita Docker». **No lo
necesita, y no lo necesitaba.** Lo que necesita es una `DATABASE_URL_PRUEBAS` que
apunte a una base desechable, y una rama del proyecto de Supabase es exactamente
eso: una base entera, aislada, con las mismas extensiones y los mismos roles que
producción, que se borra cuando se termina.

Había además un defecto que hacía imposible usar una base remota, y que es la
razón por la que «Docker» parecía la única salida: la espera de arranque sacaba
el PUERTO de la URL y luego abría el socket contra **`localhost`, siempre**. Con
una URL remota nadie escucha en el 5432 de esta máquina, así que la espera se
agotaba **sin intentar ni una vez** el `select 1` que sí habría contestado, y el
error acusaba a la base: «ahí no contesta ningún Postgres en 30 s».

## 1 · Crear la rama

```bash
supabase branches create pruebas-integracion --project-ref <ref-del-proyecto>
supabase branches get    pruebas-integracion --project-ref <ref-del-proyecto>
```

El segundo comando imprime, entre otras cosas, dos URLs:

| Campo | Qué es |
| --- | --- |
| `POSTGRES_URL` | el pooler en **6543**, modo transacción |
| `POSTGRES_URL_NON_POOLING` | el host directo `db.<ref>.supabase.co:5432` |

Usa el **pooler en 5432** —el mismo host que `POSTGRES_URL` con el puerto
cambiado— porque es el de **sesión**: admite DDL y no rompe las pruebas de
concurrencia, y sale por IPv4, que es lo que hay en esta máquina.

```
postgresql://postgres.<ref-de-la-rama>:<clave>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

## 2 · Aplicar las migraciones

La rama nace **vacía**: Supabase intenta aplicar `supabase/migrations/`, que en
este repo no es el ledger, y deja el estado en `MIGRATIONS_FAILED`. Eso no es un
problema —la base está sana— pero hay que aplicar el ledger propio:

```bash
MORPHIQPOS_SUPABASE_PROJECT_REF="" DATABASE_URL="<la url de arriba>" \
  pnpm --filter @morphiqpos/data migrate
```

`MORPHIQPOS_SUPABASE_PROJECT_REF=""` es necesario: cuando esa variable trae un
ref, el ejecutor usa el transporte del CLI contra **el proyecto vinculado**, que
es producción. Vacía, toma el camino de `DATABASE_URL`, que es el que aquí
interesa. El rol `morphiqpos_app` ya existe en la rama porque los roles se
clonan; si no existiera, se crea como en CI:

```sql
create role morphiqpos_app with login bypassrls;
```

## 3 · Correr la suite

```bash
DATABASE_URL_PRUEBAS="<la url>" DATABASE_URL="<la url>" pnpm test:integracion
```

`DATABASE_URL_PRUEBAS` es lo que lee `prepararPostgres()` para **no** levantar un
contenedor. `DATABASE_URL` se define también porque los workers de vitest la leen
al importar la capa de datos.

## 3.1 · La misma URL sirve para `verify:entorno`

`verify:entorno` protege A-27 —«el backend completo debe poder correr en la PC de
un cliente»— y su mitad EN VIVO se apoyaba en Docker. Ya no: con la misma cadena
comprueba que el esquema **completo** aplica en un Postgres 17 que no es el de la
aplicación.

```bash
DATABASE_URL_PRUEBAS="<la url>" pnpm verify:entorno
```

```
  · en vivo: el esquema completo (109 migraciones) esta aplicado en un Postgres 17 AJENO al de la aplicacion
```

Y falla —no «avisa»— si la cadena apunta al mismo proyecto que la aplicación, si
el motor no es el que fija el compose, o si el ledger de allí no cuadra con el
disco. La mitad del empaquetado sigue necesitando un motor de contenedores, y
cuando sólo una de las dos corre, la puerta dice qué mitad falta.

## 4 · Borrar la rama

```bash
supabase branches delete pruebas-integracion --project-ref <ref-del-proyecto>
```

Cuesta centavos por hora mientras existe. Borrarla es lo que hace la corrida
efímera de verdad: la siguiente empieza otra vez desde cero y no arrastra
suciedad de la anterior, que es la clase de estado que hace que una prueba pase
sola y falle en grupo.

## Lo que NO cambia

- **CI sigue usando su servicio de Postgres**, que es más rápido y no cuesta.
  Esta ruta es para la máquina de quien desarrolla.
- **Las pruebas no se saltan** cuando falta la base. Si no hay ninguna, la suite
  falla con el mensaje que explica esto mismo, en vez de salir verde a medias.
- **Docker sigue valiendo** si ya está encendido. Lo que se acaba es citarlo como
  un límite.
