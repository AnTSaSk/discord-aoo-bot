import { readFileSync } from 'fs';

/**
 * Read a secret from file (Docker secrets) or environment variable.
 * Docker secrets are mounted at /run/secrets/<secret_name>
 *
 * @param envVar - Environment variable name (e.g., APP_BOT_TOKEN)
 * @returns The secret value or undefined
 */
export function getSecret(envVar: string): string | undefined {
  const fileVar = `${envVar}_FILE`;

  // Try to read from file first (Docker secrets)
  if (process.env[fileVar]) {
    try {
      return readFileSync(process.env[fileVar], 'utf8').trim();
    } catch (error) {
      // eslint-disable-next-line no-console -- Logger not available at this level
      console.error(`Failed to read secret from ${process.env[fileVar] ?? 'unknown'}:`, (error as Error).message);
    }
  }

  // Fall back to environment variable (local development)
  return process.env[envVar];
}

/**
 * Get a required secret, throwing an error if not found.
 *
 * @param envVar - Environment variable name
 * @param description - Human-readable description for error message
 * @returns The secret value
 * @throws Error if secret is not found
 */
export function getRequiredSecret(envVar: string, description: string): string {
  const value = getSecret(envVar);

  if (!value) {
    throw new Error(`Missing required secret: ${description}. Set ${envVar} or ${envVar}_FILE`);
  }

  return value;
}
