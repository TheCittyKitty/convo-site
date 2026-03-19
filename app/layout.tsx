import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Convo Rooms',
  description: 'Timed conversation rooms with rotating prompts',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
