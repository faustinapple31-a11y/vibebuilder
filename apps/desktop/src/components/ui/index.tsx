import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- Button
type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "brand";
type Size = "xs" | "sm" | "md" | "lg";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2 border border-ink",
  brand: "bg-brand text-white hover:bg-brand-2 border border-brand",
  secondary: "bg-panel-2 text-ink border border-line hover:bg-line/60",
  outline: "bg-panel text-ink border border-line-strong hover:bg-panel-2",
  ghost: "bg-transparent text-ink-2 hover:bg-line/60 border border-transparent",
  danger: "bg-err-soft text-err border border-err/30 hover:bg-err/15",
};
const sizes: Record<Size, string> = {
  xs: "h-6 px-2 text-[11px] gap-1 rounded-md",
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  md: "h-8 px-3 text-[13px] gap-2 rounded-lg",
  lg: "h-10 px-4 text-sm gap-2 rounded-lg",
};
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "secondary", size = "md", loading, icon, children, disabled, ...props }, ref) => (
  <button ref={ref} disabled={disabled || loading} className={cn("inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none select-none", variants[variant], sizes[size], className)} {...props}>
    {loading ? <Loader2 className="spin" size={size === "xs" ? 11 : 14} /> : icon}
    {children}
  </button>
));
Button.displayName = "Button";

export function IconButton({ className, children, title, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button title={title} className={cn("inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-line/60 hover:text-ink transition-colors disabled:opacity-40", className)} {...props}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Inputs
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-8 w-full rounded-lg border border-line bg-panel px-2.5 text-[13px] text-ink placeholder:text-faint outline-none focus:border-brand focus:ring-2 focus:ring-brand/20", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-[13px] text-ink placeholder:text-faint outline-none focus:border-brand focus:ring-2 focus:ring-brand/20", className)} {...props} />
));
Textarea.displayName = "Textarea";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select className="h-7 w-full appearance-none rounded-md border border-line bg-panel pl-2 pr-6 text-xs text-ink outline-none focus:border-brand" {...props}>
        {children}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-1.5 text-muted" />
    </div>
  );
}

export function Label({ children, className, hint }: { children: ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wide text-muted", className)}>
      <span>{children}</span>
      {hint && <span className="normal-case tracking-normal text-faint">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- Slider / Switch
export function Slider({ value, onChange, min = 0, max = 1, step = 0.01, className, disabled }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string; disabled?: boolean }) {
  return (
    <SliderPrimitive.Root className={cn("relative flex h-5 w-full touch-none select-none items-center", disabled && "opacity-40", className)} value={[value]} min={min} max={max} step={step} disabled={disabled} onValueChange={([v]) => onChange(v ?? value)}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-line">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-brand" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-3.5 w-3.5 rounded-full border border-brand bg-white shadow focus:outline-none focus:ring-2 focus:ring-brand/30" />
    </SliderPrimitive.Root>
  );
}

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <SwitchPrimitive.Root checked={checked} disabled={disabled} onCheckedChange={onChange} className={cn("relative h-5 w-9 rounded-full border border-line transition-colors data-[state=checked]:bg-brand data-[state=unchecked]:bg-line", disabled && "opacity-40")}>
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

// ---------------------------------------------------------------- Pills / badges
export function Pill({ children, dot, className, title }: { children: ReactNode; dot?: "ok" | "warn" | "err" | "busy" | "idle"; className?: string; title?: string }) {
  return (
    <span className={cn("pill", className)} title={title}>
      {dot && <span className={cn("dot", dot === "ok" && "dot-ok", dot === "warn" && "dot-warn", dot === "err" && "dot-err", dot === "busy" && "dot-busy")} />}
      {children}
    </span>
  );
}

export function Badge({ children, className, color }: { children: ReactNode; className?: string; color?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", className)} style={color ? { color, borderColor: `${color}55`, background: `${color}14` } : undefined}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- Dialog
export function Dialog({ open, onOpenChange, title, description, children, width = 520 }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: ReactNode; width?: number }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl focus:outline-none" style={{ maxWidth: width }}>
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold text-ink">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-0.5 text-xs text-muted">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton>
                <X size={14} />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------- Tooltip
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={300}>{children}</TooltipPrimitive.Provider>;
}
export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-md border border-line bg-panel px-2 py-1 text-[11px] text-ink shadow-md">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ---------------------------------------------------------------- Dropdown
export function Dropdown({ trigger, items }: { trigger: ReactNode; items: { label: string; onSelect?: () => void; danger?: boolean; checked?: boolean; disabled?: boolean; separator?: boolean }[] }) {
  return (
    <DropdownPrimitive.Root>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content sideOffset={4} align="end" className="z-50 min-w-44 rounded-lg border border-line bg-panel p-1 shadow-lg">
          {items.map((it, i) =>
            it.separator ? (
              <DropdownPrimitive.Separator key={i} className="my-1 h-px bg-line" />
            ) : (
              <DropdownPrimitive.Item key={i} disabled={it.disabled} onSelect={it.onSelect} className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-line/60 data-[disabled]:opacity-40", it.danger && "text-err")}>
                <span className="w-3">{it.checked && <Check size={12} />}</span>
                {it.label}
              </DropdownPrimitive.Item>
            ),
          )}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <div className="text-sm font-medium text-ink-2">{title}</div>
      {children && <div className="max-w-sm text-xs text-muted">{children}</div>}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}>
      <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}
