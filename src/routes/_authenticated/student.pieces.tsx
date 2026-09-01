import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Camera, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { PortalPage, PiecePhoto, pieceStatus, date } from "@/components/student/portal-page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/student/pieces")({ component: Pieces });
const sb = supabase as any;
const PHOTO_BUCKET = "class-piece-photos";
const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
function Pieces() {
  const { data: access } = useStudentPortalAccess();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [year, setYear] = useState("all");
  const [clay, setClay] = useState("all");
  const [glaze, setGlaze] = useState("all");
  const [selected, setSelected] = useState<any | null>(null);
  const [pieceComments, setPieceComments] = useState("");
  const [piecePhoto, setPiecePhoto] = useState<File | null>(null);
  const {
    data: pieces = [],
    isLoading,
    error,
  } = useQuery<any[]>({
    queryKey: ["student-pieces", access?.id],
    enabled: !!access,
    queryFn: async () => {
      const result = await sb.rpc("student_portal_pieces", {
        _student_id: access!.is_preview ? access!.student_id : null,
      });
      if (result.error) throw result.error;
      const rows: any[] = result.data ?? [];
      const paths = rows.map((r: any) => r.photo_path).filter(Boolean);
      if (paths.length) {
        const signed = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
        if (!signed.error) {
          const urls = new Map((signed.data ?? []).map((r: any) => [r.path, r.signedUrl]));
          return rows.map((r: any) => ({ ...r, photo_url: urls.get(r.photo_path) }));
        }
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
  function openPiece(piece: any) {
    setSelected(piece);
    setPieceComments(piece.comments || "");
    setPiecePhoto(null);
  }
  const savePiece = useMutation({
    mutationFn: async () => {
      if (!access || !selected) throw new Error("Peça não encontrada.");
      let photoPath: string | null = null;
      if (piecePhoto) {
        if (!ALLOWED_PHOTO_TYPES.has(piecePhoto.type))
          throw new Error("Use uma foto JPG, PNG, WebP, HEIC ou HEIF.");
        if (piecePhoto.size > 10 * 1024 * 1024) throw new Error("A foto deve ter no máximo 10 MB.");
        const extension = piecePhoto.name.split(".").pop()?.toLowerCase() || "jpg";
        photoPath = `${access.workspace_id}/${access.student_id}/${selected.id}/${crypto.randomUUID()}.${extension}`;
        const upload = await supabase.storage.from(PHOTO_BUCKET).upload(photoPath, piecePhoto, {
          upsert: false,
          contentType: piecePhoto.type,
        });
        if (upload.error) throw upload.error;
      }
      const result = await sb.rpc("student_portal_update_piece", {
        _piece_id: selected.id,
        _student_id: access.is_preview ? access.student_id : null,
        _comments: pieceComments,
        _photo_path: photoPath,
      });
      if (result.error) {
        if (photoPath) await supabase.storage.from(PHOTO_BUCKET).remove([photoPath]);
        throw result.error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["student-pieces"] });
      await qc.invalidateQueries({ queryKey: ["student-home"] });
      setSelected(null);
      setPiecePhoto(null);
      toast.success("Peça atualizada");
    },
    onError: (cause: Error) => toast.error(cause.message || "Não foi possível atualizar a peça."),
  });
  return (
    <PortalPage title="Minhas peças">
      {isLoading && <p className="mb-4 text-sm text-muted-foreground">Carregando peças…</p>}
      {error && (
        <p className="mb-4 text-sm text-destructive">Não foi possível carregar as peças.</p>
      )}
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
          <Card
            key={p.id}
            className="cursor-pointer overflow-hidden transition hover:border-primary/50 hover:shadow-md"
            role="button"
            tabIndex={0}
            onClick={() => openPiece(p)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") openPiece(p);
            }}
          >
            <PiecePhoto
              src={p.photo_url}
              alt={p.piece_name || "Peça"}
              className="aspect-[4/3] w-full"
            />
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
              {Number(p.modeled_weight_g || p.grams || p.clay_weight_kg * 1000) > 0 && (
                <div className="text-sm">
                  Peso após modelagem:{" "}
                  {Number(p.modeled_weight_g || p.grams || p.clay_weight_kg * 1000)} g
                </div>
              )}
              {Number(p.bisque_weight_g) > 0 && (
                <div className="text-sm">Peso após biscoito: {Number(p.bisque_weight_g)} g</div>
              )}
              {Number(p.glazed_weight_g) > 0 && (
                <div className="text-sm">Peso após esmaltação: {Number(p.glazed_weight_g)} g</div>
              )}
              {p.glaze_name && <div className="text-sm">Esmalte: {p.glaze_name}</div>}
              {p.material && <div className="text-sm">Material: {p.material}</div>}
              {p.comments && <p className="text-sm text-muted-foreground">{p.comments}</p>}
              <div className="pt-1 text-xs font-medium text-primary">Ver ficha completa</div>
            </CardContent>
          </Card>
        ))}
        {!filtered.length && (
          <p className="text-sm text-muted-foreground">Nenhuma peça encontrada.</p>
        )}
      </div>
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.piece_name || "Peça sem nome"}</DialogTitle>
              </DialogHeader>
              <PiecePhoto
                src={selected.photo_url}
                alt={selected.piece_name || "Peça"}
                className="aspect-video w-full rounded-lg"
              />
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <Detail label="Data" value={date(selected.usage_date)} />
                <Detail
                  label="Status"
                  value={pieceStatus[selected.production_status] || selected.production_status}
                />
                <Detail label="Argila" value={selected.clay_type} />
                <Detail label="Esmalte" value={selected.glaze_name} />
                <Detail label="Cone" value={selected.glaze_cone} />
                <Detail label="Turma" value={selected.class_name} />
                <Detail
                  label="Dimensões"
                  value={`${Number(selected.length_cm || 0)} × ${Number(selected.depth_cm || 0)} × ${Number(selected.height_cm || 0)} cm`}
                />
                <Detail
                  label="Peso após modelagem"
                  value={weight(
                    selected.modeled_weight_g || selected.grams || selected.clay_weight_kg * 1000,
                  )}
                />
                <Detail label="Peso após biscoito" value={weight(selected.bisque_weight_g)} />
                <Detail label="Peso após esmaltação" value={weight(selected.glazed_weight_g)} />
                <Detail label="Material" value={selected.material} />
                <Detail label="Observações" value={selected.comments} />
              </div>
              <div className="space-y-3 rounded-lg border p-4">
                <div>
                  <div className="text-sm font-medium">Sua foto e seus comentários</div>
                  <div className="text-xs text-muted-foreground">
                    Adicione uma foto atual da peça e observações sobre o processo.
                  </div>
                </div>
                <label className="inline-flex w-fit cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <Camera className="mr-2 h-4 w-4" />
                  {piecePhoto ? piecePhoto.name : "Tirar ou enviar foto"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    capture="environment"
                    className="sr-only"
                    onChange={(event) => setPiecePhoto(event.target.files?.[0] || null)}
                  />
                </label>
                <Textarea
                  value={pieceComments}
                  onChange={(event) => setPieceComments(event.target.value)}
                  placeholder="Conte como foi a modelagem, esmaltação ou o que deseja lembrar…"
                  rows={4}
                />
                <Button
                  onClick={() => savePiece.mutate()}
                  disabled={savePiece.isPending}
                  className="w-fit"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {savePiece.isPending ? "Salvando…" : "Salvar alterações"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PortalPage>
  );
}

function weight(value: unknown) {
  const number = Number(value || 0);
  return number > 0 ? `${number} g` : "—";
}

function Detail({ label, value }: { label: string; value?: unknown }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1">{String(value || "—")}</div>
    </div>
  );
}
