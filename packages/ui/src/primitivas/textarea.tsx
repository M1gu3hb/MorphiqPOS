import * as React from "react"
import { cn } from '../utilidades/cn'

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[calc(var(--altura-control)*1.8)] w-full rounded-md border border-borde-fuerte bg-transparent px-(--espacio-3) py-2 text-base shadow-1 transition-[color,box-shadow] outline-none placeholder:text-texto-sutil focus-visible:border-anillo focus-visible:ring-[3px] focus-visible:ring-anillo/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-peligro aria-invalid:ring-peligro/20 md:text-sm oscuro:bg-borde-fuerte/30 oscuro:aria-invalid:ring-peligro/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
