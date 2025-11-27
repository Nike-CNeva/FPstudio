import React, { ChangeEvent, useState, useEffect } from 'react';

// A smart input wrapper that maintains local state to allow intermediate inputs 
// (like "0." or empty string) for numeric types, syncing with parent prop only on valid changes/blur.
const SmartNumericInput: React.FC<{
    value: number;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
}> = ({ value, onChange, className, placeholder, disabled }) => {
    const [localValue, setLocalValue] = useState<string>(value.toString());

    // Sync local state when prop changes externally (e.g. selecting a different item)
    useEffect(() => {
        // Only update if the parsed local value differs significantly from prop to avoid cursor jumping
        // or if the prop changed fundamentally.
        if (parseFloat(localValue) !== value && !(localValue === '' && value === 0)) {
             setLocalValue(value.toString());
        }
    }, [value]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setLocalValue(newVal);

        // Check if it's a valid number or part of a valid number
        // Allow "-" sign, empty string, or valid float
        if (newVal === '' || newVal === '-') {
            // Don't fire parent change yet, or fire with 0?
            // firing with 0 might be annoying if user just deleted everything.
            // firing with 0 allows parent state to stay numeric.
             const syntheticEvent = {
                ...e,
                target: { ...e.target, value: '0' }
            };
            onChange(syntheticEvent);
            return;
        }

        // If it ends in a dot (e.g. "10."), don't fire parse yet (would be 10), 
        // or do fire parse (10) but keep local string "10.".
        // Parent will update state to 10. Prop comes back as 10. UseEffect sees local "10." != prop 10? No 10 == 10.
        // So useEffect won't overwrite "10." with "10". Good.
        
        const parsed = parseFloat(newVal);
        if (!isNaN(parsed)) {
             const syntheticEvent = {
                ...e,
                target: { ...e.target, value: parsed.toString() }
            };
            onChange(syntheticEvent);
        }
    };
    
    const handleBlur = () => {
         // On blur, force strict sync
         setLocalValue(value.toString());
    };

    return (
        <input 
            type="text" 
            value={localValue} 
            onChange={handleChange} 
            onBlur={handleBlur}
            className={className}
            placeholder={placeholder}
            disabled={disabled}
            inputMode="decimal"
        />
    );
}

export const InputField: React.FC<{ 
    label: string, 
    value: any, 
    onChange: (e: ChangeEvent<HTMLInputElement>) => void, 
    type?: string,
    disabled?: boolean 
}> = ({ label, value, onChange, type = "text", disabled }) => (
    <div className="flex-1">
        <label className="block text-xs text-gray-400 mb-1">{label}</label>
        {type === 'number' ? (
             <SmartNumericInput 
                value={parseFloat(value) || 0}
                onChange={onChange}
                className="w-full bg-gray-800 border border-gray-600 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={disabled}
             />
        ) : (
            <input 
                type={type} 
                value={value} 
                onChange={onChange} 
                className="w-full bg-gray-800 border border-gray-600 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed" 
                disabled={disabled}
            />
        )}
    </div>
);

export const ModalInputField: React.FC<{ label: string, value: any, onChange: (e: ChangeEvent<HTMLInputElement>) => void, type?: string, placeholder?: string, disabled?: boolean }> = ({ label, value, onChange, type = "text", placeholder, disabled }) => (
    <div className="flex-1">
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        {type === 'number' ? (
             <SmartNumericInput 
                value={parseFloat(value) || 0}
                onChange={onChange}
                placeholder={placeholder}
                disabled={disabled}
                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed"
             />
        ) : (
            <input type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed" />
        )}
    </div>
);