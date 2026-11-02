import * as React from "react"
import { cn } from "cn"

// 16px text on every screen: iPhone Safari zooms into inputs with smaller text.
function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-11 w-full min-w-0 rounded-[9px] border border-line bg-surface px-[11px] py-2 text-base transition-colors outline-none placeholder:text-mute focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
