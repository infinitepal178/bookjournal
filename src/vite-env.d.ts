/// <reference types="vite/client" />

declare module '*/fake-github.mjs' {
  export function createFakeGitHub(opts?: { owner?: string; repo?: string; files?: Record<string, string>; isPrivate?: boolean; empty?: boolean }): {
    fetch: typeof fetch;
    handle: (method: string, url: string, body: string | null, headers?: Record<string, string>) => { status: number; body: string; contentType: string };
    file: (path: string) => string | null;
    paths: () => string[];
    write: (path: string, content: string, message?: string) => void;
    failNextRefUpdate: (times?: number) => void;
    commitMessages: () => string[];
  };
}
