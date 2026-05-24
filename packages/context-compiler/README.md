# Korix Context Compiler

`@korix/context-compiler` is the standalone workspace context compiler used by the Korix VSCode extension. It owns plain TypeScript contracts, provider formatting, the TypeScript fallback compiler and the optional Rust/napi-rs native backend.

The package must not import `vscode`. The extension is responsible for collecting editor signals and passing plain request data into this package.

## Package Setup

Install workspace dependencies from the repository root:

```bash
pnpm install --no-frozen-lockfile
```

Useful package checks:

```bash
pnpm --filter @korix/context-compiler typecheck
pnpm exec vitest run src/context/__tests__/contextCompilerPackage.test.ts
```

The public entrypoint is `packages/context-compiler/src/index.ts`. Extension code should consume the package through `@korix/context-compiler`, not through deep relative imports.

## Native Setup

The native backend lives in `packages/context-compiler/native` and is built with napi-rs.

Build the local native artifact:

```bash
pnpm --filter @korix/context-compiler native:build
```

Run native tests:

```bash
cargo test --manifest-path packages/context-compiler/native/Cargo.toml
```

Build the extension with any available native artifacts copied into `dist/native`:

```bash
pnpm run compile
```

`pnpm run compile` writes `dist/native/context-compiler-native-manifest.json` when at least one supported `.node` artifact is copied. The manifest lists copied artifacts, supported targets and copied artifact byte counts for VSIX size diagnostics. If no native artifact is present, the extension still builds and uses the TypeScript fallback at runtime.

## Packaging

Local VSIX packaging should use the root scripts:

```bash
pnpm run build:native
pnpm run compile
pnpm run package
```

Release CI builds every supported native target, assembles `darwin-universal`, downloads all `context-compiler-*` artifacts into `packages/context-compiler/native`, runs `pnpm run compile`, verifies the native manifest and uploads a single VSIX artifact.

The current release policy is one VSIX containing all available native artifacts. Use `totalArtifactBytes` in the native manifest to decide whether artifact size justifies per-platform VSIX packaging later.

## Runtime Loading

`createContextCompiler()` tries to load a native module for the current platform and falls back to `FallbackContextCompiler` when no complete native module is available.

## Cache Metadata

The TypeScript package exposes `CONTEXT_COMPILER_CACHE_STRATEGY` and `createContextCacheSnapshot()` for persistence code. The current TypeScript fallback content hash is `fnv1a32-utf16`; it is a local cache key component, not a cross-backend checksum. Native persistence must either use its own versioned hash strategy or explicitly migrate to a shared hash contract.

## Quality Benchmarks

Use `runContextQualityBenchmarkFixtures()` to turn a versioned set of local benchmark fixtures into a deterministic pass/fail report. Each fixture supplies a `ContextIR`, required evidence expectations and optional observed baseline/compiled outcomes. The report includes per-fixture samples, aggregate token savings, evidence coverage, context value per token and failed fixture ids.

Expected runtime artifact names:

- `index.darwin-arm64.node`
- `index.darwin-universal.node`
- `index.darwin-x64.node`
- `index.linux-arm64-gnu.node`
- `index.linux-arm64-musl.node`
- `index.linux-x64-gnu.node`
- `index.linux-x64-musl.node`
- `index.win32-arm64-msvc.node`
- `index.win32-x64-msvc.node`

Darwin arm64/x64 loads the platform artifact first, then falls back to `index.darwin-universal.node`.

## Troubleshooting

### Native artifact is missing

Run:

```bash
pnpm --filter @korix/context-compiler native:build
pnpm run compile
cat dist/native/context-compiler-native-manifest.json
```

If the manifest is absent, no supported native artifact was copied. Runtime should still use the TypeScript fallback.

### Native module does not load

Check that the artifact name matches one of the supported targets and that it exists in either `dist/native` after compile or `packages/context-compiler/native` during local development.

Run the focused native boundary tests:

```bash
pnpm exec vitest run src/context/__tests__/contextCompilerNative.test.ts
```

### CI cross-compile fails

The workflow target matrix is in `.github/workflows/context-compiler-native.yml` and must stay aligned with `NATIVE_CONTEXT_COMPILER_TARGETS` in `src/nativeTargets.ts`.

Run:

```bash
pnpm exec vitest run src/context/__tests__/contextCompilerNativeWorkflow.test.ts
```

If Linux musl or arm64 targets fail in CI, inspect the `napi build` flags for that matrix row before changing the supported target list.

### VSIX does not include native files

Run `pnpm run compile` before `pnpm run package` and check that `dist/native/context-compiler-native-manifest.json` lists copied artifacts. The CI packaging job performs this manifest check before calling `vsce package --no-dependencies`.

### TypeScript fallback behaves differently from native

Run both suites:

```bash
cargo test --manifest-path packages/context-compiler/native/Cargo.toml
pnpm exec vitest run src/context/__tests__/contextCompilerPackage.test.ts src/context/__tests__/contextCompilerNative.test.ts
```

Keep fallback behavior deterministic and conservative. It should preserve extension functionality when native loading fails, even if native semantic extraction is richer.
