import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventsCopy } from '@/lib/copy/events'

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`)
  }
}

const redirectMock = vi.fn((url: string) => {
  throw new RedirectSignal(url)
})
const revalidatePathMock = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

const authGetUser = vi.fn()
const profileSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

// Minimal chainable query double: every call is recorded as
// [table, op, ...args] and the chain resolves to whatever `results` holds
// for `${table}.${op}` (op = the first verb: select/insert/update/delete).
type Result = { data?: unknown; error?: unknown }
let results: Record<string, Result>
const calls: unknown[][] = []

function chain(table: string, op: string, payload?: unknown) {
  calls.push([table, op, payload])
  const resolve = () => Promise.resolve(results[`${table}.${op}`] ?? { data: null, error: null })
  const builder: Record<string, unknown> = {
    eq: (...args: unknown[]) => (calls.push([table, `${op}.eq`, ...args]), builder),
    select: () => builder,
    single: resolve,
    maybeSingle: resolve,
    then: (onFulfilled: (v: Result) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected),
  }
  return builder
}

const storageUpload = vi.fn()
const storageRemove = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => ({
      select: () => chain(table, 'select'),
      insert: (payload: unknown) => chain(table, 'insert', payload),
      update: (payload: unknown) => chain(table, 'update', payload),
      delete: () => chain(table, 'delete'),
    }),
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => storageUpload(...args),
        remove: (...args: unknown[]) => storageRemove(...args),
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/event-images/${path}` },
        }),
      }),
    },
  })),
}))

import {
  createEvent,
  updateEvent,
  toggleEventActive,
  deleteEvent,
  uploadEventImage,
  deleteEventImage,
} from './actions'

const errors = eventsCopy.admin.errors
const EVENT_ID = '11111111-1111-1111-1111-111111111111'
const PLACE_ID = '22222222-2222-2222-2222-222222222222'
const PACKAGE_ID = '33333333-3333-3333-3333-333333333333'
const IMAGE_URL = `https://x.supabase.co/storage/v1/object/public/event-images/events/${EVENT_ID}/old.webp`

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

const validFields = { title: 'Festival del Retorno', starts_on: '2026-12-14', cta_type: 'whatsapp', is_active: 'on' }

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  results = {}
  authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'admin' } })
})

describe('admin guard', () => {
  it('redirects anonymous visitors to /login', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(createEvent(form(validFields))).rejects.toThrow('redirect:/login')
    expect(calls).toHaveLength(0)
  })

  it('redirects non-admins home without touching the table', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(updateEvent(form({ ...validFields, eventId: EVENT_ID }))).rejects.toThrow('redirect:/')
    expect(calls).toHaveLength(0)
  })
})

