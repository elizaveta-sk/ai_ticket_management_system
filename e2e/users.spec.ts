import { expect, test, type Page } from '@playwright/test'

const adminEmail = () => process.env.ADMIN_EMAIL!
const adminPassword = () => process.env.ADMIN_PASSWORD!
const agentEmail = () => process.env.AGENT_EMAIL!
const agentPassword = () => process.env.AGENT_PASSWORD!

/** Logs in through the form and waits for the signed-in home page. */
async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

test.describe('GET /api/users', () => {
  test('returns 401 when signed out', async ({ request }) => {
    const res = await request.get('/api/users')
    expect(res.status()).toBe(401)
  })

  test('returns 403 with { error: "Forbidden" } for an agent', async ({ page }) => {
    await login(page, agentEmail(), agentPassword())
    const res = await page.request.get('/api/users')
    expect(res.status()).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  test('returns only the five allowed fields for an admin', async ({ page }) => {
    await login(page, adminEmail(), adminPassword())
    const res = await page.request.get('/api/users')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Object.keys(body)).toEqual(['users'])
    expect(Array.isArray(body.users)).toBe(true)
    expect(body.users.length).toBeGreaterThanOrEqual(2)
    for (const user of body.users) {
      expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role'])
    }
    const emails = body.users.map((u: { email: string }) => u.email)
    expect(emails).toContain(adminEmail())
    expect(emails).toContain(agentEmail())
    const raw = JSON.stringify(body).toLowerCase()
    expect(raw).not.toContain('password')
    expect(raw).not.toContain('token')
    expect(raw).not.toContain('session')
  })
})

test.describe('/users page', () => {
  test('admin sees the table with headers and rows for admin and agent', async ({ page }) => {
    await login(page, adminEmail(), adminPassword())
    await page.getByRole('link', { name: 'Users' }).click()
    await expect(page).toHaveURL(/\/users$/)
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()

    for (const name of ['Name', 'Email', 'Role', 'Created']) {
      await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible()
    }

    const adminRow = page.getByRole('row').filter({ hasText: adminEmail() })
    await expect(adminRow).toBeVisible()
    await expect(adminRow.getByText('admin', { exact: true })).toBeVisible()

    const agentRow = page.getByRole('row').filter({ hasText: agentEmail() })
    await expect(agentRow).toBeVisible()
    await expect(agentRow.getByText('Test Agent')).toBeVisible()
    await expect(agentRow.getByText('agent', { exact: true })).toBeVisible()
  })

  test('agent has no Users link and is redirected from /users to /', async ({ page }) => {
    await login(page, agentEmail(), agentPassword())
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0)
    await page.goto('/users')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Users' })).toHaveCount(0)
  })

  test('signed-out visitor is redirected to /login', async ({ page }) => {
    await page.goto('/users')
    await expect(page).toHaveURL(/\/login$/)
  })
})

/** Unique lowercase email per call so re-runs never collide. */
function uniqueEmail(prefix = 'new-agent') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
}

const validPassword = 'Sup3r-secret-pw'

async function loginAsAdmin(page: Page) {
  await login(page, adminEmail(), adminPassword())
}

async function createViaApi(
  page: Page,
  data: Record<string, unknown>,
) {
  return page.request.post('/api/users', { data })
}

async function listEmails(page: Page): Promise<string[]> {
  const res = await page.request.get('/api/users')
  const body = await res.json()
  return body.users.map((u: { email: string }) => u.email)
}

test.describe('POST /api/users access', () => {
  test('returns 401 when signed out and creates nothing', async ({ request }) => {
    const email = uniqueEmail('anon')
    const res = await request.post('/api/users', {
      data: { name: 'Anon Person', email, password: validPassword },
    })
    expect(res.status()).toBe(401)
  })

  test('returns 403 for an agent and creates nothing', async ({ page, browser }) => {
    const email = uniqueEmail('byagent')
    await login(page, agentEmail(), agentPassword())
    const res = await createViaApi(page, { name: 'By Agent', email, password: validPassword })
    expect(res.status()).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })

    const adminCtx = await browser.newContext()
    const adminPage = await adminCtx.newPage()
    await loginAsAdmin(adminPage)
    expect(await listEmails(adminPage)).not.toContain(email)
    await adminCtx.close()
  })
})

