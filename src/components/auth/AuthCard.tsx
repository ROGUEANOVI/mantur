export default function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-up [animation-delay:120ms] relative max-w-md w-full mx-auto bg-card rounded-2xl shadow-2xl p-6 md:p-8">
      {children}
    </div>
  )
}
