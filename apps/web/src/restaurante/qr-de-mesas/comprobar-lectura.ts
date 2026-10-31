import { PAPEL_BLANCO } from './colores-del-qr';
import { leerPixeles } from './leer-qr';

/**
 * ¿SE LEE? (DP-9.8) Antes de exportar, cada QR se dibuja como lo vería un teléfono y se lee con
 * jsQR en cuatro condiciones —tal cual, pequeño, girado y como foto comprimida—. Tiene que decir
 * EXACTAMENTE la dirección de su mesa en las cuatro; si no, no se deja imprimir.
 *
 * Las mismas cuatro pruebas del estudio de Morphiq-QRs, aquí sin intentar invertido: un QR claro
 * sobre oscuro lo lee jsQR pero no muchas cámaras.
 */

interface Prueba {
  readonly nombre: string;
  readonly lado: number;
  readonly giro?: number;
  readonly desenfoque?: number;
  readonly jpeg?: number;
}

const PRUEBAS: readonly Prueba[] = [
  { nombre: 'tal cual', lado: 1024 },
  { nombre: 'pequeño', lado: 320 },
  { nombre: 'girado 3°', lado: 640, giro: 3 },
  { nombre: 'foto comprimida', lado: 640, desenfoque: 0.45, jpeg: 0.72 },
];

export interface ResultadoDeLectura {
  readonly legible: boolean;
  /** Las pruebas en las que NO dijo la dirección de la mesa. */
  readonly fallidas: readonly string[];
}

function imagenDe(fuente: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    imagen.onload = () => {
      resolver(imagen);
    };
    imagen.onerror = () => {
      rechazar(new Error('No se pudo preparar el QR para revisarlo.'));
    };
    imagen.src = fuente;
  });
}

/** El SVG como imagen del navegador (por una URL temporal que se suelta al cargar). */
export async function imagenDelSvg(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    return await imagenDe(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function contexto(lado: number): CanvasRenderingContext2D {
  const lienzo = document.createElement('canvas');
  lienzo.width = lado;
  lienzo.height = lado;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('Este navegador no pudo revisar el QR.');
  return ctx;
}

async function leerEn(imagen: HTMLImageElement, prueba: Prueba): Promise<string | null> {
  const { lado } = prueba;
  const ctx = contexto(lado);
  ctx.fillStyle = PAPEL_BLANCO;
  ctx.fillRect(0, 0, lado, lado);
  const escala = Math.min(lado / imagen.naturalWidth, lado / imagen.naturalHeight) * 0.92;
  const ancho = imagen.naturalWidth * escala;
  const alto = imagen.naturalHeight * escala;
  ctx.translate(lado / 2, lado / 2);
  if (prueba.giro !== undefined) ctx.rotate((prueba.giro * Math.PI) / 180);
  if (prueba.desenfoque !== undefined) ctx.filter = `blur(${String(prueba.desenfoque)}px)`;
  ctx.drawImage(imagen, -ancho / 2, -alto / 2, ancho, alto);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  if (prueba.jpeg !== undefined) {
    const foto = await imagenDe(ctx.canvas.toDataURL('image/jpeg', prueba.jpeg));
    ctx.clearRect(0, 0, lado, lado);
    ctx.drawImage(foto, 0, 0, lado, lado);
  }
  const { data } = ctx.getImageData(0, 0, lado, lado);
  return leerPixeles(data, lado, lado);
}

/**
 * El veredicto: legible sólo si en TODAS las pruebas dijo exactamente `esperado` —otra dirección
 * o nada cuentan igual de mal—.
 */
export function veredicto(
  lecturas: readonly { readonly prueba: string; readonly dijo: string | null }[],
  esperado: string,
): ResultadoDeLectura {
  const fallidas = lecturas.filter((l) => l.dijo !== esperado).map((l) => l.prueba);
  return { legible: lecturas.length > 0 && fallidas.length === 0, fallidas };
}

/** Lee el QR en las cuatro condiciones; `legible` sólo si en todas dice `esperado`. */
export async function comprobarLectura(svg: string, esperado: string): Promise<ResultadoDeLectura> {
  const imagen = await imagenDelSvg(svg);
  const lecturas: { prueba: string; dijo: string | null }[] = [];
  for (const prueba of PRUEBAS) {
    // Un respiro entre lecturas: la pantalla no se congela mientras revisa diez mesas.
    await new Promise<void>((resolver) =>
      requestAnimationFrame(() => {
        resolver();
      }),
    );
    lecturas.push({ prueba: prueba.nombre, dijo: await leerEn(imagen, prueba) });
  }
  return veredicto(lecturas, esperado);
}
