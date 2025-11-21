import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
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
        // Connect to WebSocket
        socketService.connect();

        // Load initial queue data
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

        // Listen for real-time queue updates from ALL counters
        const unsubscribes: (() => void)[] = [];

        // Subscribe to all active counters
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

            // Find currently serving person (status = 'serving')
            if (item.status === 'serving') {
                organized[counterId].currentServing = {
                    id: item.id,
                    queueNumber: item.queue_number,
                    name: item.customer_name,
                    counterNumber: counterId,
                    timestamp: new Date(item.created_at),
                };
            }
            // Add waiting items to waiting queue
            else if (item.status === 'waiting') {
                organized[counterId].waitingQueue.push({
                    id: item.id,
                    queueNumber: item.queue_number,
                    name: item.customer_name,
                    counterNumber: counterId,
                    timestamp: new Date(item.created_at),
                });
            }
            // Add completed items to recently served
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

        // Sort waiting queues by creation time (oldest first)
        Object.values(organized).forEach((counterData: any) => {
            counterData.waitingQueue.sort((a: any, b: any) =>
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );

            // Sort recently served by served time (newest first)
            counterData.recentlyServed.sort((a: any, b: any) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
        });

        // For demo: If no one is serving, show the first waiting person as "NEXT TO SERVE"
        Object.entries(organized).forEach(([counterId, counterData]) => {
            if (!counterData.currentServing && counterData.waitingQueue.length > 0) {
                organized[counterId].currentServing = {
                    ...counterData.waitingQueue[0],
                    isNext: true // Flag to indicate this is the next person, not currently serving
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

    // Active counters (including next to serve)
    const activeCounters = Object.entries(counterData)
        .filter(([_, data]) => data.currentServing !== null)
        .map(([counterNum, data]) => ({
            counterNumber: parseInt(counterNum),
            counterName: data.counterInfo?.counter_name || `Counter ${counterNum}`,
            data,
            isNext: data.currentServing?.isNext || false
        }));

    // Recently served (across all counters)
    const allRecentlyServed = Object.values(counterData)
        .flatMap((data: any) => data.recentlyServed)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 5);

    return (
        <div
            className={`min-h-[600px] overflow-hidden ${darkMode ? "bg-gray-800" : "bg-white"
                } shadow-xl`}
        >
            {/* HEADER */}
            <div
                className={`px-8 py-4 ${darkMode ? "bg-gray-900 border-gray-700" : "bg-gray-100 border-gray-200"
                    } border-b flex justify-between items-center`}
            >
                <div className="flex items-center gap-3">
                    <div
                        className={`w-3 h-3 rounded-full ${activeCounters.length > 0
                            ? "bg-green-500 animate-pulse"
                            : "bg-gray-400"
                            }`}
                    />
                    <span className={darkMode ? "text-gray-300" : "text-gray-700"}>
                        Queue Display System
                    </span>
                </div>

                <div className="text-right">
                    <div className={darkMode ? "text-white" : "text-gray-900"}>
                        {formatTime(currentTime)}
                    </div>
                    <div className={darkMode ? "text-gray-400" : "text-gray-600"}>
                        {formatDate(currentTime)}
                    </div>
                </div>
            </div>

            {/* MAIN */}
            <div className="p-8">
                {/* NOW SERVING / NEXT TO SERVE */}
                <div className="mb-12">
                    <div
                        className={`text-center mb-6 flex items-center justify-center gap-3 ${darkMode ? "text-gray-400" : "text-gray-600"
                            }`}
                    >
                        <span>
                            {activeCounters.some(c => !c.isNext) ? "NOW SERVING" : "NEXT TO SERVE"}
                        </span>
                        <AnimatePresence>
                            {activeCounters.length > 0 && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                >
                                    <Volume2 className="h-6 w-6 text-green-500" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {activeCounters.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {activeCounters.map(({ counterNumber, counterName, data, isNext }) => (
                                <AnimatePresence key={counterNumber}>
                                    {data.currentServing && (
                                        <motion.div
                                            key={data.currentServing.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`p-8 rounded-2xl ${isNext
                                                ? darkMode
                                                    ? "bg-gradient-to-br from-orange-900 to-orange-800"
                                                    : "bg-gradient-to-br from-orange-500 to-orange-600"
                                                : darkMode
                                                    ? "bg-gradient-to-br from-blue-900 to-blue-800"
                                                    : "bg-gradient-to-br from-blue-500 to-blue-600"
                                                } shadow-xl`}
                                        >
                                            <div className="text-white/70 mb-2">
                                                {counterName}
                                                {isNext && " (Next)"}
                                            </div>
                                            <div className="text-3xl font-bold text-white mb-4">
                                                {data.currentServing.queueNumber}
                                            </div>
                                            <div className="inline-block px-6 py-3 bg-white/20 rounded-full">
                                                <span className="text-white text-xl font-semibold">
                                                    {data.currentServing.name}
                                                </span>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            ))}
                        </div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`p-12 rounded-2xl text-center ${darkMode
                                ? "bg-gray-700 border-2 border-gray-600"
                                : "bg-gray-100 border-2 border-gray-300"
                                }`}
                        >
                            <div className={`text-2xl ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                                No customers in queue
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* WAITING QUEUE */}
                {Object.values(counterData).some((data: any) => data.waitingQueue.length > 1) && (
                    <div className="mb-12">
                        <div
                            className={`text-center mb-6 ${darkMode ? "text-gray-400" : "text-gray-600"
                                }`}
                        >
                            <span className="text-xl font-bold">WAITING QUEUE</span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {Object.entries(counterData)
                                .flatMap(([counterNum, data]: [string, any]) =>
                                    data.waitingQueue.slice(1).map((item: any, index: number) => ({
                                        ...item,
                                        position: index + 2, // +2 because position 1 is the "next to serve"
                                        counterNumber: parseInt(counterNum)
                                    }))
                                )
                                .slice(0, 8) // Show max 8 waiting
                                .map((item, index) => (
                                    <motion.div
                                        key={item.id}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: index * 0.1 }}
                                        className={`p-4 rounded-lg text-center ${darkMode
                                            ? "bg-gray-700 border border-gray-600"
                                            : "bg-gray-50 border border-gray-200"
                                            }`}
                                    >
                                        <div className={`font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
                                            {item.queueNumber}
                                        </div>
                                        <div
                                            className={darkMode ? "text-gray-400" : "text-gray-600"}
                                        >
                                            {item.name}
                                        </div>
                                        <div className="text-gray-500 text-sm mt-1">
                                            # {item.position}
                                        </div>
                                    </motion.div>
                                ))}
                        </div>
                    </div>
                )}

                {/* RECENTLY SERVED */}
                {allRecentlyServed.length > 0 && (
                    <div>
                        <div
                            className={`text-center mb-6 ${darkMode ? "text-gray-400" : "text-gray-600"
                                }`}
                        >
                            <span className="text-xl font-bold">RECENTLY SERVED</span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {allRecentlyServed.map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: index * 0.1 }}
                                    className={`p-4 rounded-lg text-center ${darkMode
                                        ? "bg-gray-700 border border-gray-600"
                                        : "bg-gray-50 border border-gray-200"
                                        }`}
                                >
                                    <div className={`font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
                                        {item.queueNumber}
                                    </div>
                                    <div
                                        className={darkMode ? "text-gray-400" : "text-gray-600"}
                                    >
                                        {item.name}
                                    </div>
                                    <div className="text-gray-500 text-sm mt-1">
                                        Counter {item.counterNumber}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* FOOTER */}
            <div
                className={`px-8 py-4 ${darkMode ? "bg-gray-900 border-gray-700" : "bg-gray-100 border-gray-200"
                    } border-t text-center`}
            >
                <span className={darkMode ? "text-gray-400" : "text-gray-600"}>
                    Thank you for your patience
                </span>
            </div>
        </div>
    );
};

export default Display;