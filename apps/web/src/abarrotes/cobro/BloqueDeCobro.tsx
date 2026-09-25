'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, CampoDeDinero, Dinero } from '@morphiqpos/ui/sistema';

import { avisoDeFiado, type ClienteDelCobro } from './ElegirCliente.tsx';

/**
 * EL BLOQUE DE COBRO: en reposo, COBRAR y sus desvíos; al pulsar, se EXPANDE en su sitio.
 *
 * Un modal oscurece el fondo, roba el foco y obliga a dos viajes visuales, doscientas veces
 * al día. Expandiendo, la lista sigue a la vista —el cliente sigue verificando— y volver a
 * la venta es instantáneo. El cambio en grande porque es el número que se dice en voz alta y
 * el que causa discusiones.
 */

/** Los billetes con los que se paga más de la mitad de los tickets. */
const DENOMINACIONES = [15_000, 20_000, 50_000] as const;

/** Los desvíos del camino por omisión, con su tecla impresa al lado. */
export const DESVIOS = [
  { clave: 'tarjeta', etiqueta: 'Tarjeta', tecla: 'F9' },
  { clave: 'transferencia', etiqueta: 'Transferencia', tecla: 'F10' },
  { clave: 'fiado', etiqueta: 'Fiado', tecla: 'F11' },
] as const;

export type Metodo = 'efectivo' | (typeof DESVIOS)[number]['clave'];

/** Lo que hace una tecla del cobro. */
export type AccionDeTecla =
  | { readonly tipo: 'metodo'; readonly metodo: Metodo }
  | { readonly tipo: 'cliente' };

/**
 * Las teclas que este bloque IMPRIME, resueltas aquí mismo: una tecla impresa que nadie
 * escucha es un botón muerto (`atajos-impresos.contrato.test.ts`), y tenerlas en otro
 * archivo es cómo se separan.
 */
export function accionDeTecla(evento: { readonly key: string }): AccionDeTecla | null {
  if (evento.key === 'F12') return { tipo: 'metodo', metodo: 'efectivo' };
  if (evento.key === 'F4') return { tipo: 'cliente' };
  const desvio = DESVIOS.find((d) => d.tecla === evento.key);
  return desvio === undefined ? null : { tipo: 'metodo', metodo: desvio.clave };
}

function etiquetaDeMetodo(metodo: Metodo): string {
  return DESVIOS.find((desvio) => desvio.clave === metodo)?.etiqueta ?? 'Efectivo';
}

/**
 * La tecla, impresa junto a su acción: en ráfaga se usa por su tecla, no por su posición.
 * Con el color del botón a opacidad plena: es información de uso, no adorno (4.5:1).
 */
export function Tecla({ children }: { readonly children: string }) {
  return (
    <kbd
      aria-hidden="true"
      className="hidden rounded-sm border border-current px-(--espacio-1) font-numeros text-xs font-medium md:inline"
    >
      {children}
    </kbd>
  );
}

