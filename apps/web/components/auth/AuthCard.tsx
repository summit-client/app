import { ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: string
  children: ReactNode
}

/** Shared shell for login/signup/forgot-password/update-password. */
export default function AuthCard({ title, subtitle, children }: Props) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div>
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}
