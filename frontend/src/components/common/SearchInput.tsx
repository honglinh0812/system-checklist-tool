import React, { useState, useEffect } from 'react';
import { debounce } from '../../utils/helpers';
import { useTranslation } from '../../i18n/useTranslation';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  delay?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClear?: () => void;
}

const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder,
  delay = 300,
  className = '',
  size = 'md',
  disabled = false,
  onClear,
}) => {
  const { t } = useTranslation();
  const [localValue, setLocalValue] = useState(value);

  // Create debounced function
  const debouncedOnChange = debounce(onChange, delay);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    debouncedOnChange(newValue);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange('');
    if (onClear) {
      onClear();
    }
  };

  const sizeClass = {
    sm: 'form-control-sm',
    md: '',
    lg: 'form-control-lg',
  }[size];

  return (
    <div className={`search-input position-relative ${className}`}>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">
            <i className="fas fa-search"></i>
          </span>
        </div>
        <input
          type="text"
          className={`form-control ${sizeClass}`}
          placeholder={placeholder || t('searchPlaceholder')}
          value={localValue}
          onChange={handleInputChange}
          disabled={disabled}
        />
        {localValue && (
          <div className="input-group-append">
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={handleClear}
              disabled={disabled}
              title="Clear search"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchInput;