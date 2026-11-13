import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Activity, ArrowLeftRight, Atom, ArrowUpRight, Beaker, FlaskConical, Network, Thermometer, X, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "tertiary" | "ghost" | "destructive" | "icon";
  busy?: boolean;
};

export function AtlasButton({ variant = "secondary", busy, disabled, children, className = "", type = "button", ...props }: ActionProps) {
  return <button {...props} type={type} className={`atlas-action atlas-action--${variant} ${className}`} disabled={disabled || busy} aria-busy={busy || undefined}>{children}</button>;
}

export function DirectoryCard({ label, title, children, onClick }: {
  label: string; title: string; children: ReactNode; onClick: () => void;
}) {
  return <button type="button" className="atlas-directory-card" onClick={onClick}>
    <span className="atlas-card-label">{label}</span>
    <span className="atlas-card-title">{title}</span>
    <span className="atlas-card-meta">{children}</span>
    <ArrowUpRight className="atlas-card-arrow" aria-hidden="true" />
  </button>;
}

const unitIcons: LucideIcon[] = [Atom, Network, FlaskConical, Beaker, Activity, Thermometer, ArrowLeftRight, Atom, Zap];
const unitAccents = ["brand", "teal", "amber", "blue", "brand", "blue", "amber", "teal", "brand"] as const;

export function UnitDirectoryCard({ unit, label, title, children, onClick }: {
  unit: number; label: string; title: string; children: ReactNode; onClick: () => void;
}) {
  const Icon = unitIcons[(unit - 1) % unitIcons.length];
  const accent = unitAccents[(unit - 1) % unitAccents.length];
  return <button type="button" className="atlas-directory-card unit-directory-card" data-accent={accent} onClick={onClick}>
    <span className="unit-directory-icon" aria-hidden="true"><Icon size={21} strokeWidth={1.8} /></span>
    <span className="unit-directory-copy">
      <span className="atlas-card-label">{label}</span>
      <span className="atlas-card-title">{title}</span>
      <span className="atlas-card-meta">{children}</span>
    </span>
    <span className="unit-directory-arrow" aria-hidden="true"><ArrowUpRight size={17} strokeWidth={1.9} /></span>
  </button>;
}

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <AtlasButton variant="tertiary" className="atlas-filter-chip" onClick={onRemove} aria-label={`Remove filter ${label}`}>
    <span>{label}</span><X size={14} aria-hidden="true" />
  </AtlasButton>;
}
