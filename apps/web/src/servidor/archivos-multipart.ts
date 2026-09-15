export class ErrorMultipart extends Error {
  constructor(
    readonly codigo: 'LONGITUD_REQUERIDA' | 'CUERPO_DEMASIADO_GRANDE' | 'MULTIPART_INVALIDO',
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorMultipart';
  }
}

export async function leerCuerpoAcotado(peticion: Request, maximo: number): Promise<Uint8Array> {
  const declarada = peticion.headers.get('content-length');
  if (declarada === null || !/^\d+$/.test(declarada)) {
    throw new ErrorMultipart('LONGITUD_REQUERIDA', 'Falta una longitud de cuerpo válida.');
  }
  const longitud = Number(declarada);
  if (!Number.isSafeInteger(longitud) || longitud > maximo) {
    throw new ErrorMultipart('CUERPO_DEMASIADO_GRANDE', 'El cuerpo supera el límite permitido.');
  }
  if (peticion.body === null) {
    throw new ErrorMultipart('MULTIPART_INVALIDO', 'Falta el cuerpo multipart.');
  }

  const lector = peticion.body.getReader();
  const fragmentos: Uint8Array[] = [];
  let recibidos = 0;
  try {
    for (;;) {
      const lectura = await lector.read();
      if (lectura.done) break;
      recibidos += lectura.value.byteLength;
      if (recibidos > maximo || recibidos > longitud) {
        await lector.cancel();
        throw new ErrorMultipart(
          'CUERPO_DEMASIADO_GRANDE',
          'El cuerpo supera el límite permitido.',
        );
      }
      fragmentos.push(lectura.value);
    }
  } finally {
    lector.releaseLock();
  }

  const cuerpo = new Uint8Array(recibidos);
  let desplazamiento = 0;
  for (const fragmento of fragmentos) {
    cuerpo.set(fragmento, desplazamiento);
    desplazamiento += fragmento.byteLength;
  }
  return cuerpo;
}

export async function archivoDeMultipart(peticion: Request, maximo: number): Promise<File> {
  const tipo = peticion.headers.get('content-type');
  if (tipo === null) throw new ErrorMultipart('MULTIPART_INVALIDO', 'Falta Content-Type.');
  const cuerpo = await leerCuerpoAcotado(peticion, maximo);
  const copia = new Request('http://multipart.local', {
    method: 'POST',
    headers: { 'content-type': tipo },
    body: Buffer.from(cuerpo),
  });
  let formulario: FormData;
  try {
    formulario = await copia.formData();
  } catch {
    throw new ErrorMultipart('MULTIPART_INVALIDO', 'El cuerpo multipart no es válido.');
  }
  const archivo = formulario.get('archivo');
  if (!(archivo instanceof File)) {
    throw new ErrorMultipart('MULTIPART_INVALIDO', 'Falta el campo de archivo.');
  }
  return archivo;
}
