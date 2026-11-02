import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[76px] w-full resize-y rounded-[9px] border border-line bg-surface px-[11px] py-2 text-base transition-colors outline-none placeholder:text-mute focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
