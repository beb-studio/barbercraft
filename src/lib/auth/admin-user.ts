import "server-only";
import { auth } from "@/lib/auth/auth";

export interface CreateAdministrativeUserInput {
  email: string;
  password: string;
  name: string;
  emailVerified?: boolean;
}

export interface CreateAdministrativeUserResult {
  id: string;
  email: string;
  name: string;
}

/**
 * Creates a Better Auth identity and credential account from a trusted server-side context
 * (platform provisioning, staff invitation, QA bootstrap) without relying on the public
 * signUpEmail endpoint which is disabled to prevent unauthenticated public self-registration.
 */
export async function createAdministrativeUser(
  input: CreateAdministrativeUserInput
): Promise<CreateAdministrativeUserResult> {
  const normalizedEmail = input.email.toLowerCase().trim();
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(input.password);

  const createdUser = await ctx.internalAdapter.createUser(
    {
      email: normalizedEmail,
      name: input.name,
      emailVerified: input.emailVerified ?? true,
    },
    { method: "admin" }
  );

  if (!createdUser) {
    throw new Error("Failed to create administrative user record");
  }

  await ctx.internalAdapter.linkAccount({
    userId: createdUser.id,
    providerId: "credential",
    accountId: createdUser.id,
    password: passwordHash,
  });

  return {
    id: createdUser.id,
    email: createdUser.email,
    name: createdUser.name,
  };
}
