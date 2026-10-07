/**
 * Inline SVG icon set.
 *
 * Hand-rolled rather than pulled from an icon package: the app needs about a
 * dozen glyphs, they all have to inherit `currentColor` for the theme swap to
 * work, and shipping a dependency plus a few hundred kilobytes of unused icons
 * to save writing twelve path strings is a bad trade.
 *
 * Icons are decorative. Every icon-only control pairs one with an accessible
 * name supplied by its button, so the SVGs themselves are hidden from
 * assistive technology.
 */

const FILLED = { fill: true };

const ICONS = {
  plus: { paths: ['M12 5v14', 'M5 12h14'] },
  send: { paths: ['M12 19V5', 'M5 12l7-7 7 7'] },
  attach: { paths: ['M21.4 11.1l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5'] },
  stop: { ...FILLED, paths: ['M6.5 7.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z'] },
  copy: {
    rects: [{ x: 9, y: 9, width: 12, height: 12, rx: 2 }],
    paths: ['M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  },
  check: { paths: ['M20 6L9 17l-5-5'] },
  regenerate: {
    paths: [
      'M21 3v6h-6',
      'M3 21v-6h6',
      'M20.49 9A9 9 0 0 0 5.64 5.64L3 8',
      'M3.51 15A9 9 0 0 0 18.36 18.36L21 16',
    ],
  },
  menu: { paths: ['M3 12h18', 'M3 6h18', 'M3 18h18'] },
  close: { paths: ['M18 6L6 18', 'M6 6l12 12'] },
  settings: {
    paths: [
      'M4 21v-7',
      'M4 10V3',
      'M12 21v-9',
      'M12 8V3',
      'M20 21v-5',
      'M20 12V3',
      'M1 14h6',
      'M9 8h6',
      'M17 16h6',
    ],
  },
  trash: {
    paths: [
      'M3 6h18',
      'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2',
      'M18.5 6l-.8 13a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9L5.5 6',
      'M10 11v5',
      'M14 11v5',
    ],
  },
  sidebar: {
    rects: [{ x: 3, y: 3, width: 18, height: 18, rx: 2 }],
    paths: ['M9.5 3v18'],
  },
  chevronDown: { paths: ['M6 9l6 6 6-6'] },
  user: {
    paths: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'],
    circles: [{ cx: 12, cy: 7, r: 4 }],
  },
  assistant: {
    paths: [
      'M12 3l1.6 4.1a3 3 0 0 0 1.9 1.9L19.6 10.6a.6.6 0 0 1 0 1L17.5 12.5a3 3 0 0 0-1.9 1.9L14 18.5a.6.6 0 0 1-1 0l-1.6-4.1a3 3 0 0 0-1.9-1.9L5.4 11.6a.6.6 0 0 1 0-1l4.1-1.6a3 3 0 0 0 1.9-1.9L13 3a.6.6 0 0 1 1 0z',
    ],
  },
  conversation: {
    paths: [
      'M20.5 11.6a7.9 7.9 0 0 1-8.5 7.9 8.7 8.7 0 0 1-2.9-.5L4 20.5l1.5-4.7a8 8 0 0 1-.9-3.6 7.9 7.9 0 0 1 7.9-7.9h.5a7.9 7.9 0 0 1 7.5 7.3z',
    ],
  },
  pencil: {
    paths: ['M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z', 'M14.5 6.5l3 3'],
  },
  alert: {
    circle: { cx: 12, cy: 12, r: 9 },
    paths: ['M12 7.5v5.5', 'M12 16.5h.01'],
  },
  sun: {
    circle: { cx: 12, cy: 12, r: 4.5 },
    paths: [
      'M12 1.5v2',
      'M12 20.5v2',
      'M3.9 3.9l1.4 1.4',
      'M18.7 18.7l1.4 1.4',
      'M1.5 12h2',
      'M20.5 12h2',
      'M3.9 20.1l1.4-1.4',
      'M18.7 5.3l1.4-1.4',
    ],
  },
  moon: { paths: ['M20.5 13.3A8.5 8.5 0 1 1 10.7 3.5a6.8 6.8 0 0 0 9.8 9.8z'] },
  monitor: {
    rects: [{ x: 2.5, y: 4, width: 19, height: 12.5, rx: 2 }],
    paths: ['M8 20.5h8', 'M12 16.5v4'],
  },
};

export function Icon({ name, size = 20, className, ...rest }) {
  const icon = ICONS[name];

  // An unknown name is a programming error, but it must not blank the UI.
  if (!icon) return null;

  const isFilled = Boolean(icon.fill);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isFilled ? 'currentColor' : 'none'}
      stroke={isFilled ? 'none' : 'currentColor'}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {icon.paths?.map((d) => (
        <path key={d} d={d} />
      ))}
      {icon.rects?.map(({ x, y, width, height, rx }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={width} height={height} rx={rx} />
      ))}
      {icon.circle && <circle cx={icon.circle.cx} cy={icon.circle.cy} r={icon.circle.r} />}
      {icon.circles?.map(({ cx, cy, r }) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
      ))}
    </svg>
  );
}

export default Icon;