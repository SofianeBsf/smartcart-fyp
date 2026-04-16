import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function VerifyEmail() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");

        if (!token) {
          setStatus("error");
          setErrorMessage("Invalid verification link");
          return;
        }

        const response = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = await response.json();

        if (!response.ok) {
          setStatus("error");
          setErrorMessage(data.error || "Verification failed. Please try again.");
          toast.error("Verification failed");
          return;
        }

        setStatus("success");
        toast.success("Email verified successfully!");
      } catch (err: any) {
        setStatus("error");
        setErrorMessage("An error occurred during verification. Please try again.");
        toast.error("Verification failed");
      }
    };

    verifyEmail();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-hero flex-col items-center justify-center p-12">
        <div className="text-center space-y-6">
          <img src="/pickntake-icon.svg" alt="Pick N Take" className="w-20 h-20 mx-auto" />
          <div>
            <h1 className="text-4xl font-bold mb-2">Pick N Take</h1>
            <p className="text-lg text-muted-foreground">
              Verify your email to get started
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Verification Status */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <Card className="w-full max-w-md border-0 shadow-lg md:shadow-none md:border">
          <CardHeader className="space-y-2">
            <div className="flex lg:hidden items-center gap-2 mb-4">
              <img src="/pickntake-logo.svg" alt="Pick N Take" className="h-8" />
            </div>
            <CardTitle className="text-2xl">
              {status === "loading"
                ? "Verifying Email"
                : status === "success"
                ? "Email Verified"
                : "Verification Failed"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {status === "loading" && (
              <div className="space-y-6">
                <div className="flex justify-center">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                </div>
                <p className="text-center text-muted-foreground">
                  Verifying your email address...
                </p>
              </div>
            )}

            {status === "success" && (
              <div className="space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-green-600" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Your email has been verified!</h3>
                  <p className="text-sm text-muted-foreground">
                    You can now sign in to your account and start shopping.
                  </p>
                </div>
                <Button className="w-full" size="lg" asChild>
                  <Link href="/login">Sign In</Link>
                </Button>
              </div>
            )}

            {status === "error" && (
              <div className="space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                    <XCircle className="w-10 h-10 text-red-600" />
                  </div>
                </div>
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
                <div className="space-y-3">
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/login">Back to Sign In</Link>
                  </Button>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/register">Back to Register</Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
