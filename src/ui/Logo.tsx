/**
 * The Helios mark: a horizon line through a cut stone, the sun above it. The wordmark is drawn
 * as single strokes, like the engraved lettering on the Soviet Helios-44 lens barrels.
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

/** HELIOS, cap height 20 units. */
export const WORDMARK_PATHS = [
  'M0 0V20M12 0V20M0 10H12',
  'M29 0H19V20H29M19 10H27',
  'M36 0V20H46',
  'M53 0V20',
  'M66.5 0C70.5 0 73 2.5 73 6V14C73 17.5 70.5 20 66.5 20S60 17.5 60 14V6C60 2.5 62.5 0 66.5 0Z',
  'M92 4.5C91.3 1.8 89.2 0 86.2 0C82.8 0 80.4 2 80.4 5C80.4 8.2 83 9.2 86 10C89.2 10.8 92 11.9 92 15.2C92 18.2 89.6 20 86 20C82.8 20 80.6 18.4 80 15.5',
];

export function Wordmark({ height = 14 }: { height?: number }) {
  return (
    <svg className="logo-word" height={height} width={(height * 95) / 23} viewBox="-1.5 -1.5 95 23" role="img" aria-label="Helios">
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
