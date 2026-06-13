import { X } from 'lucide-react'
import { cn } from '@/lib/clases'

function Modal({ children, onClose, maxWidth = 'sm:max-w-md' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={cn(
        'relative w-full bg-white rounded-none sm:rounded-3xl shadow-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92dvh]',
        maxWidth
      )}>
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ titulo, subtitulo, onClose }) {
  return (
    <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
        {subtitulo && <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>}
      </div>
      <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors -mt-1 -mr-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function ModalFooter({ children }) {
  return (
    <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
      {children}
    </div>
  )
}

export { Modal, ModalHeader, ModalFooter }

