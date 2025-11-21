import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, setAuthToken } from "@/services/api";
import { useNavigate } from "react-router-dom";
interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogin: (token: string) => void | any;
}

export default function LoginModal({ isOpen, onClose, onLogin }: ModalProps) {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: any) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const res = await login(username, password);
            if (res.isSuccess && res.access_token) {
                setAuthToken(res.access_token);
                onLogin(res.access_token);
                onClose();
                navigate("/admin")
            } else {
                setError(res.message || "Login failed");
            }
        } catch (err: any) {
            setError(err.message || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-white rounded-xl shadow-lg">
                <DialogHeader>
                    <DialogTitle className="text-blue-600">Login</DialogTitle>
                    <DialogDescription>
                        Enter your username and password to manage the counter.
                    </DialogDescription>
                </DialogHeader>
                <form className="grid gap-4 py-4" onSubmit={handleSubmit}>
                    <div className="grid gap-2">
                        <Label htmlFor="username">Username</Label>
                        <Input
                            id="username"
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    {error && <p className="text-red-600 text-sm">{error}</p>}
                    <div className="flex flex-col gap-2 mt-4">
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 w-full" disabled={loading}>
                            {loading ? "Logging in..." : "Login"}
                        </Button>
                        <Button variant="outline" className="w-full" onClick={onClose} disabled={loading}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
