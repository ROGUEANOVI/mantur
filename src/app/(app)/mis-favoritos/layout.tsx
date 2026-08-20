import PublicNav from '@/components/layout/PublicNav'

export default function MisFavoritosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNav />
      {children}
    </>
  )
}
