import { useCallback, useSyncExternalStore } from 'react'
import type { ContentType } from '@/lib/contentTypes'

export interface DisplayItem {
  type: ContentType
  id: string
  name: string
}

const STORAGE_KEY = 'dragonledger-display-collection'

let listeners: Array<() => void> = []
let cachedRaw: string | null = null
let cachedItems: DisplayItem[] = []

function emitChange() {
  cachedRaw = null
  for (const listener of listeners) listener()
}

function getSnapshot(): DisplayItem[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === cachedRaw) return cachedItems
  cachedRaw = raw
  if (!raw) {
    cachedItems = []
    return cachedItems
  }
  try {
    cachedItems = JSON.parse(raw) as DisplayItem[]
  } catch {
    cachedItems = []
  }
  return cachedItems
}

function setItems(items: DisplayItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  emitChange()
}

function subscribe(listener: () => void) {
  listeners = [...listeners, listener]
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

export function useDisplayCollection() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const addItems = useCallback((newItems: DisplayItem[]) => {
    const current = getSnapshot()
    const existingKeys = new Set(current.map((i) => `${i.type}:${i.id}`))
    const toAdd = newItems.filter((i) => !existingKeys.has(`${i.type}:${i.id}`))
    if (toAdd.length > 0) setItems([...current, ...toAdd])
  }, [])

  const removeItem = useCallback((type: ContentType, id: string) => {
    setItems(getSnapshot().filter((i) => !(i.type === type && i.id === id)))
  }, [])

  const clearAll = useCallback(() => {
    setItems([])
  }, [])

  return { items, addItems, removeItem, clearAll, count: items.length }
}
