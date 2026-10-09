import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // In the browser, omit baseURL so Better Auth uses window.location.origin dynamically,
  // preventing port mismatch issues across different dev environments or host configurations.
  baseURL: typeof window !== "undefined" ? undefined : (process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || undefined),
});

export const { signIn, signUp, signOut, useSession } = authClient;
