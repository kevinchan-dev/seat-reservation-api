import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  REDIS_HOST: z.string(),
  REDIS_PORT: z.string().transform(Number),
  SEAT_HOLD_DURATION_SECONDS: z.string().transform(Number),
  MAX_HOLDS_PER_USER: z.string().transform(Number),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
