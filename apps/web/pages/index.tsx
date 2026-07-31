import { useEffect, useState } from 'react'

export default function Home() {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
      window.location.replace('/auth/callback' + window.location.hash)
    }
  }, [])

  // Scroll-triggered reveal for anything with class="reveal"
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Simple count-up for the hero "2x faster" stat
  const [multiplier, setMultiplier] = useState(0)
  useEffect(() => {
    const duration = 900
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      setMultiplier(Math.round(progress * 2 * 10) / 10)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Brand colours — Summit palette
  const grad  = 'linear-gradient(135deg,#28B4A6 0%,#21798A 55%,#1A3F5C 100%)'
  const navy  = '#1A3F5C'
  const teal  = '#28B4A6'
  const g100  = '#EEF3F6'
  const g500  = '#7A9AAD'
  const g700  = '#3D5A6A'
  const off   = '#F7FAFB'
  const display = "'Bricolage Grotesque',sans-serif"
  const body    = "'Hanken Grotesk',sans-serif"

  return (
    <>

      {/* ── HERO ── */}
      <section className="hero-bg" style={{
        padding: '88px 2rem 80px',
        background: 'linear-gradient(180deg,#EDF6F9 0%,#fff 100%)',
        overflow: 'hidden', position: 'relative',
        fontFamily: body,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '4rem', alignItems: 'center',
        }}>
          {/* Left copy */}
          <div>
            <div className="an1" style={{
              display: 'inline-flex', alignItems: 'center', gap: '.4rem',
              background: 'rgba(40,180,166,.12)', color: teal,
              fontSize: '.78rem', fontWeight: 700,
              padding: '.35rem .8rem', borderRadius: 100,
              marginBottom: '1.25rem',
              fontFamily: display, letterSpacing: '.02em',
            }}>
              ✦ Built for ABA Clinics
            </div>

            <h1 className="an2" style={{
              fontFamily: display,
              fontSize: 'clamp(2.1rem,3.8vw,3.1rem)',
              fontWeight: 800, lineHeight: 1.15,
              color: navy, marginBottom: '1.25rem',
            }}>
              Scheduling that works<br />
              as hard as{' '}
              <span className="grad-text">your clinicians do.</span>
            </h1>

            <p className="an3" style={{
              fontSize: '1.05rem', color: g700,
              marginBottom: '2rem', maxWidth: 460, lineHeight: 1.75,
            }}>
              Summit matches clients to the right staff automatically, eliminates double bookings, and builds your entire recurring schedule in minutes — not hours.
            </p>

            <div className="an4" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2.5rem' }}>
              <a href="/signup" className="btn-primary" style={{
                background: grad, color: '#fff',
                fontFamily: display, fontSize: '1rem', fontWeight: 700,
                padding: '.875rem 2rem', borderRadius: 10,
                boxShadow: '0 4px 22px rgba(26,63,92,.28)',
                display: 'inline-block',
              }}>
                Start Free Trial
              </a>
              <a href="#how" style={{
                color: navy,
                fontFamily: display, fontSize: '1rem', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '.4rem',
              }}>
                See how it works →
              </a>
            </div>

            <div className="an5" style={{ display: 'flex', gap: '2.5rem' }}>
              <div>
                <div style={{ fontFamily: display, fontSize: '1.5rem', fontWeight: 800, color: navy }}>{multiplier}×</div>
                <div style={{ fontSize: '.78rem', color: g500, fontWeight: 500 }}>faster scheduling</div>
              </div>
              <div>
                <div style={{ fontFamily: display, fontSize: '1.5rem', fontWeight: 800, color: navy }}>0</div>
                <div style={{ fontSize: '.78rem', color: g500, fontWeight: 500 }}>double bookings</div>
              </div>
              <div>
                <div style={{ fontFamily: display, fontSize: '1.5rem', fontWeight: 800, color: navy }}>AI</div>
                <div style={{ fontSize: '.78rem', color: g500, fontWeight: 500 }}>powered matching</div>
              </div>
            </div>
          </div>

          {/* Right — app mock */}
          <div className="an3" style={{ position: 'relative' }}>
            <div style={{
              background: '#fff', borderRadius: 16,
              boxShadow: '0 24px 64px rgba(26,63,92,.14),0 4px 16px rgba(26,63,92,.07)',
              overflow: 'hidden', border: `1px solid ${g100}`,
            }}>
              {/* Window chrome */}
              <div style={{ background: '#0F2E3D', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 7 }}>
                {['#ff5f57','#ffbd2e','#28c840'].map(c => (
                  <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                ))}
                <div style={{ margin: '0 auto', color: 'rgba(255,255,255,.45)', fontSize: '.72rem', fontFamily: display }}>
                  Summit Scheduler — Week of May 26
                </div>
              </div>

              {/* Calendar grid */}
              <div style={{ padding: 14 }}>
                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(6,1fr)', gap: 3, marginBottom: 3 }}>
                  <div />
                  {['Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                    <div key={d} style={{
                      fontFamily: display, fontSize: '.68rem',
                      fontWeight: 600, color: g500, textAlign: 'center', padding: '5px 0',
                    }}>{d}</div>
                  ))}
                </div>

                {/* Time rows */}
                {[
                  { time: '9:00 AM', cells: [
                    { type: 'teal', lines: ['Direct Therapy','J. Martinez'] },
                    null,
                    { type: 'blue', lines: ['Assessment','R. Patel'] },
                    null,
                    { type: 'teal', lines: ['Direct Therapy','M. Chen'] },
                    null,
                  ]},
                  { time: '10:00 AM', cells: [
                    null,
                    { type: 'yellow', lines: ['Group Therapy','3 clients'] },
                    null,
                    { type: 'teal',   lines: ['Direct Therapy','A. Williams'] },
                    null,
                    null,
                  ]},
                  { time: '11:00 AM', cells: [
                    { type: 'blue', lines: ['Supervision','Dr. K. Park'] },
                    null,
                    { type: 'teal', lines: ['Direct Therapy','L. Torres'] },
                    null,
                    { type: 'blue', lines: ['Assessment','B. Nguyen'] },
                    null,
                  ]},
                ].map((row, ri) => (
                  <div key={row.time}>
                    {ri > 0 && <div style={{ height: 3 }} />}
                    <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(6,1fr)', gap: 3 }}>
                      <div style={{ fontSize: '.65rem', color: g500, textAlign: 'right', paddingRight: 7, paddingTop: 3 }}>
                        {row.time}
                      </div>
                      {row.cells.map((cell, ci) => cell ? (
                        <div key={ci} style={{
                          borderRadius: 6, padding: '3px 5px',
                          fontSize: '.6rem', fontWeight: 700, color: '#fff',
                          fontFamily: display, lineHeight: 1.3,
                          height: 62, display: 'flex', flexDirection: 'column',
                          justifyContent: 'center', gap: 1,
                          background:
                            cell.type === 'teal'   ? 'linear-gradient(135deg,#28B4A6,#219A8E)' :
                            cell.type === 'blue'   ? 'linear-gradient(135deg,#21798A,#1D6478)' :
                                                     'linear-gradient(135deg,#e09c00,#c98d00)',
                        }}>
                          {cell.lines.map(t => <span key={t}>{t}</span>)}
                        </div>
                      ) : (
                        <div key={ci} style={{ height: 62, borderRadius: 4, background: g100 }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating badge */}
            <div className="float-badge" style={{
              position: 'absolute', bottom: -18, right: 20,
              background: '#fff', borderRadius: 12, padding: '11px 15px',
              boxShadow: '0 8px 32px rgba(26,63,92,.14)',
              border: `1px solid ${g100}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: grad, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '1rem',
              }}>✓</div>
              <div>
                <div style={{ fontFamily: display, fontSize: '.78rem', fontWeight: 700, color: navy }}>12 sessions booked</div>
                <div style={{ fontSize: '.68rem', color: g500 }}>Conflicts resolved automatically</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LOGOS MARQUEE ── */}
      <div style={{
        padding: '28px 0',
        borderTop: `1px solid ${g100}`,
        borderBottom: `1px solid ${g100}`,
        fontFamily: body,
        overflow: 'hidden',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto 1.1rem', textAlign: 'center', padding: '0 2rem' }}>
          <div style={{
            fontSize: '.75rem', color: g500, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.09em',
          }}>
            Trusted by growing ABA clinics across North America
          </div>
        </div>
        <div className="marquee">
          <div className="marquee-track">
            {[...Array(2)].flatMap(() =>
              ['Beacon ABA','Clarity Clinic','Pathways','Summit Therapy','Bright Futures ABA','Maple Grove ABA','Harbourview Clinic']
            ).map((name, i) => (
              <span key={i} style={{
                fontFamily: display, fontSize: '.95rem',
                fontWeight: 700, color: '#C4D3DC', letterSpacing: '-.01em',
                padding: '0 1.5rem', whiteSpace: 'nowrap',
              }}>{name}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: '88px 2rem', background: '#fff', fontFamily: body }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            fontFamily: display, fontSize: '.72rem', fontWeight: 700,
            letterSpacing: '.1em', textTransform: 'uppercase', color: teal, marginBottom: '.7rem',
          }}>Features</div>
          <h2 style={{
            fontFamily: display,
            fontSize: 'clamp(1.7rem,2.8vw,2.4rem)',
            fontWeight: 800, color: navy, marginBottom: '.9rem', maxWidth: 580,
          }}>
            Everything your clinic needs to run smoothly
          </h2>
          <p style={{ fontSize: '1rem', color: g700, maxWidth: 540, marginBottom: '2.8rem' }}>
            From intake to recurring sessions, Summit handles the complexity so your team stays focused on clients.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.25rem' }}>
            {[
              { icon: '🤖', title: 'AI-Powered Staff Matching',       desc: 'Automatically matches each client to the best-qualified, available staff — factoring session type, availability, and location in seconds.' },
              { icon: '📅', title: 'Smart Recurring Schedules',        desc: 'Set it once and Summit builds the full recurring calendar — weekly, biweekly, or custom — with zero manual entry required.' },
              { icon: '🗓️', title: 'Visual Drag-and-Drop Calendar',   desc: 'See your full week at a glance. Drag sessions to reposition them, with real-time conflict detection keeping everything clean.' },
              { icon: '👥', title: 'Multi-Portal Access',              desc: 'Dedicated views for admins, clinicians, and families. Everyone sees exactly what they need — nothing more.' },
              { icon: '🔒', title: 'HIPAA-Ready Infrastructure',       desc: 'Built on enterprise-grade infrastructure with role-based access control and encrypted data at rest and in transit.' },
              { icon: '📍', title: 'Multi-Location Support',           desc: 'Manage sessions across all your clinic locations from one dashboard. Staff, clients, and rooms all in one place.' },
            ].map((f, i) => (
              <div key={f.title} className="feature-card reveal" style={{
                background: off, borderRadius: 16,
                padding: '1.75rem', border: `1px solid ${g100}`,
                transitionDelay: `${(i % 3) * 90}ms`,
              }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 12, background: grad,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.1rem', fontSize: '1.25rem',
                }}>{f.icon}</div>
                <h3 style={{ fontFamily: display, fontSize: '1rem', fontWeight: 700, color: navy, marginBottom: '.45rem' }}>{f.title}</h3>
                <p style={{ fontSize: '.875rem', color: g700, lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ padding: '88px 2rem', background: off, fontFamily: body }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            fontFamily: display, fontSize: '.72rem', fontWeight: 700,
            letterSpacing: '.1em', textTransform: 'uppercase', color: teal, marginBottom: '.7rem',
          }}>How it works</div>
          <h2 style={{
            fontFamily: display,
            fontSize: 'clamp(1.7rem,2.8vw,2.4rem)',
            fontWeight: 800, color: navy, marginBottom: '.9rem', maxWidth: 580,
          }}>
            From intake to booked session in minutes
          </h2>
          <p style={{ fontSize: '1rem', color: g700, maxWidth: 540, marginBottom: '2.8rem' }}>
            No training required. Summit guides your admin through each step with a simple, guided flow.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '2rem' }}>
            {[
              { n: '1', title: 'Add your clients & staff',  desc: 'Enter client profiles and staff availability. Summit learns who can see who, and when — automatically.' },
              { n: '2', title: 'Run AI matching',            desc: 'Tell Summit the session type and parameters. It surfaces the best matches instantly, colour-coded by availability.' },
              { n: '3', title: 'Confirm & go',               desc: 'Review the proposed schedule, drag to adjust if needed, then confirm. Recurring sessions booked in bulk automatically.' },
            ].map((s, i) => (
              <div key={s.n} className="reveal" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', transitionDelay: `${i * 120}ms` }}>
                <div style={{
                  width: 54, height: 54, borderRadius: '50%',
                  background: grad, color: '#fff',
                  fontFamily: display, fontSize: '1.2rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.2rem',
                  boxShadow: '0 4px 18px rgba(26,63,92,.28)',
                }}>{s.n}</div>
                <h3 style={{ fontFamily: display, fontSize: '1rem', fontWeight: 700, color: navy, marginBottom: '.45rem' }}>{s.title}</h3>
                <p style={{ fontSize: '.875rem', color: g700, lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section id="testimonials" className="testi-bg" style={{
        padding: '88px 2rem', background: '#0F2E3D',
        position: 'relative', overflow: 'hidden',
        fontFamily: body,
      }}>
        <div className="reveal" style={{ maxWidth: 780, margin: '0 auto', textAlign: 'center' }}>
          <blockquote style={{
            fontFamily: display,
            fontSize: 'clamp(1.25rem,2.2vw,1.7rem)',
            fontWeight: 600, color: '#fff', lineHeight: 1.55, marginBottom: '2rem',
          }}>
            &ldquo;We used to spend 4 hours a week building the schedule. With Summit, it&rsquo;s done in 20 minutes — and there are zero double bookings.&rdquo;
          </blockquote>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div style={{
              width: 46, height: 46, borderRadius: '50%', background: grad,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: display, fontWeight: 700, color: '#fff', fontSize: '.95rem',
            }}>SC</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: display, fontWeight: 700, color: '#fff', fontSize: '.9rem' }}>Sarah Chen, BCBA-D</div>
              <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.45)' }}>Clinical Director, Clarity ABA Clinic</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section id="trial" style={{
        padding: '100px 2rem', background: grad,
        textAlign: 'center', position: 'relative', overflow: 'hidden',
        fontFamily: body,
      }}>
        <div className="reveal" style={{ position: 'relative', maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{
            fontFamily: display,
            fontSize: 'clamp(2rem,3.8vw,2.9rem)',
            fontWeight: 800, color: '#fff', marginBottom: '1rem', lineHeight: 1.2,
          }}>
            Ready to take your scheduling to the summit?
          </h2>
          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: '1.05rem', marginBottom: '2.5rem' }}>
            Start your free trial today. Set up in under 10 minutes.
          </p>
          <a href="/signup" className="btn-primary" style={{
            background: '#fff', color: navy,
            fontFamily: display, fontSize: '1rem', fontWeight: 700,
            padding: '.9rem 2.25rem', borderRadius: 10,
            display: 'inline-block',
            boxShadow: '0 4px 20px rgba(0,0,0,.14)',
          }}>
            Start Free Trial →
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        background: '#0F2E3D', padding: '36px 2rem',
        borderTop: '1px solid rgba(255,255,255,.05)',
        fontFamily: body,
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '1rem',
        }}>
          <span style={{
            fontFamily: display, fontWeight: 800,
            color: 'rgba(255,255,255,.45)', fontSize: '1rem', letterSpacing: '-.01em',
          }}>SUMMIT</span>
          <div style={{ display: 'flex', gap: '2rem' }}>
            {([
              ['Features','#features'],
              ['How it works','#how'],
              ['Reviews','#testimonials'],
              ['Contact','mailto:yanko@summitclient.io'],
              ['Privacy','/privacy'],
              ['Terms','/terms'],
            ] as [string,string][]).map(([label,href]) => (
              <a key={href} href={href} style={{ color: 'rgba(255,255,255,.4)', fontSize: '.82rem' }}>{label}</a>
            ))}
          </div>
          <span style={{ color: 'rgba(255,255,255,.28)', fontSize: '.78rem' }}>© 2026 Summit Client Inc.</span>
        </div>
      </footer>
    </>
  )
}
