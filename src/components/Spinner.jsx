import './Spinner.css';

/** Indeterminate progress ring. Decorative, so hidden from assistive tech. */
export function Spinner({ size = 16, className, ...rest }) {
  return (
    <span
      className={['spinner', className].filter(Boolean).join(' ')}
      style={{ '--spinner-size': `${size}px` }}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
}

export default Spinner;