import * as React from "react"
import { cn } from "cn"
import { LuChevronDown as ChevronDownIcon } from "react-icons/lu"

// Native <select> so iPhone/iPad show the system picker wheel.
function NativeSelect({
  className,
  selectClassName,
  size = "default",
  ...props
}) {
  return (
    <div
      className={cn(
        "group/native-select relative w-full min-w-0 has-[select:disabled]:opacity-50",
        className
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "min-h-11 w-full min-w-0 appearance-none rounded-[9px] border border-line bg-surface py-2 pr-8 pl-[11px] text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:min-h-9 data-[size=sm]:py-1",
          selectClassName
        )}
        {...props}
      />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-mute select-none" aria-hidden="true" data-slot="native-select-icon" />
    </div>
  )
}

function NativeSelectOption({ className, ...props }) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({ className, ...props }) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
