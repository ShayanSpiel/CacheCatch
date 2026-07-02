import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { sampleReport } from "@/lib/cachecatch/sample-data"
import { encodeReportId } from "@/lib/storage/report-codec"
import { parseProjectUrl } from "@/lib/langsmith/parse-project"
import { langSmithAdapter } from "@/src/adapters/langsmith"
import { buildReport } from "@/src/engine/report-builder"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const auditSchema = z.object({
  projectUrl: z.string().optional(),
  projectName: z.string().optional(),
  apiKey: z.string().optional(),
  window: z.enum(["24h", "7d", "30d", "1y"]),
  mode: z.enum(["real", "sample"]).optional(),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = auditSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { projectUrl, projectName, apiKey, window, mode } = parsed.data
  const project = projectName || projectUrl || ""

  if (mode === "sample") {
    const id = `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const report = {
      ...sampleReport,
      id,
      createdAt: new Date().toISOString(),
      window,
      projectName: project || sampleReport.projectName,
      projectUrl: projectUrl || sampleReport.projectUrl,
    }

    return NextResponse.json({
      report,
      redirectUrl: `/report/${encodeReportId(report)}`,
    }, {
      headers: { "Cache-Control": "no-store" },
    })
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "LangSmith API key is required for a real audit." },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      }
    )
  }

  if (!project) {
    return NextResponse.json(
      { error: "Project name or URL is required." },
      { status: 400 }
    )
  }

  try {
    const { projectName: parsedProject, projectUrl: parsedUrl } = parseProjectUrl(project)
    const result = await langSmithAdapter.fetchTraces({
      project: parsedProject,
      apiKey,
      window,
    })

    const report = buildReport(result.traces, {
      projectName: result.projectName,
      projectUrl: result.projectUrl ?? parsedUrl,
      window,
      source: "langsmith",
    })

    return NextResponse.json({
      report,
      redirectUrl: `/report/${encodeReportId(report)}`,
    }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred"
    return NextResponse.json(
      { error: message },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    )
  }
}
