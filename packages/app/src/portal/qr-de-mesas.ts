import {
  centrosCompatibles,
  disenoLegible,
  esIdEstiloCentro,
  esIdEstiloModulo,
  esIdEstiloOjo,
  esIdMarco,
  type IdEstiloCentro,
  type IdEstiloModulo,
  type IdEstiloOjo,
  type IdMarco,
} from '@morphiqpos/domain/qr';
import { z } from 'zod';

/**
 * EL DISEÑO DE LOS QR DE LAS MESAS (DP-9.8).
 *
 * Un diseño GENERAL para todas las mesas y, si se quiere, uno propio por mesa («Restablecer al
 * diseño general» lo quita). Vive en `configuracion.valores.qr_de_mesas` y se valida al guardar:
 * ids del catálogo del motor, colores `#rrggbb` y —lo que más importa— un QR que se lee: tinta
 * oscura sobre fondo claro con contraste suficiente, también en el segundo color del degradado.
 *
 * El CONTENIDO del QR no es parte del diseño ni se puede guardar aquí: es siempre la dirección
 * con el token de la mesa. Ningún QR impreso deja de servir por cambiarle el diseño.
 */

export const CLAVE_DE_QR_DE_MESAS = 'qr_de_mesas';

/** Más mesas con diseño propio que esto ya no es «una que otra»; y el documento tiene tope. */
export const MAXIMO_DE_MESAS_PROPIAS = 50;

const HEX = /^#[0-9a-fA-F]{6}$/;
const esColor = (valor: unknown): boolean => typeof valor === 'string' && HEX.test(valor);
const COLOR = z.string().regex(HEX, 'Un color va como #rrggbb.');
const TEXTO_DEL_MARCO = z.string().trim().max(40, 'Un texto del marco va de hasta 40 letras.');

const deCatalogo = <T extends string>(esId: (v: string) => v is T, nombre: string) =>
  z.string().refine(esId, { message: `No es un ${nombre} del catálogo.` });

export const DISENO_DE_QR = z
  .object({
    modulo: deCatalogo<IdEstiloModulo>(esIdEstiloModulo, 'estilo de módulo'),
    ojo: deCatalogo<IdEstiloOjo>(esIdEstiloOjo, 'estilo de ojo'),
    centro: deCatalogo<IdEstiloCentro>(esIdEstiloCentro, 'estilo de centro'),
    primerPlano: COLOR,
    ojos: COLOR,
    fondo: COLOR,
    degradado: z
      .object({
        modo: z.enum(['linear', 'radial', 'duo']),
        color: COLOR,
        angulo: z.number().min(0).max(360),
      })
      .strict()
      .nullable(),
    /** El logo del negocio al centro: el QR sale con corrección de errores alta. */
    conLogo: z.boolean(),
    marco: z
      .object({
        tipo: deCatalogo<IdMarco>(esIdMarco, 'marco'),
        /** `{mesa}` se cambia por el número de la mesa. */
        texto: TEXTO_DEL_MARCO,
        textoSecundario: TEXTO_DEL_MARCO,
        color: COLOR,
        colorTexto: COLOR,
      })
      .strict()
      .nullable(),
    /** Ancho impreso de la pieza (el QR con su marco), en milímetros. */
    tamanoMm: z.number().int().min(30).max(150),
  })
  .strict()
  .refine(
    (d) =>
      !esIdEstiloOjo(d.ojo) ||
      !esIdEstiloCentro(d.centro) ||
      centrosCompatibles(d.ojo).includes(d.centro),
    { message: 'Ese centro no va con ese ojo: elige uno de los que le quedan.', path: ['centro'] },
  )
  .refine(
    // Con un color mal escrito ya hay un error que lo dice: el contraste sólo se mide entre
    // colores de verdad (el motor lanza con otra cosa).
    (d) =>
      ![d.primerPlano, d.ojos, d.fondo, d.degradado?.color ?? '#ffffff'].every(esColor) ||
      disenoLegible({
        primerPlano: d.primerPlano,
        ojos: d.ojos,
        fondo: d.fondo,
        degradado: d.degradado ?? undefined,
      }),
    {
      message:
        'Con esos colores el QR no se leería: tinta oscura sobre fondo claro, con más contraste.',
    },
  );

export const QR_DE_MESAS = z
  .object({
    general: DISENO_DE_QR,
    porMesa: z
      .record(z.uuid('La llave de un diseño propio es el id de la mesa.'), DISENO_DE_QR)
      .refine((porMesa) => Object.keys(porMesa).length <= MAXIMO_DE_MESAS_PROPIAS, {
        message: `Hasta ${String(MAXIMO_DE_MESAS_PROPIAS)} mesas con diseño propio.`,
      }),
  })
  .strict();

export type DisenoDeQr = z.infer<typeof DISENO_DE_QR>;
export type QrDeMesas = z.infer<typeof QR_DE_MESAS>;

/** El QR de siempre: negro sobre blanco, recto, sin logo ni marco, de 6 cm. */
export const DISENO_POR_OMISION: DisenoDeQr = {
  modulo: 'square',
  ojo: 'square',
  centro: 'square',
  primerPlano: '#000000',
  ojos: '#000000',
  fondo: '#ffffff',
  degradado: null,
  conLogo: false,
  marco: null,
  tamanoMm: 60,
};

/** Lo guardado, leído sin confiar: lo que no tiene forma vuelve al QR de siempre. */
export function qrDeMesasGuardado(valor: unknown): QrDeMesas {
  const leido = QR_DE_MESAS.safeParse(valor);
  return leido.success ? leido.data : { general: DISENO_POR_OMISION, porMesa: {} };
}

/** El diseño con el que se imprime una mesa: el suyo, o el general. */
export function disenoDeLaMesa(qr: QrDeMesas, mesaId: string): DisenoDeQr {
  return qr.porMesa[mesaId] ?? qr.general;
}
