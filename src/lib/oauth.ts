/**
 * OAuth Configuration
 *
 * GitHub and Google OAuth providers using Arctic library.
 * https://arctic.js.org/
 */

import { GitHub, Google, generateState, generateCodeVerifier } from "arctic";

// Environment variables
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// === GitHub OAuth ===
export const github = new GitHub(
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  `${BASE_URL}/api/auth/github/callback`
);

// === Google OAuth ===
export const google = new Google(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  `${BASE_URL}/api/auth/google/callback`
);

// === State Management ===
export function createOAuthState(): { state: string; codeVerifier: string } {
  return {
    state: generateState(),
    codeVerifier: generateCodeVerifier(),
  };
}

// === Provider User Types ===
export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface GoogleUser {
  sub: string;
  name: string;
  email: string;
  picture: string;
  email_verified: boolean;
}

// === Fetch User Profiles ===
export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json() as Promise<GitHubUser>;
}

export async function getGitHubEmails(
  accessToken: string
): Promise<{ email: string; primary: boolean; verified: boolean }[]> {
  const response = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub emails API error: ${response.status}`);
  }

  return response.json() as Promise<{ email: string; primary: boolean; verified: boolean }[]>;
}

export async function getGoogleUser(accessToken: string): Promise<GoogleUser> {
  const response = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Google API error: ${response.status}`);
  }

  return response.json() as Promise<GoogleUser>;
}

// === Validation ===
export function isOAuthConfigured(): {
  github: boolean;
  google: boolean;
} {
  return {
    github: Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
    google: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
  };
}
