/**
 * Contratos del selector de paquete (F1.1-C-15).
 *
 * El mecanismo funcionaba desde hace tiempo; lo que faltaba era que ningún
 * comando lo puenteara. Y el puente más probable no es malicioso: es que
 * alguien copie un arreglo de cinco cadenas y, al añadir un giro nuevo, se le
 * olvide una de las copias. Había CINCO.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = 'packages/app/src';

/** Todos los `.ts` de comandos, sin pruebas. */
function archivosDeComando(carpeta = APP) {
  const salida = [];
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivosDeComando(ruta));
    else if (entrada.name.endsWith('.ts') && !entrada.name.includes('.test.')) salida.push(ruta);
  }
  return salida;
}

export const contratos = [
  {
    nombre: 'ningun_comando_escribe_la_lista_a_mano',
    ruta: APP,
    porque:
      'Cinco copias del mismo arreglo es como uno se queda corto al añadir un giro y un comando desaparece de un paquete entero sin que nada avise.',
    comprobar() {
      // Se busca el LITERAL en la declaración `paquetes:`, no la palabra suelta:
      // los nombres de paquete aparecen legítimamente en textos y en tipos.
      const culpables = archivosDeComando().filter((ruta) =>
        /paquetes:\s*\[\s*'/.test(readFileSync(ruta, 'utf8')),
      );
      return culpables.length === 0;
    },
  },
  {
    nombre: 'recetas_solo_en_paquetes_operativos',
    ruta: 'packages/app/src/inventario/recetas.ts',
    porque:
      'El paquete Esencial no contrata inventario ni recetas; Operativo y Restaurante Pro sí.',
    comprobar() {
      const codigo = readFileSync('packages/app/src/inventario/recetas.ts', 'utf8');
      return (
        codigo.includes('paquetes: PAQUETES_OPERATIVOS') && !/paquetes:\s*PAQUETES\s*,/.test(codigo)
      );
    },
  },
];
