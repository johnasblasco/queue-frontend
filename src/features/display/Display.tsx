import { useEffect, useState } from "react";
import { Volume2, Clock, Users, CheckCircle, Loader } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useDarkMode } from "@/contexts/DarkmodeContext";
import { QueueService, socketService, CounterService } from "@/services/api";

const Display = () => {
    const { darkMode } = useDarkMode();

    const [currentTime, setCurrentTime] = useState(new Date());
    const [counterData, setCounterData] = useState<Record<string, any>>({});
    const [allCounters, setAllCounters] = useState<any[]>([]);

    // 🕒 Clock runs every second
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Load all counters
    useEffect(() => {
        const loadCounters = async () => {
            try {
                const res = await CounterService.fetchCounters();
                if (res.success) {
                    setAllCounters(res.data);
                }
            } catch (err) {
                console.log("COUNTERS LOAD ERROR:", err);
            }
        };
        loadCounters();
    }, []);

    // 🔁 WebSocket connection and real-time updates
    useEffect(() => {
        socketService.connect();

        const loadInitialQueue = async () => {
            try {
                const res = await QueueService.listQueue();
                if (res.success) {
                    processQueueData(res.data);
                }
            } catch (err) {
                console.log("QUEUE LOAD ERROR:", err);
            }
        };

        loadInitialQueue();

        const unsubscribes: (() => void)[] = [];
        allCounters.forEach(counter => {
            if (counter.status === 'Active') {
                const unsubscribe = QueueService.onQueueUpdate(counter.id, (data: any) => {
                    console.log(`🔄 Real-time update for counter ${counter.id}:`, data);
                    loadInitialQueue();
                });
                unsubscribes.push(unsubscribe);
            }
        });

        return () => {
            unsubscribes.forEach(unsubscribe => unsubscribe());
            socketService.disconnect();
        };
    }, [allCounters]);

    // Process queue data and organize by counter
    const processQueueData = (data: any[]) => {
        const organized: Record<string, any> = {};

        data.forEach((item: any) => {
            const counterId = item.service_counter_id;

            if (!organized[counterId]) {
                organized[counterId] = {
                    currentServing: null,
                    waitingQueue: [],
                    recentlyServed: [],
                    counterInfo: item.counter
                };
            }

            if (item.status === 'serving') {
                organized[counterId].currentServing = {
                    id: item.id,
                    queueNumber: item.queue_number,
                    name: item.customer_name,
                    counterNumber: counterId,
                    timestamp: new Date(item.created_at),
                };
            }
            else if (item.status === 'waiting') {
                organized[counterId].waitingQueue.push({
                    id: item.id,
                    queueNumber: item.queue_number,
                    name: item.customer_name,
                    counterNumber: counterId,
                    timestamp: new Date(item.created_at),
                });
            }
            else if (item.status === 'completed') {
                organized[counterId].recentlyServed.push({
                    id: item.id,
                    queueNumber: item.queue_number,
                    name: item.customer_name,
                    counterNumber: counterId,
                    timestamp: new Date(item.served_at || item.created_at),
                });
            }
        });

        Object.values(organized).forEach((counterData: any) => {
            counterData.waitingQueue.sort((a: any, b: any) =>
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            counterData.recentlyServed.sort((a: any, b: any) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
        });

        Object.entries(organized).forEach(([counterId, counterData]) => {
            if (!counterData.currentServing && counterData.waitingQueue.length > 0) {
                organized[counterId].currentServing = {
                    ...counterData.waitingQueue[0],
                    isNext: true
                };
            }
        });

        setCounterData(organized);
    };

    // Formatters
    const formatTime = (date: Date) =>
        date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    const formatDate = (date: Date) =>
        date.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        });

    // Separate currently serving from next to serve
    const currentlyServing = Object.entries(counterData)
        .filter(([_, data]) => data.currentServing !== null && !data.currentServing.isNext)
        .map(([counterNum, data]) => ({
            counterNumber: parseInt(counterNum),
            counterName: data.counterInfo?.counter_name || `Counter ${counterNum}`,
            data
        }));

    const nextToServe = Object.entries(counterData)
        .filter(([_, data]) => data.currentServing !== null && data.currentServing.isNext)
        .map(([counterNum, data]) => ({
            counterNumber: parseInt(counterNum),
            counterName: data.counterInfo?.counter_name || `Counter ${counterNum}`,
            data
        }));

    // Recently served (across all counters)
    const allRecentlyServed = Object.values(counterData)
        .flatMap((data: any) => data.recentlyServed)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 5);

    // Get waiting customers across all counters
    const allWaitingCustomers = Object.entries(counterData)
        .flatMap(([counterNum, data]: [string, any]) =>
            data.waitingQueue.slice(nextToServe.length > 0 ? 1 : 0).map((item: any, index: number) => ({
                ...item,
                position: index + (nextToServe.length > 0 ? 2 : 1),
                counterNumber: parseInt(counterNum),
                counterName: data.counterInfo?.counter_name || `Counter ${counterNum}`
            }))
        )
        .sort((a, b) => a.position - b.position);

    return (
        <div
            className={`min-h-[600px] overflow-hidden ${darkMode ? "bg-gray-900" : "bg-gradient-to-br from-blue-50 to-indigo-50"
                } shadow-xl`}
        >
            {/* HEADER */}
            <div
                className={`px-8 py-6 ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white/80 border-gray-200 backdrop-blur-sm"
                    } border-b flex justify-between items-center`}
            >
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div
                            className={`w-3 h-3 rounded-full ${currentlyServing.length > 0
                                ? "bg-green-500 animate-pulse"
                                : "bg-gray-400"
                                }`}
                        />
                        <span className={`text-lg font-semibold ${darkMode ? "text-gray-200" : "text-gray-800"}`}>
                            Queue Display System
                        </span>
                    </div>

                    {/* Queue Stats */}
                    <div className="flex items-center gap-6 ml-6">
                        <div className="flex items-center gap-2">
                            <Users className={`h-4 w-4 ${darkMode ? "text-blue-400" : "text-blue-600"}`} />
                            <span className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                                {allWaitingCustomers.length + nextToServe.length} Waiting
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <CheckCircle className={`h-4 w-4 ${darkMode ? "text-green-400" : "text-green-600"}`} />
                            <span className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                                {allRecentlyServed.length} Served
                            </span>
                        </div>
                    </div>
                </div>

                <div className="text-right">
                    <div className={`text-md font-mono font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
                        {formatTime(currentTime)}
                    </div>
                    <div className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                        {formatDate(currentTime)}
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="p-8">
                {/* NOW SERVING - Large and Prominent */}
                {currentlyServing.length > 0 && (
                    <div className="mb-8">
                        <div className="flex items-center justify-center gap-4 mb-6">
                            <div className={` font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
                                NOW SERVING
                            </div>
                            <AnimatePresence>
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="flex items-center gap-2"
                                >
                                    <Volume2 className="size-5 text-green-500 animate-pulse" />
                                    <span className={`text-sm ${darkMode ? "text-green-400" : "text-green-600"}`}>
                                        Please proceed to counter
                                    </span>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {currentlyServing.map(({ counterNumber, counterName, data }) => (
                                <AnimatePresence key={counterNumber}>
                                    {data.currentServing && (
                                        <motion.div
                                            key={data.currentServing.id}
                                            initial={{ opacity: 0, y: 30, scale: 0.9 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                            className={`relative p-6 rounded-2xl ${darkMode
                                                ? "bg-gradient-to-br from-emerald-600 to-green-700 shadow-2xl"
                                                : "bg-gradient-to-br from-emerald-500 to-green-600 shadow-2xl"
                                                } text-white overflow-hidden`}
                                        >

                                            {/* Counter Badge */}
                                            <div className="flex items-center justify-between mb-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="size-3 rounded-full bg-green-200 animate-pulse" />
                                                    <span className="text-white/90 font-semibold text-lg">
                                                        {counterName}
                                                    </span>
                                                </div>
                                                <div className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">
                                                    Serving Now
                                                </div>
                                            </div>

                                            {/* Queue Number - Large and prominent */}
                                            <div className="text-center mb-4">
                                                <div className="text-4xl font-bold tracking-wider mb-2">
                                                    {data.currentServing.queueNumber}
                                                </div>

                                            </div>

                                            {/* Customer Name */}
                                            <div className="text-center mb-4">
                                                <div className="inline-block px-6 py-1 bg-white/20 rounded-lg backdrop-blur-sm">
                                                    <span className="text-xl font-semibold">
                                                        {data.currentServing.name}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Time indicator */}
                                            <div className="absolute bottom-4 right-4 flex items-center gap-1 text-white/70">
                                                <Clock className="h-4 w-4" />
                                                <span className="text-sm">Now</span>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            ))}
                        </div>
                    </div>
                )}

                {/* NEXT TO SERVE - Compact and Secondary */}
                {nextToServe.length > 0 && (
                    <div className="mb-8">
                        <div className="flex items-center justify-center gap-3 mb-4">

                            <div className={` font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
                                NEXT TO SERVE
                            </div>
                            <Loader className={`size-5 ${darkMode ? "text-orange-400" : "text-orange-500"} animate-pulse`} />
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${darkMode ? "bg-orange-900/50 text-orange-300" : "bg-orange-100 text-orange-700"}`}>
                                {nextToServe.length} counters
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {nextToServe.map(({ counterNumber, counterName, data }) => (
                                <motion.div
                                    key={counterNumber}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className={`p-4 rounded-xl ${darkMode
                                        ? "bg-gray-800 border "
                                        : "bg-white border border-orange-400/30"
                                        } shadow-lg`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                            <span className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                                                {counterName}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="text-center">
                                        <div className={`text-2xl font-bold mb-1 ${darkMode ? "text-white" : "text-gray-900"}`}>
                                            {data.currentServing.queueNumber}
                                        </div>
                                        <div className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                                            {data.currentServing.name}
                                        </div>
                                    </div>

                                    <div className="text-center mt-2">
                                        <span className={`text-xs px-2 py-1 rounded-full ${darkMode ? "bg-orange-900/50 text-orange-300" : "bg-orange-100 text-orange-600"}`}>
                                            Ready when called
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {/* WAITING QUEUE */}
                {allWaitingCustomers.length > 0 && (
                    <div className="mb-8">
                        <div className="flex items-center justify-center gap-3 mb-4">
                            <Users className={`h-6 w-6 ${darkMode ? "text-blue-400" : "text-blue-600"}`} />
                            <div className={`text-xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
                                WAITING QUEUE
                            </div>
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${darkMode ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                                {allWaitingCustomers.length} customers
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {allWaitingCustomers.slice(0, 12).map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className={`p-3 rounded-lg ${darkMode
                                        ? "bg-gray-800 border border-gray-700"
                                        : "bg-white border border-gray-200"
                                        } shadow-sm`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className={`text-lg font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
                                            {item.queueNumber}
                                        </div>
                                        <div className={`px-1.5 py-0.5 rounded text-xs ${darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                                            #{item.position}
                                        </div>
                                    </div>

                                    <div className={`text-xs font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                                        {item.name}
                                    </div>

                                    <div className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-500"}`}>
                                        Counter {item.counterNumber}
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {allWaitingCustomers.length > 12 && (
                            <div className="text-center mt-4">
                                <div className={`inline-block px-3 py-1 rounded-full text-sm ${darkMode ? "bg-gray-800 text-gray-400" : "bg-gray-200 text-gray-600"}`}>
                                    +{allWaitingCustomers.length - 12} more waiting
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* NO CUSTOMERS STATE */}
                {currentlyServing.length === 0 && nextToServe.length === 0 && allWaitingCustomers.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`p-16 rounded-3xl text-center ${darkMode
                            ? "bg-gray-800 border-2 border-gray-700"
                            : "bg-white/80 border-2 border-gray-200 backdrop-blur-sm"
                            }`}
                    >
                        <Users className={`h-16 w-16 mx-auto mb-4 ${darkMode ? "text-gray-600" : "text-gray-400"}`} />
                        <div className={`text-2xl font-semibold ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                            No customers in queue
                        </div>
                        <div className={`mt-2 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                            The queue is currently empty
                        </div>
                    </motion.div>
                )}

                {/* RECENTLY SERVED */}
                {allRecentlyServed.length > 0 && (
                    <div>
                        <div className="flex items-center justify-center gap-3 mb-4">
                            <CheckCircle className={`h-6 w-6 ${darkMode ? "text-green-400" : "text-green-600"}`} />
                            <div className={`text-xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
                                RECENTLY SERVED
                            </div>
                        </div>

                        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
                            {allRecentlyServed.map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: index * 0.1 }}
                                    className={`p-2 rounded-lg text-center ${darkMode
                                        ? "bg-gray-800 border border-gray-700"
                                        : "bg-white/80 border border-gray-200 backdrop-blur-sm"
                                        }`}
                                >
                                    <CheckCircle className={`h-4 w-4 mx-auto mb-1 ${darkMode ? "text-green-400" : "text-green-500"}`} />
                                    <div className={`font-bold text-sm ${darkMode ? "text-white" : "text-gray-900"}`}>
                                        {item.queueNumber}
                                    </div>
                                    <div className={`text-xs mt-1 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                                        {item.name}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* FOOTER */}
            <div
                className={`px-8 py-4 ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white/80 border-gray-200 backdrop-blur-sm"
                    } border-t text-center`}
            >
                <div className={`font-semibold ${darkMode ? "text-gray-200" : "text-gray-800"}`}>
                    Thank you for your patience
                </div>
            </div>
            {/* BOTTOM TICKER */} <div className="bg-blue-400  py-4 border-t-4 border-green-600"> <motion.div initial={{ x: "100%" }} animate={{ x: "-100%" }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }} className="text-xl font-bold whitespace-nowrap" > {currentlyServing.length > 0 ? `🔊 ATTENTION: Please proceed to counter for numbers: ${currentlyServing.map(c => c.data.currentServing.queueNumber).join(', ')}` : "🔊 Welcome! Please wait for your number to be called"} </motion.div> </div>
        </div>
    );
};

export default Display;