import {
  BatteryFull,
  BatteryLow,
  Clock,
  Fan,
  Flame,
  FlameKindling,
  House,
  Lightbulb,
  Lock,
  Router,
  Satellite,
  SignalLow,
  Soup,
  type LucideIcon,
} from "lucide-react";
import { EVAL_META, RARITY_COLOR, type Rarity, type Unit } from "@/lib/gacha/pool";

const ICONS: Record<string, LucideIcon> = {
  flame: Flame,
  "battery-low": BatteryLow,
  soup: Soup,
  clock: Clock,
  "flame-kindling": FlameKindling,
  "signal-low": SignalLow,
  fan: Fan,
  router: Router,
  lightbulb: Lightbulb,
  house: House,
  "battery-full": BatteryFull,
  satellite: Satellite,
};

export function GdCube({ color, className }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect x="3" y="3" width="34" height="34" rx="3" fill={color} stroke="#0d0b09" strokeWidth="3" />
      <rect x="9" y="9" width="22" height="22" fill="#0d0b09" opacity="0.25" />
      <rect x="11" y="13" width="6" height="6" fill="#0d0b09" />
      <rect x="23" y="13" width="6" height="6" fill="#0d0b09" />
      <rect x="12" y="24" width="16" height="4" fill="#0d0b09" />
    </svg>
  );
}

export function SubstationFire({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <defs>
        <linearGradient id="fire-g" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff3355" />
          <stop offset="0.55" stopColor="#ff8a1f" />
          <stop offset="1" stopColor="#ffe066" />
        </linearGradient>
      </defs>
      <path d="M60 14 L40 104 M60 14 L80 104 M46 76 L74 76 M50 56 L70 56 M54 36 L66 36 M30 44 L90 44 M36 28 L84 28" stroke="#1a1612" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M60 14 L40 104 M60 14 L80 104 M46 76 L74 76 M50 56 L70 56 M54 36 L66 36 M30 44 L90 44 M36 28 L84 28" stroke="#9c9486" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path
        className="gacha-flame"
        d="M20 112 C14 92 30 86 26 70 C38 80 40 66 36 54 C50 64 52 80 48 90 C56 82 58 70 60 58 C70 72 74 84 70 94 C78 88 84 78 82 64 C96 78 100 96 96 112 Z"
        fill="url(#fire-g)"
      />
      <path d="M90 20 L80 40 L88 40 L76 62" stroke="#ffe066" strokeWidth="3" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

export function UnitArt({
  unit,
  locked = false,
  size = "md",
}: {
  unit: Unit;
  locked?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "size-32" : size === "sm" ? "size-12" : "size-20";
  const icon = size === "lg" ? "size-16" : size === "sm" ? "size-6" : "size-10";
  const glyph = size === "lg" ? "text-7xl" : size === "sm" ? "text-2xl" : "text-5xl";
  const rarityColor = RARITY_COLOR[unit.rarity];
  const Icon = unit.art.icon ? ICONS[unit.art.icon] : undefined;

  return (
    <div
      className={`relative grid ${box} shrink-0 place-items-center overflow-hidden rounded-xl border-2`}
      style={{
        borderColor: locked ? "#3a342c" : rarityColor,
        background: locked
          ? "#1a1612"
          : `radial-gradient(circle at 50% 35%, ${unit.art.hue}55, #141210 75%)`,
        boxShadow: locked ? "none" : `0 0 18px ${rarityColor}44 inset`,
      }}
    >
      {locked ? (
        <Lock className={`${icon} text-line`} aria-hidden />
      ) : unit.art.glyph ? (
        <span className={`${glyph} leading-none`} style={{ color: unit.art.hue, textShadow: `0 0 16px ${unit.art.hue}` }} aria-hidden>
          {unit.art.glyph}
        </span>
      ) : unit.art.icon === "cube" ? (
        <GdCube color={unit.art.hue} className={icon} />
      ) : unit.art.icon === "fire" ? (
        <SubstationFire className={icon} />
      ) : Icon ? (
        <Icon className={icon} style={{ color: unit.art.hue }} aria-hidden />
      ) : null}
    </div>
  );
}

export function Stars({ rarity, className = "" }: { rarity: Rarity; className?: string }) {
  return (
    <span className={`tracking-tight ${className}`} style={{ color: RARITY_COLOR[rarity] }} aria-label={`${rarity} зірки`}>
      {"★".repeat(rarity)}
    </span>
  );
}

export function EvalBadge({ unit, className = "" }: { unit: Unit; className?: string }) {
  const meta = EVAL_META[unit.eval];
  return (
    <span
      title={meta.name}
      className={`font-display inline-grid min-w-7 place-items-center rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${className}`}
      style={{ background: meta.color, color: "#0d0b09" }}
    >
      {meta.label}
      <span className="sr-only">{meta.name}</span>
    </span>
  );
}
