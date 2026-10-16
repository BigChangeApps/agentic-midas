// The work item being drafted, as a Claude Doc. The band above the prompt acts on it.
export type Draft = {
  type: 'Bug' | 'Enabler' | 'User Story'
  title: string
  url: string
  // A new item, once created.
  createdId?: number
  // An existing item being refined, and whether the update is saved.
  id?: number
  updated?: boolean
}

declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__agentic-midas__draft_work_item': Draft
  }

  interface PluginState {
    'agentic-midas': { draft: Draft | null }
  }
}
