'use client'

export const Background = () => (
  <div aria-hidden className="pointer-events-none absolute inset-0">
    <video
      autoPlay
      className="size-full object-cover opacity-70 saturate-[0.7]"
      loop
      muted
      playsInline
      src="/background.mp4"
    >
      <source src="/background.mp4" type="video/mp4" />
    </video>
    <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent" />
  </div>
)
