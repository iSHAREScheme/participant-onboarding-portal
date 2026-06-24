import React, { useState, useRef, useEffect } from 'react';
import styles from 'styles/components/FormSelect.module.css';

interface Option {
  value: string;
  label: string;
}

interface FormSelectProps {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}

// A custom dropdown styled to match FormInput: neutral border, 8px radius and a
// floating label, so selects sit flush with the text inputs on a form. The label
// doubles as the placeholder (centred when empty, floated to the border notch
// once a value is chosen or the menu is open), mirroring FormInput exactly.
const FormSelect: React.FC<FormSelectProps> = ({
  label,
  options,
  value,
  onChange,
  required = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);
  const hasValue = !!selectedOption;
  const isActive = isOpen || hasValue;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = () => {
    if (!disabled) setIsOpen((o) => !o);
  };

  return (
    <div className={styles.container} ref={dropdownRef}>
      <div className={styles.control}>
        <div
          className={`${styles.select} ${isOpen ? styles.active : ''} ${disabled ? styles.disabled : ''}`}
          onClick={toggle}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-disabled={disabled}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsOpen((o) => !o);
            } else if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
        >
          <span className={styles.value}>{selectedOption?.label || ''}</span>
          <svg
            className={`${styles.caret} ${isOpen ? styles.caretOpen : ''}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <label className={`${styles.label} ${isActive ? styles.labelActive : ''}`}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      </div>

      {isOpen && !disabled && (
        <div className={styles.dropdown} role="listbox">
          {options.map((option) => (
            <div
              key={option.value}
              className={`${styles.option} ${option.value === value ? styles.optionSelected : ''}`}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FormSelect;
