'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import {
  Aviso,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Check, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · restaurante · precuenta
 *
 * La hoja que el mesero entrega al comensal para que revise antes de pagar.
 * 40-100 veces al día. Una sola acción: IMPRIMIR.
 *
 * ── Por qué a TAMAÑO REAL, y por qué lo que cambia es el ALREDEDOR ───────
 * Lo que se ve es lo que sale del rollo: si un nombre cabe en la pantalla y en
 * el papel se parte en dos, el mesero descubre el corte con el comensal
 * delante. Por eso la hoja no se encoge con la ventana y lo que cambia por
 * dispositivo es lo de fuera: teléfono, acción pegada abajo —ahí llega el
 * pulgar—; tablet, barra flotante angosta —se opera de pie—; PC, dos columnas.
 *
 * ── Por qué PRE-CUENTA y nunca «ticket», y por qué manda el CÓDIGO ───────
 * Porque no se ha cobrado nada, y un papel que dice TICKET sobre algo no
 * pagado es la puerta por la que se escapa una cuenta. Y porque el cajero debe
 * hallar esa cuenta entre veinte pendientes: el número de mesa se reutiliza
 * cinco veces por noche, el código es de ESA cuenta. Por eso va abajo, grande
 * y monoespaciado — segunda jerarquía, después del total.
 *
 * ── Ni la impresora ni la red detienen el turno ──────────────────────────
 * Si no se pudo LEER la cuenta, la pantalla lo dice y ofrece reintentar: una
 * precuenta a medias no se entrega. Si no se pudo IMPRIMIR, la hoja se queda
 * en pantalla y el aviso dice la salida que dicta el documento: enseñar esta
 * hoja y llevar al comensal a caja con el código.
 *
 * ── Lo que no hace ───────────────────────────────────────────────────────
 * No cobra ni fija propina: el mesero no cobra, y eso es control interno. Si
 * el puente recorta el dinero —es de rol caja— la hoja dice «a definir en
 * caja»; si falta el TOTAL el botón se apaga y dice por qué. Fuera de alcance:
 * el rollo de 58 mm comparte maqueta con el de 80.
 */

export interface LineaPrecuenta {
  readonly id: string;
  readonly producto_nombre: string;
  readonly cantidad: number;
  readonly precio_unitario_snapshot: number;
  readonly total: number;
  readonly notas_producto: string | null;
}

/**
 * Los importes van OPCIONALES a propósito: `total`, `subtotal`, `impuestos` y
 * `propina_monto` declaran `rolesLectura: CAJA`, así que a un mesero llegan
 * ausentes, no en cero. Tiparlos `number` volvería «$0.00» un campo que falta.
 */
export interface CuentaPrecuenta {
  readonly id: string;
  readonly folio: string;
  /** Derivado de `mesas.numero`, con `conversion: 'entero'`: NÚMERO. */
  readonly mesa_numero: number | null;
  readonly personas: number | null;
  readonly codigo_caja: string | null;
  readonly subtotal?: number | null;
  readonly impuestos?: number | null;
  readonly total?: number | null;
  readonly propina_monto?: number | null;
}

export interface PrecuentaProps {
  /** La cuenta a imprimir. Si no viene, se lee de `?cuenta=` en la dirección. */
  readonly ordenId?: string;
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly cuentaInicial?: CuentaPrecuenta | null;
  readonly filasIniciales?: readonly LineaPrecuenta[];
  /** Los dos anchos de rollo térmico que existen en la vida real. */
  readonly ancho?: 58 | 80;
}

/**
 * El borde del rollo, sobre la tabla del sistema: sólo su caja, no su marcado.
 *
 * DIFERENCIA CON EL PAPEL, dicha y no rodeada: la tabla trae el ritmo de una
 * pantalla de PC —cuerpo `sm`, doce píxeles de relleno por lado, la cabecera en
 * gris— y en 80 mm (302 px) eso le deja al nombre del platillo menos ancho que el
 * del rollo, así que aquí un nombre puede partirse donde en el papel no se parte.
 * Llevarla a la densidad del papel es una variante de `Tabla` que la biblioteca
 * todavía no tiene (una `densidad` de rollo: cuerpo `xs`, relleno `--espacio-1`);
 * desde fuera sólo se alcanzaba metiendo la mano en su `<td>`.
 */
const TABLA_DE_ROLLO = 'rounded-none border-x-0 border-dashed';

