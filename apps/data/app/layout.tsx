import type { Metadata } from 'next'
import { AppNav } from '@summit/nav'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clinician Portal',
  description: 'Clinician appointments and behaviour tracking dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AppNav activeKey="clinician" />
        {children}
      </body>
    </html>
  )
}
