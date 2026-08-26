// Injected at build time by esbuild.config.mjs's `define`, from the BACKEND_HTTP_URL /
// BACKEND_WS_URL env vars — see rules.md §4 (environment-specific URLs must not be hardcoded).
declare const __BACKEND_HTTP_URL__: string;
declare const __BACKEND_WS_URL__: string;
declare const __USE_REAL_BACKEND__: boolean;

export const BACKEND_HTTP_URL = __BACKEND_HTTP_URL__;
export const BACKEND_WS_URL = __BACKEND_WS_URL__;
export const USE_REAL_BACKEND = __USE_REAL_BACKEND__;
