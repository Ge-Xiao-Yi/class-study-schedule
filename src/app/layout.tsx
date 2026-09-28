import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "拾光课表 · 课程与学习计划",
  description: "在一张周课表里，安排课程、学习任务与成长目标。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <a href="#main-content" className="skip-link">
          跳转到主要内容
        </a>
        {children}
      </body>
    </html>
  );
}
