import type { CSSProperties } from "react";

type IconName =
  | "calendar"
  | "book"
  | "chevron-left"
  | "chevron-right"
  | "target"
  | "check"
  | "clock"
  | "spark";
const paths: Record<IconName, string> = {
  calendar:
    "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z M7 14h3m4 0h3m-10 4h3",
  book: "M12 5v16m0-16C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-2-1-6-2-10 1Z",
  "chevron-left": "m14 6-6 6 6 6",
  "chevron-right": "m10 6 6 6-6 6",
  target: "M21 12a9 9 0 1 1-9-9m5 9a5 5 0 1 1-5-5m0 5 9-9m-5 0h5v5",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
};

export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
