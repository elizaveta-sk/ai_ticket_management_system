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
