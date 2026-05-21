export function createPathMatcher(
  pattern: string,
): (filePath: string) => boolean {
  const regex = buildPatternRegex(pattern);

  return (filePath: string) => {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const fileName = normalizedPath.split("/").pop() ?? normalizedPath;
    return regex.test(normalizedPath) || regex.test(fileName);
  };
}

function buildPatternRegex(pattern: string): RegExp {
  if (isGlobPattern(pattern)) {
    return globToRegex(pattern);
  }

  try {
    return new RegExp(pattern, "i");
  } catch {
    return new RegExp(escapeRegex(pattern), "i");
  }
}

function isGlobPattern(pattern: string): boolean {
  return /[*?[\]{}]/.test(pattern);
}

function globToRegex(pattern: string): RegExp {
  let source = "";

  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*" && next === "*") {
      source += ".*";
      index++;
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegex(char ?? "");
  }

  return new RegExp(`^${source}$`, "i");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
