import { parsePublicEnv } from './env-schema';

// NEXT_PUBLIC_* подставляются при сборке только при обращении по точному имени (`process.env.NEXT_PUBLIC_X`),
// поэтому передаём их явно, а не весь process.env.
export const publicEnv = parsePublicEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
