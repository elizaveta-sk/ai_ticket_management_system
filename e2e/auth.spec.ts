import { expect, test, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from '@playwright/test'

const SESSION_COOKIE = 'better-auth.session_token'

const adminEmail = () => process.env.ADMIN_EMAIL!
const adminPassword = () => process.env.ADMIN_PASSWORD!
const clientOrigin = () => process.env.CLIENT_URL!

/** Opens /login, fills the form and clicks "Sign in" without asserting the outcome. */
async function gotoAndSubmitLogin(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Asserts the page shows the signed-in UI (the "Sign out" button). */
async function expectSignedIn(page: Page) {
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

async function loginAsAdmin(page: Page) {
  await gotoAndSubmitLogin(page, adminEmail(), adminPassword())
  await expect(page).toHaveURL('/')
  await expectSignedIn(page)
}

/** Clicks "Sign out" and waits for the redirect to /login. */
async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

async function sessionCookie(page: Page) {
  const cookies = await page.context().cookies()
  return cookies.find((c) => c.name === SESSION_COOKIE)
}

/** Counts requests the page makes to the sign-in endpoint. */
function trackSignInRequests(page: Page) {
  const state = { count: 0 }
  page.on('request', (r) => {
    if (r.url().includes('/api/auth/sign-in')) state.count++
  })
  return state
}

/** Creates an API context that sends only the given raw Cookie header. */
function apiContextWithCookie(playwright: PlaywrightWorkerArgs['playwright'], cookie: string): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: clientOrigin(),
    extraHTTPHeaders: { Cookie: cookie },
  })
}

test.describe('login form', () => {
  test('admin logs in and lands on the home page', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()
  })

  test('wrong password shows a generic error and stays on /login', async ({ page }) => {
    await gotoAndSubmitLogin(page, adminEmail(), 'definitely-wrong-password')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    expect(await sessionCookie(page)).toBeUndefined()
  })

  test('unknown email and wrong password give the same message', async ({ page }) => {
    await gotoAndSubmitLogin(page, adminEmail(), 'definitely-wrong-password')
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    const knownEmailMessage = (await alert.innerText()).trim()

    await page.getByLabel('Email').fill(`nobody-${Date.now()}@example.com`)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(alert).toHaveText(knownEmailMessage)
    await expect(page).toHaveURL(/\/login$/)
    expect(knownEmailMessage.toLowerCase()).not.toMatch(/not found|no user|exist|unknown/)
  })

  test('empty form shows validation errors and sends no request', async ({ page }) => {
    const signIn = trackSignInRequests(page)
    await page.goto('/login')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Enter a valid email address')).toBeVisible()
    await expect(page.getByText('Enter your password')).toBeVisible()
    expect(signIn.count).toBe(0)
  })

  test('malformed email is rejected on the client', async ({ page }) => {
    const signIn = trackSignInRequests(page)
    await gotoAndSubmitLogin(page, 'not-an-email', 'something')
    await expect(page.getByText('Enter a valid email address')).toBeVisible()
    await expect(page.getByText('Enter your password')).toBeHidden()
    expect(signIn.count).toBe(0)
  })

  test('missing password only shows the password error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(adminEmail())
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Enter your password')).toBeVisible()
    await expect(page.getByText('Enter a valid email address')).toBeHidden()
  })

  test('button is disabled and shows progress while submitting', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/auth/sign-in/email', async (route) => {
      await gate
      await route.continue()
    })
    await gotoAndSubmitLogin(page, adminEmail(), adminPassword())
    const busy = page.getByRole('button', { name: 'Signing in...' })
    await expect(busy).toBeDisabled()
    release()
    await expect(page).toHaveURL('/')
  })
})

