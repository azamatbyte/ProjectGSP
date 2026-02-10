export const getSystemTheme = () => {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light"; // fallback
};

export const getInitialTheme = () => {
  // First check if user has a saved preference
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme && (savedTheme === "dark" || savedTheme === "light")) {
    return savedTheme;
  }

  // If no saved preference, use system preference
  return getSystemTheme();
};

export const saveThemePreference = (theme) => {
  localStorage.setItem("theme", theme);
};
