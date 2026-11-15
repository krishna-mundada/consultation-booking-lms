import { ContourLines, ContourMark } from "@/components/brand/contour";

/** A full-screen message (not found, something broke) with the brand and a way forward. */
export function StatusPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden p-6">
      <ContourLines className="absolute inset-0 h-full w-full text-contour opacity-60" />
      <div className="relative flex max-w-md flex-col items-center gap-4 text-center">
        <ContourMark className="h-10 w-10 text-primary" />
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">{children}</div>
      </div>
    </main>
  );
}
