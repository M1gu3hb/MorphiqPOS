'use client';
import React from 'react';
import { api } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePOSAuth } from '@/lib/POSAuthContext';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Coffee, Clock, CheckCircle, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const ESTADOS = ['nuevo', 'en_preparacion', 'listo'];
const ESTADO_LABELS = { nuevo: 'Nuevos', en_preparacion: 'En preparación', listo: 'Listos' };
const NEXT_ESTADO = { nuevo: 'en_preparacion', en_preparacion: 'listo', listo: 'entregado' };

export default function Barra() {
  const { posUser } = usePOSAuth();
  const queryClient = useQueryClient();

  const { data: pedidos = [] } = useQuery({
    queryKey: ['pedidos_barra'],
    queryFn: () => api.entidades.PedidoPreparacion.filter({ area: 'barra' }),
    initialData: [],
    refetchInterval: 8000,
  });

  const activos = pedidos.filter((p) => !['entregado', 'cancelado'].includes(p.estado));

  /**
   * ESTA PANTALLA NO TIENE RUTA y nadie la importa.
   *
   * Su propio `lib/constants.js` lo dice: «Barra deja de ser rol principal —
   * ahora es una estación de la cocina». Cocina.jsx la cubre entera, filtrando
   * por estación. Se cablea igualmente porque dejar en el árbol un archivo con
   * una escritura que el puente rechaza es una trampa para quien venga después,
   * y porque si algún día vuelve a tener ruta, funcionará.
   *
   * Las tres fechas —`fecha_inicio`, `fecha_listo`, `fecha_entregado`— salían
   * del reloj del NAVEGADOR. Ahora las pone el servidor, con el suyo, dentro de
   * la transacción de la transición, que además es monotónica: el toque que
   * llega tarde pidiendo `en_preparacion` sobre una comanda ya lista se rechaza
   * en vez de devolver el plato al fuego.
   */
  const avanzar = async (pedido) => {
    const next = NEXT_ESTADO[pedido.estado];
    if (!next) return;
    try {
      await api.comandos.ejecutar('/api/restaurante/transicionar-pedido', {
        comandaId: pedido.id,
        estado: next,
      });
      queryClient.invalidateQueries({ queryKey: ['pedidos_barra'] });
      toast.success(`Pedido marcado como ${next.replace('_', ' ')}`);
    } catch (err) {
      // «Esa comanda está en "listo" y ya no puede pasar a "en_preparacion"»:
      // el dominio ya lo dice en español, y hay que enseñarlo.
      toast.error(err?.message || 'No se pudo cambiar el estado del pedido.');
    }
  };

  const byEstado = ESTADOS.reduce((acc, s) => {
    acc[s] = activos.filter((p) => p.estado === s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Barra"
        description="Pedidos de bebidas y preparaciones de barra"
        actions={
          <span className="text-sm text-muted-foreground">{activos.length} pedido(s) activos</span>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {ESTADOS.map((estado) => (
          <div key={estado}>
            <div
              className={`flex items-center gap-2 mb-3 pb-2 border-b ${estado === 'nuevo' ? 'border-blue-300' : estado === 'en_preparacion' ? 'border-purple-300' : 'border-green-300'}`}
            >
              {estado === 'nuevo' && <Clock className="w-4 h-4 text-blue-600" />}
              {estado === 'en_preparacion' && <Coffee className="w-4 h-4 text-purple-600" />}
              {estado === 'listo' && <CheckCircle className="w-4 h-4 text-green-600" />}
              <h3 className="font-heading font-semibold">{ESTADO_LABELS[estado]}</h3>
              <span className="ml-auto text-sm font-bold">{byEstado[estado].length}</span>
            </div>
            <div className="space-y-3">
              {byEstado[estado].map((pedido) => (
                <Card
                  key={pedido.id}
                  className={`border-l-4 ${estado === 'nuevo' ? 'border-l-blue-500' : estado === 'en_preparacion' ? 'border-l-purple-500' : 'border-l-green-500'}`}
                >
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-center justify-between">
                      <span className="font-heading font-bold text-sm">
                        {pedido.mesa_numero ? `Mesa ${pedido.mesa_numero}` : 'Mostrador'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {pedido.fecha_creacion
                          ? formatDistanceToNow(new Date(pedido.fecha_creacion), {
                              addSuffix: true,
                              locale: es,
                            })
                          : ''}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 pb-3 px-4">
                    <div className="space-y-1 mb-3">
                      {(pedido.items || []).map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="font-medium">
                            {item.cantidad}x {item.producto_nombre}
                          </span>
                          {item.notas && (
                            <span className="text-xs text-purple-600 italic">{item.notas}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {estado !== 'listo' ? (
                      <Button size="sm" className="w-full" onClick={() => avanzar(pedido)}>
                        {estado === 'nuevo' ? '▶ Iniciar' : '✓ Marcar listo'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-green-700 border-green-300"
                        onClick={() => avanzar(pedido)}
                      >
                        Entregar
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
              {byEstado[estado].length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm opacity-50">
                  Sin pedidos
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
