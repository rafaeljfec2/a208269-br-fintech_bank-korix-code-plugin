/**
 * Auth transport - injects authentication headers
 *
 * IMPORTANTE: LiteLLM TR requer Authorization: Bearer ao invés de x-api-key
 * Sending x-api-key to TR LiteLLM often yields a generic HTML 403 from the edge.
 */

import type { Transport, TransportRequestOptions } from "./httpTransport";

export interface AuthConfig {
  readonly header: string;     // "Authorization" para LiteLLM/proxies, "x-api-key" para Anthropic direto
  readonly token: string;
}

/**
 * Auth transport middleware - injeta header de autenticação
 */
export class AuthTransport implements Transport {
  constructor(
    private readonly inner: Transport,
    private readonly config: AuthConfig,
  ) {}

  async request(
    url: string,
    options: TransportRequestOptions,
    signal?: AbortSignal,
  ): Promise<Response> {
    const headers = { ...options.headers };

    // LiteLLM e proxies esperam Authorization: Bearer
    // API Anthropic direta usa x-api-key
    if (this.config.header === "Authorization") {
      headers["Authorization"] = `Bearer ${this.config.token}`;
    } else {
      headers[this.config.header] = this.config.token;
    }

    return this.inner.request(
      url,
      { ...options, headers },
      signal,
    );
  }
}
