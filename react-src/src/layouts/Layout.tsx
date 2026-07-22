import { Outlet } from "react-router";
import { NetioNavbar } from "../components/NetioNavbar";
import { GlobalToaster } from "../components/GlobalToaster";
import { CompactModeProvider } from "../context/CompactModeContext";

function Layout() {
  return (
    <CompactModeProvider>
      <div className="layout">
        <header>
          <NetioNavbar />
          <GlobalToaster />
        </header>
        <main>
          <Outlet />
        </main>
      </div>
    </CompactModeProvider>
  );
}

export default Layout;
