export default function Footer() {
  return (
    <footer className="py-8 border-t">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/pickntake-logo.svg" alt="Pick N Take" className="h-8" />
          </div>
          <p className="text-sm text-muted-foreground">
            Explainable Semantic Search &amp; Recommendations
          </p>
        </div>
      </div>
    </footer>
  );
}
