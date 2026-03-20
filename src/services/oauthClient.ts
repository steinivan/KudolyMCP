import { randomBytes, createHash } from 'crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import { dirname } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
}

interface TokenCache {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

interface PendingAuthorization {
  state: string;
  codeVerifier: string;
  authorizeUrl: string;
  redirectUri: string;
  elicitationId: string;
  createdAt: number;
}

export interface KudolyOAuthClientOptions {
  clientId: string;
  redirectPort?: number;
  tokenCacheFile?: string;
  authTimeoutMs?: number;
}

const DEFAULT_AUTH_TIMEOUT_MS = 3 * 60 * 1000;
const DEFAULT_TOKEN_CACHE_FILE = `${homedir()}/.kudoly/mcp-oauth.json`;
const ACCESS_TOKEN_GRACE_MS = 60 * 1000;
const KUDOLY_PRODUCTION_BASE_URL = 'https://www.kudolyai.com';

export class KudolyOAuthElicitationRequiredError extends Error {
  constructor(
    public readonly url: string,
    public readonly elicitationId: string,
    message = 'Necesitas autenticarte con Kudoly para continuar.'
  ) {
    super(message);
    this.name = 'KudolyOAuthElicitationRequiredError';
  }
}

function randomBase64Url(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

function createCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export class KudolyOAuthClient {
  private readonly clientId: string;
  private readonly redirectPort: number;
  private readonly tokenCacheFile: string;
  private readonly authTimeoutMs: number;

  private cache: TokenCache | null = null;
  private callbackReadyPromise: Promise<string> | null = null;
  private pendingAuthorization: PendingAuthorization | null = null;

  constructor(options: KudolyOAuthClientOptions) {
    if (!options.clientId) {
      throw new Error('KUDOLY_OAUTH_CLIENT_ID is required');
    }

    this.clientId = options.clientId;
    this.redirectPort = options.redirectPort ?? 0;
    this.tokenCacheFile = options.tokenCacheFile || DEFAULT_TOKEN_CACHE_FILE;
    this.authTimeoutMs = options.authTimeoutMs || DEFAULT_AUTH_TIMEOUT_MS;
  }

  async getAccessToken(): Promise<string> {
    const cached = this.loadCache();
    if (cached && this.isTokenFresh(cached)) {
      return cached.access_token;
    }

    if (cached?.refresh_token) {
      try {
        const refreshed = await this.refreshAccessToken(cached.refresh_token);
        this.persistCache(refreshed);
        return refreshed.access_token;
      } catch (error) {
        console.error('[kudoly-mcp] Failed to refresh OAuth token, waiting for a new authorization.', error);
      }
    }

    const pendingAuthorization = await this.getOrCreatePendingAuthorization();
    throw new KudolyOAuthElicitationRequiredError(
      pendingAuthorization.authorizeUrl,
      pendingAuthorization.elicitationId
    );
  }

  private isTokenFresh(cache: TokenCache): boolean {
    return cache.expires_at - Date.now() > ACCESS_TOKEN_GRACE_MS;
  }

  private loadCache(): TokenCache | null {
    if (this.cache) {
      return this.cache;
    }

    if (!existsSync(this.tokenCacheFile)) {
      return null;
    }

    try {
      const raw = readFileSync(this.tokenCacheFile, 'utf-8');
      const parsed = JSON.parse(raw) as TokenCache;
      if (!parsed?.access_token || !parsed?.expires_at) {
        return null;
      }
      this.cache = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  private persistCache(tokenResponse: OAuthTokenResponse): void {
    const cache: TokenCache = {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: Date.now() + tokenResponse.expires_in * 1000
    };

    this.cache = cache;

    const parentDir = dirname(this.tokenCacheFile);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    writeFileSync(this.tokenCacheFile, JSON.stringify(cache, null, 2), 'utf-8');
  }

  private async getOrCreatePendingAuthorization(): Promise<PendingAuthorization> {
    const now = Date.now();

    if (this.pendingAuthorization && now - this.pendingAuthorization.createdAt < this.authTimeoutMs) {
      return this.pendingAuthorization;
    }

    this.pendingAuthorization = null;

    const redirectUri = await this.getRedirectUri();
    const codeVerifier = randomBase64Url(64);
    const codeChallenge = createCodeChallenge(codeVerifier);
    const state = randomBase64Url(32);
    const elicitationId = randomBase64Url(24);

    const authorizeUrl = new URL('/api/oauth/mcp/authorize', KUDOLY_PRODUCTION_BASE_URL);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', this.clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    this.pendingAuthorization = {
      state,
      codeVerifier,
      authorizeUrl: authorizeUrl.toString(),
      redirectUri,
      elicitationId,
      createdAt: now
    };

    return this.pendingAuthorization;
  }

  private async getRedirectUri(): Promise<string> {
    if (this.callbackReadyPromise) {
      return this.callbackReadyPromise;
    }

    this.callbackReadyPromise = new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handleCallbackRequest(req, res);
      });

      server.once('error', reject);
      server.listen(this.redirectPort, '127.0.0.1', () => {
        const serverAddress = server.address() as AddressInfo;
        resolve(`http://127.0.0.1:${serverAddress.port}/callback`);
      });
    });

