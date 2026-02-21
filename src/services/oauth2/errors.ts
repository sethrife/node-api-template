/**
 * OAuth2-specific error with code and provider context
 */
export class OAuth2Error extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'OAuth2Error';
  }
}