test.describe('session', () => {
  test('survives a reload and a new page in the same context', async ({ page, context }) => {
    await loginAsAdmin(page)
    await page.reload()
    await expect(page).toHaveURL('/')
    await expectSignedIn(page)

    const second = await context.newPage()
    await second.goto('/')
    await expect(second).toHaveURL('/')
    await expectSignedIn(second)
  })

  test('a fresh browser context is not logged in', async ({ page, browser }) => {
    await loginAsAdmin(page)
    const fresh = await browser.newContext()
    const freshPage = await fresh.newPage()
    await freshPage.goto('/')
    await expect(freshPage).toHaveURL(/\/login$/)
    await fresh.close()
  })

  test('session cookie is HttpOnly and not readable from JavaScript', async ({ page }) => {
    await loginAsAdmin(page)
    const cookie = await sessionCookie(page)
    expect(cookie).toBeDefined()
    expect(cookie!.httpOnly).toBe(true)
    expect(cookie!.sameSite).not.toBe('None')
    const visible = await page.evaluate<string>('document.cookie')
    expect(visible).not.toContain('session_token')
  })
})

test.describe('sign-out', () => {
  test('returns to /login, guards protected pages and invalidates the old cookie', async ({
    page,
    playwright,
  }) => {
    await loginAsAdmin(page)
    const old = await sessionCookie(page)
    expect(old).toBeDefined()
    const oldCookieHeader = `${old!.name}=${old!.value}`

    // Sanity check: the cookie works before sign-out.
    const before = await page.request.get('/api/me')
    expect(before.status()).toBe(200)

    await signOut(page)

    for (const path of ['/', '/users']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
    }

    const after = await page.request.get('/api/me')
    expect(after.status()).toBe(401)

    // Replay the old cookie from a clean API context.
    const replay = await apiContextWithCookie(playwright, oldCookieHeader)
    const replayed = await replay.get('/api/me')
    expect(replayed.status()).toBe(401)
    await replay.dispose()
  })
})

test.describe('route guards', () => {
  test('signed-out users are redirected from / and /users to /login', async ({ page }) => {
    for (const path of ['/', '/users']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    }
  })

  test('signed-in user visiting /login is redirected to /', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/login')
    await expect(page).toHaveURL('/')
  })

  test('admin can reach /users', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Users' }).click()
    await expect(page).toHaveURL(/\/users$/)
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  })

  test.fixme(
    'an agent is redirected from /users to / and has no Users link',
    // Needs an agent login; only the admin exists in helpdesk_test. The user must
    // provide an agent email and password (e.g. AGENT_EMAIL / AGENT_PASSWORD).
    async () => {},
  )
})

