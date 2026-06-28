'use client'

export const Background = () => (
  <div aria-hidden className="pointer-events-none absolute inset-0">
    <video
      autoPlay
      className="object-cover brightness-75"
      loop
      muted
      playsInline
      src="/background.mp4"
    >
      <source src="/background.mp4" type="video/mp4" />
    </video>
  </div>
)
