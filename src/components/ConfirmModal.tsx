"use client";

interface Props {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title = "Hapus Data",
  message = "Apakah kamu yakin ingin menghapus data ini? Tindakan ini tidak dapat dibatalkan.",
  confirmLabel = "Hapus",
  cancelLabel = "Batal",
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50 backdrop-blur-[2px]" onClick={onCancel} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto overflow-hidden border border-border">
          {/* Header */}
          <div className={`px-6 pt-6 pb-4 border-b ${danger ? "border-red-500/20" : "border-border"}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${danger ? "bg-red-500/15" : "bg-indigo-500/15"}`}>
              <span className="text-lg">{danger ? "🗑️" : "❓"}</span>
            </div>
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            <p className="text-sm text-muted mt-1.5 leading-relaxed">{message}</p>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 flex gap-3 justify-end bg-subtle/50">
            <button onClick={onCancel}
              className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted hover:bg-subtle hover:text-foreground transition-colors">
              {cancelLabel}
            </button>
            <button onClick={onConfirm}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors text-white ${
                danger ? "bg-red-500 hover:bg-red-600" : "bg-indigo-600 hover:bg-indigo-700"
              }`}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
