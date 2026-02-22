ALTER TABLE "session_interactions" RENAME TO "interactions";--> statement-breakpoint
ALTER TABLE "catalog_upload_jobs" RENAME COLUMN "totalRows" TO "total_rows";--> statement-breakpoint
ALTER TABLE "catalog_upload_jobs" RENAME COLUMN "processedRows" TO "processed_rows";--> statement-breakpoint
ALTER TABLE "catalog_upload_jobs" RENAME COLUMN "embeddedRows" TO "embedded_rows";--> statement-breakpoint
ALTER TABLE "catalog_upload_jobs" RENAME COLUMN "errorMessage" TO "error_message";--> statement-breakpoint
ALTER TABLE "catalog_upload_jobs" RENAME COLUMN "uploadedBy" TO "uploaded_by";--> statement-breakpoint
ALTER TABLE "catalog_upload_jobs" RENAME COLUMN "startedAt" TO "started_at";--> statement-breakpoint
ALTER TABLE "catalog_upload_jobs" RENAME COLUMN "completedAt" TO "completed_at";--> statement-breakpoint
ALTER TABLE "catalog_upload_jobs" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "evaluation_metrics" RENAME COLUMN "metricType" TO "metric_type";--> statement-breakpoint
ALTER TABLE "evaluation_metrics" RENAME COLUMN "queryCount" TO "query_count";--> statement-breakpoint
ALTER TABLE "evaluation_metrics" RENAME COLUMN "evaluatedAt" TO "evaluated_at";--> statement-breakpoint
ALTER TABLE "evaluation_metrics" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "product_embeddings" RENAME COLUMN "productId" TO "product_id";--> statement-breakpoint
ALTER TABLE "product_embeddings" RENAME COLUMN "embeddingModel" TO "embedding_model";--> statement-breakpoint
ALTER TABLE "product_embeddings" RENAME COLUMN "textUsed" TO "text_used";--> statement-breakpoint
ALTER TABLE "product_embeddings" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "product_embeddings" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "imageUrl" TO "image_url";--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "originalPrice" TO "original_price";--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "reviewCount" TO "review_count";--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "stockQuantity" TO "stock_quantity";--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "isFeatured" TO "is_featured";--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "ranking_weights" RENAME COLUMN "isActive" TO "is_active";--> statement-breakpoint
ALTER TABLE "ranking_weights" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "ranking_weights" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "search_logs" RENAME COLUMN "sessionId" TO "session_id";--> statement-breakpoint
ALTER TABLE "search_logs" RENAME COLUMN "queryEmbedding" TO "query_embedding";--> statement-breakpoint
ALTER TABLE "search_logs" RENAME COLUMN "resultsCount" TO "results_count";--> statement-breakpoint
ALTER TABLE "search_logs" RENAME COLUMN "responseTimeMs" TO "response_time_ms";--> statement-breakpoint
ALTER TABLE "search_logs" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "search_result_explanations" RENAME COLUMN "searchLogId" TO "search_log_id";--> statement-breakpoint
ALTER TABLE "search_result_explanations" RENAME COLUMN "productId" TO "product_id";--> statement-breakpoint
ALTER TABLE "search_result_explanations" RENAME COLUMN "finalScore" TO "final_score";--> statement-breakpoint
ALTER TABLE "search_result_explanations" RENAME COLUMN "semanticScore" TO "semantic_score";--> statement-breakpoint
ALTER TABLE "search_result_explanations" RENAME COLUMN "ratingScore" TO "rating_score";--> statement-breakpoint
ALTER TABLE "search_result_explanations" RENAME COLUMN "priceScore" TO "price_score";--> statement-breakpoint
ALTER TABLE "search_result_explanations" RENAME COLUMN "stockScore" TO "stock_score";--> statement-breakpoint
ALTER TABLE "search_result_explanations" RENAME COLUMN "recencyScore" TO "recency_score";--> statement-breakpoint
ALTER TABLE "search_result_explanations" RENAME COLUMN "matchedTerms" TO "matched_terms";--> statement-breakpoint
ALTER TABLE "search_result_explanations" RENAME COLUMN "wasClicked" TO "was_clicked";--> statement-breakpoint
ALTER TABLE "search_result_explanations" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "interactions" RENAME COLUMN "sessionId" TO "session_id";--> statement-breakpoint
ALTER TABLE "interactions" RENAME COLUMN "productId" TO "product_id";--> statement-breakpoint
ALTER TABLE "interactions" RENAME COLUMN "interactionType" TO "interaction_type";--> statement-breakpoint
ALTER TABLE "interactions" RENAME COLUMN "searchQuery" TO "search_query";--> statement-breakpoint
ALTER TABLE "interactions" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "sessionId" TO "session_id";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "lastActiveAt" TO "last_active_at";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "expiresAt" TO "expires_at";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "openId" TO "open_id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "loginMethod" TO "login_method";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "lastSignedIn" TO "last_signed_in";--> statement-breakpoint
ALTER TABLE "product_embeddings" DROP CONSTRAINT "product_embeddings_productId_unique";--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_sessionId_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_openId_unique";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "title" SET DATA TYPE varchar(500);--> statement-breakpoint
ALTER TABLE "product_embeddings" ADD CONSTRAINT "product_embeddings_product_id_unique" UNIQUE("product_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_session_id_unique" UNIQUE("session_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_open_id_unique" UNIQUE("open_id");