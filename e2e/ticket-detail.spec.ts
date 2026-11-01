import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const MISSING_ID = 2147483647

async function createTicket(request: APIRequestContext) {
  const res = await request.post('/api/webhooks/inbound-email', {
    headers: { 'x-webhook-secret': process.env.INBOUND_EMAIL_SECRET! },
    data: {
      messageId: `<${randomUUID()}@mail.example.com>`,
      from: `student-${randomUUID()}@example.com`,
      fromName: 'Detail Student',
      subject: `Detail test ${randomUUID()}`,
      text: 'I need help.',
    },
  })
  expect(res.status()).toBe(201)
  return (await res.json()).ticket.id as number
}

async function loginAsAgent(page: Page) {
  await login(page, process.env.AGENT_EMAIL!, process.env.AGENT_PASSWORD!)
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

async function getTicket(request: APIRequestContext, id: number) {
  const res = await request.get(`/api/tickets/${id}`)
  expect(res.status()).toBe(200)
  return (await res.json()).ticket
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option, exact: true }).first().click()
}

test.describe('ticket detail page', () => {
  test('redirects a signed-out visitor to /login', async ({ page, request }) => {
    const id = await createTicket(request)
    await page.goto(`/tickets/${id}`)
    await expect(page).toHaveURL(/\/login$/)
  })

  test('API rejects signed-out requests with 401 and changes nothing', async ({ page, request }) => {
    const id = await createTicket(request)
    // The request fixture carries no session.
    const get = await request.get(`/api/tickets/${id}`)
    expect(get.status()).toBe(401)
    const patch = await request.patch(`/api/tickets/${id}`, { data: { status: 'closed' } })
    expect(patch.status()).toBe(401)
    const reply = await request.post(`/api/tickets/${id}/replies`, {
      data: { body: `signed-out ${randomUUID()}` },
    })
    expect(reply.status()).toBe(401)

    await loginAsAgent(page)
    const ticket = await getTicket(page.request, id)
    expect(ticket.status).toBe('open')
    expect(ticket.replies).toHaveLength(0)
  })

  test('replies persist after reload, oldest first, under the signed-in agent', async ({ page, request }) => {
    const id = await createTicket(request)
    await loginAsAgent(page)
    const me = await (await page.request.get('/api/me')).json()
    const agentName: string = me.user.name

    const first = `First reply ${randomUUID()}`
    const second = `Second reply ${randomUUID()}`
    await page.goto(`/tickets/${id}`)
    for (const text of [first, second]) {
      await page.getByLabel('Your reply').fill(text)
      await page.getByRole('button', { name: 'Send reply' }).click()
      await expect(page.getByText(text)).toBeVisible()
      // The form clears once the thread has refreshed; wait so the next fill isn't wiped.
      await expect(page.getByLabel('Your reply')).toHaveValue('')
    }

    await page.reload()
    const items = page.getByRole('listitem').filter({ hasText: 'Agent' })
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toContainText(first)
    await expect(items.nth(1)).toContainText(second)
    for (const i of [0, 1]) {
      await expect(items.nth(i)).toContainText(agentName)
      await expect(items.nth(i).getByText('Agent', { exact: true })).toBeVisible()
    }
  })

  test('status, category and assignee changes persist after reload', async ({ page, request }) => {
    const id = await createTicket(request)
    await loginAsAgent(page)
    const me = await (await page.request.get('/api/me')).json()
    const agentName: string = me.user.name

    await page.goto(`/tickets/${id}`)
    await choose(page, 'Status', 'Resolved')
    await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Resolved')
    await choose(page, 'Category', 'Refund Request')
    await expect(page.getByRole('combobox', { name: 'Category' })).toContainText('Refund Request')
    await choose(page, 'Assigned To', agentName)
    await expect(page.getByRole('combobox', { name: 'Assigned To' })).toContainText(agentName)

    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Resolved')
    await expect(page.getByRole('combobox', { name: 'Category' })).toContainText('Refund Request')
    await expect(page.getByRole('combobox', { name: 'Assigned To' })).toContainText(agentName)

    const ticket = await getTicket(page.request, id)
    expect(ticket.status).toBe('resolved')
    expect(ticket.category).toBe('refund_request')
    expect(ticket.assignedTo.name).toBe(agentName)
  })

  test('returns 404 for a ticket that does not exist', async ({ page }) => {
    await loginAsAgent(page)
    const get = await page.request.get(`/api/tickets/${MISSING_ID}`)
    expect(get.status()).toBe(404)
    const reply = await page.request.post(`/api/tickets/${MISSING_ID}/replies`, {
      data: { body: `orphan ${randomUUID()}` },
    })
    expect(reply.status()).toBe(404)
  })

  test('rejects assigning to a missing user or a non-agent with 400', async ({ page, browser, request }) => {
    const id = await createTicket(request)
    await loginAsAgent(page)

    const missing = await page.request.patch(`/api/tickets/${id}`, {
      data: { assignedToId: randomUUID() },
    })
    expect(missing.status()).toBe(400)

    // The admin exists but its role is not agent.
    const adminPage = await browser.newPage()
    await login(adminPage, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!)
    const adminId: string = (await (await adminPage.request.get('/api/me')).json()).user.id
    await adminPage.close()
    const nonAgent = await page.request.patch(`/api/tickets/${id}`, {
      data: { assignedToId: adminId },
    })
    expect(nonAgent.status()).toBe(400)

    const ticket = await getTicket(page.request, id)
    expect(ticket.assignedTo).toBeNull()
    expect(ticket.status).toBe('open')
  })
})
