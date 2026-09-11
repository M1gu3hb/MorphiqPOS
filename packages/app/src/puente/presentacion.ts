import 'server-only';

import { ErrorDominio, PAQUETES_TODOS, validarEntorno } from '@morphiqpos/contracts';
import { obtenerDb, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../comando.ts';
import { hashearPin, verificarPin } from '../identidad/pin.ts';
import { guardarConfiguracionParcial } from './configuracion.ts';

/**
 * EL MODO PRESENTACIÓN Y SU CONTRASEÑA (F1-02 E10-3, defecto D-19).
 *
 * ── Lo que hacía ──────────────────────────────────────────────────────────
 * `ModoPresentacion.jsx:50-51` comparaba la contraseña EN EL NAVEGADOR:
 *
 *     const expectedPassword = cfg?.presentacion_password || '2797';
 *     if (passwordInput.trim() === String(expectedPassword)) setUnlocked(true);
 *
 * Dos agujeros a la vez. El primero: la contraseña real viajaba al navegador en
 * texto plano dentro de la configuración, así que estaba en la consola de
 * cualquiera. El segundo, peor: si la configuración no traía ninguna, valía
 * `'2797'` — una contraseña por omisión escrita en el código fuente de un
 * repositorio público.
 *
 * ── Lo que hace ahora ─────────────────────────────────────────────────────
 * La contraseña NO SALE de la base, nunca: `configuracion.ts` la tiene en
 * `NUNCA_SALEN`. Se compara aquí con Argon2id y pimienta, el mismo camino que
 * los PIN, y `setUnlocked` deja de ser una decisión del cliente para ser la
 * respuesta del servidor.
 *
 * Y no hay contraseña por omisión. Sin una configurada, el modo presentación
 * NO SE ABRE, y el mensaje lo dice: es mejor una función inaccesible hasta que
 * alguien la configure que una accesible con una contraseña que está en GitHub.
 */

const CLAVE_HASH = 'presentacion_password_hash';
const CLAVE_ULTIMO_ACCESO = 'presentacion_ultimo_acceso';

/** Los tres paquetes de Miguel. La lista es suya y no se amplía aquí. */
const PAQUETES_MH = ['esencial', 'operativo', 'restaurante_pro'] as const;

const entradaDesbloquear = z.object({
  contrasena: z.string().min(1).max(200),
});

const entradaFijarContrasena = z.object({
  // Cuatro como mínimo, igual que un PIN. Más corta no protege de nada y da la
  // falsa sensación de que sí.
  contrasena: z.string().min(4).max(200),
});

const entradaCambiarPaquete = z.object({
  paquete: z.enum(PAQUETES_MH),
});

function esTexto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor !== '';
}

/**
 * Comprueba la contraseña del modo presentación.
 *
 * NO es un comando de escritura por accidente: registra el último acceso, y ese
 * registro es la única forma de saber después quién entró a cambiar el paquete
 * del negocio.
 */
export const desbloquearPresentacion = definirComando<
  Transaccion,
  typeof entradaDesbloquear,
  { readonly abierto: true }
>({
  nombre: 'configuracion.desbloquear_presentacion',
  entidad: 'configuracion',
  escribe: true,
  roles: ['dueno', 'administrador'],
  paquetes: PAQUETES_TODOS,
  entrada: entradaDesbloquear,
  async ejecutar(ctx, entrada) {
    const fila = await ctx.tx
      .selectFrom('configuracion')
      .select('valores')
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .executeTakeFirst();

    const valores = (fila?.valores ?? {}) as Record<string, unknown>;
    const guardado = valores[CLAVE_HASH];

    if (!esTexto(guardado)) {
      // Sin contraseña configurada NO se abre. La alternativa —el `'2797'` del
      // código— es una puerta abierta en un repositorio público.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'El modo presentación no tiene contraseña. Configúrala antes de usarlo.',
      );
    }

    const pimienta = validarEntorno(process.env).PIN_PEPPER;
    const correcta = await verificarPin(entrada.contrasena, guardado, pimienta);
    if (!correcta) {
      throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Contraseña incorrecta.');
    }

    await ctx.paso('registrar_acceso', () =>
      guardarConfiguracionParcial(
        ctx.tx,
        ctx.ambito.organizacionId,
        { [CLAVE_ULTIMO_ACCESO]: ctx.ahora.toISOString() },
        { desdeComando: true },
      ),
    );

    // La auditoría guarda QUE se abrió, jamás la contraseña ni un fragmento.
    ctx.auditar({ entidadId: ctx.ambito.organizacionId, payload: { abierto: true } });
    return { abierto: true };
  },
});

