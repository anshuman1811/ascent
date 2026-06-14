import { type SelectHTMLAttributes, forwardRef } from 'react';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string | number; label: string }[];
}

const Select = forwardRef<HTMLSelectElement, Props>(
  ({ label, options, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-gray-400">{label}</label>}
      <select
        ref={ref}
        className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
          focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors ${className}`}
        {...props}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
);

Select.displayName = 'Select';
export default Select;
