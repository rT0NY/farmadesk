import logoUrl from '/logo.png'

export default function Logo({ className = 'w-10 h-10' }) {
  return (
    <img
      src={logoUrl}
      alt="Farmadesk"
      className={className}
      style={{ objectFit: 'contain' }}
    />
  )
}
