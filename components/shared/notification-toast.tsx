"use client"

import * as React from "react"
import { RiCheckLine, RiInformationLine, RiCloseLine } from "@/components/icons/remixicon"

interface Toast {
  id: string
  message: string
  type?: "success" | "info"
}

interface NotificationContextValue {
  notify: (message: string, type?: "success" | "info") => void
}

const NotificationContext = React.createContext<NotificationContextValue | null>(null)

export function useNotify() {
  const ctx = React.useContext(NotificationContext)
  if (!ctx) throw new Error("useNotify must be used within NotificationProvider")
  return ctx.notify
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const notify = React.useCallback(
    (message: string, type: "success" | "info" = "success") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setToasts((prev) => [...prev, { id, message, type }])
    },
    []
  )

  const remove = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={remove} />
        ))}
      </div>
    </NotificationContext.Provider>
  )
}

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast
  onRemove: (id: string) => void
}) {
  React.useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 3000)
    return () => clearTimeout(timer)
  }, [toast.id, onRemove])

  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground shadow-lg">
      {toast.type === "info" ? (
        <RiInformationLine className="size-4 text-muted-foreground" />
      ) : (
        <RiCheckLine className="size-4 text-foreground" />
      )}
      <span>{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="-mr-1 ml-2 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Dismiss"
      >
        <RiCloseLine className="size-3.5" />
      </button>
    </div>
  )
}
