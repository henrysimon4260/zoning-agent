import { grokConfigured } from "@/lib/llm";
import { rateLimitResponse } from "@/lib/rate-limit";
import { supabasePublicConfig } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const limited = rateLimitResponse(request);
  if (limited) return limited;
  return NextResponse.json({
    llm: grokConfigured(),
    auth: Boolean(supabasePublicConfig()),
  });
}
