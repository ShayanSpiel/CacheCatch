/** Legacy shim — parseProjectUrl moved into the new client */
export function parseProjectUrl(urlOrName: string): {
  projectName: string
  projectUrl?: string
} {
  if (!urlOrName) return { projectName: "Unknown Project" }
  const trimmed = urlOrName.trim()
  try {
    const url = new URL(trimmed)
    if (url.hostname.endsWith(".langchain.com") || url.hostname === "smith.langchain.com" || url.hostname.endsWith(".langsmith.dev") || url.hostname.endsWith(".langsmith.internal.example.com")) {
      const pathParts = url.pathname.split("/")
      const pIndex = pathParts.indexOf("p")
      const projectsIndex = pathParts.indexOf("projects")
      if (pIndex !== -1 && pIndex + 1 < pathParts.length) {
        return {
          projectName: decodeURIComponent(pathParts[pIndex + 1]),
          projectUrl: trimmed,
        }
      }
      if (projectsIndex !== -1 && projectsIndex + 1 < pathParts.length) {
        return {
          projectName: decodeURIComponent(pathParts[projectsIndex + 1]),
          projectUrl: trimmed,
        }
      }
      return { projectName: url.hostname, projectUrl: trimmed }
    }
  } catch {
    // not a URL
  }
  return { projectName: trimmed }
}
