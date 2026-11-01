import { expect, test, type Browser, type Page } from '@playwright/test'

// Happy-path CRUD for user management through the UI, as the seeded admin.
// Edge cases and access rules live in users.spec.ts.

const originalPassword = 'Sup3r-secret-pw'

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
}

function uniqueName(prefix: string) {
  return `${prefix} ${Math.random().toString(36).slice(2, 8)}`
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

/** Signs in as the user in a throwaway browser context, then closes it. */
async function expectCanSignIn(browser: Browser, email: string, password: string) {
  const ctx = await browser.newContext()
  try {
    await login(await ctx.newPage(), email, password)
  } finally {
    await ctx.close()
  }
}

/** Creates an agent through the UI (the admin is already signed in on /users). */
async function createAgentViaUi(page: Page, name: string, email: string, password: string) {
  await page.getByRole('button', { name: 'New user' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Email').fill(email)
  await dialog.getByLabel('Password').fill(password)
  await dialog.getByRole('button', { name: 'Create user' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('row').filter({ hasText: email })).toBeVisible()
}

test.describe('user management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!)
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  })

  test('create: new user appears in the table and can sign in', async ({ page, browser }) => {
    const name = uniqueName('Created Agent')
    const email = uniqueEmail('create')

    await page.getByRole('button', { name: 'New user' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByLabel('Email').fill(email)
    await dialog.getByLabel('Password').fill(originalPassword)
    await dialog.getByRole('button', { name: 'Create user' }).click()

    await expect(dialog).toBeHidden()
    const row = page.getByRole('row').filter({ hasText: email })
    await expect(row).toBeVisible()
    await expect(row.getByText(name)).toBeVisible()
    await expect(row.getByText(email)).toBeVisible()
    await expect(row.getByText('agent', { exact: true })).toBeVisible()

    await expectCanSignIn(browser, email, originalPassword)
  })

  test('read: table shows headers and rows for the admin and a created user', async ({ page }) => {
    const name = uniqueName('Listed Agent')
    const email = uniqueEmail('read')
    await createAgentViaUi(page, name, email, originalPassword)

    for (const header of ['Name', 'Email', 'Role', 'Created']) {
      await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeVisible()
    }

    const adminRow = page.getByRole('row').filter({ hasText: process.env.ADMIN_EMAIL! })
    await expect(adminRow).toBeVisible()
    await expect(adminRow.getByText('admin', { exact: true })).toBeVisible()

    // Survives a reload, so this is data from the server rather than local state.
    await page.reload()
    const row = page.getByRole('row').filter({ hasText: email })
    await expect(row).toBeVisible()
    await expect(row.getByText(name)).toBeVisible()
    await expect(row.getByText('agent', { exact: true })).toBeVisible()
  })

  test('update: name and email change with the password left blank', async ({ page, browser }) => {
    const name = uniqueName('Before Edit')
    const email = uniqueEmail('before')
    await createAgentViaUi(page, name, email, originalPassword)

    const newName = uniqueName('After Edit')
    const newEmail = uniqueEmail('after')

    await page
      .getByRole('row')
      .filter({ hasText: email })
      .getByRole('button', { name: `Edit ${name}` })
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Edit user' })).toBeVisible()
    await expect(dialog.getByLabel('Name')).toHaveValue(name)
    await expect(dialog.getByLabel('Email')).toHaveValue(email)
    await expect(dialog.getByLabel('Password')).toHaveValue('')

    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByLabel('Email').fill(newEmail)
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog).toBeHidden()
    const row = page.getByRole('row').filter({ hasText: newEmail })
    await expect(row).toBeVisible()
    await expect(row.getByText(newName)).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: email })).toHaveCount(0)

    await expectCanSignIn(browser, newEmail, originalPassword)
  })

  test('update: a new password lets the user sign in with it', async ({ page, browser }) => {
    const name = uniqueName('Pw Change')
    const email = uniqueEmail('pwchange')
    const newPassword = 'Another-new-pw-654'
    await createAgentViaUi(page, name, email, originalPassword)

    await page
      .getByRole('row')
      .filter({ hasText: email })
      .getByRole('button', { name: `Edit ${name}` })
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Edit user' })).toBeVisible()
    await dialog.getByLabel('Password').fill(newPassword)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()

    await expectCanSignIn(browser, email, newPassword)
  })

  test('delete: confirming removes the row, also after a reload', async ({ page }) => {
    const name = uniqueName('To Delete')
    const email = uniqueEmail('delete')
    await createAgentViaUi(page, name, email, originalPassword)

    const row = page.getByRole('row').filter({ hasText: email })
    await row.getByRole('button', { name: `Delete ${name}` }).click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog.getByRole('heading', { name: 'Delete user?' })).toBeVisible()
    await expect(dialog).toContainText(name)
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByRole('row').filter({ hasText: email })).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: process.env.ADMIN_EMAIL! })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: email })).toHaveCount(0)
  })
})
