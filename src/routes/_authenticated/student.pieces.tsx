import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { PortalPage, pieceStatus, date } from "@/components/student/portal-page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/student/pieces")({ component: Pieces });
const sb = supabase as any;
function Pieces() {
  const { data: access } = useStudentPortalAccess();
  const [status, setStatus] = useState("all");
  const [year, setYear] = useState("all");
  const [clay, setClay] = useState("all");
  const [glaze, setGlaze] = useState("all");
  const { data: pieces = [] } = useQuery<any[]>({
    queryKey: ["student-pieces", access?.id],
    enabled: !!access,
    queryFn: async () => {
      const result = await sb
        .from("class_materials_usage")
        .select("*")
        .eq("workspace_id", access!.workspace_id)
        .eq("student_id", access!.student_id)
        .order("usage_date", { ascending: false });
      if (result.error) throw result.error;
      const rows: any[] = result.data ?? [];
      const paths = rows.map((r: any) => r.photo_path).filter(Boolean);
      if (paths.length) {
        const signed = await supabase.storage
          .from("class-material-photos")
          .createSignedUrls(paths, 3600);
        const urls = new Map((signed.data ?? []).map((r: any) => [r.path, r.signedUrl]));
        return rows.map((r: any) => ({ ...r, photo_url: urls.get(r.photo_path) }));
      }
      return rows;
    },
  });
  const options = (key: string): string[] =>
    [...new Set<string>(pieces.map((p: any) => String(p[key] || "")).filter(Boolean))].sort();
  const filtered = useMemo(
    () =>
      pieces.filter(
        (p: any) =>
          (status === "all" || p.production_status === status) &&
          (year === "all" || p.usage_date?.startsWith(year)) &&
          (clay === "all" || p.clay_type === clay) &&
          (glaze === "all" || p.glaze_name === glaze),
      ),
    [pieces, status, year, clay, glaze],
  );
  return (
    <PortalPage title="Minhas peças">
      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {options("production_status").map((v) => (
              <SelectItem key={v} value={v}>
                {pieceStatus[v] || v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger>
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os anos</SelectItem>
            {[...new Set(pieces.map((p: any) => p.usage_date?.slice(0, 4)).filter(Boolean))].map(
              (v) => (
                <SelectItem key={v as string} value={v as string}>
                  {v}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Select value={clay} onValueChange={setClay}>
          <SelectTrigger>
            <SelectValue placeholder="Argila" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as argilas</SelectItem>
            {options("clay_type").map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={glaze} onValueChange={setGlaze}>
          <SelectTrigger>
            <SelectValue placeholder="Esmalte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os esmaltes</SelectItem>
            {options("glaze_name").map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p: any) => (
          <Card key={p.id} className="overflow-hidden">
            {p.photo_url && (
              <img
                src={p.photo_url}
                alt={p.piece_name || "Peça"}
                className="aspect-[4/3] w-full object-cover"
              />
            )}
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{p.piece_name || "Peça sem nome"}</div>
                  <div className="text-xs text-muted-foreground">{date(p.usage_date)}</div>
                </div>
                <Badge variant="secondary">
                  {pieceStatus[p.production_status] || p.production_status}
                </Badge>
              </div>
              {p.clay_type && <div className="text-sm">Argila: {p.clay_type}</div>}
              {(p.length_cm || p.height_cm || p.depth_cm) && (
                <div className="text-sm">
                  Dimensões: {p.length_cm || 0} × {p.depth_cm || 0} × {p.height_cm || 0} cm
                </div>
              )}
              {p.clay_weight_kg > 0 && (
                <div className="text-sm">Peso: {Number(p.clay_weight_kg) * 1000} g</div>
              )}
              {p.glaze_name && <div className="text-sm">Esmalte: {p.glaze_name}</div>}
              {p.comments && <p className="text-sm text-muted-foreground">{p.comments}</p>}
            </CardContent>
          </Card>
        ))}
        {!filtered.length && (
          <p className="text-sm text-muted-foreground">Nenhuma peça encontrada.</p>
        )}
      </div>
    </PortalPage>
  );
}
