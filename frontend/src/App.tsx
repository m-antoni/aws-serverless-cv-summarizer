import MainCard from "./components/custom/MainCard";
import { ModeToggle } from "./components/mode-toggle";
import { ThemeProvider } from "./components/theme-provider";

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="flex justify-end pt-5 pr-5">
        <ModeToggle />
      </div>
      <MainCard />
    </ThemeProvider>
  );
}

export default App;