export function CobroEnReposo({
  hayLineas,
  onElegir,
}: {
  readonly hayLineas: boolean;
  readonly onElegir: (metodo: Metodo) => void;
}) {
  return (
    // En la tableta, COBRAR y sus desvíos en un renglón para no comerse la lista.
    <div className="flex flex-col gap-(--espacio-2) md:flex-row md:items-center xl:flex-col xl:items-stretch">
      <Button
        size="lg"
        className="min-h-20 w-full justify-between text-lg md:flex-1 xl:flex-none"
        disabled={!hayLineas}
        onClick={() => {
          onElegir('efectivo');
        }}
      >
        <span>COBRAR</span>
        <Tecla>F12</Tecla>
      </Button>
      <div className="flex flex-wrap gap-(--espacio-1)">
        {DESVIOS.map((desvio) => (
          <Button
            key={desvio.clave}
            size="sm"
            variant="ghost"
            disabled={!hayLineas}
            onClick={() => {
              onElegir(desvio.clave);
            }}
          >
            {desvio.etiqueta}
            <Tecla>{desvio.tecla}</Tecla>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function CobroExpandido({
  metodo,
  total,
  recibido,
  onRecibido,
  cliente,
  onElegirCliente,
  enLinea,
  enviando,
  onConfirmar,
  onRegresar,
}: {
  readonly metodo: Metodo;
  readonly total: number;
  readonly recibido: number | null;
  readonly onRecibido: (centavos: number | null) => void;
  readonly cliente: ClienteDelCobro | null;
  readonly onElegirCliente: () => void;
  readonly enLinea: boolean;
  readonly enviando: boolean;
  readonly onConfirmar: () => void;
  readonly onRegresar: () => void;
}) {
  // Un campo vacío o que no es un importe cuenta como cero: el cambio sale negativo y
  // CONFIRMAR se queda apagado hasta que lo recibido alcance.
  const cambio = (recibido ?? 0) - total;
  const falta = cambio < 0;
  const sinCliente = metodo === 'fiado' && cliente === null;
  const aviso = metodo === 'fiado' && cliente !== null ? avisoDeFiado(cliente, total) : null;

  return (
    <>
      <h2 className="text-xs font-medium tracking-widest text-texto-sutil uppercase">
        {etiquetaDeMetodo(metodo)}
      </h2>
      {metodo === 'efectivo' && (
        <div className="grid gap-(--espacio-3) md:grid-cols-2 md:items-center xl:grid-cols-1">
          <div className="flex flex-col gap-(--espacio-2)">
            <div className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor="cobrar-recibido">Recibí</Label>
              <CampoDeDinero
                id="cobrar-recibido"
                tamano="grande"
                autoFocus
                centavos={recibido}
                alCambiar={onRecibido}
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter' && cambio >= 0 && !enviando) onConfirmar();
                }}
              />
            </div>
            {/* `$200` es la respuesta en más de la mitad de los tickets. */}
            <div className="grid grid-cols-4 gap-(--espacio-1)">
              {[total, ...DENOMINACIONES].map((monto, indice) => (
                <Button
                  key={indice === 0 ? 'exacto' : String(monto)}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onRecibido(monto);
                  }}
                >
                  {indice === 0 ? 'Exacto' : <Dinero centavos={monto} tamano="sm" />}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center gap-(--espacio-1) text-center">
            <p className="text-xs font-medium tracking-widest text-texto-sutil uppercase">
              {falta ? 'Falta' : 'Cambio'}
            </p>
            <Dinero
              centavos={falta ? -cambio : cambio}
              tamano="total"
              className={falta ? 'leading-none text-texto-sutil' : 'leading-none'}
            />
          </div>
        </div>
      )}
      {metodo === 'fiado' && (
        // A quién se fía, ANTES de confirmar: la venta sale de la tienda a su nombre.
        <div className="flex flex-col gap-(--espacio-2)">
          {cliente === null ? (
            <Aviso tono="atencion" titulo="¿A quién se le fía?">
              El fiado va a nombre de alguien. Elígelo con F4.
            </Aviso>
          ) : (
            <p className="flex items-baseline justify-between gap-(--espacio-2)">
              <span className="font-medium">{cliente.nombre}</span>
              <span className="inline-flex items-baseline gap-(--espacio-1) text-sm text-texto-sutil">
                ya debe <Dinero centavos={cliente.debe} tamano="sm" />
              </span>
            </p>
          )}
          {aviso === null ? null : <Aviso tono="atencion" titulo={aviso} />}
          <Button variant="outline" size="sm" onClick={onElegirCliente}>
            {cliente === null ? 'Elegir cliente' : 'Otro cliente'}
            <Tecla>F4</Tecla>
          </Button>
        </div>
      )}
      <Button
        size="lg"
        variant="success"
        className="min-h-20 w-full justify-between text-lg"
        aria-busy={enviando}
        disabled={!enLinea || enviando || (metodo === 'efectivo' && falta) || sinCliente}
        onClick={onConfirmar}
      >
        <span>{enviando ? 'Cobrando…' : 'CONFIRMAR'}</span>
        <Tecla>Enter</Tecla>
      </Button>
      <Button variant="ghost" size="sm" className="w-full" onClick={onRegresar}>
        Esc para regresar
      </Button>
    </>
  );
}
