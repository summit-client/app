const sidebarItems = [
  'Dashboard',
  'Appointments',
  'Progress',
  'Messages',
  'Documents',
  'Consents',
  'Settings',
]

export default function ClientDashboard() {
  return (
    <div className="client-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">▲</div>

          <div>
            <strong>Summit</strong>
            <span>CLIENT PORTAL</span>
          </div>
        </div>

        <p className="sidebar-label">FAMILY PORTAL</p>

        <nav className="sidebar-nav">
          {sidebarItems.map(item => (
            <button
              key={item}
              className={item === 'Dashboard' ? 'sidebar-link active' : 'sidebar-link'}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <h1>Dashboard</h1>
            <p>Welcome back. Here is an overview of your child’s care.</p>
          </div>

          <select className="child-selector" defaultValue="Ava">
            <option value="Ava">Ava Bennett</option>
            <option value="Noah">Noah Bennett</option>
          </select>
        </header>

        <section className="summary-grid">
          <article className="summary-card">
            <span>Upcoming sessions</span>
            <strong>3</strong>
            <p>scheduled this week</p>
          </article>

          <article className="summary-card">
            <span>Skills mastered</span>
            <strong>8</strong>
            <p>2 added this month</p>
          </article>

          <article className="summary-card">
            <span>Active goals</span>
            <strong>5</strong>
            <p>1 close to completion</p>
          </article>

          <article className="summary-card">
            <span>Unread messages</span>
            <strong>2</strong>
            <p>from your care team</p>
          </article>
        </section>

        <section className="dashboard-grid">
          <article className="dashboard-card upcoming-card">
            <div className="card-heading">
              <div>
                <h2>Upcoming Sessions</h2>
                <p>Your next scheduled appointments</p>
              </div>

              <button className="text-button">View all</button>
            </div>

            <div className="session-item">
              <div className="date-box">
                <strong>18</strong>
                <span>JUL</span>
              </div>

              <div className="session-details">
                <strong>Direct Therapy</strong>
                <span>10:00 AM – 10:50 AM</span>
                <span>Rachel Kim · Summit Main Clinic</span>
              </div>

              <span className="status-pill">Confirmed</span>
            </div>

            <div className="session-item">
              <div className="date-box">
                <strong>21</strong>
                <span>JUL</span>
              </div>

              <div className="session-details">
                <strong>Assessment</strong>
                <span>1:30 PM – 2:20 PM</span>
                <span>Dr. Sarah Chen · Virtual</span>
              </div>

              <span className="status-pill virtual">Virtual</span>
            </div>
          </article>

          <article className="dashboard-card">
            <div className="card-heading">
              <div>
                <h2>Progress Snapshot</h2>
                <p>This month’s progress</p>
              </div>
            </div>

            <div className="progress-row">
              <div>
                <strong>Communication</strong>
                <span>75% complete</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill communication" />
              </div>
            </div>

            <div className="progress-row">
              <div>
                <strong>Daily Living</strong>
                <span>60% complete</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill living" />
              </div>
            </div>

            <div className="progress-row">
              <div>
                <strong>Social Skills</strong>
                <span>45% complete</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill social" />
              </div>
            </div>
          </article>

          <article className="dashboard-card">
            <div className="card-heading">
              <div>
                <h2>Announcements</h2>
                <p>Updates from your clinic</p>
              </div>
            </div>

            <div className="announcement">
              <strong>Summer schedule update</strong>
              <p>Clinic hours will change beginning July 22.</p>
              <span>Posted 2 days ago</span>
            </div>

            <div className="announcement">
              <strong>New progress report available</strong>
              <p>Your latest monthly report is ready to review.</p>
              <span>Posted 5 days ago</span>
            </div>
          </article>

          <article className="dashboard-card">
            <div className="card-heading">
              <div>
                <h2>Sensory Check-In</h2>
                <p>How is your child feeling today?</p>
              </div>
            </div>

            <div className="sensory-options">
              <button>Calm</button>
              <button>Happy</button>
              <button>Tired</button>
              <button>Overwhelmed</button>
            </div>

            <button className="primary-button">Submit Check-In</button>
          </article>
        </section>
      </main>
    </div>
  )
}