import { Button } from "@/components/ui/button"
import { RiFileSearchLine, RiArrowLeftLine, RiFileTextLine } from "@/components/icons/remixicon"
import Link from "next/link"

export function EmptyState() {
  return (
    <div className="mx-auto max-w-md px-5 py-20 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-xl border bg-card text-card-foreground shadow-xs">
        <RiFileSearchLine className="size-6 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-xl font-medium tracking-tight text-foreground">
        Report not found
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This report has expired or does not exist. Reports are stored
        temporarily in your browser session.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/">
          <Button variant="outline" className="gap-2">
            <RiArrowLeftLine className="size-4" />
            Run a new audit
          </Button>
        </Link>
        <Link href="/report/sample">
          <Button className="gap-2">
            <RiFileTextLine className="size-4" />
            View sample report
          </Button>
        </Link>
      </div>
    </div>
  )
}
