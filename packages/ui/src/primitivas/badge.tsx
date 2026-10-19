import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from '../utilidades/cn'
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-anillo focus-visible:ring-[3px] focus-visible:ring-anillo/50 aria-invalid:border-peligro aria-invalid:ring-peligro/20 oscuro:aria-invalid:ring-peligro/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primario text-primario-texto [a&]:hover:bg-primario/90",
        secondary:
          "bg-fondo-sutil text-texto [a&]:hover:bg-fondo-sutil/90",
        destructive:
          "bg-peligro text-peligro-texto focus-visible:ring-peligro/20 oscuro:bg-peligro/60 oscuro:focus-visible:ring-peligro/40 [a&]:hover:bg-peligro/90",
        outline:
          "border-borde text-texto [a&]:hover:bg-acento-suave [a&]:hover:text-acento-suave-texto",
        ghost: "[a&]:hover:bg-acento-suave [a&]:hover:text-acento-suave-texto",
        link: "text-primario underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
