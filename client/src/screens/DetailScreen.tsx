import { useParams } from 'react-router'

export function DetailScreen() {
  const { type, id } = useParams()
  return (
    <div>
      <h2 className="text-2xl font-semibold">
        {type} / {id}
      </h2>
    </div>
  )
}
