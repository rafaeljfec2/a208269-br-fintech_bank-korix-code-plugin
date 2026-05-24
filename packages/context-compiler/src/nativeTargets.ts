export const NATIVE_CONTEXT_COMPILER_TARGETS = [
  "darwin-arm64",
  "darwin-universal",
  "darwin-x64",
  "linux-arm64-gnu",
  "linux-arm64-musl",
  "linux-x64-gnu",
  "linux-x64-musl",
  "win32-arm64-msvc",
  "win32-x64-msvc",
] as const;

export type NativeContextCompilerTarget =
  (typeof NATIVE_CONTEXT_COMPILER_TARGETS)[number];

export interface NativeTargetEnvironment {
  readonly platform: string;
  readonly arch: string;
  readonly glibcVersionRuntime?: unknown;
}

export function nativeArtifactName(
  target: NativeContextCompilerTarget,
): string {
  return `index.${target}.node`;
}

export function getNativeArtifactCandidates(
  target: NativeContextCompilerTarget,
): readonly string[] {
  const primary = nativeArtifactName(target);
  if (target === "darwin-arm64" || target === "darwin-x64") {
    return [primary, nativeArtifactName("darwin-universal")];
  }

  return [primary];
}

export function getNativeTarget(
  environment: NativeTargetEnvironment,
): NativeContextCompilerTarget | undefined {
  if (environment.platform === "darwin") {
    if (environment.arch === "arm64") {
      return "darwin-arm64";
    }
    if (environment.arch === "x64") {
      return "darwin-x64";
    }
    return undefined;
  }

  if (environment.platform === "win32") {
    if (environment.arch === "arm64") {
      return "win32-arm64-msvc";
    }
    if (environment.arch === "x64") {
      return "win32-x64-msvc";
    }
    return undefined;
  }

  if (environment.platform === "linux") {
    const libc = environment.glibcVersionRuntime === undefined ? "musl" : "gnu";
    if (environment.arch === "arm64") {
      return `linux-arm64-${libc}`;
    }
    if (environment.arch === "x64") {
      return `linux-x64-${libc}`;
    }
  }

  return undefined;
}
