import type { ButtonHTMLAttributes } from "react";
import { X } from "lucide-react";

type ActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "tertiary" | "ghost" | "destructive" | "icon";
  busy?: boolean;
};

export function AtlasButton({ variant = "secondary", busy, disabled, children, className = "", type = "button", ...props }: ActionProps) {
  return <button {...props} type={type} className={`atlas-action atlas-action--${variant} ${className}`} disabled={disabled || busy} aria-busy={busy || undefined}>{children}</button>;
}

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <AtlasButton variant="tertiary" className="atlas-filter-chip" onClick={onRemove} aria-label={`Remove filter ${label}`}>
    <span>{label}</span><X size={14} aria-hidden="true" />
  </AtlasButton>;
}
