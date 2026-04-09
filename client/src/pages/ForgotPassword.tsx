import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const validateEmail = () => {
    setError("");

    if (!email) {
      setError("Email is required");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail()) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error("Failed to process request");
      }

      setSuccess(true);
      setEmail("");
      toast.success("If an account exists, a reset link has been sent to your email.");
    } catch (err: any) {
      const msg = err.message || "Failed to process request. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-hero flex-col items-center justify-center p-12">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center mx-auto">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold mb-2">SmartCart</h1>
            <p className="text-lg text-muted-foreground">
              Reset your password and regain access
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <Card className="w-full max-w-md border-0 shadow-lg md:shadow-none md:border">
          <CardHeader className="space-y-2">
            <div className="flex lg:hidden items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg">SmartCart</span>
            </div>
            <CardTitle className="text-2xl">Reset Password</CardTitle>
            <CardDescription>
              Enter your email address and we'll send you a password reset link
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="space-y-4">
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    If an account exists with this email, you'll receive a reset link shortly.
                  </AlertDescription>
                </Alert>

                <p className="text-sm text-muted-foreground">
                  Check your inbox for an email from SmartCart with instructions to reset your password.
                  The link will expire in 1 hour.
                </p>

                <Button
                  variant="outline"
                  className="w-full"
                  asChild
                >
                  <Link href="/login">Back to Sign In</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    We'll send a password reset link to this email
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                  size="lg"
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  asChild
                >
                  <Link href="/login" className="flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Sign In
                  </Link>
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
