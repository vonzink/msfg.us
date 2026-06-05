// No-op stub for the `server-only` package under Vitest. The real package
// exports a module that throws when bundled outside a React Server Component
// context; in unit tests we only import server modules to exercise their pure
// logic, so this empty module satisfies `import "server-only"` harmlessly.
export {};
