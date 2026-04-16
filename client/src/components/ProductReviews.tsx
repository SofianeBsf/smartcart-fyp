import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Star, Pencil, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface Props {
  productId: number;
}

function StarRating({
  value,
  onChange,
  size = "w-5 h-5",
  interactive = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: string;
  interactive?: boolean;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          className={interactive ? "cursor-pointer transition-transform hover:scale-110" : "cursor-default"}
          onMouseEnter={() => interactive && setHovered(star)}
          onMouseLeave={() => interactive && setHovered(0)}
          onClick={() => interactive && onChange?.(star)}
        >
          <Star
            className={`${size} ${
              star <= (hovered || value)
                ? "fill-yellow-400 text-yellow-400"
                : "fill-none text-gray-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export default function ProductReviews({ productId }: Props) {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const { data: reviews = [] } = trpc.reviews.list.useQuery({ productId });
  const { data: stats } = trpc.reviews.stats.useQuery({ productId });

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const createReview = trpc.reviews.create.useMutation({
    onSuccess: () => {
      toast.success("Review posted!");
      setRating(0);
      setComment("");
      utils.reviews.list.invalidate({ productId });
      utils.reviews.stats.invalidate({ productId });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateReview = trpc.reviews.update.useMutation({
    onSuccess: () => {
      toast.success("Review updated!");
      setEditingId(null);
      setRating(0);
      setComment("");
      utils.reviews.list.invalidate({ productId });
      utils.reviews.stats.invalidate({ productId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteReview = trpc.reviews.delete.useMutation({
    onSuccess: () => {
      toast.success("Review deleted");
      utils.reviews.list.invalidate({ productId });
      utils.reviews.stats.invalidate({ productId });
    },
    onError: (e) => toast.error(e.message),
  });

  const myReview = reviews.find((r: any) => r.userId === user?.id);
  const isEditing = editingId !== null;

  const handleSubmit = () => {
    if (rating === 0) { toast.error("Please select a star rating"); return; }
    if (!comment.trim()) { toast.error("Please write a comment"); return; }

    if (isEditing) {
      updateReview.mutate({ id: editingId!, rating, comment: comment.trim() });
    } else {
      createReview.mutate({ productId, rating, comment: comment.trim() });
    }
  };

  const startEdit = (review: any) => {
    setEditingId(review.id);
    setRating(review.rating);
    setComment(review.comment);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRating(0);
    setComment("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Reviews
          {stats && stats.count > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({stats.count})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats */}
        {stats && stats.count > 0 && (
          <div className="flex items-start gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold">{stats.average.toFixed(1)}</div>
              <StarRating value={Math.round(stats.average)} size="w-4 h-4" />
              <div className="text-xs text-muted-foreground mt-1">{stats.count} review{stats.count !== 1 ? "s" : ""}</div>
            </div>
            <div className="flex-1 space-y-1">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = stats.distribution[star - 1];
                const pct = stats.count > 0 ? (count / stats.count) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-sm">
                    <span className="w-3 text-right">{star}</span>
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-muted-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Separator />

        {/* Write/Edit review form */}
        {isAuthenticated ? (
          (!myReview || isEditing) ? (
            <div className="space-y-3">
              <h3 className="font-medium text-sm">
                {isEditing ? "Edit your review" : "Write a review"}
              </h3>
              <StarRating value={rating} onChange={setRating} interactive size="w-6 h-6" />
              <textarea
                className="w-full min-h-[80px] p-3 border rounded-md text-sm resize-y bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Share your thoughts about this product..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={createReview.isPending || updateReview.isPending}
                >
                  {(createReview.isPending || updateReview.isPending)
                    ? "Submitting..."
                    : isEditing ? "Update Review" : "Post Review"}
                </Button>
                {isEditing && (
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              You've already reviewed this product. You can edit or delete your review below.
            </p>
          )
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              Sign in to write a review
            </p>
            <Button
              size="sm"
              onClick={() => setLocation(`/login?redirect=${encodeURIComponent(`/product/${productId}`)}`)}
            >
              Sign in
            </Button>
          </div>
        )}

        <Separator />

        {/* Review list */}
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No reviews yet. Be the first to review this product!
          </p>
        ) : (
          <div className="space-y-4">
            {reviews.map((review: any) => (
              <div key={review.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                      {(review.userName || "U").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{review.userName || "Anonymous"}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(review.createdAt).toLocaleDateString("en-GB", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StarRating value={review.rating} size="w-3.5 h-3.5" />
                    {review.userId === user?.id && (
                      <div className="flex gap-1 ml-2">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => startEdit(review)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Delete your review?")) deleteReview.mutate({ id: review.id });
                          }}
                          disabled={deleteReview.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground pl-10">{review.comment}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
