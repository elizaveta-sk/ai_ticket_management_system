import { z } from 'zod'

const PASSWORD_MIN_LENGTH = 8
const PASSWORD_TOO_SHORT = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
// 128 is Better Auth's default maximum password length.
const PASSWORD_MAX_LENGTH = 128
const PASSWORD_TOO_LONG = `Password must be at most ${PASSWORD_MAX_LENGTH} characters`

const nameSchema = z.string().trim().min(3, 'Name must be at least 3 characters')
// Better Auth lowercases the email at sign-in, so a mixed-case row could never log in.
const emailSchema = z.email('Enter a valid email address').toLowerCase()

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT)
    .max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG),
})

export const updateUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  // Blank keeps the current password.
  password: z
    .string()
    .max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG)
    .refine((value) => value === '' || value.length >= PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT),
})

// The AI agent can only be renamed: no email, which is reserved, and no password.
export const updateAiAgentSchema = z.object({ name: nameSchema })

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
