import { Link, useParams } from 'react-router'
import { FORM_COMPONENTS } from '@/lib/formRegistry'
import { CONTENT_TYPE_SINGULAR, isContentType } from '@/lib/contentTypes'

// /browse/:type/:id/edit — dispatches through formRegistry.ts, same as
// CreateScreen.
export function EditScreen() {
  const { type: rawType, id } = useParams()
  const type = rawType && isContentType(rawType) ? rawType : undefined

  if (!type || !id) {
    return <p className="text-sm text-destructive">Unknown content type "{rawType}".</p>
  }

  const Form = FORM_COMPONENTS[type]
  if (Form) {
    return <Form mode="edit" id={id} />
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Editing a {CONTENT_TYPE_SINGULAR[type]} isn't built yet.
      </p>
      <Link to={`/browse/${type}/${id}`} className="text-sm text-primary hover:underline">
        ← Back
      </Link>
    </div>
  )
}