test.describe('POST /api/users validation and behaviour', () => {
  test('rejects short name, invalid email and short password with 400', async ({ page }) => {
    await loginAsAdmin(page)
    const cases = [
      { name: 'ab', email: uniqueEmail('v'), password: validPassword },
      { name: '   a  ', email: uniqueEmail('v'), password: validPassword },
      { name: 'Valid Name', email: 'not-an-email', password: validPassword },
      { name: 'Valid Name', email: uniqueEmail('v'), password: 'short' },
    ]
    for (const data of cases) {
      const res = await createViaApi(page, data)
      expect(res.status(), JSON.stringify(data)).toBe(400)
      const body = await res.json()
      expect(typeof body.error).toBe('string')
      expect(body.error.length).toBeGreaterThan(0)
    }
    const emails = await listEmails(page)
    for (const data of cases) expect(emails).not.toContain(data.email)
  })

  test('creates an agent even when role admin is sent, without leaking secrets', async ({ page }) => {
    await loginAsAdmin(page)
    const email = uniqueEmail('role')
    const res = await createViaApi(page, {
      name: 'Role Tester',
      email,
      password: validPassword,
      role: 'admin',
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(Object.keys(body)).toEqual(['user'])
    expect(Object.keys(body.user).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role'])
    expect(body.user.role).toBe('agent')
    expect(body.user.email).toBe(email)
    const raw = JSON.stringify(body).toLowerCase()
    expect(raw).not.toContain('password')
    expect(raw).not.toContain('hash')

    const list = await (await page.request.get('/api/users')).json()
    const created = list.users.find((u: { email: string }) => u.email === email)
    expect(created.role).toBe('agent')
  })

  test('duplicate email returns 409 and keeps the original password', async ({ page, browser }) => {
    await loginAsAdmin(page)
    const email = uniqueEmail('dup')
    const first = await createViaApi(page, { name: 'Original User', email, password: validPassword })
    expect(first.status()).toBe(201)

    const second = await createViaApi(page, {
      name: 'Impostor User',
      email,
      password: 'Different-pw-123',
    })
    expect(second.status()).toBe(409)
    expect(await second.json()).toEqual({ error: 'A user with this email already exists' })

    // Same address in different case is the same user.
    const third = await createViaApi(page, {
      name: 'Impostor User',
      email: email.toUpperCase(),
      password: 'Different-pw-123',
    })
    expect(third.status()).toBe(409)

    const ctx = await browser.newContext()
    const userPage = await ctx.newPage()
    await login(userPage, email, validPassword)
    await ctx.close()

    // The impostor password must not work.
    const ctx2 = await browser.newContext()
    const res = await ctx2.request.post('/api/auth/sign-in/email', {
      data: { email, password: 'Different-pw-123' },
      headers: { Origin: 'http://localhost:5174' },
    })
    expect(res.ok()).toBe(false)
    await ctx2.close()
  })
})

test.describe('create user dialog', () => {
  async function openDialog(page: Page) {
    await loginAsAdmin(page)
    await page.goto('/users')
    await page.getByRole('button', { name: 'New user' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    return dialog
  }

  test('invalid values show inline errors and the modal stays open', async ({ page }) => {
    const dialog = await openDialog(page)
    await dialog.getByLabel('Name').fill('ab')
    await dialog.getByLabel('Email').fill('not-an-email')
    await dialog.getByLabel('Password').fill('short')
    await dialog.getByRole('button', { name: 'Create user' }).click()

    await expect(dialog.getByText('Name must be at least 3 characters')).toBeVisible()
    await expect(dialog.getByText('Enter a valid email address')).toBeVisible()
    await expect(dialog.getByText('Password must be at least 8 characters')).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  test('Cancel closes the modal', async ({ page }) => {
    const dialog = await openDialog(page)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })

  test('valid values close the modal, add an agent row, and the user can sign in as an agent', async ({
    page,
    browser,
  }) => {
    const email = uniqueEmail('ui')
    const dialog = await openDialog(page)
    await dialog.getByLabel('Name').fill('UI Created Agent')
    await dialog.getByLabel('Email').fill(email)
    await dialog.getByLabel('Password').fill(validPassword)
    await dialog.getByRole('button', { name: 'Create user' }).click()

    await expect(dialog).toBeHidden()
    const row = page.getByRole('row').filter({ hasText: email })
    await expect(row).toBeVisible()
    await expect(row.getByText('UI Created Agent')).toBeVisible()
    await expect(row.getByText('agent', { exact: true })).toBeVisible()

    const ctx = await browser.newContext()
    const userPage = await ctx.newPage()
    await login(userPage, email, validPassword)
    await expect(userPage.getByRole('link', { name: 'Users' })).toHaveCount(0)
    await userPage.goto('/users')
    await expect(userPage).toHaveURL('/')
    expect((await userPage.request.get('/api/users')).status()).toBe(403)
    await ctx.close()
  })

  test('mixed-case email is stored lowercased and the user can sign in', async ({
    page,
    browser,
  }) => {
    const lower = uniqueEmail('mixed')
    const mixed = lower.replace(/^(\w)/, (c) => c.toUpperCase()).replace('@example', '@Example')
    expect(mixed).not.toBe(lower)

    const dialog = await openDialog(page)
    await dialog.getByLabel('Name').fill('Mixed Case')
    await dialog.getByLabel('Email').fill(mixed)
    await dialog.getByLabel('Password').fill(validPassword)
    await dialog.getByRole('button', { name: 'Create user' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByRole('row').filter({ hasText: lower })).toBeVisible()
    expect(await listEmails(page)).toContain(lower)
    expect(await listEmails(page)).not.toContain(mixed)

    const ctx = await browser.newContext()
    const userPage = await ctx.newPage()
    await login(userPage, lower, validPassword)
    await ctx.close()
  })

  test('duplicate email shows the server error in the modal, which stays open', async ({ page }) => {
    await loginAsAdmin(page)
    const email = uniqueEmail('uidup')
    expect((await createViaApi(page, { name: 'First One', email, password: validPassword })).status()).toBe(201)

    await page.goto('/users')
    await page.getByRole('button', { name: 'New user' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Second One')
    await dialog.getByLabel('Email').fill(email)
    await dialog.getByLabel('Password').fill(validPassword)
    await dialog.getByRole('button', { name: 'Create user' }).click()

    await expect(dialog.getByRole('alert')).toContainText('A user with this email already exists')
    await expect(dialog).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Edit user
// ---------------------------------------------------------------------------

type ApiUser = { id: string; name: string; email: string; role: string; createdAt: string }

/** Creates an agent through the API and returns it with the password it was created with. */
async function createAgent(page: Page, prefix = 'edit') {
  const email = uniqueEmail(prefix)
  const name = `Edit Target ${Math.random().toString(36).slice(2, 8)}`
  const res = await createViaApi(page, { name, email, password: validPassword })
  expect(res.status()).toBe(201)
  const { user } = (await res.json()) as { user: ApiUser }
  return user
}

async function getUser(page: Page, id: string): Promise<ApiUser> {
  const body = await (await page.request.get('/api/users')).json()
  return body.users.find((u: ApiUser) => u.id === id)
}

function putUser(page: Page, id: string, data: Record<string, unknown>) {
  return page.request.put(`/api/users/${id}`, { data })
}

/** Plain credential sign-in against the API, in a fresh context. Returns the HTTP status. */
async function signInStatus(browser: import('@playwright/test').Browser, email: string, password: string) {
  const ctx = await browser.newContext()
  const res = await ctx.request.post('/api/auth/sign-in/email', {
    data: { email, password },
    headers: { Origin: 'http://localhost:5174' },
  })
  const status = res.status()
  await ctx.close()
  return status
}

test.describe('PUT /api/users/:id access', () => {
  test('returns 401 when signed out and leaves the user unchanged', async ({ page, request }) => {
    await loginAsAdmin(page)
    const target = await createAgent(page, 'put-anon')
    const res = await request.put(`/api/users/${target.id}`, {
      data: { name: 'Hacked Name', email: uniqueEmail('hacked'), password: '' },
    })
    expect(res.status()).toBe(401)
    expect(await getUser(page, target.id)).toEqual(target)
  })

  test('returns 403 for an agent and leaves the user unchanged', async ({ page, browser }) => {
    const adminCtx = await browser.newContext()
    const adminPage = await adminCtx.newPage()
    await loginAsAdmin(adminPage)
    const target = await createAgent(adminPage, 'put-agent')

    await login(page, agentEmail(), agentPassword())
    const res = await putUser(page, target.id, {
      name: 'Hacked Name',
      email: uniqueEmail('hacked'),
      password: 'Hacked-pw-123',
    })
    expect(res.status()).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })

    expect(await getUser(adminPage, target.id)).toEqual(target)
    expect(await signInStatus(browser, target.email, validPassword)).toBe(200)
    await adminCtx.close()
  })
})

test.describe('PUT /api/users/:id behaviour', () => {
  test('rejects invalid name, email and short password with 400', async ({ page }) => {
    await loginAsAdmin(page)
    const target = await createAgent(page, 'put-val')
    const cases = [
      { name: 'ab', email: target.email, password: '' },
      { name: target.name, email: 'not-an-email', password: '' },
      { name: target.name, email: target.email, password: 'short' },
    ]
    for (const data of cases) {
      const res = await putUser(page, target.id, data)
      expect(res.status(), JSON.stringify(data)).toBe(400)
      const body = await res.json()
      expect(typeof body.error).toBe('string')
      expect(body.error.length).toBeGreaterThan(0)
    }
    expect(await getUser(page, target.id)).toEqual(target)
    expect((await putUser(page, target.id, { name: target.name, email: target.email, password: 'a'.repeat(129) })).status()).toBe(400)
  })

  test('returns 404 for an unknown id', async ({ page }) => {
    await loginAsAdmin(page)
    const res = await putUser(page, 'no-such-user-id', {
      name: 'Ghost User',
      email: uniqueEmail('ghost'),
      password: '',
    })
    expect(res.status()).toBe(404)
    expect(await res.json()).toEqual({ error: 'User not found' })
  })

  test('returns 409 when the email belongs to another user and changes nothing', async ({ page }) => {
    await loginAsAdmin(page)
    const a = await createAgent(page, 'put-a')
    const b = await createAgent(page, 'put-b')
    const res = await putUser(page, b.id, { name: 'Renamed Person', email: a.email, password: '' })
    expect(res.status()).toBe(409)
    expect(await res.json()).toEqual({ error: 'A user with this email already exists' })
    expect(await getUser(page, b.id)).toEqual(b)
    expect(await getUser(page, a.id)).toEqual(a)
  })

  test('ignores role in the body and returns only the five allowed fields', async ({ page }) => {
    await loginAsAdmin(page)
    const target = await createAgent(page, 'put-role')
    const res = await putUser(page, target.id, {
      name: 'Still An Agent',
      email: target.email,
      password: '',
      role: 'admin',
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Object.keys(body)).toEqual(['user'])
    expect(Object.keys(body.user).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role'])
    expect(body.user.role).toBe('agent')
    expect(body.user.name).toBe('Still An Agent')
    const raw = JSON.stringify(body).toLowerCase()
    expect(raw).not.toContain('password')
    expect(raw).not.toContain('hash')
    expect((await getUser(page, target.id)).role).toBe('agent')
  })

  test('saving with the same email is not a false 409', async ({ page }) => {
    await loginAsAdmin(page)
    const target = await createAgent(page, 'put-same')
    const res = await putUser(page, target.id, { name: 'Renamed Same', email: target.email, password: '' })
    expect(res.status()).toBe(200)
    expect((await res.json()).user.email).toBe(target.email)
  })

  test('blank password keeps the old password', async ({ page, browser }) => {
    await loginAsAdmin(page)
    const target = await createAgent(page, 'put-keep')
    const res = await putUser(page, target.id, { name: 'Keeps Old Login', email: target.email, password: '' })
    expect(res.status()).toBe(200)
    expect(await signInStatus(browser, target.email, validPassword)).toBe(200)
  })

  test('new password signs in, old one fails, and an open session is revoked', async ({ page, browser }) => {
    await loginAsAdmin(page)
    const target = await createAgent(page, 'put-pw')
    const newPassword = 'Brand-new-pw-456'

    const userCtx = await browser.newContext()
    const userPage = await userCtx.newPage()
    await login(userPage, target.email, validPassword)
    expect((await userPage.request.get('/api/me')).status()).toBe(200)

    const res = await putUser(page, target.id, { name: target.name, email: target.email, password: newPassword })
    expect(res.status()).toBe(200)

    expect(await signInStatus(browser, target.email, newPassword)).toBe(200)
    expect(await signInStatus(browser, target.email, validPassword)).not.toBe(200)
    expect((await userPage.request.get('/api/me')).status()).toBe(401)
    await userCtx.close()

    // The admin's own session is unaffected.
    expect((await page.request.get('/api/me')).status()).toBe(200)
  })
})

test.describe('edit user dialog', () => {
  /** Expects the page to be signed in as the admin already. */
  async function openEdit(page: Page, user: ApiUser) {
    await page.goto('/users')
    const row = page.getByRole('row').filter({ hasText: user.email })
    await row.getByRole('button', { name: `Edit ${user.name}` }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Edit user' })).toBeVisible()
    return { dialog, row }
  }

  test('every row has an edit button and the dialog opens prefilled with a blank password', async ({ page }) => {
    await loginAsAdmin(page)
    const target = await createAgent(page, 'ui-open')
    await page.goto('/users')
    await expect(page.getByRole('button', { name: /^Edit / }).first()).toBeVisible()
    const rows = page.getByRole('row').filter({ has: page.getByRole('cell') })
    const count = await rows.count()
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i).getByRole('button', { name: /^Edit / })).toBeVisible()
    }

    const row = page.getByRole('row').filter({ hasText: target.email })
    await row.getByRole('button', { name: `Edit ${target.name}` }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Edit user' })).toBeVisible()
    await expect(dialog.getByLabel('Name')).toHaveValue(target.name)
    await expect(dialog.getByLabel('Email')).toHaveValue(target.email)
    await expect(dialog.getByLabel('Password')).toHaveValue('')
    await expect(dialog.getByText('Leave blank to keep the current password.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeVisible()
  })

  test('saving a changed name closes the dialog and updates the row', async ({ page }) => {
    await loginAsAdmin(page)
    const target = await createAgent(page, 'ui-name')
    const newName = `Renamed ${Math.random().toString(36).slice(2, 8)}`
    await page.goto('/users')
    const row = page.getByRole('row').filter({ hasText: target.email })
    await row.getByRole('button', { name: `Edit ${target.name}` }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog).toBeHidden()
    await expect(row.getByText(newName)).toBeVisible()
    await expect(row.getByRole('button', { name: `Edit ${newName}` })).toBeVisible()
    expect((await getUser(page, target.id)).name).toBe(newName)
  })

  test('invalid values show inline errors and the dialog stays open', async ({ page }) => {
    await loginAsAdmin(page)
    const target = await createAgent(page, 'ui-inv')
    const { dialog } = await openEdit(page, target)
    await dialog.getByLabel('Name').fill('ab')
    await dialog.getByLabel('Email').fill('not-an-email')
    await dialog.getByLabel('Password').fill('short')
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog.getByText('Name must be at least 3 characters')).toBeVisible()
    await expect(dialog.getByText('Enter a valid email address')).toBeVisible()
    await expect(dialog.getByText('Password must be at least 8 characters')).toBeVisible()
    await expect(dialog).toBeVisible()
    expect(await getUser(page, target.id)).toEqual(target)
  })

  test('duplicate email shows the server error and the dialog stays open', async ({ page }) => {
    await loginAsAdmin(page)
    const a = await createAgent(page, 'ui-dup-a')
    const b = await createAgent(page, 'ui-dup-b')
    const { dialog } = await openEdit(page, b)
    await dialog.getByLabel('Email').fill(a.email)
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog.getByRole('alert')).toContainText('A user with this email already exists')
    await expect(dialog).toBeVisible()
    expect(await getUser(page, b.id)).toEqual(b)
  })

  test('Cancel discards edits', async ({ page }) => {
    await loginAsAdmin(page)
    const target = await createAgent(page, 'ui-cancel')
    const { dialog, row } = await openEdit(page, target)
    await dialog.getByLabel('Name').fill('Discarded Name')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(row.getByText(target.name)).toBeVisible()
    expect((await getUser(page, target.id)).name).toBe(target.name)

    // Reopening starts from the saved values, not the discarded edit.
    await row.getByRole('button', { name: `Edit ${target.name}` }).click()
    await expect(page.getByRole('dialog').getByLabel('Name')).toHaveValue(target.name)
  })

  test('changing the password through the dialog lets the user sign in with it', async ({ page, browser }) => {
    await loginAsAdmin(page)
    const target = await createAgent(page, 'ui-pw')
    const newPassword = 'Dialog-new-pw-789'
    const { dialog } = await openEdit(page, target)
    await dialog.getByLabel('Password').fill(newPassword)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()

    const ctx = await browser.newContext()
    const userPage = await ctx.newPage()
    await login(userPage, target.email, newPassword)
    await ctx.close()
    expect(await signInStatus(browser, target.email, validPassword)).not.toBe(200)
  })

  test('editing yourself updates the name in the page header (admin name restored afterwards)', async ({ page }) => {
    await loginAsAdmin(page)
    const me = (await (await page.request.get('/api/me')).json()).user as ApiUser
    const all = await (await page.request.get('/api/users')).json()
    const original = all.users.find((u: ApiUser) => u.id === me.id) as ApiUser
    const tempName = `${original.name} Tmp`
    try {
      await page.goto('/users')
      const row = page.getByRole('row').filter({ hasText: original.email })
      await row.getByRole('button', { name: `Edit ${original.name}` }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Name').fill(tempName)
      await dialog.getByRole('button', { name: 'Save changes' }).click()
      await expect(dialog).toBeHidden()
      await expect(page.getByRole('navigation').getByText(tempName, { exact: true })).toBeVisible()
    } finally {
      // Same email, blank password: restores only the name.
      const res = await putUser(page, original.id, {
        name: original.name,
        email: original.email,
        password: '',
      })
      expect(res.status()).toBe(200)
    }
    await page.reload()
    await expect(page.getByRole('navigation').getByText(original.name, { exact: true })).toBeVisible()
  })
})
