export default function Logo({
  width = 32,
  height = 32,
  showText = true,
}: {
  width?: number;
  height?: number;
  showText?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* Speech bubble 1 (Navy/Primary) */}
        <path
          d="M20 20 H70 A10 10 0 0 1 80 30 V60 A10 10 0 0 1 70 70 H40 L20 85 V70 H20 A10 10 0 0 1 10 60 V30 A10 10 0 0 1 20 20 Z"
          fill="var(--primary, #0B192C)"
        />
        {/* Speech bubble 2 (Cyan Overlay) */}
        <path
          d="M40 40 H90 A10 10 0 0 1 100 50 V80 A10 10 0 0 1 90 90 H60 L40 105 V90 H40 A10 10 0 0 1 30 80 V50 A10 10 0 0 1 40 40 Z"
          fill="var(--primary-fixed, #0ea5e9)"
          opacity="0.9"
        />
        {/* Cutout / Negative space indicating upward arrow */}
        <path
          d="M50 75 L65 55 H58 V40 H42 V55 H35 L50 75 Z"
          fill="var(--surface, #ffffff)"
        />
      </svg>
      {showText && (
        <span
          style={{
            fontFamily: "var(--font-display, Inter, sans-serif)",
            fontWeight: 800,
            letterSpacing: "-1px",
            color: "var(--primary, #0B192C)",
            fontSize: `${width * 0.75}px`,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          Articuly<span style={{ color: "var(--primary-fixed, #0ea5e9)" }}>.ai</span>
        </span>
      )}
    </div>
  );
}
