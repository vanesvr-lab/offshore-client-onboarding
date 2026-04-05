import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ServiceTemplate } from "@/types";

interface ServiceCardProps {
  template: ServiceTemplate & { document_count: number };
}

export function ServiceCard({ template }: ServiceCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="text-base text-brand-navy">
          {template.name}
        </CardTitle>
        <CardDescription className="text-sm">
          {template.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {template.document_count} documents required
        </span>
        <Link href={`/apply/${template.id}/details`}>
          <Button size="sm" className="bg-brand-navy hover:bg-brand-blue">
            Select
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
