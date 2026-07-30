import PublicNav from '@/components/layout/PublicNav'

export default function MisReservasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNav />
      {children}
    </>
  )
}
