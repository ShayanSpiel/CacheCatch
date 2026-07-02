interface MonoCodeProps {
  children: React.ReactNode
  className?: string
}

export function MonoCode({ children, className = "" }: MonoCodeProps) {
  return (
    <code
      className={`rounded-sm border bg-muted px-2 py-0.5 text-sm font-mono text-foreground ${className}`}
    >
      {children}
    </code>
  )
}
