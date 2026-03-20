import { UrlElicitationRequiredError } from '@modelcontextprotocol/sdk/types.js';
import { KudolyOAuthElicitationRequiredError } from '../services/oauthClient.js';

export function maybeThrowOAuthElicitationError(error: unknown): void {
  if (!(error instanceof KudolyOAuthElicitationRequiredError)) {
    return;
  }

  throw new UrlElicitationRequiredError(
    [
      {
        mode: 'url',
        message: error.message,
        url: error.url,
        elicitationId: error.elicitationId
      }
    ],
    error.message
  );
}
