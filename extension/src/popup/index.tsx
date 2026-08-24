import React from "react";
import { createRoot } from "react-dom/client";
import { SettingsPopup } from "./SettingsPopup";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <SettingsPopup />
    </React.StrictMode>,
  );
}