/** Pesos a centavos contando dígitos: `58.995 * 100` pierde medio centavo. */
function aCentavos(pesos: number): number {
  if (!Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Un importe recortado por rol llega vacío, no en cero. Se dice, no se finge. */
function Importe({
  pesos,
  tamano = 'xs',
  className = '',
}: {
  readonly pesos: number | null | undefined;
  readonly tamano?: 'xs' | 'xl';
  readonly className?: string;
}) {
  if (pesos == null) return <span className={className}>—</span>;
  return <Dinero centavos={aCentavos(pesos)} tamano={tamano} className={className} />;
}

function idDeLaUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('cuenta');
}

export function Precuenta({ ordenId, cuentaInicial, filasIniciales, ancho }: PrecuentaProps) {
  const voc = useVocabulario();
  const anchoMm = ancho ?? 80;
  const [cuenta, setCuenta] = useState<CuentaPrecuenta | null | undefined>(cuentaInicial);
  const [lineas, setLineas] = useState<readonly LineaPrecuenta[]>(filasIniciales ?? []);
  const [error, setError] = useState<string | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [falloImpresion, setFalloImpresion] = useState(false);
  /**
   * Cuál hoja es ésta, según el servidor.
   *
   * `null` mientras no se ha impreso ninguna. Desde la segunda importa y se dice
   * en la hoja: una cuenta se escapa cuando el cajero cobra la hoja vieja de una
   * mesa que siguió consumiendo, y el número es lo que le hace mirar el total.
   */
  const [copia, setCopia] = useState<number | null>(null);
  // Cada intento de lectura es un número: reintentar lo sube y el efecto lee otra
  // vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (cuentaInicial !== undefined) return;
    const id = ordenId ?? idDeLaUrl();
    let vivo = true;
    if (id === null) {
      // «No hay cuenta» se escribe en el siguiente tick y no aquí: un setState
      // en el cuerpo del efecto encadena un render extra en cada montaje.
      const sinCuenta = setTimeout(() => {
        setCuenta(null);
      });
      return () => {
        clearTimeout(sinCuenta);
      };
    }
    // `orden_visual` es el orden en que el mesero capturó, que es el que el
    // comensal reconoce al repasar la hoja con el dedo.
    Promise.all([
      consultarPuente<CuentaPrecuenta>('Venta', { filtro: { id }, limite: 1 }),
      consultarPuente<LineaPrecuenta>('DetalleVenta', {
        filtro: { venta_id: id },
        orden: 'orden_visual',
      }),
    ])
      .then(([cuentas, filas]) => {
        if (!vivo) return;
        setCuenta(cuentas[0] ?? null);
        setLineas(filas);
      })
      .catch((fallo: unknown) => {
        if (!vivo) return;
        setError(
          fallo instanceof Error ? fallo.message : `No se pudo leer ${voc.enFrase('orden')}.`,
        );
        setCuenta(null);
      });
    return () => {
      vivo = false;
    };
  }, [cuentaInicial, ordenId, voc, intento]);

  function reintentar(): void {
    setError(null);
    setCuenta(undefined);
    setIntento((previo) => previo + 1);
  }

  async function imprimir(): Promise<void> {
    if (cuenta == null) return;
    setImprimiendo(true);
    setFalloImpresion(false);
    try {
      // El documento no nombra ruta: se usa /api/<dominio>/<verbo>, la misma
      // convención de `imprimir-comanda` (05-DATOS §6).
      const hoja = await invocarComando<{ readonly copia: number }>(
        '/api/restaurante/imprimir-precuenta',
        { ordenId: cuenta.id, anchoMm },
      );
      setCopia(hoja.copia);
    } catch {
      // El error no se traga: tiene salida alterna, y es la que dicta el documento.
      setFalloImpresion(true);
    } finally {
      setImprimiendo(false);
    }
  }

  const hayHoja = error === null && cuenta != null && lineas.length > 0;
  const sinTotal = cuenta?.total == null;
  const codigo = cuenta?.codigo_caja ?? cuenta?.folio ?? '';
  // Milímetros de verdad; el tope del 100 % evita el desborde a 320 px.
  const estilo = { width: `${anchoMm}mm`, maxWidth: '100%' };

  function hoja() {
    // No leyó: una hoja a medias manda al comensal a caja con un total que no es.
    if (error !== null) {
      return (
        <ErrorDePantalla
          className="mx-auto max-w-prose"
          titulo={`No se pudo leer ${voc.enFrase('orden')}`}
          queHacer="No entregues una precuenta a medias: revisa la conexión y vuelve a intentarlo."
          detalle={error}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      );
    }
    // Esqueleto con la FORMA de la hoja: así nada salta cuando llegan los datos.
    if (cuenta === undefined) {
      return (
        <Superficie
          nivel={2}
          radio="sm"
          relleno={3}
          role="status"
          aria-busy="true"
          aria-label="Armando la precuenta"
          className="mx-auto flex flex-col gap-(--espacio-2)"
          style={estilo}
        >
          <Esqueleto className="mx-auto h-5 w-32" />
          <Esqueleto className="mx-auto h-3 w-40" />
          {Array.from({ length: 8 }, (_, i) => (
            <Esqueleto key={i} className="h-3 w-full" />
          ))}
          <Esqueleto className="ml-auto h-5 w-28" />
          <Esqueleto className="mx-auto h-20 w-40" />
        </Superficie>
      );
    }
    // El vacío ENSEÑA de dónde sale una precuenta; no se disculpa por no tenerla.
    if (cuenta === null || lineas.length === 0) {
      const sinCuenta = cuenta === null;
      const titulo = sinCuenta
        ? `Aquí se imprime la precuenta de ${voc.enFraseCon('un', 'orden')} abiert${voc.terminacion('orden')}`
        : `${voc.conDeterminante('este', 'orden')} todavía no tiene ${voc.plural('linea_orden')}`;
      const texto = sinCuenta
        ? 'Abre la mesa en el mapa y pide la precuenta desde ahí: el código para caja es el de esa cuenta, no el de la mesa.'
        : `Una hoja en blanco manda al ${voc.singular('cliente')} a caja sin nada que revisar. Toma la orden y vuelve: la hoja se arma sola.`;
      return (
        <Superficie radio="lg" relleno={6} como="section" className="mx-auto max-w-prose">
          <Vacio
            className="py-0"
            icono={<Printer />}
            titulo={titulo}
            explicacion={texto}
            accion={
              <Button asChild>
                <a href="/restaurante/mapa-de-mesas">
                  Ir al mapa de {voc.plural('unidad_servicio')}
                </a>
              </Button>
            }
          />
        </Superficie>
      );
    }
    return <Hoja cuenta={cuenta} lineas={lineas} estilo={estilo} copia={copia} />;
  }

  return (
    <div className="min-h-dvh bg-fondo-sutil">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-(--espacio-4) p-(--espacio-4) md:py-(--espacio-8) xl:flex-row xl:items-start xl:justify-center xl:gap-(--espacio-10) xl:py-(--espacio-10)">
        <main className="w-full min-w-0 xl:w-auto">
          {/* Sólo para el lector de pantalla: lo PRIMERO que se ve es la hoja. */}
          <h1 className="sr-only">Precuenta</h1>
          {hoja()}
        </main>
        {hayHoja && (
          // Teléfono: barra a sangre pegada abajo, donde llega el pulgar. Tablet: la
          // misma barra, angosta y flotando sobre la hoja. PC: la columna de al lado.
          <Superficie
            como="aside"
            nivel={3}
            relleno={4}
            aria-label="Imprimir la precuenta"
            className="sticky bottom-0 z-10 -mx-(--espacio-4) flex flex-col gap-(--espacio-3) rounded-none border-x-0 border-b-0 md:bottom-(--espacio-4) md:mx-auto md:w-full md:max-w-sm md:rounded-lg md:border-x md:border-b xl:top-(--espacio-10) xl:bottom-auto xl:mx-0 xl:w-64 xl:self-start xl:shadow-1"
          >
            {falloImpresion && (
              <Aviso tono="peligro" titulo="No se pudo imprimir.">
                Puedes enseñar esta pantalla al {voc.singular('cliente')} y llevarlo a caja con el
                código <span className="font-mono font-bold tracking-widest">{codigo}</span>.
              </Aviso>
            )}
            {/* Un solo botón: el mesero no cobra, y eso es control interno. */}
            <Button
              type="button"
              size="lg"
              className="min-h-[calc(var(--altura-control)*1.5)] w-full text-lg"
              disabled={imprimiendo || sinTotal}
              onClick={() => {
                void imprimir();
              }}
            >
              <Printer aria-hidden />
              {imprimiendo ? 'Imprimiendo…' : 'Imprimir'}
            </Button>
            {/* Un botón apagado sin motivo es peor que uno que falla. */}
            <p className="text-xs text-texto-sutil">
              {sinTotal
                ? `El total de ${voc.enFraseCon('este', 'orden')} no llegó a esta pantalla. Pídela desde caja.`
                : `Se ve a tamaño real: papel de ${anchoMm} mm.`}
            </p>
            {copia === null || falloImpresion ? null : (
              <p
                role="status"
                className="flex items-center gap-(--espacio-1) text-xs text-texto-sutil"
              >
                <Check aria-hidden className="size-4 text-exito" />
                Hoja {copia} enviada a la impresora.
              </p>
            )}
          </Superficie>
        )}
      </div>
    </div>
  );
}

