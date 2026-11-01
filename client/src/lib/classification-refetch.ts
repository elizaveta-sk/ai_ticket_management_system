const refetchMs = 2_000
const classificationWindowMs = 2 * 60_000

// New tickets get their category in the background, shortly after they appear. This keeps
// refetching until they have it. Only recent tickets count, so an old ticket that is still
// uncategorized, or one whose classification failed, doesn't keep this going forever.
export function classificationRefetchInterval(
  tickets: { category: string | null; createdAt: string }[] | undefined,
) {
  const isWaiting = tickets?.some(
    (ticket) =>
      ticket.category === null &&
      Date.now() - new Date(ticket.createdAt).getTime() < classificationWindowMs,
  )
  return isWaiting ? refetchMs : false
}
