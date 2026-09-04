import { Link } from "react-router-dom";
import { LucideIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import Layout from "@/components/layout/Layout";

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon?: LucideIcon;
}

export default function PlaceholderPage({
  title,
  description,
  icon: Icon = Sparkles,
}: PlaceholderPageProps) {
  return (
    <Layout>
      <div className="container flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-8 w-8" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">{description}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Keep prompting to describe what you'd like on this page and we'll
          build it out.
        </p>
        <Button asChild className="mt-8">
          <Link to="/">Back to Discover</Link>
        </Button>
      </div>
    </Layout>
  );
}
