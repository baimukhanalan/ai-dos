export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-primary">
          {eyebrow}
        </p>
        <h1 className="font-editorial text-5xl leading-none text-[#1b2923] sm:text-6xl">
          {title}
        </h1>
        <p className="mt-4 max-w-[720px] text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}
