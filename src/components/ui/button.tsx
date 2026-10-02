import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps } from "react";

type Variant = "primary" | "accent" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium select-none transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-ink-2",
  accent: "bg-accent text-accent-ink hover:bg-accent-strong shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]",
  outline: "border border-line-strong bg-surface text-ink hover:border-ink hover:bg-surface-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  danger: "bg-bad text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-[0.95rem]",
  lg: "h-12 px-6 text-base",
};

/** Multi-line variant for long labels: grows in height instead of overflowing narrow screens. */
const wrapSizes: Record<Size, string> = {
  sm: "min-h-8 py-1.5 px-3 text-sm",
  md: "min-h-11 py-2 px-4 text-[0.95rem]",
  lg: "min-h-12 py-2.5 px-5 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string, wrap = false) {
  return clsx(base, variants[variant], wrap ? ["max-w-full min-w-0 text-left leading-snug", wrapSizes[size]] : ["whitespace-nowrap", sizes[size]], className);
}

type Extra = { variant?: Variant; size?: Size; /** Let a long label wrap onto several lines. */ wrap?: boolean };

export function Button({ variant = "primary", size = "md", wrap, className, ...props }: ComponentProps<"button"> & Extra) {
  return <button className={buttonClass(variant, size, className, wrap)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", wrap, className, ...props }: ComponentProps<typeof Link> & Extra) {
  return <Link className={buttonClass(variant, size, className, wrap)} {...props} />;
}
