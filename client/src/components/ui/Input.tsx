import { type InputHTMLAttributes, forwardRef } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  suffix?: string;
}

const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, suffix, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-gray-400">{label}</label>}
      <div className="relative">
        <input
          ref={ref}
          className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500
            focus:outline-none focus:ring-1 transition-colors
            ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:border-indigo-500 focus:ring-indigo-500'}
            ${suffix ? 'pr-10' : ''}
            ${className}`}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
);

Input.displayName = 'Input';
export default Input;