describe('createEvent', () => {
  it('inserts the parsed fields and goes to the edit page', async () => {
    results['tourism_events.insert'] = { data: { id: EVENT_ID }, error: null }
    await expect(createEvent(form(validFields))).rejects.toThrow(`redirect:/admin/eventos/${EVENT_ID}/editar`)
    expect(calls).toContainEqual([
      'tourism_events',
      'insert',
      expect.objectContaining({ title: 'Festival del Retorno', cta_type: 'whatsapp', is_active: true }),
    ])
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('returns the validation error without inserting', async () => {
    expect(await createEvent(form({ ...validFields, title: '' }))).toEqual({ error: errors.titleRequired })
    expect(calls).toHaveLength(0)
  })

  it('rejects a place id that does not exist', async () => {
    results['places.select'] = { data: null }
    expect(await createEvent(form({ ...validFields, place_id: PLACE_ID }))).toEqual({ error: errors.invalidPlace })
    expect(calls.some((c) => c[1] === 'insert')).toBe(false)
  })

  it('rejects a package id that does not exist', async () => {
    results['packages.select'] = { data: null }
    expect(await createEvent(form({ ...validFields, cta_type: 'package', package_id: PACKAGE_ID }))).toEqual({
      error: errors.invalidPackage,
    })
  })

  it('accepts existing place and package references', async () => {
    results['places.select'] = { data: { id: PLACE_ID } }
    results['packages.select'] = { data: { id: PACKAGE_ID } }
    results['tourism_events.insert'] = { data: { id: EVENT_ID }, error: null }
    await expect(
      createEvent(form({ ...validFields, place_id: PLACE_ID, cta_type: 'package', package_id: PACKAGE_ID })),
    ).rejects.toThrow(RedirectSignal)
  })

  it('returns a generic error when the insert fails', async () => {
    results['tourism_events.insert'] = { data: null, error: { code: '23514' } }
    expect(await createEvent(form(validFields))).toEqual({ error: errors.generic })
  })
})

describe('updateEvent', () => {
  it('rejects a malformed event id', async () => {
    expect(await updateEvent(form({ ...validFields, eventId: 'nope' }))).toEqual({ error: errors.notFound })
  })

  it('updates the row scoped to its id and returns success', async () => {
    results['tourism_events.update'] = { data: [{ id: EVENT_ID }], error: null }
    expect(await updateEvent(form({ ...validFields, eventId: EVENT_ID }))).toEqual({ success: true })
    expect(calls).toContainEqual(['tourism_events', 'update.eq', 'id', EVENT_ID])
    expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/eventos/${EVENT_ID}/editar`)
  })

  it('reports not found when no row matched', async () => {
    results['tourism_events.update'] = { data: [], error: null }
    expect(await updateEvent(form({ ...validFields, eventId: EVENT_ID }))).toEqual({ error: errors.notFound })
  })

  it('reports a generic error when the update fails', async () => {
    results['tourism_events.update'] = { data: null, error: { code: 'x' } }
    expect(await updateEvent(form({ ...validFields, eventId: EVENT_ID }))).toEqual({ error: errors.generic })
  })
})

describe('toggleEventActive', () => {
  it('flips is_active', async () => {
    await toggleEventActive(form({ id: EVENT_ID, is_active: 'true' }))
    expect(calls).toContainEqual(['tourism_events', 'update', { is_active: false }])
  })

  it('ignores a malformed id', async () => {
    await toggleEventActive(form({ id: 'x', is_active: 'false' }))
    expect(calls).toHaveLength(0)
  })
})

describe('deleteEvent', () => {
  it('deletes the row and its stored image', async () => {
    results['tourism_events.select'] = { data: { id: EVENT_ID, image_url: IMAGE_URL } }
    results['tourism_events.delete'] = { error: null }
    expect(await deleteEvent(form({ eventId: EVENT_ID }))).toBeUndefined()
    expect(storageRemove).toHaveBeenCalledWith([`events/${EVENT_ID}/old.webp`])
  })

  it('returns not found for an unknown event', async () => {
    results['tourism_events.select'] = { data: null }
    expect(await deleteEvent(form({ eventId: EVENT_ID }))).toEqual({ error: errors.notFound })
  })

  it('keeps the image when the delete fails', async () => {
    results['tourism_events.select'] = { data: { id: EVENT_ID, image_url: IMAGE_URL } }
    results['tourism_events.delete'] = { error: { code: 'x' } }
    expect(await deleteEvent(form({ eventId: EVENT_ID }))).toEqual({ error: errors.deleteError })
    expect(storageRemove).not.toHaveBeenCalled()
  })
})

describe('uploadEventImage', () => {
  const image = () => {
    const fd = new FormData()
    fd.append('image', new File(['x'], 'a.webp', { type: 'image/webp' }))
    return fd
  }

  it('uploads, stores the public url, and removes the previous image', async () => {
    results['tourism_events.select'] = { data: { id: EVENT_ID, image_url: IMAGE_URL } }
    storageUpload.mockResolvedValue({ error: null })
    expect(await uploadEventImage(EVENT_ID, image())).toBeUndefined()
    expect(calls).toContainEqual([
      'tourism_events',
      'update',
      { image_url: expect.stringMatching(new RegExp(`event-images/events/${EVENT_ID}/.+\\.webp$`)) },
    ])
    expect(storageRemove).toHaveBeenCalledWith([`events/${EVENT_ID}/old.webp`])
  })

  it('rejects an invalid file type', async () => {
    results['tourism_events.select'] = { data: { id: EVENT_ID, image_url: null } }
    const fd = new FormData()
    fd.append('image', new File(['x'], 'a.gif', { type: 'image/gif' }))
    expect(await uploadEventImage(EVENT_ID, fd)).toEqual({ error: errors.invalidImageType })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('reports an upload failure', async () => {
    results['tourism_events.select'] = { data: { id: EVENT_ID, image_url: null } }
    storageUpload.mockResolvedValue({ error: { message: 'boom' } })
    expect(await uploadEventImage(EVENT_ID, image())).toEqual({ error: errors.uploadFailed })
  })

  it('rolls back the uploaded file when saving the url fails', async () => {
    results['tourism_events.select'] = { data: { id: EVENT_ID, image_url: null } }
    results['tourism_events.update'] = { error: { code: 'x' } }
    storageUpload.mockResolvedValue({ error: null })
    expect(await uploadEventImage(EVENT_ID, image())).toEqual({ error: errors.saveFailed })
    expect(storageRemove).toHaveBeenCalledWith([expect.stringMatching(new RegExp(`^events/${EVENT_ID}/`))])
  })

  it('rejects a malformed event id before any query', async () => {
    expect(await uploadEventImage('x', image())).toEqual({ error: errors.notFound })
    expect(authGetUser).not.toHaveBeenCalled()
  })
})

describe('deleteEventImage', () => {
  it('removes the current image and clears the column', async () => {
    results['tourism_events.select'] = { data: { id: EVENT_ID, image_url: IMAGE_URL } }
    expect(await deleteEventImage(EVENT_ID, IMAGE_URL)).toBeUndefined()
    expect(storageRemove).toHaveBeenCalledWith([`events/${EVENT_ID}/old.webp`])
    expect(calls).toContainEqual(['tourism_events', 'update', { image_url: null }])
  })

  it("refuses to remove a url that isn't the event's own image", async () => {
    results['tourism_events.select'] = { data: { id: EVENT_ID, image_url: IMAGE_URL } }
    const other = 'https://x.supabase.co/storage/v1/object/public/event-images/events/other/x.webp'
    expect(await deleteEventImage(EVENT_ID, other)).toEqual({ error: errors.notFound })
    expect(storageRemove).not.toHaveBeenCalled()
  })
})
