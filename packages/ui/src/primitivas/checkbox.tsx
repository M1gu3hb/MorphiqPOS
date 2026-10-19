"use client"

import * as React from "react"
import { cn } from '../utilidades/cn'
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-borde-fuerte shadow-1 transition-shadow outline-none focus-visible:border-anillo focus-visible:ring-[3px] focus-visible:ring-anillo/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-peligro aria-invalid:ring-peligro/20 data-[state=checked]:border-primario data-[state=checked]:bg-primario data-[state=checked]:text-primario-texto oscuro:bg-borde-fuerte/30 oscuro:aria-invalid:ring-peligro/40 oscuro:data-[state=checked]:bg-primario",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
