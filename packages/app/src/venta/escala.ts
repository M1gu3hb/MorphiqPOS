/**
 * La escala de cantidades vive en el dominio desde F-324.
 *
 * Este archivo se conserva como puerta: diecisiete módulos importan
 * `porCantidad` desde aquí y su prueba —`escala.test.ts`, intacta— es la que
 * demuestra que mover la aritmética al dominio no cambió ni un centavo.
 */
export {
  ESCALA_CANTIDAD,
  aDiezmilesimas,
  deDiezmilesimas,
  porCantidad,
} from '@morphiqpos/domain/dinero';
