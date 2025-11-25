// components/ControllerWrapper.tsx
import { useEffect, useState, useRef, useCallback } from "react";
import { ControllerDashboard } from "./ControllerDashboard";
import { QueueService, CounterService, socketService } from "@/services/api";

const ControllerWrapper = () => {
    const [queue, setQueue] = useState<any[]>([]);
    const [currentServing, setCurrentServing] = useState<any | null>(null);
    const [counterNumber, setCounterNumber] = useState<any>(1);
    const [counters, setCounters] = useState([{ id: 1, name: "Counter 1", isActive: true }]);
    const [totalServedToday, setTotalServedToday] = useState(0);

    // Use ref to prevent multiple loads
    const isQueueLoading = useRef(false);
    const currentCounterRef = useRef(counterNumber);

    // Update ref when counter changes
    useEffect(() => {
        currentCounterRef.current = counterNumber;
    }, [counterNumber]);

    const loadQueue = async (counterId = currentCounterRef.current) => {
        if (isQueueLoading.current) return;

        isQueueLoading.current = true;
        try {
            console.log(`🔄 Loading queue for counter: ${counterId}`);
            const data = await QueueService.listQueue(counterId);
            if (data.success) {
                processQueueData(data.data);
            } else {
                console.error("Failed to load queue:", data.message);
            }
        } catch (err) {
            console.error("Failed to fetch queue:", err);
        } finally {
            // Add small delay before allowing next load
            setTimeout(() => {
                isQueueLoading.current = false;
            }, 1000);
        }
    };

    const loadCounters = async () => {
        try {
            console.log("🔄 Loading counters...");
            const data = await CounterService.fetchCounters();
            if (data.success) {
                setCounters(data.data.map((counter: any) => ({
                    id: counter.id,
                    name: counter.counter_name,
                    isActive: counter.status === 'Active'
                })));
                console.log("✅ Counters loaded:", data.data);
            } else {
                console.error("Failed to load counters:", data.message);
            }
        } catch (err) {
            console.error("Failed to fetch counters:", err);
        }
    };

    // Process queue data - FIXED to handle API response format
    const processQueueData = (queueData: any[]) => {
        console.log("📊 Processing queue data:", queueData);

        const processedData = queueData.map((item: any) => ({
            ...item,
            id: item.id?.toString() || item.queue_id?.toString(),
            queueNumber: item.queue_number,
            name: item.customer_name,
            status: item.status,
            timestamp: new Date(item.created_at || item.updated_at)
        }));

        setQueue(processedData);

        // Find currently serving customer
        const serving = processedData.find((q: any) => q.status === "serving") || null;
        setCurrentServing(serving);

        // Count completed today
        const completedCount = processedData.filter((q: any) => q.status === "completed").length;
        setTotalServedToday(completedCount);

        console.log("✅ Queue processed - Serving:", serving, "Completed:", completedCount);
    };

    // FIXED WebSocket event handlers
    const handleQueueListUpdate = useCallback((data: any) => {
        console.log("🔄 Queue list update received:", data);
        // Reload the entire queue when list updates
        loadQueue();
    }, []);

    const handleServiceQueueUpdate = useCallback((data: any) => {
        console.log("🔄 Service queue update received:", data);
        // Update specific queue item
        if (data.queue) {
            updateQueueState(data.queue);
        }
    }, []);

    const handleCounterUpdate = useCallback((data: any) => {
        console.log("🔄 Counter update received:", data);
        // Reload counters when they change
        loadCounters();
    }, []);

    // FIXED WebSocket setup with proper cleanup
    useEffect(() => {
        console.log("🔌 Initializing WebSocket connection...");
        socketService.connect();

        // Subscribe to WebSocket events
        const unsubscribeQueueList = QueueService.onQueueListUpdate(handleQueueListUpdate);
        const unsubscribeServiceQueue = QueueService.onServiceQueueUpdate(counterNumber, handleServiceQueueUpdate);
        const unsubscribeCounterUpdate = CounterService.onCounterUpdate(handleCounterUpdate);

        // Load initial data with staggered delays
        const initialLoadTimeout = setTimeout(() => {
            loadQueue();
        }, 500);

        const countersLoadTimeout = setTimeout(() => {
            loadCounters();
        }, 1000);

        return () => {
            console.log("🧹 Cleaning up WebSocket subscriptions...");
            unsubscribeQueueList();
            unsubscribeServiceQueue();
            unsubscribeCounterUpdate();
            clearTimeout(initialLoadTimeout);
            clearTimeout(countersLoadTimeout);
        };
    }, [counterNumber, handleQueueListUpdate, handleServiceQueueUpdate, handleCounterUpdate]);

    // FIXED: Update queue state helper
    const updateQueueState = (updatedItem: any) => {
        console.log("🔄 Updating queue state with:", updatedItem);

        if (!updatedItem || !updatedItem.id) {
            console.error("Invalid queue item received:", updatedItem);
            return;
        }

        setQueue(prevQueue => {
            const itemExists = prevQueue.some(item => item.id === updatedItem.id.toString());

            if (!itemExists) {
                console.log("🆕 New queue item detected, reloading full queue...");
                loadQueue();
                return prevQueue;
            }

            return prevQueue.map(item =>
                item.id === updatedItem.id.toString()
                    ? {
                        ...item,
                        status: updatedItem.status,
                        queueNumber: updatedItem.queue_number,
                        name: updatedItem.customer_name,
                        timestamp: new Date(updatedItem.updated_at || updatedItem.created_at)
                    }
                    : item
            );
        });

        // Update current serving
        if (updatedItem.status === 'serving') {
            setCurrentServing({
                id: updatedItem.id.toString(),
                queueNumber: updatedItem.queue_number,
                name: updatedItem.customer_name,
                status: 'serving',
                timestamp: new Date(updatedItem.updated_at || updatedItem.created_at)
            });
        } else if (updatedItem.status === 'completed' && currentServing?.id === updatedItem.id.toString()) {
            setCurrentServing(null);
        }

        // Update counts
        if (updatedItem.status === 'completed') {
            setTotalServedToday(prev => prev + 1);
        }
    };

    // FIXED Action handlers with proper error handling
    const handleCallNext = async () => {
        console.log("🔄 Calling next for counter:", counterNumber);
        try {
            const result = await QueueService.callNext(counterNumber);
            console.log("📞 Call Next Result:", result);

            if (result.success) {
                console.log("✅ Successfully called next person");
                if (result.data) {
                    updateQueueState(result.data);
                }
                // Reload queue to ensure consistency
                setTimeout(() => loadQueue(), 300);
            } else {
                console.error("❌ Failed to call next:", result.message);
                // Show user-friendly error message
                alert(result.message || "Failed to call next person");
            }
        } catch (error) {
            console.error("🚨 Call Next Error:", error);
            alert("Network error occurred while calling next person");
        }
    };

    const handleComplete = async (id: string) => {
        try {
            console.log("✅ Completing queue item:", id);
            const result = await QueueService.completeQueue(parseInt(id));

            if (result.success) {
                console.log("✅ Successfully completed queue item");
                if (result.data) {
                    updateQueueState(result.data);
                }
                setTimeout(() => loadQueue(), 300);
            } else {
                console.error("❌ Failed to complete:", result.message);
                alert(result.message || "Failed to complete queue item");
            }
        } catch (err) {
            console.error("Failed to complete:", err);
            alert("Network error occurred while completing queue item");
        }
    };

    const handleSkip = async (id: string) => {
        try {
            const item = queue.find(q => q.id === id);
            if (!item) {
                console.error("Item not found for skipping:", id);
                return;
            }

            console.log("⏭️ Skipping queue item:", item.name);

            // Complete the current item first
            await handleComplete(id);

            // Then re-add to the end with the same name
            if (item.name) {
                const addResult = await QueueService.addPerson({
                    customer_name: item.name,
                    is_priority: false
                });

                if (addResult.success) {
                    console.log("✅ Successfully re-added skipped person");
                } else {
                    console.error("❌ Failed to re-add skipped person:", addResult.message);
                }
            }
        } catch (err) {
            console.error("Failed to skip:", err);
            alert("Network error occurred while skipping queue item");
        }
    };

    const handleRemove = async (id: string) => {
        try {
            await handleComplete(id);
        } catch (err) {
            console.error("Failed to remove:", err);
            alert("Network error occurred while removing queue item");
        }
    };

    const handleEditName = async (id: string, newName: string) => {
        try {
            const item = queue.find(q => q.id === id);
            if (!item) {
                console.error("Item not found for editing:", id);
                return;
            }

            if (!newName.trim()) {
                alert("Name cannot be empty");
                return;
            }

            console.log("✏️ Editing name for item:", id, "New name:", newName);

            // Complete the old item
            await handleComplete(id);

            // Add new item with updated name
            const addResult = await QueueService.addPerson({
                customer_name: newName.trim(),
                is_priority: false
            });

            if (addResult.success) {
                console.log("✅ Successfully updated name");
            } else {
                console.error("❌ Failed to update name:", addResult.message);
            }
        } catch (err) {
            console.error("Failed to edit name:", err);
            alert("Network error occurred while editing name");
        }
    };

    const handleClearCompleted = async () => {
        try {
            const completedItems = queue.filter(q => q.status === "completed");
            console.log("🗑️ Clearing completed items:", completedItems.length);

            if (completedItems.length === 0) {
                console.log("No completed items to clear");
                return;
            }

            // Note: You might need a bulk complete endpoint on your backend
            // For now, complete them individually
            for (const item of completedItems) {
                await QueueService.completeQueue(parseInt(item.id));
            }

            console.log("✅ All completed items cleared");
            // Reload the entire queue after clearing
            setTimeout(() => loadQueue(), 500);
        } catch (err) {
            console.error("Failed to clear completed:", err);
            alert("Network error occurred while clearing completed items");
        }
    };

    const handleRecall = async () => {
        if (!currentServing) {
            console.log("❌ No currently serving customer to recall");
            return;
        }

        try {
            console.log("🔊 Recalling customer:", currentServing.name);
            const result = await QueueService.recall(parseInt(currentServing.id));

            if (result.success) {
                console.log("✅ Successfully recalled customer");
                if (result.data) {
                    updateQueueState(result.data);
                }
                setTimeout(() => loadQueue(), 300);
            } else {
                console.error("❌ Failed to recall:", result.message);
                alert(result.message || "Failed to recall customer");
            }
        } catch (err) {
            console.error("Failed to recall:", err);
            alert("Network error occurred while recalling customer");
        }
    };

    const handleAddPerson = async (name: string) => {
        if (!name.trim()) {
            alert("Please enter a name");
            return;
        }

        try {
            console.log("👤 Adding person:", name);
            const result = await QueueService.addPerson({
                customer_name: name.trim(),
                is_priority: false
            });

            if (result.success) {
                console.log("✅ Successfully added person");
                // Reload queue to show new person
                setTimeout(() => loadQueue(), 500);
            } else {
                console.error("❌ Failed to add person:", result.message);
                alert(result.message || "Failed to add person to queue");
            }
        } catch (err) {
            console.error("Failed to add person:", err);
            alert("Network error occurred while adding person");
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
            onCounterChange={(num) => {
                console.log("🔄 Changing counter to:", num);
                setCounterNumber(num);
            }}
            onAddPerson={handleAddPerson}
            onRemove={handleRemove}
            onComplete={handleComplete}
            onEditName={handleEditName}
            onClearCompleted={handleClearCompleted}
        />
    );
}

export default ControllerWrapper;