import { chatReducer, type ChatAction } from './index';
import { INITIAL_STATE } from './initial-state';
import type { ChatSessionState } from '../types/chat-state';

export interface MultiProjectChatState {
  activeProjectId: string | null;
  projects: Record<string, ChatSessionState>;
}

export type MultiProjectAction =
  | { type: 'SET_ACTIVE_PROJECT'; payload: { projectId: string } }
  | { type: 'REMOVE_PROJECT_STATE'; payload: { projectId: string } }
  | { type: 'INIT_PROJECT_STATE'; payload: { projectId: string; state?: ChatSessionState } }
  | (ChatAction & { targetProjectId?: string });

/**
 * Creates the initial multi-project chat state.
 * When an initialProjectId is supplied, seeds that project's slice with initialProjectState.
 */
export function createInitialMultiProjectState(
  initialProjectId: string | null = null,
  initialProjectState: ChatSessionState = INITIAL_STATE
): MultiProjectChatState {
  return {
    activeProjectId: initialProjectId,
    projects: initialProjectId ? { [initialProjectId]: initialProjectState } : {},
  };
}

/**
 * Returns the active project's ChatSessionState or INITIAL_STATE fallback if unassigned.
 */
export function getActiveProjectState(state: MultiProjectChatState): ChatSessionState {
  if (!state.activeProjectId) {
    return INITIAL_STATE;
  }
  return state.projects[state.activeProjectId] ?? INITIAL_STATE;
}

/**
 * Pure multi-project state reducer routing ChatActions to targetProjectId or activeProjectId.
 */
export function multiProjectChatReducer(
  state: MultiProjectChatState,
  action: MultiProjectAction
): MultiProjectChatState {
  if (action.type === 'SET_ACTIVE_PROJECT') {
    const targetId = action.payload.projectId;
    const existing = state.projects[targetId];
    if (existing && state.activeProjectId === targetId) {
      return state;
    }
    return {
      ...state,
      activeProjectId: targetId,
      projects: existing
        ? state.projects
        : {
            ...state.projects,
            [targetId]: { ...INITIAL_STATE },
          },
    };
  }

  if (action.type === 'REMOVE_PROJECT_STATE') {
    const targetId = action.payload.projectId;
    if (!(targetId in state.projects) && state.activeProjectId !== targetId) {
      return state;
    }
    const nextProjects = { ...state.projects };
    delete nextProjects[targetId];
    return {
      activeProjectId: state.activeProjectId === targetId ? null : state.activeProjectId,
      projects: nextProjects,
    };
  }

  if (action.type === 'INIT_PROJECT_STATE') {
    const targetId = action.payload.projectId;
    const projectState = action.payload.state ?? { ...INITIAL_STATE };
    return {
      ...state,
      projects: {
        ...state.projects,
        [targetId]: projectState,
      },
    };
  }

  // Any other action (ChatAction with optional targetProjectId)
  const targetId =
    'targetProjectId' in action && action.targetProjectId
      ? action.targetProjectId
      : state.activeProjectId;

  if (!targetId) {
    return state;
  }

  const prevProjectState = state.projects[targetId] ?? INITIAL_STATE;
  const nextProjectState = chatReducer(prevProjectState, action as ChatAction);

  if (nextProjectState === prevProjectState) {
    return state;
  }

  return {
    ...state,
    projects: {
      ...state.projects,
      [targetId]: nextProjectState,
    },
  };
}
