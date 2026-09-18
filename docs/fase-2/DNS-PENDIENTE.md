# DNS PENDIENTE · `pos-mh-astral-systems.com`

Lo que falta para que el dominio de Miguel sirva MorphiqPOS, medido el 18-09-2026 y escrito para
que se pueda hacer sin volver a investigar nada.

## Lo que hay hoy, medido

```
$ nslookup -type=A pos-mh-astral-systems.com 8.8.8.8
  (ninguna respuesta: el apex NO tiene registro A)

$ nslookup -type=CNAME www.pos-mh-astral-systems.com 8.8.8.8
  www.pos-mh-astral-systems.com  canonical name = base44.onrender.com

$ curl -o /dev/null -w "%{http_code}" https://pos-mh-astral-systems.com/
  402
```

Dos cosas, y la segunda es la importante:

1. **El apex no tiene A**, así que no resuelve a ningún servidor.
2. **`www` sigue apuntando a `base44.onrender.com`** — la plataforma ERRADICADA. El 402 es de ahí:
   es lo que devuelve un servicio de Render suspendido. El dominio de Miguel todavía cuelga del
   sistema que la Fase 0 dio de baja.

Mientras eso siga así, la dirección que Miguel le daría a un cliente no lleva a MorphiqPOS: lleva a
un 402 del proveedor anterior.

## Lo que hay que hacer, en orden

### 1 · Dar de alta el dominio en el proyecto de Vercel

Vercel → proyecto `morphiqpos` → **Settings → Domains → Add** → `pos-mh-astral-systems.com`.
Al añadirlo, **Vercel enseña en pantalla los valores exactos** que hay que poner en el DNS, y son los
que manda: los de abajo son los estándar de Vercel y sirven para saber qué esperar, no para
sustituir a lo que diga el panel.

### 2 · Los registros, en el DNS del registrador

| Tipo | Nombre | Valor | Qué hace |
|---|---|---|---|
| `A` | `@` (el apex, `pos-mh-astral-systems.com`) | `76.76.21.21` | La IP anycast de Vercel. Es el registro que **hoy no existe**. |
| `CNAME` | `www` | `cname.vercel-dns.com` | El `www` a Vercel. **Sustituye** al que hay hoy a `base44.onrender.com`. |

Y **borrar** el CNAME viejo de `www` → `base44.onrender.com`. No se deja «por si acaso»: mientras
esté, la mitad de quien escriba `www.` sigue llegando a la plataforma erradicada.

### 3 · Comprobarlo desde fuera

```bash
nslookup -type=A pos-mh-astral-systems.com 8.8.8.8          # tiene que dar 76.76.21.21
curl -o /dev/null -w "%{http_code}" https://pos-mh-astral-systems.com/   # 200, no 402
curl -s https://pos-mh-astral-systems.com/api/auth/empleados | head -c 200
```

La tercera es la que de verdad dice que llegó: si contesta `{"ok":true,...}` con la gente del
negocio, el dominio sirve la aplicación y no una página de error del registrador.

## Por qué esto NO lo hizo esta sesión

Porque no está en el repositorio. Dar de alta un dominio en Vercel y escribir registros en el DNS del
registrador son dos paneles con credenciales de Miguel, y **la sesión no tiene acceso a ninguno de los
dos**: leer las variables del proyecto y su configuración de dominios se denegó por política de
permisos, y el DNS vive en el registrador, que es otra cuenta más.

Lo que sí se hizo, y se comprobó desde fuera: **quitar el muro de Vercel**. La Protección de
Despliegue estaba en `all_except_custom_domains`, así que `morphiqpos-kappa.vercel.app` pedía cookie
de SSO y Miguel no podía entrar. Ahora sólo protege los **previews**, y la URL de producción responde
200 sin nada:

```
https://morphiqpos-kappa.vercel.app/              → 200
https://morphiqpos-kappa.vercel.app/login-pos     → 200
https://morphiqpos-kappa.vercel.app/api/auth/empleados → 200
```

Los previews siguen cerrados **a propósito**: son despliegues de un POS con los datos de nueve
negocios dentro, y ésos no se abren al mundo por comodidad.

## El comodín, que es otra cosa y también falta

Para que **un solo despliegue** sirva a varios negocios *por su dirección* —
`mh-restaurante.pos-mh-astral-systems.com`, `demo-cafe-jacaranda.pos-mh-astral-systems.com` — hace
falta un comodín:

| Tipo | Nombre | Valor |
|---|---|---|
| `CNAME` | `*` | `cname.vercel-dns.com` |

y añadir `*.pos-mh-astral-systems.com` como dominio del proyecto en Vercel.

El código para eso **ya está**: `negocioDelDespliegue()` resuelve el negocio por la primera etiqueta
del host antes de mirar cualquier variable, y hay pruebas de esa resolución
(`packages/app/src/negocio/host.test.ts`). Lo que falta es el DNS.

Y mientras el comodín no exista, el mismo despliegue puede servir a varios negocios por la otra vía,
que **sí funciona hoy y está probada**: `ORGANIZACION` con la lista de slugs separada por comas, y la
organización sale del EMPLEO de quien entra. Medido con un solo build sirviendo a las cinco
demostraciones a la vez — ver el reporte 015 §5.
