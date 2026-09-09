import { CircleCheck, CircleDashed } from 'lucide-react';

import PageHeader from '@/mh/components/common/PageHeader';

/**
 * El hueco del Dashboard, mientras se portan sus pantallas.
 *
 * No es una pantalla inventada: es el estado real del port, dibujado con SU
 * sistema —`bg-card`, `border-border`, `font-heading`, `premium-sheen`— para
 * que lo que se vea alrededor sea exactamente lo que va a ver cuando cada
 * pantalla ocupe su sitio. Desaparece cuando llegue su Dashboard.
 */

export const dynamic = 'force-dynamic';

interface Pieza {
  readonly nombre: string;
  readonly detalle: string;
  readonly lista: boolean;
}

const PIEZAS: readonly Pieza[] = [
  {
    nombre: 'Tu diseño',
    detalle: 'index.css completo, tus tokens, el parche de modo oscuro y el blindaje de impresión',
    lista: true,
  },
  {
    nombre: 'Tu barra lateral',
    detalle: 'con su gradiente del activo, su relieve, el colapsado y el cajón de móvil',
    lista: true,
  },
  { nombre: 'Tu modo claro / oscuro', detalle: 'con su animación de 480 ms', lista: true },
  {
    nombre: 'Tu acceso con PIN',
    detalle: 'la misma pantalla; el PIN ahora se comprueba en el servidor',
    lista: true,
  },
  { nombre: 'Tu punto de venta', detalle: 'pages/POS.jsx y components/pos/*', lista: false },
  {
    nombre: 'Tus productos',
    detalle: 'con tipos de venta, modificadores y desglose',
    lista: false,
  },
  { nombre: 'Tu caja', detalle: 'con sus tickets y su corte', lista: false },
  { nombre: 'Tu inventario y tus recetas', detalle: 'con sus gramajes y sus costos', lista: false },
];

export default function PaginaInicioMH() {
  const listas = PIEZAS.filter((p) => p.lista).length;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Tu sistema, de vuelta"
        description={`${String(listas)} de ${String(PIEZAS.length)} piezas en su sitio. Las demás entran una por una, sin tocar tu diseño.`}
      />

      <div className="premium-sheen rounded-lg border border-border bg-card overflow-hidden">
        <ul className="divide-y divide-border">
          {PIEZAS.map((pieza) => (
            <li key={pieza.nombre} className="flex items-start gap-3 px-4 py-3">
              {pieza.lista ? (
                <CircleCheck className="w-5 h-5 shrink-0 mt-0.5 text-primary" aria-hidden />
              ) : (
                <CircleDashed
                  className="w-5 h-5 shrink-0 mt-0.5 text-muted-foreground"
                  aria-hidden
                />
              )}
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${pieza.lista ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {pieza.nombre}
                  <span className="sr-only">{pieza.lista ? ' — lista' : ' — pendiente'}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{pieza.detalle}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Mientras tanto, las pantallas provisionales siguen vivas en <code>/venta</code>,{' '}
        <code>/corte</code>, <code>/productos</code>, <code>/inventario</code>,{' '}
        <code>/recetas</code>, <code>/accesos</code> y <code>/configuracion</code>. Cada una se
        retira el día que la tuya ocupa su lugar.
      </p>
    </div>
  );
}
