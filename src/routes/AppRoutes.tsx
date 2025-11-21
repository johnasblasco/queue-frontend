import { useRoutes } from 'react-router-dom';
import Home from '@/features/home/Home'
import Counter from '@/features/counter/Counter'
const AppRoutes = () => {
    const routes = [
        { path: '/', element: <Home /> },
        { path: '/admin', element: <Counter /> },
    ];

    return useRoutes(routes);
}

export default AppRoutes