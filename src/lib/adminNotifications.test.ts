import { describe, it, expect, vi } from 'vitest'
import { resolveAdminEmails } from './adminNotifications'

// resolveAdminEmails takes the admin client as a plain parameter, so it
// needs no module mocking — a small fake client is enough.
function fakeAdminClient(opts: {
  profilesResult: { data: { id: string }[] | null; error: { message: string } | null }
  emailsById: Record<string, string | null>
}) {
  return {
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => Promise.resolve(opts.profilesResult) }) }
      }
      throw new Error(`unexpected table: ${table}`)
    },
    auth: {
      admin: {
        getUserById: (id: string) => Promise.resolve({ data: { user: opts.emailsById[id] ? { email: opts.emailsById[id] } : null } }),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('resolveAdminEmails', () => {
  it('resolves every admin profile to its auth email', async () => {
    const admin = fakeAdminClient({
      profilesResult: { data: [{ id: 'admin-1' }, { id: 'admin-2' }], error: null },
      emailsById: { 'admin-1': 'admin1@mantur.co', 'admin-2': 'admin2@mantur.co' },
    })

    const emails = await resolveAdminEmails(admin)

    expect(emails).toEqual(['admin1@mantur.co', 'admin2@mantur.co'])
  })

  it('skips an admin with no resolvable auth email', async () => {
    const admin = fakeAdminClient({
      profilesResult: { data: [{ id: 'admin-1' }, { id: 'admin-2' }], error: null },
      emailsById: { 'admin-2': 'admin2@mantur.co' },
    })

    const emails = await resolveAdminEmails(admin)

    expect(emails).toEqual(['admin2@mantur.co'])
  })

  it('returns an empty array when there are no admin profiles', async () => {
    const admin = fakeAdminClient({ profilesResult: { data: [], error: null }, emailsById: {} })

    const emails = await resolveAdminEmails(admin)

    expect(emails).toEqual([])
  })

  it('logs and returns an empty array (never throws) when the profiles lookup itself fails', async () => {
    const admin = fakeAdminClient({ profilesResult: { data: null, error: { message: 'connection reset' } }, emailsById: {} })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const emails = await resolveAdminEmails(admin)

    expect(emails).toEqual([])
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to look up admin profiles', { message: 'connection reset' })
    consoleErrorSpy.mockRestore()
  })
})
