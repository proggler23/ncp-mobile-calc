import type { ReactNode } from 'react'
import './ui.css'

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  wrap,
}: {
  label: string
  value: T | undefined
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[]
  onChange: (v: T) => void
  wrap?: boolean
}) {
  return (
    <div className={`seg${wrap ? ' seg--wrap' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          title={o.title}
          className="seg__item"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle__text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  )
}

/** Labelled form control (the label wraps the control, so it is associated implicitly). */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  )
}

/** Numeric stepper with big -/+ buttons; the number input accepts typing too. */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  decLabel,
  incLabel,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  decLabel: string
  incLabel: string
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="btn btn--icon"
        aria-label={decLabel}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        −
      </button>
      {format ? (
        <span className="stepper__value">{format(value)}</span>
      ) : (
        <input
          className="stepper__input"
          type="number"
          inputMode="numeric"
          aria-label={label}
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            if (e.target.value !== '') onChange(clamp(Number(e.target.value)))
          }}
        />
      )}
      <button
        type="button"
        className="btn btn--icon"
        aria-label={incLabel}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        +
      </button>
    </div>
  )
}
