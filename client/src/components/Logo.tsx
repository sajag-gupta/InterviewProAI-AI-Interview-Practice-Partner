import { Link } from "wouter";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} translate="no" className="rounded-sm font-mono text-[15px] font-medium tracking-tight">
      interview<span className="text-brand">/</span>pro
    </Link>
  );
}
