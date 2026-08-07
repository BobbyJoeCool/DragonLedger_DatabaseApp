export interface ApiErrorBody {
  error: {
    code: string
    message: string
    [key: string]: unknown
  }
}

// Standard error envelope for every write endpoint (Phase 4 §1.4):
// { error: { code, message, ...extra } }. `extra` carries case-specific
// payload, e.g. HAS_DEPENDENT_CHILDREN's `dependents` list.
export function errorResponse(
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): ApiErrorBody {
  return { error: { code, message, ...extra } }
}
