import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Styled after the notebook's original buttons: 10px radius, bordered surface buttons,
// 40px tall (44px on touch screens) so they are easy to hit with a thumb.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border font-semibold transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-line bg-surface text-ink hover:bg-sunk",
        outline: "border-line bg-surface text-ink hover:bg-sunk",
        secondary: "border-line bg-surface text-ink hover:bg-sunk",
        primary: "border-brand bg-brand text-brand-ink hover:bg-brand/90",
        ghost: "border-line bg-transparent text-ink hover:bg-sunk",
        plain: "border-transparent bg-transparent text-ink hover:bg-sunk",
        danger: "border-bad/40 bg-surface text-bad hover:bg-bad-soft",
        destructive: "border-bad/40 bg-surface text-bad hover:bg-bad-soft",
        "danger-ghost": "border-bad/40 bg-transparent text-bad hover:bg-bad-soft",
        link: "border-transparent bg-transparent text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-10 px-3.5 text-sm pointer-coarse:min-h-11",
        sm: "min-h-8 rounded-lg px-2.5 text-[13px] pointer-coarse:min-h-10 pointer-coarse:px-3 pointer-coarse:text-sm",
        lg: "min-h-12 px-5 text-[15px]",
        icon: "size-10 pointer-coarse:size-11 [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-8 rounded-lg pointer-coarse:size-10",
        "icon-xs": "size-6 rounded-md",
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
  type = "button",
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
