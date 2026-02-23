import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LayoutDashboard,
  Package,
  Upload,
  Settings,
  BarChart3,
  Search,
  Clock,
  Database,
  Brain,
  Sparkles,
  RefreshCw,
  FileUp,
  AlertCircle,
  CheckCircle,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import Header from "@/components/Header";

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const devLoginAttemptKey = "smartcart-admin-dev-login-attempted";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Check admin access
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // In local development, attempt dev-login once to prevent infinite refresh loops.
  if (!isAuthenticated || user?.role !== "admin") {
    if (import.meta.env.DEV) {
      const hasAttemptedDevLogin =
        typeof window !== "undefined" &&
        window.sessionStorage.getItem(devLoginAttemptKey) === "1";

      if (!hasAttemptedDevLogin) {
        window.sessionStorage.setItem(devLoginAttemptKey, "1");
        window.location.href = "/api/auth/dev-login?redirect=/admin";
        return null;
      }
    }

    if (!isAuthenticated) {
      window.location.href = "/api/auth/dev-login?redirect=/admin";
      return null;
    }

    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-12">
          <Card className="max-w-md mx-auto p-8 text-center">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">
              Your account ({user?.email}) does not have admin privileges.
            </p>
            <Button onClick={() => {
              window.sessionStorage.removeItem(devLoginAttemptKey);
              window.location.href = "/api/auth/dev-login?redirect=/admin";
            }}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Login as Admin
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(devLoginAttemptKey);
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container py-6">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <LayoutDashboard className="w-8 h-8 text-primary" />
              Admin Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage products, tune AI rankings, and monitor system performance
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            Admin: {user?.name || user?.email}
          </Badge>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="catalog" className="gap-2">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Catalog</span>
            </TabsTrigger>
            <TabsTrigger value="weights" className="gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Weights</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Logs</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <OverviewTab />
          </TabsContent>

          {/* Catalog Tab */}
          <TabsContent value="catalog">
            <CatalogTab />
          </TabsContent>

          {/* Weights Tab */}
          <TabsContent value="weights">
            <WeightsTab />
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs">
            <LogsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function OverviewTab() {
  const { data: stats, isLoading } = trpc.admin.stats.overview.useQuery();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Products",
      value: stats?.productCount || 0,
      icon: Package,
      description: "Products in catalog",
    },
    {
      title: "Embeddings",
      value: stats?.embeddingCount || 0,
      icon: Brain,
      description: "Vector embeddings generated",
    },
    {
      title: "Search Queries",
      value: stats?.searchCount || 0,
      icon: Search,
      description: "Recent searches logged",
    },
    {
      title: "Avg Response Time",
      value: `${stats?.avgResponseTimeMs || 0}ms`,
      icon: Clock,
      description: "Search response time",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <QuickActionButton
            icon={RefreshCw}
            title="Regenerate All Embeddings"
            description="Update vector embeddings for all products"
            action="embeddings"
          />
          <QuickActionButton
            icon={Database}
            title="Clear Search Cache"
            description="Clear cached search results"
            action="cache"
          />
          <QuickActionButton
            icon={BarChart3}
            title="Calculate IR Metrics"
            description="Compute nDCG@10 and Recall@10"
            action="metrics"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function QuickActionButton({ 
  icon: Icon, 
  title, 
  description, 
  action 
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string; 
  action: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const generateEmbeddings = trpc.admin.products.generateAllEmbeddings.useMutation();

  const handleClick = async () => {
    setIsLoading(true);
    try {
      if (action === "embeddings") {
        const result = await generateEmbeddings.mutateAsync();
        toast.success(`Generated ${result.success} embeddings (${result.failed} failed)`);
      } else {
        toast.info("Feature coming soon");
      }
    } catch (error) {
      toast.error("Action failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="h-auto p-4 flex flex-col items-start gap-2"
      onClick={handleClick}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Icon className="w-5 h-5" />
      )}
      <div className="text-left">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground font-normal">{description}</p>
      </div>
    </Button>
  );
}

function CatalogTab() {
  const [products, setProducts] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: productList, isLoading } = trpc.products.list.useQuery({ limit: 50 });
  const { data: uploadJobs } = trpc.admin.catalog.jobs.useQuery({ limit: 5 });
  const uploadCatalog = trpc.admin.catalog.upload.useMutation({
    onSuccess: () => {
      toast.success("Catalog uploaded successfully");
      utils.products.list.invalidate();
      utils.admin.catalog.jobs.invalidate();
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split("\n").filter(line => line.trim());
      
      if (lines.length < 2) {
        toast.error("CSV file must have headers and at least one data row");
        return;
      }

      const parseCsvLine = (line: string) => {
        const values: string[] = [];
        let current = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];

          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
            continue;
          }

          if (char === "," && !inQuotes) {
            values.push(current.trim());
            current = "";
            continue;
          }

          current += char;
        }

        values.push(current.trim());
        return values;
      };

      const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
      const products = lines.slice(1).map(line => {
        const values = parseCsvLine(line);
        const product: any = {};
        
        headers.forEach((header, index) => {
          const value = values[index]?.trim().replace(/^"|"$/g, "");
          
          switch (header) {
            case "title":
            case "name":
              product.title = value;
              break;
            case "description":
              product.description = value;
              break;
            case "category":
              product.category = value;
              break;
            case "price":
              product.price = value;
              break;
            case "rating":
              product.rating = value;
              break;
            case "image":
            case "imageurl":
            case "image_url":
              product.imageUrl = value;
              break;
            case "brand":
              product.brand = value;
              break;
            case "asin":
              product.asin = value;
              break;
          }
        });

        return product;
      }).filter(p => p.title);

      if (products.length === 0) {
        toast.error("No valid products found in CSV");
        return;
      }

      toast.info(`Uploading ${products.length} products...`);
      await uploadCatalog.mutateAsync({ products, generateEmbeddings: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload catalog";
      toast.error(message.includes("Failed to parse CSV") ? message : `Upload failed: ${message}`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Catalog
          </CardTitle>
          <CardDescription>
            Upload a CSV file with product data. Required columns: title. 
            Optional: description, category, price, rating, imageUrl, brand.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={uploadCatalog.isPending}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadCatalog.isPending}
            >
              {uploadCatalog.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4 mr-2" />
                  Select CSV
                </>
              )}
            </Button>
          </div>

          {/* Recent Upload Jobs */}
          {uploadJobs && uploadJobs.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium mb-3">Recent Uploads</h4>
              <div className="space-y-2">
                {uploadJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {job.status === "completed" ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : job.status === "failed" ? (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{job.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.processedRows}/{job.totalRows} products • {job.embeddedRows} embeddings
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        job.status === "completed"
                          ? "default"
                          : job.status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {job.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Products
            </span>
            <Badge variant="outline">{productList?.total || 0} total</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : productList?.products && productList.products.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productList.products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium max-w-[300px] truncate">
                      {product.title}
                    </TableCell>
                    <TableCell>{product.category || "-"}</TableCell>
                    <TableCell>
                      {product.price ? `£${parseFloat(product.price).toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell>{product.rating || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          product.availability === "in_stock"
                            ? "default"
                            : product.availability === "low_stock"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {product.availability?.replace("_", " ") || "unknown"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No products in catalog. Upload a CSV to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WeightsTab() {
  const { data: weights, isLoading } = trpc.admin.weights.get.useQuery();
  const updateWeights = trpc.admin.weights.update.useMutation({
    onSuccess: () => {
      toast.success("Weights updated successfully");
    },
    onError: () => {
      toast.error("Failed to update weights");
    },
  });

  const [localWeights, setLocalWeights] = useState({
    alpha: 0.5,
    beta: 0.2,
    gamma: 0.15,
    delta: 0.1,
    epsilon: 0.05,
  });

  // Update local state when weights load
  useState(() => {
    if (weights) {
      setLocalWeights({
        alpha: parseFloat(weights.alpha),
        beta: parseFloat(weights.beta),
        gamma: parseFloat(weights.gamma),
        delta: parseFloat(weights.delta),
        epsilon: parseFloat(weights.epsilon),
      });
    }
  });

  const handleSave = () => {
    if (!weights) return;
    
    updateWeights.mutate({
      id: weights.id,
      alpha: localWeights.alpha.toFixed(3),
      beta: localWeights.beta.toFixed(3),
      gamma: localWeights.gamma.toFixed(3),
      delta: localWeights.delta.toFixed(3),
      epsilon: localWeights.epsilon.toFixed(3),
    });
  };

  const totalWeight = Object.values(localWeights).reduce((a, b) => a + b, 0);

  const weightConfig = [
    {
      key: "alpha",
      label: "α - Semantic Similarity",
      description: "Weight for how well the product matches the search intent",
      icon: Brain,
      color: "bg-purple-500",
    },
    {
      key: "beta",
      label: "β - Rating",
      description: "Weight for product rating (0-5 stars)",
      icon: Sparkles,
      color: "bg-yellow-500",
    },
    {
      key: "gamma",
      label: "γ - Price Value",
      description: "Weight for price competitiveness (lower = better)",
      icon: Package,
      color: "bg-green-500",
    },
    {
      key: "delta",
      label: "δ - Stock Availability",
      description: "Weight for product availability status",
      icon: Database,
      color: "bg-blue-500",
    },
    {
      key: "epsilon",
      label: "ε - Recency",
      description: "Weight for how recently the product was added",
      icon: Clock,
      color: "bg-orange-500",
    },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Ranking Weight Configuration
          </CardTitle>
          <CardDescription>
            Adjust the weights (α, β, γ, δ, ε) that determine how search results are ranked.
            The formula is: Score = α×Semantic + β×Rating + γ×Price + δ×Stock + ε×Recency
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {weightConfig.map((config) => {
            const Icon = config.icon;
            const value = localWeights[config.key as keyof typeof localWeights];
            
            return (
              <div key={config.key} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg ${config.color} flex items-center justify-center`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <Label className="text-base">{config.label}</Label>
                      <p className="text-sm text-muted-foreground">{config.description}</p>
                    </div>
                  </div>
                  <span className="text-lg font-mono font-bold w-16 text-right">
                    {(value * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  value={[value]}
                  onValueChange={([v]) => 
                    setLocalWeights(prev => ({ ...prev, [config.key]: v }))
                  }
                  min={0}
                  max={1}
                  step={0.01}
                  className="w-full"
                />
              </div>
            );
          })}

          <Separator />

          {/* Total Weight Indicator */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <p className="font-medium">Total Weight</p>
              <p className="text-sm text-muted-foreground">
                Should sum to 1.0 for normalized scoring
              </p>
            </div>
            <div className="text-right">
              <span className={`text-2xl font-bold ${
                Math.abs(totalWeight - 1) < 0.01 ? "text-green-600" : "text-yellow-600"
              }`}>
                {totalWeight.toFixed(2)}
              </span>
              {Math.abs(totalWeight - 1) >= 0.01 && (
                <p className="text-xs text-yellow-600">
                  Weights don't sum to 1.0
                </p>
              )}
            </div>
          </div>

          <Button 
            onClick={handleSave} 
            className="w-full"
            disabled={updateWeights.isPending}
          >
            {updateWeights.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Weights"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function IRMetricsBadge({ searchLogId }: { searchLogId: number }) {
  const { data: metrics, isLoading } = trpc.admin.stats.bySearchLogId.useQuery({ searchLogId });

  if (isLoading) return <div className="h-4 w-16 bg-muted animate-pulse rounded" />;
  if (!metrics || metrics.length === 0) return <span className="text-xs text-muted-foreground">-</span>;

  const ndcg = metrics.find(m => m.metricType === "ndcg@10")?.value;
  
  return (
    <Badge variant="outline" className="font-mono text-[10px] bg-blue-50 text-blue-700 border-blue-200">
      nDCG: {ndcg || "N/A"}
    </Badge>
  );
}

function LogsTab() {
  const { data: searchLogs, isLoading } = trpc.search.logs.useQuery({ limit: 50 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5" />
          Search Logs
        </CardTitle>
        <CardDescription>
          Recent search queries and their performance metrics
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : searchLogs && searchLogs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Query</TableHead>
                <TableHead>Results</TableHead>
                <TableHead>Response Time</TableHead>
                <TableHead>IR Metrics</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {searchLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium max-w-[300px] truncate">
                    {log.query}
                  </TableCell>
                  <TableCell>{log.resultsCount}</TableCell>
                  <TableCell>
                    <Badge variant={log.responseTimeMs && log.responseTimeMs < 500 ? "default" : "secondary"}>
                      {log.responseTimeMs}ms
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <IRMetricsBadge searchLogId={log.id} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.sessionId.slice(0, 8)}...
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No search logs yet. Searches will appear here once users start searching.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
