import { useState, useMemo } from "react";
import { useLocation, Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function Register() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const redirectTo = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("redirect") || "";
  }, [searchString]);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    setError("");

    if (!formData.name.trim()) {
      setError("Full name is required");
      return false;
    }

    if (!formData.email) {
      setError("Email is required");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError("Please enter a valid email");
      return false;
    }

    if (!formData.password) {
      setError("Password is required");
      return false;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }

    if (!/[A-Z]/.test(formData.password)) {
      setError("Password must contain at least 1 uppercase letter");
      return false;
    }

    if (!/[0-9]/.test(formData.password)) {
      setError("Password must contain at least 1 number");
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return false;
    }

    if (!agreeToTerms) {
      setError("You must agree to the terms and conditions");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }

      toast.success(data.message || "Account created successfully!", {
        duration: 6000,
      });
      setLocation(redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login");
    } catch (err: any) {
      const msg = err.message || "Registration failed. Please try again.";
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
          <img src="/pickntake-icon.svg" alt="Pick N Take" className="w-20 h-20 mx-auto" />
          <div>
            <h1 className="text-4xl font-bold mb-2">Pick N Take</h1>
            <p className="text-lg text-muted-foreground">
              Join us and start shopping smarter
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Registration Form */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <Card className="w-full max-w-md border-0 shadow-lg md:shadow-none md:border">
          <CardHeader className="space-y-2">
            <div className="flex lg:hidden items-center gap-2 mb-4">
              <img src="/pickntake-logo.svg" alt="Pick N Take" className="h-8" />
            </div>
            <CardTitle className="text-2xl">Create Account</CardTitle>
            <CardDescription>
              Sign up to start your shopping journey
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Full Name
                </label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Min. 8 characters, 1 uppercase, 1 number
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm Password
                </label>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="terms"
                  checked={agreeToTerms}
                  onCheckedChange={(checked) => setAgreeToTerms(checked as boolean)}
                  disabled={loading}
                  className="mt-1"
                />
                <label htmlFor="terms" className="text-sm cursor-pointer leading-tight">
                  I agree to the{" "}
                  <button type="button" className="text-primary hover:underline">
                    Terms and Conditions
                  </button>
                </label>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                size="lg"
              >
                {loading ? "Creating Account..." : "Create Account"}
              </Button>
            </form>

            <div className="mt-6">
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-background text-muted-foreground">
                    Already have an account?
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                asChild
              >
                <Link href={redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login"}>Sign In</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
