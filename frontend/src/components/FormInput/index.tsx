import React, { useState } from 'react'
import styles from 'styles/components/FormInput.module.css'
interface FormInputProps {
    disabled?: boolean;
    label: string;
    id: string;
    name: string;
    type: string;
    value: string | number;
    required?: boolean;
    placeholder: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    error?: string | undefined;
}

const FormInput: React.FC<FormInputProps> = ({ disabled, label, id, name, type, value, placeholder, required, onChange, error }) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = value !== undefined && value !== null && value !== '';
    const isActive = hasValue || isFocused;

    return (
        <div className={styles.formGroup}>
            <div className={styles.inputContainer}>
                <input
                    disabled={disabled}
                    type={type}
                    id={id}
                    name={name}
                    value={value}
                    placeholder=""
                    onChange={onChange}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    className={`${styles.input} ${hasValue ? styles.hasValue : ''}`}
                />
                <label htmlFor={name} className={`${styles.label} ${isActive ? styles.labelActive : ''}`}>
                    {label} {required && <span className={styles.required}>*</span>}
                </label>
            </div>
            {error && <div className={styles.inValidFeedback}>{error}</div>}
        </div>
    );
};

export default FormInput;