/**
 * Fija la contraseña del modo presentación.
 *
 * Sólo el DUEÑO. Quien tenga esta contraseña puede cambiar el paquete del
 * negocio, y el paquete decide qué se cobra.
 */
export const fijarContrasenaPresentacion = definirComando<
  Transaccion,
  typeof entradaFijarContrasena,
  { readonly configurada: true }
>({
  nombre: 'configuracion.fijar_contrasena_presentacion',
  entidad: 'configuracion',
  escribe: true,
  roles: ['dueno'],
  paquetes: PAQUETES_TODOS,
  entrada: entradaFijarContrasena,
  async ejecutar(ctx, entrada) {
    const pimienta = validarEntorno(process.env).PIN_PEPPER;
    const hash = await hashearPin(entrada.contrasena, pimienta);

    // `guardarConfiguracionParcial` RECHAZA `presentacion_password` y
    // `presentacion_password_hash` a propósito, así que este comando escribe el
    // documento por su cuenta: es el único sitio del sistema que puede.
    const fila = await ctx.tx
      .selectFrom('configuracion')
      .select(['id', 'valores', 'version'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .executeTakeFirst();

    const valores = { ...((fila?.valores ?? {}) as Record<string, unknown>), [CLAVE_HASH]: hash };

    await ctx.paso('guardar_hash', async () => {
      if (fila === undefined) {
        await ctx.tx
          .insertInto('configuracion')
          .values({
            organizacion_id: ctx.ambito.organizacionId,
            valores: JSON.stringify(valores),
            version: 1,
          })
          .execute();
        return;
      }
      await ctx.tx
        .updateTable('configuracion')
        .set({
          valores: JSON.stringify(valores),
          version: fila.version + 1,
          updated_at: ctx.ahora,
        })
        .where('id', '=', fila.id)
        .execute();
    });

    // NI LA CONTRASEÑA NI SU LONGITUD van a la auditoría. La longitud sola ya
    // recorta el espacio de búsqueda de quien lea la tabla.
    ctx.auditar({ entidadId: ctx.ambito.organizacionId, payload: { configurada: true } });
    return { configurada: true };
  },
});

/**
 * Cambia el paquete del negocio (E10-2).
 *
 * Sólo el DUEÑO, y en el SERVIDOR. Su `ModoPresentacion.jsx:80` lo escribía con
 * un `ConfiguracionNegocio.update` cualquiera, que el puente admite para un
 * gerente. El paquete decide qué funciones existen y qué se cobra: no es un
 * campo más de la configuración.
 */
export const cambiarPaquete = definirComando<
  Transaccion,
  typeof entradaCambiarPaquete,
  { readonly paquete: string }
>({
  nombre: 'configuracion.cambiar_paquete',
  entidad: 'configuracion',
  escribe: true,
  roles: ['dueno'],
  paquetes: PAQUETES_TODOS,
  entrada: entradaCambiarPaquete,
  async ejecutar(ctx, entrada) {
    await ctx.paso('cambiar_paquete', () =>
      guardarConfiguracionParcial(
        ctx.tx,
        ctx.ambito.organizacionId,
        { paquete_modo: entrada.paquete },
        { desdeComando: true },
      ),
    );
    ctx.auditar({ entidadId: ctx.ambito.organizacionId, payload: { paquete: entrada.paquete } });
    return { paquete: entrada.paquete };
  },
});

/**
 * Si hay contraseña configurada. Lo pregunta la pantalla para saber qué pedir:
 * el campo para escribirla, o el aviso de que hay que configurarla primero.
 *
 * Devuelve un BOOLEANO y nada más. Ni el hash, ni su longitud, ni cuándo se
 * puso: sólo si existe. `leerConfiguracion` no sirve aquí precisamente porque
 * filtra el hash —que es lo correcto—, así que se consulta el documento.
 */
export async function tienePresentacionContrasena(organizacionId: string): Promise<boolean> {
  const fila = await obtenerDb()
    .selectFrom('configuracion')
    .select('valores')
    .where('organizacion_id', '=', organizacionId)
    .executeTakeFirst();
  const valores = (fila?.valores ?? {}) as Record<string, unknown>;
  return esTexto(valores[CLAVE_HASH]);
}
