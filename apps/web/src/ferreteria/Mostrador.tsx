'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  TablaAdaptable,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { ChevronDown, ChevronUp, MapPin, Minus, Plus, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { buscar, cercanas, normalizar, type MaterialDeMostrador } from './buscar-material';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · mostrador
 *
 * El 70 % del uso del modelo: 25 a 60 ventas al día con el mismo par de manos.
 * La acción principal es BUSCAR, y por eso el foco arranca en el campo.
 *
 * ── Por qué arranca CON los ocho grupos y no en blanco ───────────────────
 * `abarrotes` abre con la lista vacía y «escanea el primer producto». Aquí eso
 * sería un error: la primera pregunta del mostradorista al cliente es «¿de qué
 * es?», y los ocho grupos de línea son esa pregunta convertida en botones.
 *
 * ── Por qué los resultados son una TABLA en la PC y tarjetas en el pasillo ─
 * En el mostrador se COMPARA —cinco tornillos de la misma medida, ¿galvanizado o
 * negro?, ¿Truper o Pretul?—, y comparar es leer una columna de arriba abajo: medida,
 * acabado, marca, precio, existencia y DÓNDE, cada una alineada. En la tableta del
 * pasillo se camina hacia el rack, y la misma fila es una tarjeta con la ubicación
 * en negritas. Es la misma lista con las mismas columnas (`TablaAdaptable`).
 *
 * ── Por qué el total NO es lo más grande ─────────────────────────────────
 * Aquí el cliente no mira la pantalla: mira la pieza que le acaban de poner
 * enfrente. El total importa al final, no durante.
 *
 * ── Por qué la franja del cliente está arriba y no en el cobro ───────────
 * Porque en una remisión a crédito NO HAY COBRO. El saldo, el límite y quién
 * recoge tienen que verse ANTES de despachar o no se ven nunca.
 *
 * ── Por qué no hay esqueleto mientras se teclea ──────────────────────────
 * El índice vive en memoria del cliente y filtrar es local: por debajo de 100
 * ms no hay nada que anunciar. El esqueleto es sólo para la HIDRATACIÓN del
 * índice, que sí cruza la red, y una sola vez.
 *
 * ── Alcance recortado, dicho aquí y no escondido ─────────────────────────
 * Quedan FUERA, cada una en su pantalla: el corte de material (F6), la ficha con
 * foto (F5), la cotización (F8), suspender (F9) y el diálogo de PIN sobre el
 * límite. La equivalencia real (F-060) sale de `equivalencias`; mientras no
 * exista, cero resultados aproxima por familia y lo dice en la pantalla.
 */

/** «¿De qué es?», convertido en botones. No son productos: son puntos de partida. */
const GRUPOS = [
  'Fijación',
  'Eléctrico',
  'Plomería',
  'Pintura',
  'Herramienta',
  'Cerrajería',
  'Construcción',
  'Jardín',
] as const;

/** F-153: el conocimiento del mostradorista. Aquí sólo siembran la búsqueda. */
const LISTAS = ['tinaco', 'contacto', 'llave'] as const;

export interface ClienteDeMostrador {
  readonly id: string;
  readonly nombre: string;
  readonly obra: string | null;
  readonly saldoCentavos: number;
  readonly limiteCentavos: number;
  readonly diasVencido: number;
  readonly recoge: string | null;
  readonly recogeAutorizado: boolean;
}

export interface MostradorProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly MaterialDeMostrador[];
  readonly clienteInicial?: ClienteDeMostrador | null;
  /** La caja cerrada no bloquea el mostrador: armar no es cobrar. */
  readonly cajaCerrada?: boolean;
  /**
   * LO QUE SE VIENE BUSCANDO, cuando quien llega ya sabe qué quiere: la pantalla
   * de Entradas manda aquí cada renglón del proveedor que no pudo emparejar, con
   * su descripción ya escrita.
   */
  readonly consultaInicial?: string;
}

interface Partida {
  readonly material: MaterialDeMostrador;
  readonly cantidad: number;
}

/**
 * Lo que devuelve `ferreteria.crear_nota_mostrador`. Se declara aquí y no se
 * importa del comando: ese módulo es `server-only` y esta pantalla corre en el
 * navegador.
 */
interface ResultadoNotaMostrador {
  readonly ordenId: string;
  readonly notaId: string;
  readonly folio: string;
  readonly totalCentavos: string;
}

