/* global React */
// Icons: minimal SVG primitives. Stroke-based, 24×24 grid, 2px stroke.
// Brand sport icons (TennisBall, PadelRacket) drawn to match the DESIGN.md
// stencil treatment. Utility icons are Lucide-style equivalents.

const baseStroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function svg(children, size = 24) {
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', ...baseStroke,
  }, children);
}

// --- Brand sport icons ----------------------------------------------------
const TennisBall = ({ size }) => svg(
  React.createElement(React.Fragment, null,
    React.createElement('circle', { cx: 12, cy: 12, r: 9 }),
    React.createElement('path', { d: 'M3.6 8.5c4 0 7 3 7 7M20.4 15.5c-4 0-7-3-7-7' })
  ), size);

const PadelRacket = ({ size }) => svg(
  React.createElement(React.Fragment, null,
    React.createElement('ellipse', { cx: 12, cy: 9, rx: 7, ry: 8 }),
    React.createElement('path', { d: 'M12 17v5M9 22h6' }),
    React.createElement('circle', { cx: 9,  cy: 8, r: 0.9, fill: 'currentColor' }),
    React.createElement('circle', { cx: 12, cy: 8, r: 0.9, fill: 'currentColor' }),
    React.createElement('circle', { cx: 15, cy: 8, r: 0.9, fill: 'currentColor' }),
    React.createElement('circle', { cx: 10.5, cy: 11, r: 0.9, fill: 'currentColor' }),
    React.createElement('circle', { cx: 13.5, cy: 11, r: 0.9, fill: 'currentColor' })
  ), size);

// --- Utility (Lucide-style) ----------------------------------------------
const Calendar = ({ size }) => svg(
  React.createElement(React.Fragment, null,
    React.createElement('rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }),
    React.createElement('path', { d: 'M16 3v4M8 3v4M3 10h18' })
  ), size);

const Pin = ({ size }) => svg(
  React.createElement(React.Fragment, null,
    React.createElement('path', { d: 'M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12z' }),
    React.createElement('circle', { cx: 12, cy: 9, r: 2.5 })
  ), size);

const Clock = ({ size }) => svg(
  React.createElement(React.Fragment, null,
    React.createElement('circle', { cx: 12, cy: 12, r: 9 }),
    React.createElement('path', { d: 'M12 7v5l3 2' })
  ), size);

const ArrowUpRight = ({ size }) => svg(
  React.createElement(React.Fragment, null,
    React.createElement('path', { d: 'M7 17L17 7M9 7h8v8' })
  ), size);

const Instagram = ({ size }) => svg(
  React.createElement(React.Fragment, null,
    React.createElement('rect', { x: 3, y: 3, width: 18, height: 18, rx: 5 }),
    React.createElement('circle', { cx: 12, cy: 12, r: 4 }),
    React.createElement('circle', { cx: 17.5, cy: 6.5, r: 0.8, fill: 'currentColor' })
  ), size);

const Facebook = ({ size }) => svg(
  React.createElement('path', { d: 'M14 9h3V5h-3a4 4 0 00-4 4v2H7v4h3v6h4v-6h3l1-4h-4V9a0 0 0 010 0z' }),
  size);

const Whatsapp = ({ size }) => svg(
  React.createElement(React.Fragment, null,
    React.createElement('path', { d: 'M20 12a8 8 0 11-3.4-6.5L20 4l-1.5 3.4A8 8 0 0120 12z' }),
    React.createElement('path', { d: 'M9 10c.5 2.5 2.5 4.5 5 5l1.4-1.4a1 1 0 011.1-.2l1.6.7a1 1 0 01.6 1.1A2.5 2.5 0 0116 17a8 8 0 01-9-9 2.5 2.5 0 011.8-2.7 1 1 0 011.1.6l.7 1.6a1 1 0 01-.2 1.1L9 10z' })
  ), size);

Object.assign(window, {
  CDAF_ICONS: { TennisBall, PadelRacket, Calendar, Pin, Clock, ArrowUpRight, Instagram, Facebook, Whatsapp },
});
