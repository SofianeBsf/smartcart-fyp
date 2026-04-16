import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  X,
  Settings2,
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

  // Redirect unauthenticated users back to home so they can explicitly choose to sign in.
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
      setLocation("/");
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

      {/* Embedding Health */}
      <EmbeddingHealthCard />

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

function EmbeddingHealthCard() {
  const { data, isLoading, refetch, isFetching } =
    trpc.admin.products.embeddingHealth.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });

  const verdict = data?.verdict ?? "unknown";
  const verdictColor =
    verdict === "healthy"
      ? "text-green-600"
      : verdict === "broken"
      ? "text-red-600"
      : verdict === "mixed"
      ? "text-yellow-600"
      : "text-muted-foreground";

  const verdictLabel =
    verdict === "healthy"
      ? "Healthy — embeddings match the live model"
      : verdict === "broken"
      ? "Broken — stale or wrong-model vectors in DB"
      : verdict === "mixed"
      ? "Mixed — some embeddings are stale"
      : "Unknown — AI service unreachable";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Embedding Health</CardTitle>
          <CardDescription>
            Sanity check that product_embeddings contains vectors from the current model.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Re-check"}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Running diagnostic…</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className={`font-medium ${verdictColor}`}>{verdictLabel}</div>
            <div className="text-muted-foreground">
              Model: <code>{data?.model_name ?? "?"}</code> •{" "}
              {data?.ok_count ?? 0}/{data?.total ?? 0} samples match the live model
            </div>
            {data?.hint && (
              <div className="text-muted-foreground italic">{data.hint}</div>
            )}
            {data?.samples && data.samples.length > 0 && (
              <div className="pt-2 text-xs font-mono space-y-0.5">
                {data.samples.map((s: any) => (
                  <div key={s.id}>
                    #{s.id} • cos={s.cosine_to_fresh ?? "n/a"} • {s.status}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
  const clearCache = trpc.admin.system.clearSearchCache.useMutation();
  const calculateMetrics = trpc.admin.stats.calculateIRMetrics.useMutation();

  const handleClick = async () => {
    setIsLoading(true);
    try {
      if (action === "embeddings") {
        const result = await generateEmbeddings.mutateAsync();
        toast.success(`Generated ${result.success} embeddings (${result.failed} failed)`);
      } else if (action === "cache") {
        const result = await clearCache.mutateAsync();
        toast.success(
          `Cleared ${result.clearedEntries ?? 0} cache entries` +
            (result.aiServiceCleared ? " (AI service cache flushed)" : ""),
        );
      } else if (action === "metrics") {
        const result = await calculateMetrics.mutateAsync();
        if (result.queryCount === 0) {
          toast.info(result.message || "No search logs available yet");
        } else {
          toast.success(
            `nDCG@10: ${result.avgNdcg} • Recall@10: ${result.avgRecall} • ` +
              `Precision@10: ${result.avgPrecision} • MRR: ${result.avgMrr} ` +
              `(${result.queryCount} queries)`,
            { duration: 6000 },
          );
        }
      } else {
        toast.info("Unknown action");
      }
    } catch (error: any) {
      const msg = error?.message || error?.data?.message || JSON.stringify(error) || "Unknown error";
      toast.error(`Action failed: ${msg}`);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  // Pagination state
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<any | null>(null);

  // Form state for add/edit
  const emptyForm = {
    title: "", description: "", category: "", brand: "",
    price: "", imageUrl: "", rating: "",
    stockQuantity: "100", asin: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const markTouched = (field: string) => setTouched(t => ({ ...t, [field]: true }));
  const hasChanges = JSON.stringify(form) !== JSON.stringify(initialForm);

  // Inline validation helpers
  const fieldError = (field: string): string | null => {
    if (!touched[field]) return null;
    switch (field) {
      case "title": return !form.title.trim() ? "Title is required" : null;
      case "description": return !form.description.trim() ? "Description is required" : null;
      case "category": {
        const cat = isCreatingCategory ? newCategoryName.trim() : form.category;
        return !cat ? "Category is required" : null;
      }
      case "brand": return !form.brand.trim() ? "Brand is required" : null;
      case "price": {
        const p = parseFloat(form.price);
        return (!form.price || isNaN(p) || p <= 0) ? "Must be greater than 0" : null;
      }
      case "rating": {
        const r = parseFloat(form.rating);
        return (!form.rating || isNaN(r) || r < 0 || r > 5) ? "Must be 0–5" : null;
      }
      case "stockQuantity": {
        const s = parseInt(form.stockQuantity);
        return (isNaN(s) || s < 0) ? "Must be 0 or more" : null;
      }
      case "imageUrl": return !form.imageUrl ? "Image is required" : null;
      default: return null;
    }
  };

  // Fetch categories
  const { data: categories = [] } = trpc.products.categories.useQuery();

  const { data: productList, isLoading } = trpc.products.list.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const { data: uploadJobs } = trpc.admin.catalog.jobs.useQuery({ limit: 5 });

  const uploadCatalog = trpc.admin.catalog.upload.useMutation({
    onSuccess: () => {
      toast.success("Catalog uploaded successfully");
      utils.products.list.invalidate();
      utils.admin.catalog.jobs.invalidate();
    },
    onError: (error) => toast.error(`Upload failed: ${error.message}`),
  });

  const createProduct = trpc.admin.products.create.useMutation({
    onSuccess: () => {
      toast.success("Product created (embedding generated)");
      utils.products.list.invalidate();
      setShowAddDialog(false);
      setForm(emptyForm);
    },
    onError: (error) => toast.error(`Create failed: ${error.message}`),
  });

  const updateProduct = trpc.admin.products.update.useMutation({
    onSuccess: () => {
      toast.success("Product updated");
      utils.products.list.invalidate();
      setEditingProduct(null);
      setForm(emptyForm);
    },
    onError: (error) => toast.error(`Update failed: ${error.message}`),
  });

  const deleteProduct = trpc.admin.products.delete.useMutation({
    onSuccess: () => {
      toast.success("Product deleted");
      utils.products.list.invalidate();
    },
    onError: (error) => toast.error(`Delete failed: ${error.message}`),
  });

  const deleteMany = trpc.admin.products.deleteMany.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} product(s)`);
      setSelectedIds(new Set());
      utils.products.list.invalidate();
    },
    onError: (error) => toast.error(`Delete failed: ${error.message}`),
  });

  const deleteCategoryMutation = trpc.admin.products.deleteCategory.useMutation({
    onSuccess: (data) => {
      toast.success(`Category deleted. ${data.uncategorized} product(s) uncategorized.`);
      utils.products.categories.invalidate();
      utils.products.list.invalidate();
    },
    onError: (error) => toast.error(`Delete category failed: ${error.message}`),
  });

  const generateSelected = trpc.admin.products.generateSelectedEmbeddings.useMutation({
    onSuccess: (data) => {
      toast.success(`Embeddings: ${data.success} generated, ${data.failed} failed`);
      setSelectedIds(new Set());
    },
    onError: (error) => toast.error(`Embedding generation failed: ${error.message}`),
  });

  // Filter products client-side by search query
  const allProducts = productList?.products || [];
  const filtered = searchQuery.trim()
    ? allProducts.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.category || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.brand || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allProducts;

  const total = productList?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const allVisibleIds = filtered.map(p => p.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allVisibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allVisibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const toggleOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openEdit = (product: any) => {
    const formData = {
      title: product.title || "",
      description: product.description || "",
      category: product.category || "",
      brand: product.brand || "",
      price: product.price || "",
      imageUrl: product.imageUrl || "",
      rating: product.rating || "",
      stockQuantity: String(product.stockQuantity ?? 100),
      asin: product.asin || "",
    };
    setForm(formData);
    setInitialForm(formData);
    setTouched({});
    setIsCreatingCategory(false);
    setNewCategoryName("");
    setEditingProduct(product);
  };

  const handleImageFile = async (file: File) => {
    const MAX_BYTES = 4 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error("Image is too large (max 4 MB).");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("File must be an image.");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      setForm(f => ({ ...f, imageUrl: dataUrl }));
    } catch {
      toast.error("Failed to read image.");
    }
  };

  const handleSave = () => {
    // Touch all fields to show inline errors
    setTouched({ title: true, description: true, category: true, brand: true, price: true, rating: true, stockQuantity: true, imageUrl: true });
    const finalCategory = isCreatingCategory ? newCategoryName.trim() : form.category;
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    if (!finalCategory) { toast.error("Category is required"); return; }
    if (!form.brand.trim()) { toast.error("Brand is required"); return; }
    if (!form.price || parseFloat(form.price) <= 0) { toast.error("Price must be greater than 0"); return; }
    if (!form.imageUrl) { toast.error("Product image is required"); return; }
    if (!form.rating || parseFloat(form.rating) < 0 || parseFloat(form.rating) > 5) { toast.error("Rating must be between 0 and 5"); return; }
    const stockQty = parseInt(form.stockQuantity);
    if (isNaN(stockQty) || stockQty < 0) { toast.error("Stock quantity must be 0 or more"); return; }

    if (editingProduct) {
      updateProduct.mutate({
        id: editingProduct.id,
        title: form.title.trim(),
        description: form.description.trim(),
        category: finalCategory,
        brand: form.brand.trim(),
        price: form.price,
        imageUrl: form.imageUrl,
        rating: form.rating,
        stockQuantity: stockQty,
      });
    } else {
      createProduct.mutate({
        title: form.title.trim(),
        description: form.description.trim(),
        category: finalCategory,
        brand: form.brand.trim(),
        price: form.price,
        imageUrl: form.imageUrl,
        rating: form.rating,
        stockQuantity: stockQty,
        asin: form.asin || undefined,
      });
    }
  };

  // CSV upload handler
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
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
            continue;
          }
          if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
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
            case "title": case "name": product.title = value; break;
            case "description": product.description = value; break;
            case "category": product.category = value; break;
            case "price": product.price = value; break;
            case "rating": product.rating = value; break;
            case "image": case "imageurl": case "image_url": product.imageUrl = value; break;
            case "brand": product.brand = value; break;
            case "asin": product.asin = value; break;
          }
        });
        return product;
      }).filter(p => p.title);

      if (products.length === 0) { toast.error("No valid products found in CSV"); return; }

      toast.info(`Uploading ${products.length} products...`);
      await uploadCatalog.mutateAsync({ products, generateEmbeddings: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload catalog";
      toast.error(message.includes("Failed to parse CSV") ? message : `Upload failed: ${message}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isSaving = createProduct.isPending || updateProduct.isPending;

  // Product form dialog (shared for add + edit)
  const productFormDialog = (
    <Dialog
      open={showAddDialog || !!editingProduct}
      onOpenChange={(open) => {
        if (!open) { setShowAddDialog(false); setEditingProduct(null); setForm(emptyForm); setInitialForm(emptyForm); setTouched({}); }
      }}
    >
      <DialogContent className="sm:max-w-[580px] max-h-[85vh] flex flex-col overflow-hidden shadow-xl">
        <DialogHeader className="shrink-0 border-b pb-3">
          <DialogTitle className="text-lg">{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          <DialogDescription>
            {editingProduct ? "Update the product details below." : "Fill in the product details. Embedding will be generated automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-1 py-3 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Title <span className="text-destructive">*</span></Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} onBlur={() => markTouched("title")} placeholder="Product title" />
            {fieldError("title") && <p className="text-xs text-destructive">{fieldError("title")}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Description <span className="text-destructive">*</span></Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              onBlur={() => markTouched("description")}
              placeholder="Write a detailed product description..."
              rows={3}
              className="resize-y min-h-[80px]"
            />
            {fieldError("description") && <p className="text-xs text-destructive">{fieldError("description")}</p>}
          </div>

          {/* Category + Brand row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Category <span className="text-destructive">*</span></Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-primary gap-1" onClick={() => setShowCategoryManager(true)}>
                  <Settings2 className="w-3 h-3" />
                  Manage
                </Button>
              </div>
              {isCreatingCategory ? (
                <div className="flex gap-1.5">
                  <Input
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onBlur={() => markTouched("category")}
                    placeholder="New category"
                    className="flex-1 h-9"
                  />
                  <Button type="button" variant="ghost" size="sm" className="h-9 px-2" onClick={() => { setIsCreatingCategory(false); setNewCategoryName(""); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Select
                  value={form.category}
                  onValueChange={v => {
                    markTouched("category");
                    if (v === "__create_new__") {
                      setIsCreatingCategory(true);
                      setNewCategoryName("");
                      setForm(f => ({ ...f, category: "" }));
                    } else {
                      setForm(f => ({ ...f, category: v }));
                    }
                  }}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((cat: string) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value="__create_new__" className="text-primary font-medium">
                      + Create new category...
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              {fieldError("category") && <p className="text-xs text-destructive">{fieldError("category")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Brand <span className="text-destructive">*</span></Label>
              <Input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} onBlur={() => markTouched("brand")} placeholder="e.g. Samsung" className="h-9" />
              {fieldError("brand") && <p className="text-xs text-destructive">{fieldError("brand")}</p>}
            </div>
          </div>

          {/* Price + Rating + Stock row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Price <span className="text-destructive">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">£</span>
                <Input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} onBlur={() => markTouched("price")} placeholder="29.99" className="pl-7 h-9" />
              </div>
              {fieldError("price") && <p className="text-xs text-destructive">{fieldError("price")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Rating <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.1" min="0" max="5" value={form.rating} onChange={e => setForm(f => ({ ...f, rating: e.target.value }))} onBlur={() => markTouched("rating")} placeholder="4.5" className="h-9" />
              {fieldError("rating") ? (
                <p className="text-xs text-destructive">{fieldError("rating")}</p>
              ) : (
                <p className="text-xs text-muted-foreground">0.0 to 5.0</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Stock Qty <span className="text-destructive">*</span></Label>
              <div className="flex items-center gap-2">
                <Input type="number" min="0" value={form.stockQuantity} onChange={e => setForm(f => ({ ...f, stockQuantity: e.target.value }))} onBlur={() => markTouched("stockQuantity")} className="h-9 flex-1" />
                {(() => {
                  const qty = parseInt(form.stockQuantity);
                  if (isNaN(qty)) return null;
                  const dot = qty === 0 ? "bg-red-500" : qty <= 20 ? "bg-yellow-500" : "bg-green-500";
                  const label = qty === 0 ? "Out" : qty <= 20 ? "Low" : "OK";
                  return (
                    <span className="flex items-center gap-1 shrink-0" title={qty === 0 ? "Out of Stock" : qty <= 20 ? "Low Stock" : "In Stock"}>
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                      <span className="text-xs text-muted-foreground font-medium">{label}</span>
                    </span>
                  );
                })()}
              </div>
              {fieldError("stockQuantity") && <p className="text-xs text-destructive">{fieldError("stockQuantity")}</p>}
            </div>
          </div>

          {/* Product Image — custom upload area */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Product Image <span className="text-destructive">*</span></Label>
            {form.imageUrl ? (
              <div className="relative group rounded-lg border bg-muted/30 p-3 flex items-center gap-4">
                <img
                  src={form.imageUrl}
                  alt="Preview"
                  className="w-20 h-20 object-cover rounded-md border shadow-sm"
                  onError={e => { (e.currentTarget as HTMLImageElement).src = ""; }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {form.imageUrl.startsWith("data:") ? "Uploaded image" : form.imageUrl}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {form.imageUrl.startsWith("data:") ? "Local file ready to save" : "External URL"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setForm(f => ({ ...f, imageUrl: "" }))}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div
                className={`relative rounded-lg border-2 border-dashed transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"}`}
                onClick={() => imageInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={async e => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) await handleImageFile(file);
                }}
              >
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <ImagePlus className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">
                      {isDragging ? "Drop image here" : "Click to upload or drag & drop"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WebP up to 4 MB</p>
                  </div>
                </div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) await handleImageFile(file);
                    if (e.currentTarget) e.currentTarget.value = "";
                  }}
                />
              </div>
            )}
            {/* URL fallback */}
            {!form.imageUrl && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-muted-foreground shrink-0">or paste URL</span>
                <Input
                  value={form.imageUrl}
                  onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                  onBlur={() => markTouched("imageUrl")}
                  placeholder="https://..."
                  className="h-8 text-sm"
                />
              </div>
            )}
            {fieldError("imageUrl") && <p className="text-xs text-destructive">{fieldError("imageUrl")}</p>}
          </div>

          {/* ASIN (add mode only) */}
          {!editingProduct && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-muted-foreground">ASIN <span className="text-xs font-normal">(optional)</span></Label>
              <Input value={form.asin} onChange={e => setForm(f => ({ ...f, asin: e.target.value }))} placeholder="B0..." className="h-9" />
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-3 gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => { setShowAddDialog(false); setEditingProduct(null); setForm(emptyForm); setInitialForm(emptyForm); setTouched({}); }}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || (editingProduct && !hasChanges)}>
            {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : editingProduct ? "Update Product" : "Create Product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Category management dialog
  const categoryManagerDialog = (
    <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
          <DialogDescription>
            Deleting a category will uncategorize all products in that category.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No categories yet.</p>
          ) : (
            categories.map((cat: string) => (
              <div key={cat} className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm">{cat}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Delete category "${cat}"? All products in this category will become uncategorized.`)) {
                      deleteCategoryMutation.mutate({ category: cat });
                    }
                  }}
                  disabled={deleteCategoryMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCategoryManager(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Delete confirmation dialog
  const deleteConfirmDialog = (
    <Dialog open={!!deletingProduct} onOpenChange={(open) => { if (!open) setDeletingProduct(null); }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Delete Product</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <span className="font-medium text-foreground">"{deletingProduct?.title}"</span>? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setDeletingProduct(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (deletingProduct) {
                deleteProduct.mutate({ id: deletingProduct.id });
                setDeletingProduct(null);
              }
            }}
            disabled={deleteProduct.isPending}
          >
            {deleteProduct.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</> : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6">
      {productFormDialog}
      {categoryManagerDialog}
      {deleteConfirmDialog}

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Catalog
          </CardTitle>
          <CardDescription>
            Upload a CSV file with product data. Required columns: title.
            Optional: description, category, price, rating, imageUrl, brand, asin.
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
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadCatalog.isPending}>
              {uploadCatalog.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</> : <><FileUp className="w-4 h-4 mr-2" />Select CSV</>}
            </Button>
          </div>

          {/* Recent Upload Jobs */}
          {uploadJobs && uploadJobs.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium mb-3">Recent Uploads</h4>
              <div className="space-y-2">
                {uploadJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {job.status === "completed" ? <CheckCircle className="w-4 h-4 text-green-500" /> : job.status === "failed" ? <AlertCircle className="w-4 h-4 text-red-500" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                      <div>
                        <p className="text-sm font-medium">{job.filename}</p>
                        <p className="text-xs text-muted-foreground">{job.processedRows}/{job.totalRows} products • {job.embeddedRows} embeddings</p>
                      </div>
                    </div>
                    <Badge variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}>{job.status}</Badge>
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
            <div className="flex items-center gap-2">
              <Badge variant="outline">{total} total</Badge>
              <Button size="sm" onClick={() => { setForm(emptyForm); setInitialForm(emptyForm); setTouched({}); setShowAddDialog(true); }}>
                <Plus className="w-4 h-4 mr-1" />Add Product
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Toolbar: search + bulk actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search products on this page..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedIds.size} selected</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={generateSelected.isPending}
                  onClick={() => generateSelected.mutate({ productIds: Array.from(selectedIds) })}
                >
                  {generateSelected.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Brain className="w-4 h-4 mr-1" />}
                  Generate Embeddings
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={deleteMany.isPending}
                  onClick={() => {
                    if (confirm(`Delete ${selectedIds.size} product(s)? This cannot be undone.`)) {
                      deleteMany.mutate({ ids: Array.from(selectedIds) });
                    }
                  }}
                >
                  {deleteMany.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                  Delete
                </Button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((product) => (
                    <TableRow key={product.id} className={selectedIds.has(product.id) ? "bg-primary/5" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={() => toggleOne(product.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-[280px] truncate">{product.title}</TableCell>
                      <TableCell>{product.category || "-"}</TableCell>
                      <TableCell>{product.price ? `£${parseFloat(product.price).toFixed(2)}` : "-"}</TableCell>
                      <TableCell>{product.rating || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={product.availability === "in_stock" ? "default" : product.availability === "low_stock" ? "secondary" : "destructive"}>
                          {product.availability?.replace("_", " ") || "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(product)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeletingProduct(product)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => { setPage(p => p - 1); setSelectedIds(new Set()); }}>
                      <ChevronLeft className="w-4 h-4 mr-1" />Prev
                    </Button>
                    <span className="text-sm font-medium">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => { setPage(p => p + 1); setSelectedIds(new Set()); }}>
                      Next<ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{searchQuery ? "No products match your search." : "No products in catalog. Upload a CSV or add one manually."}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WeightsTab() {
  const utils = trpc.useUtils();
  const { data: weights, isLoading } = trpc.admin.weights.get.useQuery();
  const updateWeights = trpc.admin.weights.update.useMutation({
    onSuccess: () => {
      toast.success("Weights updated successfully");
      // Invalidate so the next query refetches and useEffect re-syncs local state
      utils.admin.weights.get.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update weights");
    },
  });

  const [localWeights, setLocalWeights] = useState({
    alpha: 0.5,
    beta: 0.2,
    gamma: 0.15,
    delta: 0.1,
    epsilon: 0.05,
  });

  // Sync local state when weights load from server.
  // (Previously this used useState(() => ...) which only fires on first mount
  //  BEFORE the query resolves, so the UI would snap back to defaults on every
  //  refresh and saves looked like they hadn't persisted.)
  useEffect(() => {
    if (weights) {
      setLocalWeights({
        alpha: parseFloat(weights.alpha),
        beta: parseFloat(weights.beta),
        gamma: parseFloat(weights.gamma),
        delta: parseFloat(weights.delta),
        epsilon: parseFloat(weights.epsilon),
      });
    }
  }, [weights]);

  const totalWeight = Object.values(localWeights).reduce((a, b) => a + b, 0);
  // Tight tolerance: accept 1.00 ± 0.005 but reject 1.01
  const isOverBudget = totalWeight > 1.005;
  const isUnderBudget = totalWeight < 0.995;
  const isValid = !isOverBudget && !isUnderBudget;

  const handleSave = () => {
    if (!weights) return;
    if (isOverBudget) {
      toast.error(`Weights sum to ${totalWeight.toFixed(2)} — must not exceed 1.00`);
      return;
    }
    if (isUnderBudget) {
      toast.error(`Weights sum to ${totalWeight.toFixed(2)} — must equal 1.00`);
      return;
    }

    updateWeights.mutate({
      id: weights.id,
      alpha: localWeights.alpha.toFixed(3),
      beta: localWeights.beta.toFixed(3),
      gamma: localWeights.gamma.toFixed(3),
      delta: localWeights.delta.toFixed(3),
      epsilon: localWeights.epsilon.toFixed(3),
    });
  };

  const handleNormalize = () => {
    if (totalWeight <= 0) return;
    setLocalWeights(prev => ({
      alpha: prev.alpha / totalWeight,
      beta: prev.beta / totalWeight,
      gamma: prev.gamma / totalWeight,
      delta: prev.delta / totalWeight,
      epsilon: prev.epsilon / totalWeight,
    }));
  };

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
                Must sum to exactly 1.00 for normalized scoring
              </p>
            </div>
            <div className="text-right">
              <span className={`text-2xl font-bold ${
                isValid ? "text-green-600" : isOverBudget ? "text-red-600" : "text-yellow-600"
              }`}>
                {totalWeight.toFixed(2)}
              </span>
              {isOverBudget && (
                <p className="text-xs text-red-600">
                  Exceeds 1.00 — reduce some weights
                </p>
              )}
              {isUnderBudget && (
                <p className="text-xs text-yellow-600">
                  Under 1.00 — increase some weights
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={handleNormalize}
              disabled={updateWeights.isPending || totalWeight <= 0 || isValid}
            >
              Auto-normalize to 1.00
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateWeights.isPending || !isValid}
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
          </div>
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