/** Las columnas de un resultado. Cada una se gana su lugar (`04-INTERFAZ` §1). */
function columnasDeResultado(
  nombreDeMaterial: string,
): readonly ColumnaDeTabla<MaterialDeMostrador>[] {
  return [
    {
      clave: 'material',
      titulo: nombreDeMaterial,
      celda: (m) => (
        <span className="flex flex-col">
          <span className="text-base font-semibold">{m.medida}</span>
          <span className="text-xs text-texto-sutil">{m.nombre}</span>
        </span>
      ),
    },
    { clave: 'acabado', titulo: 'Acabado', desde: 'md', celda: (m) => m.acabado ?? '—' },
    { clave: 'marca', titulo: 'Marca', desde: 'lg', celda: (m) => m.marca ?? '—' },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      orden: (m) => m.precioCentavos,
      celda: (m) => <Dinero centavos={m.precioCentavos} tamano="sm" />,
    },
    {
      clave: 'hay',
      titulo: 'Hay',
      numerica: true,
      orden: (m) => m.existencia,
      // Negativo es un dato que NO es verdad: falta capturar una entrada. Se dice.
      celda: (m) =>
        m.existencia < 0 ? (
          <span className="font-medium text-peligro">revisar entradas</span>
        ) : (
          <Cifra valor={m.existencia} unidad={m.unidad} />
        ),
    },
    {
      clave: 'donde',
      titulo: 'Dónde',
      // En negritas siempre: en el pasillo es el dato que se está usando.
      celda: (m) => (
        <span className="inline-flex items-center gap-(--espacio-1) font-bold">
          <MapPin aria-hidden="true" className="size-4 shrink-0" />
          {m.ubicacion ?? 'sin capturar'}
        </span>
      ),
    },
  ];
}

