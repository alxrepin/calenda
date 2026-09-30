import type { CSSProperties } from "react";
import { Icon } from "./Icon";
import styles from "./Checkbox.module.css";

interface CheckboxProps {
  checked: boolean;
  color?: string;
  round?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  className?: string;
}

/** A square (calendar) or round (task) checkbox tinted with a colour. */
export function Checkbox({ checked, color, round = false, label, onChange, className }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={[styles.box, round ? styles.round : "", className ?? ""].join(" ")}
      style={color ? ({ "--c": color } as CSSProperties) : undefined}
      data-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      {checked && <Icon name="check" size={round ? 12 : 11} strokeWidth={2.6} />}
    </button>
  );
}
