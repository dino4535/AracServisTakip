import { ReactNode, useState } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <Header onToggleSidebar={() => setIsMobileSidebarOpen((prev) => !prev)} />
      <div className="relative flex-1 flex">
        {isMobileSidebarOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/40 z-40 md:hidden"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-full md:hidden">
              <Sidebar />
            </div>
          </>
        )}

        <div className="hidden md:block">
          <Sidebar />
        </div>

        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