    return this.callbackReadyPromise;
  }

  private async handleCallbackRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    if (requestUrl.pathname !== '/callback') {
      this.respondHtml(res, 404, '<h1>No encontrado</h1>');
      return;
    }

    const pending = this.pendingAuthorization;
    if (!pending || Date.now() - pending.createdAt > this.authTimeoutMs) {
      this.pendingAuthorization = null;
      this.respondHtml(res, 400, '<h1>OAuth expirado</h1><p>Solicita autenticacion de nuevo desde el cliente MCP.</p>');
      return;
    }

    const oauthError = requestUrl.searchParams.get('error');
    if (oauthError) {
      const description = requestUrl.searchParams.get('error_description');
      this.pendingAuthorization = null;
      this.respondHtml(res, 400, '<h1>OAuth cancelado</h1><p>Podes volver al cliente e intentarlo nuevamente.</p>');
      console.error('[kudoly-mcp] OAuth authorization cancelled', description || oauthError);
      return;
    }

    const code = requestUrl.searchParams.get('code');
    const returnedState = requestUrl.searchParams.get('state');
    if (!code || !returnedState) {
      this.respondHtml(res, 400, '<h1>OAuth invalido</h1><p>Falta code o state en el callback.</p>');
      return;
    }

    if (returnedState !== pending.state) {
      this.pendingAuthorization = null;
      this.respondHtml(res, 400, '<h1>OAuth invalido</h1><p>El estado de la autenticacion no coincide.</p>');
      return;
    }

    try {
      const tokenResponse = await this.exchangeToken({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        redirect_uri: pending.redirectUri,
        code,
        code_verifier: pending.codeVerifier
      });

      this.persistCache(tokenResponse);
      this.pendingAuthorization = null;
      this.respondHtml(res, 200, '<h1>Kudoly conectado</h1><p>Podes volver al asistente.</p>');
    } catch (tokenError) {
      this.pendingAuthorization = null;
      this.respondHtml(res, 500, '<h1>OAuth fallo</h1><p>No se pudo completar el login. Reintenta desde el cliente.</p>');
      console.error('[kudoly-mcp] Failed to exchange OAuth code', tokenError);
    }
  }

  private respondHtml(res: ServerResponse, statusCode: number, html: string): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  }

  private async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    return this.exchangeToken({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      refresh_token: refreshToken
    });
  }

  private async exchangeToken(payload: Record<string, string>): Promise<OAuthTokenResponse> {
    const tokenUrl = new URL('/api/oauth/mcp/token', KUDOLY_PRODUCTION_BASE_URL);
    const body = new URLSearchParams(payload).toString();

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const description = data?.error_description || data?.error || `OAuth token exchange failed (${response.status})`;
      throw new Error(description);
    }

    if (!data?.access_token || typeof data?.expires_in !== 'number') {
      throw new Error('OAuth token response is missing required fields');
    }

    return data as OAuthTokenResponse;
  }
}
