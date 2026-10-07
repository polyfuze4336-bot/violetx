import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

/**
 * VioletX brand mark: a rounded square with an abstract "X" whose rising stroke
 * doubles as an upward progression / pulse line — train, explore, evolve.
 */
export function Logo({
  className,
  gradientId = "violetx-logo-gradient",
}: {
  className?: string;
  gradientId?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={APP_NAME}
      className={cn("h-8 w-8", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F28C1E" />
          <stop offset="55%" stopColor="#E2620F" />
          <stop offset="100%" stopColor="#B03A16" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="9" fill={`url(#${gradientId})`} />
      {/* Falling stroke of the X */}
      <path
        d="M15 15 L33 33"
        stroke="#ffffff"
        strokeOpacity="0.7"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Rising stroke as a progression line with an upward tick */}
      <path
        d="M14 34 L23 25 L27 29 L34 14"
        fill="none"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo className="h-7 w-7" />
      <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
    </div>
  );
}
