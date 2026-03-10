import MainCard from "./components/custom/MainCard";
import { ModeToggle } from "./components/mode-toggle";
import { ThemeProvider } from "./components/theme-provider";

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="flex justify-end sm:pt-5 sm:pr-5 pr-3 pt-3">
        <ModeToggle />
      </div>
      <MainCard />
    </ThemeProvider>
  );
}

export default App;
