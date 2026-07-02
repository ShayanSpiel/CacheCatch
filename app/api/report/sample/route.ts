import { NextResponse } from "next/server"
import { sampleReport } from "@/lib/cachecatch/sample-data"

export async function GET() {
  return NextResponse.json(sampleReport)
}
