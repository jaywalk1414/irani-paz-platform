import { config } from 'dotenv';

// Next.js loads .env.local automatically; CLI scripts (tsx) do not.
config({ path: '.env.local' });
config({ path: '.env' });