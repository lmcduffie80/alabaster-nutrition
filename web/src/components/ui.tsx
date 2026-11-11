import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

function notch(size: number) {
  return `polygon(${size}px 0, calc(100% - ${size}px) 0, 100% ${size}px, 100% calc(100% - ${size}px), calc(100% - ${size}px) 100%, ${size}px 100%, 0 calc(100% - ${size}px), 0 ${size}px)`;
}

export function FramedPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="bg-ink p-[2px]" style={{ clipPath: notch(16) }}>
      <div className="bg-sage p-[3px]" style={{ clipPath: notch(15) }}>
        <div className="bg-gilt p-px" style={{ clipPath: notch(13) }}>
          <div className={`bg-sage px-5 py-4 ${className}`} style={{ clipPath: notch(12) }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-ink/10 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-porcelain text-white hover:bg-porcelain-dark disabled:bg-porcelain/40",
  secondary: "border border-porcelain/30 bg-white text-porcelain hover:bg-porcelain-light disabled:opacity-50",
  quiet: "text-porcelain hover:bg-porcelain-light disabled:opacity-50",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
}

type BadgeTone = "neutral" | "sage" | "porcelain" | "gilt" | "red";

const badgeStyles: Record<BadgeTone, string> = {
  neutral: "bg-ink/5 text-ink/70",
  sage: "bg-sage-light text-[#4d6340]",
  porcelain: "bg-porcelain-light text-porcelain",
  gilt: "bg-[#f3ead9] text-gilt",
  red: "bg-red-50 text-red-700",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyles[tone]}`}>
      {children}
    </span>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between first:mt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/50">{children}</h3>
      {action}
    </div>
  );
}

/** Links home unless `home` is false (the kiosk keypad, where a stray tap shouldn't leave the screen). */
export function Wordmark({ size = "sm", home = true }: { size?: "sm" | "lg"; home?: boolean }) {
  const mark = (
    <>
      <span className={`font-script ${size === "lg" ? "text-6xl" : "text-3xl"}`}>Alabaster</span>
      <span className={`font-serif tracking-[0.3em] ${size === "lg" ? "mt-1 text-xl" : "text-[11px]"}`}>
        NUTRITION
      </span>
    </>
  );
  const className = "flex flex-col items-center leading-none text-porcelain";
  return home ? (
    <Link href="/" aria-label="Home" className={`${className} rounded-lg hover:opacity-80`}>
      {mark}
    </Link>
  ) : (
    <div className={className}>{mark}</div>
  );
}

export function ColorDot({ color }: { color: string }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

/** Same order as the native app's `BrandPalette.employeeColors`. */
const employeeColors = ["#3E5C9A", "#7E9A6A", "#5B7FC2", "#9C7A3C", "#2E4470", "#5F7F73", "#8A6F9E", "#B5655A"];

export function employeeColor(index: number) {
  const count = employeeColors.length;
  return employeeColors[((index % count) + count) % count];
}

export const inputClass =
  "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-porcelain focus:ring-2 focus:ring-porcelain/20";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/50">{hint}</span>}
    </label>
  );
}

export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p role="alert" className="text-sm font-medium text-red-700">{error}</p>;
  if (success) return <p role="status" className="text-sm font-medium text-[#4d6340]">{success}</p>;
  return null;
}
