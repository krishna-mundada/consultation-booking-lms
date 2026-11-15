import { cn } from "@/lib/utils";

// The brand motif is a topographic map: nested, slightly rotating outlines. Both pieces are
// decorative, so they are hidden from assistive technology.

// One organic closed outline, drawn around the centre of a 400 x 400 box.
const OUTLINE =
  "M200 60 C270 50 340 100 345 170 C350 240 310 320 230 340 C150 360 70 320 55 240 C40 160 90 70 200 60 Z";

const rings = (count: number, from: number, to: number, turn: number) =>
  Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1);
    return { scale: from + (to - from) * t, rotate: i * turn };
  });

type RingsProps = {
  count: number;
  from: number;
  to: number;
  turn: number;
  strokeWidth: number;
  /** Keep the line width in screen pixels however the drawing is scaled (for the large field). */
  constantWidth?: boolean;
};

function Rings({ count, from, to, turn, strokeWidth, constantWidth }: RingsProps) {
  return (
    <>
      {rings(count, from, to, turn).map(({ scale, rotate }) => (
        <path
          key={scale}
          d={OUTLINE}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          vectorEffect={constantWidth ? "non-scaling-stroke" : undefined}
          transform={`translate(200 200) rotate(${rotate}) scale(${scale}) translate(-200 -200)`}
        />
      ))}
    </>
  );
}

/** The small mark used in the header: four outlines in a square. */
export function ContourMark({ className }: { className?: string }) {
  return (
    <svg viewBox="40 40 320 320" aria-hidden="true" className={cn("h-7 w-7", className)}>
      <Rings count={4} from={0.35} to={1.05} turn={9} strokeWidth={14} />
    </svg>
  );
}

/** A large field of contour lines, coloured by the surrounding text colour. */
export function ContourLines({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
      className={cn("pointer-events-none", className)}
    >
      <Rings count={11} from={0.12} to={1.5} turn={7} strokeWidth={1.25} constantWidth />
    </svg>
  );
}
