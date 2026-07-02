"use client"

import { CopyButton } from "./copy-button"

interface CommandTerminalProps {
  command: string
  label?: string
}

export function CommandTerminal({ command, label }: CommandTerminalProps) {
  return (
    <div className="rounded-md border bg-card">
      {label && (
        <div className="border-b px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-3">
        <code className="flex-1 truncate font-mono text-sm text-foreground">
          {command}
        </code>
        <CopyButton text={command} label="Copy" />
      </div>
    </div>
  )
}
