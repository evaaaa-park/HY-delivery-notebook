import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Small status labels. Variants follow the notebook's colors, including one per hy order type.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md border-0 px-[7px] py-0.5 text-xs leading-normal font-semibold [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-sunk text-mute",
        warn: "bg-warn-soft text-warn",
        ok: "bg-ok-soft text-ok",
        bad: "bg-bad-soft text-bad",
        acc: "bg-brand-soft text-brand",
        regular: "bg-sunk text-mute",
        adhoc: "bg-brand-soft text-brand",
        sample: "bg-warn-soft text-warn",
        fredit: "bg-[color-mix(in_srgb,#8A4FD8_16%,var(--surface))] text-[color-mix(in_srgb,#8A4FD8_80%,var(--ink))]",
        prepaid: "bg-[color-mix(in_srgb,#0E8C86_16%,var(--surface))] text-[color-mix(in_srgb,#0E8C86_80%,var(--ink))]",
        pickup: "bg-bad-soft text-bad",
        outline: "border border-line bg-transparent text-ink",
      },
      size: {
        default: "",
        xs: "px-[5px] py-px text-[11px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
