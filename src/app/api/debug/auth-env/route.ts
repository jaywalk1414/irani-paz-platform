
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    hasAuthSecret: Boolean(process.env.AUTH_SECRET),
    authSecretLength: process.env.AUTH_SECRET?.length ?? 0,
    hasAuthUrl: Boolean(process.env.AUTH_URL),
    nodeEnv: process.env.NODE_ENV,
  });
}
