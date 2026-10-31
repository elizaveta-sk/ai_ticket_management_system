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
