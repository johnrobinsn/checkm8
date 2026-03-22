import { useState, useEffect, useRef, useCallback } from 'react'
import type { TreeNode, NodeUpdate, Priority, Attachment } from '../types'
import { getAttachments, uploadAttachment, deleteAttachment } from '../api/attachments'

const MAX_IMAGE_DIM = 2048
const JPEG_QUALITY = 0.8

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      resolve(file)
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width <= MAX_IMAGE_DIM && height <= MAX_IMAGE_DIM && file.size < 2 * 1024 * 1024) {
        // Already small enough
        resolve(file)
        return
      }
      // Scale down to fit within MAX_IMAGE_DIM
      if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
        const scale = Math.min(MAX_IMAGE_DIM / width, MAX_IMAGE_DIM / height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          // Preserve original name but change extension to .jpg
          const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
          resolve(new File([blob], name, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        JPEG_QUALITY,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file) // Fall back to original on error
    }
    img.src = url
  })
}

interface ItemDetailPanelProps {
  node: TreeNode
  onUpdate: (data: NodeUpdate) => void
  onDelete: () => void
  onClose: () => void
}

const PRIORITIES: { value: Priority | null; label: string; color: string }[] = [
  { value: null, label: 'None', color: 'bg-gray-200 dark:bg-gray-600' },
  { value: 'low', label: 'Low', color: 'bg-green-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'high', label: 'High', color: 'bg-red-500' },
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ItemDetailPanel({ node, onUpdate, onDelete, onClose }: ItemDetailPanelProps) {
  const [text, setText] = useState(node.text)
  const [notes, setNotes] = useState(node.notes || '')
  const [priority, setPriority] = useState<Priority | null>(node.priority)
  const [dueDate, setDueDate] = useState(node.due_date || '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [viewingImage, setViewingImage] = useState<Attachment | null>(null)

  // Sync from prop changes (e.g. real-time updates)
  useEffect(() => {
    setText(node.text)
    setNotes(node.notes || '')
    setPriority(node.priority)
    setDueDate(node.due_date || '')
  }, [node.text, node.notes, node.priority, node.due_date])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewingImage) setViewingImage(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, viewingImage])

  // Lock body scroll while panel is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Fetch attachments on mount
  useEffect(() => {
    getAttachments(node.list_id, node.id).then(setAttachments).catch(() => {})
  }, [node.list_id, node.id])

  const commitText = () => {
    if (text !== node.text) onUpdate({ text })
  }

  const commitNotes = () => {
    const val = notes || null
    if (val !== (node.notes || null)) onUpdate({ notes: val })
  }

  const handlePriority = (p: Priority | null) => {
    setPriority(p)
    onUpdate({ priority: p })
  }

  const handleDueDate = (d: string) => {
    setDueDate(d)
    onUpdate({ due_date: d || null })
  }

  const handleDelete = () => {
    onDelete()
    onClose()
  }

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) {
      setUploadStatus('No files selected')
      return
    }
    setUploading(true)
    setUploadStatus(null)
    try {
      for (const rawFile of Array.from(files)) {
        setUploadStatus(`Processing ${rawFile.name} (${(rawFile.size / 1024 / 1024).toFixed(1)} MB)...`)
        const file = await compressImage(rawFile)
        setUploadStatus(`Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB, ${file.type || 'unknown type'})...`)
        const att = await uploadAttachment(node.list_id, node.id, file)
        setAttachments((prev) => [...prev, att])
        setUploadStatus(null)
      }
    } catch (err: any) {
      const msg = err?.message || String(err)
      setUploadStatus(`Upload failed: ${msg}`)
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }, [node.list_id, node.id])

  const handleDeleteAttachment = useCallback(async (att: Attachment) => {
    try {
      await deleteAttachment(node.list_id, node.id, att.id)
      setAttachments((prev) => prev.filter((a) => a.id !== att.id))
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }, [node.list_id, node.id])

  const isImage = (mimeType: string) => mimeType.startsWith('image/')

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-[60] transition-opacity"
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
        onTouchEnd={(e) => { e.stopPropagation(); onClose() }}
      />

      {/* Panel — stopPropagation prevents dnd-kit TouchSensor from intercepting */}
      <div
        ref={panelRef}
        className="fixed bottom-0 left-0 right-0 z-[61] bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto overscroll-contain sm:max-w-lg sm:mx-auto sm:bottom-4 sm:left-4 sm:right-4 sm:rounded-2xl"
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Drag handle indicator */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Item Details
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Item text */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
            />
          </div>

          {/* Checked status */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</label>
            <button
              onClick={() => onUpdate({ checked: !node.checked })}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                node.checked
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              {node.checked ? 'Completed' : 'Not done'}
            </button>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Priority</label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.label}
                  onClick={() => handlePriority(p.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                    priority === p.value
                      ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${p.color}`} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Due date</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => handleDueDate(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
              />
              {dueDate && (
                <button
                  onClick={() => handleDueDate('')}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-2"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notes</label>
            <textarea
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={commitNotes}
              placeholder="Add notes..."
              rows={4}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white resize-y min-h-[80px] placeholder-gray-400"
            />
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Attachments</label>
              {uploading ? (
                <span className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Uploading...
                </span>
              ) : (
                <div className="flex items-center gap-1">
                  {/* Camera button (mobile) */}
                  {'ontouchstart' in window && (
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Photo
                    </button>
                  )}
                  {/* File picker button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    File
                  </button>
                </div>
              )}
              {/* Camera input: single file, image only, rear camera */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
              {/* File picker: all file types from gallery and storage, no camera capture */}
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
            </div>

            {attachments.length > 0 && (
              <div className="space-y-2">
                {/* Image thumbnails */}
                {attachments.some((a) => isImage(a.mime_type)) && (
                  <div className="grid grid-cols-3 gap-2">
                    {attachments.filter((a) => isImage(a.mime_type)).map((att) => (
                      <div key={att.id} className="relative group aspect-square">
                        <img
                          src={`/api${att.url}`}
                          alt={att.filename}
                          className="w-full h-full object-cover rounded-lg cursor-pointer border border-gray-200 dark:border-gray-700"
                          onClick={() => setViewingImage(att)}
                        />
                        <button
                          onClick={() => handleDeleteAttachment(att)}
                          className="absolute top-1 right-1 p-0.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          style={{ opacity: 'ontouchstart' in window ? 1 : undefined }}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Non-image files */}
                {attachments.filter((a) => !isImage(a.mime_type)).map((att) => (
                  <div key={att.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg group">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <a
                      href={`/api${att.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate hover:underline"
                    >
                      {att.filename}
                    </a>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatSize(att.size)}</span>
                    <button
                      onClick={() => handleDeleteAttachment(att)}
                      className="p-0.5 text-gray-400 hover:text-red-500 flex-shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {uploadStatus && (
              <p className={`text-xs ${uploadStatus.startsWith('Upload failed') ? 'text-red-500' : 'text-blue-500'}`}>
                {uploadStatus}
              </p>
            )}

            {attachments.length === 0 && !uploading && !uploadStatus && (
              <p className="text-xs text-gray-400 dark:text-gray-500">No attachments</p>
            )}
          </div>

          {/* Metadata */}
          <div className="text-xs text-gray-400 dark:text-gray-500 space-y-0.5 pt-1 border-t border-gray-100 dark:border-gray-800">
            <p>Created: {new Date(node.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(node.updated_at).toLocaleString()}</p>
            <p className="font-mono">ID: {node.id}</p>
          </div>

          {/* Delete */}
          <div className="pt-2">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-500">Delete this item?</span>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-xs text-red-400 hover:text-red-500 transition-colors"
              >
                Delete item...
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox for full-size image viewing */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center"
          onClick={() => setViewingImage(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
            onClick={() => setViewingImage(null)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={`/api${viewingImage.url}`}
            alt={viewingImage.filename}
            className="max-w-[95vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
