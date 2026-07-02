"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { RiCheckLine, RiFileCopyLine } from "@/components/icons/remixicon"

interface CopyButtonProps {
  text: string
  label?: string
  variant?: "default" | "outline" | "ghost" | "secondary"
  className?: string
}

export function CopyButton({
  text,
  label = "Copy",
  variant = "outline",
  size = "sm",
  className = "",
}: CopyButtonProps & { size?: "default" | "sm" | "lg" | "icon" }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCopy}
      className={className}
    >
      {copied ? (
        <RiCheckLine className="size-3.5" />
      ) : (
        <RiFileCopyLine className="size-3.5" />
      )}
      {copied ? "Copied" : label}
    </Button>
  )
}
