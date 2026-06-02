export default function Home() {
  const grad  = 'linear-gradient(135deg,#3BBDB4 0%,#2B8EC4 55%,#1A4D6E 100%)'
  const navy  = '#12374F'
  const teal  = '#3BBDB4'
  const g100  = '#EEF3F6'
  const g500  = '#7A9AAD'
  const g700  = '#3D5A6A'
  const off   = '#F7FAFB'

  return (
    <>
      {/* ── NAV ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 99,
        background: 'rgba(255,255,255,.95)',
        backdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${g100}`,
        padding: '0 2rem',
        fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', height: 68,
        }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/summit-logo.jpg" alt="Summit" style={{ height: 38, width: 'auto' }} />
          </a>

          <div style={{ display: 'flex', gap: '2rem' }}>
            {([['Features','#features'],['How it works','#how'],['Pricing','/pricing']] as [string,string][]).map(([label,href]) => (
              <a key={href} href={href} className="nav-link-item"
                style={{ color: g700, fontSize: '.9rem', fontWeight: 500, transition: 'color .2s' }}>
                {label}
              </a>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <a href="/login"
              style={{ color: navy, fontSize: '.9rem', fontWeight: 500, padding: '.5rem 1rem', borderRadius: 8 }}>
              Log in
            </a>
            <a href="/signup" style={{
              background: grad, color: '#fff',
              fontFamily: "'Sora',sans-serif", fontSize: '.875rem', fontWeight: 700,
              padding: '.6rem 1.25rem', borderRadius: 8, display: 'inline-block',
            }}>
              Start Free Trial
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero-bg" style={{
        padding: '88px 2rem 80px',
        background: 'linear-gradient(180deg,#EDF6F9 0%,#fff 100%)',
        overflow: 'hidden', position: 'relative',
        fontFamily: "'DM Sans',sans-serif",
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
              background: 'rgba(59,189,180,.12)', color: teal,
              fontSize: '.78rem', fontWeight: 700,
              padding: '.35rem .8rem', borderRadius: 100,
              marginBottom: '1.25rem',
              fontFamily: "'Sora',sans-serif", letterSpacing: '.02em',
            }}>
              ✦ Built for ABA Clinics
            </div>

            <h1 className="an2" style={{
              fontFamily: "'Sora',sans-serif",
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
              <a href="/signup" style={{
                background: grad, color: '#fff',
                fontFamily: "'Sora',sans-serif", fontSize: '1rem', fontWeight: 700,
                padding: '.875rem 2rem', borderRadius: 10,
                boxShadow: '0 4px 22px rgba(43,142,196,.32)',
                display: 'inline-block',
              }}>
                Start Free Trial
              </a>
              <a href="#how" style={{
                color: navy,
                fontFamily: "'Sora',sans-serif", fontSize: '1rem', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '.4rem',
              }}>
                See how it works →
              </a>
            </div>

            <div className="an5" style={{ display: 'flex', gap: '2.5rem' }}>
              {([['2×','faster scheduling'],['0','double bookings'],['AI','powered matching']] as [string,string][]).map(([num,label]) => (
                <div key={label}>
                  <div style={{ fontFamily: "'Sora',sans-serif", fontSize: '1.5rem', fontWeight: 800, color: '#1A4D6E' }}>{num}</div>
                  <div style={{ fontSize: '.78rem', color: g500, fontWeight: 500 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — app mock */}
          <div className="an3" style={{ position: 'relative' }}>
            <div style={{
              background: '#fff', borderRadius: 16,
              boxShadow: '0 24px 64px rgba(26,77,110,.14),0 4px 16px rgba(26,77,110,.07)',
              overflow: 'hidden', border: `1px solid ${g100}`,
            }}>
              {/* Window chrome */}
              <div style={{ background: '#0D2B3E', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 7 }}>
                {['#ff5f57','#ffbd2e','#28c840'].map(c => (
                  <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                ))}
                <div style={{ margin: '0 auto', color: 'rgba(255,255,255,.45)', fontSize: '.72rem', fontFamily: "'Sora',sans-serif" }}>
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
                      fontFamily: "'Sora',sans-serif", fontSize: '.68rem',
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
                          fontFamily: "'Sora',sans-serif", lineHeight: 1.3,
                          height: 62, display: 'flex', flexDirection: 'column',
                          justifyContent: 'center', gap: 1,
                          background:
                            cell.type === 'teal'   ? 'linear-gradient(135deg,#3BBDB4,#2BA9A0)' :
                            cell.type === 'blue'   ? 'linear-gradient(135deg,#2B8EC4,#1E7AB5)' :
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
            <div style={{
              position: 'absolute', bottom: -18, right: 20,
              background: '#fff', borderRadius: 12, padding: '11px 15px',
              boxShadow: '0 8px 32px rgba(26,77,110,.14)',
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
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: '.78rem', fontWeight: 700, color: navy }}>12 sessions booked</div>
                <div style={{ fontSize: '.68rem', color: g500 }}>Conflicts resolved automatically</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LOGOS STRIP ── */}
      <div style={{
        padding: '28px 2rem',
        borderTop: `1px solid ${g100}`,
        borderBottom: `1px solid ${g100}`,
        fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            fontSize: '.75rem', color: g500, fontWeight: 600,
            marginBottom: '1.1rem', textTransform: 'uppercase', letterSpacing: '.09em',
          }}>
            Trusted by growing ABA clinics across North America
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '3rem', flexWrap: 'wrap' }}>
            {['Beacon ABA','Clarity Clinic','Pathways','Summit Therapy','Bright Futures ABA'].map(name => (
              <span key={name} style={{
                fontFamily: "'Sora',sans-serif", fontSize: '.95rem',
                fontWeight: 700, color: '#C4D3DC', letterSpacing: '-.01em',
              }}>{name}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: '88px 2rem', background: '#fff', fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            fontFamily: "'Sora',sans-serif", fontSize: '.72rem', fontWeight: 700,
            letterSpacing: '.1em', textTransform: 'uppercase', color: teal, marginBottom: '.7rem',
          }}>Features</div>
          <h2 style={{
            fontFamily: "'Sora',sans-serif",
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
            ].map(f => (
              <div key={f.title} className="feature-card" style={{
                background: off, borderRadius: 16,
                padding: '1.75rem', border: `1px solid ${g100}`,
              }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 12, background: grad,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.1rem', fontSize: '1.25rem',
                }}>{f.icon}</div>
                <h3 style={{ fontFamily: "'Sora',sans-serif", fontSize: '1rem', fontWeight: 700, color: navy, marginBottom: '.45rem' }}>{f.title}</h3>
                <p style={{ fontSize: '.875rem', color: g700, lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ padding: '88px 2rem', background: off, fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            fontFamily: "'Sora',sans-serif", fontSize: '.72rem', fontWeight: 700,
            letterSpacing: '.1em', textTransform: 'uppercase', color: teal, marginBottom: '.7rem',
          }}>How it works</div>
          <h2 style={{
            fontFamily: "'Sora',sans-serif",
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
              { n: '2', title: 'Run AI matching',            desc: 'Tell Summit the session type and parameters. It surfaces the best matches instantly, color-coded by availability.' },
              { n: '3', title: 'Confirm & go',               desc: 'Review the proposed schedule, drag to adjust if needed, then confirm. Recurring sessions booked in bulk automatically.' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{
                  width: 54, height: 54, borderRadius: '50%',
                  background: grad, color: '#fff',
                  fontFamily: "'Sora',sans-serif", fontSize: '1.2rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.2rem',
                  boxShadow: '0 4px 18px rgba(43,142,196,.3)',
                }}>{s.n}</div>
                <h3 style={{ fontFamily: "'Sora',sans-serif", fontSize: '1rem', fontWeight: 700, color: navy, marginBottom: '.45rem' }}>{s.title}</h3>
                <p style={{ fontSize: '.875rem', color: g700, lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section className="testi-bg" style={{
        padding: '88px 2rem', background: '#0D2B3E',
        position: 'relative', overflow: 'hidden',
        fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{ maxWidth: 780, margin: '0 auto', textAlign: 'center' }}>
          <blockquote style={{
            fontFamily: "'Sora',sans-serif",
            fontSize: 'clamp(1.25rem,2.2vw,1.7rem)',
            fontWeight: 600, color: '#fff', lineHeight: 1.55, marginBottom: '2rem',
          }}>
            &ldquo;We used to spend 4 hours a week building the schedule. With Summit, it&rsquo;s done in 20 minutes — and there are zero double bookings.&rdquo;
          </blockquote>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div style={{
              width: 46, height: 46, borderRadius: '50%', background: grad,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Sora',sans-serif", fontWeight: 700, color: '#fff', fontSize: '.95rem',
            }}>SC</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, color: '#fff', fontSize: '.9rem' }}>Sarah Chen, BCBA-D</div>
              <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.45)' }}>Clinical Director, Clarity ABA Clinic</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section id="trial" style={{
        padding: '100px 2rem', background: grad,
        textAlign: 'center', position: 'relative', overflow: 'hidden',
        fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{ position: 'relative', maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Sora',sans-serif",
            fontSize: 'clamp(2rem,3.8vw,2.9rem)',
            fontWeight: 800, color: '#fff', marginBottom: '1rem', lineHeight: 1.2,
          }}>
            Ready to take your scheduling to the summit?
          </h2>
          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: '1.05rem', marginBottom: '2.5rem' }}>
            Start your free trial today. Set up in under 10 minutes.
          </p>
          <a href="/signup" style={{
            background: '#fff', color: navy,
            fontFamily: "'Sora',sans-serif", fontSize: '1rem', fontWeight: 700,
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
        background: '#0D2B3E', padding: '36px 2rem',
        borderTop: '1px solid rgba(255,255,255,.05)',
        fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontFamily: "'Sora',sans-serif", fontWeight: 800,
            color: 'rgba(255,255,255,.45)', fontSize: '1rem', letterSpacing: '-.01em',
          }}>SUMMIT</span>
          <div style={{ display: 'flex', gap: '2rem' }}>
            {([['Privacy','/privacy'],['Terms','/terms'],['Contact','/contact'],['Help','/help']] as [string,string][]).map(([label,href]) => (
              <a key={href} href={href} style={{ color: 'rgba(255,255,255,.4)', fontSize: '.82rem' }}>{label}</a>
            ))}
          </div>
          <span style={{ color: 'rgba(255,255,255,.28)', fontSize: '.78rem' }}>© 2026 Summit Client Inc.</span>
        </div>
      </footer>
    </>
  )
}
