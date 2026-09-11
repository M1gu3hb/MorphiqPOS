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
 */
export function useCajaAbierta() {
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

  const cargando = isPending || (isLoading && !cortes);
  const safeCortes = Array.isArray(cortes) ? cortes : [];

  const cajaAbierta =
    safeCortes.find(
      (c) => c?.estado === 'abierto' && (c?.tipo_corte === 'cierre_diario' || !c?.tipo_corte),
    ) || null;

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
    refetch,
  };
}
