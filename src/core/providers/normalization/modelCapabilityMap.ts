/**
 * Model capability mapping - diferentes modelos têm diferentes capacidades
 */

export interface ModelCapabilities {
  readonly supportsThinking: boolean;
  readonly supportsToolCalling: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsVision: boolean;
  readonly maxTokens: number;
  readonly temperatureRange: readonly [number, number];
  readonly vendor: "anthropic" | "openai" | "google" | "unknown";
}

/**
 * Capability map por modelo
 */
export const MODEL_CAPABILITY_MAP: Record<string, ModelCapabilities> = {
  // Anthropic models
  "anthropic/claude-opus-4-7": {
    supportsThinking: true,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
    maxTokens: 200000,
    temperatureRange: [0, 1],
    vendor: "anthropic",
  },
  "anthropic/claude-sonnet-4-6": {
    supportsThinking: true,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
    maxTokens: 200000,
    temperatureRange: [0, 1],
    vendor: "anthropic",
  },
  "anthropic/claude-haiku-4-5": {
    supportsThinking: false,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
    maxTokens: 200000,
    temperatureRange: [0, 1],
    vendor: "anthropic",
  },

  // OpenAI models
  "openai/gpt-5.4": {
    supportsThinking: false,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
    maxTokens: 128000,
    temperatureRange: [0, 2],
    vendor: "openai",
  },
  "openai/o-3": {
    supportsThinking: false,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
    maxTokens: 128000,
    temperatureRange: [1, 1], // ⚠️ O-series REQUIRES temperature=1
    vendor: "openai",
  },

  // Google models
  "gemini-2.5-pro": {
    supportsThinking: false,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
    maxTokens: 1000000,
    temperatureRange: [0, 2],
    vendor: "google",
  },
  "gemini-2.5-flash": {
    supportsThinking: false,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
    maxTokens: 1000000,
    temperatureRange: [0, 2],
    vendor: "google",
  },
};

/**
 * Get capabilities para um modelo
 */
export function getModelCapabilities(
  model: string,
): ModelCapabilities | undefined {
  return MODEL_CAPABILITY_MAP[model];
}

/**
 * Validate temperatura para um modelo
 */
export function validateTemperature(
  model: string,
  temperature: number,
): boolean {
  const capabilities = getModelCapabilities(model);
  if (!capabilities) {
    return true; // Unknown model, assume valid
  }

  const [min, max] = capabilities.temperatureRange;
  return temperature >= min && temperature <= max;
}

/**
 * Get temperatura default para um modelo
 */
export function getDefaultTemperature(model: string): number {
  const capabilities = getModelCapabilities(model);
  if (!capabilities) {
    return 0.7; // Default global
  }

  // O-series models require temperature=1
  if (model.includes("openai/o-")) {
    return 1;
  }

  // Use middle of range
  const [min, max] = capabilities.temperatureRange;
  return (min + max) / 2;
}
