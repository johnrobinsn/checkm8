import { useCallback, useRef } from 'react'

interface UndoEntry {
  doAction: () => Promise<void>
  undoAction: () => Promise<void>
}

const MAX_HISTORY = 50

export function useUndoRedo() {
  const undoStack = useRef<UndoEntry[]>([])
  const redoStack = useRef<UndoEntry[]>([])

  const execute = useCallback(async (entry: UndoEntry) => {
    await entry.doAction()
    undoStack.current.push(entry)
    if (undoStack.current.length > MAX_HISTORY) {
      undoStack.current.shift()
    }
    redoStack.current = []
  }, [])

  const undo = useCallback(async () => {
    const entry = undoStack.current.pop()
    if (!entry) return
    await entry.undoAction()
    redoStack.current.push(entry)
  }, [])

  const redo = useCallback(async () => {
    const entry = redoStack.current.pop()
    if (!entry) return
    await entry.doAction()
    undoStack.current.push(entry)
  }, [])

  const canUndo = useCallback(() => undoStack.current.length > 0, [])
  const canRedo = useCallback(() => redoStack.current.length > 0, [])

  return { execute, undo, redo, canUndo, canRedo }
}
