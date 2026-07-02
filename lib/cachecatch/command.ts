export function buildCliCommand(project: string, window: string): string {
  const projectArg = project
    ? `--project "${project}"`
    : "--project \"your-project\""
  return `npx cachecatch audit ${projectArg} --window ${window} --provider langsmith`
}
