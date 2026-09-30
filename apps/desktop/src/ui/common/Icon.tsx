import type { SVGProps } from "react";

export type IconName =
  | "chevronLeft"
  | "chevronRight"
  | "chevronDown"
  | "chevronUp"
  | "search"
  | "plus"
  | "flag"
  | "clock"
  | "calendar"
  | "bell"
  | "check"
  | "checkCircle"
  | "grid"
  | "gear"
  | "help"
  | "grip"
  | "close"
  | "location"
  | "link"
  | "trash"
  | "repeat"
  | "notes"
  | "list";

const PATHS: Record<IconName, string> = {
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M6 15l6-6 6 6",
  search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm9 16-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  flag: "M5 21V4h11l-1.5 4L16 12H5",
  clock: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 4v5l3 2",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  check: "M5 12l4.5 4.5L19 7",
  checkCircle: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm-3.5 9 2.5 2.5 5-5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  gear: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0-5v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1",
  help: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm-2.5 7a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17h.01",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  close: "M6 6l12 12M18 6 6 18",
  location: "M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  trash: "M4 7h16M9 7V4h6v3m-7 0v13h8V7",
  repeat: "M17 3l3 3-3 3M4 12V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3m13-3v3a3 3 0 0 1-3 3H4",
  notes: "M5 4h14v16H5zM8 9h8M8 13h8M8 17h5",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
};

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, strokeWidth = 1.8, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
