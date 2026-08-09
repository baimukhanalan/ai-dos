import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({
  className,
  href = "/",
  style,
}: {
  className?: string;
  href?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Link
      href={href}
      style={style}
      className={cn(
        "inline-flex items-center gap-2 font-editorial text-[28px] leading-none text-primary transition-opacity hover:opacity-80",
        className,
      )}
      aria-label="AI Dos — на главную"
    >
      AI Dos
    </Link>
  );
}