export function Mostrador({
  filasIniciales,
  clienteInicial,
  cajaCerrada = false,
  consultaInicial = '',
}: MostradorProps) {
  const voc = useVocabulario();
  const enrutador = useRouter();
  const [filas, setFilas] = useState<readonly MaterialDeMostrador[] | null>(filasIniciales ?? null);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [consulta, setConsulta] = useState(consultaInicial);
  const [partidas, setPartidas] = useState<readonly Partida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ventaAbierta, setVentaAbierta] = useState(false);
  /** El folio de la última nota mandada: lo que el cliente canta en la caja. */
  const [folioEnCaja, setFolioEnCaja] = useState<string | null>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const cliente = clienteInicial ?? null;

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    let vivo = true;
    // El índice se hidrata una vez al abrir, de la vista `materiales_mostrador`:
    // precio y existencia EN VIVO, y los atributos con su valor original.
    consultarPuente<MaterialDeMostrador>('MaterialMostrador', { limite: 6000 })
      .then((leidas) => {
        if (vivo) setFilas(leidas);
      })
      .catch((fallo: unknown) => {
        if (vivo)
          setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer el catálogo.');
      });
    return () => {
      vivo = false;
    };
  }, [filasIniciales, intento]);

  const palabras = useMemo(
    () =>
      normalizar(consulta)
        .split(' ')
        .filter((p) => p !== ''),
    [consulta],
  );
  const resultados = useMemo(() => buscar(filas ?? [], palabras), [filas, palabras]);
  const total = partidas.reduce((suma, p) => suma + p.material.precioCentavos * p.cantidad, 0);
  const sobreLimite = cliente !== null && cliente.saldoCentavos > cliente.limiteCentavos;
  const columnas = useMemo(() => columnasDeResultado(voc.titulo('producto')), [voc]);

  useEffect(() => {
    // Escribir desde cualquier parte va al buscador —la acción principal no gasta
    // ninguna tecla—. Esc limpia la búsqueda; con la búsqueda vacía, la venta.
    function alTeclear(evento: KeyboardEvent): void {
      const enCampo = evento.target instanceof HTMLInputElement;
      if (evento.key === 'Escape') {
        if (consulta === '') setPartidas([]);
        setConsulta('');
        return;
      }
      if (enCampo || evento.ctrlKey || evento.altKey || evento.metaKey) return;
      if (evento.key.length !== 1) return;
      setConsulta((actual) => actual + evento.key);
      buscador.current?.focus();
    }
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, [consulta]);

  function agregar(material: MaterialDeMostrador): void {
    setPartidas((actuales) =>
      actuales.some((p) => p.material.id === material.id)
        ? actuales.map((p) =>
            p.material.id === material.id ? { ...p, cantidad: p.cantidad + 1 } : p,
          )
        : [...actuales, { material, cantidad: 1 }],
    );
  }

  function cambiarCantidad(id: string, paso: number): void {
    setPartidas((actuales) =>
      actuales
        .map((p) => (p.material.id === id ? { ...p, cantidad: p.cantidad + paso } : p))
        .filter((p) => p.cantidad > 0),
    );
  }

  /** Crear la nota: el primer paso de las dos salidas del mostrador. */
  async function crearLaNota(): Promise<ResultadoNotaMostrador> {
    return invocarComando<ResultadoNotaMostrador>('/api/venta/mandar-a-caja', {
      clienteId: cliente?.id ?? null,
      partidas: partidas.map((p) => ({ productoId: p.material.id, cantidad: p.cantidad })),
    });
  }

  async function mandarACaja(): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const nota = await crearLaNota();
      setPartidas([]);
      // El folio se queda a la vista: es el número que el cliente canta en la caja.
      setFolioEnCaja(nota.folio);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo mandar la venta.');
    } finally {
      setEnviando(false);
    }
  }

  /**
   * La otra salida: se lo lleva a crédito, firmando. Son DOS comandos en fila: la
   * remisión pide una orden que ya exista, y si el segundo falla la nota se queda
   * en la caja como pendiente de cobro —recuperable, y el material no ha salido—.
   */
  async function remisionACuenta(): Promise<void> {
    if (cliente === null) return;
    setEnviando(true);
    setError(null);
    try {
      const nota = await crearLaNota();
      await invocarComando('/api/credito/remision', {
        ordenId: nota.ordenId,
        clienteId: cliente.id,
        importeCentavos: Number(nota.totalCentavos),
        nombreFirmante: cliente.recoge ?? cliente.nombre,
      });
      setPartidas([]);
      setFolioEnCaja(null);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo registrar la remisión.');
    } finally {
      setEnviando(false);
    }
  }

  const columnasDeLaNota: readonly ColumnaDeTabla<Partida>[] = [
    {
      clave: 'partida',
      titulo: voc.titulo('producto'),
      celda: (p) => (
        <span className="flex flex-col">
          <span className="font-medium">
            {p.material.nombre} {p.material.medida}
          </span>
          <span className="text-xs text-texto-sutil">
            <Cifra valor={p.cantidad} unidad={p.material.unidad} tamano="xs" /> ×{' '}
            <Dinero centavos={p.material.precioCentavos} tamano="xs" />
          </span>
        </span>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (p) => <Dinero centavos={p.material.precioCentavos * p.cantidad} tamano="sm" />,
    },
    {
      clave: 'acciones',
      titulo: 'Cantidad',
      celda: (p) => (
        <span className="flex justify-end gap-(--espacio-1)">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={`Quitar una pieza de ${p.material.nombre}`}
            onClick={() => {
              cambiarCantidad(p.material.id, -1);
            }}
          >
            <Minus />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={`Agregar una pieza de ${p.material.nombre}`}
            onClick={() => {
              cambiarCantidad(p.material.id, 1);
            }}
          >
            <Plus />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Quitar la partida ${p.material.nombre}`}
            onClick={() => {
              cambiarCantidad(p.material.id, -p.cantidad);
            }}
          >
            <X />
          </Button>
        </span>
      ),
    },
  ];

  const busqueda = (() => {
    if (falloDeCarga !== null) {
      return (
        <ErrorDePantalla
          titulo="No se pudo leer el catálogo del mostrador"
          queHacer="Sin el índice no se encuentra nada. Revisa la conexión y vuelve a leerlo; lo que ya está en la nota no se pierde."
          detalle={falloDeCarga}
          reintentar={
            <Button
              onClick={() => {
                setFalloDeCarga(null);
                setFilas(null);
                setIntento((previo) => previo + 1);
              }}
            >
              Volver a leer
            </Button>
          }
        />
      );
    }
    // La forma de la tabla, nunca una rueda: el ojo ya sabe dónde va a mirar.
    if (filas === null) return <EsqueletoDeLista filas={6} />;
    if (palabras.length === 0) {
      return (
        <section aria-label="Punto de partida" className="flex flex-col gap-(--espacio-3)">
          <div className="grid grid-cols-2 gap-(--espacio-2) sm:grid-cols-4">
            {GRUPOS.map((grupo) => (
              <Superficie
                key={grupo}
                como="button"
                type="button"
                interactiva
                relleno={3}
                radio="md"
                className="min-h-20 text-sm font-semibold"
                onClick={() => {
                  setConsulta(grupo);
                }}
              >
                {grupo}
              </Superficie>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-(--espacio-2)">
            <span className="text-sm text-texto-sutil">Listas de trabajo:</span>
            {LISTAS.map((lista) => (
              <Button
                key={lista}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setConsulta(lista);
                }}
              >
                para un {lista}
              </Button>
            ))}
          </div>
        </section>
      );
    }
    if (resultados.length === 0) {
      // La pantalla que salva o pierde la venta. Nunca dice «no hay» y ya.
      return (
        <Vacio
          titulo="No tenemos de esa medida."
          explicacion="Pero éstas le pueden servir — son de la misma familia, no equivalencias declaradas:"
          accion={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                // Con el enrutador y no recargando: las partidas que ya llevaba
                // tienen que seguir ahí al volver del alta.
                enrutador.push(`/ferreteria/catalogo?alta=${encodeURIComponent(consulta)}`);
              }}
            >
              Dar de alta {voc.enFraseCon('este', 'producto')}
            </Button>
          }
          className="items-stretch text-left"
        >
          <TablaAdaptable
            etiqueta="Materiales de la misma familia"
            principal="material"
            columnas={columnas}
            filas={cercanas(filas, palabras)}
            claveDe={(m) => m.id}
            alActivar={(id) => {
              const material = filas.find((m) => m.id === id);
              if (material !== undefined) agregar(material);
            }}
            tonoDeFila={(m) => (m.existencia <= 0 ? 'tenue' : undefined)}
          />
        </Vacio>
      );
    }
    return (
      <TablaAdaptable
        etiqueta="Resultados"
        principal="material"
        columnas={columnas}
        filas={resultados}
        claveDe={(m) => m.id}
        alActivar={(id) => {
          const material = resultados.find((m) => m.id === id);
          if (material !== undefined) agregar(material);
        }}
        // Se atenúa, pero NO se esconde: saber que el material existe aunque no
        // haya permite decir «te lo pido para el jueves», que es una venta.
        tonoDeFila={(m) => (m.existencia <= 0 ? 'tenue' : undefined)}
        alto="max-h-[65vh]"
      />
    );
  })();

  return (
    <div className="p-(--espacio-3) pb-[calc(var(--espacio-12)*2)] xl:grid xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start xl:gap-(--espacio-4) xl:pb-(--espacio-3)">
      <h1 className="sr-only">Mostrador</h1>

      {/* TERCIARIO · arriba a la derecha en PC, arriba del todo en el pasillo: se
          lee antes de despachar, que es cuando sirve. */}
      <Superficie
        como="section"
        relleno={3}
        radio="md"
        aria-label={`${voc.titulo('cliente')} y obra`}
        className={`mb-(--espacio-3) text-sm xl:col-start-2 xl:row-start-1 xl:mb-0 ${sobreLimite ? 'border-peligro bg-peligro/10' : ''}`}
      >
        <p className="font-semibold">{cliente?.nombre ?? 'Público en general · contado'}</p>
        {cliente !== null && (
          <>
            <p className="text-texto-sutil">Obra: {cliente.obra ?? 'sin obra asignada'}</p>
            <p>
              Debe <Dinero centavos={cliente.saldoCentavos} tamano="sm" /> ·{' '}
              <Cifra valor={cliente.diasVencido} unidad="d" tamano="sm" /> · límite{' '}
              <Dinero centavos={cliente.limiteCentavos} tamano="sm" />
            </p>
            {/* El color no es el único portador: la condición va escrita. */}
            {sobreLimite && (
              <p className="font-semibold">Sobre su límite · pide PIN para crédito</p>
            )}
            <p className={cliente.recogeAutorizado ? '' : 'font-semibold'}>
              Recoge: {cliente.recoge ?? '—'}{' '}
              {cliente.recogeAutorizado
                ? '· autorizado'
                : '· NO está en la lista. ¿Le hablas antes de despachar?'}
            </p>
          </>
        )}
      </Superficie>

      <main className="flex flex-col gap-(--espacio-3) xl:col-start-1 xl:row-span-2 xl:row-start-1">
        <div className="relative">
          <label htmlFor="buscador" className="sr-only">
            Buscar {voc.singular('producto')} por nombre, medida, acabado o marca
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-5 -translate-y-1/2 text-texto-sutil"
          />
          <Input
            id="buscador"
            ref={buscador}
            autoFocus
            value={consulta}
            onChange={(evento) => {
              setConsulta(evento.target.value);
            }}
            placeholder="tornillo 1/4 x 2"
            className="h-[calc(var(--altura-control)*1.25)] pl-(--espacio-10) text-lg"
          />
        </div>

        {/* Miga de pan: enseña dónde estás y se quita POR PARTES, que es como se
            corrige una búsqueda que se pasó de estrecha. */}
        {palabras.length > 0 && (
          <nav aria-label="Filtros de la búsqueda" className="flex flex-wrap gap-(--espacio-1)">
            {palabras.map((palabra, indice) => (
              <Button
                key={`${palabra}-${String(indice)}`}
                type="button"
                size="sm"
                variant="secondary"
                aria-label={`Quitar el filtro ${palabra}`}
                onClick={() => {
                  setConsulta(palabras.filter((_, i) => i !== indice).join(' '));
                }}
              >
                {palabra}
                <X aria-hidden="true" />
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setConsulta('');
              }}
            >
              limpiar
            </Button>
          </nav>
        )}

        {cajaCerrada && (
          <Aviso tono="atencion" titulo="La caja está cerrada.">
            Se arman notas y cotizaciones; no se cobra.
          </Aviso>
        )}
        {error !== null && (
          <Aviso tono="peligro" titulo={error}>
            Lo que ya estaba en pantalla sigue sirviendo.
          </Aviso>
        )}

        {busqueda}
      </main>

      {/* SECUNDARIO · siempre visible en PC, plegado en una barra en el pasillo. */}
      <Superficie
        como="aside"
        id="la-venta"
        relleno={3}
        radio="md"
        aria-label={voc.conArticulo('orden')}
        className={`${ventaAbierta ? 'fixed inset-x-0 bottom-0 z-20 flex max-h-[70dvh] overflow-y-auto' : 'hidden xl:flex'} flex-col gap-(--espacio-3) xl:static xl:col-start-2 xl:row-start-2 xl:max-h-none`}
      >
        {/* «La venta» es de la tiendita: en una ferretería lo que se arma en el
            pasillo es una NOTA, y es la palabra que el cliente oye en la caja. */}
        <h2 className="text-sm font-semibold text-texto-sutil uppercase">
          {voc.conArticulo('orden')}
        </h2>
        <Tabla
          etiqueta={`Partidas de ${voc.conArticulo('orden').toLowerCase()}`}
          columnas={columnasDeLaNota}
          filas={partidas}
          claveDe={(p) => p.material.id}
          alto="max-h-[40vh]"
          vacio={
            <Vacio
              titulo="Todavía nada."
              explicacion={`Busque ${voc.enFrase('producto')} y presione Enter sobre el resultado.`}
              className="py-(--espacio-4)"
            />
          }
        />

        {/* Legible de reojo, y NO lo más grande de la pantalla. */}
        <p className="flex items-baseline justify-between">
          <span className="text-sm text-texto-sutil">{partidas.length} partidas</span>
          <Dinero centavos={total} tamano="lg" />
        </p>

        <div className="grid gap-(--espacio-2)">
          <Button
            type="button"
            disabled={partidas.length === 0 || cajaCerrada || enviando}
            cargando={enviando}
            onClick={() => {
              void mandarACaja();
            }}
          >
            Mandar a caja · F12
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={cliente === null || partidas.length === 0 || enviando}
            onClick={() => {
              void remisionACuenta();
            }}
          >
            {sobreLimite ? 'Remisión a cuenta · pide PIN · F11' : 'Remisión a cuenta · F11'}
          </Button>
          {/* El número, grande y en su sitio: es lo único que el cliente se lleva
              del mostrador, y va a decirlo en voz alta a tres metros. */}
          {folioEnCaja !== null && (
            <Aviso tono="exito" titulo={`${voc.titulo('orden')} ${folioEnCaja} está en la caja.`}>
              <span className="block font-numeros text-3xl font-bold text-texto">
                {folioEnCaja}
              </span>
              Es lo que el cliente dice al pagar.
            </Aviso>
          )}
        </div>
      </Superficie>

      <button
        type="button"
        aria-expanded={ventaAbierta}
        aria-controls="la-venta"
        onClick={() => {
          setVentaAbierta((abierta) => !abierta);
        }}
        className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between border-t border-borde bg-primario p-(--espacio-3) text-primario-texto xl:hidden"
      >
        <span>{partidas.length} partidas</span>
        <span className="flex items-center gap-(--espacio-2) font-semibold">
          <Dinero centavos={total} />
          {ventaAbierta ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </span>
      </button>
    </div>
  );
}
