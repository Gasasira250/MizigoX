import { useAuth } from '../auth'
import { PageHeader } from '../components/system'
import { roleLabel } from '../format'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  return (
    <div>
      <PageHeader kicker="Management" title="Settings" subtitle="Your workspace profile. Sign-in stays on this device until you sign out." />
      <section className="panel">
        <h2>Profile</h2>
        <dl className="meta">
          <div>
            <dt>Name</dt>
            <dd>{user?.name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{roleLabel(user?.role)}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{user?.phone || '—'}</dd>
          </div>
        </dl>
        <div className="advance">
          <button type="button" className="ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </section>
    </div>
  )
}
