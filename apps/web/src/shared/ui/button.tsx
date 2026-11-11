import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/shared/lib';

export type ButtonVariant = 'primary' | 'secondary';
export type ButtonSize = 'md' | 'lg';

const base =
  'inline-flex cursor-pointer items-center justify-center font-display transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-foreground text-background hover:bg-foreground/85',
  secondary: 'border border-border bg-surface text-foreground hover:bg-foreground/5',
};

const sizes: Record<ButtonSize, string> = {
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-7 text-base',
};

interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/**
 * Классы кнопки отдельно от компонента: ссылку (`next/link`) нужно оформить как кнопку,
 * не оборачивая `<button>` в `<a>` (невалидный HTML).
 */
export function buttonStyles({
  variant = 'primary',
  size = 'md',
  className,
}: ButtonStyleOptions = {}): string {
  return cx(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleOptions {}

export function Button({ variant, size, className, type = 'button', ...rest }: ButtonProps) {
  // type по умолчанию button: иначе кнопка внутри формы неожиданно отправит её.
  return <button type={type} className={buttonStyles({ variant, size, className })} {...rest} />;
}
