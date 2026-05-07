export default function Logo({ className = 'w-10 h-10' }) {
  return (
    <img
      src="/logo.png"
      alt="Farmadesk"
      className={className}
      style={{ objectFit: 'contain' }}
    />
  )
}
