import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-base font-bold transition-[transform,background-color,filter] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-5 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive active:scale-[0.97]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground active:brightness-90",
        destructive: "bg-destructive text-white active:brightness-90",
        outline: "border-2 border-foreground/25 bg-transparent active:bg-foreground/10",
        secondary: "bg-foreground/10 text-foreground active:bg-foreground/20",
        ghost: "active:bg-foreground/10",
        link: "text-foreground underline underline-offset-4",
      },
      size: {
        default: "h-12 px-5",
        sm: "h-11 rounded-xl px-4 text-sm",
        lg: "h-14 px-7 text-lg",
        icon: "size-11 rounded-full",
        "icon-sm": "size-11 rounded-full",
        "icon-lg": "size-12 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
