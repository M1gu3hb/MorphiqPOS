'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/cliente';

/**
 * Hook compartido — fuente única de verdad para "¿hay caja abierta?".
 *
 * Una caja abierta = CorteCaja con tipo_corte='cierre_diario' y estado='abierto'.
 * Solo puede existir UNA a la vez (regla de negocio global).
 *
 * Compatibilidad: registros viejos sin tipo_corte se tratan como cierre_diario.
 *
 * Devuelve:
 *  - cajaAbierta: el registro o null
 *  - isLoading: boolean
 *  - hayCaja: boolean conveniente para guards
 *  - fondoEsperado: número que debería estar en caja al abrir hoy
 *    (= dinero_dejado_en_caja del último cierre cerrado, o 0)
 *
 * ── `deEstaTerminal`: la caja que COBRA aquí (restaurante, 20-10-2026) ──────
 * «Solo puede existir UNA a la vez» dejó de ser cierto: el servidor abre una caja
 * por terminal y cobra, corta y cierra con la de la terminal firmada (`venta.cobrar`,
 * `caja.cerrar`). Con la primera caja abierta del negocio, la cajera que entraba
 * desde otro aparato leía «Caja abierta… Ya puedes cobrar», con «Abrir caja»
 * apagado, y cada cobro le contestaba «Abre la caja antes de cobrar»: no había
 * forma de cobrar ni de abrir la suya. Las pantallas que cobran (Caja y la venta de
 * mostrador) piden `deEstaTerminal`: la caja es la que `caja.estado` dice que es de
 * esta terminal, la misma pregunta que se hace la pantalla nueva
 * (`src/cliente/caja-de-la-terminal.ts`). El tablero y el mesero siguen preguntando
 * si hay ALGUNA caja en el negocio, que es lo que les importa a ellos.
 */
export function useCajaAbierta({ deEstaTerminal = false } = {}) {
  // OJO: NO usar initialData:[] porque hace que la query nazca como "data ya cargada"
  // y los consumidores muestran "caja cerrada" antes del primer fetch.
  // Usamos isPending para distinguir "primer fetch" de "vacío real".
  const {
    data: cortes,
    isPending,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['cortes_caja_estado'],
    queryFn: () => api.entidades.CorteCaja.list('-created_date', 50),
    refetchInterval: 8000,
    staleTime: 4000,
    placeholderData: (prev) => prev, // mantener datos previos durante refetch
  });

  // La sesión de caja de ESTA terminal, según el servidor. Sólo la piden las pantallas
  // que cobran: `caja.estado` es de los roles de caja. Su llave CUELGA de
  // `cortes_caja_estado` para que abrir, cortar o cerrar la caja —que invalidan esa
  // llave— la refresquen también, en vez de esperar a los 8 s del intervalo.
  const { data: deLaTerminal, isPending: terminalPendiente, refetch: refetchTerminal } = useQuery({
    queryKey: ['cortes_caja_estado', 'de_esta_terminal'],
    queryFn: () => api.comandos.ejecutar('/api/caja/estado', {}),
    enabled: deEstaTerminal,
    refetchInterval: 8000,
    staleTime: 4000,
    placeholderData: (prev) => prev,
  });

  const cargando =
    isPending || (isLoading && !cortes) || (deEstaTerminal && terminalPendiente && !deLaTerminal);
  const safeCortes = Array.isArray(cortes) ? cortes : [];

  const abiertas = safeCortes.filter(
    (c) => c?.estado === 'abierto' && (c?.tipo_corte === 'cierre_diario' || !c?.tipo_corte),
  );
  const sesionDeLaTerminal = deLaTerminal?.abierta === true ? deLaTerminal.sesionCajaId : null;
  const cajaAbierta = deEstaTerminal
    ? abiertas.find((c) => c?.id === sesionDeLaTerminal) || null
    : abiertas[0] || null;

  // Último cierre diario cerrado para calcular fondo esperado
  const ultimoCierre =
    safeCortes.find(
      (c) => c?.estado === 'cerrado' && (c?.tipo_corte === 'cierre_diario' || !c?.tipo_corte),
    ) || null;

  const fondoEsperado = Number(ultimoCierre?.dinero_dejado_en_caja);
  const fondoEsperadoSeguro = Number.isFinite(fondoEsperado) ? fondoEsperado : 0;

  return {
    cajaAbierta,
    hayCaja: !!cajaAbierta,
    isLoading: cargando,
    isFetching,
    fondoEsperado: fondoEsperadoSeguro,
    ultimoCierre,
    // Forzar refetch puntual (p.ej. justo antes de "Solicitar cuenta")
    // para no depender solo del refetchInterval de 8s.
    refetch: deEstaTerminal
      ? async () => {
          await refetchTerminal();
          return refetch();
        }
      : refetch,
  };
}
