import { useEffect, useState } from 'react'
import type { ListSettings } from '../types'
import * as listsApi from '../api/lists'

interface ListSettingsDialogProps {
  listId: string
  onClose: () => void
}

export function ListSettingsDialog({ listId, onClose }: ListSettingsDialogProps) {
  const [settings, setSettings] = useState<ListSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)

  useEffect(() => {
    listsApi.getSettings(listId).then(setSettings)
  }, [listId])

  const handleToggleArchive = async () => {
    if (!settings) return
    setSaving(true)
    const updated = await listsApi.updateSettings(listId, {
      auto_archive_enabled: !settings.auto_archive_enabled,
    })
    setSettings(updated)
    setSaving(false)
  }

  const handleMinutesChange = async (minutes: number) => {
    if (!settings || minutes < 1) return
    setSaving(true)
    const updated = await listsApi.updateSettings(listId, { auto_archive_minutes: minutes })
    setSettings(updated)
    setSaving(false)
  }

  const handleClearArchive = async () => {
    setClearing(true)
    await listsApi.clearArchived(listId)
    setClearing(false)
    setClearConfirm(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">List Settings</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-6">
          {!settings ? (
            <div className="text-center text-gray-400 py-4">Loading...</div>
          ) : (
            <>
              {/* Auto-archive toggle */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">Auto-archive completed items</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Automatically hide checked items after a set time
                    </div>
                  </div>
                  <button
                    onClick={handleToggleArchive}
                    disabled={saving}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      settings.auto_archive_enabled
                        ? 'bg-blue-500'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        settings.auto_archive_enabled ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>

                {/* Time threshold */}
                {settings.auto_archive_enabled && (
                  <div className="mt-3 flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-gray-400">Archive after</label>
                    <select
                      value={settings.auto_archive_minutes}
                      onChange={(e) => handleMinutesChange(Number(e.target.value))}
                      className="px-2 py-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                    >
                      <option value={5}>5 minutes</option>
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                      <option value={360}>6 hours</option>
                      <option value={1440}>1 day</option>
                      <option value={10080}>1 week</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Clear archive */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="font-medium text-sm mb-1">Archive</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Archived items power autocomplete suggestions. Clearing the archive removes all archived items permanently.
                </div>
                {clearConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600 dark:text-red-400">Are you sure?</span>
                    <button
                      onClick={handleClearArchive}
                      disabled={clearing}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50"
                    >
                      {clearing ? 'Clearing...' : 'Yes, clear'}
                    </button>
                    <button
                      onClick={() => setClearConfirm(false)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setClearConfirm(true)}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                  >
                    Clear archive
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
