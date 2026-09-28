import { Header } from "@/components/layout/header";
import { ScheduleWorkspace } from "@/components/schedule/schedule-workspace";

export default function Home() {
  return (
    <>
      <Header />
      <main
        id="main-content"
        className="page-container space-y-6 py-8 sm:py-10"
      >
        <ScheduleWorkspace />
        <footer className="flex flex-wrap justify-between gap-2 pb-2 text-[11px] text-slate-400">
          <span>拾光课表 · 把日子过成喜欢的节奏</span>
          <span>课程有安排，成长有方向</span>
        </footer>
      </main>
    </>
  );
}
