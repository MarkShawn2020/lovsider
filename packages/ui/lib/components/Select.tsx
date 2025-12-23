import { cn } from '../utils';
import { ChevronDownIcon } from '@radix-ui/react-icons';
import { useState, useRef, useEffect } from 'react';

interface SelectOption {
  value: string;
  label: string;
  icon?: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange?: (value: string) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const Select = ({ options, value, onChange, onValueChange, placeholder, className }: SelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(option => option.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (optionValue: string) => {
    // 支持两种不同的回调属性名
    if (onValueChange) {
      onValueChange(optionValue);
    } else if (onChange) {
      onChange(optionValue);
    }
    setIsOpen(false);
  };

  return (
    <div ref={selectRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center justify-between rounded border border-gray-300 bg-white px-3 py-2 text-sm transition-colors',
          'hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
          'dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:border-gray-500',
          isOpen && 'border-blue-500 ring-1 ring-blue-500',
        )}>
        <div className="flex items-center space-x-2">
          {selectedOption?.icon && <span>{selectedOption.icon}</span>}
          <span className={selectedOption ? 'text-gray-900 dark:text-white' : 'text-gray-500'}>
            {selectedOption?.label || placeholder || '请选择...'}
          </span>
        </div>
        <ChevronDownIcon className={cn('h-4 w-4 text-gray-500 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-1 w-full rounded border border-gray-300 bg-white shadow-lg',
            'dark:border-gray-600 dark:bg-gray-800',
          )}>
          <div className="max-h-60 overflow-auto py-1">
            {options.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={cn(
                  'flex w-full items-center space-x-2 px-3 py-2 text-left text-sm transition-colors',
                  'hover:bg-gray-100 dark:hover:bg-gray-700',
                  option.value === value && 'bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-300',
                )}>
                {option.icon && <span>{option.icon}</span>}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
