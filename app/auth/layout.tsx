import { ContourLines, ContourMark } from "@/components/brand/contour";

// Every sign-in screen shares this frame: a brand panel on wide screens and a slim brand bar on
// phones, with the form beside or below it.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="relative z-10 flex items-center gap-3">
          <ContourMark className="h-9 w-9" />
          <span className="font-display text-xl font-semibold tracking-tight">Consultations</span>
        </div>
        <ContourLines className="absolute inset-0 h-full w-full text-primary-foreground opacity-20" />
        <div className="relative z-10 max-w-sm">
          <p className="font-display text-4xl font-semibold leading-tight">Book time with your tutors.</p>
          <p className="mt-4 text-primary-foreground/80">
            Pick a day, say what you need help with, and change the plan whenever it changes.
          </p>
        </div>
      </aside>
      <div className="flex flex-col">
        <div className="flex items-center gap-2.5 px-6 pt-6 text-primary lg:hidden">
          <ContourMark />
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">Consultations</span>
        </div>
        {children}
      </div>
    </div>
  );
}
