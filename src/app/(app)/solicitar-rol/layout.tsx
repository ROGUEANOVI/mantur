import PublicNav from '@/components/layout/PublicNav'

export default function SolicitarRolLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNav />
      {children}
    </>
  )
}
