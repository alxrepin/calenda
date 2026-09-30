import type { CSSProperties } from "react";

/** CSS custom property carrying the calendar colour into a block's styles. */
export function colorVars(color: string): CSSProperties {
  return { "--c": color } as CSSProperties;
}
