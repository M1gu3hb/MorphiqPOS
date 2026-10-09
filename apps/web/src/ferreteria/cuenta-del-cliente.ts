/**
 * El estado de cuenta en TEXTO, que es lo que se manda por WhatsApp (F-612; C.10 de la
 * 2.4): cada documento con su saldo y cuándo venció, el total y lo vencido.
 */

export interface DocumentoDelEstado {
  readonly folio: string;
  readonly saldoCentavos: string;
  /** Negativo mientras no venza; positivo son días de retraso. */
  readonly diasVencidos: number;
}

export interface EstadoParaMandar {
  readonly renglones: readonly DocumentoDelEstado[];
  readonly totalCentavos: string;
  readonly vencidoCentavos: string;
}

/** «En tres días» o «hace 12 días»: el signo de `diasVencidos` dicho en palabras. */
export function vencimiento(dias: number): string {
  if (dias === 0) return 'vence hoy';
  return dias < 0 ? `vence en ${String(-dias)} d` : `vencido hace ${String(dias)} d`;
}

/**
 * El formateador del dinero lo pone quien llama —`dineroEnTexto` del sistema—: así el
 * importe se lee igual que en `<Dinero>` y este módulo no arrastra componentes.
 */
export function estadoEnTexto(
  nombre: string,
  estado: EstadoParaMandar,
  enTexto: (centavos: number) => string,
): string {
  return [
    `Estado de cuenta de ${nombre}`,
    ...estado.renglones.map(
      (r) => `${r.folio} · ${enTexto(Number(r.saldoCentavos))} · ${vencimiento(r.diasVencidos)}`,
    ),
    `Total: ${enTexto(Number(estado.totalCentavos))}`,
    `Vencido: ${enTexto(Number(estado.vencidoCentavos))}`,
  ].join('\n');
}

/** El número para `wa.me`: con lada de México si trae diez dígitos; vacío si no sirve. */
export function whatsappDe(telefono: string | null): string {
  const digitos = (telefono ?? '').replace(/\D/g, '');
  if (digitos.length === 10) return `52${digitos}`;
  if (digitos.length === 12 && digitos.startsWith('52')) return digitos;
  return '';
}
