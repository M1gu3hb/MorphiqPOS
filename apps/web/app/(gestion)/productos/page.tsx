import { ProductosPantalla } from './ProductosPantalla';
import { PRODUCTOS_FERRETERIA } from './demostracion';

export const metadata = { title: 'Productos · MorphiqPOS' };

export default function Productos() {
  return <ProductosPantalla iniciales={PRODUCTOS_FERRETERIA} />;
}
