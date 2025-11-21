import AppRoutes from '@/routes/AppRoutes';
import { DarkModeProvider, useDarkMode } from "./contexts/DarkmodeContext";
import { Button } from './components/ui/button';
import { Sun, Moon } from 'lucide-react';

const DarkModeButton = () => {
    const { darkMode, toggleDarkMode } = useDarkMode();

    return (
        <div className={darkMode ? "dark" : ""}>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
                <div className="container mx-auto p-4 md:p-6 max-w-7xl relative">
                    {/* HEADER */}
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h1 className="text-gray-900 dark:text-white text-2xl font-bold">
                                Queue Management System
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400">
                                Manage and display queue status
                            </p>
                        </div>

                        {/* DARK MODE BUTTON */}
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={toggleDarkMode}
                            className="rounded-full hover:cursor-pointer hover:scale-95"
                        >
                            {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                        </Button>
                    </div>

                    {/* APP CONTENT */}
                    <AppRoutes />
                </div>
            </div>
        </div>
    );
};

const App = () => {
    return (
        <DarkModeProvider>
            <DarkModeButton />
        </DarkModeProvider>
    );
};

export default App;
