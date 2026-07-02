"use client"

import { CopyButton } from "@/components/shared/copy-button"
import { RiTerminalLine } from "@/components/icons/remixicon"

interface CommandBoxProps {
  command: string
}

export function CommandBox({ command }: CommandBoxProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2.5 text-card-foreground">
      <RiTerminalLine className="size-4 shrink-0 text-muted-foreground" />
      <code className="flex-1 truncate font-mono text-xs text-foreground">
        {command}
      </code>
      <CopyButton text={command} label="Copy" variant="ghost" size="sm" />
    </div>
  )
}
