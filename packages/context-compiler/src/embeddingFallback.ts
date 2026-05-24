import type {
  EmbeddingFallbackMatch,
  EmbeddingFallbackRequest,
} from "./types";

function magnitude(vector: readonly number[]): number {
  return Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
}

function isFiniteVector(vector: readonly number[]): boolean {
  return vector.every(Number.isFinite);
}

function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number | undefined {
  if (left.length === 0 || left.length !== right.length) {
    return undefined;
  }

  if (!isFiniteVector(left) || !isFiniteVector(right)) {
    return undefined;
  }

  const leftMagnitude = magnitude(left);
  const rightMagnitude = magnitude(right);
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return undefined;
  }

  const dot = left.reduce(
    (total, value, index) => total + value * (right[index] ?? 0),
    0,
  );

  return dot / (leftMagnitude * rightMagnitude);
}

export function rankEmbeddingFallback(
  request: EmbeddingFallbackRequest,
): readonly EmbeddingFallbackMatch[] {
  const maxResults = Math.max(0, request.maxResults ?? 10);
  const minScore = request.minScore ?? -1;

  if (maxResults === 0) {
    return [];
  }

  return request.candidates
    .flatMap((candidate) => {
      const score = cosineSimilarity(request.queryVector, candidate.vector);
      if (score === undefined || score < minScore) {
        return [];
      }

      return [
        {
          id: candidate.id,
          path: candidate.path,
          score,
          metadata: candidate.metadata,
          reasons: [{ code: "embedding_similarity" }],
        },
      ];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults);
}
