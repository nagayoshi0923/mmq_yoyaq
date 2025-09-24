import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const sizeMap = {
  sm: "text-xs px-1 py-0",
  md: "text-sm px-2 py-1",
  lg: "text-base px-3 py-2"
}

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  size?: "sm" | "md" | "lg"
}

function Badge({ className, variant, size = "md", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        badgeVariants({ variant }),
        sizeMap[size],
        className
      )}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
