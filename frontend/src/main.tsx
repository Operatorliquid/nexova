// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import AdminPanel from "./admin/AdminPanel.tsx";
import "./index.css";

const isAdminRoute = window.location.pathname.startsWith("/admin");
const RootComponent = isAdminRoute ? AdminPanel : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
