import * as esbuild from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

const watch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  format: "iife",
  target: "chrome110",
  platform: "browser",
  sourcemap: true,
  logLevel: "info",
  loader: { ".css": "text" },
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
};

const contentCtx = await esbuild.context({
  ...shared,
  entryPoints: ["src/content/index.tsx"],
  outfile: "dist/content.js",
  // Some host pages leave window.customElements set to null (rather than undefined) in this
  // content script's isolated world. @emoji-mart/react only guards against `undefined`, so
  // `customElements.get(...)` throws at bundle-evaluation time and can take the whole content
  // script down with it. This runs before any bundled module code, including that library's.
  // Object.defineProperty (not plain assignment) because `customElements` may be an inherited
  // getter-only accessor, which a plain "window.customElements = ..." silently fails to override.
  banner: {
    js: `if (typeof customElements === "undefined" || customElements === null) {
      try {
        Object.defineProperty(window, "customElements", {
          value: { get: () => void 0, define: () => {}, upgrade: () => {}, whenDefined: () => Promise.resolve() },
          configurable: true,
          writable: true,
        });
      } catch {}
    }`,
  },
});

const backgroundCtx = await esbuild.context({
  ...shared,
  entryPoints: ["src/background/index.ts"],
  outfile: "dist/background.js",
});

const popupCtx = await esbuild.context({
  ...shared,
  entryPoints: ["src/popup/index.tsx"],
  outfile: "dist/popup.js",
});

async function copyPopupAssets() {
  await mkdir("dist", { recursive: true });
  await copyFile("src/popup/popup.html", "dist/popup.html");
  await copyFile("src/popup/popup.css", "dist/popup.css");
  await copyFile("src/assets/logo.svg", "dist/logo.svg");
}

if (watch) {
  await Promise.all([contentCtx.watch(), backgroundCtx.watch(), popupCtx.watch()]);
  await copyPopupAssets();
  console.log("Watching for changes...");
} else {
  await Promise.all([contentCtx.rebuild(), backgroundCtx.rebuild(), popupCtx.rebuild()]);
  await copyPopupAssets();
  await Promise.all([contentCtx.dispose(), backgroundCtx.dispose(), popupCtx.dispose()]);
}
