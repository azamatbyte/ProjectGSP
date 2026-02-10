import { useState, useEffect } from 'react';
import { getInitialTheme, getSystemTheme, saveThemePreference } from '../themeUtils';

export const useTheme = () => {
  const [theme, setTheme] = useState(getInitialTheme);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleSystemThemeChange = (e) => {
      // Only update if user hasn't manually set a preference
      const savedTheme = localStorage.getItem('theme');
      if (!savedTheme) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, []);

  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    saveThemePreference(newTheme);
  };

  const resetToSystemTheme = () => {
    localStorage.removeItem('theme');
    const systemTheme = getSystemTheme();
    setTheme(systemTheme);
  };

  return {
    theme,
    changeTheme,
    resetToSystemTheme,
    isSystemTheme: !localStorage.getItem('theme')
  };
};