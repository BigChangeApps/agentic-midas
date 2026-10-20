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

export type FeaturePhase = 'story' | 'spec' | 'plan' | 'build' | 'review' | 'pr' | 'done'

export type FeatureRepo = { name: string; path: string; base: string; tests?: 'passed' | 'failed' }

export type FeatureCriterion = { text: string; status: 'todo' | 'done' | 'verified'; evidence?: string }

// A choice the spec and acceptance criteria don't settle. Waiting while it has no choice.
export type FeatureDecision = { question: string; choice?: string; why?: string; by?: 'user' | 'claude' }

export type FeaturePr = { repo: string; url: string }

// Set only by the band's gate buttons, never by Claude. `push` is Commit & PR: the user reviewed the uncommitted changes.
export type FeatureApprovals = { spec?: boolean; plan?: boolean; push?: boolean }

// A feature being developed with /feature, kept between sessions.
export type Feature = {
  id: number
  title: string
  root: string
  phase: FeaturePhase
  specUrl?: string
  summaryUrl?: string
  repos: FeatureRepo[]
  ac: FeatureCriterion[]
  decisions: FeatureDecision[]
  prs: FeaturePr[]
  approvals: FeatureApprovals
}

// What Claude sends to feature_status: the id, plus whatever changed.
export type FeatureUpdate = { id: number } & Partial<Omit<Feature, 'id' | 'approvals'>>

export type RepoGit = { name: string; branch: string; changed: number; ahead: number }

declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__agentic-midas__draft_work_item': Draft
    'mcp__agentic-midas__feature_status': FeatureUpdate
  }

  interface PluginState {
    'agentic-midas': {
      draft: Draft | null
      feature: Feature | null
      git: RepoGit[]
      // Repo name (or "outside") -> files Claude edited this session.
      touched: Record<string, string[]>
    }
  }
}
