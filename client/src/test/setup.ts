import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// The default of 1 second is too short for findBy* when the machine is busy, which
// made tests fail at random while the page was still rendering.
configure({ asyncUtilTimeout: 3000 })

afterEach(cleanup)