interface HojaProps {
  readonly cuenta: CuentaPrecuenta;
  readonly lineas: readonly LineaPrecuenta[];
  readonly estilo: { readonly width: string; readonly maxWidth: string };
  /** Cuál hoja es ésta. `null` antes de imprimir; de 2 en adelante, va marcada. */
  readonly copia: number | null;
}

/** La hoja térmica. Lo que se ve aquí es lo que sale del rollo. */
function Hoja({ cuenta, lineas, estilo, copia }: HojaProps) {
  const voc = useVocabulario();
  const mesa = cuenta.mesa_numero === null ? '—' : String(cuenta.mesa_numero);
  const propina = cuenta.propina_monto;

  const columnas: readonly ColumnaDeTabla<LineaPrecuenta>[] = [
    {
      clave: 'platillo',
      titulo: voc.titulo('linea_orden'),
      celda: (linea) => (
        <span className="block min-w-0">
          <span className="font-bold">{linea.cantidad}×</span> {linea.producto_nombre}
          <span className="block text-texto-sutil">
            <Importe pesos={linea.precio_unitario_snapshot} /> c/u
            {linea.notas_producto === null ? '' : ` · ${linea.notas_producto}`}
          </span>
        </span>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (linea) => <Importe pesos={linea.total} />,
    },
  ];

  return (
    <Superficie
      como="article"
      nivel={2}
      radio="sm"
      relleno={3}
      aria-label={`Precuenta de la mesa ${mesa}, folio ${cuenta.folio}`}
      className="mx-auto flex flex-col gap-(--espacio-2) font-mono text-xs leading-snug text-texto"
      style={estilo}
    >
      <header className="text-center">
        <p className="text-base font-bold tracking-widest">PRE-CUENTA</p>
        <p className="text-texto-sutil">No es comprobante de pago</p>
        {/* En la CABECERA y no al pie: lo que se mira de una hoja reimpresa es
            arriba, y lo que hay que mirar después es el total. */}
        {copia !== null && copia > 1 && (
          <p className="mt-(--espacio-1) font-bold tracking-widest">REIMPRESIÓN · {copia}ª HOJA</p>
        )}
      </header>
      <p className="text-center">
        Folio {cuenta.folio} · Mesa {mesa} · {cuenta.personas ?? '—'} personas
      </p>

      <Tabla
        etiqueta={voc.titulo('linea_orden', true)}
        columnas={columnas}
        filas={lineas}
        claveDe={(linea) => linea.id}
        alto="max-h-none"
        className={TABLA_DE_ROLLO}
      />

      {/* 1 · EL TOTAL. Es lo que el comensal busca primero, y lo único que se lee
          desde el otro lado de la mesa: por eso es lo más grande de la hoja, por
          encima del código para caja. */}
      <dl className="grid grid-cols-[1fr_auto] gap-x-(--espacio-2) gap-y-(--espacio-1)">
        <dt>Subtotal</dt>
        <dd className="text-right">
          <Importe pesos={cuenta.subtotal} />
        </dd>
        <dt>IVA</dt>
        <dd className="text-right">
          <Importe pesos={cuenta.impuestos} />
        </dd>
        <dt>Propina</dt>
        <dd className="text-right">
          {/* La propina no decidida se DICE: el hueco lo rellena el comensal en su cabeza. */}
          {propina == null ? 'a definir en caja' : <Importe pesos={propina} />}
        </dd>
        <dt className="mt-(--espacio-1) self-baseline text-lg font-bold">TOTAL</dt>
        <dd className="mt-(--espacio-1) self-baseline text-right text-lg">
          <Importe pesos={cuenta.total} tamano="xl" className="font-bold" />
        </dd>
      </dl>

      <Separator />

      {/* 2 · EL CÓDIGO PARA CAJA. El comensal camina con este papel en la mano y
          el cajero busca ESTA cuenta, no la mesa, entre veinte pendientes. Grande
          y monoespaciado, pero un escalón por debajo del total. */}
      <section className="text-center" aria-label="Código para caja">
        <p className="text-texto-sutil">CÓDIGO PARA CAJA</p>
        <p className="mt-(--espacio-1) border border-dashed border-borde-fuerte px-(--espacio-2) py-(--espacio-2) text-xl font-bold tracking-widest">
          {cuenta.codigo_caja ?? cuenta.folio}
        </p>
      </section>
      <p className="text-center text-texto-sutil">Pasa a caja con este código.</p>
    </Superficie>
  );
}
