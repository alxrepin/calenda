import styles from "./Segmented.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  stretch?: boolean;
  ariaLabel: string;
}

export function Segmented<T extends string>({ value, options, onChange, stretch, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className={[styles.group, stretch ? styles.stretch : ""].join(" ")} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" className={styles.item} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
