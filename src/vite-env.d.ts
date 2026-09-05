/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When set, the storefront binds to the real server API (see src/lib/server-api.ts). */
  readonly VITE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
