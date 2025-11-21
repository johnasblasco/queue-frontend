// components/ControllerWrapper.tsx
import { useEffect, useState } from "react";
import { ControllerDashboard } from "./ControllerDashboard";
import { QueueService, CounterService, socketService } from "@/services/api";

const ControllerWrapper = ({ token }: { token?: string }) => {
    const [queue, setQueue] = useState<any[]>([]);
    const [currentServing, setCurrentServing] = useState<any | null>(null);
    const [counterNumber, setCounterNumber] = useState<any>(1);
    const [counters, setCounters] = useState([{ id: 1, name: "Counter 1", isActive: true }]);
    const [totalServedToday, setTotalServedToday] = useState(0);

    const loadQueue = async () => {
        try {
            const data = await QueueService.listQueue(counterNumber);
            if (data.success) {
                processQueueData(data.data);
            }
        } catch (err) {
            console.error("Failed to fetch queue:", err);
        }
    };

    const processQueueData = (queueData: any[]) => {
        const processedData = queueData.map((item: any) => ({
            ...item,
            id: item.id.toString(),
            queueNumber: item.queue_number,
            name: item.customer_name,
            status: item.status,
            timestamp: new Date(item.created_at)
        }));

        setQueue(processedData);
        const serving = processedData.find((q: any) => q.status === "serving") || null;
        setCurrentServing(serving);
        setTotalServedToday(processedData.filter((q: any) => q.status === "completed").length);
    };

    // WebSocket handler for real-time updates
    const handleQueueUpdate = (data: any) => {
        console.log("🔄 Real-time queue update received:", data);
        loadQueue();
    };

    useEffect(() => {
        // Connect to Pusher (no token needed for public channels)
        socketService.connect();

        // Listen for real-time queue updates for the current counter
        const unsubscribeQueue = QueueService.onQueueUpdate(counterNumber, handleQueueUpdate);

        // Load initial data
        loadQueue();

        // Load counters
        CounterService.fetchCounters().then(data => {
            if (data.success) {
                setCounters(data.data.map((counter: any) => ({
                    id: counter.id,
                    name: counter.counter_name,
                    isActive: counter.status === 'Active'
                })));
            }
        });

        // Cleanup
        return () => {
            unsubscribeQueue();
            socketService.disconnect();
        };
    }, [counterNumber]); // Remove token dependency

    // Helper function to manually update queue state
    const updateQueueState = (updatedItem: any) => {
        setQueue(prevQueue =>
            prevQueue.map(item =>
                item.id === updatedItem.id.toString()
                    ? {
                        ...item,
                        status: updatedItem.status,
                        queueNumber: updatedItem.queue_number,
                        name: updatedItem.customer_name
                    }
                    : item
            )
        );

        // Update current serving
        if (updatedItem.status === 'serving') {
            setCurrentServing({
                id: updatedItem.id.toString(),
                queueNumber: updatedItem.queue_number,
                name: updatedItem.customer_name,
                status: 'serving',
                timestamp: new Date(updatedItem.created_at)
            });
        } else if (updatedItem.status === 'completed' && currentServing?.id === updatedItem.id.toString()) {
            setCurrentServing(null);
        }

        // Update counts
        setTotalServedToday(prev => {
            if (updatedItem.status === 'completed') {
                return prev + 1;
            }
            return prev;
        });
    };

    // Action handlers with immediate UI updates
    const handleCallNext = async () => {
        if (currentServing) {
            console.log("❌ Cannot call next - someone is already serving");
            return;
        }
        console.log("🔄 Calling next for counter:", counterNumber);
        try {
            const result = await QueueService.callNext(counterNumber);
            console.log("📞 Call Next Result:", result);
            if (result.success) {
                console.log("✅ Successfully called next person");
                // Immediately update UI with the new serving person
                if (result.data) {
                    updateQueueState(result.data);
                }
                // Also reload queue to ensure consistency
                setTimeout(() => loadQueue(), 500);
            } else {
                console.log("❌ Failed to call next:", result.message);
            }
        } catch (error) {
            console.error("🚨 Call Next Error:", error);
        }
    };

    const handleComplete = async (id: string) => {
        try {
            const result = await QueueService.completeQueue(parseInt(id));
            if (result.success && result.data) {
                console.log("✅ Successfully completed queue item");
                // Immediately update UI
                updateQueueState(result.data);
                // Also reload queue to ensure consistency
                setTimeout(() => loadQueue(), 500);
            }
        } catch (err) {
            console.error("Failed to complete:", err);
        }
    };

    const handleSkip = async (id: string) => {
        try {
            const item = queue.find(q => q.id === id);
            if (!item) return;

            // First complete the current item
            await handleComplete(id);

            // Then re-add to the end
            if (item) {
                await QueueService.addPerson({
                    customer_name: item.name,
                    is_priority: false
                });
            }
        } catch (err) {
            console.error("Failed to skip:", err);
        }
    };

    const handleRemove = async (id: string) => {
        try {
            await handleComplete(id);
        } catch (err) {
            console.error("Failed to remove:", err);
        }
    };

    const handleEditName = async (id: string, newName: string) => {
        try {
            const item = queue.find(q => q.id === id);
            if (!item) return;

            // Complete the old item
            await handleComplete(id);

            // Add new item with updated name
            await QueueService.addPerson({
                customer_name: newName,
                is_priority: false
            });
        } catch (err) {
            console.error("Failed to edit name:", err);
        }
    };

    const handleClearCompleted = async () => {
        try {
            const completedItems = queue.filter(q => q.status === "completed");
            for (const item of completedItems) {
                await QueueService.completeQueue(parseInt(item.id));
            }
            // Reload the entire queue after clearing
            setTimeout(() => loadQueue(), 500);
        } catch (err) {
            console.error("Failed to clear completed:", err);
        }
    };

    const handleRecall = async () => {
        if (!currentServing) return;
        try {
            const result = await QueueService.recall(parseInt(currentServing.id));
            if (result.success) {
                console.log("✅ Successfully recalled customer");
                // Reload queue to get updated state
                setTimeout(() => loadQueue(), 500);
            }
        } catch (err) {
            console.error("Failed to recall:", err);
        }
    };

    const handleAddPerson = async (name: string, counterNum: number) => {
        try {
            const result = await QueueService.addPerson({
                customer_name: name,
                is_priority: false
            });
            if (result.success) {
                console.log("✅ Successfully added person");
                // Reload queue to show new person
                setTimeout(() => loadQueue(), 500);
            }
        } catch (err) {
            console.error("Failed to add person:", err);
        }
    };

    return (
        <ControllerDashboard
            queue={queue}
            currentServing={currentServing}
            counterNumber={counterNumber}
            counters={counters}
            totalServedToday={totalServedToday}
            onCallNext={handleCallNext}
            onRecall={handleRecall}
            onSkip={handleSkip}
            onCounterChange={(num) => setCounterNumber(num)}
            onAddPerson={handleAddPerson}
            onRemove={handleRemove}
            onComplete={handleComplete}
            onEditName={handleEditName}
            onClearCompleted={handleClearCompleted}
        />
    );
}

export default ControllerWrapper;