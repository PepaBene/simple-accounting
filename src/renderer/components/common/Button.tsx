import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 border border-blue-700 shadow-sm',
  secondary:
    'bg-gray-100 text-gray-800 hover:bg-gray-200 active:bg-gray-300 border border-gray-300',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 border border-red-700 shadow-sm',
  ghost:
    'bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200 border border-transparent',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-4 py-1.5 text-sm',
  lg: 'px-5 py-2 text-base',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
