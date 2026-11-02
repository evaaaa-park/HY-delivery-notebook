import { Toaster as Sonner } from "sonner"
import { LuCircleCheck, LuInfo, LuTriangleAlert, LuOctagonX, LuLoaderCircle } from "react-icons/lu"
import { useResolvedTheme } from "@/lib/theme"

const Toaster = ({ ...props }) => {
  const theme = useResolvedTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <LuCircleCheck className="size-4" />,
        info: <LuInfo className="size-4" />,
        warning: <LuTriangleAlert className="size-4" />,
        error: <LuOctagonX className="size-4" />,
        loading: <LuLoaderCircle className="size-4 animate-spin" />,
      }}
      style={{
        "--normal-bg": "var(--ink)",
        "--normal-text": "var(--bg)",
        "--normal-border": "var(--ink)",
        "--border-radius": "10px",
      }}
      toastOptions={{
        classNames: {
          toast: "cn-toast font-sans text-sm",
          actionButton: "!bg-transparent !text-[color:var(--brand-soft)] !font-bold",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
