import type { ReactNode } from 'react'

// The bar along the top of a page: its name, then any controls that apply to the whole page.
function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
      <h1 className="mr-2 text-sm font-semibold">{title}</h1>
      {children}
    </div>
  )
}

export default PageHeader
