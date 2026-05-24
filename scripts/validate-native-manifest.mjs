import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const manifestPath =
  process.argv[2] ?? "dist/native/context-compiler-native-manifest.json";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeTargetsPath = resolve(
  repositoryRoot,
  "packages/context-compiler/src/nativeTargets.ts",
);

function fail(message) {
  throw new Error(message);
}

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), manifestPath), "utf8"),
);
const nativeTargetsSource = readFileSync(nativeTargetsPath, "utf8");
const nativeTargetsMatch = nativeTargetsSource.match(
  /NATIVE_CONTEXT_COMPILER_TARGETS = \[(?<targets>[\s\S]*?)\] as const;/,
);
if (nativeTargetsMatch?.groups?.targets === undefined) {
  fail("Native supported target source could not be read");
}
const supportedTargetSet = new Set(
  Array.from(nativeTargetsMatch.groups.targets.matchAll(/"([^"]+)"/g)).map(
    (match) => match[1],
  ),
);

if (
  !Array.isArray(manifest.copiedArtifacts) ||
  manifest.copiedArtifacts.length === 0
) {
  fail("No native artifacts copied into VSIX staging");
}

if (
  !Array.isArray(manifest.supportedTargets) ||
  manifest.copiedArtifacts.length !== manifest.supportedTargets.length
) {
  fail("Native artifact count does not match supported target count");
}

const expectedArtifacts = new Set();
for (const target of manifest.supportedTargets) {
  if (typeof target !== "string" || target.length === 0) {
    fail("Native supported target is invalid");
  }
  if (!supportedTargetSet.has(target)) {
    fail(`Native supported target is unknown: ${target}`);
  }
  expectedArtifacts.add(`index.${target}.node`);
}

const copiedArtifacts = new Set(manifest.copiedArtifacts);
if (copiedArtifacts.size !== manifest.copiedArtifacts.length) {
  fail("Native artifact list contains duplicates");
}

for (const artifact of manifest.copiedArtifacts) {
  if (!expectedArtifacts.has(artifact)) {
    fail(`Native artifact is not supported: ${artifact}`);
  }
}

if (
  !Array.isArray(manifest.copiedArtifactBytes) ||
  manifest.copiedArtifactBytes.length !== manifest.copiedArtifacts.length
) {
  fail("Native artifact byte diagnostics are incomplete");
}

if (
  !Number.isFinite(manifest.totalArtifactBytes) ||
  manifest.totalArtifactBytes <= 0
) {
  fail("Native artifact total byte count is missing");
}

const byteEntries = new Map(
  manifest.copiedArtifactBytes.map((artifact) => [
    artifact.name,
    artifact.bytes,
  ]),
);

if (byteEntries.size !== manifest.copiedArtifactBytes.length) {
  fail("Native artifact byte diagnostics contain duplicates");
}

let totalArtifactBytes = 0;
for (const artifact of manifest.copiedArtifacts) {
  const bytes = byteEntries.get(artifact);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    fail(`Native artifact byte count missing for ${artifact}`);
  }
  totalArtifactBytes += bytes;
}

if (totalArtifactBytes !== manifest.totalArtifactBytes) {
  fail("Native artifact total byte count does not match copied artifacts");
}
