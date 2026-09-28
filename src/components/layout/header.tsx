import { Icon } from "@/components/ui/icon";
import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-sky-100 bg-white/90">
      <div className="page-container flex min-h-20 flex-wrap items-center justify-between gap-4 py-4">
        <Link
          href="/"
          className="flex items-center gap-3 text-inherit no-underline"
          aria-label="拾光课表首页"
        >
          <span className="flex size-11 items-center justify-center rounded-2xl bg-blue-500 text-white">
            <Icon name="book" size={25} />
          </span>
          <span>
            <span className="block text-xl font-bold tracking-wide">
              拾光课表
            </span>
            <span className="block text-xs tracking-widest text-slate-500">
              让学习，有条不紊
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sky-700">
            本地档案
          </span>
          <span className="hidden sm:inline">专注当下，慢慢向前</span>
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full border border-sky-100 bg-sky-50 font-semibold text-sky-700"
          >
            学
          </span>
        </div>
      </div>
    </header>
  );
}
