import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, disabled, readOnly, ...props }, ref) => {
  return (
    <textarea
      // `readOnly` wins over `disabled` so view-mode display stays full-contrast
      // (non-editable) instead of falling back to the greyed-out disabled look.
      disabled={disabled && !readOnly}
      readOnly={readOnly}
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
