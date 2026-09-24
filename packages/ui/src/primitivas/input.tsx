import * as React from "react"
import { cn } from '../utilidades/cn'

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-(--altura-control) w-full min-w-0 rounded-md border border-borde-fuerte bg-transparent px-(--espacio-3) py-1 text-base shadow-1 transition-[color,box-shadow] outline-none selection:bg-primario selection:text-primario-texto file:inline-flex file:h-[calc(var(--altura-control)*0.7)] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-texto placeholder:text-texto-sutil disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm oscuro:bg-borde-fuerte/30",
        "focus-visible:border-anillo focus-visible:ring-[3px] focus-visible:ring-anillo/50",
        "aria-invalid:border-peligro aria-invalid:ring-peligro/20 oscuro:aria-invalid:ring-peligro/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
