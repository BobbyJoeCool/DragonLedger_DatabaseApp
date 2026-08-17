import { useCallback, useMemo } from 'react'
import type { ContentType } from '@/lib/contentTypes'
import { useDisplayCollection, type DisplayItem } from './useDisplayCollection'
import type { SelectionState } from './useSelection'

export function useDisplaySelection(type: ContentType): SelectionState {
  const { items, addItems, removeItem, clearAll: clearCollection } = useDisplayCollection()

  const selectedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of items) {
      if (item.type === type) ids.add(item.id)
    }
    return ids
  }, [items, type])

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])

  const toggle = useCallback(
    (id: string, name?: string) => {
      if (selectedIds.has(id)) {
        removeItem(type, id)
      } else {
        addItems([{ type, id, name: name ?? id }])
      }
    },
    [selectedIds, type, addItems, removeItem],
  )

  const selectAll = useCallback(
    (ids: string[], names?: Map<string, string>) => {
      const currentTypeIds = new Set(
        items.filter((i) => i.type === type).map((i) => i.id),
      )
      for (const id of currentTypeIds) {
        if (!ids.includes(id)) removeItem(type, id)
      }
      const toAdd: DisplayItem[] = ids
        .filter((id) => !currentTypeIds.has(id))
        .map((id) => ({ type, id, name: names?.get(id) ?? id }))
      if (toAdd.length > 0) addItems(toAdd)
    },
    [items, type, addItems, removeItem],
  )

  const clearAll = useCallback(() => {
    for (const item of items) {
      if (item.type === type) removeItem(type, item.id)
    }
  }, [items, type, removeItem])

  const selectPage = useCallback(
    (ids: string[], names?: Map<string, string>) => {
      const toAdd: DisplayItem[] = ids
        .filter((id) => !selectedIds.has(id))
        .map((id) => ({ type, id, name: names?.get(id) ?? id }))
      if (toAdd.length > 0) addItems(toAdd)
    },
    [selectedIds, type, addItems],
  )

  const deselectPage = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        if (selectedIds.has(id)) removeItem(type, id)
      }
    },
    [selectedIds, type, removeItem],
  )

  return useMemo(
    () => ({
      selectedIds,
      count: selectedIds.size,
      isSelected,
      toggle,
      selectAll,
      clearAll,
      selectPage,
      deselectPage,
    }),
    [selectedIds, isSelected, toggle, selectAll, clearAll, selectPage, deselectPage],
  )
}
