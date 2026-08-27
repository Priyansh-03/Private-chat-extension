// Must load before anything that touches Custom Elements (emoji-mart's picker, imported via
// Overlay below) — some host pages leave window.customElements null/broken. This polyfill's own
// native-detection skips patching when a real registry already exists, so it's safe to import
// unconditionally rather than only on pages we've already detected as broken.
import "@webcomponents/custom-elements";
import React from "react";
import { createRoot } from "react-dom/client";
import { Overlay } from "../ui/Overlay";
import { OVERLAY_HOST_ID } from "../lib/constants";
import overlayCss from "../styles/overlay.css";

function mount(): void {
  if (document.getElementById(OVERLAY_HOST_ID)) return;

  const host = document.createElement("div");
  host.id = OVERLAY_HOST_ID;
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.width = "0";
  host.style.height = "0";
  host.style.zIndex = "2147483647";
  host.style.pointerEvents = "none";
  document.documentElement.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = overlayCss;
  shadowRoot.appendChild(style);

  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);

  createRoot(mountPoint).render(
    <React.StrictMode>
      <Overlay />
    </React.StrictMode>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
