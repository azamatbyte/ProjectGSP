import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import * as serviceWorker from "./serviceWorker";
import "antd/dist/reset.css";
import "./index.css";
import { message } from "antd";

const container = document.getElementById("root");
const root = createRoot(container); // createRoot(container!) if you use TypeScript
message.config({
    top: 100,
    duration: 2,
    maxCount: 2,
});
root.render(
    // <React.StrictMode>
        <App />
    // </React.StrictMode>
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
