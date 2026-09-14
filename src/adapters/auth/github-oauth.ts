export interface GithubIdentity {
  readonly githubUserId: number;
  readonly githubLogin: string;
  readonly email: string | null;
  readonly displayName: string | null;
}

export interface GithubOAuthClient {
  buildAuthorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<GithubIdentity>;
}

export interface GithubOAuthOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scopes: string;
  readonly fetchImpl?: typeof fetch;
}

type AccessTokenResponse = {
  readonly access_token?: string;
  readonly error?: string;
};

type GithubUserResponse = {
  readonly id?: number;
  readonly login?: string;
  readonly name?: string | null;
  readonly email?: string | null;
};

type GithubEmailResponse = {
  readonly email?: string;
  readonly primary?: boolean;
  readonly verified?: boolean;
};

export function createGithubOAuthClient(
  options: GithubOAuthOptions,
): GithubOAuthClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    buildAuthorizeUrl(state: string): string {
      const url = new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id", options.clientId);
      url.searchParams.set("scope", options.scopes);
      url.searchParams.set("state", state);
      return url.toString();
    },

    async exchangeCode(code: string): Promise<GithubIdentity> {
      const tokenResponse = await fetchImpl(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            client_id: options.clientId,
            client_secret: options.clientSecret,
            code,
          }),
        },
      );
      if (!tokenResponse.ok) {
        throw new Error("GitHub OAuth code exchange failed");
      }
      const token = (await tokenResponse.json()) as AccessTokenResponse;
      if (token.access_token === undefined) {
        throw new Error(
          "GitHub OAuth response did not include an access token",
        );
      }

      const userResponse = await fetchImpl("https://api.github.com/user", {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token.access_token}`,
        },
      });
      if (!userResponse.ok) {
        throw new Error("GitHub user lookup failed");
      }
      const user = (await userResponse.json()) as GithubUserResponse;
      if (typeof user.id !== "number" || typeof user.login !== "string") {
        throw new Error("GitHub user response was incomplete");
      }

      const email =
        user.email ?? (await fetchPrimaryEmail(fetchImpl, token.access_token));

      return {
        githubUserId: user.id,
        githubLogin: user.login,
        email,
        displayName: user.name ?? null,
      };
    },
  };
}

async function fetchPrimaryEmail(
  fetchImpl: typeof fetch,
  accessToken: string,
): Promise<string | null> {
  const response = await fetchImpl("https://api.github.com/user/emails", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    return null;
  }
  const emails = (await response.json()) as GithubEmailResponse[];
  if (!Array.isArray(emails)) {
    return null;
  }
  const primary = emails.find(
    (entry) => entry.primary === true && entry.verified === true,
  );
  return primary?.email ?? null;
}
