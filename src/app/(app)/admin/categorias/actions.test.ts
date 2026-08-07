import { describe, it, expect, vi, beforeEach } from 'vitest'

// The slug auto-generation (accent stripping, character filtering, 50-char
// truncation) is the one piece of real logic in this file worth pinning
// down precisely — a bad slug either breaks the unique constraint in a
// confusing way or silently produces something unreadable.

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

const maxSortOrderSingle = vi.fn()
const categoryInsertMock = vi.fn()
const toggleUpdateMock = vi.fn()
const deleteEqMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table !== 'business_categories') throw new Error(`unexpected table on admin client: ${table}`)
      return {
        select: () => ({ order: () => ({ limit: () => ({ single: maxSortOrderSingle }) }) }),
        insert: (payload: unknown) => categoryInsertMock(payload),
        update: (payload: unknown) => ({ eq: (col: string, val: string) => toggleUpdateMock(payload, col, val) }),
        delete: () => ({ eq: (col: string, val: string) => deleteEqMock(col, val) }),
      }
    },
  })),
}))

const { createCategory, toggleCategoryActive, deleteCategory } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'admin' } })
  maxSortOrderSingle.mockResolvedValue({ data: { sort_order: 3 } })
})

describe('getAuthenticatedAdmin guard', () => {
  it('redirects to /login when unauthenticated', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    const fd = formData({ name: 'Cabaña' })
    await expect(createCategory(fd)).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the user is not an admin', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'business_owner' } })
    const fd = formData({ name: 'Cabaña' })
    await expect(createCategory(fd)).rejects.toThrow('redirect:/')
  })

  it('redirects to / when a non-admin calls toggleCategoryActive', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({ id: 'cat-1', is_active: 'true' })
    await expect(toggleCategoryActive(fd)).rejects.toThrow('redirect:/')
    expect(toggleUpdateMock).not.toHaveBeenCalled()
  })

  it('redirects to / when a non-admin calls deleteCategory', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({ id: 'cat-1' })
    await expect(deleteCategory(fd)).rejects.toThrow('redirect:/')
    expect(deleteEqMock).not.toHaveBeenCalled()
  })
})

describe('createCategory — slug generation', () => {
  it('rejects a missing name', async () => {
    const fd = formData({ name: '  ' })
    const result = await createCategory(fd)
    expect(result).toEqual({ error: 'El nombre es obligatorio.' })
    expect(categoryInsertMock).not.toHaveBeenCalled()
  })

  it('rejects when the name field is absent from formData entirely', async () => {
    const fd = new FormData()
    const result = await createCategory(fd)
    expect(result).toEqual({ error: 'El nombre es obligatorio.' })
    expect(categoryInsertMock).not.toHaveBeenCalled()
  })

  it('generates a lowercase, underscore-separated slug', async () => {
    categoryInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Casa de campo' })
    await createCategory(fd)
    expect(categoryInsertMock).toHaveBeenCalledWith(expect.objectContaining({ slug: 'casa_de_campo' }))
  })

  it('strips accents from the slug', async () => {
    categoryInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Cafetería' })
    await createCategory(fd)
    expect(categoryInsertMock).toHaveBeenCalledWith(expect.objectContaining({ slug: 'cafeteria' }))
  })

  it('filters out characters that are not letters, numbers, or underscores', async () => {
    categoryInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: "Bar & Grill! (24/7)" })
    await createCategory(fd)
    const payload = categoryInsertMock.mock.calls[0][0] as { slug: string }
    expect(payload.slug).toMatch(/^[a-z0-9_]+$/)
  })

  it('rejects a name that produces an empty slug (e.g. only symbols/emoji)', async () => {
    const fd = formData({ name: '🎉🎊' })
    const result = await createCategory(fd)
    expect(result).toEqual({ error: 'El slug solo puede contener letras, números y guiones bajos.' })
    expect(categoryInsertMock).not.toHaveBeenCalled()
  })

  it('truncates the slug to 50 characters', async () => {
    categoryInsertMock.mockResolvedValue({ error: null })
    const longName = 'palabra '.repeat(20) // way over 50 chars once slugified
    const fd = formData({ name: longName })
    await createCategory(fd)
    const payload = categoryInsertMock.mock.calls[0][0] as { slug: string }
    expect(payload.slug.length).toBeLessThanOrEqual(50)
  })
})

describe('createCategory — sort order and errors', () => {
  it('places the new category after the current max sort_order', async () => {
    maxSortOrderSingle.mockResolvedValue({ data: { sort_order: 7 } })
    categoryInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Cabaña' })
    await createCategory(fd)
    expect(categoryInsertMock).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 8 }))
  })

  it('defaults sort_order to 1 when there are no existing categories', async () => {
    maxSortOrderSingle.mockResolvedValue({ data: null })
    categoryInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Cabaña' })
    await createCategory(fd)
    expect(categoryInsertMock).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 1 }))
  })

  it('maps a unique-constraint violation (23505) to the slugTaken copy', async () => {
    categoryInsertMock.mockResolvedValue({ error: { code: '23505' } })
    const fd = formData({ name: 'Cabaña' })
    const result = await createCategory(fd)
    expect(result).toEqual({ error: 'Ya existe una categoría con ese slug.' })
  })

  it('maps any other insert error to the generic copy', async () => {
    categoryInsertMock.mockResolvedValue({ error: { code: '99999' } })
    const fd = formData({ name: 'Cabaña' })
    const result = await createCategory(fd)
    expect(result).toEqual({ error: 'Error al guardar. Intenta de nuevo.' })
  })

  it('returns success on a clean insert', async () => {
    categoryInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Cabaña' })
    const result = await createCategory(fd)
    expect(result).toEqual({ success: true })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/categorias')
  })
})

describe('toggleCategoryActive', () => {
  it('does nothing when id is missing', async () => {
    const fd = formData({ is_active: 'true' })
    await toggleCategoryActive(fd)
    expect(toggleUpdateMock).not.toHaveBeenCalled()
  })

  it('flips is_active to false when currently true', async () => {
    const fd = formData({ id: 'cat-1', is_active: 'true' })
    await toggleCategoryActive(fd)
    expect(toggleUpdateMock).toHaveBeenCalledWith({ is_active: false }, 'id', 'cat-1')
  })

  it('flips is_active to true when currently false', async () => {
    const fd = formData({ id: 'cat-1', is_active: 'false' })
    await toggleCategoryActive(fd)
    expect(toggleUpdateMock).toHaveBeenCalledWith({ is_active: true }, 'id', 'cat-1')
  })
})

describe('deleteCategory', () => {
  it('does nothing when id is missing', async () => {
    await deleteCategory(new FormData())
    expect(deleteEqMock).not.toHaveBeenCalled()
  })

  it('deletes the category by id', async () => {
    const fd = formData({ id: 'cat-1' })
    await deleteCategory(fd)
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'cat-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/categorias')
  })
})
