import { forwardRef } from 'react';
import { Icon } from './Icon.jsx';
import './Button.css';

/**
 * The two button primitives.
 *
 * Kept separate because they answer different questions: `Button` has a visible
 * text label, `IconButton` does not and therefore must be given an explicit
 * `label` prop to supply the accessible name. Making that requirement structural
 * means an unlabelled icon button cannot be written by accident.
 */

export const Button = forwardRef(function Button(
  { variant = 'secondary', isFullWidth = false, className, children, type = 'button', ...rest },
  ref,
) {
  const classes = ['button', `button--${variant}`, isFullWidth ? 'button--block' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {children}
    </button>
  );
});

const SIZES = { sm: 'sm', md: 'md', lg: 'lg' };

export const IconButton = forwardRef(function IconButton(
  {
    icon,
    label,
    size = 'md',
    variant,
    showLabel = false,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const classes = [
    'icon-button',
    `icon-button--${SIZES[size] ?? 'md'}`,
    variant ? `icon-button--${variant}` : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} className={classes} title={label} aria-label={label} {...rest}>
      <Icon name={icon} size={size === 'lg' ? 22 : 18} />
      {(showLabel || children) && (
        <span className={showLabel ? 'icon-button__label' : 'visually-hidden'}>
          {children ?? label}
        </span>
      )}
    </button>
  );
});

export default Button;