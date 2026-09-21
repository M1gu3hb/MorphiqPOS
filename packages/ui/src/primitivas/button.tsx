import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from '../utilidades/cn'
import { Slot } from "radix-ui"

/**
 * EL ESTADO ACTIVO TIENE QUE SENTIRSE. (Etapa 2.35 §2.2)
 *
 * Un botón que no responde al pulsarlo se siente muerto aunque funcione: el dedo ya
 * salió y la pantalla todavía no dijo nada. `active:scale-[0.97]` es la confirmación
 * instantánea de que la interfaz oyó, y `active:shadow-0` acorta su sombra —lo que
 * se hunde se acerca al fondo y proyecta menos—, que es la lógica de luz del
 * sistema y no un efecto suelto.
 *
 * El `hover` va detrás de `@media (hover: hover)`: en una tableta —que es el
 * dispositivo principal del mesero y de la recepción— el toque dispara el hover y
 * el botón se queda iluminado después de soltarlo.
 *
 * Y el FOCO en dos capas: un anillo del color del anillo más una separación del
 * color del fondo. Con una sola capa, el foco sobre un botón primario del mismo tono
 * desaparece; la caja se opera con teclado diez horas al día.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-(--duracion-rapida) ease-[cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] active:shadow-0 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 oscuro:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20 oscuro:bg-destructive/60 oscuro:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-1 hover:bg-accent hover:text-accent-foreground oscuro:border-input oscuro:bg-input/30 oscuro:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        // La sexta intencion. Cobrado, confirmado, entregado: acciones que CIERRAN
        // algo bien. Sin ella, «Cobrar» y «Eliminar» se dibujaban con la misma
        // variante y el color dejaba de significar.
        success:
          "bg-success text-success-foreground shadow-1 hover:bg-success/90",
        ghost:
          "hover:bg-accent hover:text-accent-foreground oscuro:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-(--altura-control) px-4 py-2 has-[>svg]:px-3",
        xs: "h-[calc(var(--altura-control)*0.6)] gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[calc(var(--altura-control)*0.85)] gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-[calc(var(--altura-control)*1.15)] rounded-md px-6 has-[>svg]:px-4",
        icon: "size-(--altura-control)",
        "icon-xs": "size-[calc(var(--altura-control)*0.6)] rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-[calc(var(--altura-control)*0.85)]",
        "icon-lg": "size-[calc(var(--altura-control)*1.15)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * El sexto estado: CARGANDO.
 *
 * No es decorativo. Un botón que cobra y no dice que está cobrando se pulsa dos
 * veces, y la segunda es un cobro duplicado. Mientras carga: se deshabilita, se
 * anuncia con `aria-busy`, y la rueda sustituye al icono sin que el botón cambie de
 * ancho —un botón que encoge al pulsarlo mueve lo que tiene al lado—.
 */
function Rueda() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  )
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  cargando = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Mientras es `true` el boton no se puede pulsar y lo dice. */
    cargando?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-cargando={cargando ? "" : undefined}
      aria-busy={cargando || undefined}
      disabled={asChild ? undefined : cargando || props.disabled}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {cargando && !asChild ? <Rueda /> : null}
      {children}
    </Comp>
  )
}

export { Button, buttonVariants }