test.describe('/api/me', () => {
  test('returns 401 without a session', async ({ request }) => {
    const res = await request.get('/api/me')
    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  test('returns 401 for forged and garbage cookies', async ({ playwright }) => {
    const cookies = [
      `${SESSION_COOKIE}=garbage`,
      `${SESSION_COOKIE}=forged-token.${'a'.repeat(44)}`,
      `${SESSION_COOKIE}=`,
      `${SESSION_COOKIE}=${'x'.repeat(5000)}`,
      'something=else',
    ]
    for (const cookie of cookies) {
      const ctx = await apiContextWithCookie(playwright, cookie)
      const res = await ctx.get('/api/me')
      expect(res.status(), cookie.slice(0, 40)).toBe(401)
      await ctx.dispose()
    }
  })

  test('returns exactly the four user fields and no session data', async ({ page }) => {
    await loginAsAdmin(page)
    const res = await page.request.get('/api/me')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Object.keys(body)).toEqual(['user'])
    expect(Object.keys(body.user).sort()).toEqual(['email', 'id', 'name', 'role'])
    expect(body.user.email).toBe(adminEmail())
    expect(body.user.role).toBe('admin')
    const raw = JSON.stringify(body)
    expect(raw).not.toContain('token')
    expect(raw).not.toContain('session')
    expect(raw).not.toContain('password')
  })

  test.fixme(
    'an agent gets role "agent" from /api/me',
    // Needs an agent login; only the admin exists in helpdesk_test.
    async () => {},
  )
})

test.describe('sign-up disabled', () => {
  test('POST /api/auth/sign-up/email fails and creates no usable account', async ({ request }) => {
    const email = `signup-${Date.now()}@example.com`
    const password = 'Sup3r-secret-pass!'
    const res = await request.post('/api/auth/sign-up/email', {
      headers: { Origin: clientOrigin() },
      data: { email, password, name: 'Intruder' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)

    const login = await request.post('/api/auth/sign-in/email', {
      headers: { Origin: clientOrigin() },
      data: { email, password },
    })
    expect(login.status()).toBeGreaterThanOrEqual(400)
    expect(login.headers()['set-cookie'] ?? '').not.toContain(SESSION_COOKIE)
  })

  test('sign-up with role admin in the body is also refused', async ({ request }) => {
    const email = `signup-admin-${Date.now()}@example.com`
    const res = await request.post('/api/auth/sign-up/email', {
      headers: { Origin: clientOrigin() },
      data: { email, password: 'Sup3r-secret-pass!', name: 'Intruder', role: 'admin' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })
})

test.describe('privilege safety', () => {
  test('update-user cannot change the role', async ({ page }) => {
    await loginAsAdmin(page)
    // Try to demote (the only safe direction on the only account) and also set a bogus role.
    for (const role of ['agent', 'superuser']) {
      const res = await page.request.post('/api/auth/update-user', {
        headers: { Origin: clientOrigin() },
        data: { role },
      })
      expect(res.status()).toBeLessThan(500)
      const me = await page.request.get('/api/me')
      const body = await me.json()
      expect(body.user.role, `role after update-user with ${role}`).toBe('admin')
    }
  })
})

test.describe('malformed sign-in input', () => {
  const signIn = (request: APIRequestContext, init: object) =>
    request.post('/api/auth/sign-in/email', {
      headers: { Origin: clientOrigin() },
      ...init,
    })

  function expectCleanClientError(status: number, text: string) {
    expect(status).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
    expect(text).not.toMatch(/\bat .*\.(ts|js):\d+|node_modules|stack/i)
  }

  test('bad JSON gives a clean 4xx', async ({ request }) => {
    const res = await signIn(request, {
      headers: { Origin: clientOrigin(), 'Content-Type': 'application/json' },
      data: '{"email": "a@b.c", ',
    })
    expectCleanClientError(res.status(), await res.text())
  })

  test('missing fields give a clean 4xx', async ({ request }) => {
    for (const data of [{}, { email: adminEmail() }, { password: 'x' }, { email: 123, password: {} }]) {
      const res = await signIn(request, { data })
      expectCleanClientError(res.status(), await res.text())
    }
  })

  test('very long values give a clean 4xx', async ({ request }) => {
    const res = await signIn(request, {
      data: { email: `${'a'.repeat(10000)}@example.com`, password: 'p'.repeat(100000) },
    })
    expectCleanClientError(res.status(), await res.text())
  })

  test('SQL-injection-style emails do not log anyone in', async ({ request }) => {
    const payloads = [
      `' OR '1'='1`,
      `${adminEmail()}' --`,
      `admin@example.com'; DROP TABLE "user"; --`,
      `' OR 1=1 --@example.com`,
    ]
    for (const email of payloads) {
      const res = await signIn(request, { data: { email, password: `' OR '1'='1` } })
      expectCleanClientError(res.status(), await res.text())
      expect(res.headers()['set-cookie'] ?? '').not.toContain(SESSION_COOKIE)
    }
    // The admin can still log in afterwards, so nothing was dropped.
    const ok = await signIn(request, { data: { email: adminEmail(), password: adminPassword() } })
    expect(ok.status()).toBe(200)
  })

  // Better Auth sets skipOriginCheck when NODE_ENV=test (the e2e server's mode), and
  // otherwise only validates Origin when a cookie is sent. Against this server an
  // untrusted Origin therefore returns 200, which is not an app bug but means the
  // rule cannot be observed here. Verified in better-auth origin-check.mjs and
  // create-context.mjs (v1.7.14). Needs a server running with NODE_ENV not "test".
  test.fixme('sign-in with an untrusted Origin is rejected', async ({ request }) => {
    const res = await request.post('/api/auth/sign-in/email', {
      headers: { Origin: 'http://evil.example.com' },
      data: { email: adminEmail(), password: adminPassword() },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
    expect(res.headers()['set-cookie'] ?? '').not.toContain(SESSION_COOKIE)
  })

  test('sign-in with the trusted Origin works (control)', async ({ request }) => {
    const res = await signIn(request, { data: { email: adminEmail(), password: adminPassword() } })
    expect(res.status()).toBe(200)
  })
})
