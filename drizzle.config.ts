import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

dotenv.config({ path: '.env' });

if (!process.env.DATABASE_URL_DIRECT) {
  throw new Error('DATABASE_URL_DIRECT is missing from .env');
}

export default defineConfig({
  schema: './src/lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT,
  },
  strict: true,
  verbose: true,
});