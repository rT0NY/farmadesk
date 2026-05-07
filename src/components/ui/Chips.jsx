import { useState, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/clases'

export function Chips({ 
  valores = [], 
  onChange, 
  placeholder = 'Agregar y presionar Enter',
  label,
  iconoChip,
  disabled = false,
  maxLength = 50,
}) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)

  const agregar = (v) => {
    const valor = v.trim()
    if (!valor) return
    if (valores.includes(valor)) {
      setInput('')
      return
    }
    onChange?.([...valores, valor])
    setInput('')
  }

  const quitar = (valor) => {
    onChange?.(valores.filter(v => v !== valor))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      agregar(input)
    } else if (e.key === 'Backspace' && !input && valores.length > 0) {
      quitar(valores[valores.length - 1])
    }
  }

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {label}
        </label>
      )}

      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          'min-h-11 rounded-2xl border border-slate-200 bg-white',
          'px-3 py-2 flex flex-wrap gap-1.5 items-center',
          'transition-all cursor-text',
          'focus-within:ring-2 focus-within:ring-primary-500/30 focus-within:border-primary-500',
          disabled && 'bg-slate-50 cursor-not-allowed opacity-60'
        )}
      >
        {valores.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-primary-50 text-primary-700 text-sm font-medium"
          >
            {iconoChip}
            {v}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  quitar(v)
                }}
                className="hover:bg-primary-100 rounded-full p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          onBlur={() => input.trim() && agregar(input)}
          placeholder={valores.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
      
      {valores.length === 0 && (
        <p className="text-xs text-slate-400 mt-1">
          Escribe y presiona Enter para agregar
        </p>
      )}
    </div>
  )
}