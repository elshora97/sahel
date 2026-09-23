/** Whether following `href` should ask "Discard unsaved changes?". In-page anchors never ask. */
export function needsLeavePrompt(dirty: boolean, href: string): boolean {
  return dirty && !href.startsWith("#");
}
