import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, inputMode, pattern, step, ...props }, ref) => {
    // Automatically default to number keyboard for numeric or telephone input types
    const computedInputMode =
      inputMode ||
      (type === "number" ? "decimal" : type === "tel" ? "tel" : undefined);

    const computedPattern =
      pattern ||
      (type === "number" ? "[0-9.]*" : type === "tel" ? "[0-9+]*" : undefined);

    const computedStep =
      step ||
      (type === "number" ? (computedInputMode === "numeric" ? "1" : "any") : undefined);

    return (
      <input
        type={type}
        inputMode={computedInputMode}
        pattern={computedPattern}
        step={computedStep}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
