import { NextResponse } from "next/server";
import { KBA_QUESTIONS } from "@/lib/vpc/kbaQuestions";

export async function GET() {
  return NextResponse.json({
    questions: KBA_QUESTIONS.map((q) => ({ id: q.id, label: q.label })),
    configured: Boolean(process.env.VPC_KBA_EXPECTED_HASH?.trim()),
  });
}
