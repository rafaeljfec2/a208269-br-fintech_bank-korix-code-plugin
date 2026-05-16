/**
 * Base HTTP transport using fetch
 */

export interface Transport {
  request(
    url: string,
    options: TransportRequestOptions,
    signal?: AbortSignal,
  ): Promise<Response>;
}

export interface TransportRequestOptions {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly timeout?: number;
}

/**
 * Base HTTP transport implementation
 */
export class HttpTransport implements Transport {
  async request(
    url: string,
    options: TransportRequestOptions,
    signal?: AbortSignal,
  ): Promise<Response> {
    return fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal,
    });
  }
}
