import React from "react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { ThemeSwitcherProvider } from "react-css-theme-switcher";
import store from "./store";
import history from "./history";
import Layouts from "./layouts";
import "./lang";
import { useTheme } from "utils/hooks/useTheme";

const themes = {
  dark: `${process.env.PUBLIC_URL}/css/dark-theme.css`,
  light: `${process.env.PUBLIC_URL}/css/light-theme.css`,
};

// Create a separate component that uses the theme hook
function ThemedApp() {
  const { theme } = useTheme();

  return (
    <ThemeSwitcherProvider
      themeMap={themes}
      defaultTheme={theme}
      insertionPoint="styles-insertion-point"
    >
      <Layouts />
    </ThemeSwitcherProvider>
  );
}

function App() {
  return (
    <div className="App">
      <Provider store={store}>
        <BrowserRouter history={history}>
          <ThemedApp />
        </BrowserRouter>
      </Provider>
    </div>
  );
}

export default App;