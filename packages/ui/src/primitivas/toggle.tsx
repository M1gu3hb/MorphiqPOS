"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from '../utilidades/cn'
import { Toggle as TogglePrimitive } from "radix-ui"

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-fondo-sutil hover:text-texto-sutil focus-visible:border-anillo focus-visible:ring-[3px] focus-visible:ring-anillo/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-peligro aria-invalid:ring-peligro/20 data-[state=on]:bg-acento-suave data-[state=on]:text-acento-suave-texto oscuro:aria-invalid:ring-peligro/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-borde-fuerte bg-transparent shadow-1 hover:bg-acento-suave hover:text-acento-suave-texto",
      },
      size: {
        default: "h-(--altura-control) min-w-9 px-2",
        sm: "h-[calc(var(--altura-control)*0.85)] min-w-8 px-1.5",
        lg: "h-[calc(var(--altura-control)*1.15)] min-w-10 px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
