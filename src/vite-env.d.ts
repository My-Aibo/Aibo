/// <reference types="vite/client" />

interface ImportMeta {
  readonly env: {
    readonly VITE_HELIUS_API_KEY: string | undefined;
    readonly [key: string]: string | boolean | undefined;
  };
}
