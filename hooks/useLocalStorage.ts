
import React, { useState, useEffect } from 'react';

/**
 * **useLocalStorage**
 * 
 * A React hook that persists state to `localStorage`.
 * It behaves like `useState` but synchronizes with the browser's storage.
 * 
 * **Features:**
 * - Lazy initialization (reads from storage only on mount).
 * - Graceful error handling (fallback to initial value if storage fails).
 * - Type-safe via generics.
 * 
 * **Usage Example:**
 * ```tsx
 * const [username, setUsername] = useLocalStorage<string>('user_name', 'Guest');
 * ```
 * 
 * @template T The type of the state variable.
 * @param {string} key The localStorage key.
 * @param {T} initialValue The default value if the key doesn't exist.
 * @returns {[T, React.Dispatch<React.SetStateAction<T>>]} Tuple of [storedValue, setValue].
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  // Get from local storage then parse stored json or return initialValue
  const readValue = (): T => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  };

  const [storedValue, setStoredValue] = useState<T>(readValue);

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // Save state
      setStoredValue(valueToStore);
      
      // Save to local storage
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}
