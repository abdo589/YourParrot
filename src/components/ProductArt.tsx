import type { ArtKind, Palette } from "@/lib/products";

interface Props {
  kind: ArtKind;
  palette: Palette;
  label: string;
  className?: string;
}

/** Hand-drawn SVG illustrations so the store ships with zero third-party images. */
export function ProductArt({ kind, palette, label, className }: Props) {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={label} className={className}>
      {/* Every instance defines the same clip shape, so a shared id is safe. */}
      <clipPath id="yp-art-clip">
        <rect width="200" height="200" rx="28" />
      </clipPath>
      <g clipPath="url(#yp-art-clip)">
        <rect width="200" height="200" fill={palette.tint} />
        <circle cx="170" cy="30" r="46" fill={palette.primary} opacity="0.12" />
        <circle cx="24" cy="182" r="38" fill={palette.secondary} opacity="0.1" />
      </g>
      {kind === "parrot" && <Parrot p={palette} />}
      {kind === "cage" && <Cage p={palette} />}
      {kind === "food" && <Food p={palette} />}
      {kind === "toy" && <Toy p={palette} />}
      {kind === "care" && <Care p={palette} />}
    </svg>
  );
}

function Parrot({ p }: { p: Palette }) {
  return (
    <g>
      <path d="M108 146 L150 192 L134 196 L98 158 Z" fill={p.secondary} />
      <path d="M134 174 L150 192 L134 196 L124 184 Z" fill={p.accent} />
      <ellipse cx="104" cy="110" rx="36" ry="50" transform="rotate(-18 104 110)" fill={p.primary} />
      <path d="M110 80 Q152 100 138 148 Q120 168 100 150 Q110 120 110 80 Z" fill={p.secondary} />
      <path d="M116 112 Q134 120 132 140" stroke={p.primary} strokeWidth="3" fill="none" opacity="0.5" />
      <circle cx="84" cy="64" r="30" fill={p.primary} />
      <path d="M78 36 Q86 18 98 26 Q90 30 90 38 Z" fill={p.accent} opacity="0.9" />
      <circle cx="88" cy="76" r="7" fill={p.accent} opacity="0.75" />
      <path d="M58 58 Q36 62 42 86 Q48 78 60 76 Z" fill="#2f2a26" />
      <path d="M50 64 Q44 70 46 78" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" fill="none" />
      <circle cx="78" cy="58" r="7" fill="#ffffff" />
      <circle cx="76.5" cy="58" r="3.6" fill="#141414" />
      <circle cx="75.5" cy="56.8" r="1.1" fill="#ffffff" />
      <rect x="36" y="158" width="134" height="10" rx="5" fill="#8a5a2b" />
      <circle cx="96" cy="158" r="5" fill="#6b5a4e" />
      <circle cx="112" cy="158" r="5" fill="#6b5a4e" />
    </g>
  );
}

function Cage({ p }: { p: Palette }) {
  const bars = [62, 76, 90, 104, 118, 132];
  return (
    <g>
      <line x1="100" y1="20" x2="100" y2="34" stroke={p.secondary} strokeWidth="4" strokeLinecap="round" />
      <circle cx="100" cy="18" r="6" fill="none" stroke={p.secondary} strokeWidth="4" />
      <path d="M48 80 Q48 34 100 34 Q152 34 152 80 Z" fill={p.primary} opacity="0.35" />
      <path d="M48 80 Q48 34 100 34 Q152 34 152 80" fill="none" stroke={p.secondary} strokeWidth="5" />
      {bars.map((x) => (
        <line key={x} x1={x} y1="44" x2={x} y2="160" stroke={p.secondary} strokeWidth="3" />
      ))}
      <line x1="48" y1="80" x2="48" y2="160" stroke={p.secondary} strokeWidth="5" />
      <line x1="152" y1="80" x2="152" y2="160" stroke={p.secondary} strokeWidth="5" />
      <line x1="48" y1="80" x2="152" y2="80" stroke={p.secondary} strokeWidth="4" />
      <line x1="60" y1="122" x2="140" y2="122" stroke="#8a5a2b" strokeWidth="5" strokeLinecap="round" />
      <rect x="40" y="158" width="120" height="16" rx="6" fill={p.accent} />
      <circle cx="56" cy="182" r="6" fill={p.secondary} />
      <circle cx="144" cy="182" r="6" fill={p.secondary} />
    </g>
  );
}

function Food({ p }: { p: Palette }) {
  const seeds = [
    [42, 170, p.primary], [58, 178, p.secondary], [150, 172, p.accent], [164, 164, p.primary], [140, 182, p.secondary],
  ] as const;
  return (
    <g>
      <path d="M60 46 L140 46 L152 170 Q100 182 48 170 Z" fill={p.primary} />
      <path d="M60 46 L140 46 L136 34 L64 34 Z" fill={p.secondary} />
      <rect x="66" y="84" width="68" height="52" rx="12" fill="#ffffff" opacity="0.92" />
      <ellipse cx="100" cy="104" rx="16" ry="10" fill={p.accent} />
      <path d="M100 94 Q106 84 114 86" stroke={p.secondary} strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="80" y="120" width="40" height="6" rx="3" fill={p.secondary} opacity="0.6" />
      {seeds.map(([cx, cy, c], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx="7" ry="4.5" fill={c} transform={`rotate(${i * 35} ${cx} ${cy})`} />
      ))}
    </g>
  );
}

function Toy({ p }: { p: Palette }) {
  return (
    <g>
      <circle cx="100" cy="36" r="16" fill="none" stroke="#8a5a2b" strokeWidth="5" />
      <line x1="100" y1="52" x2="100" y2="170" stroke="#c9a77a" strokeWidth="4" />
      <rect x="78" y="62" width="44" height="26" rx="6" fill={p.primary} />
      <circle cx="100" cy="102" r="11" fill={p.accent} />
      <rect x="84" y="118" width="32" height="24" rx="5" fill={p.secondary} />
      <circle cx="100" cy="156" r="9" fill={p.primary} />
      <path d="M100 166 L88 188 M100 166 L100 192 M100 166 L112 188" stroke={p.accent} strokeWidth="4" strokeLinecap="round" />
    </g>
  );
}

function Care({ p }: { p: Palette }) {
  return (
    <g>
      <rect x="86" y="22" width="28" height="22" rx="6" fill={p.secondary} />
      <rect x="92" y="40" width="16" height="12" fill={p.secondary} opacity="0.7" />
      <path d="M66 62 Q66 50 80 50 L120 50 Q134 50 134 62 L134 168 Q134 180 120 180 L80 180 Q66 180 66 168 Z" fill={p.primary} />
      <rect x="76" y="88" width="48" height="58" rx="10" fill="#ffffff" opacity="0.92" />
      <rect x="94" y="100" width="12" height="34" rx="3" fill={p.accent === "#f2f2f2" ? p.primary : p.accent} />
      <rect x="83" y="111" width="34" height="12" rx="3" fill={p.accent === "#f2f2f2" ? p.primary : p.accent} />
      <circle cx="150" cy="70" r="7" fill={p.primary} opacity="0.55" />
      <circle cx="160" cy="92" r="4" fill={p.primary} opacity="0.4" />
    </g>
  );
}
