import { type ButtonHTMLAttributes, forwardRef } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const variants = {
  primary:   'bg-indigo-600 hover:bg-indigo-500 text-white',
  secondary: 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700',
  ghost:     'hover:bg-gray-800 text-gray-400 hover:text-white',
  danger:    'bg-red-600 hover:bg-red-500 text-white',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-5 py-3 text-base rounded-xl',
};

const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', size = 'md', className = '', disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-all
        disabled:opacity-40 disabled:cursor-not-allowed active:scale-95
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
);

Button.displayName = 'Button';
export default Button;
