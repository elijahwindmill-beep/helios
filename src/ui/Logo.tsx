/**
 * The Zenit mark: a horizon line through a cut stone, the sun above it. The wordmark is drawn
 * as single strokes, like the engraved lettering on Soviet lens barrels (the Helios-44).
 */

export function Mark({ height = 22 }: { height?: number }) {
  return (
    <svg className="logo-mark" height={height} width={(height * 112) / 60} viewBox="4 2 112 60" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 40H112" />
        <path d="M36 40L48 22H72L84 40L60 56Z" />
      </g>
      <circle cx="60" cy="9" r="5" fill="var(--accent)" />
    </svg>
  );
}

/** ZENIT, cap height 20 units. */
export const WORDMARK_PATHS = [
  'M0 0H12L0 20H12',
  'M29 0H19V20H29M19 10H27',
  'M36 20V0L48 20V0',
  'M55 0V20',
  'M62 0H74M68 0V20',
];

export function Wordmark({ height = 14 }: { height?: number }) {
  return (
    <svg className="logo-word" height={height} width={(height * 77) / 23} viewBox="-1.5 -1.5 77 23" role="img" aria-label="Zenit">
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {WORDMARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

export function Logo({ height = 22 }: { height?: number }) {
  return (
    <span className="logo">
      <Mark height={height} />
      <Wordmark height={Math.round(height * 0.62)} />
    </span>
  );
}
