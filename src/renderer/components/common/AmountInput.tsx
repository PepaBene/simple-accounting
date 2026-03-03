import React, { useState, useCallback } from 'react';

interface AmountInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  ({ value, onChange, placeholder = '0,00', disabled = false, className = '' }, ref) => {
    const [focused, setFocused] = useState(false);
    const [rawValue, setRawValue] = useState('');

    const formatDisplay = (num: number): string => {
      if (num === 0 && !focused) return '';
      return num.toLocaleString('cs-CZ', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    };

    const handleFocus = useCallback(() => {
      setFocused(true);
      setRawValue(value === 0 ? '' : value.toString().replace('.', ','));
    }, [value]);

    const handleBlur = useCallback(() => {
      setFocused(false);
      const parsed = parseFloat(rawValue.replace(/\s/g, '').replace(',', '.'));
      if (!isNaN(parsed)) {
        onChange(Math.round(parsed * 100) / 100);
      } else {
        onChange(0);
      }
    }, [rawValue, onChange]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        // Allow digits, comma, dot, minus, and spaces
        if (/^-?[\d\s]*[,.]?\d{0,2}$/.test(val) || val === '') {
          setRawValue(val);
        }
      },
      []
    );

    return (
      <div className={`relative flex items-center ${className}`}>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={focused ? rawValue : formatDisplay(value)}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded border border-gray-300 pl-3 pr-8 py-1.5 text-sm text-right tabular-nums transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
        />
        <span className="absolute right-2.5 text-xs text-gray-400 pointer-events-none select-none">
          Kč
        </span>
      </div>
    );
  }
);

AmountInput.displayName = 'AmountInput';

export default AmountInput;
