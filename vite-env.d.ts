/// <reference types="vite/client" />

/**
 * CSS Modules — tells TypeScript that .module.css imports are valid
 * and return a Record of class name strings.
 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

/**
 * Plain CSS files (e.g. global.css) — side-effect imports only
 */
declare module '*.css' {}

/**
 * Environment variables used in this project.
 * All must be prefixed with VITE_ to be exposed to the client.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
