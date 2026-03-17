import { useEffect, useState, useCallback } from 'react'

interface ToastMessage {
  id: number
  text: string
}

let toastId = 0
let addToastFn: ((text: string) => void) | null = null

export function showToast(text: string) {
  addToastFn?.(text)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((text: string) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, text }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  useEffect(() => {
    addToastFn = addToast
    return () => { addToastFn = null }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 px-4 py-2 rounded-lg shadow-lg text-sm animate-fade-in"
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
