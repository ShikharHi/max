import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-jarvis-cyan disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "bg-jarvis-cyan text-jarvis-bg hover:bg-cyan-300",
        outline:
          "border border-jarvis-border bg-transparent text-jarvis-text hover:border-jarvis-cyan/70 hover:bg-jarvis-elevated",
        ghost: "text-jarvis-secondary hover:bg-jarvis-elevated hover:text-jarvis-text",
        danger: "bg-jarvis-error text-white hover:bg-red-500",
        subtle: "border border-jarvis-border bg-jarvis-elevated text-jarvis-text hover:border-jarvis-cyan/50"
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        icon: "h-8 w-8 p-0",
        iconSm: "h-7 w-7 p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
