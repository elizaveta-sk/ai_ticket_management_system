import { z } from 'zod'

export const createUserSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters'),
  // Better Auth lowercases the email at sign-in, so a mixed-case row could never log in.
  email: z.email('Enter a valid email address').toLowerCase(),
  // 128 is Better Auth's default maximum password length.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
