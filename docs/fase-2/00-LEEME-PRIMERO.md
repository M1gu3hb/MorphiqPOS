# 00 · LÉEME PRIMERO

**Si abres una sesión nueva y no sabes nada, empieza aquí. Este archivo te da todo el contexto.**
No dependas de la memoria de ninguna sesión. Todo lo que hay que saber está escrito.

---

## 1 · QUÉ ES ESTO

**MorphiqPOS** es el punto de venta de Miguel Hernández, marca **Morphiq** (México). No es un SaaS: es una marca boutique que vende sistemas a la medida y cobra renta mensual. Hoy tiene cuatro negocios operando:

| Negocio | Giro | Plantilla |
|---|---|---|
| Restaurante MH | restaurante | `restaurante` |
| Café Jacaranda | cafeteria | `restaurante` |
| Abarrotes Don Chuy | tienda | `tienda` |
| Ferretería La Broca | ferreteria | `ferreteria` |

*(Los nombres comerciales viejos —`esencial`, `operativo`, `restaurante_pro`— los retiró la
migración 058, y la 166 le dio a la ferretería su plantilla propia.)*

La filosofía que manda sobre todo lo demás: **el sistema se adapta al negocio, no el negocio al sistema.**

## 2 · EN QUÉ FASE VAMOS

```
FASE 0   Auditoría del paquete original                       ✅ terminada
FASE 1   Revivir el POS de restaurante sobre backend nuevo     ✅ terminada (Codex)
FASE 2   LOS ~78 MODELOS DE NEGOCIO DEL MAPA                   ⬅ ESTO
         · 2.1  Cimientos: worktree, puerta, tronco común      ✅
         · 2.2  Los CINCO primeros modelos, escritos           ✅
                restaurante · cafetería · abarrotes ·
                ferretería · estética
         · 2.3  ACOPLE de esos cinco al punto de venta vivo    ✅ 17-09-2026
                migraciones aplicadas, plantillas, menú,
                datos de demostración y producción
         · 2.35 El lenguaje visual: el sistema enchufado, ocho  ✅ 24-09-2026
                estilos, la biblioteca y las pantallas
                recompuestas (`verify:adopcion` es su marcador)
         · 2.4  PRUEBAS Y CIERRE EN PRODUCCIÓN: la entrada por  🔄 en curso
                negocio, las guardas de lo real, los días
                completos con el dinero al centavo y la red
                que prueba producción sola
         · 2.5  La siguiente tanda de diez: farmacia, taller
                mecánico, panadería-pastelería, barbería…      ⬜ pendiente
         · …    y así, de diez en diez, hasta los 78           ⬜ pendiente
FASE 3   No ha empezado, y le falta mucho                      ⬜
```

> **UN ERROR DE NUMERACIÓN QUE HAY QUE CONOCER.** Al acople se le llamó «Fase 3» durante dos
> sesiones enteras, y no lo es: la Fase 2 es construir los ~78 modelos, y el acople de los cinco
> primeros es una ETAPA suya. El nombre se corrigió el 17-09-2026 en los 26 archivos donde
> aparecía. **Las cabeceras de ~85 migraciones del rango 058–166 siguen diciendo «APLICADA EN LA
> FASE 3 (acople)» y «(F3-REGLAS §2)»**, y ahí se quedan: son comentarios dentro del SQL, el
> ejecutor valida cada archivo por hash y cambiar una coma abortaría la tanda entera. Se leen
> como «2.3».

**La Fase 2 termina cuando los ~78 modelos del mapa están implementados, con su backend,
acoplados y funcionando.** Hoy hay cinco. Faltan 73.

## 3 · CÓMO SE TRABAJA EN LA FASE 2

Regla de oro, dictada por Miguel:

> "Ahorita todo el punto de venta es un rompecabezas. Ya tiene varias piezas armadas. En vez de meterle las piezas directamente, vamos a armarlas **aparte** del rompecabezas original. Ya que se haya terminado la otra parte —el backend—, lo que armamos aparte lo acoplamos donde va. Tal cual, como dos piezas se unen. No es rehacerlas, es implementarlas."

En concreto:

- **Nada de esta carpeta toca el repositorio vivo mientras Codex siga en la Fase 1.** Ni `morphiqpos-codex/`, ni `morphiqpos/`, ni la rama `carril-b`.
- Lo que se construye aquí se construye **como si ya estuviera dentro**: mismos contratos, mismos nombres, misma estructura de carpetas que tendría en el monorepo.
- Las migraciones se escriben numeradas y listas, **pero no se aplican en la Fase 2**. La Fase 2.3 (acople) las aplicó el 16-09-2026, con respaldo comprobado y ensayo sobre una copia con datos. Ver `F2.3-REGLAS-DE-ACOPLE.md` §2 y §4.
- Acoplar debe ser mover carpetas y aplicar migraciones. Nunca reescribir.

