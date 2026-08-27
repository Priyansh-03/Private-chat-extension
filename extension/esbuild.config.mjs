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
  define: {
    "process.env.NODE_ENV": watch ? '"development"' : '"production"',
    __BACKEND_HTTP_URL__: JSON.stringify(process.env.BACKEND_HTTP_URL ?? "http://localhost:8000"),
    __BACKEND_WS_URL__: JSON.stringify(process.env.BACKEND_WS_URL ?? "ws://localhost:8000/ws"),
    // Defaults to the mock transport so local UI iteration keeps working with zero setup;
    // opt into the real backend explicitly with USE_REAL_BACKEND=true.
    __USE_REAL_BACKEND__: JSON.stringify(process.env.USE_REAL_BACKEND === "true"),
  },
};

const contentCtx = await esbuild.context({
  ...shared,
  entryPoints: ["src/content/index.tsx"],
  outfile: "dist/content.js",
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
