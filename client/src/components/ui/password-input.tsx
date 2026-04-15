import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * PasswordInput - a password field with a show/hide toggle (eye icon).
 *
 * The toggle state is kept local to this component, so it survives:
 *  - tab switches (the component stays mounted)
 *  - focus/blur cycles
 *  - the parent re-rendering
 *
 * The eye button is ALWAYS visible (even when the field is empty) so the
 * user never has to re-type characters to get the toggle back.
 */
export interface PasswordInputProps
  extends Omit<React.ComponentProps<"input">, "type"> {
  /** Optional className for the outer wrapper (position: relative) */
  wrapperClassName?: string;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, wrapperClassName, disabled, ...props }, ref) {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className={cn("relative w-full", wrapperClassName)}>
        <Input
          ref={ref as any}
          type={visible ? "text" : "password"}
          disabled={disabled}
          // leave room for the eye button on the right
          className={cn("pr-10", className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          title={visible ? "Hide password" : "Show password"}
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2",
            "flex items-center justify-center",
            "h-7 w-7 rounded-md text-muted-foreground",
            "hover:text-foreground hover:bg-accent/50",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors"
          )}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    );
  }
);
