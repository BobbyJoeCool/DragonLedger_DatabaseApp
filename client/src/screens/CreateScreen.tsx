import { Link, useParams } from 'react-router'
import { FORM_COMPONENTS } from '@/lib/formRegistry'
import { CONTENT_TYPE_SINGULAR, isContentType } from '@/lib/contentTypes'

// /browse/:type/new — dispatches through formRegistry.ts to the type's
// <Type>Form. A type with no entry there yet falls through to the
// placeholder below.
export function CreateScreen() {
  const { type: rawType } = useParams()
  const type = rawType && isContentType(rawType) ? rawType : undefined

  if (!type) {
    return <p className="text-sm text-destructive">Unknown content type "{rawType}".</p>
  }

  const Form = FORM_COMPONENTS[type]
  if (Form) {
    return <Form mode="create" />
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Creating a new {CONTENT_TYPE_SINGULAR[type]} isn't built yet.
      </p>
      <Link to="/browse" className="text-sm text-primary hover:underline">
        ← Back to Browse
      </Link>
    </div>
  )
}
