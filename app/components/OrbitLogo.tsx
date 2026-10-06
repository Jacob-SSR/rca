// app/components/OrbitLogo.tsx
// โลโก้ระบบ: ดาวแกนกลาง (ตัว R) + วงโคจร 2 วงที่มีดาวบริวารหมุนรอบ

type Props = {
  size?: number;
  className?: string;
};

export default function OrbitLogo({ size = 44, className }: Props) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <defs>
        <radialGradient id="logo-core" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#e9e4ff" />
          <stop offset="35%" stopColor="#8f7bff" />
          <stop offset="100%" stopColor="#3a1fb8" />
        </radialGradient>
        <linearGradient id="logo-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4fe3ff" />
          <stop offset="100%" stopColor="#ff6ad5" />
        </linearGradient>
        <filter id="logo-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* วงโคจรนอก — เอียง หมุนช้า */}
      <g transform="rotate(-28 32 32)">
        <ellipse cx="32" cy="32" rx="29" ry="11" fill="none" stroke="url(#logo-ring)" strokeOpacity="0.55" strokeWidth="1.3" />
        <circle r="3" fill="#4fe3ff" filter="url(#logo-glow)">
          <animateMotion dur="7s" repeatCount="indefinite" path="M3 32a29 11 0 1 0 58 0a29 11 0 1 0 -58 0" />
        </circle>
      </g>

      {/* วงโคจรใน — เอียงอีกทาง หมุนเร็วกว่า */}
      <g transform="rotate(35 32 32)">
        <ellipse cx="32" cy="32" rx="22" ry="7.5" fill="none" stroke="#c9b8ff" strokeOpacity="0.35" strokeWidth="1" />
        <circle r="2.2" fill="#ff6ad5" filter="url(#logo-glow)">
          <animateMotion dur="4.5s" repeatCount="indefinite" path="M54 32a22 7.5 0 1 0 -44 0a22 7.5 0 1 0 44 0" />
        </circle>
      </g>

      <circle cx="32" cy="32" r="14" fill="url(#logo-core)" filter="url(#logo-glow)" />
      <text
        x="32"
        y="37.5"
        textAnchor="middle"
        fontSize="16"
        fontWeight="800"
        fill="#ffffff"
        fontFamily="system-ui, sans-serif"
      >
        R
      </text>
    </svg>
  );
}
