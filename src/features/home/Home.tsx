// In your main App or routing file
import { useState, useEffect } from "react";
import Display from "../display/Display";
import ControllerWrapper from "../controller/ControllerWrapper";

const Home = () => {
    const [isController, setIsController] = useState(false);

    // Global keyboard listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'F12') {
                e.preventDefault();
                setIsController(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div>
            {isController ? <ControllerWrapper /> : <Display />}
        </div>
    );
}

export default Home