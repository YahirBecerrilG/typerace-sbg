import { useI18n } from '../i18n'
import { AppShell } from './ui/AppShell'

/**
 * The screen shown when a private route resolves to a tournament the signed-in
 * user is not allowed to see.
 *
 * With RLS scoped to "host or participant" (migration 007), a stranger's
 * tournament is indistinguishable from one that does not exist: the query comes
 * back empty and PostgREST raises PGRST116. That is deliberate — a page that said
 * "access denied" for a real tournament would confirm it exists.
 *
 * So the wording stays neutral: it never says whether the tournament is real.
 * An actual error message, when there is one, is shown verbatim because it comes
 * from the server and is not ours to reword.
 */
export default function TournamentUnavailable({ error, title }) {
  const { t } = useI18n()

  return (
    <AppShell maxWidth={520}>
      <main className="flex min-h-[80vh] flex-col items-center justify-center text-center">
        <span className="mb-4 text-[44px] leading-none" aria-hidden="true">🗂️</span>

        <h1
          className="font-racing mb-3 text-2xl font-extrabold"
          style={{ color: 'var(--text-primary)' }}
        >
          {error ? t('error.couldNotLoadTournament') : title || t('error.tournamentNotFound')}
        </h1>

        <p className="max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
          {error ? error.message : t('error.tournamentNotFound')}
        </p>

        {error?.code && (
          <p className="font-mono mt-3 text-xs" style={{ color: 'var(--danger)' }}>
            {error.code}
          </p>
        )}

        <a className="btn-primary btn-lg mt-7" href="/dashboard">
          {t('common.backToDashboard')}
        </a>
      </main>
    </AppShell>
  )
}
