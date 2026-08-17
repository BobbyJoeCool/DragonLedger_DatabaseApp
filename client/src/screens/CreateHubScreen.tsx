import { useState } from 'react'
import { FORM_COMPONENTS } from '@/lib/formRegistry'
import { CONTENT_TYPES, CONTENT_TYPE_LABELS, CONTENT_TYPE_SINGULAR, type ContentType } from '@/lib/contentTypes'

export function CreateHubScreen() {
  const [activeType, setActiveType] = useState<ContentType>('spells')
  const isSignedIn = Boolean(sessionStorage.getItem('app-password'))

  const Form = FORM_COMPONENTS[activeType]

  if (!isSignedIn) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Create</h2>
        <p className="text-muted-foreground">Sign in to create new content.</p>
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      <nav className="flex w-40 shrink-0 flex-col gap-1">
        {CONTENT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setActiveType(type)}
            className={`rounded px-3 py-2 text-left text-sm transition-colors ${
              type === activeType
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-foreground hover:bg-accent/50'
            }`}
          >
            {CONTENT_TYPE_SINGULAR[type]}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <h2 className="mb-4 text-2xl font-semibold">
          New {CONTENT_TYPE_SINGULAR[activeType]}
        </h2>
        {Form ? (
          <Form mode="create" />
        ) : (
          <p className="text-sm text-muted-foreground">
            Creating a new {CONTENT_TYPE_SINGULAR[activeType]} isn't built yet.
          </p>
        )}
      </div>
    </div>
  )
}