## 4 · DÓNDE ESTÁ CADA COSA

```
fase-2/
├── 00-LEEME-PRIMERO.md        ← estás aquí
├── 01-MAPA-GENERAL.md         ← LA GUÍA PRINCIPAL. 78 modelos, 10 arquetipos, 6 ejes
├── 02-ESTANDAR-DE-CARPETA.md  ← el contrato que TODA carpeta de modelo cumple
├── 03-CATALOGO-DE-FUNCIONES.md← toda función tiene un ID canónico (F-XXX). Úsalos siempre
├── 04-SISTEMA-DE-DISENO.md    ← reglas de interfaz + cómo se diferencia cada modelo
├── 05-DECISIONES.md           ← qué se decidió, cuándo y por qué. Bitácora. NO la borres
├── 06-FILE-MAP-GENERAL.md     ← índice de todo lo que existe en esta carpeta
├── 07-ESTADO.md               ← qué modelo está hecho y cuál falta. Actualízalo al terminar
└── modelos/
    └── <familia>/<modelo>/    ← una carpeta por modelo de negocio (78)
```

**Orden de lectura para retomar el trabajo:** 00 → 07 (ver qué falta) → 02 (el estándar) → 03 (los IDs) → 04 (diseño) → y a trabajar el modelo que toque.

## 5 · LO QUE NO SE NEGOCIA

Estas reglas vienen de la Fase 1 y siguen vigentes. Romperlas es motivo de rechazo.

**Dinero**
- Todo en **bigint de centavos**. Nunca flotantes. Nunca `Math.round(x*100)` — usa el parser de texto.
- Precios y totales **siempre** en el servidor. El endpoint no acepta importes del cliente.
- Las propinas **no** entran en ventas, utilidad, costo ni margen. Nunca.
- El desglose de propina por método es **exacto**, jamás proporcional.

**Autorización**
- Server-side, por sesión. **Nunca** por un campo del cuerpo.
- Un comando que declare `rol`, `organizacion_id`, `sucursal_id`, `empleo_id`, `identidad_id` o `terminal_id` en su entrada **no compila**. Es a propósito.
- El ámbito nace en un solo sitio y se relee de la base en cada petición.

**Datos**
- Cobro, caja, stock y pedido: **transaccionales e idempotentes**.
- Stock: ledger inmutable, decremento atómico, falla en vez de silenciar.
- Migraciones nuevas, numeradas. **Nunca** editar una aplicada: el ejecutor valida por hash.
- Cero SQL concatenado.

**Código**
- Cero `any`, cero `@ts-ignore`, cero `catch` vacío en `packages/`.
- Ningún archivo nuevo sobre 300 líneas.
- Prueba antes que código en lo crítico, y después la mutación: quítala, confirma que falla, restaura.
- **Nada se declara terminado sin haberlo ejecutado.**

**Prohibido**
- Tocar el proyecto Supabase de **Pastelería Confetti** (`ivqcxdpqxwjxfohiswqb`). Ni para leer.
- Subir secretos al repositorio. Es público.
- Commits que no sean `M1gu3hb <118588634+M1gu3hb@users.noreply.github.com>`.

## 6 · EL STACK

```
Next.js 16 App Router · React 19 · TypeScript estricto · Tailwind 4
Kysely + pg · PostgreSQL 17.6 en Supabase (wyqmzhliurwyxuyxznpb)
Vitest · Playwright · pnpm + Turborepo · desplegado en Vercel

Monorepo:  apps/web  ·  apps/web/heredado (244 archivos de Miguel: estructura NO se toca;
                                     el COLOR usa tokens desde C.16, D-19)
           packages/{contracts,domain,data,app,ui,testing}
```

Piezas que hay que conocer antes de escribir una línea:

- **`comando()`** — el envoltorio de toda escritura: rol → paquete → validación → idempotencia → transacción → auditoría.
- **El puente** (`packages/app/src/puente/`) — traduce entre los nombres de entidad de Miguel (`Venta`, `Mesa`, `DetalleVenta`) y el esquema nuevo (`ordenes`, `mesas`, `orden_lineas`). Toda entidad declara `rolesLectura` **obligatoriamente**, a nivel de tipo.
- **`heredado/enrutado.jsx`** — reexporta la navegación de Next con los nombres de React Router, para que los 244 archivos no cambien.

## 7 · LA PREGUNTA QUE SE HACE AL TERMINAR CADA MODELO

Está escrita en el estándar, pero va aquí porque es el criterio de aceptación:

> **Si alguien que sólo conoce este giro abriera el sistema con esta plantilla puesta, y recorriera un día completo —abrir, operar, cerrar—, ¿creería que el punto de venta se construyó exclusivamente para su negocio, o notaría que es un sistema genérico con una máscara encima?**

Si la respuesta es "notaría", el modelo no está terminado.

---

*Última actualización: 14 de septiembre de 2026.*
